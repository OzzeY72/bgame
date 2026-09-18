"""
home_theme — главная тема (двор). Светлая, воздушная, «небесная».

16 тактов, 4/4, D-dur, 84 BPM. Гармония из 8 тактов играется дважды:
такты 1–8 — мелодия + одиночные ноты пада с паузами + редкая левая рука + мягкий стром гитары,
такты 9–16 — та же гармония, мелодия с кульминацией (13-й такт), пад переходит на аккорды,
гитара — на арпеджио, последние 4 такта дублирует music box октавой выше.
Луп бесшовный (последняя нота ведёт в первую).
"""
from midi import Tracks, add, n

NAME = "home_theme"
BPM = 84
BEATS_PER_BAR = 4
KEY, KEY_SHARPS, MINOR = "D major", 2, False

# ---------------------------------------------------------------------------
# Гармония — 8 тактов. Поля-списки делят такт на равные части (1 элемент = весь такт, 2 = по половине).
#   bass — нота баса
#   tone — одиночная нота пада для тактов 1–8 (тянется с паузой в конце — так тише и воздушнее)
#   pad  — голоса пада для тактов 9–16 (тянутся всю часть, чуть внахлёст)
#   lh   — левая рука пиано: (нота на 1-ю долю, нота на 3-ю долю), по половине такта каждая
#   arp  — 5 нот гитары: в тактах 1–8 стром по первым четырём, в 9–16 арпеджио 1-2-3-4-5-4-3-2 восьмыми
# ---------------------------------------------------------------------------
CHORDS = [
    dict(name="Dmaj7",    bass=["D2"],        tone=[["F#4"]],        pad=[["A3", "C#4", "F#4", "A4"]],
         lh=("D3", "A3"),  arp=[["F#4", "A4", "C#5", "E5", "F#5"]]),   # гитара — Dmaj9 без тоники
    dict(name="A/C#",     bass=["C#2"],       tone=[["E4"]],         pad=[["A3", "B3", "C#4", "E4"]],
         lh=("C#3", "E3"), arp=[["C#4", "E4", "A4", "B4", "C#5"]]),
    dict(name="Bm7",      bass=["B1"],        tone=[["D4"]],         pad=[["A3", "B3", "D4", "F#4"]],
         lh=("B2", "F#3"), arp=[["B3", "D4", "F#4", "A4", "B4"]]),
    dict(name="Gadd9",    bass=["G2"],        tone=[["B3"]],         pad=[["G3", "B3", "D4", "A4"]],
         lh=("G3", "D4"),  arp=[["G3", "B3", "D4", "A4", "B4"]]),
    dict(name="D/F#",     bass=["F#2"],       tone=[["A3"]],         pad=[["A3", "D4", "F#4", "A4"]],
         lh=("F#3", "A3"), arp=[["A3", "D4", "F#4", "A4", "D5"]]),
    dict(name="Gadd9",    bass=["G2"],        tone=[["B3"]],         pad=[["G3", "D4", "A4", "B4"]],
         lh=("G3", "B3"),  arp=[["G3", "B3", "D4", "A4", "D5"]]),
    dict(name="Asus4→A",  bass=["A2"],        tone=[["D4"], ["C#4"]],
         pad=[["A3", "D4", "E4", "A4"], ["A3", "C#4", "E4", "A4"]],
         lh=("A3", "E4"),  arp=[["A3", "D4", "E4", "A4", "D5"], ["A3", "C#4", "E4", "A4", "C#5"]]),
    dict(name="Em7→A7",   bass=["E2", "A2"],  tone=[["E4"]],
         pad=[["E3", "G3", "B3", "D4"], ["A3", "C#4", "E4", "G4"]],
         lh=("E3", "A3"),  arp=[["E3", "G3", "B3", "D4", "E4"], ["A3", "C#4", "E4", "G4", "A4"]]),
]
BARS = len(CHORDS) * 2
CHORD_NAMES = [c["name"] for c in CHORDS]

