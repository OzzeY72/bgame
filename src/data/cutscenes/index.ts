import { TILE } from '../../config';
import { bus } from '../../core/EventBus';
import { launchFireworks } from '../../systems/Fireworks';
import type { Cutscene } from '../../types';
import { meGiftLines } from '../gifts';
import { EDITED_CUTSCENES } from './edited';

/**
 * Катсцены в духе Stardew Valley event scripts: последовательность команд.
 * Полный список команд — src/types.ts (CutsceneCmd) и docs/MECHANICS.md.
 * `once: true` — ставит флаг cutscene:<id> и больше не запускается.
 * `if: [...]` — условия по флагам ("!flag" = флаг не стоит).
 * Катсцены из редактора (editor.html) лежат в edited.ts и перекрывают одноимённые отсюда.
 */
export const HANDMADE_CUTSCENES: Record<string, Cutscene> = {
  /** Вступление: девушка выходит из подъезда, Фрея бежит к ней. */
  intro: {
    id: 'intro',
    once: true,
    script: [
      { fade: 'in', ms: 800 },
      { wait: 400 },
      { think: 'Сегодня какой-то особенный день. Только вот какой?' },
      { actor: 'player', move: [0, 1] },
      { parallel: [
        { actor: 'freya', path: [[7, 5], [6, 6]], speed: 110 },
        { actor: 'player', face: 'right' },
      ] },
      { actor: 'freya', face: 'left' },
      { actor: 'freya', emote: '!' },
      { say: 'freya', text: 'Гав!' },
      { actor: 'player', emote: '?' },
      { think: 'Она ведёт себя странно. Может, стоит прогуляться?' },
      { setFlag: 'intro_done' },
    ],
  },

  /** Первый вход на почту: камера показывает зайчонка, реплика. */
  post_first_visit: {
    id: 'post_first_visit',
    once: true,
    script: [
      { wait: 300 },
      { camera: { pan: [6, 3], ms: 700 } },
      { actor: 'rabbit', emote: '!' },
      { say: 'rabbit', text: 'О! Вы, наверное, за посылками!' },
      { camera: { follow: 'player' } },
    ],
  },

  /**
   * Разговор с зайчонком. Пока посылки не собраны — обычный диалог. Собраны все (gifts_all) — автор (me)
   * выходит за прилавок, посылки из инвентаря открываются по очереди с его комментариями (meGiftLines),
   * затем все выходят на улицу → финал (катсцена finale на post_outside).
   */
  rabbit_post: {
    id: 'rabbit_post',
    script: [
      { branch: {
        if: ['gifts_all', '!gifts_opened'],
        then: [
          { say: 'rabbit', text: 'Все посылки собрали? Отлично. Только открывать будем не сразу.' },
          { say: 'rabbit', text: 'Отправитель просил дождаться его. Он... уже тут, вообще-то.' },
          // игрок — к прилавку спереди (если стоял за прилавком — обходит его с ближнего края)
          { call: async (ctx) => {
            const p = ctx.getActor('player')!;
            if (p.tileY <= 4) {
              const side = p.tileX < 7 ? 2 : 11;
              await p.walkToTile(side, p.tileY);
              await p.walkToTile(side, 6);
            }
            await p.walkToTile(8, 6);
            p.face('up');
          } },
          { sfx: 'open' },
          { spawn: { id: 'me', sprite: 'me', at: [14, 2], dir: 'left' } },
          { actor: 'me', path: [[10, 2], [8, 3]], speed: 80 },
          { actor: 'me', face: 'down' },
          { actor: 'player', emote: '!' },
          { say: 'me', text: '...' },
          { say: 'me', text: 'Охаёшечки дабтебаёшечки, Настасья. Это же я.' },
          { say: 'anastasiia', text: 'А? Ты что тут делаешь?' },
          { say: 'me', text: 'На повозке своей приехал, товаров заморских привёз' },
          { say: 'anastasiia', text: 'Чел, ну давай открывай уже подарки что ты ждёшь?' },
          { say: 'anastasiia', text: 'Что в коробках?' },
          { say: 'me', text: 'Чел...' },
          { say: 'me', text: 'Нииизнаю', portrait: 'me_dontknow' },
          { say: 'me', text: 'Открывать буду по одной, буду комментировать, иначе не выдержу из-за СДВГ.' },
          { call: async (ctx) => {
            const fillers = ['Дальше.', 'Следующая.', 'Так, теперь эта.', 'Ещё одна.'];
            let k = 0;
            for (const g of ctx.state.gifts) {
              if (ctx.state.flag(`opened:${g.id}`)) continue;
              await ctx.dialogue.lines([{ who: 'me', text: k === 0 ? 'Начнём с первой.' : fillers[(k - 1) % fillers.length] }]);
              await ctx.openGift(g, [8, 4]);
              await ctx.dialogue.lines(meGiftLines(ctx.state, g.item));
              k++;
            }
          } },
          { say: 'me', text: 'Это всё. Ну... почти всё. Выйдем на улицу?' },
          { say: 'rabbit', text: 'Я закрываюсь на технический перерыв.' },
          { setFlag: 'gifts_opened' },
          { actor: 'me', emote: '♥' },
          { fade: 'out', ms: 500 },
          { warp: { map: 'post_outside', spawn: 'fromInside' } },
        ],
        else: [{ dialogue: 'rabbit_post' }],
      } },
    ],
  },

  /** Финал (post_outside, после gifts_opened): все выходят, маленький салют, поздравления. */
  finale: {
    id: 'finale',
    once: true,
    if: ['gifts_opened'],
    script: [
      { fade: 'in', ms: 600 },
      { actor: 'player', moveTo: [14, 6] },
      { spawn: { id: 'me2', sprite: 'me', at: [15, 4], dir: 'down' } },
      { actor: 'me2', moveTo: [16, 6] },
      { spawn: { id: 'rabbit2', sprite: 'rabbit', at: [14, 4], dir: 'down' } },
      { actor: 'rabbit2', moveTo: [12, 6] },
      { parallel: [
        { actor: 'me2', face: 'down' },
        { actor: 'rabbit2', face: 'down' },
        { actor: 'player', face: 'down' },
      ] },
      { spawn: { id: 'freya2', sprite: 'freya', at: [1, 6], dir: 'down' } },
      { actor: 'freya2', path: [[10, 6]], speed: 140 },
      { actor: 'freya2', emote: '♥' },
      { say: 'freya', text: 'Гав! Гав!' },
      { think: 'Все здесь. Даже Фрея. Особенно Фрея.' },
      { say: 'me', text: 'Так. Зайчонок, давай.' },
      { say: 'rabbit', text: 'Секундочку... вот.' },
      { camera: { pan: [13, 4], ms: 700 } },
      // салют идёт фоном, пока говорят
      { call: (ctx) => {
        void launchFireworks(ctx.world, { count: 7, gapMs: 900, from: { x0: 8 * TILE, x1: 19 * TILE, y: 7.5 * TILE }, top: { y0: 0.5 * TILE, y1: 2.5 * TILE } });
      } },
      { wait: 900 },
      { say: 'me', text: 'С днём рождения.' },
      { say: 'rabbit', text: 'С днём рождения! От всего отделения новой пошты' },
      { say: 'freya', text: 'Гав.' },
      { say: 'me', text: 'Салют маленький, потому что у бедолаги деньги кончились. Но от души - большой.' },
      { think: 'Кажется, теперь понятно, какой сегодня день.' },
      { call: async (ctx) => {
        bus.emit('banner', { text: 'С днём рождения, Настасья!', ms: 3200 });
        void launchFireworks(ctx.world, { count: 5, gapMs: 500, from: { x0: 8 * TILE, x1: 19 * TILE, y: 7.5 * TILE }, top: { y0: 0.5 * TILE, y1: 2.5 * TILE } });
        await new Promise<void>((res) => ctx.world.time.delayedCall(3400, res));
      } },
      { camera: { follow: 'player' } },
      { say: 'me', text: 'Ладно. Мы пойдём. А ты гуляй - день ещё не закончился.' },
      { setFlag: 'finale_done' },
      { parallel: [
        { actor: 'rabbit2', path: [[14, 4]], speed: 70 },
        { actor: 'me2', path: [[16, 8], [25, 8]], speed: 90 },
        { actor: 'freya2', path: [[10, 8], [0, 8]], speed: 140 },
      ] },
      { remove: 'rabbit2' },
      { remove: 'me2' },
      { remove: 'freya2' },
      // P.S. от автора: цвета букета, который скоро привезёт курьер
      { call: () => new Promise<void>((resolve) => {
        bus.emit('reveal', { image: 'bouquet_colors', caption: 'Скоро к тебе заглянет курьер с букетом — вот его краски.' });
        bus.once('reveal:closed', () => resolve());
      }) },
    ],
  },

  /** Пасхалка: компьютер зайчонка на прилавке → «банковское приложение» (мини-игра bank). */
  post_computer: {
    id: 'post_computer',
    script: [
      { branch: {
        if: ['!minigame:bank:played'],
        then: [{ think: 'Компьютер. Не заблокирован. Открыт... банк?' }],
        else: [{ think: 'Снова этот компьютер.' }],
      } },
      { minigame: 'bank' },
      { branch: {
        if: ['minigame:bank:won', '!minigame:bank:lost'], // lost — последний заход закрыт до «оплаты»
        then: [{ actor: 'player', emote: '...' }, { think: 'Так. Этого я не видела.' }],
        else: [{ think: 'Лучше не трогать чужое.' }],
      } },
    ],
  },

  // ---------------------------------------------------------------- двор: покорми Фрею

  /**
   * Разговор с Фреей во дворе. Первый раз — диалог freya_yard; повторно — она просит есть/играть →
   * мини-игра feed. После победы у лавочки появляется коробка (feed_gift), играть можно ещё.
   */
  freya_talk: {
    id: 'freya_talk',
    script: [
      { branch: {
        if: ['!talked:freya'],
        then: [{ dialogue: 'freya_yard' }],
        else: [
          { actor: 'freya', emote: '!' },
          { branch: {
            if: ['!minigame:feed:played'],
            then: [
              { say: 'freya', text: 'Гав. Гав-гав. Гав!' },
              { think: 'Смотрит то на меня, то на подъезд. Она же ещё не ела. И мяч там остался.' },
              { say: 'anastasiia', text: 'Ладно, ладно. Сейчас всё будет. Только по очереди.' },
            ],
            else: [
              { say: 'freya', text: 'Гав?' },
              { think: 'Опять? Ну хорошо. Ей, кажется, понравилось.' },
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
                then: [{ think: 'Ляля сытая, довольная. А у лавочки... коробка. Она там точно лежала?' }],
                else: [{ think: 'Сытая и довольная. Кажется, это её любимая игра.' }],
              } },
            ],
            else: [
              { actor: 'freya', emote: '...' },
              { say: 'freya', text: 'Гав.' },
              { think: 'Обиделась. Ничего, ещё попробуем.' },
            ],
          } },
        ],
      } },
    ],
  },

  // ---------------------------------------------------------------- канализация (ритм-битва)

  /** Люк во дворе: спуск в канализацию. */
  sewer_enter: {
    id: 'sewer_enter',
    script: [
      { branch: {
        if: ['!sewer_visited'],
        then: [
          { think: 'Люк. Приоткрыт. И оттуда... музыка?' },
          { actor: 'player', emote: '?' },
          { think: 'Ну, раз день особенный полезу на помойку.' },
          { think: 'Люблю запах канализации' },
          { setFlag: 'sewer_visited' },
        ],
        else: [{ think: 'Снова вниз.' }],
      } },
      { sfx: 'whoosh' },
      { fade: 'out', ms: 400 },
      { warp: { map: 'sewer', spawn: 'top' } },
    ],
  },

  sewer_first_visit: {
    id: 'sewer_first_visit',
    once: true,
    script: [
      { fade: 'in', ms: 600 },
      { think: 'Сыро. Темно. И где-то справа кто-то напевает.' },
    ],
  },

  /** Монстр у коробки: реплики → мини-игра rhythm → развязка по результату. */
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
      { sfx: 'pohui'},
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
          { think: 'Уплыл. А коробка осталась.' },
        ],
        else: [
          { say: 'monster', text: 'Бро, тебе надо больше тренироваться' },
          { actor: 'player', move: [-1, 0] },
        ],
      } },
    ],
  },

  // ---------------------------------------------------------------- улица: небо (шахеды)

  /** Фрея прибегает, лает в небо → мини-игра shahed. */
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

  // ---------------------------------------------------------------- улица: мольберт (рисовалка)

  easel_draw: {
    id: 'easel_draw',
    script: [
      { branch: {
        if: ['!minigame:draw:won'],
        then: [{ think: 'Мольберт посреди улицы. И записка: «Нарисуй свой любимый предмет и получишь его».' }],
        else: [{ think: 'Мольберт. Можно нарисовать что-то.' }],
      } },
      { minigame: 'draw' },
      { branch: {
        if: ['minigame:draw:won', '!minigame:draw:lost'], // lost — последний заход отменён
        then: [
          { sfx: 'gift' },
          { branch: {
            if: ['packed:easel_gift'], // посылка уже в инвентаре — внутри теперь новый рисунок
            then: [{ think: 'Готово. Посылка в инвентаре, кажется, стала тяжелее.' }],
            else: [{ think: 'Готово. Коробка рядом, кажется, стала тяжелее.' }],
          } },
        ],
        else: [{ think: 'Потом дорисую.' }],
      } },
    ],
  },

};

export const CUTSCENES: Record<string, Cutscene> = { ...HANDMADE_CUTSCENES, ...EDITED_CUTSCENES };

export function getCutscene(id: string): Cutscene {
  const c = CUTSCENES[id];
  if (!c) throw new Error(`Катсцена "${id}" не найдена. Добавь её в src/data/cutscenes/index.ts`);
  return c;
}
