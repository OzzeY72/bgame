# bgame — харнесс проекта

Маленькая pixel-art игра-поздравление в браузере (Phaser 4 + Vite + TS) с мини-играми, пайплайн
генерации ассетов (ComfyUI FLUX.2 klein локально / FLUX.2 dev на RunPod / Nano Banana по API +
пост-обработка в пиксель-арт), бэкенд рисовалки и редактор карт/катсцен.
Общение с пользователем — по-русски. Код и комментарии — как в существующих файлах.

## Что читать перед работой

| Задача | Файл |
|---|---|
| Идея, сюжет, локации, персонажи | `docs/GAME_DESIGN.md` |
| Стиль, размеры, палитра, промпты | `docs/ART_STYLE.md` |
| Механики: движение, диалоги, катсцены, карты, мини-игры, подарки, звук, редактор | `docs/MECHANICS.md` |
| Как генерировать ассеты | `docs/ASSET_PIPELINE.md` |
| Что уже есть / чего не хватает | `docs/ASSET_LIST.md` |
| Сценарий (текст диалогов/сцен) | `docs/SCENARIO.md` |
| Принятые решения и почему | `docs/DECISIONS.md` |

Документы — источник истины по замыслу. Меняешь замысел/механику/стиль → обнови соответствующий
документ в том же коммите. Не дублируй в docs то, что уже видно из кода.

## Команды

```bash
npm run dev          # http://localhost:5173  (?new — сброс, ?map=&spawn= — с локации, ?cutscene= / ?mg= — катсцена/мини-игра, ?debug, ?st)
                     # http://localhost:5173/editor.html — редактор карт, катсцен, диалогов (пишет в src/data/*.ts)
python server/draw_server.py       # бэкенд мини-игры «нарисуй»: :8766, Vite проксирует /api (ключи в pipeline/.env)
npm run typecheck    # tsc --noEmit — запускать после любых правок TS
npm run build        # прод-сборка в dist/
python pipeline/gen.py ping        # проверить ComfyUI (локальный и flux) / модели / ключ Gemini
python pipeline/validate.py        # сверить графы с живым ComfyUI (--flux — flux-граф с удалённым)
python pipeline/gui/server.py      # GUI пайплайна: http://127.0.0.1:8765 (gen/post/pack/approve/batch, галереи, лог)
python music/compose.py [тема]     # темы из music/themes/*.py → music/<тема>.mid + .json, проверка голосоведения
```

Превью в браузере: `.claude/launch.json` → конфигурации `game` (игра), `pipeline-gui` (GUI пайплайна),
`draw-server` (бэкенд рисовалки).

## Карта репозитория

```
src/
  config.ts            константы: TILE=32, 512x288, кадры персонажей, скорости, диалог, RHYTHM/SHAHED, API_URL
  types.ts             MapDef, DialogueLine, CutsceneCmd, GiftDef — контракты данных
  main.ts              Phaser.Game (pixelArt, целый масштаб) + сцены мини-игр
  scenes/              Boot (проверка файлов, шрифт) → Preload (загрузка/заглушки, звук) → World + UI
  core/                GameState (флаги/инвентарь/посылки gifts/рекорды/drawn), EventBus, Input, InputLock, Placeholders,
                       Audio (музыка/эффекты, beat() для ритма), Synth (синтез тем из music/*.json и SFX), Textures
  entities/            Actor (ходьба, walkTo для катсцен, emote), Player, NPC
  systems/             MapLoader (ASCII→tilemap), DialogueManager, CutsceneRunner (+ minigame/branch/music/sfx), Fireworks (салют финала)
  minigames/           index (реестр, runMinigame), MinigameScene (база), RhythmScene + Tentacle (2 стадии), ShahedScene, FeedScene (покорми Фрею),
                       DrawScene + DrawOverlay (DOM) + DrawApi (бэкенд / локальная пикселизация),
                       BankScene + BankOverlay (DOM, пасхалка-компьютер на почте)
  editor/              editor.html: MapEditor, CutsceneEditor, DialogueEditor, schema (формы команд), serialize (TS-вывод)
  data/
    tiles.json         ЕДИНЫЙ список тайлов: порядок = индекс в tileset.png (и для pipeline)
    characters.ts      персонажи: спрайт, портрет, размер кадра, цвет
    assets.ts          манифест файлов public/assets (нет файла → заглушка; звук → синтез), SFX_NAMES
    music.ts           музыка: файл + тема из music/*.json + bpm (по нему чарт ритм-игры)
    gifts.ts           названия предметов, реплики коробок, комментарии автора к подаркам, totalGifts(), нарисованный предмет (drawn)
    maps/*.ts          локации в ASCII + spawns/exits/npcs/items(gift)/triggers/onEnter/music
    dialogues/         index.ts — рукописные (и функции от state), edited.ts — из редактора
    cutscenes/         index.ts — рукописные (и с call), edited.ts — из редактора
public/assets/         готовые PNG (characters/, portraits/, tiles/, props/, ui/, fonts/, minigames/), music/, sfx/
server/                draw_server.py — бэкенд рисовалки (рисунок → Nano Banana → спрайт + подпись → вебхук); data/ в .gitignore
pipeline/              генерация ассетов (см. docs/ASSET_PIPELINE.md); gui/ — браузерная обёртка над gen.py
music/                 фоновая музыка: нотная запись → MIDI/JSON (их же играет игра), заливка в FL Studio через fl-mcp
refs/, presents/       референсные фото (presents/ — подарки)
```