# Мелодия пиано (правая рука): (нота, старт в долях от начала такта, длительность в долях)
MELODY_A = [  # такты 1–8 — тема
    [("F#5", 0, 1.5), ("A5", 1.5, 0.5), ("B5", 2, 2)],
    [("A5", 0, 3), ("E5", 3, 1)],
    [("F#5", 0, 1.5), ("A5", 1.5, 0.5), ("F#5", 2, 1), ("D5", 3, 1)],
    [("E5", 0, 3), ("F#5", 3, 1)],
    [("A5", 0, 1.5), ("B5", 1.5, 0.5), ("A5", 2, 1), ("F#5", 3, 1)],
    [("G5", 0, 2), ("F#5", 2, 1), ("E5", 3, 1)],
    [("D5", 0, 2), ("C#5", 2, 2)],
    [("E5", 0, 1.5), ("D5", 1.5, 0.5), ("C#5", 2, 1), ("E5", 3, 1)],
]
MELODY_B = [  # такты 9–16 — вариация, кульминация (D6) в 13-м такте
    [("F#5", 0, 1.5), ("A5", 1.5, 0.5), ("B5", 2, 2)],
    [("A5", 0, 2), ("B5", 2, 1), ("A5", 3, 0.5), ("E5", 3.5, 0.5)],
    [("F#5", 0, 1.5), ("A5", 1.5, 0.5), ("B5", 2, 1), ("A5", 3, 1)],
    [("G5", 0, 2), ("F#5", 2, 1), ("E5", 3, 1)],
    [("A5", 0, 1.5), ("B5", 1.5, 0.5), ("D6", 2, 2)],
    [("B5", 0, 2), ("A5", 2, 1), ("G5", 3, 1)],
    [("E5", 0, 1), ("D5", 1, 1), ("C#5", 2, 2)],
    [("E5", 0, 1.5), ("D5", 1.5, 0.5), ("C#5", 2, 1), ("E5", 3, 1)],
]

# Треки: имя → (MIDI-канал, GM-программа для превью в обычном плеере)
TRACKS = {
    "pad":    (0, 53),  # Voice Oohs — так пад звучал лучше всего
    "piano":  (1, 0),   # Acoustic Grand
    "guitar": (2, 24),  # Nylon guitar
    "bass":   (3, 32),  # Acoustic bass
    "bells":  (4, 10),  # Music box
}


def melody_velocity(start: float, dur: float, section: int) -> float:
    v = 0.70 + 0.04 * section
    if start == 0:
        v += 0.06          # сильная доля
    elif start % 1 == 0:
        v += 0.02
    else:
        v -= 0.04          # затакт/восьмая — тише
    if dur >= 2:
        v += 0.04          # долгие ноты чуть громче — они «поют»
    return min(v, 0.9)


def build() -> Tracks:
    tracks: Tracks = {k: [] for k in TRACKS}

    for section in range(2):
        melody = MELODY_A if section == 0 else MELODY_B
        for i, ch in enumerate(CHORDS):
            bar = section * len(CHORDS) + i
            t0 = bar * BEATS_PER_BAR

            # Пад: 1–8 — одна нота с паузой 0.6 доли в конце; 9–16 — аккорды внахлёст на 0.15 (легато)
            voicings = ch["tone"] if section == 0 else ch["pad"]
            seg = BEATS_PER_BAR / len(voicings)
            for h, voices in enumerate(voicings):
                for v in voices:
                    if section == 0:
                        add(tracks, "pad", n(v), t0 + h * seg, seg - 0.6, 0.50)
                    else:
                        add(tracks, "pad", n(v), t0 + h * seg, seg + 0.15, 0.55)

            # Бас: одна нота на часть такта, с небольшим зазором
            seg = BEATS_PER_BAR / len(ch["bass"])
            for h, v in enumerate(ch["bass"]):
                add(tracks, "bass", n(v), t0 + h * seg, seg - 0.1, 0.60)

            # Пиано, левая рука: две половинные ноты
            a, b = ch["lh"]
            add(tracks, "piano", n(a), t0, 2.0, 0.45 + 0.05 * section)
            add(tracks, "piano", n(b), t0 + 2, 2.0, 0.42 + 0.05 * section)

            # Пиано, мелодия
            for name, start, dur in melody[i]:
                add(tracks, "piano", n(name), t0 + start, dur, melody_velocity(start, dur, section))

            # Гитара
            seg = BEATS_PER_BAR / len(ch["arp"])
            for h, notes in enumerate(ch["arp"]):
                ts = t0 + h * seg
                if section == 0:
                    # мягкий стром: 4 ноты с разбегом 40 мс, тянутся почти всю часть
                    for k, v in enumerate(notes[:4]):
                        add(tracks, "guitar", n(v), ts + k * 0.04, seg - 0.2 - k * 0.04, 0.42 - k * 0.02)
                else:
                    # арпеджио восьмыми вверх-вниз
                    pattern = [0, 1, 2, 3, 4, 3, 2, 1][: int(seg * 2)]
                    for k, idx in enumerate(pattern):
                        vel = 0.56 if k == 0 else (0.52 if k % 2 == 0 else 0.46)
                        add(tracks, "guitar", n(notes[idx]), ts + k * 0.5, 0.55, vel)

            # Music box: последние 4 такта дублирует мелодию октавой выше (только ноты от 1 доли)
            if section == 1 and i >= 4:
                for name, start, dur in melody[i]:
                    if dur >= 1:
                        add(tracks, "bells", n(name) + 12, t0 + start, dur, 0.35)

    return tracks
