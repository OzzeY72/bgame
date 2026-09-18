import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
/** Куда редактору (editor.html) можно писать файлы. */
const EDITOR_WRITABLE = ['src/data/maps/', 'src/data/cutscenes/', 'src/data/dialogues/'];

/**
 * Dev-плагин редактора карт/катсцен: POST /__editor/save { path, content } пишет файл в src/data/*.
 * Только в dev-сервере; в сборку не попадает. Путь проверяется по списку EDITOR_WRITABLE.
 */
function editorPlugin(): Plugin {
  return {
    name: 'bgame-editor',
    configureServer(server) {
      server.middlewares.use('/__editor/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString('utf8')));
        req.on('end', async () => {
          try {
            const { path, content } = JSON.parse(body) as { path: string; content: string };
            const abs = resolve(ROOT, path);
            const rel = relative(ROOT, abs).split(sep).join('/');
            if (!EDITOR_WRITABLE.some((p) => rel.startsWith(p)) || !rel.endsWith('.ts') || rel.includes('..')) {
              throw new Error(`путь вне разрешённых: ${rel}`);
            }
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, content, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: rel }));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [editorPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    open: false,
    // бэкенд мини-игры «нарисуй» (server/draw_server.py, порт 8766)
    proxy: { '/api': { target: 'http://127.0.0.1:8766', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    // editor.html в сборку не попадает: это dev-инструмент, сохранение работает только через dev-сервер
  },
});
