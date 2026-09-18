"""
nightmare_theme — боевая тема в духе Toby Fox «Your Best Nightmare» (Omega Flowey): напряжённая, ритмичная,
с акцентом на ударные. Пульсирующий бас, стабы органа на офф-битах, маниакальные шестнадцатые клавесина,
чиптюн-лид с тритонами и хроматикой, медные стабы, хор в брейкдауне; барабаны — сдвоенный тресильо
3-3-2 в бочке, призрачные ноты малого, сбивки томами перед сменой секций, дробь малого перед кульминацией.

32 такта, 4/4, d-moll, 156 BPM. Секции по 8 тактов:
A (1–8)   — барабаны с первого такта, бас, клавесин, стабы органа; лид только «смех» — хроматические спуски в 5 и 7.
B (9–16)  — мелодия лида целиком, медные стабы на 1 и 2.5, сбивка томами в 16-м.
C (17–24) — брейкдаун: хаф-тайм, орган спускается хроматикой над педалью D, потом доминантовый педаль A,
            дробь малого крещендо и хроматический взлёт лида в 24-м.
D (25–32) — кульминация: хай-хэт шестнадцатыми, бочка чаще, медные отвечают лиду, хор держит низ;
            последний такт — сбивка, луп замыкается в 1-й такт.
Гармония (по 8 тактов, A/B/D): Dm · Bb · Gm · C#dim7 · Dm · Eb (неаполитанский) · G#dim (тритон к D) · A7.
"""
from midi import Tracks, add, n

NAME = "nightmare_theme"
BPM = 156
BEATS_PER_BAR = 4
KEY, KEY_SHARPS, MINOR = "D minor", -1, True

# ---------------------------------------------------------------------------
# Гармония — 8 тактов, играется в секциях A, B, D.
#   bass  — тон баса (пульс восьмыми: тоника, тоника, октава…)
#   organ — стабы органа (низко-средний регистр)
#   harp  — 4 ноты клавесина для шестнадцатых (тесное расположение, вверх-вниз)
#   brass — 3 ноты медных стабов
#   choir — 3 ноты хора (только D)
# ---------------------------------------------------------------------------
CHORDS = [
    dict(name="Dm",     bass="D2",  organ=["D3", "F3", "A3"],    harp=["D4", "F4", "A4", "D5"],
         brass=["A3", "D4", "F4"],  choir=["D3", "A3", "F4"]),
    dict(name="Bb",     bass="Bb1", organ=["Bb2", "D3", "F3"],   harp=["D4", "F4", "Bb4", "D5"],
         brass=["Bb3", "D4", "F4"], choir=["Bb2", "F3", "D4"]),
    dict(name="Gm",     bass="G2",  organ=["G3", "Bb3", "D4"],   harp=["D4", "G4", "Bb4", "D5"],
         brass=["Bb3", "D4", "G4"], choir=["G3", "D4", "Bb4"]),
    dict(name="C#dim7", bass="C#2", organ=["C#3", "E3", "G3"],   harp=["C#4", "E4", "G4", "Bb4"],
         brass=["G3", "Bb3", "E4"], choir=["C#3", "G3", "E4"]),
    dict(name="Dm",     bass="D2",  organ=["D3", "F3", "A3"],    harp=["D4", "F4", "A4", "D5"],
         brass=["A3", "D4", "F4"],  choir=["D3", "A3", "F4"]),
    dict(name="Eb",     bass="Eb2", organ=["Eb3", "G3", "Bb3"],  harp=["Eb4", "G4", "Bb4", "Eb5"],
         brass=["Bb3", "Eb4", "G4"], choir=["Eb3", "Bb3", "G4"]),
    dict(name="G#dim",  bass="G#2", organ=["G#3", "B3", "D4"],   harp=["D4", "F4", "G#4", "B4"],
         brass=["B3", "D4", "G#4"], choir=["G#3", "D4", "B4"]),
    dict(name="A7",     bass="A2",  organ=["A2", "C#3", "G3"],   harp=["C#4", "E4", "G4", "A4"],
         brass=["G3", "C#4", "E4"], choir=["A2", "E3", "C#4"]),
]
SECTIONS = 4
BARS = len(CHORDS) * SECTIONS
CHORD_NAMES = ([c["name"] for c in CHORDS] * 2
               + ["Dm", "Dm/C#", "Dm/C", "D/F#"] + ["A7"] * 4
               + [c["name"] for c in CHORDS])

