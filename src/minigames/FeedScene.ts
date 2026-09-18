import Phaser from 'phaser';
import { MinigameScene, hudStyle, type MinigameData } from './MinigameScene';
import { GAME_HEIGHT, GAME_WIDTH, FEED, WALK_FRAMES, DIR_ROWS } from '../config';
import { audio } from '../core/Audio';
import { CHARACTERS, PLAYER_ID } from '../data/characters';
import { registerActorAnims } from '../entities/Actor';

const FREYA = { x: 300, y: 196 }; // низ спрайта
const GIRL = { x: 150, y: 206 };
const BUBBLE = { x: 300, y: 104, w: 48, h: 44 }; // облачко над головой
const TRAY = { y: 246, x0: 196, step: 60, size: 40 }; // поднос внизу: три слота
const ITEMS = [
  { id: 'bowl', name: 'миска', texture: 'prop_bowl', react: 'Ням-ням!' },
  { id: 'ball', name: 'мяч', texture: 'prop_ball', react: 'Гав!' },
  { id: 'treat', name: 'вкусняшка', texture: 'prop_treat', react: '♥' },
] as const;
const KEY_HINTS = ['1 / A', '2 / S', '3 / D'];

interface Slot {
  item: number; // индекс в ITEMS
  box: Phaser.GameObjects.Graphics;
  img: Phaser.GameObjects.Image;
  hint: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
}

/**
 * «Покорми Фрею»: Фрея сидит посреди двора, в облачке над ней — что она хочет (миска, мяч или
 * вкусняшка). Надо успеть подать нужное с подноса: 1/2/3, A/S/D или клик по слоту. Время на просьбу
 * от FEED.timeFrom до FEED.timeTo, с просьбы FEED.shuffleFrom предметы на подносе меняются местами.
 * Не то или не успела — ошибка; больше FEED.maxMiss ошибок — Фрея обиделась, можно заново.
 */
export class FeedScene extends MinigameScene {
  private freya!: Phaser.GameObjects.Sprite;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleItem!: Phaser.GameObjects.Image;
  private timerBar!: Phaser.GameObjects.Graphics;
  private slots: Slot[] = [];
  private keys: Phaser.Input.Keyboard.Key[][] = [];
  private phase: 'intro' | 'ask' | 'gap' | 'over' = 'intro';
  private wanted = 0;
  private timeLeft = 0;
  private timeTotal = 1;
  private round = 0;
  private hits = 0;
  private misses = 0;
  private score = 0;
  private fastHits = 0;
  private hudScore!: Phaser.GameObjects.Text;
  private hudRound!: Phaser.GameObjects.Text;
  private hudMiss!: Phaser.GameObjects.Text;
  private hudMsg!: Phaser.GameObjects.Text;

  constructor() {
    super('MG_Feed');
    this.keepMusic = true; // играет тема двора — как на локации, без перезапуска
  }

  override init(data: MinigameData): void {
    super.init(data);
    this.slots = [];
    this.keys = [];
    this.phase = 'intro';
    this.wanted = 0;
    this.timeLeft = 0;
    this.timeTotal = 1;
    this.round = 0;
    this.hits = 0;
    this.misses = 0;
    this.score = 0;
    this.fastHits = 0;
  }

