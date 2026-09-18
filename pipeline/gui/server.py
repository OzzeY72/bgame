#!/usr/bin/env python
"""Локальная GUI-обёртка над пайплайном: браузерная страница + JSON-API, которое запускает gen.py /
batch_gen.py подпроцессами (CLI остаётся единственным источником правды) и показывает результаты.

    python pipeline/gui/server.py            # http://127.0.0.1:8765, откроет браузер
    python pipeline/gui/server.py --port 9000 --no-browser

Только stdlib + Pillow (миниатюры). Задачи выполняются по одной в фоновом потоке (ComfyUI всё равно
делает одну генерацию за раз), лог каждой задачи доступен через /api/job.
"""
from __future__ import annotations

import argparse
import io
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent
ROOT = PIPE.parent
sys.path.insert(0, str(PIPE))

import gen as genmod  # noqa: E402  (KINDS, DIR_DESC, load_cfg)

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
BACKENDS = ["klein", "flux", "gemini", "comfy-gemini"]
POST_KINDS = ["sheet", "walk", "idle", "portrait", "prop", "tile", "object", "building", "ui"]
# файлы, которые можно читать/править через /api/text (относительно корня репозитория)
EDITABLE_PREFIXES = ("pipeline/config.yaml", "pipeline/prompts/", "pipeline/batch/", "src/data/tiles.json")


# ---------------------------------------------------------------- пути
def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def safe_path(s: str) -> Path:
    """Путь внутри репозитория; иначе ValueError. Принимает и абсолютные пути внутри ROOT."""
    p = Path(s)
    p = (p if p.is_absolute() else ROOT / p).resolve()
    if ROOT not in p.parents and p != ROOT:
        raise ValueError(f"путь вне репозитория: {s}")
    return p


def list_images(d: Path, recursive: bool = False) -> list[dict]:
    if not d.is_dir():
        return []
    it = d.rglob("*") if recursive else d.iterdir()
    out = []
    for p in sorted(it, key=lambda x: (-x.stat().st_mtime if x.is_file() else 0, x.name)):
        if p.is_file() and p.suffix.lower() in IMAGE_EXT:
            st = p.stat()
            item = {"path": rel(p), "name": p.name, "mtime": int(st.st_mtime), "size": st.st_size}
            txt = p.with_suffix(".txt")
            if txt.exists():
                item["txt"] = rel(txt)
            out.append(item)
    return out


# ---------------------------------------------------------------- задачи
class Job:
    def __init__(self, jid: int, title: str, argv: list[str], cwd: Path):
        self.id = jid
        self.title = title
        self.argv = argv
        self.cwd = cwd
        self.status = "queued"  # queued | running | done | error | cancelled
        self.log: list[str] = []
        self.returncode: int | None = None
        self.created = time.time()
        self.started: float | None = None
        self.finished: float | None = None
        self.proc: subprocess.Popen | None = None

    def summary(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "status": self.status,
            "returncode": self.returncode,
            "created": self.created,
            "started": self.started,
            "finished": self.finished,
            "cmd": " ".join(self.argv[1:]),
            "lines": len(self.log),
        }


