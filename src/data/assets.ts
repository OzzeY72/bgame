import { PORTRAIT_SIZE, TILE, WALK_FRAMES } from '../config';
import { CHARACTERS } from './characters';
import { MUSIC } from './music';

/**
 * Манифест ассетов. Всё грузится из public/assets/. Если файла нет — PreloadScene
 * рисует заглушку с тем же ключом, и игра работает. Заменяй файлы по мере готовности.
 * Имена файлов и форматы — см. public/assets/README.md и docs/ASSET_LIST.md.
 * Звук (type 'audio') без файла просто синтезируется (core/Synth.ts) — заглушка не нужна.
 */
export interface AssetDef {
  key: string;
  type: 'image' | 'spritesheet' | 'audio';
  url: string;
  frame?: { w: number; h: number };
  /** заглушка (для звука отсутствует) */
  placeholder?: {
    kind: 'tileset' | 'character' | 'monster' | 'portrait' | 'prop' | 'ui' | 'gift' | 'gift_open' | 'hatch' | 'easel' | 'computer' | 'drone' | 'drone_green' | 'bowl' | 'ball' | 'treat' | 'swatch';
    color?: number;
    label?: string;
    frames?: number;
  };
}

/** Звуковые эффекты, для которых можно положить файл assets/sfx/<name>.ogg (иначе — синтез, см. core/Synth.ts). */
export const SFX_NAMES = [
  'blip', 'select', 'pickup', 'gift', 'open', 'locked', 'tick',
  'hit_perfect', 'hit_good', 'hit_ok', 'miss', 'roar',
  'shot', 'explode', 'clank', 'alert', 'wrong', 'drone', 'win', 'lose', 'brush', 'whoosh', 'splash',
  'firework', 'notify', 'drip', 'wind',
] as const;

/** для большинства эффектов файл .ogg; здесь — исключения с другим расширением */
const SFX_EXT: Partial<Record<(typeof SFX_NAMES)[number], string>> = { drip: 'mp3' };

/** сколько файлов голоса на каждого персонажа: assets/voice/<clips>_1.ogg … _<N>.ogg */
export const VOICE_CLIP_COUNTS: Record<string, number> = { anastasiia: 4, me: 3, freya: 3 };

/** ключ загруженного клипа голоса */
export const voiceKey = (clips: string, n: number): string => `voice_${clips}_${n}`;

export const ASSETS: AssetDef[] = [
  { key: 'tiles', type: 'image', url: 'assets/tiles/tileset.png', placeholder: { kind: 'tileset' } },
  { key: 'ui_box', type: 'image', url: 'assets/ui/dialogue_box.png', placeholder: { kind: 'ui' } },
  ...Object.values(CHARACTERS).flatMap((c): AssetDef[] => [
    {
      key: c.sprite,
      type: 'spritesheet',
      url: `assets/characters/${c.sprite}.png`,
      frame: c.frame,
      placeholder: { kind: c.placeholder ?? 'character', color: c.color, label: c.name[0], frames: WALK_FRAMES },
    },
    {
      key: c.portrait,
      type: 'image',
      url: `assets/portraits/${c.sprite}.png`,
      frame: { w: PORTRAIT_SIZE, h: PORTRAIT_SIZE },
      placeholder: { kind: 'portrait', color: c.color, label: c.name[0] },
    },
  ]),
  // --- отдельные эмоции портретов сверх default из characters.ts (ключ = как в portrait: '...' у реплики) ---
  { key: 'me_dontknow', type: 'image', url: 'assets/portraits/me_dontknow.png', frame: { w: PORTRAIT_SIZE, h: PORTRAIT_SIZE }, placeholder: { kind: 'portrait', color: CHARACTERS.me.color, label: '?' } },
  // --- предметы / подарки (32×32) ---
  { key: 'prop_camera', type: 'image', url: 'assets/props/camera.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'prop', color: 0x333333, label: 'Ф' } },
  { key: 'prop_vinyl', type: 'image', url: 'assets/props/vinyl.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'prop', color: 0x222244, label: 'В' } },
  { key: 'prop_headphones', type: 'image', url: 'assets/props/headphones.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'prop', color: 0x5a3a7a, label: 'Н' } },
  { key: 'prop_dyson', type: 'image', url: 'assets/props/dyson.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'prop', color: 0xd4a017, label: 'D' } },
  { key: 'prop_macbook', type: 'image', url: 'assets/props/macbook.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'prop', color: 0xc9455c, label: 'М' } },
  // --- мини-игра «покорми Фрею»: что лежит на подносе ---
  { key: 'prop_bowl', type: 'image', url: 'assets/props/bowl.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'bowl' } },
  { key: 'prop_ball', type: 'image', url: 'assets/props/ball.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'ball' } },
  { key: 'prop_treat', type: 'image', url: 'assets/props/treat.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'treat' } },
  // --- коробка с подарком (закрытая / открытая), люк, мольберт ---
  { key: 'prop_gift', type: 'image', url: 'assets/props/gift.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'gift' } },
  { key: 'prop_gift_open', type: 'image', url: 'assets/props/gift_open.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'gift_open' } },
  { key: 'prop_hatch', type: 'image', url: 'assets/props/hatch.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'hatch' } },
  { key: 'prop_easel', type: 'image', url: 'assets/props/easel.png', frame: { w: TILE, h: TILE * 2 }, placeholder: { kind: 'easel' } },
  // --- компьютер зайчонка на прилавке почты (пасхалка) ---
  { key: 'prop_computer', type: 'image', url: 'assets/props/computer.png', frame: { w: TILE, h: TILE }, placeholder: { kind: 'computer' } },
  // --- цвета букета: показывается баннером после финальной катсцены ---
  { key: 'bouquet_colors', type: 'image', url: 'assets/ui/bouquet_colors.png', frame: { w: 420, h: 57 }, placeholder: { kind: 'swatch' } },
  // --- мини-игра «шахеды» ---
  { key: 'drone_shahed', type: 'image', url: 'assets/minigames/shahed.png', frame: { w: 48, h: 20 }, placeholder: { kind: 'drone' } },
  { key: 'drone_green', type: 'image', url: 'assets/minigames/drone_green.png', frame: { w: 18, h: 12 }, placeholder: { kind: 'drone_green' } },
  // --- музыка (нет файла — синтез темы из data/music.ts) и эффекты ---
  ...Object.entries(MUSIC).map(([key, m]): AssetDef => ({ key, type: 'audio', url: m.file })),
  ...SFX_NAMES.map((n): AssetDef => ({ key: `sfx_${n}`, type: 'audio', url: `assets/sfx/${n}.${SFX_EXT[n] ?? 'ogg'}` })),
  // --- голоса персонажей в диалоге (нет файлов — блип) ---
  ...Object.values(CHARACTERS)
    .filter((c) => c.voice)
    .flatMap((c) => {
      const count = VOICE_CLIP_COUNTS[c.voice!.clips] ?? 4;
      return Array.from({ length: count }, (_, i): AssetDef => ({ key: voiceKey(c.voice!.clips, i + 1), type: 'audio', url: `assets/voice/${c.voice!.clips}_${i + 1}.ogg` }));
    }),
];
