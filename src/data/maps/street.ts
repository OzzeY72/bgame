import type { MapDef } from '../../types';
import { BASE_LEGEND } from './legend';

/** Улица. Файл сохранён редактором (editor.html) — можно править и руками. */
export const street: MapDef = {
  key: 'street',
  title: 'Улица',
  bg: 0x1b2a1b,
  music: 'home',
  legend: { ...BASE_LEGEND, A: 'curb_up' },
  //          1111111111222222
  //01234567890123456789012345
  ground: [
    '..........................', // 0
    '..........................', // 1
    '..........................', // 2
    '..........................', // 3
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
    'y  T          y       T   ', // 0
    '        f         y       ', // 1
    ' K  y K   b y  K    K   K ', // 2
    'FFFFFFFFFFFFFFFFFFFFFFFFFF', // 3
    '                          ', // 4
    '     L           L        ', // 5
    '                          ', // 6
    '                          ', // 7
    '                          ', // 8
    '                          ', // 9
    '                          ', // 10
    '   K      hbh  K   K   K  ', // 11
    ' y      y                 ', // 12
    '       K                f ', // 13
    '   y            y         ', // 14
  ],
  spawns: {
    fromYard: { x: 1, y: 5, dir: 'right' },
    fromPost: { x: 24, y: 5, dir: 'left' },
  },
  exits: [
    { x: 0, y: 4, w: 1, h: 6, to: 'yard', spawn: 'fromStreet' },
    { x: 25, y: 4, w: 1, h: 6, to: 'post_outside', spawn: 'fromStreet' },
  ],
  npcs: [
    { id: 'me', sprite: 'me', x: 11, y: 13, dir: 'up', dialogue: 'me_street', if: ['!gifts_opened'] },
  ],
  items: [
    { id: 'easel', sprite: 'prop_easel', x: 20, y: 12, cutscene: 'easel_draw' },
    { id: 'easel_gift', sprite: 'prop_gift', x: 22, y: 12, gift: { item: 'drawn', unlock: 'minigame:draw:won', lockedDialogue: 'easel_gift_locked' } },
    { id: 'sky_gift', sprite: 'prop_gift', x: 10, y: 6, gift: { item: 'dyson', unlock: 'minigame:shahed:won' }, dialogue: 'item_dyson', if: ['minigame:shahed:won'] },
  ],
  triggers: [
    { id: 'sky', x: 8, y: 4, w: 2, h: 6, cutscene: 'sky_alarm', if: ['!minigame:shahed:won'] },
  ],
  outdoor: true,
  leaves: true,
  ambient: ['bird-ambience', 'wind', 'cicadas'],
};