class JobQueue:
    def __init__(self) -> None:
        self.jobs: list[Job] = []
        self._next = 1
        self._lock = threading.Lock()
        self._wake = threading.Event()
        threading.Thread(target=self._worker, daemon=True).start()

    def add(self, title: str, argv: list[str], cwd: Path = ROOT) -> Job:
        with self._lock:
            job = Job(self._next, title, argv, cwd)
            self._next += 1
            self.jobs.append(job)
        self._wake.set()
        return job

    def get(self, jid: int) -> Job | None:
        return next((j for j in self.jobs if j.id == jid), None)

    def cancel(self, jid: int) -> bool:
        job = self.get(jid)
        if not job:
            return False
        if job.status == "queued":
            job.status = "cancelled"
            job.finished = time.time()
            return True
        if job.status == "running" and job.proc:
            job.proc.terminate()
            job.status = "cancelled"
            return True
        return False

    def _worker(self) -> None:
        while True:
            self._wake.wait(1.0)
            self._wake.clear()
            while True:
                job = next((j for j in self.jobs if j.status == "queued"), None)
                if not job:
                    break
                self._run(job)

    def _run(self, job: Job) -> None:
        job.status = "running"
        job.started = time.time()
        job.log.append("$ " + " ".join(job.argv))
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
        try:
            job.proc = subprocess.Popen(
                job.argv, cwd=str(job.cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                text=True, encoding="utf-8", errors="replace",
            )
            assert job.proc.stdout is not None
            for line in job.proc.stdout:
                job.log.append(line.rstrip("\n"))
            job.returncode = job.proc.wait()
            if job.status != "cancelled":
                job.status = "done" if job.returncode == 0 else "error"
        except Exception as e:  # noqa: BLE001
            job.log.append(f"!! {e}")
            job.status = "error"
        job.finished = time.time()


QUEUE = JobQueue()
THUMBS: dict[tuple[str, int, int], bytes] = {}


# ---------------------------------------------------------------- сборка argv
def _flag(argv: list[str], name: str, val) -> None:
    if val is None or val == "" or val is False:
        return
    if val is True:
        argv.append(f"--{name}")
    elif isinstance(val, list):
        for v in val:
            if v not in (None, ""):
                argv += [f"--{name}", str(v)]
    else:
        argv += [f"--{name}", str(val)]


def build_argv(cmd: str, a: dict) -> tuple[str, list[str]]:
    """JSON от страницы -> argv gen.py/batch_gen.py. Только известные флаги, без shell."""
    py = sys.executable
    if cmd == "ping":
        return "ping", [py, str(PIPE / "gen.py"), "ping"]
    if cmd == "gen":
        argv = [py, str(PIPE / "gen.py"), "gen", a["kind"], "--name", a["name"]]
        for k in ("backend", "dir", "subject", "emotion", "extra", "negative", "seed", "n", "size", "model"):
            _flag(argv, k, a.get(k))
        _flag(argv, "ref", a.get("refs") or [])
        for k in ("show-prompt", "dump-graph", "dry-run"):
            _flag(argv, k, bool(a.get(k)))
        title = f"gen {a['kind']} {a['name']}" + (f" {a['dir']}" if a.get("dir") else "") + (" (dry)" if a.get("dry-run") else "")
        return title, argv
    if cmd == "post":
        argv = [py, str(PIPE / "gen.py"), "post", a["kind"], "--name", a["name"], "--in", a["in"]]
        for k in ("dir", "rows", "cols", "inset", "scale", "method", "colors", "key", "tolerance", "emotion", "fit",
                  "tile", "tiles", "names", "width", "stretch-x", "thresh", "split"):
            _flag(argv, k, a.get(k))
        _flag(argv, "erase", a.get("erase") or [])
        _flag(argv, "rect", a.get("rect") or [])
        for k in ("seamless", "no-clean"):
            _flag(argv, k, bool(a.get(k)))
        return f"post {a['kind']} {a['name']}" + (f" {a['dir']}" if a.get("dir") else ""), argv
    if cmd == "pack":
        argv = [py, str(PIPE / "gen.py"), "pack", a["what"]]
        _flag(argv, "name", a.get("name"))
        return f"pack {a['what']} {a.get('name') or ''}".strip(), argv
    if cmd == "approve":
        argv = [py, str(PIPE / "gen.py"), "approve", "--name", a["name"], "--in", a["in"]]
        _flag(argv, "raw", bool(a.get("raw")))
        _flag(argv, "key", a.get("key"))
        _flag(argv, "tolerance", a.get("tolerance"))
        return f"approve {a['name']}", argv
    if cmd == "batch":
        argv = [py, str(PIPE / "batch_gen.py")]
        for k in ("backend", "only", "file"):
            _flag(argv, k, a.get(k))
        for k in ("dry-run", "keep-going"):
            _flag(argv, k, bool(a.get(k)))
        return "batch " + (a.get("only") or "все"), argv
    if cmd == "validate":
        argv = [py, str(PIPE / "validate.py")]
        _flag(argv, "flux", bool(a.get("flux")))
        return "validate" + (" flux" if a.get("flux") else ""), argv
    if cmd == "build_workflows":
        return "build_workflows", [py, str(PIPE / "workflows" / "build_workflows.py")]
    raise ValueError(f"неизвестная команда {cmd}")


# ---------------------------------------------------------------- состояние для страницы
def state() -> dict:
    cfg = genmod.load_cfg()
    out = ROOT / cfg["paths"]["out"]
    assets = ROOT / cfg["paths"]["assets"]
    entities = sorted(p.name for p in out.iterdir() if p.is_dir() and p.name != "tiles") if out.is_dir() else []
    tiles_names: list[str] = []
    try:
        tiles_names = [t["name"] for t in json.loads((ROOT / cfg["paths"]["tiles_json"]).read_text(encoding="utf-8"))]
    except Exception:  # noqa: BLE001
        pass
    tiles_have = {p.stem for p in (out / "tiles").glob("*.png") if not p.stem.startswith("preview_")} if (out / "tiles").is_dir() else set()
    refs: list[dict] = []
    for d in (ROOT / cfg["paths"]["refs"], ROOT / "presents"):
        refs += list_images(d, recursive=True)
    batch_root = PIPE / "batch"
    batch = sorted(p.name for p in batch_root.iterdir() if p.is_dir() and (p / "gen.txt").exists()) if batch_root.is_dir() else []
    return {
        "root": str(ROOT),
        "python": sys.executable,
        "kinds": {k: {"template": v[0], "needs_ref": v[1]} for k, v in genmod.KINDS.items()},
        "post_kinds": POST_KINDS,
        "backends": BACKENDS,
        "dirs": list(genmod.DIR_DESC),
        "characters": cfg["pixel"]["characters"],
        "pixel": {k: v for k, v in cfg["pixel"].items() if k != "characters"},
        "comfy_url": cfg["comfy"]["url"],
        "flux_url": cfg.get("flux", {}).get("url") or "",
        "gemini_key": bool(os.environ.get("GEMINI_API_KEY")),
        "default_backend": "gemini" if os.environ.get("GEMINI_API_KEY") else "klein",
        "entities": entities,
        "tiles": {"names": tiles_names, "have": sorted(tiles_have), "missing": [n for n in tiles_names if n not in tiles_have]},
        "refs": refs,
        "prompts": sorted(p.name for p in (PIPE / "prompts").glob("*.txt")),
        "batch": batch,
        "assets": list_images(assets, recursive=True),
        "paths": cfg["paths"],
    }


def entity(name: str) -> dict:
    cfg = genmod.load_cfg()
    od = ROOT / cfg["paths"]["out"] / name
    if not od.is_dir():
        return {"name": name, "exists": False, "raw": [], "views": [], "frames": [], "previews": [], "card": None}
    previews = [i for i in list_images(od) if i["name"].startswith("preview_")]
    card = od / "card.png"
    return {
        "name": name,
        "exists": True,
        "raw": list_images(od / "raw"),
        "views": list_images(od / "views"),
        "frames": sorted(list_images(od / "frames"), key=lambda i: i["name"]),
        "previews": previews,
        "card": rel(card) if card.exists() else None,
        "asset": rel(ROOT / cfg["paths"]["assets"] / "characters" / f"{name}_preview.png")
        if (ROOT / cfg["paths"]["assets"] / "characters" / f"{name}_preview.png").exists() else None,
    }


def tiles_info() -> dict:
    cfg = genmod.load_cfg()
    tdir = ROOT / cfg["paths"]["out"] / "tiles"
    items = list_images(tdir)
    tileset = ROOT / cfg["paths"]["assets"] / "tiles" / "tileset.png"
    return {
        "tiles": [i for i in items if not i["name"].startswith("preview_")],
        "previews": [i for i in items if i["name"].startswith("preview_")],
        "tileset": rel(tileset) if tileset.exists() else None,
    }


def thumb(p: Path, size: int) -> bytes:
    key = (str(p), size, int(p.stat().st_mtime))
    if key in THUMBS:
        return THUMBS[key]
    from PIL import Image

    im = Image.open(p).convert("RGBA")
    if im.width <= size and im.height <= size:
        # маленькие (пиксель-арт) — увеличиваем целым множителем, NEAREST, чтобы было видно пиксели
        k = max(1, size // max(im.size))
        im = im.resize((im.width * k, im.height * k), Image.Resampling.NEAREST)
    else:
        im.thumbnail((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    data = buf.getvalue()
    if len(THUMBS) > 400:
        THUMBS.clear()
    THUMBS[key] = data
    return data


# ---------------------------------------------------------------- HTTP
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: D102
        if "/api/job" in fmt % args or "/api/thumb" in fmt % args:
            return
        super().log_message(fmt, *args)

    # -- helpers
    def _json(self, obj, status: int = 200) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _bytes(self, data: bytes, ctype: str, cache: bool = False) -> None:
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=3600" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}

    # -- GET
    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path in ("/", "/index.html"):
                self._bytes((HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
            elif u.path == "/api/state":
                self._json(state())
            elif u.path == "/api/entity":
                self._json(entity(q["name"]))
            elif u.path == "/api/tiles":
                self._json(tiles_info())
            elif u.path == "/api/jobs":
                self._json([j.summary() for j in QUEUE.jobs[-100:]])
            elif u.path == "/api/job":
                job = QUEUE.get(int(q["id"]))
                if not job:
                    self._json({"error": "нет такой задачи"}, 404)
                    return
                start = int(q.get("from") or 0)
                d = job.summary()
                d["log"] = job.log[start:]
                d["from"] = start
                self._json(d)
            elif u.path == "/api/file":
                p = safe_path(q["p"])
                ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
                self._bytes(p.read_bytes(), ctype)
            elif u.path == "/api/thumb":
                p = safe_path(q["p"])
                self._bytes(thumb(p, int(q.get("s") or 256)), "image/png")
            elif u.path == "/api/text":
                p = safe_path(q["p"])
                self._json({"path": rel(p), "text": p.read_text(encoding="utf-8")})
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except (KeyError, ValueError, FileNotFoundError) as e:
            self._json({"error": str(e)}, 400)

    # -- POST
    def do_POST(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        try:
            body = self._body()
            if u.path == "/api/run":
                title, argv = build_argv(body["cmd"], body.get("args") or {})
                job = QUEUE.add(title, argv)
                self._json(job.summary())
            elif u.path == "/api/cancel":
                self._json({"ok": QUEUE.cancel(int(body["id"]))})
            elif u.path == "/api/text":
                p = safe_path(body["p"])
                if not any(rel(p).startswith(pref) for pref in EDITABLE_PREFIXES):
                    raise ValueError("этот файл через GUI не редактируется")
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(body["text"], encoding="utf-8", newline="\n")
                self._json({"ok": True, "path": rel(p)})
            elif u.path == "/api/open":
                # открыть папку/файл в проводнике
                p = safe_path(body["p"])
                target = p if p.is_dir() else p.parent
                if sys.platform == "win32":
                    os.startfile(str(target))  # type: ignore[attr-defined]
                else:
                    subprocess.Popen(["xdg-open", str(target)])
                self._json({"ok": True})
            elif u.path == "/api/mkentity":
                cfg = genmod.load_cfg()
                name = body["name"].strip()
                if not name or any(c in name for c in "/\\ "):
                    raise ValueError("имя: латиница/цифры/подчёркивание, без пробелов")
                (ROOT / cfg["paths"]["out"] / name / "raw").mkdir(parents=True, exist_ok=True)
                self._json({"ok": True, "name": name})
            else:
                self.send_error(HTTPStatus.NOT_FOUND)
        except (KeyError, ValueError, FileNotFoundError) as e:
            self._json({"error": str(e)}, 400)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}/"
    print(f"bgame pipeline GUI: {url}   (Ctrl+C — выход)")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
