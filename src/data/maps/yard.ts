import type { MapDef } from '../../types';
import { BASE_LEGEND } from './legend';

/** Двор. Файл сохранён редактором (editor.html) — можно править и руками. */
export const yard: MapDef = {
  key: 'yard',
  title: 'Двор',
  bg: 0x1b2a1b,
  music: 'home',
  legend: { ...BASE_LEGEND, A: 'curb_up', G: 'door_open_r' },
  //          1111111111222222
  //01234567890123456789012345
  ground: [
    '^^^^^^^^^^^^^^^^^^^^^^^^^^', // 0
    '#w#w####w#w#w##w#w#w#w#w##', // 1
    '#w#w####w#w#w##w#w#w#w#w##', // 2
    '#####oG###################', // 3
    '::::::::::::::::::::::::::', // 4
    '::::::::::::::::::::::::::', // 5
    'AAAAAAAAAAAAAAAAAAAAAAAAAA', // 6
    '==========================', // 7
    '--------------------------', // 8
    '==========================', // 9
    '__________________________', // 10
    '..........................', // 11
    '..........................', // 12
    '..........................', // 13
    '..........................', // 14
  ],
  objects: [
    '                          ', // 0
    '                          ', // 1
    '     cc                   ', // 2
    '                          ', // 3
    '                          ', // 4
    '  L         B]        L   ', // 5
    '                          ', // 6
    '                          ', // 7
    '                          ', // 8
    '                          ', // 9
    '                          ', // 10
    '   K    b      K      f   ', // 11
    '      f   f               ', // 12
    '        T      f  T  f    ', // 13
    '  f         K          b  ', // 14
  ],
  spawns: {
    start: { x: 5, y: 5, dir: 'down' },
    fromStreet: { x: 24, y: 5, dir: 'left' },
    fromSewer: { x: 12, y: 9, dir: 'down' },
  },
  exits: [
    { x: 25, y: 4, w: 1, h: 6, to: 'street', spawn: 'fromYard' },
  ],
  npcs: [
    { id: 'freya', sprite: 'freya', x: 8, y: 4, dir: 'down', cutscene: 'freya_talk' },
  ],
  items: [
    { id: 'hatch', sprite: 'prop_hatch', x: 12, y: 8, cutscene: 'sewer_enter', passable: true },
    { id: 'feed_gift', sprite: 'prop_gift', x: 10, y: 5, gift: { item: 'macbook', unlock: 'minigame:feed:won' }, dialogue: 'item_macbook', if: ['minigame:feed:won'] },
  ],
  onEnter: ['intro'],
  outdoor: true,
  leaves: true,
  ambient: ['bird-ambience', 'wind'],
};
