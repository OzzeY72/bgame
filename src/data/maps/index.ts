import type { MapDef } from '../../types';
import { yard } from './yard';
import { street } from './street';
import { post_outside } from './post_outside';
import { post_inside } from './post_inside';
import { sewer } from './sewer';

export const MAPS: Record<string, MapDef> = { yard, street, post_outside, post_inside, sewer };

export function getMap(key: string): MapDef {
  const m = MAPS[key];
  if (!m) throw new Error(`Карта "${key}" не найдена. Добавь её в src/data/maps/index.ts`);
  return m;
}
