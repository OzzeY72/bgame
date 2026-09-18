import type { MapDef } from '../../types';
import { BASE_LEGEND } from './legend';

/**
 * Локация 5 — Канализация (вход через люк во дворе). Канал с водой и мостик, справа — монстр,
 * который сидит у коробки с подарком: подойдёшь — ритм-битва (мини-игра rhythm).
 * Лестница H в левом верхнем углу — выход обратно во двор.
 */
export const sewer: MapDef = {
  key: 'sewer',
  title: 'Канализация',
  bg: 0x0b0f10,
  music: 'dusk',
  ambientSfx: 'drip',
  legend: BASE_LEGEND,
  //          1111111111222
  //0123456789012345678901
  ground: [
    '%%%%%%%%%%%%%%%%%%%%%%', // 0
    '%Hgggggggg%%%gggggggg%', // 1  лестница H на (1,1)
    '%ggggggggg%%%gggggggg%', // 2
    '%gggggggggggggggggggg%', // 3
    '%~~~~~~~~ggg~~~~~~~~~%', // 4  канал, мостик x=9..11
    '%~~~~~~~~ggg~~~~~~~~~%', // 5
    '%gggggggggggggggggggg%', // 6
    '%ggggggggg%%%gggggggg%', // 7
    '%ggggggggg%%%gggggggg%', // 8  монстр на (17,8), коробка на (19,9)
    '%gggggggggggggggggggg%', // 9
    '%%%%%%%%%%%%%%%%%%%%%%', // 10
  ],
  objects: [
    '                      ',
    '                      ',
    '     x                ',
    '                      ',
    '                      ',
    '                      ',
    '                      ',
    '  x                   ',
    '                      ',
    '                 x    ',
    '                      ',
  ],
  spawns: {
    top: { x: 1, y: 2, dir: 'down' },
  },
  exits: [{ x: 1, y: 1, w: 1, h: 1, to: 'yard', spawn: 'fromSewer' }],
  npcs: [
    { id: 'monster', sprite: 'monster', x: 17, y: 8, dir: 'left', cutscene: 'sewer_monster', if: ['!minigame:rhythm:won'] },
  ],
  items: [
    { id: 'sewer_gift', sprite: 'prop_gift', x: 19, y: 9, gift: { item: 'headphones', unlock: 'minigame:rhythm:won', lockedDialogue: 'sewer_gift_locked' }, dialogue: 'item_headphones' },
  ],
  triggers: [
    { id: 'monster_zone', x: 14, y: 7, w: 2, h: 3, cutscene: 'sewer_monster', if: ['!minigame:rhythm:won'] },
  ],
  onEnter: ['sewer_first_visit'],
};
