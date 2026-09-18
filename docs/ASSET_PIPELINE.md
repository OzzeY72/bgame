# Пайплайн ассетов

Цель: из фото-референсов получать пиксель-арт спрайты, спрайтшиты, портреты, тайлы и предметы,
готовые для Phaser, с **одинаковым персонажем во всех кадрах**.

Принцип: модель (klein / Nano Banana) рисует крупный «псевдо-пиксель-арт» на хромакее, а
`pipeline/postprocess` делает из него настоящий пиксель-арт: убирает фон, режет сетку кадров,
масштабирует **одним коэффициентом** все кадры персонажа, выравнивает по ногам, квантует палитру,
собирает лист.

```
фото ──gen card──> карточка персонажа (одобрить: approve) ──gen sheet──> 4 вида ──post sheet──> views/ + кадры "стоим"
                                                                 └─gen walk --dir X (референс: вид X + карточка) ──post walk──> кадры ходьбы
                                                                 └─gen idle [--dir down] (то же) ──post idle──> кадры дыхания (необязательно)
                                                                                                 └── pack sheet ──> public/assets/characters/<name>.png
```

## Установка

```bash
pip install -r pipeline/requirements.txt
```

Ключ Gemini (для бэкенда `gemini`): файл `pipeline/.env`:
```
GEMINI_API_KEY=...
# COMFY_URL=http://127.0.0.1:8188
```

Проверка: `python pipeline/gen.py ping`.

## Бэкенды

| `--backend` | Что | Когда |
|---|---|---|
| `klein` | ComfyUI + FLUX.2 [klein] 4B локально (или RunPod по `COMFY_URL`) | бесплатно, офлайн; тайлы, предметы, здания, простые персонажи |
| `flux` | ComfyUI + FLUX.2 [dev] 32B на RunPod (`FLUX_COMFY_URL` / `flux.url`; образ `Desktop/ai/runpod2`) | заметно лучше klein 4B по деталям и следованию промпту; когда локально не тянет, а Gemini не хочется |
| `gemini` | Nano Banana напрямую через Gemini API (`gemini-3-pro-image-preview` / `gemini-3.1-flash-image`) | лучший результат для спрайтшитов и консистентности персонажа (до 14 референсов) |
| `comfy-gemini` | та же Nano Banana, но через API-ноду ComfyUI (`GeminiImage2Node`, нужен аккаунт comfy.org) | если удобнее держать всё в ComfyUI |

По умолчанию: `gemini`, если есть ключ, иначе `klein`.

### FLUX.2 klein локально (RTX 3050 4 GB)

Модели → `ComfyUI/models/`:
- `diffusion_models/flux-2-klein-base-4b-fp8.safetensors` (base: 20 шагов, cfg 4–5) — или
  дистиллят `flux-2-klein-4b-fp8.safetensors` (4 шага, cfg 1, `klein.distilled: true`), или
  **GGUF Q4_K_M/Q5** (нода `UnetLoaderGGUF`, custom node ComfyUI-GGUF уже установлен) — для 4 ГБ VRAM
  это самый реалистичный вариант; имя с `.gguf` в `klein.unet` переключает загрузчик автоматически;
- `text_encoders/qwen_3_4b.safetensors` (или `qwen_3_4b_fp4_mixed.safetensors` — легче);
- `vae/flux2-vae.safetensors` (уже есть).

ComfyUI запускать с `--lowvram` (текстовый энкодер и часть UNet уедут в RAM; 16 ГБ RAM впритык —
закрыть браузер с вкладками). Одна картинка 1024² займёт минуты. Если совсем не лезет — RunPod:
образ и воркфлоу из `Desktop/ai/runpod` уже заточены под FLUX.2, меняется только `COMFY_URL`.

### FLUX.2 dev на RunPod (бэкенд `flux`)

Образ и скрипты — `Desktop/ai/runpod2` (README там): ComfyUI без custom nodes, `bash.sh` качает
`flux2_dev_fp8mixed` + `mistral_3_small_flux2_fp8` + `flux2-vae` (профиль `flux`) и дополнительно
klein base 9B + `qwen_3_8b` (профиль `full`, по умолчанию). Подключение: `FLUX_COMFY_URL=https://<pod>-8188.proxy.runpod.net`
в `pipeline/.env` (или `flux.url` в config), затем `gen.py ping` покажет второй сервер и модели,
`validate.py --flux` сверит граф. Граф dev отличается от klein: **нет negative и CFG** —
`CLIPTextEncode → FluxGuidance(4.0) → ReferenceLatent… → BasicGuider` (официальный шаблон `image_flux2_dev`);
`--negative` для `flux` игнорируется. Настройки — `config.yaml → flux:` (`steps`, `guidance`, `lora`).
Тот же под может обслуживать и `klein` на 9B: `klein.unet: flux-2-klein-base-9b-fp8.safetensors`,
`klein.clip: qwen_3_8b_fp8mixed.safetensors`, `COMFY_URL` на под.

