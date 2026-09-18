"""Сборка спрайтшита персонажа: строки = направления (порядок из config: down,left,right,up),
столбцы = кадры ходьбы. Формат совпадает с тем, что грузит Phaser (load.spritesheet + registerActorAnims).

Кадры лежат в pipeline/out/<name>/frames/<dir>_<i>.png (i = 0..walk_frames-1).
Дыхание (необязательно): frames/idle_<dir>_<i>.png — если есть хоть одно, под ходьбой добавляются ещё
len(directions) строк idle в том же порядке; направления без своих кадров стоят на кадре ходьбы 1.
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

from .pixelate import upscale_preview


IDLE_FRAME = 1  # колонка "стоим" в строке ходьбы = IDLE_FRAME в src/config.ts


def load_frames(frames_dir: Path, direction: str, count: int, prefix: str = "") -> list[Image.Image | None]:
    out: list[Image.Image | None] = []
    for i in range(count):
        p = frames_dir / f"{prefix}{direction}_{i}.png"
        out.append(Image.open(p).convert("RGBA") if p.exists() else None)
    return out


def _mirror_missing(rows: dict[str, list[Image.Image | None]]) -> None:
    """Недостающие кадры left/right достраиваем зеркалом противоположной стороны (покадрово)."""
    if "left" in rows and "right" in rows:
        for a, b in (("left", "right"), ("right", "left")):
            rows[a] = [f if f is not None else (ImageOps.mirror(g) if g is not None else None) for f, g in zip(rows[a], rows[b])]


def pack_sheet(
    frames_dir: Path,
    directions: list[str],
    walk_frames: int,
    frame_w: int,
    frame_h: int,
    mirror_left: bool = True,
) -> tuple[Image.Image, dict]:
    """Собирает лист. Отсутствующие кадры: left <- зеркало right (если mirror_left), иначе первый
    имеющийся кадр направления; если направления нет совсем — берём down."""
    rows: dict[str, list[Image.Image | None]] = {d: load_frames(frames_dir, d, walk_frames) for d in directions}
    idle: dict[str, list[Image.Image | None]] = {d: load_frames(frames_dir, d, walk_frames, "idle_") for d in directions}
    if mirror_left:
        _mirror_missing(rows)
        _mirror_missing(idle)
    has_idle = any(f is not None for fr in idle.values() for f in fr)

    sheet = Image.new("RGBA", (frame_w * walk_frames, frame_h * len(directions) * (2 if has_idle else 1)), (0, 0, 0, 0))
    missing: list[str] = []

    def paste(f: Image.Image, c: int, r: int) -> None:
        if f.size != (frame_w, frame_h):
            f = ImageOps.pad(f, (frame_w, frame_h), color=(0, 0, 0, 0), centering=(0.5, 1.0))
        sheet.paste(f, (c * frame_w, r * frame_h), f)

    stand: dict[str, Image.Image | None] = {}  # кадр "стоим" каждого направления — для idle-строк без своих кадров
    for r, d in enumerate(directions):
        frames = rows[d]
        if all(f is None for f in frames):
            frames = rows.get("down", frames)
            missing.append(f"{d}:* (взято down)")
        fallback = next((f for f in frames if f is not None), None)
        for c in range(walk_frames):
            f = frames[c] if c < len(frames) else None
            if f is None:
                f = fallback
                missing.append(f"{d}_{c}")
            if f is None:
                continue
            paste(f, c, r)
            if c == IDLE_FRAME:
                stand[d] = f
    if has_idle:
        for r, d in enumerate(directions):
            frames = idle[d]
            if all(f is None for f in frames):
                frames = [stand.get(d)] * walk_frames  # не дышит, стоит
                missing.append(f"idle_{d}:* (стоит на кадре {IDLE_FRAME})")
            fallback = next((f for f in frames if f is not None), None)
            for c in range(walk_frames):
                f = frames[c] if c < len(frames) else None
                if f is None:
                    f = fallback
                    missing.append(f"idle_{d}_{c}")
                if f is not None:
                    paste(f, c, len(directions) + r)
    meta = {
        "frameWidth": frame_w,
        "frameHeight": frame_h,
        "directions": directions,
        "walkFrames": walk_frames,
        "idleFrame": IDLE_FRAME,
        "idleRows": has_idle,
        "missing": missing,
    }
    return sheet, meta


def save_sheet(sheet: Image.Image, meta: dict, out_png: Path, preview: bool = True) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png)
    out_png.with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    if preview:
        upscale_preview(sheet, 4).save(out_png.with_name(out_png.stem + "_preview.png"))
