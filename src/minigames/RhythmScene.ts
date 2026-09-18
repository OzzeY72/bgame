import Phaser from 'phaser';
import { DIR_ROWS, GAME_HEIGHT, GAME_WIDTH, IDLE_FRAME, RHYTHM, WALK_FRAMES } from '../config';
import { audio } from '../core/Audio';
import type { ThemeJson } from '../core/Synth';
import { CHARACTERS, PLAYER_ID } from '../data/characters';
import { getMusic } from '../data/music';
import { MinigameScene, hudStyle, type MinigameData } from './MinigameScene';
import { Tentacle } from './Tentacle';

const MUSIC_KEY = 'sewer';
const LANE_COLORS = [0xc24bd6, 0x43b5e6, 0x5fd66a, 0xf25a5a]; // как в FNF: left, down, up, right
const LANE_DIRS = ['left', 'down', 'up', 'right'] as const;
const LANE_X0 = 300;
const LANE_GAP = 40;
const ARROW = 26;

type Judge = 'perfect' | 'good' | 'ok' | 'miss';
const JUDGE_TEXT: Record<Judge, [string, string]> = {
  perfect: ['Идеально!', '#ffe36e'],
  good: ['Хорошо', '#8fd19e'],
  ok: ['Так себе', '#d7d0e0'],
  miss: ['Мимо', '#f28b8b'],
};

interface Note {
  beat: number;
  lane: number;
  obj: Phaser.GameObjects.Image;
  hit: boolean;
  missed: boolean;
}

/** Мишень второй стадии: круг, к которому сжимается кольцо; born — секунды музыки (audio.time()). */
interface Target {
  x: number;
  y: number;
  born: number;
  color: number;
  done: boolean;
}

/**
 * Чарт из нотной записи темы: мелодия (дорожка `track`, ноты ≥ minMidi) → дорожки по высоте (низкие слева,
 * высокие справа). Так стрелки повторяют контур мелодии — играется «по слуху». Ноты чаще `minGapSec`
 * (секунды, а не доли — чтобы быстрые темы не превращались в стену стрелок) сливаются в одну.
 */
export function buildChart(
  theme: ThemeJson,
  minMidi: number,
  lanes: number,
  opts: { track?: string; bpm?: number; minGapSec?: number } = {},
): { beat: number; lane: number }[] {
  const src = (opts.track && theme.tracks[opts.track]) || theme.tracks.piano || Object.values(theme.tracks)[0] || [];
  const notes = src.filter((n) => n.midi >= minMidi);
  const bpm = opts.bpm ?? theme.meta.bpm;
  const minGap = ((opts.minGapSec ?? RHYTHM.minGapSec) * bpm) / 60; // в долях
  if (!notes.length) return [];
  const lo = Math.min(...notes.map((n) => n.midi));
  const hi = Math.max(...notes.map((n) => n.midi));
  const out: { beat: number; lane: number }[] = [];
  let lastBeat = -1;
  for (const n of [...notes].sort((a, b) => a.time - b.time)) {
    if (n.time - lastBeat < minGap) continue; // слишком близко (аккорд/форшлаг/быстрый пассаж) — одна стрелка
    lastBeat = n.time;
    const lane = Math.min(lanes - 1, Math.floor(((n.midi - lo) / (hi - lo + 1)) * lanes));
    out.push({ beat: n.time, lane });
  }
  return out;
}

/**
 * Ритм-битва с монстром из канализации (в духе Friday Night Funkin'): стрелки едут снизу вверх по
 * четырём дорожкам, нажимать A/S/W/D (или стрелки) в момент совпадения с приёмниками.
 * Вторая стадия (с RHYTHM.stage2.atFrac чарта): монстр «злится», и в случайные моменты на экране
 * появляются круги-мишени с сужающимся кольцом — кликнуть мышью, когда кольцо совпало с кругом (как в osu!).
 * Здоровье: попадания прибавляют, промахи отнимают; ноль — проигрыш. Музыка — data/music.ts 'sewer'.
 */
