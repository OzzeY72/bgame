# public/assets — что и куда класть

Игра сама проверяет наличие файлов (BootScene) и рисует заглушку вместо отсутствующих
(звук без файла синтезируется). Ключи и пути — `src/data/assets.ts`.

| Папка | Файл | Формат |
|---|---|---|
| `characters/` | `<id>.png` | спрайтшит: 4 строки (down, left, right, up) × 4 колонки [шаг, стоим, шаг, стоим]; кадр 48×96 (anastasiia, me), 32×32 (freya, rabbit), 64×64 (monster — только тело, щупальца рисует код) |
| `portraits/` | `<id>.png`, `<id>_<emotion>.png` | 64×64, прозрачный фон; ключ `<id>_portrait[_<emotion>]` |
| `props/` | `<id>.png` | 32×32, низ предмета у нижнего края; ключ `prop_<id>`. Особые: `gift`/`gift_open` (коробка), `hatch` (люк), `easel` (мольберт 32×64) |
| `tiles/` | `tileset.png` | 8 тайлов в ряд, порядок из `src/data/tiles.json`; собирается `gen.py pack tiles` |
| `ui/` | `dialogue_box.png` | цельная панель диалога (области — `DIALOGUE_PANEL` в `src/config.ts`) |
| `fonts/` | `pixel.ttf` | пиксельный шрифт с кириллицей (подключается автоматически) |
| `minigames/` | `shahed.png` 48×20, `drone_green.png` 18×12 | дроны для мини-игры «шахеды», летят вправо |
| `music/` | `home.ogg`, `dusk.ogg`, `sewer.ogg` | лупы, экспорт из FL Studio (`music/README.md` §5); темп файла = `meta.bpm` темы (84 / 78 / 156); `sky` играет `dusk.ogg` |
| `sfx/` | `<name>.ogg` | эффекты по именам из `SFX_NAMES` (`src/data/assets.ts`) |
| `voice/` | `anastasiia_1.ogg` … `_8.ogg`, `me_1.ogg` … | голоса в диалоге (короткие «а/э»); сколько есть — столько и играет (нумерация с 1 без пропусков), нет ни одного — блип |

PNG без сглаживания, прозрачность бинарная. Генерация — `docs/ASSET_PIPELINE.md`.
