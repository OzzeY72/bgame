import Phaser from 'phaser';
import type { MinigameResult } from '../types';
import { bus } from '../core/EventBus';
import { gameState } from '../core/GameState';
import { RhythmScene } from './RhythmScene';
import { ShahedScene } from './ShahedScene';
import { DrawScene } from './DrawScene';
import { BankScene } from './BankScene';
import { FeedScene } from './FeedScene';

/**
 * Реестр мини-игр: id (как в команде катсцены `{ minigame: 'id' }`) → класс сцены.
 * Сцены регистрируются в main.ts (SCENES) после UI, чтобы рисоваться поверх мира.
 */
export const MINIGAMES: Record<string, { key: string; title: string; scene: typeof Phaser.Scene }> = {
  draw: { key: 'MG_Draw', title: 'Нарисуй любимый предмет', scene: DrawScene },
  rhythm: { key: 'MG_Rhythm', title: 'Ритм-битва в канализации', scene: RhythmScene },
  shahed: { key: 'MG_Shahed', title: 'Небо над двором', scene: ShahedScene },
  feed: { key: 'MG_Feed', title: 'Покорми Фрею', scene: FeedScene },
  /** пасхалка: компьютер на почте — «банковское приложение» (не игра, но тот же механизм оверлея) */
  bank: { key: 'MG_Bank', title: 'Компьютер зайчонка', scene: BankScene },
};

export const MINIGAME_SCENES = Object.values(MINIGAMES).map((m) => m.scene);

/**
 * Запустить мини-игру поверх мира: мир ставится на паузу, сцена мини-игры — поверх; по её finish()
 * мир продолжается, результат записывается в GameState (флаги minigame:<id>:won|lost|played, рекорд).
 */
export function runMinigame(world: Phaser.Scene, id: string): Promise<MinigameResult> {
  const def = MINIGAMES[id];
  if (!def) throw new Error(`Мини-игра "${id}" не найдена. Добавь её в src/minigames/index.ts`);
  return new Promise((resolve) => {
    const onEnd = (payload: { id: string; result: MinigameResult }) => {
      if (payload.id !== id) return;
      bus.off('minigame:end', onEnd);
      gameState.recordMinigame(id, payload.result.won, payload.result.score);
      world.scene.resume();
      resolve(payload.result);
    };
    bus.on('minigame:end', onEnd);
    bus.emit('minigame:start', id);
    world.scene.pause();
    world.scene.launch(def.key, { id });
    world.scene.bringToTop(def.key);
  });
}