export class RhythmScene extends MinigameScene {
  private chart: { beat: number; lane: number }[] = [];
  private notes: Note[] = [];
  private receptors: Phaser.GameObjects.Image[] = [];
  private laneKeys: Phaser.Input.Keyboard.Key[][] = [];
  private health = RHYTHM.health.start;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private counts: Record<Judge, number> = { perfect: 0, good: 0, ok: 0, miss: 0 };
  private started = false;
  private over = false;
  private lastCountBeat = -99;
  private lastBeatInt = -99;
  private endBeat = 0;
  /** вторая стадия: с какой доли, мишени, когда следующая (секунды музыки) */
  private stage = 1;
  private stage2Beat = Infinity;
  private targets: Target[] = [];
  private targetsG!: Phaser.GameObjects.Graphics;
  private nextTargetAt = 0;
  private targetsSpawned = 0;
  private bodyScale = 1.6;

  private hudScore!: Phaser.GameObjects.Text;
  private hudCombo!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private tentacles: Tentacle[] = [];
  private body!: Phaser.GameObjects.Sprite;
  private eye!: Phaser.GameObjects.Graphics;
  private girl!: Phaser.GameObjects.Sprite;
  private girlHold = 0;
  private water!: Phaser.GameObjects.Graphics;
  private bubble?: Phaser.GameObjects.Container;

  constructor() {
    super('MG_Rhythm');
  }

  override init(data: MinigameData): void {
    super.init(data);
    this.health = RHYTHM.health.start;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
    this.started = false;
    this.over = false;
    this.notes = [];
    this.tentacles = [];
    this.receptors = [];
    this.laneKeys = [];
    this.lastCountBeat = -99;
    this.lastBeatInt = -99;
    this.stage = 1;
    this.stage2Beat = Infinity;
    this.targets = [];
    this.nextTargetAt = 0;
    this.targetsSpawned = 0;
    this.bodyScale = 1.6;
  }

  create(): void {
    this.setup(0x0e1416);
    this.makeTextures();
    this.drawBackground();

    // --- монстр: тело + щупальца (часть позади тела, часть спереди) ---
    const mx = 130;
    const my = 205;
    const mk = (angle: number, phase: number, flip: boolean, depth: number, w = 12, segs = 14) => {
      const t = new Tentacle(this, mx + Math.cos(angle) * 22, my - 18 + Math.sin(angle) * 10, {
        angle,
        phase,
        flip,
        width: w,
        segments: segs,
        segLen: 9,
      });
      t.g.setDepth(depth);
      this.tentacles.push(t);
    };
    mk(-2.4, 1, false, 1, 11, 15);
    mk(-1.9, 2.5, true, 1, 9, 13);
    mk(-1.1, 4, false, 1, 9, 13);
    mk(-0.6, 5.5, true, 1, 11, 15);
    this.body = this.add.sprite(mx, my, CHARACTERS.monster.sprite, IDLE_FRAME).setOrigin(0.5, 1).setScale(1.6).setDepth(2);
    this.eye = this.add.graphics().setDepth(3);
    mk(-3.0, 7, true, 4, 10, 12);
    mk(-0.15, 8.5, false, 4, 10, 12);
    mk(-1.55, 3.3, false, 4, 8, 11);

    // --- девушка справа (кадр «стоим» по направлению нажатой дорожки) ---
    this.girl = this.add.sprite(468, 262, CHARACTERS[PLAYER_ID].sprite, IDLE_FRAME).setOrigin(0.5, 1).setDepth(10);

    // --- дорожки ---
    for (let i = 0; i < RHYTHM.lanes; i++) {
      const r = this.add.image(LANE_X0 + i * LANE_GAP, RHYTHM.receptorY, `mg_receptor_${i}`).setDepth(20).setAlpha(0.8);
      this.receptors.push(r);
      const keys = RHYTHM.keys[i].map((k) => this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes[k as keyof typeof Phaser.Input.Keyboard.KeyCodes]));
      this.laneKeys.push(keys);
      const hint = this.add.text(r.x, RHYTHM.receptorY + 20, RHYTHM.keys[i][0], hudStyle(9, '#9c94a8')).setOrigin(0.5).setDepth(20);
      this.tweens.add({ targets: hint, alpha: 0, delay: 7000, duration: 800 });
    }

