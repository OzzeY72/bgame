import { SAVE_KEY, START_MAP, START_SPAWN } from '../config';
import { bus } from './EventBus';

/** Подарок, нарисованный в мини-игре: спрайт (URL или data:), название и подпись от нейросети. */
export interface DrawnGift {
  id: string;
  name: string;
  caption: string;
  url: string;
}

/** Запакованная посылка в инвентаре: какая коробка (id предмета карты), что внутри, реплики при открытии. */
export interface PackedGift {
  id: string;
  item: string;
  dialogue?: string;
}

/**
 * Состояние игры: флаги, инвентарь, текущая карта. Сохраняется в localStorage.
 * Флаги — единственный механизм "прогресса": диалоги/катсцены/NPC ссылаются на них по имени.
 * Соглашение по именам флагов:
 *   cutscene:<id>        — катсцена с once уже сыграна
 *   talked:<npc>         — с NPC уже говорили
 *   has:<item>           — предмет в инвентаре (дублирует inventory для удобства условий)
 *   seen:<item>          — предмет осмотрен
 *   packed:<gift>        — коробка-посылка забрана в инвентарь (см. gifts)
 *   opened:<gift>        — посылка открыта (на почте)
 *   gifts_all / gifts_opened / finale_done — все посылки собраны / открыты / финал сыгран
 *   minigame:<id>:won    — мини-игра пройдена (:played — хотя бы раз запускалась, :lost — последний заход проигран)
 */
export class GameState {
  flags: Record<string, boolean> = {};
  inventory: string[] = [];
  /** запакованные посылки в порядке получения (открываются на почте в этом же порядке) */
  gifts: PackedGift[] = [];
  /** рекорды мини-игр */
  scores: Record<string, number> = {};
  /** подарок из мини-игры «нарисуй» */
  drawn: DrawnGift | null = null;
  map = START_MAP;
  spawn = START_SPAWN;

  flag(name: string): boolean {
    return !!this.flags[name];
  }

  set(name: string, value = true): void {
    this.flags[name] = value;
    this.save();
  }

  /** Проверка списка условий: "flag" → должен быть true, "!flag" → false. */
  check(conds?: string[]): boolean {
    if (!conds || conds.length === 0) return true;
    return conds.every((c) => (c.startsWith('!') ? !this.flag(c.slice(1)) : this.flag(c)));
  }

  give(item: string): void {
    if (!this.inventory.includes(item)) this.inventory.push(item);
    this.set(`has:${item}`);
    bus.emit('inventory:change');
  }

  /** Забрать коробку-посылку в инвентарь (не открывая). Ставит флаг packed:<id>. */
  packGift(g: PackedGift): void {
    if (!this.gifts.some((x) => x.id === g.id)) this.gifts.push(g);
    this.set(`packed:${g.id}`);
    bus.emit('inventory:change');
  }

  /** Посылки, которые ещё не открыты. */
  unopenedGifts(): PackedGift[] {
    return this.gifts.filter((g) => !this.flag(`opened:${g.id}`));
  }

  has(item: string): boolean {
    return this.inventory.includes(item);
  }

  /** Записать результат мини-игры: флаги played/won/lost и рекорд. */
  recordMinigame(id: string, won: boolean, score?: number): void {
    this.flags[`minigame:${id}:played`] = true;
    this.flags[`minigame:${id}:lost`] = !won;
    if (won) this.flags[`minigame:${id}:won`] = true;
    if (score !== undefined) this.scores[id] = Math.max(this.scores[id] ?? 0, score);
    this.save();
  }

  setDrawn(d: DrawnGift): void {
    this.drawn = d;
    this.save();
  }

  save(): void {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          flags: this.flags,
          inventory: this.inventory,
          gifts: this.gifts,
          scores: this.scores,
          drawn: this.drawn,
          map: this.map,
          spawn: this.spawn,
        }),
      );
    } catch {
      /* приватный режим и т.п. — игра работает без сохранения */
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      this.flags = data.flags ?? {};
      this.inventory = data.inventory ?? [];
      this.gifts = data.gifts ?? [];
      this.scores = data.scores ?? {};
      this.drawn = data.drawn ?? null;
      this.map = data.map ?? START_MAP;
      this.spawn = data.spawn ?? START_SPAWN;
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    this.flags = {};
    this.inventory = [];
    this.gifts = [];
    this.scores = {};
    this.drawn = null;
    this.map = START_MAP;
    this.spawn = START_SPAWN;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Глобальный синглтон — один на игру. */
export const gameState = new GameState();
