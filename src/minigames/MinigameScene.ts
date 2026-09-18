import Phaser from 'phaser';
import type { MinigameResult } from '../types';
import { DIALOGUE, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { setupCamera, TEXT_RESOLUTION } from '../core/Render';
import { bus } from '../core/EventBus';
import { audio } from '../core/Audio';

export interface MinigameData {
  id: string;
}

/** Стиль текста мини-игр (пиксельный шрифт, обводка). */
export function hudStyle(size = 12, color = '#ffffff', extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: DIALOGUE.fontFamily,
    fontSize: `${size}px`,
    color,
    stroke: '#1b1420',
    strokeThickness: 3,
    resolution: TEXT_RESOLUTION,
    ...extra,
  };
}

/**
 * Базовая сцена мини-игры. Запускается поверх приостановленного мира (см. minigames/index.ts),
 * по окончании вызывает finish(result) — сцена останавливается, мир получает результат.
 * Даёт общие штуки: заголовок-баннер, экран результата с «ещё раз / выйти», Esc для выхода.
 */
export abstract class MinigameScene extends Phaser.Scene {
  protected mgId = '';
  protected finished = false;
  /** true — мини-игра не включает свою музыку, и музыка локации продолжает играть без разрыва (FeedScene) */
  protected keepMusic = false;
  protected escKey?: Phaser.Input.Keyboard.Key;

  init(data: MinigameData): void {
    this.mgId = data.id;
    this.finished = false;
  }

  /** Настройка камеры; вызывать в начале create(). */
  protected setup(bg: number): Phaser.Cameras.Scene2D.Camera {
    const cam = setupCamera(this);
    cam.setBackgroundColor(bg);
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    return cam;
  }

  /** Завершить мини-игру. Повторный вызов игнорируется. Музыку мини-игры глушим до того, как мир включит свою. */
  finish(result: MinigameResult): void {
    if (this.finished) return;
    this.finished = true;
    this.input.keyboard?.removeAllKeys(true);
    if (!this.keepMusic) audio.stopMusic(300);
    this.scene.stop();
    bus.emit('minigame:end', { id: this.mgId, result });
  }

  /** Заголовок по центру, исчезает сам. */
  protected banner(text: string, ms = 1400, size = 18, color = '#ffe9a8'): Promise<void> {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, text, hudStyle(size, color)).setOrigin(0.5).setDepth(5000).setScale(0.6);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    return new Promise((res) =>
      this.time.delayedCall(ms, () => {
        this.tweens.add({ targets: t, alpha: 0, y: t.y - 10, duration: 250, onComplete: () => t.destroy() });
        res();
      }),
    );
  }

  /** Всплывающая подпись (оценка попадания, очки). */
  protected popup(x: number, y: number, text: string, color = '#ffffff', size = 11): void {
    const t = this.add.text(x, y, text, hudStyle(size, color)).setOrigin(0.5).setDepth(4000);
    this.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 650, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  /**
   * Экран результата. Возвращает 'retry' или 'exit'. Победа — только «продолжить» (exit).
   * Enter/Space/клик — основное действие, Esc — выйти.
   */
  protected endScreen(won: boolean, title: string, lines: string[]): Promise<'retry' | 'exit'> {
    audio.sfx(won ? 'win' : 'lose');
    const depth = 6000;
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0a10, 0.72).setDepth(depth);
    const box = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 300, 150, 0x2a1f2d).setStrokeStyle(2, won ? 0xf7d34a : 0xf28b8b).setDepth(depth);
    const t1 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 52, title, hudStyle(18, won ? '#f7d34a' : '#f28b8b')).setOrigin(0.5).setDepth(depth + 1);
    const t2 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 18, lines.join('\n'), hudStyle(11, '#ffffff', { align: 'center', lineSpacing: 3 })).setOrigin(0.5, 0).setDepth(depth + 1);
    const hint = won ? '[Enter] продолжить' : '[Enter] ещё раз      [Esc] уйти';
    const t3 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 56, hint, hudStyle(10, '#d7d0e0')).setOrigin(0.5).setDepth(depth + 1);
    const objs = [dim, box, t1, t2, t3];
    objs.forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: objs, alpha: 1, duration: 250 });
    return new Promise((resolve) => {
      const kb = this.input.keyboard!;
      const K = Phaser.Input.Keyboard.KeyCodes;
      const done = (r: 'retry' | 'exit') => {
        kb.off('keydown', onKey);
        this.input.off('pointerdown', onPointer);
        objs.forEach((o) => o.destroy());
        resolve(r);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.keyCode === K.ENTER || e.keyCode === K.SPACE || e.keyCode === K.E || e.keyCode === K.Z) done(won ? 'exit' : 'retry');
        else if (e.keyCode === K.ESC) done('exit');
      };
      const onPointer = () => done(won ? 'exit' : 'retry');
      // небольшая задержка, чтобы удар по клавише в конце игры не закрыл экран сразу
      this.time.delayedCall(400, () => {
        kb.on('keydown', onKey);
        this.input.on('pointerdown', onPointer);
      });
    });
  }
}