# Лид: (нота, старт в долях от начала такта, длительность). Секция B = основная мелодия, D — она же с ответами медных.
LEAD_B = [
    [("D5", 0, 0.5), ("D5", 0.5, 0.5), ("F5", 1, 0.5), ("A5", 1.5, 0.5), ("G#5", 2, 1), ("A5", 3, 0.5), ("F5", 3.5, 0.5)],
    [("D5", 0, 1), ("C5", 1, 0.5), ("Bb4", 1.5, 0.5), ("A4", 2, 0.5), ("Bb4", 2.5, 0.5), ("D5", 3, 1)],
    [("G5", 0, 0.5), ("G5", 0.5, 0.5), ("Bb5", 1, 0.5), ("D6", 1.5, 0.5), ("C#6", 2, 1), ("D6", 3, 0.5), ("Bb5", 3.5, 0.5)],
    [("A5", 0, 0.5), ("G5", 0.5, 0.5), ("E5", 1, 0.5), ("C#5", 1.5, 0.5), ("E5", 2, 0.5), ("G5", 2.5, 0.5),
     ("Bb5", 3, 0.5), ("C#6", 3.5, 0.5)],
    [("D6", 0, 1.5), ("A5", 1.5, 0.5), ("F5", 2, 0.5), ("D5", 2.5, 0.5), ("F5", 3, 0.5), ("A5", 3.5, 0.5)],
    [("Eb5", 0, 0.5), ("Eb5", 0.5, 0.5), ("G5", 1, 0.5), ("Bb5", 1.5, 0.5), ("A5", 2, 0.5), ("G5", 2.5, 0.5),
     ("F5", 3, 0.5), ("Eb5", 3.5, 0.5)],
    [("G#5", 0, 0.5), ("B5", 0.5, 0.5), ("D6", 1, 0.5), ("F6", 1.5, 0.5), ("D6", 2, 0.5), ("B5", 2.5, 0.5), ("G#5", 3, 1)],
    [("A5", 0, 0.5), ("G5", 0.5, 0.5), ("E5", 1, 0.5), ("C#5", 1.5, 0.5), ("E5", 2, 0.5), ("G5", 2.5, 0.5),
     ("A5", 3, 0.5), ("C#6", 3.5, 0.5)],
]
# «Смех» в секции A: хроматические спуски восьмыми (такты 5 и 7 гармонии), остальное — тишина.
LEAD_A = {
    4: [("A5", 0, 0.5), ("G#5", 0.5, 0.5), ("G5", 1, 0.5), ("F#5", 1.5, 0.5), ("F5", 2, 0.5), ("E5", 2.5, 0.5),
        ("Eb5", 3, 0.5), ("D5", 3.5, 0.5)],
    6: [("D6", 0, 0.5), ("C#6", 0.5, 0.5), ("C6", 1, 0.5), ("B5", 1.5, 0.5), ("Bb5", 2, 0.5), ("A5", 2.5, 0.5),
        ("G#5", 3, 1)],
}
# Брейкдаун C (такты 17–20): орган — педаль D и хроматический спуск верхнего голоса A–G#–G–F#.
BREAK_ORGAN = [["D3", "F4", "A4"], ["D3", "E4", "G#4"], ["D3", "D4", "G4"], ["D3", "C4", "F#4"]]
# Хроматический взлёт лида в 24-м такте, шестнадцатыми: E5 → D6 (луп/кульминация начинаются с D6).
CLIMB = ["E5", "F5", "F#5", "G5", "G#5", "A5", "Bb5", "B5", "C6", "C#6", "D6", "C#6", "D6", "A5", "C#6", "D6"]

# GM-ударные (канал 10)
KICK, SNARE, HH, HH_OPEN, CRASH, RIDE = 36, 38, 42, 46, 49, 51
TOM_HI, TOM_MID, TOM_LO, TOM_FLOOR = 50, 47, 45, 41

# Треки: имя → (MIDI-канал, GM-программа). Ударные — канал 10 (индекс 9).
TRACKS = {
    "organ": (0, 19),   # Church Organ
    "harp":  (1, 6),    # Harpsichord
    "lead":  (2, 80),   # Lead 1 (square) — чиптюн
    "brass": (3, 61),   # Brass Section
    "bass":  (4, 38),   # Synth Bass 1
    "choir": (5, 52),   # Choir Aahs
    "drums": (9, 0),    # Standard Kit
}


def drum(tracks: Tracks, note: int, t: float, vel: float, dur: float = 0.25) -> None:
    add(tracks, "drums", note, t, dur, vel)


