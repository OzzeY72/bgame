import { API_URL } from '../config';

/** Ответ бэкенда (server/draw_server.py): готовый спрайт, название и подпись от нейросети. */
export interface DrawResult {
  id: string;
  name: string;
  caption: string;
  spriteUrl: string;
}

interface JobStatus {
  status: 'queued' | 'running' | 'done' | 'error';
  step?: string;
  error?: string;
  result?: { id: string; name: string; caption: string; sprite_url: string };
}

const POLL_MS = 1500;
const TIMEOUT_MS = 240_000;

/**
 * Отправить рисунок на бэкенд и дождаться результата. onStatus получает человекочитаемый этап.
 * Возвращает null, если сервер недоступен (тогда сцена делает спрайт сама — см. localPixelate).
 */
export async function submitDrawing(pngDataUrl: string, hint: string, onStatus: (s: string) => void): Promise<DrawResult | null> {
  let job: string;
  try {
    const r = await fetch(`${API_URL}/api/draw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: pngDataUrl, hint }),
    });
    if (!r.ok) {
      console.warn('[draw] сервер ответил', r.status);
      return null;
    }
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null; // dev-сервер без прокси отдал index.html
    job = (await r.json()).job;
    if (!job) return null;
  } catch (e) {
    console.warn('[draw] бэкенд недоступен:', e);
    return null;
  }
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT_MS) {
    await new Promise((res) => setTimeout(res, POLL_MS));
    let st: JobStatus;
    try {
      const r = await fetch(`${API_URL}/api/draw/${encodeURIComponent(job)}`, { cache: 'no-store' });
      if (!r.ok) return null;
      st = (await r.json()) as JobStatus;
    } catch {
      return null;
    }
    if (st.step) onStatus(st.step);
    if (st.status === 'done' && st.result) {
      const u = st.result.sprite_url;
      return {
        id: st.result.id,
        name: st.result.name,
        caption: st.result.caption,
        spriteUrl: u.startsWith('http') || u.startsWith('data:') ? u : `${API_URL}${u}`,
      };
    }
    if (st.status === 'error') {
      console.warn('[draw] ошибка бэкенда:', st.error);
      return null;
    }
  }
  console.warn('[draw] бэкенд не ответил вовремя');
  return null;
}

/**
 * Запасной вариант без бэкенда: рисунок уменьшается до спрайта size×size, белый фон становится прозрачным.
 * Возвращает data:-URL PNG.
 */
export function localPixelate(src: HTMLCanvasElement, size = 32): string {
  // обрезаем по содержимому (не-белые пиксели), чтобы маленький рисунок не терялся
  const sctx = src.getContext('2d')!;
  const data = sctx.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width;
  let y0 = src.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) {
    x0 = 0;
    y0 = 0;
    x1 = src.width - 1;
    y1 = src.height - 1;
  }
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const inner = size - 2;
  const s = inner / Math.max(cw, ch);
  const dw = Math.max(1, Math.round(cw * s));
  const dh = Math.max(1, Math.round(ch * s));
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, x0, y0, cw, ch, Math.floor((size - dw) / 2), size - 1 - dh, dw, dh);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const near = d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;
    if (near || d[i + 3] < 128) d[i + 3] = 0;
    else d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
