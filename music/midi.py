"""
midi.py — общее для всех тем: нотация, запись SMF type 1, экспорт JSON для fl-mcp, проверка голосоведения.

Нотация научная (C4 = MIDI 60). В FL Studio та же клавиша подписана C5 — FL нумерует октавы на 1 выше.
Нота в треке: {"midi": int, "time": доли, "duration": доли, "velocity": 0..1} (доля = четверть).
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

# Windows-консоль по умолчанию cp1252 — иначе русские сообщения падают с UnicodeEncodeError
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

OUT_DIR = Path(__file__).resolve().parent
PPQ = 480  # разрешение MIDI-файла (FL внутри пересчитает в свои 96)
UNPITCHED = {"drums"}  # треки ударных: номер ноты — инструмент GM-набора, в проверку голосоведения не входят

_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

Note = dict
Tracks = dict[str, list[Note]]


def n(name: str) -> int:
    """'F#5' → 78, 'Bb3' → 58, 'C4' → 60."""
    letter, rest = name[0].upper(), name[1:]
    acc = 0
    while rest and rest[0] in "#b":
        acc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + _NAMES[letter] + acc


def name_of(midi: int) -> str:
    return f"{_SHARP[midi % 12]}{midi // 12 - 1}"


def add(tracks: Tracks, track: str, midi: int, time: float, dur: float, vel: float) -> None:
    tracks[track].append(dict(midi=midi, time=round(time, 3), duration=round(dur, 3), velocity=round(vel, 3)))


# ---------------------------------------------------------------------------
# SMF type 1
# ---------------------------------------------------------------------------
def _vlq(x: int) -> bytes:
    out = [x & 0x7F]
    x >>= 7
    while x:
        out.append(0x80 | (x & 0x7F))
        x >>= 7
    return bytes(reversed(out))


def _chunk(tag: bytes, data: bytes) -> bytes:
    return tag + struct.pack(">I", len(data)) + data


def _meta(kind: int, data: bytes) -> bytes:
    return b"\xFF" + bytes([kind]) + _vlq(len(data)) + data


def _track(events: list[tuple[int, int, bytes]]) -> bytes:
    """events: (tick, priority, bytes). priority: 0 meta, 1 program, 2 note-off, 3 note-on."""
    events.sort(key=lambda e: (e[0], e[1]))
    out = bytearray()
    last = 0
    for tick, _, ev in events:
        out += _vlq(tick - last) + ev
        last = tick
    out += _vlq(0) + _meta(0x2F, b"")
    return _chunk(b"MTrk", bytes(out))


def write_midi(path: Path, name: str, tracks: Tracks, programs: dict[str, tuple[int, int]],
               bpm: int, beats_per_bar: int, key_sharps: int, minor: bool) -> None:
    """programs: имя трека → (MIDI-канал, GM-программа для превью в обычном плеере)."""
    tempo = _track([
        (0, 0, _meta(0x03, name.encode())),
        (0, 0, _meta(0x51, struct.pack(">I", round(60_000_000 / bpm))[1:])),
        (0, 0, _meta(0x58, bytes([beats_per_bar, 2, 24, 8]))),
        (0, 0, _meta(0x59, bytes([key_sharps & 0xFF, 1 if minor else 0]))),
    ])
    chunks = [tempo]
    for track, notes in tracks.items():
        chan, program = programs[track]
        ev: list[tuple[int, int, bytes]] = [
            (0, 0, _meta(0x03, track.encode())),
            (0, 1, bytes([0xC0 | chan, program])),
        ]
        for note in notes:
            on = round(note["time"] * PPQ)
            off = round((note["time"] + note["duration"]) * PPQ)
            vel = max(1, min(127, round(note["velocity"] * 127)))
            ev.append((on, 3, bytes([0x90 | chan, note["midi"], vel])))
            ev.append((off, 2, bytes([0x80 | chan, note["midi"], 0])))
        chunks.append(_track(ev))
    header = _chunk(b"MThd", struct.pack(">HHH", 1, len(chunks), PPQ))
    path.write_bytes(header + b"".join(chunks))


# ---------------------------------------------------------------------------
# Экспорт темы и проверка
# ---------------------------------------------------------------------------
def export(theme) -> None:
    """theme — модуль темы: NAME, BPM, BEATS_PER_BAR, KEY, KEY_SHARPS, MINOR, BARS, CHORD_NAMES, TRACKS, build()."""
    tracks = theme.build()
    write_midi(OUT_DIR / f"{theme.NAME}.mid", theme.NAME, tracks, theme.TRACKS,
               theme.BPM, theme.BEATS_PER_BAR, theme.KEY_SHARPS, theme.MINOR)
    meta = dict(
        bpm=theme.BPM, time_signature=f"{theme.BEATS_PER_BAR}/4", key=theme.KEY, bars=theme.BARS,
        chords=theme.CHORD_NAMES,
        note="time/duration в четвертях; C4 = MIDI 60 (в FL подписано как C5)",
    )
    (OUT_DIR / f"{theme.NAME}.json").write_text(
        json.dumps(dict(meta=meta, tracks=tracks), ensure_ascii=False, indent=1), encoding="utf-8")

    seconds = theme.BARS * theme.BEATS_PER_BAR * 60 / theme.BPM
    print(f"{theme.NAME}: {theme.BPM} BPM, {theme.KEY}, {theme.BARS} тактов, {seconds:.1f} c")
    for track, notes in tracks.items():
        lo, hi = min(x["midi"] for x in notes), max(x["midi"] for x in notes)
        print(f"  {track:7s} {len(notes):3d} нот, {name_of(lo)}–{name_of(hi)}")
    bad = clashes(tracks, theme.BEATS_PER_BAR)
    if bad:
        print(f"  !! резкие интервалы (м2/м9 ≥ 0.3 доли): {len(bad)}")
        for bar, ta, a, tb, b, ov in bad:
            print(f"     такт {bar:2d}: {ta} {name_of(a)} × {tb} {name_of(b)} ({ov} доли)")
    else:
        print("  голосоведение: чисто")


def clashes(tracks: Tracks, beats_per_bar: int, min_overlap: float = 0.3) -> list[tuple]:
    """Малые секунды (1 полутон) и малые ноны (13) между одновременно звучащими нотами любых треков.
    Большие септимы и «maj7 через октаву» не считаем — это краска, а не грязь."""
    flat = [(t, x) for t, notes in tracks.items() if t not in UNPITCHED for x in notes]
    out = []
    for i in range(len(flat)):
        ta, x = flat[i]
        for j in range(i + 1, len(flat)):
            tb, y = flat[j]
            ov = min(x["time"] + x["duration"], y["time"] + y["duration"]) - max(x["time"], y["time"])
            if ov >= min_overlap and abs(x["midi"] - y["midi"]) in (1, 13):
                bar = int(max(x["time"], y["time"]) // beats_per_bar) + 1
                out.append((bar, ta, x["midi"], tb, y["midi"], round(ov, 2)))
    return sorted(out)
