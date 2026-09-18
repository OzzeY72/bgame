"""Уменьшение до целевого размера и квантование палитры (без дизеринга) — то, что делает картинку пиксель-артом."""
from __future__ import annotations

from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

RESAMPLE = {
    "nearest": Image.Resampling.NEAREST,
    "box": Image.Resampling.BOX,
    "lanczos": Image.Resampling.LANCZOS,
    "bilinear": Image.Resampling.BILINEAR,
}


def downscale(img: Image.Image, w: int, h: int, method: str = "box") -> Image.Image:
    """Уменьшение RGBA. 'nearest' — если исходник уже блочный (сэмплируем центры блоков)."""
    return img.convert("RGBA").resize((max(1, w), max(1, h)), RESAMPLE[method])


def scale_by(img: Image.Image, factor: float, method: str = "box") -> Image.Image:
    w = max(1, round(img.width * factor))
    h = max(1, round(img.height * factor))
    return downscale(img, w, h, method)


def binarize_alpha(img: Image.Image, threshold: int = 128) -> Image.Image:
    a = np.asarray(img.convert("RGBA")).copy()
    a[..., 3] = np.where(a[..., 3] >= threshold, 255, 0)
    return Image.fromarray(a, "RGBA")


def load_palette(path: str | Path) -> Image.Image:
    """Палитра из PNG (любая картинка: берём уникальные цвета, до 256) -> P-image для quantize()."""
    src = Image.open(path).convert("RGB")
    colors = [c for _, c in src.getcolors(maxcolors=1 << 20) or []]
    colors = list(dict.fromkeys(colors))[:256]
    pal = Image.new("P", (1, 1))
    flat = [v for c in colors for v in c] + [0] * (768 - 3 * len(colors))
    pal.putpalette(flat)
    return pal


def quantize(
    img: Image.Image,
    colors: int = 32,
    palette: Image.Image | None = None,
    alpha_threshold: int = 128,
) -> Image.Image:
    """Квантует только непрозрачные пиксели (прозрачные заливаем самым частым цветом, чтобы не
    тратить на них палитру), альфа становится бинарной."""
    img = binarize_alpha(img, alpha_threshold)
    arr = np.asarray(img)
    opaque = arr[..., 3] > 0
    if not opaque.any():
        return img
    rgb = arr[..., :3].copy()
    fill = Counter(map(tuple, rgb[opaque].tolist())).most_common(1)[0][0]
    rgb[~opaque] = fill
    rgb_img = Image.fromarray(rgb, "RGB")
    if palette is not None:
        q = rgb_img.quantize(palette=palette, dither=Image.Dither.NONE)
    else:
        n = max(2, min(256, colors))
        q = rgb_img.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = np.asarray(q.convert("RGB"))
    result = np.dstack([out, np.where(opaque, 255, 0).astype(np.uint8)])
    return Image.fromarray(result, "RGBA")


def upscale_preview(img: Image.Image, factor: int = 4) -> Image.Image:
    """Для просмотра результата глазами (NEAREST)."""
    return img.resize((img.width * factor, img.height * factor), Image.Resampling.NEAREST)