## Правила

- **Размеры** живут в `src/config.ts` и `pipeline/config.yaml` (секция `pixel`). Меняешь одно — меняй второе.
- **Новый тайл**: добавить в `src/data/tiles.json` (в конец, чтобы не сдвигать индексы), символ в
  `src/data/maps/legend.ts`, PNG в `pipeline/out/tiles/<name>.png` → `gen.py pack tiles`.
- **Новый ассет-файл**: запись в `src/data/assets.ts` + файл в `public/assets/...`. Пока файла нет,
  работает заглушка — игра не должна ломаться от отсутствия арта.
- **Новая локация**: файл в `src/data/maps/`, регистрация в `maps/index.ts`, выходы в обе стороны,
  spawn-точка на 1 тайл внутри от зоны выхода (иначе мгновенный обратный переход).
- **Новый диалог/катсцена**: `src/data/dialogues/index.ts` / `src/data/cutscenes/index.ts` (или через
  `editor.html` → `edited.ts`); текст — сначала в `docs/SCENARIO.md`. Флаги именовать по соглашению из `GameState.ts`.
  `edited.ts` руками не править — редактор переписывает их целиком.
- **Катсцены**: `warp` — только последней командой; движение актёров в катсцене игнорирует
  коллизии (автор сцены отвечает за путь). Команды — `CutsceneCmd` в `types.ts`; новая команда =
  тип в `types.ts` + ветка в `CutsceneRunner.exec` + описание в `src/editor/schema.ts` + `docs/MECHANICS.md`.
- **Мини-игра**: сцена-наследник `MinigameScene` в `src/minigames/`, регистрация в `minigames/index.ts`,
  запуск командой `{ minigame }`, награда — коробка `gift` с `unlock: 'minigame:<id>:won'`. Коробки забираются
  запакованными (`packed:<id>`) и открываются все на почте (`rabbit_post` → `finale`); число посылок считается по картам.
- **Звук**: новый эффект — имя в `SFX_NAMES` + ветка в `playSynthSfx`; новая музыка — запись в `data/music.ts`
  (файл в `public/assets/music/` необязателен; темп файла = `theme.meta.bpm`, лишний хвост игра отрезает по `bars`).
  Голос персонажа — `voice` в `data/characters.ts` + файлы `public/assets/voice/<clips>_<n>.ogg`.
- **Прогресс = флаги** в `GameState`. Никаких отдельных булевых полей на сцене.
- После правок TS: `npm run typecheck`. После правок карт — пройти локацию в браузере.
- Ассеты-заглушки не коммитить в `public/assets`; `pipeline/out/` игнорируется git.
- Не добавлять зависимости без необходимости (сейчас только phaser; python: Pillow, numpy, requests, PyYAML).
- Бэкенд рисовалки переиспользует `pipeline/gemini_client.py` и `pipeline/postprocess` — не дублировать обработку картинок.

## Окружение (важно для пайплайна)

- GPU: RTX 3050 4 GB → локально только FLUX.2 klein **4B** (fp8 или GGUF Q4/Q5, `--lowvram`);
  9B и Nano Banana Pro — по API/RunPod. Детали и обход ограничений — `docs/ASSET_PIPELINE.md`.
- RunPod-образ для бэкенда `flux` (FLUX.2 dev + klein 9B): `Desktop/ai/runpod2` (отдельный репозиторий,
  собран по образцу `Desktop/ai/runpod`). URL пода — `FLUX_COMFY_URL` в `pipeline/.env` или `flux.url`.
- ComfyUI portable запущен на `http://127.0.0.1:8188` (папка `Desktop/New folder/ComfyUI_windows_portable_nvidia (1)/...`);
  Comfy Desktop (`:8000`) — отдельная установка без моделей. URL — `pipeline/config.yaml` или `COMFY_URL`.
- Ключ Gemini: `pipeline/.env` → `GEMINI_API_KEY=...` (файл в .gitignore).