def drums_full(tracks: Tracks, t0: float, intense: bool) -> None:
    """Основной грув: бочка 3-3-2 × 2 (шестнадцатые 0,3,6 · 8,11,14), малый на 2 и 4 + призраки, хэт."""
    for s in (0, 3, 6, 8, 11, 14):
        drum(tracks, KICK, t0 + s / 4, 0.95 if s in (0, 8) else 0.85)
    drum(tracks, SNARE, t0 + 1, 0.92)
    drum(tracks, SNARE, t0 + 3, 0.92)
    drum(tracks, SNARE, t0 + 1.75, 0.38)   # призрачные ноты
    drum(tracks, SNARE, t0 + 3.75, 0.42)
    if intense:
        for s in range(16):
            drum(tracks, HH, t0 + s / 4, 0.55 if s % 4 == 0 else (0.42 if s % 2 == 0 else 0.3), 0.2)
        drum(tracks, HH_OPEN, t0 + 3.5, 0.6, 0.4)
    else:
        for s in range(8):
            drum(tracks, HH, t0 + s / 2, 0.55 if s % 2 == 0 else 0.4, 0.3)
        drum(tracks, HH_OPEN, t0 + 3.5, 0.55, 0.4)


def drums_half(tracks: Tracks, t0: float) -> None:
    """Хаф-тайм брейкдауна: бочка на 1 и 2.5, малый на 3, райд четвертями."""
    drum(tracks, KICK, t0, 0.95)
    drum(tracks, KICK, t0 + 2.5, 0.8)
    drum(tracks, SNARE, t0 + 2, 0.9)
    for b in range(4):
        drum(tracks, RIDE, t0 + b, 0.5 if b % 2 == 0 else 0.4, 0.5)


def tom_fill(tracks: Tracks, t0: float) -> None:
    """Сбивка томами на последних двух долях такта: hi-mid-lo-floor шестнадцатыми, финал — малый+бочка."""
    order = [TOM_HI, TOM_HI, TOM_MID, TOM_MID, TOM_LO, TOM_LO, TOM_FLOOR, TOM_FLOOR]
    for k, note in enumerate(order):
        drum(tracks, note, t0 + 2 + k / 4, 0.75 + 0.03 * k)
    drum(tracks, KICK, t0 + 3.75, 0.9)


def snare_roll(tracks: Tracks, t0: float, bars: int) -> None:
    """Дробь малого шестнадцатыми с крещендо, бочка четвертями; на последней доле — томы вниз."""
    total = bars * 16
    for s in range(total):
        vel = 0.35 + 0.55 * s / total
        drum(tracks, SNARE, t0 + s / 4, min(vel, 0.9), 0.2)
        if s % 4 == 0:
            drum(tracks, KICK, t0 + s / 4, 0.85)
    for k, note in enumerate([TOM_HI, TOM_MID, TOM_LO, TOM_FLOOR]):
        drum(tracks, note, t0 + bars * 4 - 1 + k / 4, 0.85)


def bass_pulse(tracks: Tracks, t0: float, root: int, next_root: int | None) -> None:
    """Бас восьмыми: тоника с октавными вскриками на 3-й и 6-й восьмых; последняя — хроматический подход к
    следующему корню, если он в пределах тона."""
    pattern = [0, 0, 12, 0, 0, 12, 0, 0]
    for k, off in enumerate(pattern):
        note = root + off
        if k == 7 and next_root is not None and 0 < abs(next_root - root) <= 2:
            note = next_root - 1 if next_root > root else next_root + 1
        vel = 0.9 if k in (0, 3, 6) else (0.7 if off == 12 else 0.78)
        add(tracks, "bass", note, t0 + k * 0.5, 0.45, vel)


def lead_velocity(start: float, dur: float) -> float:
    v = 0.78 if start % 1 == 0 else 0.7
    if dur >= 1:
        v += 0.06
    return min(v, 0.9)


