import { bus } from './EventBus';

/**
 * Блокировка управления со счётчиком: диалог внутри катсцены не должен снимать
 * блокировку катсцены. lock() и unlock() всегда парные.
 * Шина получает 'input:lock' при первом захвате и 'input:unlock' при последнем освобождении.
 */
let count = 0;

export function lockInput(): void {
  count++;
  if (count === 1) bus.emit('input:lock');
}

export function unlockInput(): void {
  if (count === 0) return;
  count--;
  if (count === 0) bus.emit('input:unlock');
}

export function isInputLocked(): boolean {
  return count > 0;
}

/** Сброс при перезапуске сцены мира (незавершённые катсцены/диалоги обнуляются). */
export function resetInputLock(): void {
  count = 0;
}
