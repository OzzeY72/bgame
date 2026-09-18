import Phaser from 'phaser';

export interface TentacleOptions {
  segments?: number;
  /** длина сегмента у основания, к кончику сужается */
  segLen?: number;
  /** угол покоя (радианы, 0 — вправо, -PI/2 — вверх) */
  angle?: number;
  /** толщина у основания */
  width?: number;
  color?: number;
  colorDark?: number;
  suckerColor?: number;
  /** фазовый сдвиг, чтобы щупальца не двигались синхронно */
  phase?: number;
  /** зеркалить изгибы */
  flip?: boolean;
}

/**
 * Процедурное щупальце: цепочка сегментов, угол каждого = угол покоя + сумма медленных волн
 * (амплитуда растёт к кончику) + бегущий импульс от kick() (спружиненный «взмах», уходящий к кончику)
 * + лёгкое «дыхание» в такт (pulse). Рисуется одним Graphics: сужающийся контур, присоски на внутренней стороне.
 */
export class Tentacle {
  readonly g: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  private o: Required<TentacleOptions>;
  /** бегущие импульсы: позиция вдоль цепи (0..1+), сила */
  private pulses: { pos: number; power: number; sign: number }[] = [];
  private pts: { x: number; y: number }[] = [];
  private t = 0;
  /** насколько щупальце «сжато» (0 — нормально, 1 — прижато к телу) */
  private curl = 0;
  private curlTarget = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: TentacleOptions = {}) {
    this.x = x;
    this.y = y;
    this.o = {
      segments: opts.segments ?? 14,
      segLen: opts.segLen ?? 9,
      angle: opts.angle ?? -Math.PI / 2,
      width: opts.width ?? 12,
      color: opts.color ?? 0x5a3a7a,
      colorDark: opts.colorDark ?? 0x3a2350,
      suckerColor: opts.suckerColor ?? 0xb98ad0,
      phase: opts.phase ?? Math.random() * 10,
      flip: opts.flip ?? false,
    };
    this.g = scene.add.graphics();
  }

  /** Взмах: импульс бежит от основания к кончику. power 0..1. */
  kick(power = 1, sign = Math.random() < 0.5 ? -1 : 1): void {
    this.pulses.push({ pos: 0, power, sign });
    if (this.pulses.length > 4) this.pulses.shift();
  }

  /** Прижать (1) / распустить (0) — например, когда монстр «сжимается». */
  setCurl(v: number): void {
    this.curlTarget = v;
  }

  /** dt — секунды; beatPhase — доля такта 0..1 для дыхания. */
  update(dt: number, beatPhase: number): void {
    this.t += dt;
    this.curl += (this.curlTarget - this.curl) * Math.min(1, dt * 4);
    for (const p of this.pulses) p.pos += dt * 1.6;
    this.pulses = this.pulses.filter((p) => p.pos < 1.4);

    const o = this.o;
    const n = o.segments;
    const flip = o.flip ? -1 : 1;
    const breathe = 1 + 0.06 * Math.sin(beatPhase * Math.PI * 2);
    let ang = o.angle;
    let px = this.x;
    let py = this.y;
    this.pts.length = 0;
    this.pts.push({ x: px, y: py });
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1); // 0 у основания, 1 на кончике
      const t = this.t;
      // три наложенные волны с разной частотой; к кончику амплитуда растёт
      const wave =
        Math.sin(t * 1.3 + o.phase + i * 0.55) * 0.09 * (0.3 + k) +
        Math.sin(t * 2.1 + o.phase * 1.7 + i * 0.9) * 0.05 * (0.2 + k) +
        Math.sin(t * 0.6 + o.phase * 0.3 + i * 0.25) * 0.12 * k;
      // импульсы: колокол вокруг позиции импульса
      let kick = 0;
      for (const p of this.pulses) {
        const d = (k - p.pos) / 0.22;
        kick += p.sign * p.power * Math.exp(-d * d) * 0.55 * (1 - p.pos * 0.4);
      }
      // прижатие: загибаем к телу
      const curlAng = this.curl * 0.18 * (0.5 + k);
      ang += (wave + kick) * flip + curlAng * flip;
      const len = o.segLen * (1 - k * 0.45) * breathe * (1 - this.curl * 0.35);
      px += Math.cos(ang) * len;
      py += Math.sin(ang) * len;
      this.pts.push({ x: px, y: py });
    }
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    const o = this.o;
    const pts = this.pts;
    g.clear();
    // контур (толще) и заливка — сегментами убывающей толщины
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const k = i / (pts.length - 1);
        const w = Math.max(2, o.width * (1 - k * 0.85));
        g.lineStyle(pass === 0 ? w + 2 : w, pass === 0 ? o.colorDark : o.color, 1);
        g.beginPath();
        g.moveTo(pts[i].x, pts[i].y);
        g.lineTo(pts[i + 1].x, pts[i + 1].y);
        g.strokePath();
        // круглые сочленения, чтобы стыки не рвались
        g.fillStyle(pass === 0 ? o.colorDark : o.color, 1);
        g.fillCircle(pts[i + 1].x, pts[i + 1].y, (pass === 0 ? w + 2 : w) / 2);
      }
    }
    // присоски по внутренней стороне
    g.fillStyle(o.suckerColor, 1);
    for (let i = 2; i < pts.length - 1; i += 2) {
      const k = i / (pts.length - 1);
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (o.flip ? -1 : 1);
      const ny = (dx / len) * (o.flip ? -1 : 1);
      const w = Math.max(2, o.width * (1 - k * 0.85));
      const r = Math.max(1, w * 0.22);
      g.fillCircle(a.x + nx * w * 0.3, a.y + ny * w * 0.3, r);
    }
  }

  /** Точка кончика (для эффектов). */
  get tip(): { x: number; y: number } {
    return this.pts[this.pts.length - 1] ?? { x: this.x, y: this.y };
  }

  destroy(): void {
    this.g.destroy();
  }
}
