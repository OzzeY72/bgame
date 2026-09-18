#!/usr/bin/env python
"""CLI пайплайна ассетов: генерация (ComfyUI klein/flux / Gemini) -> пост-обработка -> сборка для Phaser.

Запускать из корня репозитория. Полное описание: docs/ASSET_PIPELINE.md.

  python pipeline/gen.py ping
  python pipeline/gen.py gen card  --name girl --ref refs/characters/girl.jpg --backend gemini
  python pipeline/gen.py gen sheet --name girl                      # 4 вида, референс = out/girl/card.png
  python pipeline/gen.py gen walk  --name girl --dir right
  python pipeline/gen.py post sheet --name girl --in pipeline/out/girl/raw/sheet_1.png
  python pipeline/gen.py post walk  --name girl --dir right --in pipeline/out/girl/raw/walk_right_1.png
  python pipeline/gen.py pack sheet --name girl                     # -> public/assets/characters/girl.png
  python pipeline/gen.py gen prop --name camera --ref presents/phen.jpg --subject "vintage film camera"
  python pipeline/gen.py post prop --name camera --in pipeline/out/camera/raw/prop_1.png
  python pipeline/gen.py gen tile --name grass --subject "short green lawn grass"
  python pipeline/gen.py post tile --name grass --in pipeline/out/grass/raw/tile_1.png --seamless
  python pipeline/gen.py pack tiles                                 # -> public/assets/tiles/tileset.png
"""
from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sys
from pathlib import Path

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
sys.path.insert(0, str(HERE))

from comfy_client import ComfyClient, ComfyError  # noqa: E402
from gemini_client import GeminiError, generate as gemini_generate, load_dotenv  # noqa: E402
from postprocess import chroma, grid, pixelate, sheet, tiles, ui  # noqa: E402
from workflows.build_workflows import comfy_gemini_graph, flux_graph, klein_graph  # noqa: E402

DIR_DESC = {
    "down": "towards the viewer (front view, facing down/south)",
    "up": "away from the viewer (back view, facing up/north)",
    "left": "to the left (left side profile)",
    "right": "to the right (right side profile)",
}

KINDS = {
    # kind: (шаблон, нужен ли референс персонажа, grid rows x cols по умолчанию)
    "card": ("character_card.txt", False),
    "animal_card":  ("animal_card.txt", False),
    "sheet": ("character_sheet.txt", True),
    "walk": ("walk.txt", True),
    "idle": ("idle.txt", True),
    "portrait": ("portrait.txt", True),
    "prop": ("prop.txt", False),
    "tile": ("tile.txt", False),
    "facade": ("facade_tile.txt", False),
    "object": ("object_tile.txt", False),
    "building": ("building.txt", False),
    "restyle": ("restyle.txt", False),
}


# ---------------------------------------------------------------- утилиты
def load_cfg() -> dict:
    load_dotenv(HERE / ".env")
    cfg = yaml.safe_load((HERE / "config.yaml").read_text(encoding="utf-8"))
    if os.environ.get("COMFY_URL"):
        cfg["comfy"]["url"] = os.environ["COMFY_URL"]
    cfg.setdefault("flux", {})
    if os.environ.get("FLUX_COMFY_URL"):
        cfg["flux"]["url"] = os.environ["FLUX_COMFY_URL"]
    return cfg


def comfy_url(cfg: dict, backend: str) -> str:
    """klein/comfy-gemini — локальный comfy.url; flux — свой сервер (flux.url), если задан."""
    if backend == "flux" and cfg["flux"].get("url"):
        return str(cfg["flux"]["url"])
    return str(cfg["comfy"]["url"])


def comfy_client(cfg: dict, backend: str) -> ComfyClient:
    return ComfyClient(comfy_url(cfg, backend), cfg["comfy"].get("timeout_sec", 1800), cfg["comfy"].get("poll_sec", 1.5))


def out_dir(cfg: dict, name: str) -> Path:
    return ROOT / cfg["paths"]["out"] / name


def key_info(cfg: dict) -> tuple[str, str]:
    key = str(cfg["pixel"]["key_color"])
    rgb = chroma.parse_key(key) or (255, 0, 255)
    return key, "#%02X%02X%02X" % rgb


