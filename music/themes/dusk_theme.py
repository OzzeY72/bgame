"""
dusk_theme — вторая тема, меланхоличная, bitter-sweet. Пад в духе synthwave (Kyle Dixon & Michael Stein —
«Kids», «The First I Love You»): тёплый аналоговый пад + тихое восьмое арпеджио, поверх — одинокое пиано.

16 тактов, 4/4, h-moll (параллель D-dur главной темы — переходы между темами в игре будут мягкими), 78 BPM.
Такты 1–8  — «печаль»: бас спускается B–A–G–F#, пад — по одной ноте с паузами, арп с первого такта,
             пиано одно ведёт мелодию, гитары нет.
Такты 9–16 — «просвет»: гармония уходит в D-dur (цитата начала главной темы: D–C#–B–G), пад переходит
             на аккорды, бас — на пульс восьмыми, входит стром гитары, bells тихо дублируют долгие ноты.
Возврат в h-moll на F#m7 в 16-м такте — без вводного тона, модально, как у Dixon & Stein.
"""
from midi import Tracks, add, n

NAME = "dusk_theme"
BPM = 78
BEATS_PER_BAR = 4
KEY, KEY_SHARPS, MINOR = "B minor", 2, True

# ---------------------------------------------------------------------------
# По такту. Поля-списки делят такт на равные части (1 элемент = весь такт, 2 = по половине).
#   bass — нота баса (такты 1–8 тянется, 9–16 пульсирует восьмыми)
#   pad  — такты 1–8: одна нота с паузой; 9–16: аккорд внахлёст
#   arp  — 4 ноты синт-арпеджио (5-8-10-12), рисунок 1-2-3-4-3-2-1-2 восьмыми
#   gtr  — 4 ноты строма гитары (только 9–16), None — гитара молчит
# ---------------------------------------------------------------------------
BARS_DEF = [
    # --- A: h-moll, lament-бас ---
    dict(name="Bm(add9)", bass=["B2"],  pad=[["F#4"]],          arp=[["F#3", "B3", "D4", "F#4"]],  gtr=None),
    dict(name="Bm/A",     bass=["A2"],  pad=[["D4"]],           arp=[["F#3", "A3", "D4", "F#4"]],  gtr=None),
    dict(name="Gmaj7",    bass=["G2"],  pad=[["B3"]],           arp=[["G3", "B3", "D4", "F#4"]],   gtr=None),
    dict(name="D/F#",     bass=["F#2"], pad=[["A3"]],           arp=[["F#3", "A3", "D4", "F#4"]],  gtr=None),
    dict(name="Em7",      bass=["E2"],  pad=[["G4"]],           arp=[["E3", "G3", "B3", "D4"]],    gtr=None),
    dict(name="Gmaj7",    bass=["G2"],  pad=[["F#4"]],          arp=[["G3", "B3", "D4", "F#4"]],   gtr=None),
    dict(name="Asus4→A",  bass=["A2"],  pad=[["D4"], ["C#4"]],
         arp=[["E3", "A3", "D4", "E4"], ["E3", "A3", "C#4", "E4"]], gtr=None),
    dict(name="F#m7",     bass=["F#2"], pad=[["C#4"]],          arp=[["F#3", "A3", "C#4", "E4"]],  gtr=None),
    # --- B: просвет в D-dur ---
    dict(name="Dadd9",    bass=["D2"],  pad=[["A3", "D4", "E4", "F#4"]], arp=[["F#3", "A3", "D4", "E4"]],
         gtr=[["A3", "D4", "F#4", "A4"]]),
    dict(name="A/C#",     bass=["C#2"], pad=[["A3", "B3", "C#4", "E4"]], arp=[["E3", "A3", "C#4", "E4"]],
         gtr=[["A3", "C#4", "E4", "A4"]]),
    dict(name="Bm7",      bass=["B1"],  pad=[["F#3", "A3", "D4", "F#4"]], arp=[["F#3", "B3", "D4", "F#4"]],
         gtr=[["F#3", "B3", "D4", "F#4"]]),
    dict(name="Gmaj7",    bass=["G2"],  pad=[["G3", "B3", "D4", "F#4"]], arp=[["G3", "B3", "D4", "F#4"]],
         gtr=[["G3", "B3", "D4", "F#4"]]),
    dict(name="Em7",      bass=["E2"],  pad=[["E3", "G3", "B3", "D4"]],  arp=[["E3", "G3", "B3", "D4"]],
         gtr=[["E3", "G3", "B3", "D4"]]),
    dict(name="Gmaj9",    bass=["G2"],  pad=[["G3", "B3", "F#4", "A4"]], arp=[["G3", "B3", "D4", "F#4"]],
         gtr=[["G3", "B3", "D4", "F#4"]]),
    dict(name="Asus4→A",  bass=["A2"],  pad=[["E3", "A3", "D4", "E4"], ["E3", "A3", "C#4", "E4"]],
         arp=[["E3", "A3", "D4", "E4"], ["E3", "A3", "C#4", "E4"]],
         gtr=[["A3", "D4", "E4", "A4"], ["A3", "C#4", "E4", "A4"]]),
    dict(name="F#m7",     bass=["F#2"], pad=[["F#3", "A3", "C#4", "E4"]], arp=[["F#3", "A3", "C#4", "E4"]],
         gtr=[["F#3", "A3", "C#4", "E4"]]),
]
BARS = len(BARS_DEF)
CHORD_NAMES = [c["name"] for c in BARS_DEF]

