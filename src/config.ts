/**
 * Глобальные константы игры. Единственное место, где живут размеры.
 * Если меняешь TILE или размер персонажа — обнови docs/ART_STYLE.md и pipeline/config.yaml.
 */
export const TILE = 32;                 // размер тайла в пикселях
export const GAME_WIDTH = TILE * 16;    // 512 — внутреннее разрешение (16 тайлов)
export const GAME_HEIGHT = TILE * 9;    // 288 — (9 тайлов). Масштабируется до окна с сохранением пикселей.
/**
 * Канвас рендерится в RENDER_SCALE раз крупнее игрового разрешения, а камеры каждой сцены стоят на
 * zoom = RENDER_SCALE (core/Render.ts). Спрайты и тайлы от этого не меняются (nearest), зато текст,
 * который рисуется через canvas и не ложится на пиксельную сетку, получается резким (resolution = RENDER_SCALE).
 * Все координаты в игре по-прежнему в 512x288.
 */
export const RENDER_SCALE = 3;

export const CHAR_FRAME = { w: 48, h: 96 };   // кадр девушки/автора: фигура ~80 px (2.5 тайла) — на 32×64 лицо было 4-5 px
export const SMALL_FRAME = { w: 96, h: 96 };  // зайчонок: фигура ~66 px
export const DOG_FRAME = { w: 96, h: 64 };    // Фрея: рост ~2/3 Настасьи (54 px), в профиль шире, чем выше — 3×2 тайла
export const MONSTER_FRAME = { w: 64, h: 64 }; // монстр из канализации (тело; щупальца рисуются кодом)
export const PORTRAIT_SIZE = 64;              // портрет в диалоге (1x, без масштабирования)

export const WALK_SPEED = 90;           // px/сек, игрок
export const NPC_SPEED = 60;            // px/сек в катсценах по умолчанию
export const WALK_FRAME_RATE = 8;       // кадров/сек анимации ходьбы

export const DIALOGUE = {
  charsPerSec: 40,      // скорость печати
  padding: 6,           // отступ текста от края текстовой области
  fontFamily: '"PixelFont", "Courier New", monospace',
  fontSize: 16,
  nameFontSize: 14,
};

/**
 * Панель диалога — цельная картинка public/assets/ui/dialogue_box.png (не 9-slice: по краям декор).
 * Прямоугольники — в пикселях картинки; их печатает `gen.py post ui --rect ...` (docs/ASSET_PIPELINE.md).
 */
export const DIALOGUE_PANEL = {
  width: 494,
  height: 133,
  x: Math.floor((GAME_WIDTH - 494) / 2),      // по центру, прижата к низу экрана
  y: GAME_HEIGHT - 133,
  text: { x: 18, y: 25, w: 387, h: 101 },     // текстовая область
  portrait: { x: 406, y: 26, w: 81, h: 66 },  // окошко портрета (портрет 64×64 центрируется)
  name: { x: 409, y: 97, w: 75, h: 17 },      // плашка имени
  ink: '#6b3a45',                             // цвет текста на панели
  inkDim: '#9c6b76',                          // мысли / неактивные варианты
};

export const SAVE_KEY = 'bgame.save.v1';
export const START_MAP = 'yard';
export const START_SPAWN = 'start';

/** Порядок направлений = порядок строк в спрайтшите персонажа. */
export const DIR_ROWS = ['down', 'left', 'right', 'up'] as const;
export const WALK_FRAMES = 4;           // кадров на направление (колонок листа): ходьба [шаг, стоим, шаг, стоим]
export const IDLE_FRAME = 1;            // колонка "стоим" — стойка, если у листа нет idle-строк
/**
 * Idle (дыхание): необязательные строки листа ПОД ходьбой — строки 4..7 в порядке DIR_ROWS, по WALK_FRAMES
 * кадров. Лист высотой в 4 кадра тоже годится: тогда стоим на IDLE_FRAME. Индексы ходьбы не сдвигаются.
 */
export const IDLE_FRAME_RATE = 3;       // кадров/сек дыхания (4 кадра ≈ 1.3 с на цикл)

