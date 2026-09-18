import Phaser from 'phaser';
import { ASSETS } from '../data/assets';

export const FONT_URL = 'assets/fonts/pixel.ttf';

/** Есть ли файл на сервере (dev-сервер Vite на 404 отдаёт index.html, поэтому проверяем тип). */
async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return !ct.includes('text/html');
  } catch {
    return false;
  }
}

/**
 * Первая сцена: выясняет, какие файлы ассетов реально есть (остальные получат заглушки),
 * подключает пиксельный шрифт, если он лежит в public/assets/fonts/pixel.ttf, и запускает Preload.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    const checks = await Promise.all(ASSETS.map(async (a) => [a.key, await exists(a.url)] as const));
    const available = new Set(checks.filter(([, ok]) => ok).map(([key]) => key));
    this.registry.set('assets:available', available);

    if (await exists(FONT_URL)) {
      try {
        const face = new FontFace('PixelFont', `url(${FONT_URL})`);
        await face.load();
        (document.fonts as unknown as { add(f: FontFace): void }).add(face);
      } catch (e) {
        console.warn('[font] не удалось загрузить pixel.ttf', e);
      }
    }
    this.scene.start('Preload');
  }
}