  create(): void {
    this.setup(0x5d8a3f);
    this.drawYard();

    // --- Фрея и девушка (спрайты персонажей, idle-анимации как в мире) ---
    const freyaDef = CHARACTERS.freya;
    const girlDef = CHARACTERS[PLAYER_ID];
    registerActorAnims(this, freyaDef.sprite, WALK_FRAMES, DIR_ROWS);
    registerActorAnims(this, girlDef.sprite, WALK_FRAMES, DIR_ROWS);
    this.freya = this.add.sprite(FREYA.x, FREYA.y, freyaDef.sprite, 0).setOrigin(0.5, 1).setDepth(20);
    if (this.anims.exists(`${freyaDef.sprite}_idle_down`)) this.freya.play(`${freyaDef.sprite}_idle_down`);
    const girl = this.add.sprite(GIRL.x, GIRL.y, girlDef.sprite, 0).setOrigin(0.5, 1).setDepth(19);
    if (this.anims.exists(`${girlDef.sprite}_idle_right`)) girl.play(`${girlDef.sprite}_idle_right`);

    // --- облачко с просьбой ---
    const g = this.add.graphics();
    g.fillStyle(0xfff9ee, 0.96);
    g.fillRoundedRect(-BUBBLE.w / 2, -BUBBLE.h / 2, BUBBLE.w, BUBBLE.h, 10);
    g.fillCircle(-8, BUBBLE.h / 2 + 6, 4);
    g.fillCircle(-14, BUBBLE.h / 2 + 14, 2.5);
    g.lineStyle(1, 0x6b5a4a, 0.5);
    g.strokeRoundedRect(-BUBBLE.w / 2 + 0.5, -BUBBLE.h / 2 + 0.5, BUBBLE.w - 1, BUBBLE.h - 1, 10);
    this.bubbleItem = this.add.image(0, -2, ITEMS[0].texture);
    this.timerBar = this.add.graphics();
    this.bubble = this.add.container(BUBBLE.x, BUBBLE.y, [g, this.bubbleItem, this.timerBar]).setDepth(30).setVisible(false);

    // --- поднос ---
    this.drawTray();
    const kb = this.input.keyboard!;
    this.keys = FEED.keys.map((names) => names.map((n) => kb.addKey(Phaser.Input.Keyboard.KeyCodes[n as keyof typeof Phaser.Input.Keyboard.KeyCodes])));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const i = this.slotAt(w.x, w.y);
      if (i >= 0) this.give(i);
    });

    // --- HUD ---
    this.hudScore = this.add.text(8, 6, 'Очки: 0', hudStyle(11)).setDepth(60);
    this.hudRound = this.add.text(GAME_WIDTH / 2, 6, '', hudStyle(11)).setOrigin(0.5, 0).setDepth(60);
    this.hudMiss = this.add.text(GAME_WIDTH - 8, 6, `Ошибки: 0/${FEED.maxMiss}`, hudStyle(11)).setOrigin(1, 0).setDepth(60);
    this.hudMsg = this.add.text(GAME_WIDTH / 2, TRAY.y - 44, '', hudStyle(10, '#f28b8b')).setOrigin(0.5).setDepth(60);

    audio.sfx('bark');
    void this.banner('Фрея чего-то хочет. Смотри в облачко и подавай: 1/2/3, A/S/D или клик', 2600, 11).then(() => {
      if (this.phase === 'intro') this.nextAsk();
    });
  }

  private drawYard(): void {
    const g = this.add.graphics().setDepth(0);
    // небо
    const sky = [0x9ec9e8, 0xb6d8ee, 0xcfe6f3];
    sky.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillRect(0, i * 30, GAME_WIDTH, 31);
    });
    // дом на заднем плане
    g.fillStyle(0xc9b8a0, 1);
    g.fillRect(0, 40, GAME_WIDTH, 60);
    g.fillStyle(0x6f8fb0, 1);
    for (let i = 0; i < 9; i++) g.fillRect(24 + i * 56, 52, 16, 20);
    g.fillStyle(0x8a7a66, 1);
    g.fillRect(0, 96, GAME_WIDTH, 4);
    // забор
    g.fillStyle(0x8f6a45, 1);
    for (let x = 4; x < GAME_WIDTH; x += 14) g.fillRect(x, 100, 8, 26);
    g.fillRect(0, 108, GAME_WIDTH, 3);
    g.fillRect(0, 118, GAME_WIDTH, 3);
    // трава
    g.fillStyle(0x5d8a3f, 1);
    g.fillRect(0, 126, GAME_WIDTH, GAME_HEIGHT - 126);
    g.fillStyle(0x4f7a35, 1);
    for (let i = 0; i < 70; i++) {
      const x = (i * 73) % GAME_WIDTH;
      const y = 130 + ((i * 37) % (GAME_HEIGHT - 140));
      g.fillRect(x, y, 2, 3);
      g.fillRect(x + 3, y + 1, 2, 2);
    }
    // вытоптанный пятачок под Фреей
    g.fillStyle(0x8a7a52, 1);
    g.fillEllipse(FREYA.x, FREYA.y - 4, 96, 22);
    g.fillStyle(0x9c8c60, 1);
    g.fillEllipse(FREYA.x, FREYA.y - 5, 80, 14);
    // поднос
    g.fillStyle(0x3a2a22, 1);
    g.fillRoundedRect(TRAY.x0 - 34, TRAY.y - 28, TRAY.step * 2 + 68, 68, 6);
    g.fillStyle(0x5a4232, 1);
    g.fillRoundedRect(TRAY.x0 - 31, TRAY.y - 25, TRAY.step * 2 + 62, 62, 5);
  }

  private drawTray(): void {
    ITEMS.forEach((it, i) => {
      const x = TRAY.x0 + i * TRAY.step;
      const box = this.add.graphics().setDepth(40);
      this.paintSlot(box, false);
      box.setPosition(x, TRAY.y);
      const img = this.add.image(x, TRAY.y - 2, it.texture).setDepth(41);
      const hint = this.add.text(x, TRAY.y + 26, KEY_HINTS[i], hudStyle(9, '#ffe9a8')).setOrigin(0.5).setDepth(41);
      const name = this.add.text(x, TRAY.y - 30, it.name, hudStyle(9, '#f0e6ff')).setOrigin(0.5).setDepth(41);
      this.slots.push({ item: i, box, img, hint, name });
    });
  }

  private paintSlot(box: Phaser.GameObjects.Graphics, lit: boolean): void {
    box.clear();
    box.fillStyle(lit ? 0xffe9a8 : 0x2a1f2d, 1);
    box.fillRoundedRect(-TRAY.size / 2, -TRAY.size / 2, TRAY.size, TRAY.size, 5);
    box.fillStyle(lit ? 0xf7d34a : 0x4a3d5c, 1);
    box.fillRoundedRect(-TRAY.size / 2 + 2, -TRAY.size / 2 + 2, TRAY.size - 4, TRAY.size - 4, 4);
  }

  private slotAt(x: number, y: number): number {
    for (let i = 0; i < this.slots.length; i++) {
      const sx = TRAY.x0 + i * TRAY.step;
      if (Math.abs(x - sx) <= TRAY.size / 2 + 4 && Math.abs(y - TRAY.y) <= TRAY.size / 2 + 4) return i;
    }
    return -1;
  }

  override update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    if (this.phase === 'over') return;
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      void this.end(true);
      return;
    }
    this.keys.forEach((ks, i) => {
      if (ks.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.give(i);
    });
    if (this.phase !== 'ask') return;
    this.timeLeft -= dt;
    this.drawTimer();
    if (this.timeLeft <= 0) this.timeout();
  }

  private drawTimer(): void {
    const g = this.timerBar;
    g.clear();
    const w = BUBBLE.w - 8;
    const f = Phaser.Math.Clamp(this.timeLeft / this.timeTotal, 0, 1);
    g.fillStyle(0x6b5a4a, 0.35);
    g.fillRect(-w / 2, BUBBLE.h / 2 - 7, w, 3);
    g.fillStyle(f < 0.3 ? 0xf28b8b : f < 0.6 ? 0xf7d34a : 0x7fd08a, 1);
    g.fillRect(-w / 2, BUBBLE.h / 2 - 7, w * f, 3);
  }

  /** Следующая просьба: новый предмет, время короче; с FEED.shuffleFrom — перемешать поднос. */
  private nextAsk(): void {
    if (this.round >= FEED.rounds) {
      void this.end(false);
      return;
    }
    this.round++;
    const prev = this.wanted;
    do this.wanted = Phaser.Math.Between(0, ITEMS.length - 1);
    while (this.wanted === prev && ITEMS.length > 1);
    const t = (this.round - 1) / Math.max(1, FEED.rounds - 1);
    this.timeTotal = Phaser.Math.Linear(FEED.timeFrom, FEED.timeTo, t);
    this.timeLeft = this.timeTotal;
    this.hudRound.setText(`${this.round}/${FEED.rounds}`);

    const show = () => {
      this.bubbleItem.setTexture(ITEMS[this.wanted].texture);
      this.bubble.setVisible(true).setScale(0.4).setAlpha(1);
      this.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: 'Back.easeOut' });
      this.drawTimer();
      audio.sfx('select', { volume: 0.5 });
      this.phase = 'ask';
    };
    if (this.round >= FEED.shuffleFrom) this.shuffleTray(show);
    else show();
  }

  /** Поднос: предметы разъезжаются по новым местам (клавиши остаются за слотами). */
  private shuffleTray(done: () => void): void {
    const order = Phaser.Utils.Array.Shuffle(this.slots.map((s) => s.item));
    if (order.every((it, i) => it === this.slots[i].item)) order.reverse();
    const byItem = new Map(this.slots.map((s) => [s.item, s]));
    const moved: Slot[] = order.map((it) => byItem.get(it)!);
    let left = moved.length;
    audio.sfx('whoosh', { volume: 0.4 });
    moved.forEach((s, i) => {
      const x = TRAY.x0 + i * TRAY.step;
      this.tweens.add({
        targets: [s.img, s.name],
        x,
        duration: 260,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          if (--left === 0) done();
        },
      });
    });
    // клавиши и рамки не двигаются: слот i остаётся под клавишей i, меняются только предметы
    this.slots = moved.map((s, i) => ({ ...s, box: this.slots[i].box, hint: this.slots[i].hint }));
  }

  private give(i: number): void {
    if (this.phase !== 'ask') return;
    this.phase = 'gap';
    const slot = this.slots[i];
    const lit = slot.box;
    this.paintSlot(lit, true);
    this.time.delayedCall(140, () => this.paintSlot(lit, false));
    const fly = this.add.image(slot.img.x, slot.img.y, slot.img.texture.key).setDepth(45);
    const ok = slot.item === this.wanted;
    this.tweens.add({
      targets: fly,
      x: FREYA.x - 10,
      y: FREYA.y - 34,
      scale: ok ? 0.6 : 1,
      alpha: ok ? 0.2 : 1,
      duration: 220,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (ok) fly.destroy();
        else this.tweens.add({ targets: fly, y: fly.y + 40, x: fly.x - 30, angle: -70, alpha: 0, duration: 400, ease: 'Quad.easeIn', onComplete: () => fly.destroy() });
      },
    });
    this.bubble.setVisible(false);
    if (ok) this.hit();
    else this.wrong();
  }

  private hit(): void {
    this.hits++;
    const fast = this.timeLeft > this.timeTotal * 0.5;
    if (fast) this.fastHits++;
    const pts = FEED.scoreHit + (fast ? FEED.scoreFast : 0);
    this.score += pts;
    this.hudScore.setText(`Очки: ${this.score}`);
    this.popup(FREYA.x + 30, FREYA.y - 60, `+${pts}${fast ? ' быстро!' : ''}`, '#ffe36e');
    this.popup(FREYA.x - 16, FREYA.y - 72, ITEMS[this.wanted].react, '#ffffff', 12);
    audio.sfx('pickup', { volume: 0.6, rate: 1.2 });
    audio.sfx('bark', { volume: 0.7, rate: Phaser.Math.FloatBetween(1.05, 1.3) });
    this.tweens.add({ targets: this.freya, y: FREYA.y - 8, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.after(FEED.gapSec);
  }

  private wrong(): void {
    this.fail('Не то!', 'wrong');
    this.popup(FREYA.x - 16, FREYA.y - 72, '?', '#f28b8b', 14);
    this.tweens.add({ targets: this.freya, x: FREYA.x + 4, duration: 50, yoyo: true, repeat: 3 });
  }

  private timeout(): void {
    this.phase = 'gap';
    this.bubble.setVisible(false);
    this.fail('Не успела!', 'miss');
    this.popup(FREYA.x - 16, FREYA.y - 72, '...', '#d7d0e0', 14);
  }

  private fail(msg: string, sfx: 'wrong' | 'miss'): void {
    this.misses++;
    this.hudMiss.setText(`Ошибки: ${this.misses}/${FEED.maxMiss}`).setColor(this.misses >= FEED.maxMiss ? '#f28b8b' : '#ffffff');
    this.flash(msg);
    audio.sfx(sfx, { volume: 0.7 });
    if (this.misses > FEED.maxMiss) {
      this.time.delayedCall(500, () => void this.end(false));
      return;
    }
    this.after(FEED.gapSec + 0.2);
  }

  private after(sec: number): void {
    this.time.delayedCall(sec * 1000, () => {
      if (this.phase === 'gap') this.nextAsk();
    });
  }

  private flash(text: string): void {
    this.hudMsg.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.hudMsg);
    this.tweens.add({ targets: this.hudMsg, alpha: 0, delay: 600, duration: 300 });
  }

  private async end(quit: boolean): Promise<void> {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.bubble.setVisible(false);
    const won = !quit && this.misses <= FEED.maxMiss;
    if (won) {
      this.tweens.add({ targets: this.freya, y: FREYA.y - 10, duration: 140, yoyo: true, repeat: 2, ease: 'Quad.easeOut' });
      audio.sfx('bark', { rate: 1.2 });
    }
    const lines = [
      `Очки: ${this.score}`,
      `Угадано: ${this.hits}/${FEED.rounds}   Быстро: ${this.fastHits}`,
      `Ошибок: ${this.misses}/${FEED.maxMiss}`,
    ];
    const title = won ? 'Фрея сыта и довольна!' : 'Фрея обиделась';
    const r = quit ? 'exit' : await this.endScreen(won, title, lines);
    if (!won && r === 'retry') this.scene.restart({ id: this.mgId });
    else this.finish({ won, score: this.score });
  }
}
