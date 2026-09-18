"""
fl_dump.py — снять ноты из открытого проекта FL Studio в <имя>.mid + <имя>.json (тот же формат, что у compose.py).

Зачем: File → Export → MIDI в FL пишет ноты только с каналов MIDI Out — для FLEX/3xOsc и т. п. файл выходит пустым.
Обход — скрипт piano roll ComposeWithLLM (ставится вместе с fl-mcp), который выгружает ноты текущего канала
в piano_roll_state.json по Ctrl+Alt+Y.

Запуск:  python music/fl_dump.py home_theme_2 pad piano guitar bass bells [--bpm 84]
Дальше по подсказке: в piano roll выбрать канал (список справа от имени в заголовке) → Ctrl+Alt+Y → Enter здесь.
Первый раз за сессию FL скрипт надо запустить из меню piano roll: Tools (ключ) → Scripts → ComposeWithLLM,
после этого работает Ctrl+Alt+Y («Run last script again»).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from midi import write_midi  # noqa: E402

STATE = Path.home() / "Documents/Image-Line/FL Studio/Settings/Piano roll scripts/piano_roll_state.json"
# GM-программы для превью в обычном плеере (в FL инструменты всё равно свои)
GM = {"pad": 53, "piano": 0, "guitar": 24, "bass": 32, "bells": 10, "arp": 81, "synthpad": 90,
      "organ": 19, "harp": 6, "lead": 80, "brass": 61, "choir": 52, "drums": 0}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("tracks", nargs="+", help="имена каналов в том порядке, в каком будешь их снимать")
    ap.add_argument("--bpm", type=int, default=84)
    ap.add_argument("--sharps", type=int, default=2, help="знаки тональности (отриц. — бемоли)")
    ap.add_argument("--minor", action="store_true")
    a = ap.parse_args()

    tracks: dict[str, list[dict]] = {}
    for name in a.tracks:
        before = STATE.stat().st_mtime if STATE.exists() else 0
        input(f"[{name}] выбери канал в piano roll, нажми Ctrl+Alt+Y в FL, затем Enter здесь… ")
        if STATE.stat().st_mtime == before:
            print("  !! state-файл не обновился — скрипт в FL не сработал (см. докстринг), пропускаю")
            continue
        d = json.loads(STATE.read_text(encoding="utf-8"))
        tracks[name] = [dict(midi=x["midi"], time=round(x["time"], 4), duration=round(x["duration"], 4),
                             velocity=round(x["velocity"], 4)) for x in d["notes"] if not x["muted"]]
        print(f"  {len(tracks[name])} нот")

    programs = {t: (9 if t == "drums" else i % 9, GM.get(t, 0)) for i, t in enumerate(tracks)}
    write_midi(HERE / f"{a.name}.mid", a.name, tracks, programs, a.bpm, 4, a.sharps, a.minor)
    meta = dict(bpm=a.bpm, time_signature="4/4", source="снято из FL Studio через ComposeWithLLM",
                note="time/duration в четвертях; C4 = MIDI 60 (в FL подписано как C5)")
    (HERE / f"{a.name}.json").write_text(json.dumps(dict(meta=meta, tracks=tracks), ensure_ascii=False, indent=1),
                                        encoding="utf-8")
    print(f"→ music/{a.name}.mid, music/{a.name}.json")


if __name__ == "__main__":
    main()