    // --- HUD ---
    this.hudScore = this.add.text(GAME_WIDTH - 8, 8, '0', hudStyle(12)).setOrigin(1, 0).setDepth(30);
    this.hudCombo = this.add.text(LANE_X0 + LANE_GAP * 1.5, 100, '', hudStyle(14, '#ffe36e')).setOrigin(0.5).setDepth(30);
    this.healthBar = this.add.graphics().setDepth(30);
    this.targetsG = this.add.graphics().setDepth(28);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.clickTarget(p));

    // --- чарт и музыка ---
    const def = getMusic(MUSIC_KEY);
    this.chart = def.theme ? buildChart(def.theme, RHYTHM.minMidi, RHYTHM.lanes, { track: def.chartTrack, bpm: def.bpm }) : [];
    const firstBeat = this.chart.length ? this.chart[0].beat : 0;
    const lastBeat = this.chart.length ? Math.max(...this.chart.map((n) => n.beat)) : 8;
    this.endBeat = lastBeat + 4;
    this.stage2Beat = firstBeat + (lastBeat - firstBeat) * RHYTHM.stage2.atFrac;
    for (const c of this.chart) {
      const obj = this.add.image(LANE_X0 + c.lane * LANE_GAP, -100, `mg_arrow_${c.lane}`).setDepth(25).setVisible(false);
      this.notes.push({ beat: c.beat, lane: c.lane, obj, hit: false, missed: false });
    }
    audio.playMusic(MUSIC_KEY, { leadBeats: RHYTHM.leadBeats, restart: true, ms: 0 });
    this.started = true;
    audio.sfx('roar');
    this.say('Хочешь пройти? Попади в ритм!');
    this.tentacles.forEach((t) => t.kick(1));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tentacles.forEach((t) => t.destroy());
      this.input.setDefaultCursor('default');
    });
  }

  /** Текстуры стрелок: заливка цветом дорожки + приёмник-контур. Рисуются один раз в Graphics. */
  private makeTextures(): void {
    for (let i = 0; i < RHYTHM.lanes; i++) {
      for (const kind of ['arrow', 'receptor'] as const) {
        const key = `mg_${kind}_${i}`;
        if (this.textures.exists(key)) continue;
        const g = this.make.graphics({ x: 0, y: 0 });
        const c = ARROW / 2;
        const pts = [
          { x: c, y: 3 },
          { x: ARROW - 3, y: c },
          { x: c + 5, y: c },
          { x: c + 5, y: ARROW - 3 },
          { x: c - 5, y: ARROW - 3 },
          { x: c - 5, y: c },
          { x: 3, y: c },
        ]; // стрелка вверх
        const rot = { left: -Math.PI / 2, down: Math.PI, up: 0, right: Math.PI / 2 }[LANE_DIRS[i]];
        const rp = pts.map((p) => {
          const dx = p.x - c;
          const dy = p.y - c;
          return new Phaser.Math.Vector2(c + dx * Math.cos(rot) - dy * Math.sin(rot), c + dx * Math.sin(rot) + dy * Math.cos(rot));
        });
        if (kind === 'arrow') {
          g.fillStyle(LANE_COLORS[i], 1);
          g.fillPoints(rp, true);
          g.lineStyle(2, 0x1b1420, 1);
          g.strokePoints(rp, true);
        } else {
          g.lineStyle(2, 0x9c94a8, 1);
          g.strokePoints(rp, true);
          g.fillStyle(0x9c94a8, 0.15);
          g.fillPoints(rp, true);
        }
        g.generateTexture(key, ARROW, ARROW);
        g.destroy();
      }
    }
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    // кирпичная стена
    g.fillStyle(0x1b2a2b, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (let y = 0; y < 210; y += 12) {
      for (let x = (y / 12) % 2 === 0 ? 0 : -14; x < GAME_WIDTH; x += 28) {
        g.fillStyle(((x + y) * 7) % 5 === 0 ? 0x24393a : 0x203334, 1);
        g.fillRect(x + 1, y + 1, 26, 10);
      }
    }
    // труба
    g.fillStyle(0x3a4a4c, 1);
    g.fillRect(0, 60, GAME_WIDTH, 14);
    g.fillStyle(0x2a3738, 1);
    g.fillRect(0, 71, GAME_WIDTH, 3);
    // пол-бортик
    g.fillStyle(0x2c3d3e, 1);
    g.fillRect(0, 210, GAME_WIDTH, 78);
    g.fillStyle(0x3d5253, 1);
    g.fillRect(0, 210, GAME_WIDTH, 4);
    this.water = this.add.graphics().setDepth(0.5);
  }

  /** Реплика монстра в пузыре над телом. */
  private say(text: string, ms = 2200): void {
    this.bubble?.destroy();
    const t = this.add.text(0, 0, text, hudStyle(10, '#1b1420', { stroke: '#ffffff', strokeThickness: 0, wordWrap: { width: 150 } })).setOrigin(0.5, 1);
    const bg = this.add.rectangle(0, 0, t.width + 12, t.height + 8, 0xf4f0e0).setOrigin(0.5, 1).setStrokeStyle(2, 0x1b1420);
    t.setY(-4);
    bg.setY(0);
    this.bubble = this.add.container(this.body.x + 40, this.body.y - this.body.displayHeight - 8, [bg, t]).setDepth(40);
    this.time.delayedCall(ms, () => this.bubble?.destroy());
  }

  override update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const beat = this.started ? audio.beat() : -RHYTHM.leadBeats;
    const bpm = audio.bpm;
    const secPerBeat = 60 / bpm;
    const phase = ((beat % 1) + 1) % 1;

    // монстр и вода
    this.tentacles.forEach((t) => t.update(dt, phase));
    this.body.setScale(this.bodyScale, this.bodyScale - 0.06 * Math.sin(phase * Math.PI * 2));
    this.drawEye();
    this.drawWater(_time / 1000);
    if (Math.floor(beat) !== this.lastBeatInt && beat >= 0) {
      this.lastBeatInt = Math.floor(beat);
      if (this.lastBeatInt % 2 === 0) this.tentacles[Phaser.Math.Between(0, this.tentacles.length - 1)].kick(0.4);
    }
    if (this.girlHold > 0) {
      this.girlHold -= dt;
      if (this.girlHold <= 0) this.girl.setFrame(IDLE_FRAME);
    }

    if (this.over) return;
    if (this.escKey && Phaser.Input.Keyboard.JustDown(this.escKey)) {
      void this.lose(true);
      return;
    }

    // отсчёт
    if (beat < 0) {
      const b = Math.ceil(-beat);
      if (b !== this.lastCountBeat && b <= 4) {
        this.lastCountBeat = b;
        audio.sfx('tick', { rate: b === 1 ? 1.5 : 1 });
        void this.banner(b === 1 ? 'Го!' : String(b - 1), 400, 22);
      }
    }

    // стрелки
    for (const n of this.notes) {
      if (n.hit) continue;
      const dy = (n.beat - beat) * RHYTHM.pxPerBeat;
      const y = RHYTHM.receptorY + dy;
      if (y > GAME_HEIGHT + 20 || y < -30) {
        n.obj.setVisible(false);
      } else {
        n.obj.setVisible(true).setY(y);
      }
      const dtSec = (n.beat - beat) * secPerBeat;
      if (!n.missed && dtSec < -RHYTHM.windows.ok) {
        n.missed = true;
        n.obj.setAlpha(0.35);
        this.judgeLane('miss', n.lane);
      }
    }

    // нажатия
    for (let lane = 0; lane < RHYTHM.lanes; lane++) {
      const pressed = this.laneKeys[lane].some((k) => Phaser.Input.Keyboard.JustDown(k));
      if (!pressed) continue;
      this.pressLane(lane);
      let best: Note | null = null;
      let bestAbs = Infinity;
      for (const n of this.notes) {
        if (n.hit || n.missed || n.lane !== lane) continue;
        const d = Math.abs((n.beat - beat) * secPerBeat);
        if (d < bestAbs) {
          bestAbs = d;
          best = n;
        }
      }
      if (best && bestAbs <= RHYTHM.windows.ok) {
        best.hit = true;
        best.obj.destroy();
        const j: Judge = bestAbs <= RHYTHM.windows.perfect ? 'perfect' : bestAbs <= RHYTHM.windows.good ? 'good' : 'ok';
        this.judgeLane(j, lane);
      }
    }

    // вторая стадия: мишени под мышь
    if (this.stage === 1 && beat >= this.stage2Beat) this.enterStage2();
    if (this.stage === 2) this.updateTargets(audio.time());

    // конец
    if (beat > this.endBeat) void this.win();
  }

  // ---------------------------------------------------------------- вторая стадия

  private enterStage2(): void {
    this.stage = 2;
    audio.sfx('roar', { rate: 0.8 });
    this.cameras.main.shake(400, 0.012);
    void this.banner('Вторая стадия!\nКликай по кругам, когда кольцо сожмётся', 2200, 14, '#f28b8b');
    this.say('Теперь по-настоящему. Лови!', 2500);
    this.tentacles.forEach((t) => {
      t.kick(1);
      t.setCurl(0);
    });
    this.tweens.add({ targets: this, bodyScale: 1.85, duration: 600, ease: 'Back.easeOut' });
    this.nextTargetAt = audio.time() + 0.9;
    this.input.setDefaultCursor('crosshair');
  }

  /** Радиус кольца мишени сейчас (сжимается от radiusFrom к radiusTo за life секунд). */
  private ringRadius(t: Target, now: number): number {
    const S = RHYTHM.stage2;
    const k = Phaser.Math.Clamp((now - t.born) / S.life, 0, 1);
    return S.radiusFrom + (S.radiusTo - S.radiusFrom) * k;
  }

  private updateTargets(now: number): void {
    const S = RHYTHM.stage2;
    if (now >= this.nextTargetAt && !this.over) {
      this.targets.push({
        x: Phaser.Math.Between(S.area.x0, S.area.x1),
        y: Phaser.Math.Between(S.area.y0, S.area.y1),
        born: now,
        color: LANE_COLORS[Phaser.Math.Between(0, LANE_COLORS.length - 1)],
        done: false,
      });
      this.targetsSpawned++;
      this.nextTargetAt = now + Phaser.Math.FloatBetween(S.everyMin, S.everyMax);
      audio.sfx('tick', { rate: 0.7, volume: 0.6 });
      this.tentacles[Phaser.Math.Between(0, this.tentacles.length - 1)].kick(0.6);
    }
    const g = this.targetsG;
    g.clear();
    for (const t of this.targets) {
      if (now - t.born >= S.life) {
        t.done = true;
        this.judge('miss', t.x, t.y - 14, t.color);
        continue;
      }
      const r = this.ringRadius(t, now);
      g.fillStyle(t.color, 0.85);
      g.fillCircle(t.x, t.y, S.radiusTo);
      g.lineStyle(2, 0x1b1420, 1);
      g.strokeCircle(t.x, t.y, S.radiusTo);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(t.x, t.y, 3);
      g.lineStyle(3, t.color, 0.95);
      g.strokeCircle(t.x, t.y, r);
      g.lineStyle(1, 0xffffff, 0.35);
      g.strokeCircle(t.x, t.y, r + 2);
    }
    this.targets = this.targets.filter((t) => !t.done);
  }

  /** Клик по мишени: оценка по тому, насколько кольцо совпало с кругом. */
  private clickTarget(p: Phaser.Input.Pointer): void {
    if (this.stage !== 2 || this.over) return;
    const S = RHYTHM.stage2;
    const now = audio.time();
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of this.targets) {
      const d = Math.hypot(w.x - t.x, w.y - t.y);
      if (d <= Math.max(this.ringRadius(t, now), S.radiusTo) + 6 && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return;
    best.done = true;
    const diff = this.ringRadius(best, now) - S.radiusTo;
    const j: Judge = diff <= S.windowsPx.perfect ? 'perfect' : diff <= S.windowsPx.good ? 'good' : 'ok';
    this.judge(j, best.x, best.y - 14, best.color);
    this.girl.setFrame(IDLE_FRAME);
    this.girlHold = 0.25;
  }

  private pressLane(lane: number): void {
    const r = this.receptors[lane];
    r.setAlpha(1).setScale(1.15);
    this.tweens.add({ targets: r, scale: 1, alpha: 0.8, duration: 120 });
    const row = DIR_ROWS.indexOf(LANE_DIRS[lane]);
    this.girl.setFrame(row * WALK_FRAMES + IDLE_FRAME);
    this.girlHold = 0.25;
  }

  private judgeLane(j: Judge, lane: number): void {
    this.judge(j, LANE_X0 + lane * LANE_GAP, RHYTHM.receptorY, LANE_COLORS[lane]);
  }

  /** Оценка попадания/промаха: здоровье, комбо, очки, подпись и всплеск в точке (x, y). */
  private judge(j: Judge, x: number, y: number, color: number): void {
    const H = RHYTHM.health;
    this.counts[j]++;
    const [text, tcolor] = JUDGE_TEXT[j];
    this.popup(x, y + 34, text, tcolor, 10);
    if (j === 'miss') {
      this.combo = 0;
      this.health += H.miss;
      audio.sfx('miss');
      this.tentacles.forEach((t) => t.kick(0.9));
      this.body.setTint(0xff8888);
      this.time.delayedCall(120, () => this.body.clearTint());
      if (Math.random() < 0.3) this.say(['Ха!', 'Мимо!', 'Слышала ритм?', 'Ещё разок!'][Phaser.Math.Between(0, 3)], 900);
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const gain = j === 'perfect' ? H.perfect : j === 'good' ? H.good : H.ok;
      this.health += gain;
      this.score += (j === 'perfect' ? 300 : j === 'good' ? 200 : 100) + Math.min(this.combo, 30) * 5;
      audio.sfx(`hit_${j}`, { volume: 0.7 });
      this.splash(x, y, color);
      this.girl.setScale(1.08);
      this.tweens.add({ targets: this.girl, scale: 1, duration: 120 });
      if (this.combo > 0 && this.combo % 10 === 0) this.tentacles.forEach((t) => t.setCurl(Math.min(1, this.combo / 40)));
    }
    this.health = Phaser.Math.Clamp(this.health, 0, 100);
    this.hudScore.setText(String(this.score));
    this.hudCombo.setText(this.combo >= 3 ? `x${this.combo}` : '');
    this.drawHealth();
    if (this.health <= 0) void this.lose(false);
  }

  private splash(x: number, y: number, color: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = this.add.circle(x, y, 2, color).setDepth(26);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * 16, y: y + Math.sin(a) * 16, alpha: 0, duration: 260, onComplete: () => p.destroy() });
    }
  }

  private drawHealth(): void {
    const g = this.healthBar;
    const w = 180;
    const x = LANE_X0 + LANE_GAP * 1.5 - w / 2;
    const y = GAME_HEIGHT - 16;
    g.clear();
    g.fillStyle(0x1b1420, 1);
    g.fillRect(x - 1, y - 1, w + 2, 10);
    g.fillStyle(0xf25a5a, 1);
    g.fillRect(x, y, w, 8);
    g.fillStyle(0x5fd66a, 1);
    g.fillRect(x + w * (1 - this.health / 100), y, w * (this.health / 100), 8);
  }

  private drawEye(): void {
    const g = this.eye;
    const cx = this.body.x;
    const cy = this.body.y - this.body.displayHeight * 0.42;
    const dx = this.girl.x - cx;
    const dy = this.girl.y - 40 - cy;
    const d = Math.hypot(dx, dy) || 1;
    g.clear();
    g.fillStyle(0xf4f0e0, 1);
    g.fillEllipse(cx, cy, 20, 14);
    g.fillStyle(0x1b0f22, 1);
    g.fillCircle(cx + (dx / d) * 5, cy + (dy / d) * 3, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + (dx / d) * 5 - 2, cy + (dy / d) * 3 - 2, 1.5);
  }

  private drawWater(t: number): void {
    const g = this.water;
    g.clear();
    g.fillStyle(0x1f3f4a, 1);
    g.fillRect(0, 232, GAME_WIDTH, 56);
    g.lineStyle(1, 0x3f7a8a, 0.8);
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let x = 0; x <= GAME_WIDTH; x += 8) {
        const y = 240 + k * 14 + Math.sin(x * 0.05 + t * 1.5 + k) * 2;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  private async win(): Promise<void> {
    if (this.over) return;
    this.over = true;
    audio.stopMusic(800);
    const total = this.notes.length + this.targetsSpawned;
    const hits = total - this.counts.miss;
    const acc = total ? Math.round((hits / total) * 100) : 100;
    const won = this.score >= RHYTHM.targetScore;
    if (won) {
      this.say('На этот раз ты одалел меня, Саске. Но кто знает что будет в будущем.', 3000);
      this.tentacles.forEach((t) => t.setCurl(1));
      this.tweens.add({ targets: this.body, y: this.body.y + 60, alpha: 0, duration: 1500, delay: 600 });
      this.tweens.add({ targets: this.tentacles.map((t) => t.g), alpha: 0, duration: 1200, delay: 900 });
    } else {
      this.say('Бро, тебе надо больше тренироваться', 2500);
      this.tentacles.forEach((t) => t.kick(1));
    }
    const title = won ? 'Победа!' : 'Мало очков!';
    const r = await this.endScreen(won, title, [
      `Очки: ${this.score} (нужно ${RHYTHM.targetScore})`,
      `Точность: ${acc}%   Макс. комбо: ${this.maxCombo}`,
      `Идеально ${this.counts.perfect} · Хорошо ${this.counts.good} · Так себе ${this.counts.ok} · Мимо ${this.counts.miss}`,
    ]);
    if (!won && r === 'retry') this.scene.restart({ id: this.mgId });
    else this.finish({ won, score: this.score });
  }

  private async lose(quit: boolean): Promise<void> {
    if (this.over) return;
    this.over = true;
    audio.stopMusic(300);
    if (!quit) {
      audio.sfx('roar');
      this.say('Сбилась! Ха-ха-ха!', 2500);
      this.tentacles.forEach((t) => t.kick(1));
      this.cameras.main.shake(300, 0.01);
    }
    const r = quit ? 'exit' : await this.endScreen(false, 'Сбилась с ритма', [`Очки: ${this.score}`, `Макс. комбо: ${this.maxCombo}`]);
    if (r === 'retry') this.scene.restart({ id: this.mgId });
    else this.finish({ won: false, score: this.score });
  }
}
