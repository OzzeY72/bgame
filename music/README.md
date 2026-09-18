# music/ — фоновая музыка для bgame (FL Studio)

Подпроект: тихие лупы в духе Stardew Valley и Undertale (*Snowy*, *Home*, *Memory*) — пиано-мелодия
поверх тянущегося синт-струнного пада, мягкая гитара/плак, где-то на краю — music box.

```
music/
  compose.py          CLI: python music/compose.py [тема] → <тема>.mid + <тема>.json, проверка голосоведения
  midi.py             общее: нотация, запись SMF, экспорт JSON, поиск малых секунд/нон
  fl_dump.py          снять ноты из открытого проекта FL в .mid/.json (штатный экспорт MIDI для FLEX-каналов пуст, см. §4)
  themes/
    home_theme.py     главная тема (двор) — светлая, воздушная
    dusk_theme.py     вторая тема — меланхоличная, bitter-sweet, synthwave-пад
    nightmare_theme.py боевая тема — Toby Fox «Your Best Nightmare»: орган, клавесин, чиптюн-лид, медь, ударные
  home_theme.mid/json, dusk_theme.mid/json, nightmare_theme.mid/json — результат (5–7 треков; .json — для fl-mcp)
  home_theme_2.mid/json — снимок правок главной темы из FL (2026-09-17): пад только в 9–16, легато
  dusk_theme2.mid/json/flp — снимок правок второй темы из FL (2026-09-18): пад легато, арп только с 8-го такта
  В игре (src/data/music.ts): home → home_theme_2, dusk/sky → dusk_theme2, sewer → nightmare_theme
  nightmare_theme.flp   — проект FL боевой темы (Trial: сохраняется, но открыть его сможет только купленная редакция;
                          ноты в нём = nightmare_theme.mid/json, инструменты — FLEX GM, см. §1.2)
  README.md           этот файл: инструменты, настройки, порядок работы
```

```bash
python music/compose.py             # перегенерировать все темы после правок нот
python music/compose.py dusk_theme  # одну
```

Нотация в `themes/*.py` научная (C4 = MIDI 60). **FL Studio подписывает ту же клавишу как C5** — в piano roll
всё будет выглядеть на октаву «выше», это нормально.

---

## 1. Тестовая тема `home_theme` — что это

| | |
|---|---|
| Темп / размер | **84 BPM, 4/4** |
| Тональность | **D-dur** (2 диеза) |
| Форма | 16 тактов = 45.7 с, бесшовный луп (последняя нота ведёт в первую) |
| Гармония (8 тактов ×2) | Dmaj7 · A/C# · Bm7 · Gadd9 · D/F# · Gadd9 · Asus4→A · Em7→A7 |
| Такты 1–8 | мелодия + пад по одной ноте с паузами + редкая левая рука + мягкий стром гитары |
| Такты 9–16 | та же гармония, мелодия с кульминацией (D6 в 13-м такте), пад — аккорды, гитара — арпеджио восьмыми, в 13–16 music box дублирует мелодию октавой выше |

Почему так: нисходящий бас D–C#–B–G (как в «Home»), add9/maj7-краски без тесных секунд (воздух),
sus4→3 в 7-м такте (самый «небесный» ход), ii–V в 8-м — чтобы луп замыкался сам собой.

Партии по трекам:

| Трек | Роль | Диапазон | Заметки |
|---|---|---|---|
| `pad` | 1–8: одна нота на такт с паузой 0.6 доли; 9–16: аккорды в 4 голоса внахлёст | E3–B4 | аккорды в начале звучали навязчиво — убраны |
| `piano` | мелодия (правая) + половинные ноты (левая) | B2–D6 | velocity: сильные доли громче, восьмые тише |
| `guitar` | такты 1–8 стром (4 ноты с разбегом 40 мс), 9–16 арпеджио 1-2-3-4-5-4-3-2 | E3–F#5 | на Dmaj7 играет Dmaj9 без тоники — тонику держат бас и левая рука |
| `bass` | по ноте на аккорд | B1–A2 | мягкий, без реверба |
| `bells` | только такты 13–16, мелодия +12 | C#6–D7 | необязателен — если «слишком сладко», мьют |

