import type { MapDef } from '../../types';
import { BASE_LEGEND } from './legend';

/** Новая Почта — отделение. Файл сохранён редактором (editor.html) — можно править и руками. */
export const post_inside: MapDef = {
  key: 'post_inside',
  title: 'Новая Почта — отделение',
  bg: 0x0b0a10,
  music: 'dusk',
  legend: BASE_LEGEND,
  //          111111
  //0123456789012345
  ground: [
    '@WWWWWWWWWWWWWW@', // 0
    '@qqqqqqqqqqqqqq@', // 1
    '@qqqqqqqqqqqqqq@', // 2
    '@qqqqqqqqqqqqqq@', // 3
    '@qqqqqqqqqqqqqq@', // 4
    '@qqqqqqqqqqqqqq@', // 5
    '@qqqqqqqqqqqqqq@', // 6
    '@qqqqqqqqqqqqqq@', // 7
    '@@@@@@@qq@@@@@@@', // 8
  ],
  objects: [
    '                ', // 0
    ' ssss      ssss ', // 1
    '                ', // 2
    '                ', // 3
    '   CCCCCCCC     ', // 4
    '                ', // 5
    ' x            x ', // 6
    ' x              ', // 7
    '                ', // 8
  ],
  spawns: {
    door: { x: 7, y: 7, dir: 'up' },
  },
  exits: [
    { x: 7, y: 8, w: 2, h: 1, to: 'post_outside', spawn: 'fromInside' },
  ],
  npcs: [
    { id: 'rabbit', sprite: 'rabbit', x: 6, y: 3, dir: 'down', cutscene: 'rabbit_post' },
  ],
  items: [
    { id: 'camera_gift', sprite: 'prop_gift', x: 13, y: 6, gift: { item: 'camera' }, dialogue: 'item_camera' },
    { id: 'vinyl_gift', sprite: 'prop_gift', x: 2, y: 2, gift: { item: 'vinyl' }, dialogue: 'item_vinyl' },
    { id: 'computer', sprite: 'prop_computer', x: 10, y: 3, cutscene: 'post_computer', passable: true },
  ],
  onEnter: ['post_first_visit'],
};
