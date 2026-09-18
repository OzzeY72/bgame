# bgame

Маленькая pixel-art игра-поздравление в браузере (Phaser 4) + пайплайн генерации ассетов
(ComfyUI FLUX.2 klein / Nano Banana → пост-обработка в пиксель-арт).

```bash
npm install
npm run dev              # http://localhost:5173 — игра; /editor.html — редактор карт и катсцен
pip install -r pipeline/requirements.txt
python pipeline/gen.py ping
python server/draw_server.py   # бэкенд мини-игры «нарисуй» (Nano Banana → пиксель-подарок + вебхук)
```

Управление: WASD/стрелки — ходить, E/Space/Enter/Z — действие, клик — листать диалог, M — звук.
Мини-игры: ритм (A/S/W/D), шахеды (мышь + ЛКМ/пробел), рисовалка (мышь/тач).
`?new` в адресе — начать заново, `?debug` — физические тела, `?mg=rhythm|shahed|draw` — сразу мини-игра.

Документация — `docs/` (начать с `GAME_DESIGN.md`), правила работы в репозитории — `CLAUDE.md`.
