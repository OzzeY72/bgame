/**
 * Синтезатор на WebAudio: играет темы из music/<тема>.json (нотная запись из music/compose.py),
 * пока нет экспортированных OGG, и генерирует звуковые эффекты без файлов.
 * Инструменты — простые осцилляторы с огибающими; задача — узнаваемая мелодия и ритм, не «продакшн».
 */

export interface ThemeNote {
  midi: number;
  /** старт в долях (четвертях) */
  time: number;
  duration: number;
  velocity: number;
}

export interface ThemeJson {
  meta: { bpm: number; bars: number; time_signature?: string; key?: string };
  tracks: Record<string, ThemeNote[]>;
}

export interface ThemeOptions {
  /** переопределить темп темы */
  bpm?: number;
  /** тишина перед первой долей (отсчёт) в долях */
  leadBeats?: number;
  /** транспонирование в полутонах */
  transpose?: number;
  loop?: boolean;
  gain?: number;
}

const LOOKAHEAD = 0.3; // сек. — насколько вперёд планируем ноты
const TICK_MS = 40;

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Один голос: осцилляторы + фильтр + огибающая громкости. Всё сводится в `out`. */
function voice(ctx: AudioContext, out: AudioNode, track: string, hz: number, t: number, dur: number, vel: number): void {
  const g = ctx.createGain();
  g.connect(out);
  const oscs: OscillatorNode[] = [];
  const mk = (type: OscillatorType, freq: number, detune = 0, level = 1, dest: AudioNode = g) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    if (level !== 1) {
      const lg = ctx.createGain();
      lg.gain.value = level;
      o.connect(lg);
      lg.connect(dest);
    } else o.connect(dest);
    oscs.push(o);
    return o;
  };
  const env = (peak: number, attack: number, decayTo: number, decay: number, release: number, hold = dur) => {
    const end = t + Math.max(hold, 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (decayTo < peak) g.gain.exponentialRampToValueAtTime(Math.max(decayTo, 0.0001), Math.min(end, t + attack + decay));
    g.gain.setValueAtTime(g.gain.value, end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + release);
    return end + release;
  };
  let stopAt: number;
  switch (track) {
    case 'pad':
    case 'synthpad': {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      f.Q.value = 0.7;
      f.connect(g);
      mk('sawtooth', hz, -7, 0.5, f);
      mk('sawtooth', hz, +7, 0.5, f);
      mk('triangle', hz / 2, 0, 0.35, f);
      stopAt = env(vel * 0.16, 0.35, vel * 0.16, 0, 0.6);
      break;
    }
    case 'piano': {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      f.connect(g);
      mk('triangle', hz, 0, 1, f);
      mk('sine', hz * 2, 0, 0.25, f);
      mk('sine', hz * 3, 0, 0.06, f);
      stopAt = env(vel * 0.42, 0.006, vel * 0.12, Math.max(0.25, dur * 0.8), 0.25);
      break;
    }
    case 'guitar': {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3200, t);
      f.frequency.exponentialRampToValueAtTime(600, t + 0.35);
      f.connect(g);
      mk('sawtooth', hz, 0, 0.6, f);
      mk('triangle', hz, 3, 0.5, f);
      stopAt = env(vel * 0.3, 0.004, vel * 0.05, 0.5, 0.2, Math.min(dur, 0.7));
      break;
    }
    case 'bass': {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      f.connect(g);
      mk('sine', hz, 0, 1, f);
      mk('triangle', hz, 0, 0.5, f);
      stopAt = env(vel * 0.5, 0.012, vel * 0.35, 0.4, 0.12);
      break;
    }
    case 'bells': {
      mk('sine', hz, 0, 0.8);
      mk('sine', hz * 2.76, 0, 0.18);
      stopAt = env(vel * 0.3, 0.003, vel * 0.03, 0.9, 0.3, Math.min(dur, 1.2));
      break;
    }
    case 'arp': {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(2400, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      f.connect(g);
      mk('square', hz, 0, 0.35, f);
      mk('sawtooth', hz / 2, 0, 0.25, f);
      stopAt = env(vel * 0.22, 0.003, vel * 0.04, 0.3, 0.12, Math.min(dur, 0.4));
      break;
    }
    // --- голоса nightmare_theme (см. music/README.md §1.2) ---
    case 'organ': {
      // орган: чистые гармоники, без спада, короткий релиз
      mk('sine', hz, 0, 0.5);
      mk('sine', hz * 2, 0, 0.35);
      mk('sine', hz * 3, 0, 0.12);
      mk('sine', hz * 4, 0, 0.1);
      stopAt = env(vel * 0.2, 0.02, vel * 0.2, 0, 0.08);
      break;
    }
    case 'harp': {
      // клавесин/арфа: резкая атака, быстрый спад
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(4000, t);
      f.frequency.exponentialRampToValueAtTime(900, t + 0.2);
      f.connect(g);
      mk('sawtooth', hz, 0, 0.45, f);
      mk('square', hz * 2, 0, 0.12, f);
      stopAt = env(vel * 0.24, 0.002, vel * 0.03, 0.35, 0.1, Math.min(dur, 0.45));
      break;
    }
    case 'lead': {
      // чиптюн-лид: квадрат с лёгким вибрато
      const o = mk('square', hz, 0, 0.35);
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = 6; // центы
      lfo.connect(lg);
      lg.connect(o.detune);
      oscs.push(lfo); // стартует/останавливается вместе с остальными
      stopAt = env(vel * 0.3, 0.005, vel * 0.22, 0.2, 0.06);
      break;
    }
    case 'brass': {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(2200, t + 0.08);
      f.connect(g);
      mk('sawtooth', hz, -5, 0.5, f);
      mk('sawtooth', hz, +5, 0.5, f);
      stopAt = env(vel * 0.26, 0.04, vel * 0.18, 0.25, 0.12);
      break;
    }
    case 'choir': {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.8;
      f.connect(g);
      mk('sawtooth', hz, -9, 0.4, f);
      mk('sawtooth', hz, +9, 0.4, f);
      mk('sine', hz, 0, 0.5, f);
      stopAt = env(vel * 0.18, 0.3, vel * 0.18, 0, 0.5);
      break;
    }
    case 'drums': {
      // GM-ударные: 35/36 — бочка, 38/40 — малый, 42/44/46 — хэты, остальное — томы/тарелки как шум
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      if (midi === 35 || midi === 36) {
        const o = mk('sine', 150, 0, 1);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        stopAt = env(vel * 0.9, 0.002, vel * 0.05, 0.14, 0.05, 0.14);
        break;
      }
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      const hat = midi === 42 || midi === 44 || midi === 46;
      f.type = hat ? 'highpass' : 'bandpass';
      f.frequency.value = hat ? 6000 : 1800;
      f.Q.value = hat ? 0.7 : 0.5;
      src.connect(f);
      f.connect(g);
      const len = hat ? (midi === 46 ? 0.18 : 0.05) : 0.16;
      stopAt = env(vel * (hat ? 0.22 : 0.5), 0.001, vel * 0.02, len, 0.03, len);
      src.start(t);
      src.stop(stopAt + 0.05);
      src.onended = () => g.disconnect();
      return;
    }
    default: {
      mk('triangle', hz);
      stopAt = env(vel * 0.3, 0.01, vel * 0.15, 0.3, 0.2);
    }
  }
  for (const o of oscs) {
    o.start(t);
    o.stop(stopAt + 0.05);
  }
  oscs[0].onended = () => g.disconnect();
}

