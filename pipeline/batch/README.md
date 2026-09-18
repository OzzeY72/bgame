# pipeline/batch

Пакетная генерация: одна папка = одна сущность (персонаж/предмет/тайл), внутри `gen.txt` —
команды по одной на строку. Прогон: `python pipeline/batch_gen.py`.

```
pipeline/batch/
  camera/
    gen.txt
  grass/
    gen.txt
```

Строка в `gen.txt` = `<kind> [флаги gen.py]` (без `--name` — берётся из имени папки; без
`--backend` — берётся `--backend` из аргумента батч-скрипта, по умолчанию `klein`). Флаги —
как в `python pipeline/gen.py gen --help`: `--ref`, `--subject`, `--extra`, `--n`, `--dir`,
`--emotion`, `--seed`, `--size`, `--negative`, `--model`, `--show-prompt`. Строки с `#` и пустые
игнорируются. Смотри примеры в `camera/gen.txt` и `girl/gen.txt`.

```bash
python pipeline/batch_gen.py                    # все папки, backend=klein
python pipeline/batch_gen.py --only camera,grass
python pipeline/batch_gen.py --dry-run           # проверить команды не запуская
python pipeline/batch_gen.py --keep-going        # не стоп на первой ошибке
```

После генерации — как обычно: `gen.py post ...` / `gen.py approve` / `gen.py pack ...` (батч
только запускает `gen`, пост-обработку и подтверждение референсов пока делаешь руками).
