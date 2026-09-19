import Phaser from 'phaser';
import { DIR_ROWS, GAME_HEIGHT, GAME_WIDTH, IDLE_FRAME, SHAHED, WALK_FRAMES } from '../config';
import { audio } from '../core/Audio';
import { CHARACTERS, PLAYER_ID } from '../data/characters';
import { MinigameScene, hudStyle, type MinigameData } from './MinigameScene';

const MUSIC_KEY = 'sky';
const LAUNCHER = { x: 250, y: 242 }; // пусковая на крыше, отсюда летят ракеты
const SKY = { top: 22, bottom: 196 }; // полоса, в которой держатся дроны
const EDGE = 40; // запас за краями экрана

interface Drone {
  spr: Phaser.GameObjects.Image;
  kind: 'enemy' | 'friend';
  dir: 1 | -1; // куда в целом летит: 1 — вправо, -1 — влево
  speed: number;
  ang: number; // текущий курс, рад
  wander: number; // отклонение от базового курса в крейсерском режиме
  loopLeft: number; // сколько секунд ещё крутить петлю (0 — крейсер)
  turn: number; // угловая скорость петли
  nextLoop: number; // через сколько секунд можно снова уйти в петлю
  alive: boolean;
  spawnAt: number;
  spawned: boolean;
}

interface Rocket {
  g: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: number;
}

/**
 * Сбивание шахедов: вид на небо, прицел за мышью (или WASD/стрелки), ЛКМ/пробел — пуск ракеты.
 * Ракета летит по прямой от пусковой на крыше в сторону прицела и подрывается рядом с дроном.
 * Дроны быстрые, рыскают и иногда уходят в петлю. Тёмные — сбивать, маленькие зелёные — свои (штраф).
 * Ракет на раунд SHAHED.ammo. Пропустил больше SHAHED.maxMissed или набрал меньше SHAHED.targetScore —
 * проигрыш, можно заново.
 */
export class ShahedScene extends MinigameScene {
  private drones: Drone[] = [];
  private rockets: Rocket[] = [];
  private cross!: Phaser.GameObjects.Graphics;
  private launcher!: Phaser.GameObjects.Graphics;
  private cx = GAME_WIDTH / 2;
  private cy = GAME_HEIGHT / 2;
  private usingMouse = true;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private reload = 0;
  private ammo = 0;
  private outOfAmmoAt = -1; // время, когда кончились ракеты (для задержки перед концом)
  private elapsed = 0;
  private score = 0;
  private missed = 0;
  private killed = 0;
  private friendsHit = 0;
  private over = false;
  private clouds: { g: Phaser.GameObjects.Graphics; vx: number }[] = [];
  private hudScore!: Phaser.GameObjects.Text;
  private hudMissed!: Phaser.GameObjects.Text;
  private hudTime!: Phaser.GameObjects.Graphics;
  private hudAmmo!: Phaser.GameObjects.Graphics;
  private hudAmmoText!: Phaser.GameObjects.Text;
  private hudMsg!: Phaser.GameObjects.Text;

  constructor() {
    super('MG_Shahed');
  }

  override init(data: MinigameData): void {
    super.init(data);
    this.drones = [];
    this.rockets = [];
    this.clouds = [];
    this.reload = 0;
    this.ammo = SHAHED.ammo;
    this.outOfAmmoAt = -1;
    this.elapsed = 0;
    this.score = 0;
    this.missed = 0;
    this.killed = 0;
    this.friendsHit = 0;
    this.over = false;
    this.cx = GAME_WIDTH / 2;
    this.cy = GAME_HEIGHT / 2;
  }

