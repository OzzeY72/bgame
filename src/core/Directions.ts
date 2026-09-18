import type { Dir } from '../types';
import { DIR_ROWS } from '../config';

export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
};

export function dirRow(dir: Dir): number {
  return DIR_ROWS.indexOf(dir);
}

export function dirFromVector(dx: number, dy: number, fallback: Dir): Dir {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export function opposite(dir: Dir): Dir {
  return ({ down: 'up', up: 'down', left: 'right', right: 'left' } as const)[dir];
}