def build() -> Tracks:
    tracks: Tracks = {k: [] for k in TRACKS}

    for section in range(SECTIONS):
        for i in range(len(CHORDS)):
            bar = section * len(CHORDS) + i
            t0 = bar * BEATS_PER_BAR
            ch = CHORDS[i]
            nxt = CHORDS[(i + 1) % len(CHORDS)]
            last_in_section = i == len(CHORDS) - 1

            # ---------------- C: брейкдаун ----------------
            if section == 2:
                if i < 4:
                    drums_half(tracks, t0)
                    add(tracks, "bass", n("D2"), t0, 3.8, 0.8)
                    # педали (D3 органа, квинта хора) — одной нотой на 4 такта: одинаковые ноты внахлёст FL при
                    # импорте склеивает в одну длинную + огрызки, поэтому повторов одной высоты подряд не делаем
                    if i == 0:
                        add(tracks, "organ", n("D3"), t0, 16.0, 0.6)
                        for v in ["D3", "A3"]:   # хор держит пустую квинту — хроматика органа поверх остаётся чистой
                            add(tracks, "choir", n(v), t0, 16.0, 0.45)
                    for v in BREAK_ORGAN[i][1:]:
                        add(tracks, "organ", n(v), t0, 4.1, 0.6)
                else:
                    if i == 4:
                        drum(tracks, CRASH, t0, 0.85, 1)
                    if i < 6:
                        drums_half(tracks, t0)
                    else:
                        snare_roll(tracks, t0, 1)
                    # доминантовый педаль A: бас восьмыми, орган и хор держат A7
                    for k in range(8):
                        add(tracks, "bass", n("A2") + (12 if k in (2, 5) else 0), t0 + k * 0.5, 0.45,
                            0.8 + 0.02 * (i - 4))
                    if i == 4:   # A7 держится все 4 такта одной нотой на голос (см. выше про склейку)
                        for v in ["A2", "C#3", "G3", "E4"]:
                            add(tracks, "organ", n(v), t0, 16.0, 0.7)
                        for v in ["A2", "E3", "C#4"]:
                            add(tracks, "choir", n(v), t0, 16.0, 0.5)
                    if i == 7:
                        for k, v in enumerate(CLIMB):
                            add(tracks, "lead", n(v), t0 + k * 0.25, 0.22, 0.6 + 0.02 * k)
                    elif i == 6:
                        for k in range(8):   # лид трепещет на тритоне D–G# перед взлётом
                            add(tracks, "lead", n("G#5") if k % 2 else n("D5"), t0 + k * 0.5, 0.2, 0.62)
                continue

            # ---------------- A / B / D ----------------
            intense = section == 3
            if i == 0 or (intense and i == 4):
                drum(tracks, CRASH, t0, 0.9, 1)
            if last_in_section:
                # первые две доли — грув, потом сбивка
                for s in (0, 3, 6):
                    drum(tracks, KICK, t0 + s / 4, 0.9)
                drum(tracks, SNARE, t0 + 1, 0.92)
                for s in range(4):
                    drum(tracks, HH, t0 + s / 2, 0.5, 0.3)
                tom_fill(tracks, t0)
            else:
                drums_full(tracks, t0, intense)

            bass_pulse(tracks, t0, n(ch["bass"]), n(nxt["bass"]))

            # орган: стабы на офф-битах (A, B); в D — на каждой доле, длиннее
            if intense:
                for b in range(4):
                    for v in ch["organ"]:
                        add(tracks, "organ", n(v), t0 + b, 0.7, 0.68 if b % 2 == 0 else 0.6)
            else:
                for b in range(4):
                    for v in ch["organ"]:
                        add(tracks, "organ", n(v), t0 + b + 0.5, 0.3, 0.62)

            # клавесин: шестнадцатые вверх-вниз по 4 нотам аккорда (в A — тише, в D — громче)
            pattern = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3]
            base_vel = 0.5 if section == 0 else (0.56 if section == 1 else 0.62)
            for k, idx in enumerate(pattern):
                vel = base_vel + (0.08 if k % 4 == 0 else 0)
                add(tracks, "harp", n(ch["harp"][idx]), t0 + k * 0.25, 0.22, vel)

            # лид
            if section == 0:
                for name, start, dur in LEAD_A.get(i, []):
                    add(tracks, "lead", n(name), t0 + start, dur * 0.9, lead_velocity(start, dur) - 0.08)
            else:
                for name, start, dur in LEAD_B[i]:
                    add(tracks, "lead", n(name), t0 + start, dur * 0.9, lead_velocity(start, dur) + (0.04 if intense else 0))

            # медные: стабы на 1 и 2.5 (B, D); в D ещё ответ на 3.5
            if section >= 1:
                hits = [(0, 0.4, 0.85), (2.5, 0.3, 0.75)] + ([(3.5, 0.25, 0.7)] if intense else [])
                for start, dur, vel in hits:
                    for v in ch["brass"]:
                        add(tracks, "brass", n(v), t0 + start, dur, vel)

            # хор: в D держит аккорд весь такт
            if intense:
                for v in ch["choir"]:
                    add(tracks, "choir", n(v), t0, 4.1, 0.5)

    return tracks