Граф собирается кодом (`pipeline/workflows/build_workflows.py`) ровно по официальному шаблону
`image_flux2_klein_image_edit_4b_base`: `UNETLoader → CLIPLoader(flux2) → CLIPTextEncode`,
референсы через `ImageScaleToTotalPixels(1MP) → VAEEncode → ReferenceLatent` (цепочкой в positive и
negative), `EmptyFlux2LatentImage → RandomNoise/KSamplerSelect/Flux2Scheduler → CFGGuider →
SamplerCustomAdvanced → VAEDecode → SaveImage`. LoRA (`klein.lora`) — `LoraLoaderModelOnly`.
`python pipeline/validate.py` сверяет граф с `/object_info` живого сервера (ноды, входы, имена моделей).
Примеры графов для ручного запуска в ComfyUI — `pipeline/workflows/api/*.json`; исходные шаблоны
Nano Banana от ComfyUI (спрайтшит 2×2, рестайл по образцу) — `pipeline/workflows/ui/`.

## Команды

```bash
# 1. Карточка персонажа из фото (несколько вариантов, выбрать лучший)
python pipeline/gen.py gen card --name girl --ref refs/characters/girl.jpg --n 3 --backend gemini
python pipeline/gen.py approve --name girl --in pipeline/out/girl/raw/card_123.png   # -> out/girl/card.png (фон убран)

# 2. Четыре вида (1x4: front, left, right, back) по карточке
python pipeline/gen.py gen sheet --name girl
python pipeline/gen.py post sheet --name girl --in pipeline/out/girl/raw/sheet_456.png
#    модель иногда кладёт 4 вида сеткой 2x2 (широкие звери при 1:1) — тогда --rows 2 --cols 2 (порядок чтения тот же)
#    фигуры разной ширины (собака: фас узкий, профиль широкий — нос вылезает за ровную ячейку) — --split blobs:
#    режет по 4 самым большим островам содержимого, а не по сетке (rows*cols = сколько фигур искать)
#    -> out/girl/views/{down,left,right,up}.png (полноразмерные, референсы для walk)
#    -> out/girl/frames/<dir>_1.png (кадр "стоим"), печатает масштаб

# 3. Ходьба по направлениям (2x2 сетка: шаг, вместе, шаг, вместе). left можно не делать — зеркало right.
python pipeline/gen.py gen walk --name girl --dir down
python pipeline/gen.py gen walk --name girl --dir right
python pipeline/gen.py gen walk --name girl --dir up
python pipeline/gen.py post walk --name girl --dir down  --in pipeline/out/girl/raw/walk_down_789.png
python pipeline/gen.py post walk --name girl --dir right --in ...
python pipeline/gen.py post walk --name girl --dir up    --in ...
#    масштаб считается для каждого файла свой: самый высокий кадр (стоим) -> char_height. НЕ передавать
#    --scale от листа 1x4 в ходьбу 2x2 — там фигура нарисована в другом масштабе (714 px против 430 px).

# 3b. (необязательно) Дыхание — idle-анимация 2x2 (нейтраль, вдох, полный вдох, выдох). По умолчанию
#     --dir down: персонажи стоят лицом к камере, остальные направления в idle стоят на кадре "стоим".
python pipeline/gen.py gen idle --name girl
python pipeline/gen.py post idle --name girl --in pipeline/out/girl/raw/idle_down_321.png
#    -> out/girl/frames/idle_down_0..3.png (не перетирает кадры ходьбы). Тот же масштаб по самому высокому кадру:
#    кадр "полный вдох" на 1-2 px выше нейтрали — это нормально, char_height ловит именно его.

# 4. Сборка листа -> public/assets/characters/girl.png (+ girl_preview.png x4 для глаз)
#    Есть хоть один idle_* кадр -> под 4 строками ходьбы добавляются 4 строки дыхания (игра сама видит их по высоте PNG).
python pipeline/gen.py pack sheet --name girl

# Портрет для диалога (эмоции -> portraits/girl_<emotion>.png, ключ girl_portrait_<emotion>)
python pipeline/gen.py gen portrait --name girl --emotion happy
python pipeline/gen.py post portrait --name girl --emotion happy --in ... --fit cover

# Предметы из фото
python pipeline/gen.py gen prop --name camera --ref presents/phen.jpg --subject "vintage film camera"
python pipeline/gen.py post prop --name camera --in pipeline/out/camera/raw/prop_1.png     # -> public/assets/props/camera.png

# Тайлы земли (бесшовные) и объекты
python pipeline/gen.py gen tile --name grass --subject "short green lawn grass" --backend klein
python pipeline/gen.py post tile --name grass --in ... --seamless                           # -> pipeline/out/tiles/grass.png
python pipeline/gen.py gen object --name tree --subject "a round leafy linden tree, trunk visible"
python pipeline/gen.py post object --name tree --in ... --tiles 1x2 --names tree_top,tree_trunk
python pipeline/gen.py gen object --name bench --subject "a wide wooden park bench ..." --size 1024x512   # широкий объект — широкий холст
python pipeline/gen.py post object --name bench --in ... --tiles 2x1 --names bench,bench_r              # 64x32 -> два тайла
python pipeline/gen.py gen building --name post --subject "small Nova Poshta post office, white walls, red sign" --ref refs/environment/post.jpg
python pipeline/gen.py post building --name post --in ... --tiles 10x4                     # -> тайлы post_r{r}c{c}.png + подсказка для tiles.json
python pipeline/gen.py pack tiles                                                           # -> public/assets/tiles/tileset.png по tiles.json

# Плоские тайлы фасада (стена, окно, дверь) — как tile, но фронтальный вид, а не сверху
python pipeline/gen.py gen facade --name wall --subject "beige stucco apartment wall panel" --backend klein
python pipeline/gen.py post tile --name wall --in pipeline/out/wall/raw/facade_1.png --seamless   # post — тот же, что для tile
python pipeline/gen.py post tile --name entrance --in ... --tiles 2x1 --names entrance,entrance_r   # блок WxH: кроп под пропорцию, нарезка на тайлы

# Панель диалога из сгенерированной рамки (любой фон-однотон, не хромакей). Фон убирается заливкой
# от краёв, надпись-заглушка стирается (--erase), однотонная часть растягивается столбцом --stretch-x
# до --width, картинка уменьшается в 6 раз (--scale 0.1667 по умолчанию). --rect печатает области
# в пикселях панели -> скопировать в DIALOGUE_PANEL (src/config.ts).
python pipeline/gen.py post ui --name dialogue_box --in refs/ui/dialogue_box_with_avatar.png --width 500 --stretch-x 600 --colors 24   --erase 1330,605,1600,690 --rect text=121,160,1217,768 --rect portrait=1225,170,1709,564 --rect name=1240,595,1690,697
```

