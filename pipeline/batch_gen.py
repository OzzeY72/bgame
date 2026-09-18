#!/usr/bin/env python
"""Пакетная генерация: читает pipeline/batch/<entity>/gen.txt и прогоняет строки через gen.py.

Структура:
  pipeline/batch/<entity>/gen.txt   по одной команде на строку, <entity> = --name (можно
                                     переопределить в строке через --name)

Строка = "<kind> [флаги gen.py как в командной строке]", например:
  card  --ref refs/characters/girl.jpg --n 3
  sheet
  walk  --dir down
  walk  --dir right
  walk  --dir up

Пустые строки и строки с # игнорируются. Каждая непустая строка запускает:
  python pipeline/gen.py gen <kind> --name <entity> [флаги строки] --backend <backend по умолчанию klein>

Запуск:
  python pipeline/batch_gen.py                    # все папки в pipeline/batch, backend=klein
  python pipeline/batch_gen.py --only camera,tree  # только эти папки
  python pipeline/batch_gen.py --backend gemini
  python pipeline/batch_gen.py --dry-run           # только показать команды
  python pipeline/batch_gen.py --keep-going        # не останавливаться на ошибке строки
"""
from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from pathlib import Path

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GEN_PY = HERE / "gen.py"


def read_lines(path: Path) -> list[str]:
    lines = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=str(HERE / "batch"), help="папка с подпапками-сущностями (по умолчанию pipeline/batch)")
    ap.add_argument("--backend", default="flux", help="backend по умолчанию для строк без --backend (klein/flux/gemini/comfy-gemini)")
    ap.add_argument("--n", default="2", help="количество")
    ap.add_argument("--only", help="сущности через запятую, иначе все подпапки root")
    ap.add_argument("--file", default="gen.txt", help="имя txt-файла внутри папки сущности")
    ap.add_argument("--dry-run", action="store_true", help="только напечатать команды, не запускать")
    ap.add_argument("--keep-going", action="store_true", help="не останавливаться, если строка упала с ошибкой")
    args = ap.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        sys.exit(f"Нет папки {root}")

    only = {n.strip() for n in args.only.split(",")} if args.only else None
    entities = sorted(p for p in root.iterdir() if p.is_dir() and (only is None or p.name in only))
    if not entities:
        sys.exit(f"В {root} нет подходящих подпапок")

    failed: list[str] = []
    for edir in entities:
        gen_txt = edir / args.file
        if not gen_txt.exists():
            print(f"[{edir.name}] пропуск: нет {gen_txt.relative_to(ROOT)}")
            continue
        lines = read_lines(gen_txt)
        if not lines:
            print(f"[{edir.name}] пропуск: {args.file} пустой")
            continue
        for i, line in enumerate(lines, 1):
            tokens = shlex.split(line)
            kind, extra = tokens[0], tokens[1:]
            cmd = [sys.executable, str(GEN_PY), "gen", kind, "--name", edir.name, *extra]
            if "--backend" not in extra:
                cmd += ["--backend", args.backend]
            print(f"\n[{edir.name} {i}/{len(lines)}] {' '.join(cmd[2:])}")
            if args.dry_run:
                continue
            res = subprocess.run(cmd, cwd=ROOT)
            if res.returncode != 0:
                failed.append(f"{edir.name}:{i}: {line}")
                if not args.keep_going:
                    sys.exit(f"\nОстановлено: {edir.name} строка {i} ({line}) вернула код {res.returncode}")

    if failed:
        print("\nС ошибками (--keep-going):")
        for f in failed:
            print(" -", f)
        sys.exit(1)
    print("\nГотово.")


if __name__ == "__main__":
    main()