def build_prompt(cfg: dict, kind: str, args: argparse.Namespace) -> str:
    template = (HERE / "prompts" / KINDS[kind][0]).read_text(encoding="utf-8")
    style = (HERE / "prompts" / "style.txt").read_text(encoding="utf-8").strip()
    key, key_hex = key_info(cfg)
    fields = {
        "style": style,
        "key": key,
        "key_hex": key_hex,
        "subject": args.subject or args.name.replace("_", " "),
        "direction": args.dir or "down",
        "direction_desc": DIR_DESC.get(args.dir or "down", args.dir or ""),
        "emotion": args.emotion or "neutral, calm",
        "extra": args.extra or "",
        "name": args.name,
    }
    return template.format(**fields).strip()


def default_refs(cfg: dict, kind: str, args: argparse.Namespace) -> list[Path]:
    """Референсы: явные --ref, иначе для персонажных видов — вид направления + карточка."""
    refs = [Path(r) for r in (args.ref or [])]
    if refs:
        return refs
    od = out_dir(cfg, args.name)
    if KINDS[kind][1]:
        view = od / "views" / f"{args.dir}.png" if args.dir else None
        if view and view.exists():
            refs.append(view)
        card = od / "card.png"
        if card.exists():
            refs.append(card)
        if not refs:
            sys.exit(
                f"Нужен референс персонажа: положи одобренную карточку в {card} "
                f"(см. gen card) или передай --ref"
            )
    return refs


def parse_size(s: str | None, cfg: dict, section: str = "klein") -> tuple[int, int]:
    if not s:
        return int(cfg[section]["width"]), int(cfg[section]["height"])
    w, h = s.lower().split("x")
    return int(w), int(h)


# ---------------------------------------------------------------- команды
def _ping_server(url: str, models: dict, nodes: tuple[str, ...]) -> None:
    """Печатает состояние одного ComfyUI: версия, есть ли нужные модели и ноды."""
    print("ComfyUI:", url)
    try:
        c = ComfyClient(url)
        info = c.ping()
        print("  ok, версия", info["system"].get("comfyui_version"), [d["name"] for d in info.get("devices", [])])
        for folder, want in (
            ("diffusion_models", models["unet"]),
            ("text_encoders", models["clip"]),
            ("vae", models["vae"]),
        ):
            have = c.models(folder)
            mark = "OK " if want in have else "НЕТ"
            print(f"  [{mark}] {folder}: {want}   (есть: {have})")
        oi = c.object_info()
        for node in nodes:
            print(f"  [{'OK ' if node in oi else 'НЕТ'}] нода {node}")
    except Exception as e:  # noqa: BLE001
        print("  недоступен:", e)


def cmd_ping(cfg: dict, args: argparse.Namespace) -> None:
    print("[klein / comfy-gemini]")
    _ping_server(
        cfg["comfy"]["url"], cfg["klein"],
        ("UNETLoader", "ReferenceLatent", "Flux2Scheduler", "EmptyFlux2LatentImage", "GeminiImage2Node", "UnetLoaderGGUF"),
    )
    flux_url = comfy_url(cfg, "flux")
    if flux_url != cfg["comfy"]["url"]:
        print("[flux]")
        _ping_server(flux_url, cfg["flux"], ("UNETLoader", "FluxGuidance", "BasicGuider", "ReferenceLatent", "Flux2Scheduler"))
    else:
        print("[flux] отдельный сервер не задан (flux.url / FLUX_COMFY_URL) — будет использован тот же ComfyUI")
    print("Gemini API:", "ключ найден" if os.environ.get("GEMINI_API_KEY") else "нет GEMINI_API_KEY (pipeline/.env)")


