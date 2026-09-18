import type { MapDef } from '../../types';
import { BASE_LEGEND } from './legend';

/** Новая Почта. Файл сохранён редактором (editor.html) — можно править и руками. */
export const post_outside: MapDef = {
  key: 'post_outside',
  title: 'Новая Почта',
  bg: 0x1b2a1b,
  music: 'home',
  legend: { ...BASE_LEGEND, A: 'door_open_r', G: 'curb_up' },
  //          1111111111222222
  //01234567890123456789012345
  ground: [
    '..........rrrrrrrrrr......', // 0
    '..........##########......', // 1
    '..........#w#S}#w###......', // 2
    '..........####oA####......', // 3
    '::::::::::::::::::::::::::', // 4
    ':::::::::::::::::::;::::::', // 5
    'GGGGGGGGGGGGGGGGGGGGGGGGGG', // 6
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
    'hhhhhhhhhh          hhhhhh', // 0
    '                          ', // 1
    ' K  K  K                  ', // 2
    '                     K T  ', // 3
    '                          ', // 4
    '     L                L   ', // 5
    '                          ', // 6
    '                          ', // 7
    '                          ', // 8
    '                          ', // 9
    '                          ', // 10
    '   b       B] h   K       ', // 11
    '                          ', // 12
    ' y     T  K    K     K    ', // 13
    '                          ', // 14
  ],
  spawns: {
    fromStreet: { x: 1, y: 5, dir: 'right' },
    fromInside: { x: 14, y: 4, dir: 'down' },
  },
  exits: [
    { x: 0, y: 4, w: 1, h: 6, to: 'street', spawn: 'fromPost' },
    { x: 14, y: 3, w: 2, h: 1, to: 'post_inside', spawn: 'door' },
  ],
  onEnter: ['finale'],
};