### 1.1 Вторая тема `dusk_theme` — меланхоличная, bitter-sweet

Пад в духе synthwave (Kyle Dixon & Michael Stein — «Kids», «The First I Love You»): тёплый аналоговый
полисинт + тихое восьмое арпеджио, поверх — одинокое пиано. Те же piano/guitar/bass/bells, что в главной.

| | |
|---|---|
| Темп / размер | **78 BPM, 4/4** (в одном проекте с главной — см. §4, темп) |
| Тональность | **h-moll** — параллель D-dur главной темы, переходы между темами в игре будут мягкими |
| Форма | 16 тактов = 49.2 с, бесшовный луп |
| Такты 1–8 «печаль» | бас спускается B–A–G–F# (lament), пад — по одной ноте с паузами, арп с первого такта, пиано одно, гитары нет. Bm(add9) · Bm/A · Gmaj7 · D/F# · Em7 · Gmaj7 · Asus4→A · F#m7 |
| Такты 9–16 «просвет» | гармония уходит в D-dur (цитата начала главной темы: D–C#–B–G), пад — аккорды, бас — пульс восьмыми, входит стром гитары, bells дублируют долгие ноты. Dadd9 · A/C# · Bm7 · Gmaj7 · Em7 · Gmaj9 · Asus4→A · F#m7 |
| Мелодия | мотив-«вздох» D–C#–B и ответ вверх; bitter-sweet за счёт нон (C# над Bm, F# над Em) и F#m7 вместо доминанты — модально, без вводного тона |

| Трек | Роль | Диапазон |
|---|---|---|
| `pad` | 1–8 одна нота с паузой; 9–16 аккорды | E3–A4 |
| `arp` | синт-арпеджио восьмыми 5-8-10-12, рисунок 1-2-3-4-3-2-1-2, всю тему | E3–F#4 |
| `piano` | только мелодия, один голос | A4–B5 |
| `guitar` | стром только в 9–16 | E3–A4 |
| `bass` | 1–8 тянется, 9–16 пульс восьмыми | B1–B2 |
| `bells` | 9–16, долгие ноты мелодии +12 | C#6–A6 |

### 1.2 Боевая тема `nightmare_theme` — «Your Best Nightmare»

Референс — Toby Fox, *Your Best Nightmare* (Omega Flowey): напряжённо, ритмично, ударные впереди.

| | |
|---|---|
| Темп / размер | **156 BPM, 4/4** |
| Тональность | **d-moll** с тритонами (G#) и хроматикой |
| Форма | 32 такта = 49.2 с, луп; 4 секции по 8 тактов |
| Гармония (A/B/D) | Dm · Bb · Gm · C#dim7 · Dm · **Eb** (неаполитанский) · **G#dim** (тритон к D) · A7 |
| A (1–8) | барабаны с первого такта, бас, клавесин, стабы органа на офф-битах; лид — только «смех» (хроматические спуски восьмыми в 5 и 7) |
| B (9–16) | мелодия лида, медные стабы на 1 и 2.5, сбивка томами в 16-м |
| C (17–24) | брейкдаун: хаф-тайм с райдом, орган спускается A–G#–G–F# над педалью D, затем педаль A7, дробь малого крещендо, хроматический взлёт лида шестнадцатыми в 24-м |
| D (25–32) | кульминация: хэт шестнадцатыми, орган на каждой доле, медные отвечают лиду на 3.5, хор держит аккорды |

Ударные (GM, канал 10): бочка — сдвоенный тресильо 3-3-2 (шестнадцатые 0·3·6 / 8·11·14), малый на 2 и 4
плюс призрачные ноты на 1.75/3.75, открытый хэт на «и» 4-й доли, крэш на стыках секций.

| Трек | Роль | Диапазон | FLEX GM (заложено в .mid) | Что лучше |
|---|---|---|---|---|
| `organ` | стабы 0.3 доли на офф-битах; в C — целые; в D — на каждой доле | A2–A4 | Church Organ | FLEX «Rock Organ» + Fruity Fast Dist (drive 10 %) |
| `harp` | шестнадцатые 1-2-3-4-3-2-1-2 по 4 нотам аккорда | C#4–Eb5 | Harpsichord | тот же, пан L 25 %, Fruity Delay 3 1/16 wet 15 % |
| `lead` | мелодия (B, D), «смех» (A), трель D–G# и взлёт (C) | A4–F6 | Lead 1 (square) | 3xOsc Square + Fruity Fast LP, REL 60 мс — честный чиптюн |
| `brass` | стабы 0.4 / 0.3 доли на 1 и 2.5 (+3.5 в D) | G3–G#4 | Brass Section | FLEX «Synth Brass 1», пан R 20 % |
| `bass` | восьмые: тоника, тоника, октава…, хроматический подход к следующему корню | Bb1–A3 | Synth Bass 1 | 3xOsc Saw + Sine −12, Fruity Blood Overdrive |
| `choir` | только C и D, длинные аккорды | A2–B4 | Choir Aahs | — |
| `drums` | см. выше; в конце C — дробь + томы | GM 36–51 | Drum Standard Kit → в проекте заменён на **Drum Power Kit** | FPC «Rock kit», компрессор на инсерте |

В сохранённом `nightmare_theme.flp` (2026-09-17) руками переставлены: `lead` → FLEX **Church Org.2** (второй орган
вместо square — плотнее, ближе к YBN), `bass` → FLEX **Brass Section 1**, `drums` → **Drum Power Kit**.
Одинаковые ноты внахлёст FL при импорте MIDI склеивает в одну длинную + огрызки по 0.09 доли — поэтому педали
в брейкдауне (D3 органа, квинта хора, A7 в 21–24) записаны одной нотой на 4 такта.

Стартовые уровни инсертов (0.8 = 0 dB): DRUMS +1.4 dB, BASS 0, LEAD −2, ORGAN −3.4, BRASS −3.4, HARPSI −6 (L 25 %), CHOIR −6.5; мастер −6 dB.

---

## 2. Настройки проекта FL Studio

**Транспорт / проект**
- Tempo **84**, размер 4/4 (Options → Project general settings → Time signature 4/4), PPQ — стандартные 96.
- Swing 0. Snap: `1/2 step` (арпеджио восьмыми), для мелодии `Line`.
- Options → Audio: 44 100 Hz, буфер 512 samples (на слух — ок, задержка не важна, мы не играем вживую).
- Один паттерн «home_theme» на 16 тактов, все 5 каналов в нём; в плейлисте — 2 копии подряд, чтобы
  проверить, что стык лупа не слышен.

**Микшер** (имена и цвета заданы через MCP; при импорте MIDI FL сам развёл каналы по инсертам 1–5):

| Insert | Имя | Громкость | Пан | Инсерты на треке | Send → REVERB | Send → DELAY |
|---|---|---|---|---|---|---|
| 1 | PAD | −5 dB | центр (широкий) | Fruity Parametric EQ 2: HP 120 Hz, shelf −3 dB @ 8 kHz; Fruity Chorus (Delay 8 ms, Depth 20 %, Rate 0.3 Hz); Fruity Stereo Enhancer (+30 %) | 45 % | — |
| 2 | PIANO | 0 dB | центр | EQ 2: HP 60 Hz, −2 dB @ 3 kHz (мягче атаки), +1 dB shelf @ 10 kHz (воздух) | 35 % | 15 % |
| 3 | GUITAR | −4 dB | L 20 % | EQ 2: HP 100 Hz | 30 % | 20 % |
| 4 | BASS | −2 dB | центр, mono | EQ 2: LP 3 kHz; при желании Fruity Compressor (ratio 3:1, threshold −18 dB) | 0 % | 0 % |
| 5 | BELLS | −7.5 dB | R 20 % | EQ 2: HP 400 Hz | 60 % | 30 % |
| 6 | SYNTHPAD | −6 dB | центр (широкий) | *dusk_theme.* EQ 2: HP 90 Hz, LP 9 kHz; Fruity Chorus (Delay 12 ms, Depth 35 %, Rate 0.5 Hz — «Juno»); Fruity Stereo Enhancer +40 % | 40 % | — |
| 7 | ARP | −9 dB | L 15 % | *dusk_theme.* EQ 2: HP 200 Hz; Fruity Delay 3 на треке (3/16, feedback 30 %, wet 25 %) | 30 % | — |
| 20 | REVERB | 0 dB | — | **Fruity Reeverb 2**: Low cut 250 Hz, High cut 6 kHz, Predelay 20 ms, Room size 70, Diffusion 80 %, Decay 3.5 s, High damping 60 %, ER 20 %, **Dry 0 / Wet 100** | — | — |
| 21 | DELAY | 0 dB | — | **Fruity Delay 3**: Sync **3/16** (пунктирная восьмая), Feedback 35 %, Filter LP ~3 kHz, Ping-pong вкл., **Dry 0 / Wet 100** | — | — |
| 0 | Master | 0 dB | — | Fruity Parametric EQ 2: HP 30 Hz; **Fruity Limiter** (Limiter mode, Ceiling −0.5 dB, Gain 0, компрессия выкл.) — только страховка от клипа | | |

Send: в микшере выбираешь трек-источник → внизу целевого трека (REVERB/DELAY) нажимаешь стрелку
«route to this track» → крутишь появившийся регулятор на нужный %. Маршрут «в Master» у REVERB/DELAY
остаётся включён.

Уровни — стартовые, по пикам мастер должен сидеть около −6 dB; для игры потом нормализуем.

---

## 3. Инструменты и их настройки

Принцип: **всё, что нужно, есть в стоковой поставке любой редакции FL** (варианты «А»). Варианты «Б» —
если есть Producer/Signature или бесплатные VST, они звучат заметно ближе к референсам.

### 3.1 PAD — «Synth String Pad» (тянущаяся подушка)

> В главной теме в итоге лучше всего сел **FLEX → General MIDI → Voice Oohs** (хор) на одиночных нотах —
> он и записан в `home_theme.mid`. Ниже — синтетические варианты, если захочется вернуться к струнам.

**А. 3xOsc** (любая редакция) — классический струнный пад:
- Osc 1: Saw, Coarse 0, Fine 0, Vol 100 %.
- Osc 2: Saw, Fine **+7 cents**, Pan L 30 %, Vol 80 %.
- Osc 3: Saw, Coarse **−12**, Fine −5 cents, Pan R 30 %, Vol 60 %.
- Phase randomness 100 % (внизу) — чтобы каждая нота стартовала чуть по-разному.
- Channel settings (вкладка **INS**): VOL-огибающая **ATT 1.2 s · HOLD 0 · DEC 0 · SUS 100 % · REL 1.8 s**;
  фильтр CUT ~35 %, RES 10 %, огибающая фильтра ATT 1.5 s, Amount +25 % (звук «раскрывается»).
- Vol 60 %. Гармоники выше 8 kHz режем на треке PAD (см. микшер).

**Б.** **FLEX** (бесплатно, все редакции) → библиотека *General MIDI* → **Pad 2 (Warm)** или
*Pad 1 (New Age)*; если установлен пак *Essential Pads* — любой пресет со словами Strings/Air/Dream.
В самом FLEX: Attack ↑ (~1 s), Release ↑ (~2 s), Filter cutoff ↓ до тёплого.
**Sytrus** (Producer+): пресеты Pads → любой «string/soft», поднять Attack/Release.
Бесплатные VST: **Spitfire LABS «Strings»/«Frozen Strings»**, **Vital** (пресеты Pad).

### 3.2 PIANO — главный голос

**А. FL Keys** (любая редакция):
- Тип: **Grand Piano** (по умолчанию). Для вайба «Home» (Toby Fox) — тип **Rhodes**.
- **Decay 60 % · Release 45 % · Stereo 60 % · Treble +10 % · Hardness 25 % (мягкий молоточек) ·
  Muffle 40 % (темнее) · Vel to Muffle 30 % · Vel 70 % · Detune 0 · Overdrive 0 · LFO 0.**
- Channel settings: Vol 80 %, никаких огибающих (у FL Keys свои).
- Если хочется «музыкальной шкатулки/детского» оттенка — тип **Bell** с Decay 40 % — но это уже трек BELLS.

**Б.** **Spitfire LABS «Soft Piano»** (бесплатно) — самый точный «воздушный» звук для такого фона; дальше
Muffle/EQ не нужны, только реверб. Альтернативы: *Piano One* (Sound Magic), *Keyzone Classic*.

### 3.3 GUITAR — акустика / плак («Home»)

**А. Plucked!** (любая редакция) — Карплус-Стронг, звучит как нейлон/арфа:
- Decay 65 %, Color 40 %, Gate off, Stereo 30 %, Vol 70 %.
- Channel settings: REL 0.6 s (чтобы арпеджио звенело), CUT 70 %.
- В piano roll для тактов 1–8 (стром) можно дополнительно применить **Tools → Strum (Alt+S)**, 35–40 мс —
  разбег уже есть в нотах, инструмент только добавит естественности.

**Б.** **FLEX → General MIDI → Nylon Guitar** (то, что заложено в .mid), **Sakura** (Producer+,
физическое моделирование струн — пресеты Guitar/Harp, Damping ↑), бесплатный VST **Ample Guitar M Lite II**.
Для «электро-пиано-гитары» как в «Home»: **Fruity DX10** пресет E.Piano + Fruity Delay 3.

### 3.4 BASS — мягкий низ

**А. 3xOsc**: Osc 1 Sine 100 %, Osc 2 Triangle −12 dB (Vol 40 %), Osc 3 off; INS: ATT 30 ms, DEC 0,
SUS 100 %, REL 250 ms; CUT 30 %. Vol 75 %.
**А'. BooBass** (любая редакция): Bass 40 %, Mid 30 %, Treble 10 %.
**Б.** FLEX → General MIDI → **Acoustic Bass**; или FL Keys с теми же нотами (пиано-бас — очень «Undertale»).

### 3.5 BELLS — music box («Memory»)

**А. FL Keys** тип **Bell**, Decay 40 %, Release 60 %, Hardness 10 %; или **Fruity DX10** пресет
Bell/Music box. **Б.** FLEX → General MIDI → **Music Box** / **Celesta**; LABS «Glass Piano».
Velocity в нотах уже 0.35 — держать тихо, реверб 60 %.

### 3.6 SYNTHPAD — аналоговый полисинт (dusk_theme, Dixon & Stein)

Звук — Prophet/Juno: два расстроенных saw + суб-октава, медленная атака, тёплый фильтр, обязательно хорус.

**А. 3xOsc** (любая редакция):
- Osc 1: Saw, Fine 0, Vol 100 %. Osc 2: Saw, Fine **+9 cents**, Pan L 40 %, Vol 90 %.
  Osc 3: **Square**, Coarse **−12**, Vol 45 % (суб-слой, «толщина»). Phase randomness 100 %.
- INS: VOL **ATT 0.8 s · DEC 0 · SUS 100 % · REL 2.2 s**; фильтр **CUT 28 % · RES 15 %**, огибающая фильтра
  ATT 2 s, Amount +20 % — аккорд «раскрывается» уже после атаки.
- На треке 6: Fruity Chorus (Delay 12 ms, Depth 35 %, Rate 0.5 Hz, Stereo 100 %) — без хоруса это не
  synthwave; по вкусу Fruity Blood Overdrive (Drive 5 %) для «плёнки».
- Vol 55 %.

**Б.** FLEX → General MIDI → **Pad 3 (Polysynth)** (заложен в `dusk_theme.mid`) + тот же Fruity Chorus;
**Sytrus** пресеты Pads → «Analog/Warm»; бесплатные VST: **u-he Tyrell N6** (Juno-подобный, пресеты Pad),
**OB-Xd** (Oberheim — самый «Stranger Things» звук: 2 saw, unison, chorus), **Vital**.

### 3.7 ARP — синт-плак для арпеджио (dusk_theme)

**А. 3xOsc**: Osc 1 Square 100 %, Osc 2 Saw −12 полутонов Vol 50 %, Osc 3 off.
INS: VOL **ATT 0 · DEC 0.4 s · SUS 30 % · REL 0.2 s**; фильтр CUT 45 %, RES 20 %, огибающая фильтра
DEC 0.3 s, Amount +40 % (щипок). Vol 50 %. На треке 7 — Fruity Delay 3 (3/16, feedback 30 %, wet 25 %):
дилэй превращает восьмые в характерную «сетку».
**Б.** FLEX GM → **Lead 2 (Sawtooth)** с короткими нотами (заложен в .mid); Sytrus «Pluck»; Vital «Arp/Pluck».

### 3.8 BASS для dusk_theme — синтовый вариант

В 9–16 бас пульсирует восьмыми — на акустическом басе это тоже работает, но синт честнее:
**3xOsc**: Osc 1 Saw 100 %, Osc 2 Sine −12 Vol 70 %; INS ATT 10 ms, DEC 0, SUS 100 %, REL 150 ms;
CUT 30 %, RES 5 %. Или FLEX GM → **Synth Bass 1** (заложен в .mid). Тот же трек BASS, mono, без реверба.

### 3.9 Быстрый старт «всё из GM»

Если нужно услышать тему через 2 минуты: каналы **FLEX → General MIDI** с пресетами из .mid —
`home_theme`: *Voice Oohs · Acoustic Grand Piano · Nylon Guitar · Acoustic Bass · Music Box*;
`dusk_theme`: + *Pad 3 (Polysynth) · Lead 2 (Sawtooth)* (и *Synth Bass 1* вместо акустического).
Потом заменять по одному на инструменты из 3.1–3.8.

---

## 4. Порядок работы через fl-mcp

MCP умеет: писать/стирать ноты в **открытом** piano roll выбранного канала, переименовывать и
раскрашивать каналы и треки микшера, роутить каналы в микшер, крутить громкость/пан, параметры
уже загруженных плагинов, транспорт. **Не умеет: добавлять плагины/каналы и создавать паттерны.**

Поэтому один ручной шаг:

1. В channel rack добавить 5 каналов **в этом порядке**: PAD, PIANO, GUITAR, BASS, BELLS
   (инструменты — любые из раздела 3; можно все пять FLEX/GM).
2. Открыть piano roll (**F7**) — скрипт `ComposeWithLLM` пишет в него.
3. Дальше MCP: выбор канала → заливка нот из `home_theme.json` (`mode: replace`) → имя/цвет канала →
   роутинг в insert 11–15. Проверка: `piano_roll_state.json` после каждого канала.

Ручная альтернатива без MCP: File → Import → MIDI file → `music/home_theme.mid`
(«Create one channel per track»), затем на каждом канале ПКМ → Replace → нужный инструмент.
Так же собрана `nightmare_theme` (Channel type FLEX, «Set mixer tracks for new channels» — FL сам раскидал
каналы по инсертам 1–7, GM-программы подхватились, канал 10 стал Drum Standard Kit); имена/цвета/уровни
инсертов потом выставлены через MCP.

**Снять ноты обратно из FL** (например, после ручных правок): File → Export → MIDI file для FLEX/3xOsc-каналов
даёт пустые треки (FL экспортирует только MIDI Out). Вместо этого `python music/fl_dump.py <имя> <каналы…>`:
по подсказке выбираешь канал в списке справа от имени в заголовке piano roll, Ctrl+Alt+Y, Enter — скрипт
собирает `piano_roll_state.json` в .mid/.json. Первый раз за сессию FL скрипт ComposeWithLLM надо запустить
из меню piano roll Tools → Scripts, иначе Ctrl+Alt+Y («Run last script again») неактивен. Так получен `home_theme_2`.

**Вторая тема в том же проекте** (piano/guitar/bass/bells переиспользуются):
1. Создать **Pattern 2** (кнопка «+» у селектора паттернов) и выбрать его — piano roll пишет в текущий паттерн.
2. Добавить 2 канала: **SYNTHPAD** (§3.6) и **ARP** (§3.7); роутинг в инсерты 6 и 7.
3. MCP заливает `dusk_theme.json` по каналам: pad → SYNTHPAD, arp → ARP, остальные — в те же каналы.
4. Темп: `dusk_theme` — 78, `home_theme` — 84. В одном проекте темп общий → перед экспортом каждой темы
   выставить свой, либо в плейлисте автоматизировать Tempo (ПКМ по темпу → Create automation clip),
   либо Save As на копию проекта. Для быстрого прослушивания 84 тоже нормально — тема лишь чуть бодрее.

Полезное после заливки: **Alt+R** (Randomize) на пиано — velocity ±6 %, без pitch; **Alt+L**
(Quick legato) на паде; на треках 1–8 гитары — Alt+S (Strum) 35 мс.

---

## 5. Экспорт в игру

Игра играет OGG из `public/assets/music/`, если файл есть (иначе — синтез той же темы из .json).
Регистрировать ничего не надо: имена файлов заданы в `src/data/music.ts` (`assets.ts` берёт их оттуда).

| Тема (что открыть в FL) | Файл | Темп проекта при экспорте |
|---|---|---|
| `home_theme_2.mid` | `public/assets/music/home.ogg` | 84 |
| `dusk_theme2.mid` (или `dusk_theme2.flp`) | `public/assets/music/dusk.ogg` (он же играет в «шахедах») | 78 |
| `nightmare_theme.mid` (или `nightmare_theme.flp`) | `public/assets/music/sewer.ogg` | 156 |

Темп файла **должен** совпадать с `meta.bpm` в .json (ритм-игра считает доли по нему) — если в проекте
темп другой, поправить перед экспортом. Trial не открывает свои .flp → собрать заново: File → Import →
MIDI file («Create one channel per track», Channel type FLEX — GM-программы подхватятся), проверить
инструменты по §3, затем экспорт.

File → Export → **OGG** (Ctrl+R): Mode *Full song*, **Tail: Wrap remainder** (хвост реверба заворачивается
в начало — луп без щелчка), 44.1 kHz, quality ~0.5 (≈160 kbps). Луп должен быть ровно `bars` тактов
(16 / 16 / 32). Если экспорт вышел длиннее (Tail: *Leave remainder* добавляет такт хвоста — так у файлов
от 2026-09-18: 17 / 17 / 33 тактов), игра сама зацикливает по длине темы из .json (`Audio.playMusic`,
маркер `loop`), хвост просто отрезается; с *Wrap remainder* стык будет мягче. После экспорта — перезагрузить
страницу игры; в консоли не должно быть `[assets] заглушки для: home` и т.п. (аудио туда не пишется — просто
слушать). Для Safari — вторая копия в .m4a (пока не подключена).

## 6. Дальше

- `home_theme_2` — двор/улица; `dusk_theme2` — почта/канализация/шахеды; `nightmare_theme` — ритм-битва.
  Осталось экспортировать три OGG (§5).
- Улица: вариация `home_theme` +1 канал флейта/окарина (FLEX GM *Ocarina*), темп 92.
- «Ночная» версия любой темы: убрать гитару и bells, пад −6 dB, реверб Decay 5 s.
- Новая тема = новый файл в `themes/` (те же константы + `build()`), имя — в список `THEMES` в `compose.py`.