def cmd_gen(cfg: dict, args: argparse.Namespace) -> None:
    kind = args.kind
    prompt = build_prompt(cfg, kind, args)
    refs = default_refs(cfg, kind, args)
    od = out_dir(cfg, args.name) / "raw"
    od.mkdir(parents=True, exist_ok=True)
    tag = kind + (f"_{args.dir}" if args.dir and kind in ("walk", "idle") else "") + (f"_{args.emotion}" if args.emotion and kind == "portrait" else "")
    backend = args.backend or ("gemini" if os.environ.get("GEMINI_API_KEY") else "klein")
    print(f"[gen] {kind} name={args.name} backend={backend} refs={[str(r) for r in refs]}")
    if args.show_prompt or args.dry_run:
        print("----- prompt -----\n" + prompt + "\n------------------")
    if args.dry_run:
        return

    for i in range(args.n):
        seed = args.seed if args.seed is not None else random.randint(1, 2**31 - 1)
        if args.seed is not None and args.n > 1:
            seed = args.seed + i
        stem = f"{tag}_{seed}"
        (od / f"{stem}.txt").write_text(prompt + f"\n\n# backend={backend} refs={[str(r) for r in refs]}", encoding="utf-8")
        if backend == "gemini":
            g = cfg["gemini"]
            imgs = gemini_generate(prompt, refs, args.model or g["model"], g.get("aspect_ratio", "1:1"), g.get("image_size", "1K"), seed)
            path = od / f"{stem}.png"
            Image.open(_bytes_io(imgs[0])).convert("RGBA").save(path)
            paths = [path]
        else:
            c = comfy_client(cfg, backend)
            names = [c.upload_image(r) for r in refs]
            if backend == "klein":
                w, h = parse_size(args.size, cfg)
                graph = klein_graph(cfg["klein"], prompt, args.negative, names, w, h, seed, f"bgame/{args.name}/{tag}")
            elif backend == "flux":
                w, h = parse_size(args.size, cfg, "flux")
                graph = flux_graph(cfg["flux"], prompt, names, w, h, seed, f"bgame/{args.name}/{tag}")
            elif backend == "comfy-gemini":
                cg = dict(cfg["comfy_gemini"])
                if args.model:
                    cg["model"] = args.model
                graph = comfy_gemini_graph(cg, prompt, names, seed, f"bgame/{args.name}/{tag}")
            else:
                sys.exit(f"Неизвестный backend {backend}")
            if args.dump_graph:
                (od / f"{stem}.graph.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
            paths = c.run(graph, od, stem)
        for p in paths:
            print("  ->", p.relative_to(ROOT))


def _bytes_io(b: bytes):
    import io

    return io.BytesIO(b)


def _palette(cfg: dict) -> Image.Image | None:
    p = cfg["pixel"].get("palette")
    return pixelate.load_palette(ROOT / p) if p else None


def _keyed(cfg: dict, path: Path, args: argparse.Namespace) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    key = args.key or cfg["pixel"].get("post_key") or cfg["pixel"]["key_color"]
    if key == "none":
        return img
    return chroma.key_to_alpha(img, key, float(args.tolerance or cfg["pixel"]["key_tolerance"]))


def _parse_tiles(spec: str | None, default: str) -> tuple[int, int]:
    """'2x1' -> (2, 1): размер блока в тайлах."""
    tw, th = (spec or default).lower().split("x")
    return int(tw), int(th)


def _write_tiles(cfg: dict, canvas: Image.Image, tw: int, th: int, size: int, name: str, names: str | None, tdir: Path) -> None:
    """Режет блок (tw*size x th*size) на тайлы: имена из --names (слева направо, сверху вниз; «-» = пропустить),
    иначе <name> для 1x1 или <name>_r{r}c{c}. Рядом preview_<name>.png и подсказка для tiles.json."""
    name_list = [n.strip() for n in names.split(",")] if names else None
    written = []
    k = 0
    for r in range(th):
        for c in range(tw):
            tile_img = canvas.crop((c * size, r * size, (c + 1) * size, (r + 1) * size))
            if name_list and k < len(name_list):
                nm = name_list[k]
            elif tw == 1 and th == 1:
                nm = name
            else:
                nm = f"{name}_r{r}c{c}"
            k += 1
            if nm in ("", "-", "skip"):
                continue
            tile_img.save(tdir / f"{nm}.png")
            written.append(nm)
    pixelate.upscale_preview(canvas, 4).save(tdir / f"preview_{name}.png")
    print("  тайлы ->", tdir.relative_to(ROOT), written)
    missing = [n for n in written if n not in tiles.load_tiles_json(ROOT / cfg["paths"]["tiles_json"])[0]]
    if missing:
        print("  добавь в src/data/tiles.json:", json.dumps([{"name": n, "solid": True, "color": "#888888"} for n in missing], ensure_ascii=False))


def cmd_post(cfg: dict, args: argparse.Namespace) -> None:
    px = cfg["pixel"]
    kind = args.kind
    src = Path(args.inp)
    od = out_dir(cfg, args.name)
    od.mkdir(parents=True, exist_ok=True)
    pal = _palette(cfg)
    colors = args.colors or px["colors"]
    method = args.method
    assets = ROOT / cfg["paths"]["assets"]

    if kind in ("walk", "idle", "sheet"):
        ch = px["characters"].get(args.name)
        if not ch:
            sys.exit(f"Нет персонажа {args.name} в config.yaml -> pixel.characters")
        fw, fh = ch["frame"]
        img = _keyed(cfg, src, args)
        if kind == "sheet":
            rows, cols = (args.rows or 1), (args.cols or 4)  # модель иногда кладёт 4 вида сеткой 2x2 (широкие звери) — --rows 2 --cols 2
            if rows * cols != 4:
                sys.exit(f"sheet: rows x cols должно давать 4 вида, а не {rows}x{cols}")
            dirs = ["down", "left", "right", "up"]  # порядок чтения ячеек: слева направо, сверху вниз
        else:
            rows, cols = (args.rows or 2), (args.cols or 2)
            dirs = [args.dir]
            if not args.dir:
                sys.exit("--dir обязателен для walk")
        if args.split == "blobs":  # фигуры разной ширины (собака) — по островам содержимого, не по сетке
            cells = grid.split_blobs(img, rows * cols)
        else:
            cells = grid.split_grid(img, rows, cols, args.inset)
        frames, scale = grid.normalize_frames(
            cells, fw, fh, int(ch["char_height"]), args.scale, clean=not args.no_clean, method=method,
            colors=colors, palette=pal, alpha_threshold=px["alpha_threshold"],
        )
        fdir = od / "frames"
        fdir.mkdir(parents=True, exist_ok=True)
        if kind == "sheet":
            (od / "views").mkdir(exist_ok=True)
            for d, cell, fr in zip(dirs, cells, frames):
                grid.crop_to_content(cell, pad=8, clean=not args.no_clean).save(od / "views" / f"{d}.png")  # полноразмерный вид -> референс для walk
                fr.save(fdir / f"{d}_1.png")  # колонка 1 = стоим (idle)
            print(f"  виды -> {od / 'views'}, кадры стойки -> {fdir}/<dir>_1.png")
        else:
            prefix = "idle_" if kind == "idle" else ""  # кадры дыхания лежат рядом с ходьбой, но не перетирают её
            for i, fr in enumerate(frames):
                fr.save(fdir / f"{prefix}{args.dir}_{i}.png")
            print(f"  кадры -> {fdir}/{prefix}{args.dir}_0..{len(frames) - 1}.png")
        print(f"  масштаб {scale:.4f} (свой для каждой генерации; --scale — только чтобы принудительно повторить)")
        strip = Image.new("RGBA", (fw * len(frames), fh))
        for i, fr in enumerate(frames):
            strip.paste(fr, (i * fw, 0))
        pixelate.upscale_preview(strip, 4).save(od / f"preview_{kind}_{args.dir or 'sheet'}.png")

    elif kind == "portrait":
        img = _keyed(cfg, src, args)
        size = int(px["portrait"])
        res = grid.normalize_single(img, size, method, colors, pal, px["alpha_threshold"], fit=args.fit or "contain", clean=not args.no_clean)
        # фон портрета: прозрачный; рамку рисует UI
        suffix = f"_{args.emotion}" if args.emotion and args.emotion != "default" else ""
        dst = assets / "portraits" / f"{args.name}{suffix}.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        res.save(dst)
        pixelate.upscale_preview(res, 4).save(od / f"preview_portrait{suffix}.png")
        print("  ->", dst.relative_to(ROOT))

    elif kind == "prop":
        img = _keyed(cfg, src, args)
        size = int(args.tile or px["prop"])
        res = grid.normalize_single(img, size, method, colors, pal, px["alpha_threshold"], fit="contain", clean=not args.no_clean)
        dst = assets / "props" / f"{args.name}.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        res.save(dst)
        pixelate.upscale_preview(res, 6).save(od / "preview_prop.png")
        print("  ->", dst.relative_to(ROOT), "(ключ текстуры prop_<name> в src/data/assets.ts)")

    elif kind == "tile":
        # плоская текстура/фасад -> тайл, или блок --tiles WxH (подъезд 2x1: --names entrance,entrance_r)
        img = Image.open(src).convert("RGBA")
        size = int(args.tile or px["tile"])
        tw, th = _parse_tiles(args.tiles, "1x1")
        res = tiles.make_tile(img, size, method, args.colors or 20, pal, seamless=args.seamless, tiles=(tw, th))
        tdir = ROOT / cfg["paths"]["out"] / "tiles"
        tdir.mkdir(parents=True, exist_ok=True)
        if tw == 1 and th == 1:
            dst = tdir / f"{args.name}.png"
            res.save(dst)
            big = Image.new("RGBA", (size * 3, size * 3))
            for y in range(3):
                for x in range(3):
                    big.paste(res, (x * size, y * size))
            pixelate.upscale_preview(big, 4).save(tdir / f"preview_{args.name}.png")
            print("  ->", dst.relative_to(ROOT), "(3x3 превью рядом; затем: gen.py pack tiles)")
        else:
            _write_tiles(cfg, res, tw, th, size, args.name, args.names, tdir)

    elif kind in ("object", "building"):
        # объект на хромакее -> сетка тайлов WxH (в тайлах). --tiles 1x2 для дерева (верх=крона, низ=ствол).
        img = _keyed(cfg, src, args)
        size = int(px["tile"])
        tw, th = _parse_tiles(args.tiles, "1x1" if kind == "object" else "4x3")
        content = grid.crop_to_content(img, clean=not args.no_clean)
        target_w, target_h = tw * size, th * size
        s = min(target_w / content.width, target_h / content.height)
        small = pixelate.downscale(content, round(content.width * s), round(content.height * s), method)
        small = pixelate.quantize(small, colors, pal, px["alpha_threshold"])
        canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        canvas.paste(small, ((target_w - small.width) // 2, target_h - small.height), small)
        tdir = ROOT / cfg["paths"]["out"] / "tiles"
        tdir.mkdir(parents=True, exist_ok=True)
        _write_tiles(cfg, canvas, tw, th, size, args.name, args.names, tdir)
    elif kind == "ui":
        # рамка диалога на светлом фоне (не хромакей): фон убираем заливкой от краёв, надпись-заглушку стираем,
        # однотонную часть растягиваем по ширине до --width, уменьшаем в --scale раз. Прямоугольники --rect
        # (в координатах исходника) пересчитываются в пиксели готовой панели -> для DIALOGUE_PANEL в src/config.ts.
        img = Image.open(src).convert("RGBA")
        scale = args.scale or 1 / 6
        for r in args.erase or []:
            img = ui.erase_rect(img, _rect(r))
        rects = {n: _rect(v) for n, v in (x.split("=", 1) for x in args.rect or [])}
        extra = 0
        if args.width:
            extra = max(0, round(args.width / scale) - img.width)
            col = args.stretch_x if args.stretch_x is not None else img.width // 2
            img = ui.stretch_x(img, col, extra)
            rects = {n: (x0 + (extra if x0 >= col else 0), y0, x1 + (extra if x1 > col else 0), y1) for n, (x0, y0, x1, y1) in rects.items()}
        res, (ox, oy) = ui.make_panel(img, scale, colors, pal, px["alpha_threshold"], method, args.thresh)
        dst = assets / "ui" / f"{args.name}.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        res.save(dst)
        pixelate.upscale_preview(res, 3).save(od / "preview_ui.png")
        print("  ->", dst.relative_to(ROOT), f"{res.width}x{res.height}", f"(растянуто на {extra} px исходника)" if extra else "")
        print(f"  width: {res.width}, height: {res.height},")
        for n, r in rects.items():
            x0, y0, x1, y1 = ui.scale_rect(r, scale)
            print(f"  {n}: {{ x: {x0 - ox}, y: {y0 - oy}, w: {x1 - x0}, h: {y1 - y0} }},")
    else:
        sys.exit(f"Неизвестный вид {kind}")


def _rect(s: str) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = (int(v) for v in s.split(","))
    return x0, y0, x1, y1


def cmd_pack(cfg: dict, args: argparse.Namespace) -> None:
    px = cfg["pixel"]
    assets = ROOT / cfg["paths"]["assets"]
    if args.what == "sheet":
        ch = px["characters"].get(args.name)
        if not ch:
            sys.exit(f"Нет персонажа {args.name} в config.yaml -> pixel.characters")
        fw, fh = ch["frame"]
        od = out_dir(cfg, args.name)
        img, meta = sheet.pack_sheet(od / "frames", list(px["directions"]), int(px["walk_frames"]), fw, fh, bool(px.get("mirror_left", True)))
        dst = assets / "characters" / f"{args.name}.png"
        sheet.save_sheet(img, meta, dst)
        print("  ->", dst.relative_to(ROOT), "| нет кадров:", meta["missing"] or "всё на месте")
    elif args.what == "tiles":
        tdir = ROOT / cfg["paths"]["out"] / "tiles"
        dst = assets / "tiles" / "tileset.png"
        missing = tiles.pack_tileset(tdir, ROOT / cfg["paths"]["tiles_json"], dst, int(px["tile"]))
        print("  ->", dst.relative_to(ROOT), "| нет тайлов:", missing or "всё на месте")
    else:
        sys.exit("pack: sheet | tiles")


def cmd_approve(cfg: dict, args: argparse.Namespace) -> None:
    """Скопировать выбранную генерацию как канонический референс персонажа (out/<name>/card.png)."""
    od = out_dir(cfg, args.name)
    od.mkdir(parents=True, exist_ok=True)
    src = Path(args.inp)
    img = _keyed(cfg, src, args) if not args.raw else Image.open(src).convert("RGBA")
    dst = od / "card.png"
    img.save(dst)
    print("  ->", dst.relative_to(ROOT), "(референс для sheet/walk/idle/portrait)")


# ---------------------------------------------------------------- argparse
def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("ping", help="проверить ComfyUI/модели/ключ Gemini")

    g = sub.add_parser("gen", help="сгенерировать сырое изображение")
    g.add_argument("kind", choices=list(KINDS))
    g.add_argument("--name", required=True, help="имя ассета: girl, freya, camera, grass ...")
    g.add_argument("--ref", action="append", help="референс(ы): фото/картинка; можно несколько")
    g.add_argument("--backend", choices=["klein", "flux", "gemini", "comfy-gemini"], help="по умолчанию gemini если есть ключ, иначе klein; flux — FLUX.2 dev на удалённом ComfyUI (flux.url)")
    g.add_argument("--dir", choices=list(DIR_DESC), help="направление для walk/idle (idle по умолчанию down)")
    g.add_argument("--subject", help="описание объекта/текстуры (prop, tile, object, building, restyle)")
    g.add_argument("--emotion", help="эмоция портрета: happy, sad, surprised ...")
    g.add_argument("--extra", default="", help="добавка к промпту")
    g.add_argument("--negative", default="blurry, photo, 3d render, text, watermark, gradient background", help="negative (только klein; у flux dev negative нет)")
    g.add_argument("--seed", type=int)
    g.add_argument("--n", type=int, default=1, help="сколько вариантов")
    g.add_argument("--size", help="WxH для klein/flux (по умолчанию из config)")
    g.add_argument("--model", help="переопределить модель gemini/comfy-gemini")
    g.add_argument("--show-prompt", action="store_true")
    g.add_argument("--dry-run", action="store_true", help="только собрать и показать промпт, ничего не генерировать")
    g.add_argument("--dump-graph", action="store_true", help="сохранить API-граф ComfyUI рядом с результатом")

    p = sub.add_parser("post", help="пост-обработка сырого изображения в пиксель-арт")
    p.add_argument("kind", choices=["sheet", "walk", "idle", "portrait", "prop", "tile", "object", "building", "ui"])
    p.add_argument("--name", required=True)
    p.add_argument("--in", dest="inp", required=True, help="сырой PNG")
    p.add_argument("--dir", choices=list(DIR_DESC))
    p.add_argument("--rows", type=int, help="сетка сырого файла (walk/idle: 2x2; sheet: 1x4, если модель нарисовала 2x2 — --rows 2 --cols 2)")
    p.add_argument("--cols", type=int)
    p.add_argument("--inset", type=int, default=0, help="отступ внутрь ячейки сетки, px")
    p.add_argument("--split", choices=["grid", "blobs"], default="grid",
                   help="blobs — резать по островам содержимого, а не ровной сеткой (фигуры разной ширины: у собаки профиль шире фаса и нос вылезает за ячейку); rows*cols = сколько фигур искать")
    p.add_argument("--scale", type=float, help="принудительный масштаб (по умолчанию считается по самому высокому кадру файла)")
    p.add_argument("--no-clean", action="store_true", help="не убирать линии сетки и крапинки перед обрезкой по содержимому")
    p.add_argument("--method", choices=list(pixelate.RESAMPLE), default="box")
    p.add_argument("--colors", type=int)
    p.add_argument("--key", help="цвет хромакея: magenta|green|#rrggbb|auto|none")
    p.add_argument("--tolerance", type=float)
    p.add_argument("--emotion", help="портрет: суффикс файла (default = без суффикса)")
    p.add_argument("--fit", choices=["contain", "cover"], help="портрет: вписать содержимое или центр-кроп")
    p.add_argument("--tile", type=int, help="размер тайла/предмета в px")
    p.add_argument("--tiles", help="tile/object/building: сетка в тайлах, напр. 2x1, 1x2 или 8x4")
    p.add_argument("--names", help="tile/object/building: имена тайлов через запятую (слева направо, сверху вниз; '-' = пропустить)")
    p.add_argument("--seamless", action="store_true", help="tile: сделать бесшовным")
    p.add_argument("--width", type=int, help="ui: ширина готовой панели, px (растяжение столбцом --stretch-x)")
    p.add_argument("--stretch-x", type=int, help="ui: столбец исходника, который дублируется при растяжении (по умолчанию середина)")
    p.add_argument("--erase", action="append", help="ui: стереть прямоугольник x0,y0,x1,y1 исходника (надпись-заглушка); можно несколько")
    p.add_argument("--rect", action="append", help="ui: name=x0,y0,x1,y1 исходника -> напечатать в пикселях панели (text, portrait, name)")
    p.add_argument("--thresh", type=int, default=14, help="ui: допуск заливки фона от краёв")

    k = sub.add_parser("pack", help="собрать спрайтшит персонажа или тайлсет")
    k.add_argument("what", choices=["sheet", "tiles"])
    k.add_argument("--name")

    a = sub.add_parser("approve", help="сделать картинку каноническим референсом персонажа (out/<name>/card.png)")
    a.add_argument("--name", required=True)
    a.add_argument("--in", dest="inp", required=True)
    a.add_argument("--raw", action="store_true", help="не убирать хромакей")
    a.add_argument("--key")
    a.add_argument("--tolerance", type=float)

    args = ap.parse_args()
    if args.cmd in ("gen", "post") and args.kind == "idle" and not args.dir:
        args.dir = "down"  # по умолчанию дышит только вид в камеру; остальные направления стоят на кадре 1
    cfg = load_cfg()
    try:
        {"ping": cmd_ping, "gen": cmd_gen, "post": cmd_post, "pack": cmd_pack, "approve": cmd_approve}[args.cmd](cfg, args)
    except (ComfyError, GeminiError) as e:
        sys.exit(f"Ошибка: {e}")


if __name__ == "__main__":
    main()
