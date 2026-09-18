import Phaser from 'phaser';
import type { Dir } from '../types';
import { TILE, WALK_FRAME_RATE, NPC_SPEED, IDLE_FRAME, IDLE_FRAME_RATE } from '../config';
import { TEXT_RESOLUTION } from '../core/Render';
import { dirFromVector } from '../core/Directions';

/**
 * Базовый "актёр": персонаж со спрайтшитом 4 направления x N кадров.
 * Origin (0.5, 1): x,y — точка под ногами. Физическое тело — маленький прямоугольник у ног,
 * чтобы можно было "заходить" за объекты верхней частью спрайта (как в Stardew).
 * Умеет: face(), moveVector(), walkTo() (для катсцен), emote().
 */
export class Actor extends Phaser.Physics.Arcade.Sprite {
  dir: Dir = 'down';
  /** NPC: тело не двигается физикой, пока стоит (не толкается игроком) */
  staticWhenIdle = false;
  readonly spriteKey: string;
  readonly actorId: string;
  private walkTarget: { x: number; y: number; speed: number; resolve: () => void } | null = null;
  private emoteText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, id: string, spriteKey: string, tx: number, ty: number, dir: Dir = 'down') {
    super(scene, (tx + 0.5) * TILE, (ty + 1) * TILE, spriteKey, 0);
    this.actorId = id;
    this.spriteKey = spriteKey;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const bw = Math.min(20, this.width - 4);
    const bh = 12;
    body.setSize(bw, bh);
    body.setOffset((this.width - bw) / 2, this.height - bh);
    this.face(dir);
  }

  get tileX(): number {
    return Math.floor(this.x / TILE);
  }
  get tileY(): number {
    return Math.floor((this.y - 1) / TILE);
  }

  hasAnim(key: string): boolean {
    return this.scene.anims.exists(key);
  }

  face(dir: Dir): void {
    this.dir = dir;
    this.playIdle();
  }

  playIdle(): void {
    const key = `${this.spriteKey}_idle_${this.dir}`;
    if (this.hasAnim(key)) this.play(key, true);
  }

  playWalk(): void {
    const key = `${this.spriteKey}_walk_${this.dir}`;
    if (this.hasAnim(key)) this.play(key, true);
  }

  /** Движение по вектору (единичный вектор * скорость). Само переключает анимацию. */
  moveVector(vx: number, vy: number, speed: number): void {
    this.setVelocity(vx * speed, vy * speed);
    if (vx === 0 && vy === 0) {
      this.playIdle();
      return;
    }
    this.dir = dirFromVector(vx, vy, this.dir);
    this.playWalk();
  }

  stopMoving(): void {
    this.setVelocity(0, 0);
    this.playIdle();
  }

  /** Идти к точке (в пикселях, точка под ногами). Promise завершается по прибытии. */
  walkToPx(px: number, py: number, speed = NPC_SPEED): Promise<void> {
    return new Promise((resolve) => {
      this.cancelWalk();
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.moves = true;
      body.checkCollision.none = true; // скриптовое движение сквозь коллизии (как в Stardew: автор сцены отвечает за путь)
      this.walkTarget = { x: px, y: py, speed, resolve };
    });
  }

  /** Идти к тайлу. */
  walkToTile(tx: number, ty: number, speed = NPC_SPEED): Promise<void> {
    return this.walkToPx((tx + 0.5) * TILE, (ty + 1) * TILE, speed);
  }

  cancelWalk(): void {
    if (this.walkTarget) {
      const r = this.walkTarget.resolve;
      this.walkTarget = null;
      this.finishScriptedMove();
      r();
    }
  }

  private finishScriptedMove(): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.setVelocity(0, 0);
    body.checkCollision.none = false;
    if (this.staticWhenIdle) body.moves = false;
  }

  teleportTile(tx: number, ty: number): void {
    this.snapTo((tx + 0.5) * TILE, (ty + 1) * TILE);
  }

  /** Точная установка позиции с синхронизацией физического тела (иначе postUpdate добавит смещение кадра). */
  snapTo(px: number, py: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.reset(px, py);
    else this.setPosition(px, py);
  }

  /** Эмоция над головой: "!", "?", "♥", "..." */
  emote(symbol: string, ms = 900): Promise<void> {
    this.emoteText?.destroy();
    const t = this.scene.add
      .text(this.x, this.y - this.height - 4, symbol, {
        fontFamily: '"PixelFont", monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5, 1)
      .setDepth(10000);
    this.emoteText = t;
    this.scene.tweens.add({ targets: t, y: t.y - 6, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
    return new Promise((resolve) => {
      this.scene.time.delayedCall(ms, () => {
        if (this.emoteText === t) this.emoteText = undefined;
        t.destroy();
        resolve();
      });
    });
  }

  /** Вызывается сценой каждый кадр. */
  tick(): void {
    if (this.walkTarget) {
      const { x, y, speed, resolve } = this.walkTarget;
      const dx = x - this.x;
      const dy = y - this.y;
      const dist = Math.hypot(dx, dy);
      // за кадр проходим speed*dt; если ближе — прибыли
      const step = (speed * this.scene.game.loop.delta) / 1000;
      if (dist <= Math.max(step, 1)) {
        this.snapTo(x, y);
        this.walkTarget = null;
        this.finishScriptedMove();
        this.playIdle();
        resolve();
      } else {
        this.moveVector(dx / dist, dy / dist, speed);
      }
    }
    if (this.emoteText) this.emoteText.setPosition(this.x, this.y - this.height - 4);
    // y-sort: кто ниже на экране — тот ближе к камере
    this.setDepth(this.y);
  }

  override destroy(fromScene?: boolean): void {
    this.emoteText?.destroy();
    this.cancelWalk();
    super.destroy(fromScene);
  }
}

/**
 * Регистрирует анимации idle/walk для спрайтшита: строки = направления (DIR_ROWS), столбцы = кадры
 * ходьбы. Если под ними есть ещё столько же строк (лист высотой 2×dirs) — это кадры дыхания, idle
 * играет их; иначе idle = один кадр IDLE_FRAME (колонка 1, "ноги вместе").
 */
export function registerActorAnims(
  scene: Phaser.Scene,
  spriteKey: string,
  frames: number,
  dirs: readonly Dir[],
): void {
  if (!scene.textures.exists(spriteKey)) return;
  const tex = scene.textures.get(spriteKey);
  const src = tex.getSourceImage() as { height: number };
  const rows = Math.floor(src.height / tex.get(0).height);
  const idleRows = rows >= dirs.length * 2;
  dirs.forEach((dir, row) => {
    const start = row * frames;
    const idleKey = `${spriteKey}_idle_${dir}`;
    const walkKey = `${spriteKey}_walk_${dir}`;
    if (!scene.anims.exists(idleKey)) {
      const idleStart = (dirs.length + row) * frames;
      scene.anims.create({
        key: idleKey,
        frames: idleRows
          ? scene.anims.generateFrameNumbers(spriteKey, { start: idleStart, end: idleStart + frames - 1 })
          : [{ key: spriteKey, frame: start + Math.min(IDLE_FRAME, frames - 1) }],
        frameRate: idleRows ? IDLE_FRAME_RATE : 1,
        repeat: -1,
      });
    }
    if (!scene.anims.exists(walkKey)) {
      scene.anims.create({
        key: walkKey,
        frames: scene.anims.generateFrameNumbers(spriteKey, { start, end: start + frames - 1 }),
        frameRate: WALK_FRAME_RATE,
        repeat: -1,
      });
    }
  });
}
