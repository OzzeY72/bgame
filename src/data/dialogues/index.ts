import type { Dialogue } from '../../types';
import { totalGifts } from '../gifts';
import { EDITED_DIALOGUES } from './edited';

/**
 * Все диалоги игры. Ключ — id, на который ссылаются карты/катсцены.
 * Реплика: { who: 'anastasiia', text: '...' }  — с портретом и именем
 *          { think: true, text: '...' }   — внутренний монолог
 *          sfx: 'bark' — звук при появлении реплики
 * Функция от state — для вариативности по флагам.
 * Текст — черновик-заглушка, финальный сценарий в docs/SCENARIO.md.
 * Диалоги из редактора (editor.html) лежат в edited.ts и перекрывают одноимённые отсюда.
 */
export const HANDMADE_DIALOGUES: Record<string, Dialogue> = {
  /** Первый разговор с Фреей; повторные — катсцена freya_talk (мини-игра feed). */
  freya_yard: [
    { who: 'freya', text: 'Гав! Гав-гав!' },
    { who: 'anastasiia', text: 'Ты чего такая довольная?' },
    { who: 'freya', text: '...' },
    { think: true, text: 'Кажется, она что-то знает. Пойду направо, посмотрю.' },
  ],

  /** Зайчонок (открытие всех посылок — катсцена rabbit_post, здесь остальные случаи). */
  rabbit_post: (state) => {
    if (state.flag('gifts_opened')) {
      return [
        { who: 'rabbit', text: 'Ещё раз с днём рождения! Распишитесь вот тут... шучу.' },
        { who: 'rabbit', text: 'Заходите ещё. Хотя посылок больше нет. Пока.' },
      ];
    }
    const n = state.gifts.length;
    if (n > 0) {
      return [
        { who: 'rabbit', text: `Собрали ${n} из ${totalGifts()}. Остальные где-то там - курьер разнёс куда попало.` },
        { who: 'rabbit', text: 'Когда соберёте все - приносите сюда, откроем вместе.' },
        { who: 'rabbit', text: 'Кстати, не забудьте покормить Фрею' },
      ];
    }
    return [
      { who: 'rabbit', text: 'Здравствуйте! Новая Почта, отделение номер... неважно.' },
      { who: 'rabbit', text: 'На ваше имя пришло несколько посылок. Две здесь, на полках. Остальные курьер разнёс куда попало.' },
      { who: 'anastasiia', text: 'На моё имя? От кого?' },
      { who: 'rabbit', text: 'Отправитель просил не говорить. Но он очень старался.' },
      { who: 'rabbit', text: 'Соберите все - и приносите сюда. Открывать лучше вместе.' },
      { who: 'rabbit', text: 'Кстати, не забудьте покормить Фрею' },
    ];
  },

  item_camera: [
    { think: true, text: 'Коробка с фотоаппаратом. Плёночный, тот самый.' },
    { who: 'anastasiia', text: 'Это же... как он узнал?' },
  ],

  item_vinyl: [
    { think: true, text: 'Виниловый проигрыватель. Тяжёлый.' },
    { who: 'anastasiia', text: 'Теперь точно понятно, кто отправитель.' },
  ],

  me_street: [
    { who: 'me', text: '...' },
    { who: 'me', text: 'Ты меня не видела. Я тут случайно.' },
    { think: true, text: 'Пасхалка найдена.' },
  ],

  // --- подарки за мини-игры ---

  item_headphones: [
    { think: true, text: 'Наушники. Большие, тёплые, как у него.' },
    { who: 'anastasiia', text: 'Теперь ритм точно не потеряю.' },
  ],

  item_dyson: [
    {  who: 'anastasiia', text: 'Dyson?? Ну такое мне надо.' },
  ],

  item_macbook: [
    { think: true, text: 'Ноутбук. Теперь-то валорант лагать не будет' },
    { think: true, text: 'Только вот Riot не адаптировали античит, прийдётся в косынку на нём играть' },
    { who: 'anastasiia', text: 'Это лучший НЕ настоящий подарок за сегодня!!' },
  ],

  sewer_gift_locked: [
    { who: 'monster', text: 'Э-э-э. Сначала ритм.' },
  ],

  easel_gift_locked: [
    { think: true, text: 'Коробка пустая и лёгкая. На ней записка: «Сначала нарисуй».' },
  ],
};

export const DIALOGUES: Record<string, Dialogue> = { ...HANDMADE_DIALOGUES, ...EDITED_DIALOGUES };

export function getDialogue(id: string): Dialogue {
  const d = DIALOGUES[id];
  if (!d) throw new Error(`Диалог "${id}" не найден. Добавь его в src/data/dialogues/index.ts`);
  return d;
}
