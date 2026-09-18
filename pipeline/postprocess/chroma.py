"""Удаление фона-хромакея (magenta/green/любой цвет/auto по углам) -> RGBA."""
from __future__ import annotations

import numpy as np
from PIL import Image

KEY_COLORS = {
    "magenta": (255, 0, 255),
    "green": (0, 255, 0),
    "blue": (0, 0, 255),
    "white": (255, 255, 255),
    "black": (0, 0, 0),
}


def parse_key(key: str | tuple[int, int, int]) -> tuple[int, int, int] | None:
    """'magenta' | '#ff00ff' | (r,g,b) | 'auto' -> RGB или None для auto."""
    if isinstance(key, tuple):
        return key
    k = key.strip().lower()
    if k == "auto":
        return None
    if k in KEY_COLORS:
        return KEY_COLORS[k]
    if k.startswith("#") and len(k) == 7:
        return (int(k[1:3], 16), int(k[3:5], 16), int(k[5:7], 16))
    raise ValueError(f"Неизвестный цвет ключа: {key}")


def detect_key(img: Image.Image, margin: int = 6) -> tuple[int, int, int]:
    """Медианный цвет по четырём углам — для 'auto'."""
    a = np.asarray(img.convert("RGB")).astype(np.int32)
    h, w, _ = a.shape
    m = max(1, min(margin, h // 4, w // 4))
    corners = np.concatenate(
        [a[:m, :m].reshape(-1, 3), a[:m, -m:].reshape(-1, 3), a[-m:, :m].reshape(-1, 3), a[-m:, -m:].reshape(-1, 3)]
    )
    med = np.median(corners, axis=0)
    return tuple(int(x) for x in med)  # type: ignore[return-value]


def key_to_alpha(
    img: Image.Image,
    key: str | tuple[int, int, int] = "magenta",
    tolerance: float = 70,
    soft: float = 0.35,
    despill: bool = True,
    despill_band: int = 8,
) -> Image.Image:
    """Пиксели, близкие к ключу (евклидово расстояние в RGB < tolerance), становятся прозрачными.
    Между tolerance и tolerance*(1+soft) — плавный край. despill убирает ореол цвета ключа на краях."""
    rgb = parse_key(key)
    if rgb is None:
        rgb = detect_key(img)
    a = np.asarray(img.convert("RGBA")).astype(np.float32)
    dist = np.sqrt(((a[..., :3] - np.array(rgb, dtype=np.float32)) ** 2).sum(axis=-1))
    lo = float(tolerance)
    hi = lo * (1.0 + soft)
    alpha = np.clip((dist - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    out = a.copy()
    out[..., 3] = np.minimum(out[..., 3], alpha * 255.0)
    if despill:
        # Краевой пиксель — смесь цвета объекта с ключом: c = a*obj + (1-a)*key. Вычитаем долю ключа
        # обратно (иначе после бинаризации альфы контур остаётся розовым/зелёным). Где размешивание
        # выходит за диапазон, обрезаем; alpha — оценка, поэтому не даём делить на очень малые a.
        key_arr = np.array(rgb, dtype=np.float32)
        edge = (alpha > 0) & (alpha < 1)
        a = np.clip(alpha, 0.35, 1.0)[..., None]
        unmixed = np.clip((out[..., :3] - (1.0 - a) * key_arr) / a, 0, 255)
        out[..., :3] = np.where(edge[..., None], unmixed, out[..., :3])
        # Модель сглаживает свой тёмный контур об фон, и полоса шириной в несколько px у границы
        # выходит пурпурной (для magenta) уже в исходнике — после даунскейла это 1-px контур спрайта.
        # В полосе despill_band px от прозрачности гасим каналы ключа там, где они явно выпирают.
        out[..., :3] = _suppress_key_band(out[..., :3], alpha >= 1.0, key_arr, despill_band)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def _suppress_key_band(rgb: np.ndarray, opaque: np.ndarray, key: np.ndarray, band: int, excess: float = 40.0) -> np.ndarray:
    """В полосе band px от прозрачных пикселей: если средний уровень «ключевых» каналов (у magenta —
    R и B) выше остальных больше чем на excess, прижимаем ключевые каналы к остальным (+ небольшой запас).
    Кожа/волосы/дерево так не задеваются (их перекос меньше excess), а розово-серый контур становится тёмным."""
    dom = key > 128
    if dom.all() or not dom.any():
        return rgb
    near = ~opaque
    for _ in range(max(0, band)):
        near = near | np.roll(near, 1, 0) | np.roll(near, -1, 0) | np.roll(near, 1, 1) | np.roll(near, -1, 1)
    zone = near & opaque
    if not zone.any():
        return rgb
    k_mean = rgb[..., dom].mean(axis=-1)
    o_mean = rgb[..., ~dom].mean(axis=-1)
    hit = zone & (k_mean - o_mean > excess)
    cap = (o_mean + 24.0)[..., None]
    fixed = np.where(dom[None, None, :], np.minimum(rgb, cap), rgb)
    return np.where(hit[..., None], fixed, rgb)


def alpha_bbox(img: Image.Image, threshold: int = 8) -> tuple[int, int, int, int] | None:
    """Границы непрозрачного содержимого (x0,y0,x1,y1) или None."""
    a = np.asarray(img.convert("RGBA"))[..., 3]
    ys, xs = np.where(a > threshold)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    """Связные компоненты булевой маски (4-связность) через объединение горизонтальных отрезков.
    Возвращает [(площадь, x0, y0, x1, y1)] по убыванию площади. Без scipy: отрезков в строке мало,
    поэтому union-find по ним быстрый даже на 1024x1024."""
    h, _w = mask.shape
    parent: list[int] = []

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    runs: list[tuple[int, int, int, int]] = []  # (y, x0, x1, id)
    prev: list[tuple[int, int, int]] = []
    for y in range(h):
        row = mask[y]
        if not row.any():
            prev = []
            continue
        d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        cur: list[tuple[int, int, int]] = []
        for x0, x1 in zip(np.flatnonzero(d == 1).tolist(), np.flatnonzero(d == -1).tolist()):
            rid = len(parent)
            parent.append(rid)
            for px0, px1, pid in prev:
                if px0 < x1 and x0 < px1:
                    ra, rb = find(pid), find(rid)
                    if ra != rb:
                        parent[rb] = ra
            cur.append((x0, x1, rid))
        runs.extend((y, x0, x1, rid) for x0, x1, rid in cur)
        prev = cur

    comps: dict[int, list[int]] = {}
    for y, x0, x1, rid in runs:
        c = comps.get(find(rid))
        if c is None:
            comps[find(rid)] = [x1 - x0, x0, y, x1, y + 1]
        else:
            c[0] += x1 - x0
            c[1] = min(c[1], x0)
            c[2] = min(c[2], y)
            c[3] = max(c[3], x1)
            c[4] = max(c[4], y + 1)
    return sorted((tuple(c) for c in comps.values()), reverse=True)  # type: ignore[misc]


def despeckle(
    img: Image.Image,
    min_area_frac: float = 0.003,
    min_fill: float = 0.15,
    threshold: int = 8,
) -> Image.Image:
    """Оставляет самый плотный крупный непрозрачный «остров» (фигуру) и те, что не меньше min_area_frac
    от него и заполняют свой bbox хотя бы на min_fill. Убирает крапинки хромакея (мелкие) и линии сетки
    между кадрами (площадь есть, но bbox почти пустой — даже если линии образуют угол), из-за которых
    bbox содержимого раздувался до всей ячейки и персонаж получался в полтора раза мельче.
    Не-главный остров, касающийся края картинки, — кусок соседа из другой ячейки сетки (нос собаки,
    залезший через границу): выкидывается независимо от размера.
    Ограничение: линия, прилипшая к фигуре, остаётся (это один остров) — тогда поможет --inset."""
    rgba = np.asarray(img.convert("RGBA")).copy()
    mask = rgba[..., 3] > threshold
    comps = components(mask)
    if len(comps) <= 1:
        return Image.fromarray(rgba, "RGBA")
    H, W = mask.shape

    def touches_edge(c: tuple[int, int, int, int, int]) -> bool:
        _area, x0, y0, x1, y1 = c
        return x0 == 0 or y0 == 0 or x1 == W or y1 == H

    def fill(c: tuple[int, int, int, int, int]) -> float:
        area, x0, y0, x1, y1 = c
        return area / max(1, (x1 - x0) * (y1 - y0))

    # фигура — самый большой остров среди «плотных»; если плотных нет вообще — просто самый большой
    dense = [c for c in comps if fill(c) >= min_fill]
    main = dense[0] if dense else comps[0]
    keep = np.zeros_like(mask)
    for c in comps:
        area, x0, y0, x1, y1 = c
        if c is main or (area >= main[0] * min_area_frac and fill(c) >= min_fill and not touches_edge(c)):
            keep[y0:y1, x0:x1] |= mask[y0:y1, x0:x1]
    # keep по bbox может захватить чужой мелкий остров внутри bbox большого — это допустимо:
    # такие острова редкость, а точность по пикселю здесь не нужна
    rgba[..., 3] = np.where(keep, rgba[..., 3], 0)
    return Image.fromarray(rgba, "RGBA")
