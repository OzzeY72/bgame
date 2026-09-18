import type { DIR_ROWS } from './config';

export type Dir = (typeof DIR_ROWS)[number];

/** Кто говорит: id персонажа из data/characters.ts */
export type CharacterId = string;

/** Одна реплика диалога. `think` — внутренний монолог (без портрета и имени). */
export interface DialogueLine {
  who?: CharacterId;
  text: string;
  /** ключ портрета-эмоции; по умолчанию `${who}_default` */
  portrait?: string;
  /** внутренний монолог */
  think?: boolean;
  /** звук при появлении реплики (ключ из core/Sfx.ts или файл assets/sfx) */
  sfx?: string;
  /** варианты ответа; после выбора продолжится диалог next */
  choices?: { label: string; next?: string; setFlag?: string }[];
}

/** Диалог = массив реплик или функция от состояния (для вариативности по флагам). */
export type Dialogue = DialogueLine[] | ((state: import('./core/GameState').GameState) => DialogueLine[]);

/** Команды катсцены (в духе Stardew Valley event scripts). См. docs/MECHANICS.md */
export type CutsceneCmd =
  | { fade: 'in' | 'out'; ms?: number }
  | { wait: number }
  | { actor: string; move: [dx: number, dy: number]; speed?: number }
  | { actor: string; moveTo: [tx: number, ty: number]; speed?: number }
  | { actor: string; path: [tx: number, ty: number][]; speed?: number }
  | { actor: string; face: Dir }
  | { actor: string; anim: string; stop?: boolean }
  | { actor: string; emote: string; ms?: number }
  | { actor: string; teleport: [tx: number, ty: number] }
  | { say: CharacterId; text: string; portrait?: string }
  | { think: string }
  | { dialogue: string }
  | { camera: { pan: [tx: number, ty: number]; ms?: number } }
  | { camera: { follow: string } }
  | { camera: { shake: number; ms?: number } }
  | { spawn: { id: string; sprite: string; at: [tx: number, ty: number]; dir?: Dir } }
  | { remove: string }
  | { setFlag: string; value?: boolean }
  | { give: string }
  | { warp: { map: string; spawn: string } }
  /** запустить мини-игру (id из minigames/index.ts); по окончании ставит флаги minigame:<id>:won|lost */
  | { minigame: string }
  /** ветвление по флагам: then — если все условия выполнены, иначе else */
  | { branch: { if: string[]; then: CutsceneCmd[]; else?: CutsceneCmd[] } }
  /** сменить фоновую музыку (ключ из data/music.ts; null — тишина) */
  | { music: string | null; ms?: number }
  /** звуковой эффект */
  | { sfx: string }
  | { parallel: CutsceneCmd[] }
  | { call: (ctx: import('./systems/CutsceneRunner').CutsceneContext) => void | Promise<void> };

export interface Cutscene {
  id: string;
  /** запускать один раз (ставит флаг cutscene:<id>) */
  once?: boolean;
  /** условия по флагам: все должны быть true (или false, если с "!") */
  if?: string[];
  script: CutsceneCmd[];
}

/** Описание карты в ASCII. Символ -> имя тайла через legend. */
export interface MapDef {
  key: string;
  title: string;
  /** нижний слой: земля, всегда заполнен */
  ground: string[];
  /** верхний слой (стены, деревья, столбы...) — '.' или ' ' = пусто */
  objects?: string[];
  /** слой "над персонажем" (кроны деревьев, козырьки) */
  overhead?: string[];
  legend: Record<string, string>;
  spawns: Record<string, { x: number; y: number; dir?: Dir }>;
  exits?: { x: number; y: number; w?: number; h?: number; to: string; spawn: string }[];
  npcs?: MapNpc[];
  items?: MapItem[];
  /** зона: игрок вошёл — запускается катсцена (сама проверяет once/if); повторно — только после выхода из зоны */
  triggers?: MapTrigger[];
  /** катсцена при входе на карту (проверяются once/if из самой катсцены) */
  onEnter?: string[];
  /** фоновая музыка локации (ключ из data/music.ts) */
  music?: string;
  /** фоновый эффект локации (ключ из SFX_NAMES): играет случайными паузами, пока игрок на карте */
  ambientSfx?: string;
  /** зацикленные фоновые эмбиент-звуки локации (список ключей из SFX_NAMES, например ['bird-ambience', 'wind']) */
  ambient?: string[];
  /** локация снаружи */
  outdoor?: boolean;
  /** падающая листва (placeholder, потом сакура) */
  leaves?: boolean;
  /** цвет фона за картой */
  bg?: number;
}

export interface MapTrigger {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  cutscene: string;
  if?: string[];
}

export interface MapNpc {
  id: string;
  sprite: string;
  x: number;
  y: number;
  dir?: Dir;
  /** id диалога при взаимодействии */
  dialogue?: string;
  /** или катсцена при взаимодействии */
  cutscene?: string;
  /** не показывать, если флаг стоит / не стоит */
  if?: string[];
  /** ходит ли по кругу (idle-анимация вместо ходьбы) */
  idleAnim?: string;
}

/**
 * Подарок-коробка (посылка): забрать её в инвентарь можно, когда стоит флаг `unlock` (обычно
 * minigame:<id>:won); открываются посылки на почте, когда собраны все (флаг gifts_all).
 * item 'drawn' — предмет, нарисованный в мини-игре (спрайт и подпись берутся из GameState.drawn).
 */
export interface GiftDef {
  item: string;
  unlock?: string;
  /** диалог, пока коробка заперта (по умолчанию — общая реплика) */
  lockedDialogue?: string;
}

export interface MapItem {
  id: string;
  sprite: string;
  frame?: number;
  x: number;
  y: number;
  dialogue?: string;
  cutscene?: string;
  /** взял в инвентарь — исчезает */
  pickup?: boolean;
  /** коробка с подарком (см. GiftDef); `dialogue` — реплики при открытии посылки на почте */
  gift?: GiftDef;
  if?: string[];
  /** проходимый ли (по умолчанию нет) */
  passable?: boolean;
}

/** Результат мини-игры. */
export interface MinigameResult {
  won: boolean;
  score?: number;
}