Полезные флаги `gen`: `--extra "..."` (добавка к промпту), `--seed`, `--n`, `--size WxH` (klein),
`--show-prompt`, `--dump-graph`. Флаги `post`: `--key green|auto|none`, `--tolerance`,
`--method nearest|box|lanczos` (nearest — если генерация уже честно блочная), `--colors`, `--inset`.

Промпты — `pipeline/prompts/*.txt` (плейсхолдеры `{style} {key} {key_hex} {subject} {direction_desc}
{emotion} {extra}`), стиль — `style.txt`. Размеры и палитра — `pipeline/config.yaml` → `pixel`.

## GUI (`pipeline/gui/server.py`)

Всё то же самое, но кнопками: `python pipeline/gui/server.py` → http://127.0.0.1:8765 (конфигурация
`pipeline-gui` в `.claude/launch.json`). Слева — сущности из `pipeline/out/`, вкладки: **Генерация**
(форма `gen` со всеми флагами, выбор референсов из `refs/`, `presents/`, карточки и видов; «dry-run»
показывает промпт без генерации), **Пост-обработка** (кнопка «→ post» у сырого файла сама угадывает
`kind`/`dir`/`emotion` по имени файла; поля показываются по виду), **Сборка / approve** (pack sheet,
pack tiles с подсказкой, каких тайлов не хватает по `tiles.json`, approve карточки), **Пакет**
(`batch_gen.py` + редактор `gen.txt`), **Файлы** (raw/views/frames/превью, «открыть папку»),
**Настройки** (`config.yaml`, промпты, `tiles.json` — правятся и сохраняются на месте). Внизу —
очередь задач с живым логом; задачи идут по одной. Сервер только stdlib + Pillow (миниатюры), вся
логика по-прежнему в `gen.py` — GUI лишь собирает argv и запускает подпроцесс, так что консольные
команды из этого документа остаются источником правды.

