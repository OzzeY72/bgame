"""Nano Banana напрямую через Gemini API (без ComfyUI) + текстовые ответы (подписи к подаркам).

Ключ: переменная окружения GEMINI_API_KEY (или строка GEMINI_API_KEY=... в pipeline/.env).
Модели: gemini-3-pro-image-preview (Nano Banana Pro), gemini-3.1-flash-image (Nano Banana 2),
gemini-2.5-flash-image (старый Nano Banana).

    python pipeline/gemini_client.py --prompt "pixel art cat" --out out/test.png --ref refs/cat.jpg
"""
from __future__ import annotations

import base64
import mimetypes
import os
import sys
from pathlib import Path

import requests

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiError(RuntimeError):
    pass


def load_dotenv(path: Path) -> None:
    """Мини-.env: KEY=VALUE построчно, без зависимостей."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def api_key() -> str:
    load_dotenv(Path(__file__).resolve().parent / ".env")
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise GeminiError("Нет GEMINI_API_KEY (переменная окружения или pipeline/.env)")
    return key


def _image_part(path: str | Path) -> dict:
    p = Path(path)
    mime = mimetypes.guess_type(p.name)[0] or "image/png"
    return {"inline_data": {"mime_type": mime, "data": base64.b64encode(p.read_bytes()).decode("ascii")}}


def generate(
    prompt: str,
    refs: list[str | Path] | None = None,
    model: str = "gemini-3-pro-image-preview",
    aspect_ratio: str = "1:1",
    image_size: str = "1K",
    seed: int | None = None,
    timeout: int = 300,
) -> list[bytes]:
    """Возвращает список PNG/JPEG байтов (обычно одна картинка)."""
    parts: list[dict] = [_image_part(r) for r in (refs or [])]
    parts.append({"text": prompt})
    gen_cfg: dict = {
        "responseModalities": ["IMAGE"],
        "imageConfig": {"aspectRatio": aspect_ratio},
    }
    if "pro" in model:
        gen_cfg["imageConfig"]["imageSize"] = image_size
    if seed is not None:
        gen_cfg["seed"] = int(seed)
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gen_cfg}
    r = requests.post(
        API.format(model=model),
        headers={"x-goog-api-key": api_key(), "Content-Type": "application/json"},
        json=body,
        timeout=timeout,
    )
    if r.status_code != 200:
        raise GeminiError(f"Gemini API {r.status_code}: {r.text[:2000]}")
    data = r.json()
    images: list[bytes] = []
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            blob = part.get("inlineData") or part.get("inline_data")
            if blob and blob.get("data"):
                images.append(base64.b64decode(blob["data"]))
    if not images:
        reason = data.get("candidates", [{}])[0].get("finishReason") if data.get("candidates") else data
        raise GeminiError(f"Gemini не вернул картинку: {str(reason)[:1000]}")
    return images


def generate_text(
    prompt: str,
    refs: list[str | Path] | None = None,
    model: str = "gemini-2.5-flash",
    json_output: bool = False,
    timeout: int = 120,
) -> str:
    """Текстовый ответ модели (с картинками-референсами). json_output — просить строго JSON."""
    parts: list[dict] = [_image_part(r) for r in (refs or [])]
    parts.append({"text": prompt})
    gen_cfg: dict = {"temperature": 0.9}
    if json_output:
        gen_cfg["responseMimeType"] = "application/json"
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gen_cfg}
    r = requests.post(
        API.format(model=model),
        headers={"x-goog-api-key": api_key(), "Content-Type": "application/json"},
        json=body,
        timeout=timeout,
    )
    if r.status_code != 200:
        raise GeminiError(f"Gemini API {r.status_code}: {r.text[:2000]}")
    data = r.json()
    texts: list[str] = []
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            if part.get("text"):
                texts.append(part["text"])
    if not texts:
        raise GeminiError(f"Gemini не вернул текст: {str(data)[:1000]}")
    return "\n".join(texts)


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--ref", action="append", default=[])
    ap.add_argument("--model", default="gemini-3-pro-image-preview")
    ap.add_argument("--aspect", default="1:1")
    ap.add_argument("--size", default="1K")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    imgs = generate(a.prompt, a.ref, a.model, a.aspect, a.size)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(imgs[0])
    print("saved", out, file=sys.stderr)