/**
 * Проигрыватель темы: планирует ноты с опережением, зацикливает. beat() — текущая доля
 * относительно начала музыки (во время отсчёта отрицательная) — для ритм-игры.
 */
export class ThemePlayer {
  readonly bpm: number;
  readonly loopBeats: number;
  private gain: GainNode;
  private timer = 0;
  private startAt = 0;
  private cursors: { track: string; notes: ThemeNote[]; i: number; loop: number }[] = [];
  private stopped = false;
  private transpose: number;
  private loop: boolean;

  constructor(private ctx: AudioContext, out: AudioNode, theme: ThemeJson, opts: ThemeOptions = {}) {
    this.bpm = opts.bpm ?? theme.meta.bpm;
    this.loopBeats = theme.meta.bars * 4;
    this.transpose = opts.transpose ?? 0;
    this.loop = opts.loop ?? true;
    this.gain = ctx.createGain();
    this.gain.gain.value = opts.gain ?? 1;
    this.gain.connect(out);
    for (const [track, notes] of Object.entries(theme.tracks)) {
      this.cursors.push({ track, notes: [...notes].sort((a, b) => a.time - b.time), i: 0, loop: 0 });
    }
    this.startAt = ctx.currentTime + 0.08 + ((opts.leadBeats ?? 0) * 60) / this.bpm;
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  private beatToTime(beat: number): number {
    return this.startAt + (beat * 60) / this.bpm;
  }

  private schedule(): void {
    if (this.stopped) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    for (const c of this.cursors) {
      while (true) {
        if (c.i >= c.notes.length) {
          if (!this.loop) break;
          c.i = 0;
          c.loop++;
        }
        const n = c.notes[c.i];
        const t = this.beatToTime(n.time + c.loop * this.loopBeats);
        if (t > horizon) break;
        c.i++;
        if (t < this.ctx.currentTime - 0.05) continue; // опоздали (вкладка была скрыта) — пропускаем
        const beatSec = 60 / this.bpm;
        voice(this.ctx, this.gain, c.track, midiToHz(n.midi + this.transpose), t, n.duration * beatSec, n.velocity);
      }
    }
  }

  /** Текущая доля (может быть отрицательной во время отсчёта). */
  beat(): number {
    return ((this.ctx.currentTime - this.startAt) * this.bpm) / 60;
  }

  setGain(v: number, ms = 0): void {
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    if (ms <= 0) this.gain.gain.setValueAtTime(v, now);
    else {
      this.gain.gain.setValueAtTime(Math.max(this.gain.gain.value, 0.0001), now);
      this.gain.gain.linearRampToValueAtTime(v, now + ms / 1000);
    }
  }

  stop(fadeMs = 0): void {
    if (this.stopped) return;
    this.stopped = true;
    window.clearInterval(this.timer);
    this.setGain(0, fadeMs);
    window.setTimeout(() => this.gain.disconnect(), fadeMs + 50);
  }
}

// ---------------------------------------------------------------- звуковые эффекты

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

interface Tone {
  type?: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  vol?: number;
  at?: number;
  slide?: 'lin' | 'exp';
}

function tone(ctx: AudioContext, out: AudioNode, o: Tone): void {
  const t = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to !== undefined) {
    if (o.slide === 'lin') osc.frequency.linearRampToValueAtTime(o.to, t + o.dur);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t + o.dur);
  }
  const v = o.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
  osc.onended = () => g.disconnect();
}

