import { MinigameScene, type MinigameData } from './MinigameScene';
import { DrawOverlay } from './DrawOverlay';
import { localPixelate, submitDrawing } from './DrawApi';
import { gameState } from '../core/GameState';
import { loadImageTexture } from '../core/Textures';
import { DRAWN_TEXTURE } from '../data/gifts';
import { audio } from '../core/Audio';

/**
 * Мини-игра «нарисуй любимый предмет»: DOM-оверлей с холстом (DrawOverlay), рисунок уходит на бэкенд
 * (server/draw_server.py → Nano Banana → пиксель-арт 32×32 + подпись + вебхук). Результат — спрайт
 * prop_drawn и запись GameState.drawn; коробка у мольберта отдаёт этот предмет. Без бэкенда спрайт
 * делается из самого рисунка (DrawApi.localPixelate), чтобы игра не ломалась.
 */
export class DrawScene extends MinigameScene {
  private overlay?: DrawOverlay;
  private busy = false;

  constructor() {
    super('MG_Draw');
  }

  override init(data: MinigameData): void {
    super.init(data);
    this.busy = false;
  }

  create(): void {
    this.setup(0xf6e4e6);
    audio.playMusic('home');
    this.overlay = new DrawOverlay(this.game.canvas, {
      onDone: (canvas, hint) => void this.submit(canvas, hint),
      onCancel: () => {
        if (this.busy) return;
        this.finish({ won: false });
      },
    });
    this.events.once('shutdown', () => {
      this.overlay?.destroy();
      this.overlay = undefined;
    });
  }

  private async submit(canvas: HTMLCanvasElement, hint: string): Promise<void> {
    if (this.busy || !this.overlay) return;
    this.busy = true;
    const ov = this.overlay;
    audio.sfx('whoosh');
    ov.setStatus('Отправляем художнику', true);
    const png = ov.toDataURL();
    let res = await submitDrawing(png, hint, (s) => ov.setStatus(s, true));
    let note: string | undefined;
    if (!res) {
      // бэкенд недоступен — пикселим сами
      note = 'Нейросеть сейчас недоступна — подарок собран из самого рисунка.';
      res = {
        id: `local-${Date.now()}`,
        name: hint ? capitalize(hint) : 'Рисунок',
        caption: 'Нарисовано своими руками. Самый настоящий подарок.',
        spriteUrl: localPixelate(canvas),
      };
    }
    const ok = await loadImageTexture(this, DRAWN_TEXTURE, res.spriteUrl);
    if (!ok) {
      // картинка с сервера не загрузилась — тоже запасной вариант
      note = 'Картинку от нейросети не удалось загрузить — подарок собран из рисунка.';
      res.spriteUrl = localPixelate(canvas);
      await loadImageTexture(this, DRAWN_TEXTURE, res.spriteUrl);
    }
    gameState.setDrawn({ id: res.id, name: res.name, caption: res.caption, url: res.spriteUrl });
    audio.sfx('gift');
    await ov.showResult(res.spriteUrl, res.name, res.caption, note);
    this.busy = false;
    this.finish({ won: true });
  }
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
