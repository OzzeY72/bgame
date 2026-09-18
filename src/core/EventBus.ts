import Phaser from 'phaser';

/**
 * Шина событий между сценами (World <-> UI) и системами.
 * События:
 *   dialogue:show   { line }            UI показывает реплику
 *   dialogue:hide                      UI прячет панель
 *   dialogue:advance                   игрок нажал "дальше"
 *   dialogue:choice { index }          игрок выбрал вариант
 *   prompt:show { text } / prompt:hide подсказка "E — поговорить"
 *   input:lock / input:unlock          блокировка управления (катсцены)
 *   map:enter { title }                название локации (тост)
 *   toast { text }                     произвольный тост (получен подарок и т.п.)
 *   banner { text, ms }                крупная надпись по центру (финал)
 *   reveal { image, caption } / reveal:closed   картинка с подписью по центру, ждёт клика/клавиши (финал)
 *   inventory:change                   инвентарь/посылки изменились (UI перерисовывает иконки)
 *   cutscene:start / cutscene:end      { id }
 *   minigame:start { id } / minigame:end { id, result }   мини-игра (minigames/index.ts)
 *   audio:mute { muted }
 */
export const bus = new Phaser.Events.EventEmitter();
