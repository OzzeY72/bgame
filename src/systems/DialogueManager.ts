import type { Dialogue, DialogueLine } from '../types';
import { bus } from '../core/EventBus';
import { lockInput, unlockInput } from '../core/InputLock';
import { gameState } from '../core/GameState';
import { getDialogue } from '../data/dialogues';

/**
 * Управляет показом диалога: отдаёт реплики UI-сцене через шину и ждёт "дальше".
 * Пока идёт диалог, `active === true` — WorldScene блокирует движение.
 * Использование: await dialogue.run('freya_yard')  или  await dialogue.lines([{...}])
 */
export class DialogueManager {
  active = false;
  /** поколение: abort() увеличивает его, и старые ожидания диалога тихо завершаются */
  private gen = 0;
  private static _instance: DialogueManager;

  static get instance(): DialogueManager {
    if (!this._instance) this._instance = new DialogueManager();
    return this._instance;
  }

  /** Запустить диалог по id. */
  async run(id: string): Promise<void> {
    const d = getDialogue(id);
    await this.play(d);
  }

  /** Запустить диалог из данных. */
  async play(d: Dialogue): Promise<void> {
    const lines = typeof d === 'function' ? d(gameState) : d;
    await this.lines(lines);
  }

  /** Прервать текущий диалог (перезапуск сцены мира). Ожидающие промисы завершаются. */
  abort(): void {
    if (!this.active) return;
    this.gen++;
    this.active = false;
    bus.emit('dialogue:hide');
    bus.emit('dialogue:advance');
  }

  async lines(lines: DialogueLine[]): Promise<void> {
    const wasActive = this.active;
    const gen = this.gen;
    this.active = true;
    if (!wasActive) lockInput();
    try {
      for (const line of lines) {
        const choice = await this.showLine(line);
        if (gen !== this.gen) return; // диалог прерван
        if (choice !== undefined && line.choices) {
          const c = line.choices[choice];
          if (c.setFlag) gameState.set(c.setFlag);
          if (c.next) {
            const next = getDialogue(c.next);
            const nextLines = typeof next === 'function' ? next(gameState) : next;
            await this.lines(nextLines);
          }
        }
      }
    } finally {
      if (!wasActive && gen === this.gen) {
        this.active = false;
        bus.emit('dialogue:hide');
        unlockInput();
      }
    }
  }

  /** Показывает одну реплику, резолвится индексом выбора (или undefined). */
  private showLine(line: DialogueLine): Promise<number | undefined> {
    return new Promise((resolve) => {
      const onAdvance = () => {
        cleanup();
        resolve(undefined);
      };
      const onChoice = (index: number) => {
        cleanup();
        resolve(index);
      };
      const cleanup = () => {
        bus.off('dialogue:advance', onAdvance);
        bus.off('dialogue:choice', onChoice);
      };
      bus.on('dialogue:advance', onAdvance);
      bus.on('dialogue:choice', onChoice);
      bus.emit('dialogue:show', line);
    });
  }
}

export const dialogue = DialogueManager.instance;
