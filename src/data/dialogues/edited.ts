import type { DialogueLine } from '../../types';

/**
 * Диалоги, сохранённые редактором (editor.html → «Диалоги»). Файл переписывается целиком,
 * руками не править — правки потеряются. Перекрывают одноимённые из index.ts.
 */
export const EDITED_DIALOGUES: Record<string, DialogueLine[]> = {
  item_camera: [
    { think: true, text: 'Коробка с фотоаппаратом. Canon, тот самый' },
    { think: true, text: 'Только нахуя?' },
    { who: 'anastasiia', text: 'Это же... как он узнал?' },
  ],
  item_vinyl: [
    { think: true, text: 'Виниловый проигрыватель. Тяжёлый.' },
    { who: 'anastasiia', text: 'Чел, а ты думал как я его тащить домой буду?' },
    { who: 'me', text: 'Чел, нууу хз', portrait: 'me_dontknow', sfx: 'wrong' },
  ],
  me_street: [
    { who: 'me', text: '...' },
    { who: 'me', text: 'Ты меня не видела. Я тут случайно.' },
    { text: 'Ёбнутый какой-то', who: 'anastasiia' },
  ],
  item_headphones: [
    { think: true, text: 'Наушники. Крутые ' },
    { who: 'anastasiia', text: 'Теперь окончательно оглохну.' },
  ],
};
