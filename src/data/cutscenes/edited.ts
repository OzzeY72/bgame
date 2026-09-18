import type { Cutscene } from '../../types';

/**
 * Катсцены, сохранённые редактором (editor.html → «Катсцены»). Файл переписывается целиком,
 * руками не править — правки потеряются. Перекрывают одноимённые из index.ts.
 */
export const EDITED_CUTSCENES: Record<string, Cutscene> = {
  intro: {
    id: 'intro',
    once: true,
    script: [
      { fade: 'in', ms: 800 },
      { wait: 400 },
      { think: 'Солнце светит как-то необычно' },
      { think: 'Чувствую сегодня какой-то особенный день.' },
      { actor: 'player', move: [0, 1] },
      { parallel: [
        { actor: 'freya', path: [[7, 5], [7, 6]], speed: 110 },
        { actor: 'player', face: 'right' },
      ] },
      { actor: 'freya', face: 'down' },
      { actor: 'freya', emote: '!' },
      { say: 'freya', text: 'Гав!' },
      { actor: 'player', emote: '?' },
      { think: 'Она ведёт себя странно. Может, стоит прогуляться?' },
      { setFlag: 'intro_done' },
    ],
  },
  freya_talk: {
    id: 'freya_talk',
    script: [
      { branch: {
        if: ['!talked:freya'],
        then: [
          { dialogue: 'freya_yard' },
        ],
        else: [
          { actor: 'freya', emote: '!' },
          { branch: {
            if: ['!minigame:feed:played'],
            then: [
              { say: 'freya', text: 'Гав. Гав-гав. Гав!' },
              { think: 'Смотрит то на меня, то на подъезд. Малыш же ещё не кормлен и не выгулян.' },
              { say: 'anastasiia', text: 'Чел ладно, ладно. Щас всё будет. Только по очереди.' },
            ],
            else: [
              { say: 'freya', text: 'Гав?' },
              { think: 'Опять? Чел ну хорошо. Тебе кажется, понравилось.' },
            ],
          } },
          { minigame: 'feed' },
          { branch: {
            if: ['minigame:feed:won', '!minigame:feed:lost'],
            then: [
              { actor: 'freya', emote: '♥' },
              { say: 'freya', text: 'Гав!' },
              { branch: {
                if: ['!packed:feed_gift'],
                then: [
                  { think: 'Лялечка сытая, довольная. А у лавочки... что это?' },
                  { think: 'Хм, Коробка. Она там точно лежала?' },
                ],
                else: [
                  { think: 'Лялечка сытая, довольная. Кажется, это её любимая игра.' },
                ],
              } },
            ],
            else: [
              { actor: 'freya', emote: '...' },
              { say: 'freya', text: 'Гав.' },
              { think: 'Ты шо обиделась?. Ничего, ещё попробуем.' },
            ],
          } },
        ],
      } },
    ],
  },
  sewer_enter: {
    id: 'sewer_enter',
    script: [
      { branch: {
        if: ['!sewer_visited'],
        then: [
          { think: 'Люк. Приоткрыт. И оттуда... музыка?' },
          { actor: 'player', emote: '?' },
          { think: 'Ну, раз день особенный полезу на помойку.' },
          { setFlag: 'sewer_visited' },
        ],
        else: [
          { think: 'Люблю запах канализации' },
        ],
      } },
      { sfx: 'whoosh' },
      { fade: 'out', ms: 400 },
      { warp: { map: 'sewer', spawn: 'top' } },
    ],
  },
  sewer_monster: {
    id: 'sewer_monster',
    if: ['!minigame:rhythm:won'],
    script: [
      { actor: 'player', face: 'right' },
      { camera: { pan: [17, 7], ms: 500 } },
      { actor: 'monster', emote: '!' },
      { sfx: 'roar' },
      { say: 'monster', text: 'Стой. Рааасширение территории.' },
      { say: 'monster', text: 'Одалеешь меня в музыкальной битве, Саске, будет коробка твоей. Дабтебає' },
      { say: 'anastasiia', text: 'Чел, мне похуй' },
      { camera: { follow: 'player' } },
      { minigame: 'rhythm' },
      { branch: {
        if: ['minigame:rhythm:won'],
        then: [
          { actor: 'monster', emote: '...' },
          { say: 'monster', text: 'На этот раз ты одалел меня, Саске. Но кто знает что будет в будущем.' },
          { say: 'monster', text: 'Заходи ещё. Тут скучно.' },
          { actor: 'monster', emote: '♥' },
          { wait: 400 },
          { sfx: 'splash' },
          { remove: 'monster' },
          { think: 'Чел сьебал. А коробку забыл.' },
        ],
        else: [
          { say: 'monster', text: 'Бро, тебе надо больше тренироваться' },
          { actor: 'player', move: [-1, 0] },
        ],
      } },
    ],
  },
  sky_alarm: {
    id: 'sky_alarm',
    if: ['!minigame:shahed:won'],
    script: [
      { sfx: 'alert' },
      { think: 'Опять этот звук.' },
      { spawn: { id: 'freya2', sprite: 'freya', at: [2, 5], dir: 'right' } },
      { parallel: [
        { actor: 'freya2', path: [[6, 5]], speed: 130 },
        { actor: 'player', face: 'left' },
      ] },
      { actor: 'freya2', face: 'up' },
      { actor: 'freya2', emote: '!' },
      { say: 'freya', text: 'Гав! Гав-гав-гав!' },
      { think: 'Малыш смотрит в небо. Там шахеды летят' },
      { minigame: 'shahed' },
      { branch: {
        if: ['minigame:shahed:won'],
        then: [
          { actor: 'freya2', emote: '♥' },
          { say: 'freya', text: 'Гав!' },
          { think: 'Небо чистое. А на газоне слева... коробка? Её тут не было.' },
          { actor: 'freya2', path: [[2, 5]], speed: 130 },
          { remove: 'freya2' },
        ],
        else: [
          { think: 'Не все. Надо попробовать ещё.' },
          { actor: 'freya2', path: [[2, 5]], speed: 130 },
          { remove: 'freya2' },
        ],
      } },
    ],
  },
  easel_draw: {
    id: 'easel_draw',
    script: [
      { branch: {
        if: ['!minigame:draw:won'],
        then: [
          { think: 'Мольберт посреди улицы. И записка: «Нарисуй свой любимый предмет  и получишь его».' },
        ],
        else: [
          { think: 'Мольберт. Можно нарисовать что-то.' },
        ],
      } },
      { minigame: 'draw' },
      { branch: {
        if: ['minigame:draw:won', '!minigame:draw:lost'],
        then: [
          { sfx: 'gift' },
          { branch: {
            if: ['packed:easel_gift'],
            then: [
              { think: 'Готово. Посылка в инвентаре, кажется, стала тяжелее.' },
            ],
            else: [
              { think: 'Готово. Коробка рядом, кажется, стала тяжелее.' },
            ],
          } },
        ],
        else: [
          { think: 'Потом дорисую.' },
        ],
      } },
    ],
  },
};