/**
 * Бэкенд мини-игры «нарисуй» (server/draw_server.py). Пусто — тот же origin: в dev Vite проксирует
 * /api на 127.0.0.1:8766 (vite.config.ts). VITE_API_URL=https://... — для сборки под другой хост.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/** Звук: громкости по умолчанию (0..1); сохраняются в localStorage под `key` (сменить ключ = сбросить всем сохранённые). Меняются в настройках (Esc). */
export const AUDIO = { music: 0.2, sfx: 1.0, step: 0.1, key: 'bgame.audio.v2' };

/** Ритм-игра (канализация). Окна попадания — секунды от идеального момента. */
export const RHYTHM = {
  lanes: 4,
  keys: [['A', 'LEFT'], ['S', 'DOWN'], ['W', 'UP'], ['D', 'RIGHT']] as const,
  pxPerBeat: 96,          // скорость стрелок
  receptorY: 44,          // строка приёмников (стрелки едут снизу вверх)
  windows: { perfect: 0.05, good: 0.11, ok: 0.17 },
  health: { start: 50, perfect: 3, good: 2, ok: 1, miss: -9 },
  targetScore: 1500,       // набрать меньше — проигрыш (усложнение)
  leadBeats: 8,           // отсчёт перед музыкой (2 такта)
  /** нота мелодии ниже этого MIDI не попадает в чарт (левая рука пиано) */
  minMidi: 72,
  /** минимальный интервал между стрелками, сек (ноты чаще — сливаются в одну) */
  minGapSec: 0.32,
  /**
   * Вторая стадия босса: с доли `atFrac` чарта в случайные моменты на экране появляются круги-мишени —
   * кольцо сужается от radiusFrom к radiusTo за `life` секунд, кликнуть надо, когда кольцо совпало с кругом.
   */
  stage2: {
    atFrac: 0.5,            // с какой доли чарта (0..1) начинается стадия
    everyMin: 1.3,          // пауза между мишенями, сек
    everyMax: 3.0,
    life: 1.5,              // время сужения кольца, сек
    radiusFrom: 58,
    radiusTo: 13,
    windowsPx: { perfect: 4, good: 11 }, // разница радиусов кольца и круга в момент клика
    area: { x0: 40, x1: 265, y0: 70, y1: 250 }, // где появляются (левая часть, у монстра)
  },
};

/** «Покорми Фрею» (двор): в облачке над Фреей — что она хочет, надо успеть подать это с подноса. */
export const FEED = {
  rounds: 12,             // просьб за раунд
  maxMiss: 3,             // ошибок + опозданий больше — проигрыш
  timeFrom: 2.0,          // сек на первую просьбу (было 2.4)
  timeTo: 0.8,            // сек на последнюю (было 1.0; между ними — линейно)
  gapSec: 0.4,            // пауза между просьбами (было 0.55)
  shuffleFrom: 7,         // с этой просьбы предметы на подносе меняются местами
  scoreHit: 100,
  scoreFast: 50,          // бонус, если успела в первой половине отведённого времени
  keys: [['ONE', 'A'], ['TWO', 'S'], ['THREE', 'D']] as const, // по слотам подноса слева направо
};

/** Сбивание шахедов. */
export const SHAHED = {
  durationSec: 55,
  enemies: 14,            // сколько шахедов за раунд
  friendlies: 6,          // зелёные — сбивать нельзя
  scoreEnemy: 100,
  scoreFriendly: -150,
  maxMissed: 3,           // пропустил больше — проигрыш
  targetScore: 700,       // набрать меньше — проигрыш
  ammo: 22,               // ракет на раунд; кончились — раунд завершается
  fireRate: 3,            // пусков в секунду (перезарядка)
  rocketSpeed: 330,       // px/s, летит по прямой до края экрана
  blast: 13,              // радиус подрыва у врага, px
  blastFriendly: 9,
  enemySpeed: [80, 130] as [number, number],   // px/s
  friendSpeed: [100, 150] as [number, number],
  loop: {                 // манёвры дронов
    chance: 0.5,          // шанс уйти в петлю, когда таймер nextLoop вышел
    durSec: [1.1, 1.8] as [number, number],   // оборот, с
    everySec: [1.5, 4] as [number, number],   // пауза между петлями, с
    wanderMax: 1.0,       // предел рысканья от базового курса, рад
    wanderRate: 5,        // скорость блуждания рысканья, рад/с²
    turnRate: 4,          // как быстро дрон доворачивает на курс, рад/с
  },
};
