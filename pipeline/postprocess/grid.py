"""Нарезка сетки кадров и нормализация кадров персонажа.

Главная идея консистентности: все кадры одной генерации масштабируются ОДНИМ коэффициентом
(char_height / высота самого высокого кадра — это кадр «стоим») и выравниваются по низу (ноги на
одной линии), иначе персонаж "дышит" в размере между кадрами и подпрыгивает при ходьбе. Между
генерациями (лист 1x4 и ходьба 2x2) фигура нарисована в разном масштабе, поэтому коэффициент
считается для каждого файла свой — общий у них char_height.

Перед измерением ячейка чистится от линий сетки и крапинок (chroma.despeckle): иначе bbox
раздувается до всей ячейки и персонаж получается мельче, чем надо.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from .chroma import alpha_bbox, components, despeckle
from .pixelate import downscale, quantize


def split_grid(img: Image.Image, rows: int, cols: int, inset: int = 0) -> list[Image.Image]:
    """Режет картинку на rows x cols равных ячеек (слева направо, сверху вниз). inset — отступ внутрь ячейки."""
    w, h = img.size
    cw, ch = w / cols, h / rows
    cells = []
    for r in range(rows):
        for c in range(cols):
            x0 = round(c * cw) + inset
            y0 = round(r * ch) + inset
            x1 = round((c + 1) * cw) - inset
            y1 = round((r + 1) * ch) - inset
            cells.append(img.crop((x0, y0, x1, y1)))
    return cells


def split_blobs(img: Image.Image, n: int, pad: int = 8, threshold: int = 8, gap: int = 6) -> list[Image.Image]:
    """Режет картинку не сеткой, а по n самым большим «островам» содержимого (bbox каждого + pad).
    Для листов, где фигуры разной ширины (собака: спереди узкая, в профиль широкая) и модель
    раскладывает их неравномерно — нос профиля вылезает за границу ровной ячейки. Маска перед поиском
    островов расширяется на gap px, чтобы оторванные крапинкой хвост/ухо не стали отдельной фигурой.
    Порядок — как при чтении: ряды по перекрытию по вертикали, в ряду слева направо."""
    a = np.asarray(img.convert("RGBA"))[..., 3] > threshold
    m = a.copy()
    for _ in range(gap):  # дилатация 4-связностью
        m[1:, :] |= m[:-1, :]
        m[:-1, :] |= m[1:, :]
        m[:, 1:] |= m[:, :-1]
        m[:, :-1] |= m[:, 1:]
    comps = components(m)
    if len(comps) < n:
        raise ValueError(f"Нашлось {len(comps)} фигур вместо {n} — проверь хромакей или режь сеткой (--rows/--cols)")
    boxes = [(x0, y0, x1, y1) for _area, x0, y0, x1, y1 in comps[:n]]
    # ряды: bbox попадает в ряд, если по вертикали перекрывается с уже лежащими там
    rows: list[list[tuple[int, int, int, int]]] = []
    for b in sorted(boxes, key=lambda b: b[1]):
        for r in rows:
            if any(b[1] < o[3] and o[1] < b[3] for o in r):
                r.append(b)
                break
        else:
            rows.append([b])
    rows.sort(key=lambda r: min(b[1] for b in r))
    W, H = img.size
    cells = []
    for r in rows:
        for x0, y0, x1, y1 in sorted(r, key=lambda b: b[0]):
            cells.append(img.crop((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))))
    return cells


def crop_to_content(img: Image.Image, pad: int = 0, clean: bool = True) -> Image.Image:
    """Обрезка по содержимому. clean — сначала убрать линии сетки/крапинки (они не попадают ни в bbox,
    ни в результат)."""
    if clean:
        img = despeckle(img)
    bb = alpha_bbox(img)
    if bb is None:
        return img
    x0, y0, x1, y1 = bb
    return img.crop((max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)))


def reference_scale(
    cells: list[Image.Image], char_height: int, ref_index: int | None = None, clean: bool = True
) -> float:
    """Коэффициент масштаба: char_height / высота содержимого эталонной ячейки
    (по умолчанию — самой высокой; для ходьбы это кадр в полный рост)."""
    heights = []
    for c in cells:
        bb = alpha_bbox(despeckle(c) if clean else c)
        heights.append((bb[3] - bb[1]) if bb else 0)
    if ref_index is not None and heights[ref_index] > 0:
        h = heights[ref_index]
    else:
        h = max(heights) if heights else 0
    if h <= 0:
        raise ValueError("В кадрах нет непрозрачного содержимого — проверь хромакей")
    return char_height / h


def normalize_frame(
    cell: Image.Image,
    frame_w: int,
    frame_h: int,
    scale: float,
    method: str = "box",
    colors: int = 32,
    palette: Image.Image | None = None,
    anchor: str = "bottom",
    bottom_margin: int = 1,
    alpha_threshold: int = 128,
    clean: bool = True,
) -> Image.Image:
    """Обрезать по содержимому -> масштаб -> квантование -> положить в кадр frame_w x frame_h
    (по центру, anchor='bottom' — ноги у нижнего края минус bottom_margin)."""
    content = crop_to_content(cell.convert("RGBA"), clean=clean)
    small = downscale(content, round(content.width * scale), round(content.height * scale), method)
    small = quantize(small, colors, palette, alpha_threshold)
    small = crop_to_content(small, clean=False)
    canvas = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    x = (frame_w - small.width) // 2
    if anchor == "bottom":
        y = frame_h - bottom_margin - small.height
    else:
        y = (frame_h - small.height) // 2
    if small.width > frame_w or small.height > frame_h:
        print(f"  ! кадр {small.width}x{small.height} не влезает в {frame_w}x{frame_h} — уменьши char_height")
    canvas.paste(small, (x, y), small)
    return canvas


def normalize_frames(
    cells: list[Image.Image],
    frame_w: int,
    frame_h: int,
    char_height: int,
    scale: float | None = None,
    clean: bool = True,
    **kw,
) -> tuple[list[Image.Image], float]:
    """Все ячейки одним масштабом. Возвращает (кадры, использованный масштаб)."""
    s = scale if scale is not None else reference_scale(cells, char_height, clean=clean)
    return [normalize_frame(c, frame_w, frame_h, s, clean=clean, **kw) for c in cells], s


def normalize_single(
    img: Image.Image,
    size: int,
    method: str = "box",
    colors: int = 32,
    palette: Image.Image | None = None,
    alpha_threshold: int = 128,
    fit: str = "contain",
    clean: bool = True,
) -> Image.Image:
    """Один объект (предмет/портрет) в квадрат size x size. fit='contain' — вписать по содержимому,
    'cover' — центр-кроп всей картинки (для портретов/тайлов)."""
    img = img.convert("RGBA")
    if fit == "cover":
        side = min(img.size)
        x = (img.width - side) // 2
        y = (img.height - side) // 2
        sq = img.crop((x, y, x + side, y + side))
        small = downscale(sq, size, size, method)
        return quantize(small, colors, palette, alpha_threshold)
    content = crop_to_content(img, clean=clean)
    s = (size - 2) / max(content.size)
    small = downscale(content, round(content.width * s), round(content.height * s), method)
    small = quantize(small, colors, palette, alpha_threshold)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(small, ((size - small.width) // 2, size - 1 - small.height), small)
    return canvas
