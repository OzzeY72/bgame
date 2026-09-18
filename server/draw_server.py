#!/usr/bin/env python
"""Бэкенд мини-игры «нарисуй любимый предмет»: рисунок игрока -> Nano Banana (Gemini) -> пиксель-арт 32x32
-> название и подпись текстовой моделью -> вебхук. Игра (src/minigames/DrawApi.ts) шлёт PNG и опрашивает задачу.

    python server/draw_server.py                # http://127.0.0.1:8766 (Vite проксирует /api сюда)
    python server/draw_server.py --port 9000 --host 0.0.0.0

API (все ответы JSON, CORS открыт):
    GET  /api/health              -> { ok, gemini, webhook }
    POST /api/draw                <- { image: "data:image/png;base64,...", hint: "кружка" }  -> { job }
    GET  /api/draw/<job>          -> { status: queued|running|done|error, step, result?, error? }
    GET  /api/drawn               -> список готовых подарков (meta.json)
    GET  /api/drawn/<id>.png      -> спрайт 32x32 (это sprite_url из результата)

Настройки: pipeline/config.yaml -> draw (модели, цвета, порт, папка данных), pixel (размер, хромакей);
ключи: pipeline/.env -> GEMINI_API_KEY, WEBHOOK_URL, WEBHOOK_FORMAT (json|discord).
Без GEMINI_API_KEY спрайт делается из самого рисунка (белый фон -> прозрачность), подпись — заглушка.
Только stdlib + зависимости пайплайна (Pillow, numpy, requests, PyYAML); вся обработка картинок — из pipeline/postprocess.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import sys
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml
from PIL import Image

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PIPE = ROOT / "pipeline"
sys.path.insert(0, str(PIPE))

from gemini_client import GeminiError, generate as gemini_image, generate_text, load_dotenv  # noqa: E402
from postprocess import chroma, grid, pixelate  # noqa: E402

MAX_BODY = 8 * 1024 * 1024
ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")


# ---------------------------------------------------------------- конфиг
def load_cfg() -> dict:
    load_dotenv(PIPE / ".env")
    cfg = yaml.safe_load((PIPE / "config.yaml").read_text(encoding="utf-8"))
    cfg.setdefault("draw", {})
    d = cfg["draw"]
    d.setdefault("model", "gemini-3.1-flash-image")
    d.setdefault("caption_model", "gemini-3.6-flash")
    d.setdefault("colors", 24)
    d.setdefault("port", 8766)
    d.setdefault("data", "server/data")
    return cfg


CFG = load_cfg()
DATA = ROOT / CFG["draw"]["data"] / "drawn"
DATA.mkdir(parents=True, exist_ok=True)


def has_gemini() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


def webhook_url() -> str:
    return os.environ.get("WEBHOOK_URL", "").strip()


# ---------------------------------------------------------------- обработка
def decode_data_url(s: str) -> Image.Image:
    if "," in s and s.startswith("data:"):
        s = s.split(",", 1)[1]
    raw = base64.b64decode(s)
    if len(raw) > MAX_BODY:
        raise ValueError("картинка слишком большая")
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def flatten_white(img: Image.Image) -> Image.Image:
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    bg.alpha_composite(img)
    return bg.convert("RGB")


def make_sprite_from_drawing(drawing: Image.Image, size: int, colors: int) -> Image.Image:
    """Запасной вариант без нейросети: белый фон рисунка -> прозрачность, обрезка по содержимому, даунскейл."""
    keyed = chroma.key_to_alpha(drawing.convert("RGBA"), (255, 255, 255), tolerance=60, despill=False)
    return grid.normalize_single(keyed, size, "box", colors, None, CFG["pixel"]["alpha_threshold"], fit="contain", clean=False)


def make_sprite_from_raw(raw: Image.Image, size: int, colors: int) -> Image.Image:
    px = CFG["pixel"]
    keyed = chroma.key_to_alpha(raw, px["key_color"], float(px["key_tolerance"]))
    pal = pixelate.load_palette(ROOT / px["palette"]) if px.get("palette") else None
    return grid.normalize_single(keyed, size, "box", colors, pal, px["alpha_threshold"], fit="contain", clean=True)


def build_image_prompt(hint: str) -> str:
    tpl = (PIPE / "prompts" / "drawn_prop.txt").read_text(encoding="utf-8")
    style = (PIPE / "prompts" / "style.txt").read_text(encoding="utf-8").strip()
    key = str(CFG["pixel"]["key_color"])
    rgb = chroma.parse_key(key) or (255, 0, 255)
    hint_clause = f' (the player says it is: "{hint}")' if hint else ""
    return tpl.format(style=style, key=key, key_hex="#%02X%02X%02X" % rgb, hint_clause=hint_clause).strip()


def build_caption_prompt(hint: str) -> str:
    tpl = (PIPE / "prompts" / "drawn_caption.txt").read_text(encoding="utf-8")
    hint_clause = f", она подписала его: «{hint}»" if hint else ""
    return tpl.format(hint_clause=hint_clause).strip()


def parse_caption(text: str, hint: str) -> tuple[str, str]:
    try:
        m = re.search(r"\{.*\}", text, re.S)
        d = json.loads(m.group(0) if m else text)
        name = str(d.get("name") or "").strip().rstrip(".")
        cap = str(d.get("caption") or "").strip()
        if name and cap:
            return name[:40], cap[:200]
    except Exception:  # noqa: BLE001
        pass
    return (hint.capitalize() if hint else "Подарок"), "Нарисовано своими руками. Самый настоящий подарок."


def send_webhook(meta: dict, sprite_big: Path, drawing: Path, log) -> None:
    url = webhook_url()
    if not url:
        return
    fmt = os.environ.get("WEBHOOK_FORMAT", "json").strip().lower()
    try:
        if fmt == "discord":
            content = f"🎁 **{meta['name']}** — {meta['caption']}" + (f"\n_подсказка игрока: {meta['hint']}_" if meta.get("hint") else "")
            with sprite_big.open("rb") as f1, drawing.open("rb") as f2:
                r = requests.post(
                    url,
                    data={"payload_json": json.dumps({"content": content}, ensure_ascii=False)},
                    files=[("files[0]", ("gift_" + meta["id"] + ".png", f1, "image/png")), ("files[1]", ("drawing_" + meta["id"] + ".png", f2, "image/png"))],
                    timeout=30,
                )
        else:
            body = dict(meta)
            body["sprite_png_base64"] = base64.b64encode(sprite_big.read_bytes()).decode("ascii")
            body["drawing_png_base64"] = base64.b64encode(drawing.read_bytes()).decode("ascii")
            r = requests.post(url, json=body, timeout=30)
        log(f"вебхук: {r.status_code}")
        meta["webhook_status"] = r.status_code
    except Exception as e:  # noqa: BLE001
        log(f"вебхук не удался: {e}")
        meta["webhook_status"] = str(e)


# ---------------------------------------------------------------- задачи
class Job:
    def __init__(self, image: str, hint: str):
        self.id = uuid.uuid4().hex[:12]
        self.image = image
        self.hint = hint[:40]
        self.status = "queued"
        self.step = "В очереди"
        self.error = ""
        self.result: dict | None = None
        self.created = time.time()

    def summary(self) -> dict:
        d = {"job": self.id, "status": self.status, "step": self.step}
        if self.error:
            d["error"] = self.error
        if self.result:
            d["result"] = self.result
        return d


JOBS: dict[str, Job] = {}
QUEUE: list[Job] = []
WAKE = threading.Event()
LOCK = threading.Lock()


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def process(job: Job) -> None:
    size = int(CFG["pixel"]["prop"])
    colors = int(CFG["draw"]["colors"])
    gid = job.id
    d = DATA / gid
    d.mkdir(parents=True, exist_ok=True)
    jl = lambda m: log(f"[{gid}] {m}")  # noqa: E731

    job.step = "Смотрим на рисунок"
    drawing = flatten_white(decode_data_url(job.image))
    drawing_path = d / "drawing.png"
    drawing.save(drawing_path)
    job.image = ""  # не держать base64 в памяти

    sprite: Image.Image | None = None
    used_ai = False
    if has_gemini():
        try:
            job.step = "Нейросеть рисует"
            jl(f"gemini image model={CFG['draw']['model']} hint={job.hint!r}")
            imgs = gemini_image(build_image_prompt(job.hint), [drawing_path], CFG["draw"]["model"], "1:1", "1K")
            raw = Image.open(io.BytesIO(imgs[0])).convert("RGBA")
            raw.save(d / "raw.png")
            job.step = "Превращаем в пиксели"
            sprite = make_sprite_from_raw(raw, size, colors)
            used_ai = True
        except GeminiError as e:
            jl(f"gemini image не удался: {e}")
    if sprite is None:
        job.step = "Превращаем рисунок в пиксели"
        sprite = make_sprite_from_drawing(drawing, size, colors)
    sprite_path = d / "sprite.png"
    sprite.save(sprite_path)
    big_path = d / "sprite_x8.png"
    pixelate.upscale_preview(sprite, 8).save(big_path)

    name, caption = parse_caption("", job.hint)
    if has_gemini():
        try:
            job.step = "Придумываем подпись"
            text = generate_text(build_caption_prompt(job.hint), [drawing_path, big_path], CFG["draw"]["caption_model"], json_output=True)
            name, caption = parse_caption(text, job.hint)
        except GeminiError as e:
            jl(f"подпись не удалась: {e}")

    meta = {
        "id": gid,
        "name": name,
        "caption": caption,
        "hint": job.hint,
        "ai": used_ai,
        "created": int(time.time()),
        "sprite_url": f"/api/drawn/{gid}.png",
    }
    job.step = "Отправляем открытку"
    send_webhook(meta, big_path, drawing_path, jl)
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    job.result = {k: meta[k] for k in ("id", "name", "caption", "sprite_url")}
    jl(f"готово: {name!r} — {caption!r}")


def worker() -> None:
    while True:
        WAKE.wait(1.0)
        WAKE.clear()
        while True:
            with LOCK:
                job = QUEUE.pop(0) if QUEUE else None
            if not job:
                break
            job.status = "running"
            try:
                process(job)
                job.status = "done"
            except Exception as e:  # noqa: BLE001
                job.status = "error"
                job.error = str(e)[:500]
                log(f"[{job.id}] ошибка: {e}")
            job.step = "Готово" if job.status == "done" else "Ошибка"


threading.Thread(target=worker, daemon=True).start()


def list_drawn() -> list[dict]:
    out = []
    for p in sorted(DATA.glob("*/meta.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001
            pass
    return out


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # noqa: D102
        if "/api/draw/" in (fmt % args):
            return  # опрос статуса не логируем
        super().log_message(fmt, *args)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, obj, status: int = 200) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _png(self, p: Path) -> None:
        data = p.read_bytes()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/api/health":
                self._json({"ok": True, "gemini": has_gemini(), "webhook": bool(webhook_url()), "model": CFG["draw"]["model"]})
            elif path.startswith("/api/draw/"):
                job = JOBS.get(path.rsplit("/", 1)[1])
                if not job:
                    self._json({"error": "нет такой задачи"}, 404)
                else:
                    self._json(job.summary())
            elif path == "/api/drawn":
                self._json(list_drawn())
            elif path.startswith("/api/drawn/") and path.endswith(".png"):
                gid = path.rsplit("/", 1)[1][:-4]
                p = DATA / gid / "sprite.png"
                if not ID_RE.match(gid) or not p.exists():
                    self._json({"error": "нет такого спрайта"}, 404)
                else:
                    self._png(p)
            else:
                self._json({"error": "not found"}, 404)
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 500)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY:
                self._json({"error": "слишком большой запрос"}, 413)
                return
            body = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
            if path == "/api/draw":
                image = body.get("image")
                if not image or not isinstance(image, str):
                    raise ValueError("нет поля image (data:image/png;base64,...)")
                job = Job(image, str(body.get("hint") or "").strip())
                JOBS[job.id] = job
                with LOCK:
                    QUEUE.append(job)
                WAKE.set()
                log(f"[{job.id}] принят рисунок, hint={job.hint!r}, в очереди {len(QUEUE)}")
                self._json({"job": job.id, "status": job.status}, 202)
            else:
                self._json({"error": "not found"}, 404)
        except (ValueError, KeyError) as e:
            self._json({"error": str(e)}, 400)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT") or CFG["draw"]["port"]))
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"bgame draw server: http://{args.host}:{args.port}/api/health   "
          f"gemini={'да' if has_gemini() else 'нет (спрайт из рисунка)'}  вебхук={'да' if webhook_url() else 'нет'}   (Ctrl+C — выход)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
