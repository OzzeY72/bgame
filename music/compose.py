"""
compose.py — темы для bgame: нотная запись (music/themes/*.py) → MIDI + JSON для FL Studio.

Запуск:  python music/compose.py            # все темы
         python music/compose.py dusk_theme # одна
Выход:   music/<тема>.mid   — SMF type 1, по треку на инструмент; можно импортировать в FL или послушать плеером
         music/<тема>.json  — те же ноты в четвертях, для заливки в FL Studio через fl-mcp
Печатает диапазоны партий и проверку голосоведения (малые секунды/ноны между одновременными нотами).

Зависимости: только стандартная библиотека. Новая тема — файл в themes/ с тем же набором констант и build().
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from midi import export  # noqa: E402

THEMES = ["home_theme", "dusk_theme", "nightmare_theme"]


def main(argv: list[str]) -> None:
    names = argv or THEMES
    for name in names:
        if name not in THEMES:
            sys.exit(f"нет такой темы: {name}; есть {', '.join(THEMES)}")
        export(importlib.import_module(f"themes.{name}"))


if __name__ == "__main__":
    main(sys.argv[1:])