## Бэкенд рисовалки (`server/draw_server.py`)

Мини-игра «нарисуй любимый предмет» шлёт PNG рисунка на `POST /api/draw`; сервер (stdlib + зависимости
пайплайна) делает: рисунок → Nano Banana (`draw.model`, промпт `prompts/drawn_prop.txt`, рисунок —
референс) → `chroma.key_to_alpha` + `grid.normalize_single` → спрайт `pixel.prop`×`pixel.prop` →
название и подпись текстовой моделью (`draw.caption_model`, `prompts/drawn_caption.txt`, JSON) →
вебхук → `server/data/drawn/<id>/{drawing,raw,sprite,sprite_x8}.png + meta.json`.

```bash
python server/draw_server.py          # http://127.0.0.1:8766 ; dev-сервер Vite проксирует /api сюда
curl http://127.0.0.1:8766/api/health # { ok, gemini, webhook, model }
```

Настройки — `pipeline/config.yaml` → `draw`; ключи — `pipeline/.env`: `GEMINI_API_KEY`, `WEBHOOK_URL`,
`WEBHOOK_FORMAT=json|discord` (discord — multipart с картинками в канал; json — POST с base64 спрайта и
рисунка). Без ключа спрайт делается из рисунка (белый фон → прозрачность). В проде сервер должен быть
доступен игре: тот же хост (`/api`) или `VITE_API_URL=https://...` при сборке. Конфигурация запуска —
`draw-server` в `.claude/launch.json`.

## Пакетная генерация (`batch_gen.py`)

Чтобы не вызывать `gen.py` вручную по одной команде, можно расписать генерации заранее по
сущностям: `pipeline/batch/<name>/gen.txt`, по одной команде `gen` на строку (`--name` берётся
из имени папки). Подробности и формат строк — `pipeline/batch/README.md`.

```bash
python pipeline/batch_gen.py --dry-run     # проверить, что получится
python pipeline/batch_gen.py               # прогнать всё, backend=klein
python pipeline/batch_gen.py --only camera
```

`pipeline/batch/` расписан по всем недостающим ассетам из `docs/ASSET_LIST.md` (земля, пол, фасад,
объекты, предметы) — по одной папке-сущности на тайл, с явным `--negative`, подобранным против
характерного бага klein 4B: вместо честной плоской текстуры/фасада модель рисует «иконку» —
изометрический кубик, парящий на хромакее с большими полями вокруг (см. историю ниже). Перед полным
прогоном стоит проверить 2-3 ассета (`--only grass,wall,tree`) и на глаз сверить `preview_*` —
дешевле поправить промпт на одном тайле, чем перегенерировать всё.

**Важно про выбор `kind`**: `tile` — только для плоских текстур сверху (земля, пол, крыша);
`facade` — плоский фронтальный тайл фасада (стена, окно, дверь) — то же самое, что `tile`, но без
слова top-down в промпте: для окна/двери «вид сверху» бессмысленен; `object` — отдельный предмет
с объёмом на хромакее (дерево, лавка, фонарь). Все три поста делаются одинаково — `post tile` для
tile/facade, `post object` для object. Ассет, сгенерированный `prop` (задуман для вещей *по фото*,
`prop.txt` ничего не знает про перспективу «сверху»/«в лоб») вместо `tile`/`object`/`facade` —
частая причина как раз того самого бага с кубиком.

**Ракурс объектов**: игра без изометрии (см. таблицу в `docs/ART_STYLE.md`), а «3/4 top-down like
Stardew» модели (и klein, и flux) читают как изометрию — объект повёрнут на 30–45°, видны две грани,
диагональные рёбра. Поэтому `object_tile.txt`/`prop.txt` расписывают ракурс словами (front view from
slightly above, horizontal edges stay horizontal, NOT isometric, no visible side faces), а батч-негативы
содержат `45 degree rotation, side view`. Для `flux` негатив игнорируется — запрет должен быть в промпте.
Широкие объекты (лавка 2×1) генерировать на широком холсте (`--size 1024x512`) и резать `--tiles 2x1`.
Высокие (дерево, фонарь 1×2) — `--size 512x1024`, `--tiles 1x2 --names <верх>,<низ>`; верх идёт в overhead
через `top` в `tiles.json`. Объекты, которые на карте идут рядами (забор, прилавок, полка, козырёк), —
«один повторяющийся сегмент, срезанный ровно по левому и правому краю», иначе у каждого тайла свои
боковые торцы. Вывеска на стене (`sign_post`) — `facade` со стеной в кадре, `post object --key none
--tiles 2x1`. Готовые команды `post` записаны в комментарии каждого `pipeline/batch/<name>/gen.txt`.

