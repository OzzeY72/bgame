# pipeline

Генерация ассетов. Полное описание — `../docs/ASSET_PIPELINE.md`.

```
gen.py               CLI: ping | gen | post | pack | approve
gui/server.py        GUI: страница на http://127.0.0.1:8765, запускает gen.py/batch_gen.py подпроцессами
batch_gen.py         прогоняет pipeline/batch/<name>/gen.txt через gen.py по очереди
batch/               по папке на сущность + gen.txt со списком команд (см. batch/README.md)
comfy_client.py      HTTP-клиент ComfyUI (upload, /prompt, /history, /view)
gemini_client.py     Nano Banana напрямую через Gemini API
validate.py          сверка графов с живым ComfyUI (/object_info)
config.yaml          модели, размеры, пути
prompts/             шаблоны промптов
workflows/
  build_workflows.py генераторы графов (klein, flux, comfy-gemini) в API-формате
  api/               примеры готовых графов (можно открыть в ComfyUI)
  ui/                исходные шаблоны Nano Banana от ComfyUI (спрайтшит 2x2, рестайл)
postprocess/         chroma, grid, pixelate, sheet, tiles
out/                 результаты (в .gitignore)
.env                 GEMINI_API_KEY=..., COMFY_URL=..., FLUX_COMFY_URL=... (в .gitignore)
```