# Мелодия пиано: (нота, старт в долях от начала такта, длительность). Мотив — «вздох» D–C#–B и ответ вверх.
MELODY = [
    # A
    [("D5", 0, 1.5), ("C#5", 1.5, 0.5), ("B4", 2, 2)],
    [("F#5", 1, 1), ("E5", 2, 0.5), ("D5", 2.5, 1.5)],
    [("D5", 0, 2), ("E5", 2, 1), ("F#5", 3, 1)],
    [("A5", 0, 3), ("F#5", 3, 1)],
    [("G5", 0, 2), ("F#5", 2, 1), ("E5", 3, 1)],
    [("D5", 0, 3), ("B4", 3, 1)],
    [("D5", 0, 2), ("C#5", 2, 2)],
    [("E5", 0, 1.5), ("C#5", 1.5, 0.5), ("A4", 2, 1), ("C#5", 3, 1)],
    # B
    [("F#5", 0, 2), ("A5", 2, 1), ("B5", 3, 1)],
    [("B5", 0, 1), ("A5", 1, 2), ("E5", 3, 1)],
    [("F#5", 0, 1.5), ("D5", 1.5, 0.5), ("C#5", 2, 1), ("D5", 3, 1)],
    [("E5", 0, 2), ("D5", 2, 1), ("B4", 3, 1)],
    [("G5", 0, 1.5), ("F#5", 1.5, 0.5), ("E5", 2, 2)],
    [("D5", 0, 1), ("E5", 1, 1), ("F#5", 2, 2)],
    [("E5", 0, 2), ("C#5", 2, 2)],
    [("C#5", 0, 4)],
]

TRACKS = {
    "pad":    (0, 90),  # Pad 3 (polysynth) — для превью; в FL — аналоговый пад, см. README §3.7
    "arp":    (5, 81),  # Lead 2 (sawtooth), короткие ноты — в FL 3xOsc-плак, README §3.8
    "piano":  (1, 0),   # Acoustic Grand
    "guitar": (2, 24),  # Nylon guitar
    "bass":   (3, 38),  # Synth Bass 1 — или тот же бас, что в home_theme
    "bells":  (4, 10),  # Music box
}


def melody_velocity(start: float, dur: float, section: int) -> float:
    v = 0.66 + 0.05 * section
    if start == 0:
        v += 0.06
    elif start % 1 == 0:
        v += 0.02
    else:
        v -= 0.04
    if dur >= 2:
        v += 0.04
    return min(v, 0.88)


def build() -> Tracks:
    tracks: Tracks = {k: [] for k in TRACKS}

    for i, ch in enumerate(BARS_DEF):
        section = i // 8
        t0 = i * BEATS_PER_BAR

        # Пад: A — одна нота, пауза 0.6 доли; B — аккорд внахлёст 0.15
        seg = BEATS_PER_BAR / len(ch["pad"])
        for h, voices in enumerate(ch["pad"]):
            for v in voices:
                if section == 0:
                    add(tracks, "pad", n(v), t0 + h * seg, seg - 0.6, 0.45)
                else:
                    add(tracks, "pad", n(v), t0 + h * seg, seg + 0.15, 0.50)

        # Арп: восьмыми, 1-2-3-4-3-2-1-2, с первого такта; в B чуть громче
        seg = BEATS_PER_BAR / len(ch["arp"])
        for h, notes in enumerate(ch["arp"]):
            pattern = [0, 1, 2, 3, 2, 1, 0, 1][: int(seg * 2)]
            for k, idx in enumerate(pattern):
                vel = (0.46 if k % 2 == 0 else 0.40) + 0.04 * section
                add(tracks, "arp", n(notes[idx]), t0 + h * seg + k * 0.5, 0.45, vel)

        # Бас: A — тянется; B — пульс восьмыми (synthwave), акцент на долю
        seg = BEATS_PER_BAR / len(ch["bass"])
        for h, v in enumerate(ch["bass"]):
            if section == 0:
                add(tracks, "bass", n(v), t0 + h * seg, seg - 0.2, 0.58)
            else:
                for k in range(int(seg * 2)):
                    add(tracks, "bass", n(v), t0 + h * seg + k * 0.5, 0.42, 0.60 if k % 2 == 0 else 0.48)

        # Пиано — только мелодия, одним голосом
        for name, start, dur in MELODY[i]:
            add(tracks, "piano", n(name), t0 + start, dur, melody_velocity(start, dur, section))

        # Гитара: стром 4 нот с разбегом 40 мс на каждую часть такта (только B)
        if ch["gtr"]:
            seg = BEATS_PER_BAR / len(ch["gtr"])
            for h, notes in enumerate(ch["gtr"]):
                for k, v in enumerate(notes):
                    add(tracks, "guitar", n(v), t0 + h * seg + k * 0.04, seg - 0.3 - k * 0.04, 0.40 - k * 0.02)

        # Bells: в B тихо дублируют долгие ноты мелодии октавой выше
        if section == 1:
            for name, start, dur in MELODY[i]:
                if dur >= 2:
                    add(tracks, "bells", n(name) + 12, t0 + start, dur, 0.30)

    return tracks