**Про «мыло» на мелких объектах**: объект ~500 px ужимается в 32 px (×16), каждый игровой пиксель —
среднее из 2–3 «псевдопикселей» модели, мелкие детали (шурупы, завитки) неизбежно превращаются в кашу.
Помогает: занять объектом больше тайлов (2×1, 1×2), просить в промпте «simple, chunky, no tiny details»
(уже в `object_tile.txt`), `--colors 16`, для klein — `--size 512x512`. `--method nearest` — только если
генерация уже честно блочная (у flux — нет).

## Как добиться консистентности персонажа

1. **Одна карточка — один источник.** Всё остальное (виды, ходьба, портрет, эмоции) генерируется
   с карточкой в референсах. Не «улучшать» персонажа по ходу — иначе кадры разъедутся.
2. **Кадры анимации — одной картинкой (сетка 2×2).** Модель видит все кадры сразу и держит дизайн.
   Ходьба по направлению генерируется с референсом *этого вида* (`views/<dir>.png`) + карточка.
3. **Один масштаб на генерацию, одна высота на персонажа.** В каждом файле самый высокий кадр
   (стойка) приводится к `char_height` из `config.yaml`, остальные кадры файла — тем же коэффициентом.
   Между файлами (лист 1×4 и ходьба 2×2) коэффициенты разные, потому что модель рисует фигуру
   в разном масштабе; общая только `char_height`. `--scale` — лишь чтобы принудительно повторить.
   Перед измерением кадр чистится от линий сетки и крапинок (`chroma.despeckle`: оставляем плотные
   крупные «острова»); `--no-clean` выключает. Если линия сетки прилипла к фигуре — `--inset`.
4. **Хромакей magenta**, в промпте запрещён на персонаже. Вырезается по умолчанию `post_key: auto`
   (медиана по углам картинки), а не по `key_color`: модели рисуют «свою» мадженту (flux — `#F70570`,
   до `#FF00FF` расстояние ≈ 143 при допуске 70 — ключ не срабатывал, и объект ужимался вместе с
   розовым фоном в 32 px). Если авто-ключ промахнулся — `--key magenta|#rrggbb` или `--tolerance`. Модель сглаживает тёмный контур об фон, и полоса в
   несколько px у границы выходит пурпурной уже в исходнике; `key_to_alpha` размешивает ключ на
   полупрозрачном крае и гасит выпирающие каналы ключа в полосе 8 px от прозрачности — контур
   получается тёмным, а не розовым.
5. **Nano Banana Pro** держит персонажа заметно лучше klein 4B. Стратегия: персонажи/портреты —
   Gemini API; земля, стены, предметы — klein локально (там консистентность не критична).
6. Для klein: фиксировать `--seed`, cfg 4–5, 20–30 шагов; можно добавить pixel-art LoRA
   (`klein.lora`). При рестайле по образцу — промпт `restyle` с двумя референсами (объект + стиль).
7. **Ручная доводка неизбежна** (2–3 пикселя на кадре): Aseprite / LibreSprite / Piskel.
   `pipeline/out/<name>/frames/*.png` — правь кадры и снова `pack sheet`.
8. Общая палитра (`pixel.palette`) — когда набралось 5–6 хороших ассетов, собрать из них палитру
   и перегенерировать `post` для всех: цвета сойдутся.

## Структура вывода

```
pipeline/out/<name>/raw/      сырые генерации + .txt с промптом (+ .graph.json)
pipeline/out/<name>/card.png  одобренная карточка (референс)
pipeline/out/<name>/views/    полноразмерные виды по направлениям
pipeline/out/<name>/frames/   кадры 32x64 (<dir>_<i>.png) — можно править руками
pipeline/out/<name>/preview_* увеличенные превью
pipeline/out/tiles/           тайлы 32x32 по именам из tiles.json
public/assets/...             результат (это грузит игра)
```
