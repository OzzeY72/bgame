import Phaser from 'phaser';
import { TILE } from '../config';
import type { BuiltMap } from './MapLoader';

/**
 * Падающая листва: маленькие «листочки» (placeholder — цветные прямоугольники 3×2 px,
 * потом заменятся на спрайты сакуры) появляются сверху и падают, покачиваясь, вниз.
 * Создаются при входе на локацию и уничтожаются при уходе (привязаны к сцене).
 *
 * Не использует Phaser Particles — рисует кружки/прямоугольники вручную, чтобы
 * сохранить пиксель-арт (без субпиксельного сглаживания).
 */

/** Один листок. */
interface Leaf {
  obj: Phaser.GameObjects.Rectangle;
  /** горизонтальная скорость покачивания, px/сек */
  swaySpeed: number;
  /** амплитуда покачивания, px */
  swayAmp: number;
  /** фаза покачивания */
  swayPhase: number;
  /** вертикальная скорость, px/сек */
  fallSpeed: number;
  /** начальная x (для синусоидального покачивания) */
  baseX: number;
}

/** Цвета placeholder-листочков (сакура: розовый/белый/бледно-розовый). */
const LEAF_COLORS = [
  0xf2a7c3,
  0xf5b6cf,
  0xf8c4d8,
  0xf3cada,
  0xefa0bd,
  0xe98eaf,
  0xe77fa4,
  0xd96f96,
  0xf7d1df,
  0xf9dce7,
  0xeeb5c9,
  0xd98aa8,
  0xc96f91,
  0xb95f82,
  0xf4a8c1,
  0xe88da9,
];

const LEAF_COUNT = 150;        // одновременно на экране
const FALL_MIN = 12;          // min скорость падения, px/s
const FALL_MAX = 28;          // max скорость падения, px/s
const SWAY_AMP_MIN = 8;
const SWAY_AMP_MAX = 22;
const SWAY_SPEED_MIN = 0.8;
const SWAY_SPEED_MAX = 2.0;

/**
 * Создать падающую листву поверх карты. Возвращает cleanup-функцию
 * (вызывается автоматически при SHUTDOWN сцены).
 */
export function addFallingLeaves(scene: Phaser.Scene, built: BuiltMap): () => void {
  const leaves: Leaf[] = [];
  const w = built.widthPx;
  const h = built.heightPx;
  /** depth: между overhead-слоем и UI (листья летят «перед» камерой, но под UI) */
  const depth = 1e5;

  function spawnLeaf(startAtTop: boolean): Leaf {
    const color = Phaser.Utils.Array.GetRandom(LEAF_COLORS);
    const size = Math.random() < 0.5 ? 3 : 2;
    const x = Math.random() * w;
    const y = startAtTop ? -TILE + Math.random() * -TILE : Math.random() * h;
    const obj = scene.add.rectangle(x, y, size, size - 1, color)
      .setOrigin(0.5, 0.5)
      .setDepth(depth)
      .setAlpha(0.55 + Math.random() * 0.35);
    return {
      obj,
      swaySpeed: SWAY_SPEED_MIN + Math.random() * (SWAY_SPEED_MAX - SWAY_SPEED_MIN),
      swayAmp: SWAY_AMP_MIN + Math.random() * (SWAY_AMP_MAX - SWAY_AMP_MIN),
      swayPhase: Math.random() * Math.PI * 2,
      fallSpeed: FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN),
      baseX: x,
    };
  }

  // начальное заполнение — часть листьев уже в кадре, часть сверху
  for (let i = 0; i < LEAF_COUNT; i++) {
    leaves.push(spawnLeaf(i < LEAF_COUNT / 3));
  }

  const update = (_t: number, dt: number) => {
    const sec = dt / 1000;
    for (const leaf of leaves) {
      leaf.swayPhase += leaf.swaySpeed * sec;
      const nx = leaf.baseX + Math.sin(leaf.swayPhase) * leaf.swayAmp;
      leaf.obj.x = Math.round(nx);
      leaf.obj.y = Math.round(leaf.obj.y + leaf.fallSpeed * sec);

      // плавный ветровой дрейф вправо
      leaf.baseX += 3 * sec;

      // листок улетел за карту → перенести наверх
      if (leaf.obj.y > h + TILE || leaf.obj.x > w + TILE * 2 || leaf.obj.x < -TILE * 2) {
        leaf.baseX = Math.random() * w;
        leaf.obj.x = leaf.baseX;
        leaf.obj.y = -TILE - Math.random() * TILE;
        leaf.fallSpeed = FALL_MIN + Math.random() * (FALL_MAX - FALL_MIN);
        leaf.swayAmp = SWAY_AMP_MIN + Math.random() * (SWAY_AMP_MAX - SWAY_AMP_MIN);
        leaf.swaySpeed = SWAY_SPEED_MIN + Math.random() * (SWAY_SPEED_MAX - SWAY_SPEED_MIN);
        leaf.obj.setAlpha(0.55 + Math.random() * 0.35);
        const color = Phaser.Utils.Array.GetRandom(LEAF_COLORS);
        leaf.obj.setFillStyle(color);
      }
    }
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, update);

  const cleanup = () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    for (const leaf of leaves) leaf.obj.destroy();
    leaves.length = 0;
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);

  return cleanup;
}
