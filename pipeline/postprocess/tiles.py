"""Тайлы окружения и сборка тайлсета по src/data/tiles.json (единый порядок для игры и пайплайна)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

from .pixelate import downscale, quantize, upscale_preview


def make_tile(
    img: Image.Image,
    size: int = 32,
    method: str = "box",
    colors: int = 24,
    palette: Image.Image | None = None,
    seamless: bool = False,
    crop: str = "center",
    tiles: tuple[int, int] = (1, 1),
) -> Image.Image:
    """Тайл (или блок tiles=WxH тайлов, например подъезд 2x1) из картинки: кроп под пропорцию W:H ->
    уменьшение до (W*size, H*size) -> квантование. Бесшовность (seamless) считается для блока целиком.
    Для объектов на прозрачном фоне (дерево, куст) сначала прогоняй через chroma.key_to_alpha."""
    img = img.convert("RGBA")
    tw, th = max(1, tiles[0]), max(1, tiles[1])
    # максимальный прямоугольник пропорции tw:th, который влезает в картинку
    scale = min(img.width / tw, img.height / th)
    cw, ch = int(scale * tw), int(scale * th)
    if crop == "center":
        x = (img.width - cw) // 2
        y = (img.height - ch) // 2
    else:
        x = y = 0
    sq = img.crop((x, y, x + cw, y + ch))
    small = downscale(sq, size * tw, size * th, method)
    if seamless:
        small = make_seamless(small)
    return quantize(small, colors, palette, alpha_threshold=1)


def make_seamless(tile: Image.Image, blend: float = 0.25) -> Image.Image:
    """Простое "бесшовье": сдвиг на полтайла + линейное смешивание швов."""
    a = np.asarray(tile.convert("RGBA")).astype(np.float32)
    h, w, _ = a.shape
    rolled = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    yy = np.abs(np.linspace(-1, 1, h))[:, None]
    xx = np.abs(np.linspace(-1, 1, w))[None, :]
    # вес исходника высок в центре, у краёв берём сдвинутую копию
    wgt = np.clip(1.0 - np.maximum(yy, xx), 0, 1) ** 0.5
    wgt = np.clip(wgt / max(blend, 1e-6), 0, 1)[..., None]
    out = a * wgt + rolled * (1 - wgt)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def load_tiles_json(path: Path) -> tuple[list[str], int]:
    d = json.loads(path.read_text(encoding="utf-8"))
    return [t["name"] for t in d["tiles"]], int(d.get("columns", 8))


def pack_tileset(tiles_dir: Path, tiles_json: Path, out_png: Path, size: int = 32, preview: bool = True) -> list[str]:
    """Собирает tileset.png: порядок и количество колонок — из tiles.json.
    Нет файла <name>.png — клетка остаётся прозрачной (игра и редактор дорисуют заглушку с именем и цветом). Возвращает список отсутствующих."""
    names, cols = load_tiles_json(tiles_json)
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * size, rows * size), (0, 0, 0, 0))
    missing = []
    for i, name in enumerate(names):
        if name == "empty":
            continue
        p = tiles_dir / f"{name}.png"
        if not p.exists():
            missing.append(name)
            continue
        t = Image.open(p).convert("RGBA")
        if t.size != (size, size):
            t = t.resize((size, size), Image.Resampling.NEAREST)
        sheet.paste(t, ((i % cols) * size, (i // cols) * size), t)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png)
    if preview:
        upscale_preview(sheet, 3).save(out_png.with_name(out_png.stem + "_preview.png"))
    return missing