function burst(ctx: AudioContext, out: AudioNode, dur: number, vol: number, filterFrom: number, filterTo: number, at = 0, type: BiquadFilterType = 'lowpass'): void {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filterFrom, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(filterTo, 20), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
  src.onended = () => g.disconnect();
}

/** Все эффекты игры. Имя → как звучит. Неизвестное имя — короткий щелчок. */
export function playSynthSfx(ctx: AudioContext, out: AudioNode, name: string, opts: { volume?: number; rate?: number } = {}): void {
  const v = opts.volume ?? 1;
  const r = opts.rate ?? 1;
  switch (name) {
    case 'blip': // печать текста
      tone(ctx, out, { type: 'square', from: 880 * r, to: 660 * r, dur: 0.05, vol: 0.05 * v });
      break;
    case 'select':
      tone(ctx, out, { type: 'square', from: 660, to: 990, dur: 0.07, vol: 0.12 * v });
      break;
    case 'bark':
      burst(ctx, out, 0.09, 0.5 * v, 900, 300, 0, 'bandpass');
      tone(ctx, out, { type: 'sawtooth', from: 380 * r, to: 220 * r, dur: 0.12, vol: 0.22 * v });
      break;
    case 'pickup':
      [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, { type: 'square', from: f * r, dur: 0.12, vol: 0.12 * v, at: i * 0.07 }));
      break;
    case 'gift': // фанфара при открытии коробки
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, { type: 'triangle', from: f, dur: 0.35, vol: 0.18 * v, at: i * 0.11 }));
      burst(ctx, out, 0.5, 0.15 * v, 6000, 1500, 0.55, 'highpass');
      break;
    case 'open': // крышка
      burst(ctx, out, 0.12, 0.3 * v, 1200, 200);
      tone(ctx, out, { type: 'triangle', from: 300, to: 500, dur: 0.15, vol: 0.12 * v, slide: 'lin' });
      break;
    case 'locked':
      tone(ctx, out, { type: 'square', from: 220, to: 180, dur: 0.12, vol: 0.14 * v });
      tone(ctx, out, { type: 'square', from: 180, to: 140, dur: 0.16, vol: 0.14 * v, at: 0.14 });
      break;
    case 'tick': // метроном отсчёта
      tone(ctx, out, { type: 'square', from: 1200 * r, dur: 0.04, vol: 0.12 * v });
      break;
    case 'hit_perfect':
      tone(ctx, out, { type: 'square', from: 880 * r, to: 1320 * r, dur: 0.09, vol: 0.12 * v });
      tone(ctx, out, { type: 'sine', from: 1760 * r, dur: 0.12, vol: 0.08 * v, at: 0.03 });
      break;
    case 'hit_good':
      tone(ctx, out, { type: 'square', from: 660 * r, to: 880 * r, dur: 0.08, vol: 0.11 * v });
      break;
    case 'hit_ok':
      tone(ctx, out, { type: 'triangle', from: 440 * r, to: 520 * r, dur: 0.08, vol: 0.11 * v });
      break;
    case 'miss':
      tone(ctx, out, { type: 'sawtooth', from: 200, to: 90, dur: 0.22, vol: 0.16 * v });
      burst(ctx, out, 0.12, 0.12 * v, 800, 200);
      break;
    case 'roar': // монстр
      tone(ctx, out, { type: 'sawtooth', from: 110, to: 70, dur: 0.6, vol: 0.2 * v });
      tone(ctx, out, { type: 'square', from: 165, to: 95, dur: 0.6, vol: 0.1 * v, at: 0.03 });
      burst(ctx, out, 0.6, 0.18 * v, 500, 120);
      break;
    case 'shot':
      burst(ctx, out, 0.07, 0.35 * v, 3000, 400);
      tone(ctx, out, { type: 'square', from: 220, to: 60, dur: 0.06, vol: 0.12 * v });
      break;
    case 'explode':
      burst(ctx, out, 0.5, 0.6 * v, 1200, 60);
      tone(ctx, out, { type: 'sine', from: 120, to: 30, dur: 0.45, vol: 0.3 * v });
      break;
    case 'clank': // попадание без уничтожения
      tone(ctx, out, { type: 'square', from: 1500, to: 400, dur: 0.05, vol: 0.1 * v });
      burst(ctx, out, 0.05, 0.2 * v, 5000, 1000, 0, 'highpass');
      break;
    case 'alert':
      [0, 0.25].forEach((at) => tone(ctx, out, { type: 'square', from: 520, to: 780, dur: 0.22, vol: 0.14 * v, at, slide: 'lin' }));
      break;
    case 'wrong': // сбили своего
      tone(ctx, out, { type: 'sawtooth', from: 300, to: 120, dur: 0.35, vol: 0.18 * v });
      tone(ctx, out, { type: 'square', from: 250, to: 100, dur: 0.35, vol: 0.1 * v, at: 0.05 });
      break;
    case 'drone': // пролёт
      tone(ctx, out, { type: 'sawtooth', from: 90, to: 80, dur: 0.6, vol: 0.05 * v });
      break;
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, { type: 'square', from: f, dur: 0.3, vol: 0.14 * v, at: i * 0.12 }));
      break;
    case 'lose':
      [440, 415, 392, 330].forEach((f, i) => tone(ctx, out, { type: 'sawtooth', from: f, dur: 0.4, vol: 0.12 * v, at: i * 0.22 }));
      break;
    case 'brush': // штрих в рисовалке
      burst(ctx, out, 0.05, 0.08 * v, 2500, 800, 0, 'bandpass');
      break;
    case 'whoosh':
      burst(ctx, out, 0.35, 0.25 * v, 300, 3000, 0, 'bandpass');
      break;
    case 'splash':
      burst(ctx, out, 0.3, 0.3 * v, 2000, 300);
      break;
    case 'drip': // капля воды в канализации
      tone(ctx, out, { type: 'sine', from: 1400 * r, to: 500 * r, dur: 0.12, vol: 0.1 * v, slide: 'exp' });
      break;
    case 'firework': // свист ракеты вверх (взрыв — 'explode' отдельно)
      tone(ctx, out, { type: 'sine', from: 500 * r, to: 1400 * r, dur: 0.55, vol: 0.06 * v, slide: 'lin' });
      burst(ctx, out, 0.5, 0.06 * v, 1500, 4000, 0, 'bandpass');
      break;
    case 'notify': // уведомление банковского приложения
      tone(ctx, out, { type: 'sine', from: 880, dur: 0.12, vol: 0.14 * v });
      tone(ctx, out, { type: 'sine', from: 660, dur: 0.2, vol: 0.14 * v, at: 0.13 });
      break;
    default:
      tone(ctx, out, { type: 'square', from: 600, to: 400, dur: 0.05, vol: 0.1 * v });
  }
}
