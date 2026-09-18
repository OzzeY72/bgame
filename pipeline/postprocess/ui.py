"""UI-панели (рамка диалога): фон-заливка -> альфа, стирание надписей, растяжение по ширине, пиксель-арт.

Рамка генерируется на обычном светлом фоне (хромакей ломает розовую палитру), поэтому фон убираем
заливкой от краёв: всё, что достижимо от края картинки и близко по цвету к углу, становится прозрачным.
Внутренность рамки отделена тёмным контуром и не затрагивается, даже если она того же цвета, что фон.
"""
from __future__ import annotations

from collections import Counter

import numpy as np
from PIL import Image, ImageDraw

from . import chroma, pixelate

Rect = tuple[int, int, int, int]  # x0, y0, x1, y1 (не включая x1/y1)


def flood_key(img: Image.Image, thresh: int = 14) -> Image.Image:
    """Заливка фона от всех краёв (углы + середины сторон) magenta, затем обычный хромакей -> RGBA."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    key = chroma.KEY_COLORS["magenta"]
    for xy in seeds:
        if rgb.getpixel(xy) != key:
            ImageDraw.floodfill(rgb, xy, key, thresh=thresh)
    # порог маленький: залито ровно magenta, а розовые оттенки рамки далеко от (255,0,255)
    return chroma.key_to_alpha(rgb, key, tolerance=40, soft=0.0, despill=False)


def erase_rect(img: Image.Image, rect: Rect) -> Image.Image:
    """Закрасить прямоугольник самым частым цветом внутри него (стереть надпись с плашки)."""
    out = img.copy()
    x0, y0, x1, y1 = rect
    region = np.asarray(out.crop(rect).convert("RGBA"))
    fill = Counter(map(tuple, region.reshape(-1, 4).tolist())).most_common(1)[0][0]
    ImageDraw.Draw(out).rectangle((x0, y0, x1 - 1, y1 - 1), fill=fill)
    return out


def stretch_x(img: Image.Image, col: int, extra: int) -> Image.Image:
    """Вставить extra копий столбца col (растянуть однотонную часть рамки по ширине)."""
    if extra <= 0:
        return img
    a = np.asarray(img.convert("RGBA"))
    strip = np.repeat(a[:, col : col + 1], extra, axis=1)
    return Image.fromarray(np.concatenate([a[:, :col], strip, a[:, col:]], axis=1), "RGBA")


def scale_rect(r: Rect, s: float) -> Rect:
    x0, y0, x1, y1 = r
    return (round(x0 * s), round(y0 * s), round(x1 * s), round(y1 * s))


def make_panel(
    img: Image.Image,
    scale: float,
    colors: int,
    palette: Image.Image | None,
    alpha_threshold: int,
    method: str = "box",
    thresh: int = 14,
) -> tuple[Image.Image, tuple[int, int]]:
    """Прозрачный фон + уменьшение в scale раз + квантование + обрезка по содержимому (растяжение — до вызова).
    Возвращает панель и смещение обрезки (x, y) в пикселях панели — на него сдвигаются прямоугольники областей."""
    keyed = flood_key(img, thresh)
    small = pixelate.scale_by(keyed, scale, method)
    q = pixelate.quantize(small, colors, palette, alpha_threshold)
    bbox = chroma.alpha_bbox(q) or (0, 0, q.width, q.height)
    return q.crop(bbox), (bbox[0], bbox[1])
