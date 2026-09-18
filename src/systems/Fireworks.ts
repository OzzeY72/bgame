import Phaser from 'phaser';
import { audio } from '../core/Audio';

export interface FireworksOpts {
  /** сколько ракет */
  count?: number;
  /** откуда стартуют (мировые px): диапазон по x, y — земля */
  from: { x0: number; x1: number; y: number };
  /** где взрываются: диапазон по y */
  top: { y0: number; y1: number };
  /** пауза между ракетами, мс */
  gapMs?: number;
}

const COLORS = [0xf7d34a, 0xf2a7c3, 0x43b5e6, 0x8fd19e, 0xf2a24d, 0xc24bd6, 0xffffff];

/**
 * Маленький процедурный салют для финала: ракета (точка с хвостом) взлетает, лопается на искры,
 * искры разлетаются и падают. Всё — кружки + твины, без текстур. Резолвится, когда погасла последняя.
 */
export function launchFireworks(scene: Phaser.Scene, o: FireworksOpts): Promise<void> {
  const count = o.count ?? 6;
  const gap = o.gapMs ?? 700;
  const depth = 1e6 + 10; // над overhead-слоем
  const done: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    done.push(
      new Promise<void>((res) => {
        scene.time.delayedCall(i * gap + Phaser.Math.Between(0, 250), () => {
          const x0 = Phaser.Math.Between(o.from.x0, o.from.x1);
          const x1 = x0 + Phaser.Math.Between(-30, 30);
          const y1 = Phaser.Math.Between(o.top.y0, o.top.y1);
          const color = Phaser.Utils.Array.GetRandom(COLORS);
          audio.sfx('firework', { volume: 0.7 });
          const rocket = scene.add.circle(x0, o.from.y, 1.5, 0xffffff).setDepth(depth);
          const trail: Phaser.GameObjects.Arc[] = [];
          const trailEv = scene.time.addEvent({
            delay: 40,
            loop: true,
            callback: () => {
              const t = scene.add.circle(rocket.x, rocket.y, 1, 0xffe9a8, 0.8).setDepth(depth - 1);
              trail.push(t);
              scene.tweens.add({ targets: t, alpha: 0, duration: 300, onComplete: () => t.destroy() });
            },
          });
          scene.tweens.add({
            targets: rocket,
            x: x1,
            y: y1,
            duration: 700 + Phaser.Math.Between(0, 200),
            ease: 'Quad.easeOut',
            onComplete: () => {
              trailEv.remove();
              rocket.destroy();
              burst(scene, x1, y1, color, depth).then(res);
            },
          });
        });
      }),
    );
  }
  return Promise.all(done).then(() => undefined);
}

function burst(scene: Phaser.Scene, x: number, y: number, color: number, depth: number): Promise<void> {
  audio.sfx('explode', { volume: 0.35, rate: 1.6 });
  const flash = scene.add.circle(x, y, 10, 0xffffff, 0.9).setDepth(depth);
  scene.tweens.add({ targets: flash, scale: 2.2, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
  const n = 22 + Phaser.Math.Between(0, 10);
  const r = 30 + Phaser.Math.Between(0, 18);
  const ps: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const rr = r * (0.7 + Math.random() * 0.4);
    const p = scene.add.circle(x, y, 1.5, Math.random() < 0.25 ? 0xffffff : color).setDepth(depth);
    ps.push(
      new Promise<void>((res) =>
        scene.tweens.add({
          targets: p,
          x: x + Math.cos(a) * rr,
          y: y + Math.sin(a) * rr + 18, // «падают»
          alpha: 0,
          duration: 900 + Phaser.Math.Between(0, 300),
          ease: 'Cubic.easeOut',
          onComplete: () => {
            p.destroy();
            res();
          },
        }),
      ),
    );
  }
  return Promise.all(ps).then(() => undefined);
}
