import type { GameState } from '../core/GameState';
import type { DialogueLine } from '../types';
import { MAPS } from './maps';

/** Ключ текстуры предмета, нарисованного в мини-игре «нарисуй» (грузится из GameState.drawn.url). */
export const DRAWN_TEXTURE = 'prop_drawn';
/** id предмета-подарка, который «внутри» коробки у мольберта. */
export const DRAWN_ITEM = 'drawn';

/** Названия предметов (для подсказок/тостов). Нарисованный — из GameState.drawn. */
export const ITEM_NAMES: Record<string, string> = {
  camera: 'Фотоаппарат',
  vinyl: 'Проигрыватель',
  headphones: 'Наушники',
  dyson: 'Dyson',
  macbook: 'Макбук 15 плюс',
};

export function itemName(state: GameState, item: string): string {
  if (item === DRAWN_ITEM) return state.drawn?.name ?? 'Рисунок';
  return ITEM_NAMES[item] ?? item;
}

/** Ключ текстуры спрайта предмета. */
export function itemTexture(item: string): string {
  return item === DRAWN_ITEM ? DRAWN_TEXTURE : `prop_${item}`;
}

/** Реплики при открытии коробки, если у предмета нет своего диалога (нарисованный подарок — подпись от нейросети). */
export function defaultGiftLines(state: GameState, item: string): DialogueLine[] {
  if (item === DRAWN_ITEM && state.drawn) {
    return [
      { think: true, text: state.drawn.caption },
      { who: 'anastasiia', text: `Это же... ${state.drawn.name}!` },
    ];
  }
  return [
    { think: true, text: `Внутри — ${itemName(state, item).toLowerCase()}.` },
    { who: 'anastasiia', text: 'Кто-то очень старался.' },
  ];
}

/** Реплики, пока коробка заперта. */
export const LOCKED_GIFT_LINES: DialogueLine[] = [
  { think: true, text: 'Коробка перевязана лентой и не открывается. Похоже, сначала нужно что-то сделать.' },
];

/** Сколько всего посылок в игре: все предметы с `gift` на всех картах. Когда столько же забрано — ставится флаг gifts_all. */
export function totalGifts(): number {
  let n = 0;
  for (const m of Object.values(MAPS)) n += (m.items ?? []).filter((it) => it.gift).length;
  return n;
}

/** Комментарии автора (me) к каждому подарку при открытии на почте. Нарисованный — по названию из GameState.drawn. */
const ME_GIFT_LINES: Record<string, DialogueLine[]> = {
  camera: [
    { who: 'me', text: 'Плёночный. Я знаю, ты хотела именно такой — ты говорила это раз двадцать.' },
    { who: 'me', text: 'Первый кадр — на меня, пожалуйста. Я потренировался стоять красиво.' },
  ],
  vinyl: [
    { who: 'me', text: 'Тяжёлый, да. Нёс сюда сам. Зайчонок помогал морально.' },
    { who: 'me', text: 'Пластинку выбирай сама — я бы обязательно промахнулся.' },
  ],
  headphones: [
    { who: 'me', text: 'Это от б/ушные выторговал за 40 гривен у чела с канализации.' },
  ],
  dyson: [
    { who: 'me', text: 'Dyson уценёночка, нашёл на помойке. Один против пяти бомжей отстоял эту добычу.' },
  ],
  macbook: [
    { who: 'me', text: 'Держи бедолага, а то со своим нищенским ноутом ходишь' },
    { who: 'anastasiia', text: 'Ахринеть, Макс! Ноутбук с помойки! О таком грех было и мечтать. Для всех малоимущих никакого обмана. Спасибо!' },
  ],
};

export function meGiftLines(state: GameState, item: string): DialogueLine[] {
  if (item === DRAWN_ITEM) {
    const name = (state.drawn?.name ?? 'рисунок').toLowerCase();
    return [
      { who: 'me', text: `${capitalize(name)}... Это ты сама нарисовала, а я только упаковал.` },
      { who: 'me', text: 'По-моему, лучший подарок из всех. Хотя я, конечно, необъективен.' },
    ];
  }
  return ME_GIFT_LINES[item] ?? [{ who: 'me', text: 'Про этот подарок я ничего не придумал. Но он от души.' }];
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
