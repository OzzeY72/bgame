"""Минимальный HTTP-клиент ComfyUI: загрузка картинок, постановка графа в очередь, ожидание, скачивание.

Используется gen.py; можно и отдельно:
    python pipeline/comfy_client.py --url http://127.0.0.1:8188 --ping
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import requests

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass



class ComfyError(RuntimeError):
    pass


class ComfyClient:
    def __init__(self, url: str, timeout_sec: int = 1800, poll_sec: float = 1.5):
        self.url = url.rstrip("/")
        self.timeout_sec = timeout_sec
        self.poll_sec = poll_sec
        self.client_id = uuid.uuid4().hex

    # ---------------------------------------------------------------- инфо
    def ping(self) -> dict:
        r = requests.get(f"{self.url}/system_stats", timeout=10)
        r.raise_for_status()
        return r.json()

    def object_info(self) -> dict:
        r = requests.get(f"{self.url}/object_info", timeout=60)
        r.raise_for_status()
        return r.json()

    def models(self, folder: str) -> list[str]:
        r = requests.get(f"{self.url}/models/{folder}", timeout=30)
        if r.status_code != 200:
            return []
        return r.json()

    # ---------------------------------------------------------------- ввод
    def upload_image(self, path: str | Path, subfolder: str = "bgame") -> str:
        """Загружает файл в ComfyUI/input/<subfolder>/ и возвращает имя для LoadImage."""
        path = Path(path)
        with open(path, "rb") as f:
            r = requests.post(
                f"{self.url}/upload/image",
                files={"image": (path.name, f, "application/octet-stream")},
                data={"overwrite": "true", "type": "input", "subfolder": subfolder},
                timeout=120,
            )
        r.raise_for_status()
        info = r.json()
        name = info.get("name", path.name)
        sub = info.get("subfolder", subfolder)
        return f"{sub}/{name}" if sub else name

    # ---------------------------------------------------------------- запуск
    def queue(self, prompt: dict) -> str:
        r = requests.post(
            f"{self.url}/prompt", json={"prompt": prompt, "client_id": self.client_id}, timeout=60
        )
        if r.status_code != 200:
            try:
                err = r.json()
            except Exception:
                err = r.text
            raise ComfyError(f"ComfyUI отклонил граф: {json.dumps(err, ensure_ascii=False, indent=1)[:4000]}")
        data = r.json()
        if data.get("node_errors"):
            raise ComfyError(f"Ошибки нод: {json.dumps(data['node_errors'], ensure_ascii=False, indent=1)[:4000]}")
        return data["prompt_id"]

    def wait(self, prompt_id: str, verbose: bool = True) -> dict:
        """Ждёт завершения и возвращает history[prompt_id]."""
        t0 = time.time()
        last_print = 0.0
        while True:
            r = requests.get(f"{self.url}/history/{prompt_id}", timeout=30)
            r.raise_for_status()
            hist = r.json()
            if prompt_id in hist:
                item = hist[prompt_id]
                status = item.get("status", {})
                if status.get("status_str") == "error":
                    msgs = status.get("messages", [])
                    raise ComfyError(f"Ошибка выполнения: {json.dumps(msgs, ensure_ascii=False)[:4000]}")
                if item.get("outputs"):
                    return item
            if time.time() - t0 > self.timeout_sec:
                raise ComfyError("Таймаут ожидания ComfyUI")
            if verbose and time.time() - last_print > 10:
                last_print = time.time()
                q = requests.get(f"{self.url}/queue", timeout=10).json()
                running = len(q.get("queue_running", []))
                pending = len(q.get("queue_pending", []))
                print(
                    f"  ... ждём ComfyUI ({int(time.time() - t0)}s, running={running}, pending={pending})",
                    file=sys.stderr,
                )
            time.sleep(self.poll_sec)

    def download(self, filename: str, subfolder: str = "", type_: str = "output") -> bytes:
        r = requests.get(
            f"{self.url}/view",
            params={"filename": filename, "subfolder": subfolder, "type": type_},
            timeout=120,
        )
        r.raise_for_status()
        return r.content

    def run(self, prompt: dict, out_dir: str | Path, stem: str) -> list[Path]:
        """Очередь → ожидание → скачать все картинки из SaveImage-нод. Возвращает пути."""
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        pid = self.queue(prompt)
        print(f"  ComfyUI prompt_id={pid}", file=sys.stderr)
        item = self.wait(pid)
        paths: list[Path] = []
        i = 0
        for _node_id, out in item["outputs"].items():
            for img in out.get("images", []):
                if img.get("type") != "output":
                    continue
                data = self.download(img["filename"], img.get("subfolder", ""), img["type"])
                suffix = "" if i == 0 else f"_{i}"
                p = out_dir / f"{stem}{suffix}.png"
                p.write_bytes(data)
                paths.append(p)
                i += 1
        if not paths:
            raise ComfyError("ComfyUI ничего не сохранил (нет SaveImage-выходов)")
        return paths


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.environ.get("COMFY_URL", "http://127.0.0.1:8188"))
    ap.add_argument("--ping", action="store_true")
    a = ap.parse_args()
    c = ComfyClient(a.url)
    info = c.ping()
    print("ComfyUI", info["system"].get("comfyui_version"), "|", [d["name"] for d in info.get("devices", [])])
    for folder in ("diffusion_models", "text_encoders", "vae", "loras"):
        print(f"  {folder}: {c.models(folder)}")