  create(): void {
    this.setup(0x3b4a7a);
    this.drawSky();
    this.drawRoofs();

    // расписание вылетов: враги и свои вперемешку по всей длительности
    const T = SHAHED.durationSec - 6;
    const mk = (kind: Drone['kind'], at: number) => {
      const dir: Drone['dir'] = Math.random() < 0.5 ? 1 : -1;
      const tex = kind === 'enemy' ? 'drone_shahed' : 'drone_green';
      const spr = this.add.image(dir > 0 ? -EDGE : GAME_WIDTH + EDGE, Phaser.Math.Between(SKY.top + 12, SKY.bottom - 12), tex).setDepth(10).setVisible(false);
      const [smin, smax] = kind === 'enemy' ? SHAHED.enemySpeed : SHAHED.friendSpeed;
      this.drones.push({
        spr,
        kind,
        dir,
        speed: Phaser.Math.Between(smin, smax),
        ang: dir > 0 ? 0 : Math.PI,
        wander: 0,
        loopLeft: 0,
        turn: 0,
        nextLoop: Phaser.Math.FloatBetween(0.6, 2),
        alive: true,
        spawnAt: at,
        spawned: false,
      });
    };
    for (let i = 0; i < SHAHED.enemies; i++) mk('enemy', 1.5 + (i / SHAHED.enemies) * T + Math.random() * 2);
    for (let i = 0; i < SHAHED.friendlies; i++) mk('friend', 4 + Math.random() * T);

    // --- девушка и Фрея на крыше смотрят вверх ---
    const girlRow = DIR_ROWS.indexOf('up');
    this.add.sprite(52, GAME_HEIGHT + 2, CHARACTERS[PLAYER_ID].sprite, girlRow * WALK_FRAMES + IDLE_FRAME).setOrigin(0.5, 1).setDepth(21).setTint(0x8a8aa8);
    this.add.sprite(80, GAME_HEIGHT + 2, CHARACTERS.freya.sprite, girlRow * WALK_FRAMES + IDLE_FRAME).setOrigin(0.5, 1).setDepth(21).setTint(0x8a8aa8);

    // --- пусковая, прицел и управление ---
    this.launcher = this.add.graphics().setDepth(22);
    this.cross = this.add.graphics().setDepth(50);
    const kb = this.input.keyboard!;
    this.fireKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as ShahedScene['wasd'];
    this.input.on('pointermove', () => (this.usingMouse = true));
    this.input.on('pointerdown', () => this.tryFire());
    this.input.setDefaultCursor('none');

    // --- HUD ---
    this.hudScore = this.add.text(8, 6, 'Очки: 0', hudStyle(11)).setDepth(60);
    this.hudMissed = this.add.text(GAME_WIDTH - 8, 6, `Пропущено: 0/${SHAHED.maxMissed}`, hudStyle(11)).setOrigin(1, 0).setDepth(60);
    this.hudTime = this.add.graphics().setDepth(60);
    this.hudAmmo = this.add.graphics().setDepth(60);
    this.hudAmmoText = this.add.text(GAME_WIDTH - 8, GAME_HEIGHT - 26, '', hudStyle(10)).setOrigin(1, 0).setDepth(60);
    this.hudMsg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, '', hudStyle(10, '#f28b8b')).setOrigin(0.5).setDepth(60);

    audio.playMusic(MUSIC_KEY, { restart: true, ms: 0 });
    audio.sfx('alert');
    void this.banner(`Ракеты — по дронам. Зелёные — свои! Ракет: ${SHAHED.ammo}`, 2400, 11);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('default'));
  }

  private drawSky(): void {
    const g = this.add.graphics().setDepth(0);
    const bands = [0x1e2a55, 0x2c3d73, 0x3b4f8c, 0x4c62a3, 0x6379b5, 0x8a93c4, 0xb8a6c8];
    const h = Math.ceil(GAME_HEIGHT / bands.length);
    bands.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillRect(0, i * h, GAME_WIDTH, h + 1);
    });
    // звёзды
    g.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % GAME_WIDTH, (i * 41) % 90, 1, 1);
    // облака
    for (let i = 0; i < 6; i++) {
      const c = this.add.graphics().setDepth(1);
      c.fillStyle(0xc9c0d8, 0.55);
      const w = Phaser.Math.Between(50, 110);
      c.fillRoundedRect(0, 0, w, 14, 7);
      c.fillRoundedRect(w * 0.2, -8, w * 0.5, 16, 8);
      c.setPosition(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(40, 170));
      this.clouds.push({ g: c, vx: Phaser.Math.FloatBetween(3, 9) * (i % 2 ? 1 : -1) });
    }
  }

  private drawRoofs(): void {
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x1b1526, 1);
    const roofs = [
      [0, 236, 110, 60],
      [110, 252, 70, 40],
      [180, 244, 90, 50],
      [270, 258, 60, 34],
      [330, 240, 100, 52],
      [430, 250, 82, 44],
    ];
    for (const [x, y, w, h] of roofs) {
      g.fillRect(x, y, w, h);
      g.fillRect(x + w * 0.3, y - 8, 6, 8); // трубы/антенны
    }
    // окна
    g.fillStyle(0xf2d38b, 0.9);
    for (let i = 0; i < 22; i++) g.fillRect(12 + ((i * 47) % 490), 262 + ((i * 13) % 20), 3, 3);
    // наша крыша (девушка и Фрея)
    g.fillStyle(0x241c33, 1);
    g.fillRect(20, 288 - 2, 90, 2);
    // станина пусковой
    g.fillStyle(0x2e2540, 1);
    g.fillRect(LAUNCHER.x - 7, LAUNCHER.y - 2, 14, 4);
  }

  override update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const c of this.clouds) {
      c.g.x += c.vx * dt;
      if (c.g.x > GAME_WIDTH + 120) c.g.x = -120;
      if (c.g.x < -130) c.g.x = GAME_WIDTH + 100;
    }
    if (this.over) {
      this.drawCross();
      return;
    }
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      void this.end(true);
      return;
    }
    this.elapsed += dt;

    // прицел: мышь или клавиши
    const p = this.input.activePointer;
    if (this.usingMouse) {
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      this.cx = w.x;
      this.cy = w.y;
    }
    let kx = 0;
    let ky = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) kx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) kx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) ky -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) ky += 1;
    if (kx || ky) {
      this.usingMouse = false;
      this.cx += kx * 220 * dt;
      this.cy += ky * 220 * dt;
    }
    this.cx = Phaser.Math.Clamp(this.cx, 4, GAME_WIDTH - 4);
    this.cy = Phaser.Math.Clamp(this.cy, 4, GAME_HEIGHT - 4);
    this.drawCross();
    this.drawLauncher();

    // дроны
    for (const d of this.drones) {
      if (!d.spawned) {
        if (this.elapsed >= d.spawnAt) {
          d.spawned = true;
          d.spr.setVisible(true);
          if (d.kind === 'enemy') audio.sfx('drone', { volume: 0.6 });
        }
        continue;
      }
      if (!d.alive) continue;
      this.steer(d, dt);
      const s = d.spr;
      s.x += Math.cos(d.ang) * d.speed * dt;
      s.y += Math.sin(d.ang) * d.speed * dt;
      s.setRotation(d.ang).setFlipY(Math.cos(d.ang) < 0);
      // вернулся к своему краю — отражаем, чтобы не улетел «назад» за экран
      if ((d.dir > 0 && s.x < -EDGE + 8 && Math.cos(d.ang) < 0) || (d.dir < 0 && s.x > GAME_WIDTH + EDGE - 8 && Math.cos(d.ang) > 0)) {
        d.ang = Phaser.Math.Angle.Wrap(Math.PI - d.ang);
        d.wander = 0;
        d.loopLeft = 0;
      }
      if ((d.dir > 0 && s.x > GAME_WIDTH + EDGE) || (d.dir < 0 && s.x < -EDGE)) {
        d.alive = false;
        s.destroy();
        if (d.kind === 'enemy') {
          this.missed++;
          audio.sfx('miss');
          this.flash('Пропущен!');
          this.hudMissed.setText(`Пропущено: ${this.missed}/${SHAHED.maxMissed}`);
          if (this.missed > SHAHED.maxMissed) {
            void this.end(false);
            return;
          }
        }
      }
    }

    // ракеты
    this.reload -= dt;
    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.tryFire();
    for (const r of this.rockets) this.moveRocket(r, dt);
    this.rockets = this.rockets.filter((r) => r.g.active);
    this.drawHud();

    // конец раунда: время вышло, все враги вылетели и никого не осталось, либо кончились ракеты
    const allSpawned = this.drones.every((d) => d.spawned);
    const noneAlive = this.drones.every((d) => !d.alive || d.kind === 'friend');
    const dry = this.outOfAmmoAt >= 0 && this.rockets.length === 0 && this.elapsed - this.outOfAmmoAt > 0.9;
    if (this.elapsed >= SHAHED.durationSec || (allSpawned && noneAlive) || dry) void this.end(false);
  }

  /** Курс дрона: крейсер с рысканьем, иногда петля; в полосе неба держится отражением. */
  private steer(d: Drone, dt: number): void {
    const { loop } = SHAHED;
    if (d.loopLeft > 0) {
      d.loopLeft -= dt;
      d.ang = Phaser.Math.Angle.Wrap(d.ang + d.turn * dt);
    } else {
      d.nextLoop -= dt;
      const y = d.spr.y;
      const room = y > SKY.top + 40 && y < SKY.bottom - 40; // петля не вылезет из полосы
      if (d.nextLoop <= 0 && room && Math.random() < loop.chance) {
        const dur = Phaser.Math.FloatBetween(loop.durSec[0], loop.durSec[1]);
        d.turn = ((Math.random() < 0.5 ? 1 : -1) * Math.PI * 2) / dur;
        d.loopLeft = dur * (Math.random() < 0.3 ? 1.5 : 1); // иногда полтора оборота
        d.nextLoop = Phaser.Math.FloatBetween(loop.everySec[0], loop.everySec[1]);
      } else {
        // рысканье: случайное блуждание отклонения от базового курса
        d.wander = Phaser.Math.Clamp(d.wander + Phaser.Math.FloatBetween(-loop.wanderRate, loop.wanderRate) * dt, -loop.wanderMax, loop.wanderMax);
        const base = d.dir > 0 ? 0 : Math.PI;
        d.ang = Phaser.Math.Angle.RotateTo(d.ang, Phaser.Math.Angle.Wrap(base + d.dir * d.wander), loop.turnRate * dt);
      }
    }
    // за полосу неба не выходим
    const sy = Math.sin(d.ang);
    if ((d.spr.y < SKY.top && sy < 0) || (d.spr.y > SKY.bottom && sy > 0)) {
      d.ang = Phaser.Math.Angle.Wrap(-d.ang);
      d.wander = -d.wander;
      d.loopLeft = 0;
    }
  }

  private tryFire(): void {
    if (this.over || this.reload > 0) return;
    if (this.ammo <= 0) {
      audio.sfx('tick', { volume: 0.5 });
      this.flash('Ракеты кончились!');
      return;
    }
    this.ammo--;
    this.reload = 1 / SHAHED.fireRate;
    if (this.ammo === 0) {
      this.outOfAmmoAt = this.elapsed;
      this.flash('Последняя!');
    }
    audio.sfx('firework', { volume: 0.5, rate: Phaser.Math.FloatBetween(1.3, 1.6) });
    const a = Math.atan2(this.cy - LAUNCHER.y, this.cx - LAUNCHER.x);
    const g = this.add.graphics().setDepth(40);
    g.fillStyle(0xffe6b0, 1);
    g.fillRect(-2, -1, 8, 2);
    g.fillStyle(0xf28b8b, 1);
    g.fillRect(6, -1, 2, 2);
    g.fillStyle(0xffa64d, 1);
    g.fillRect(-5, -1, 3, 2);
    g.setPosition(LAUNCHER.x + Math.cos(a) * 8, LAUNCHER.y + Math.sin(a) * 8).setRotation(a);
    this.rockets.push({ g, x: g.x, y: g.y, vx: Math.cos(a) * SHAHED.rocketSpeed, vy: Math.sin(a) * SHAHED.rocketSpeed, trail: 0 });
    this.cameras.main.shake(50, 0.003);
  }

  private moveRocket(r: Rocket, dt: number): void {
    // мелкими шагами, чтобы на низком FPS не проскочить дрон
    const steps = Math.max(1, Math.ceil((SHAHED.rocketSpeed * dt) / 5));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      r.x += r.vx * sdt;
      r.y += r.vy * sdt;
      for (const d of this.drones) {
        if (!d.alive || !d.spawned) continue;
        const rad = d.kind === 'enemy' ? SHAHED.blast : SHAHED.blastFriendly;
        if (Math.hypot(d.spr.x - r.x, d.spr.y - r.y) > rad) continue;
        this.destroyDrone(d);
        this.spark(r.x, r.y, 0xfff1a8, 4);
        r.g.destroy();
        return;
      }
    }
    r.g.setPosition(r.x, r.y);
    r.trail -= dt;
    if (r.trail <= 0) {
      r.trail = 0.03;
      const p = this.add.circle(r.x - r.vx * 0.02, r.y - r.vy * 0.02, 1.5, 0xd7d0e0, 0.7).setDepth(39);
      this.tweens.add({ targets: p, alpha: 0, scale: 2, duration: 350, onComplete: () => p.destroy() });
    }
    if (r.x < -20 || r.x > GAME_WIDTH + 20 || r.y < -20 || r.y > GAME_HEIGHT + 20) r.g.destroy();
  }

  private destroyDrone(d: Drone): void {
    d.alive = false;
    if (d.kind === 'enemy') {
      this.killed++;
      this.score += SHAHED.scoreEnemy;
      audio.sfx('explode');
      this.spark(d.spr.x, d.spr.y, 0xffa64d, 10);
      this.spark(d.spr.x, d.spr.y, 0x555566, 6);
      this.popup(d.spr.x, d.spr.y - 10, `+${SHAHED.scoreEnemy}`, '#ffe36e');
      this.cameras.main.shake(120, 0.006);
    } else {
      this.friendsHit++;
      this.score += SHAHED.scoreFriendly;
      audio.sfx('wrong');
      this.spark(d.spr.x, d.spr.y, 0x9ff0b0, 6);
      this.popup(d.spr.x, d.spr.y - 10, `${SHAHED.scoreFriendly}`, '#f28b8b');
      this.flash('Это был наш!');
    }
    const spr = d.spr;
    this.tweens.add({ targets: spr, y: spr.y + 80, angle: spr.angle + (d.dir > 0 ? 60 : -60), alpha: 0, duration: 700, ease: 'Quad.easeIn', onComplete: () => spr.destroy() });
    this.hudScore.setText(`Очки: ${this.score}`);
  }

  private spark(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Phaser.Math.Between(10, 30);
      const p = this.add.circle(x, y, Phaser.Math.Between(1, 3), color).setDepth(41);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * s, y: y + Math.sin(a) * s + 10, alpha: 0, duration: Phaser.Math.Between(250, 500), onComplete: () => p.destroy() });
    }
  }

  private flash(text: string): void {
    this.hudMsg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.hudMsg);
    this.tweens.add({ targets: this.hudMsg, alpha: 0, delay: 700, duration: 300 });
  }

  private drawCross(): void {
    const g = this.cross;
    g.clear();
    const dry = this.ammo <= 0;
    g.lineStyle(1, dry ? 0xf28b8b : this.reload > 0 ? 0xbcb6c8 : 0xffffff, 0.95);
    g.strokeCircle(this.cx, this.cy, 9);
    g.lineBetween(this.cx - 14, this.cy, this.cx - 5, this.cy);
    g.lineBetween(this.cx + 5, this.cy, this.cx + 14, this.cy);
    g.lineBetween(this.cx, this.cy - 14, this.cx, this.cy - 5);
    g.lineBetween(this.cx, this.cy + 5, this.cx, this.cy + 14);
    g.fillStyle(0xffffff, 1);
    g.fillRect(this.cx - 0.5, this.cy - 0.5, 1, 1);
  }

  /** Труба пусковой поворачивается за прицелом. */
  private drawLauncher(): void {
    const g = this.launcher;
    g.clear();
    const a = Math.atan2(this.cy - LAUNCHER.y, this.cx - LAUNCHER.x);
    g.lineStyle(4, 0x4a3d5c, 1);
    g.lineBetween(LAUNCHER.x, LAUNCHER.y, LAUNCHER.x + Math.cos(a) * 11, LAUNCHER.y + Math.sin(a) * 11);
    g.lineStyle(2, 0x7a6b8f, 1);
    g.lineBetween(LAUNCHER.x, LAUNCHER.y, LAUNCHER.x + Math.cos(a) * 11, LAUNCHER.y + Math.sin(a) * 11);
    g.fillStyle(0x2e2540, 1);
    g.fillCircle(LAUNCHER.x, LAUNCHER.y, 3);
  }

  private drawHud(): void {
    const t = this.hudTime;
    t.clear();
    const w = 140;
    const x = GAME_WIDTH / 2 - w / 2;
    t.fillStyle(0x1b1420, 0.8);
    t.fillRect(x - 1, 7, w + 2, 6);
    t.fillStyle(0xd7d0e0, 1);
    t.fillRect(x, 8, w * Math.max(0, 1 - this.elapsed / SHAHED.durationSec), 4);
    // боезапас: ряд ракет справа внизу
    this.hudAmmoText.setText(`Ракеты: ${this.ammo}`).setColor(this.ammo <= 3 ? '#f28b8b' : '#f0e6ff');
    const h = this.hudAmmo;
    h.clear();
    const step = 4;
    const x0 = GAME_WIDTH - 8 - SHAHED.ammo * step;
    for (let i = 0; i < SHAHED.ammo; i++) {
      const filled = i < this.ammo;
      h.fillStyle(filled ? 0xffe6b0 : 0x3a3048, filled ? 1 : 0.9);
      h.fillRect(x0 + i * step, GAME_HEIGHT - 14, 2, 7);
      if (filled) {
        h.fillStyle(0xf28b8b, 1);
        h.fillRect(x0 + i * step, GAME_HEIGHT - 15, 2, 1);
      }
    }
  }

  private async end(quit: boolean): Promise<void> {
    if (this.over) return;
    this.over = true;
    audio.stopMusic(600);
    const won = !quit && this.missed <= SHAHED.maxMissed && this.score >= SHAHED.targetScore;
    const lines = [
      `Очки: ${this.score} (нужно ${SHAHED.targetScore})`,
      `Сбито: ${this.killed}/${SHAHED.enemies}   Пропущено: ${this.missed}/${SHAHED.maxMissed}`,
      `Ракет осталось: ${this.ammo}/${SHAHED.ammo}` + (this.friendsHit ? `   Своих задето: ${this.friendsHit}` : ''),
    ];
    const title = won ? 'Небо чистое!' : this.missed > SHAHED.maxMissed ? 'Слишком много пропущено' : this.ammo <= 0 ? 'Ракеты кончились' : 'Мало очков';
    const r = quit ? 'exit' : await this.endScreen(won, title, lines);
    if (!won && r === 'retry') this.scene.restart({ id: this.mgId });
    else this.finish({ won, score: this.score });
  }
}
