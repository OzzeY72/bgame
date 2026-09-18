import Phaser from 'phaser';
import { AUDIO } from '../config';
import { getMusic, type MusicDef } from '../data/music';
import { VOICE_CLIPS, voiceKey } from '../data/assets';
import { ThemePlayer, playSynthSfx } from './Synth';
import { bus } from './EventBus';

interface Current {
  key: string;
  def: MusicDef;
  bpm: number;
  /** момент первой доли в секундах AudioContext */
  startAt: number;
  sound?: Phaser.Sound.WebAudioSound;
  synth?: ThemePlayer;
  /** до этого момента (performance.now) applyVolumes не трогает sound.volume — идёт fade-in */
  fadeUntil?: number;
}

/**
 * Звук игры: фоновая музыка (OGG из public/assets/music или синтез темы из music/*.json — см. data/music.ts)
 * и эффекты (файл assets/sfx/<name>.ogg, иначе синтез из core/Synth.ts). Один на игру.
 * beat() — текущая доля музыки (для ритм-игры). M — mute (UIScene). Громкости — в localStorage.
 */
class AudioSystem {
  private manager?: Phaser.Sound.BaseSoundManager;
  private ctx?: AudioContext;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private current: Current | null = null;
  private pending: (() => void) | null = null;
  /** голос: какие клипы реально загружены (по префиксу) и что сейчас звучит */
  private voiceClips = new Map<string, string[]>();
  private voiceSound?: Phaser.Sound.BaseSound;
  private voiceLast = '';
  volumes = { music: AUDIO.music, sfx: AUDIO.sfx };
  muted = false;

  /** Вызывается один раз из PreloadScene: берёт SoundManager игры и её AudioContext. */
  attach(scene: Phaser.Scene): void {
    if (this.manager) return;
    this.manager = scene.sound;
    this.loadSettings();
    if (this.manager instanceof Phaser.Sound.WebAudioSoundManager) {
      this.ctx = this.manager.context;
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.applyVolumes();
      // автоплей: контекст запускается после первого клика/клавиши (Phaser снимает блокировку сам)
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx?.state === 'running' && this.pending) {
          const p = this.pending;
          this.pending = null;
          p();
        }
      });
    }
  }

  get available(): boolean {
    return !!this.ctx;
  }

  private get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ---------------------------------------------------------------- музыка

  /**
   * Включить музыку по ключу из data/music.ts. Та же музыка уже играет — ничего не делает (если не restart).
   * leadBeats — тишина-отсчёт перед первой долей (ритм-игра). null — выключить.
   */
  playMusic(key: string | null, opts: { ms?: number; leadBeats?: number; restart?: boolean } = {}): void {
    const ms = opts.ms ?? 600;
    if (key === null) {
      this.stopMusic(ms);
      return;
    }
    if (this.current?.key === key && !opts.restart) return;
    if (!this.ctx || !this.manager) return;
    const start = () => {
      if (this.current?.key === key && !opts.restart) return;
      this.stopMusic(ms);
      const def = getMusic(key);
      const bpm = def.bpm ?? def.theme?.meta.bpm ?? 120;
      const lead = ((opts.leadBeats ?? 0) * 60) / bpm;
      const vol = (def.volume ?? 1) * this.volumes.music * (this.muted ? 0 : 1);
      const ctx = this.ctx!;
      if (this.manager!.get(key) || (this.manager as Phaser.Sound.WebAudioSoundManager).game.cache.audio.exists(key)) {
        const snd = this.manager!.add(key, { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
        // экспорт из FL часто длиннее темы на такт хвоста реверба — зацикливаем ровно по нотной записи,
        // иначе на стыке пауза в такт (см. music/README.md §5)
        const loopSec = def.theme ? (def.theme.meta.bars * 4 * 60) / bpm : 0;
        if (loopSec > 0 && snd.duration > loopSec + 0.1) {
          // volume: 0 — иначе Phaser берёт для маркера громкость по умолчанию (1) и звук на кадр включается на 100%
          snd.addMarker({ name: 'loop', start: 0, duration: loopSec, config: { loop: true, volume: 0 } });
          snd.play('loop', { delay: lead, volume: 0 });
        } else snd.play({ delay: lead, volume: 0 });
        // Phaser может сбросить volume при play() — принудительно 0 перед fade-in tween'ом
        snd.setVolume(0);
        // плавное появление через встроенный volume (Phaser ставит громкость мгновенно — используем твин)
        const scene = this.anyScene();
        const fadeUntil = ms > 0 ? performance.now() + ms + 50 : 0;
        if (scene && ms > 0) scene.tweens.add({ targets: snd, volume: vol, duration: ms });
        else snd.setVolume(vol);
        this.current = { key, def, bpm, startAt: ctx.currentTime + lead, sound: snd, fadeUntil };
      } else if (def.theme) {
        const synth = new ThemePlayer(ctx, this.musicGain!, def.theme, {
          bpm,
          leadBeats: opts.leadBeats ?? 0,
          transpose: def.transpose,
          gain: 0, // стартуем с нуля — fade-in ниже
        });
        // плавное появление синтеза — без этого при смене темы удар по ушам
        synth.setGain(def.volume ?? 1, ms > 0 ? ms : 0);
        this.current = { key, def, bpm, startAt: ctx.currentTime + 0.08 + lead, synth };
      } else {
        console.warn(`[audio] у музыки "${key}" нет ни файла, ни темы`);
      }
    };
    if (this.unlocked) start();
    else this.pending = start;
  }

  stopMusic(ms = 600): void {
    this.pending = null;
    const c = this.current;
    if (!c) return;
    this.current = null;
    if (c.synth) c.synth.stop(ms);
    if (c.sound) {
      const scene = this.anyScene();
      if (scene && ms > 0) scene.tweens.add({ targets: c.sound, volume: 0, duration: ms, onComplete: () => c.sound!.destroy() });
      else c.sound.destroy();
    }
  }

  get musicKey(): string | null {
    return this.current?.key ?? null;
  }

  get bpm(): number {
    return this.current?.bpm ?? 120;
  }

  /** Текущая доля музыки (отрицательная во время отсчёта); 0, если музыки нет. */
  beat(): number {
    const c = this.current;
    if (!c || !this.ctx) return 0;
    return ((this.ctx.currentTime - c.startAt) * c.bpm) / 60;
  }

  /** Секунды от первой доли. */
  time(): number {
    const c = this.current;
    if (!c || !this.ctx) return 0;
    return this.ctx.currentTime - c.startAt;
  }

  // ---------------------------------------------------------------- эффекты

  sfx(name: string, opts: { volume?: number; rate?: number } = {}): void {
    if (!this.manager || this.muted) return;
    const key = `sfx_${name}`;
    const vol = (opts.volume ?? 1) * this.volumes.sfx;
    if ((this.manager as Phaser.Sound.WebAudioSoundManager).game.cache.audio.exists(key)) {
      this.manager.play(key, { volume: vol, rate: opts.rate ?? 1 });
      return;
    }
    if (this.ctx && this.sfxGain && this.unlocked) playSynthSfx(this.ctx, this.sfxGain, name, opts);
  }

  /**
   * «Голос» персонажа при печати реплики: случайный из загруженных клипов assets/voice/<clips>_<n>.ogg,
   * новый не начинается, пока звучит предыдущий (так частота вызовов не важна — можно дёргать на каждой букве).
   * Клипов нет (или clips не задан) — блип синтезом/файлом с заданным rate.
   */
  voice(clips: string | undefined, opts: { volume?: number; rate?: number } = {}): void {
    if (!this.manager || this.muted) return;
    const keys = clips ? this.loadedVoice(clips) : [];
    if (!keys.length) {
      this.sfx('blip', opts);
      return;
    }
    if (this.voiceSound?.isPlaying) return;
    let key = keys[Math.floor(Math.random() * keys.length)];
    if (keys.length > 1 && key === this.voiceLast) key = keys[(keys.indexOf(key) + 1) % keys.length];
    this.voiceLast = key;
    this.voiceSound?.destroy();
    const snd = this.manager.add(key, {
      volume: (opts.volume ?? 1) * this.volumes.sfx,
      rate: (opts.rate ?? 1) * (0.94 + Math.random() * 0.12), // чуть разная высота — живее
    });
    snd.once(Phaser.Sound.Events.COMPLETE, () => snd.destroy());
    snd.play();
    this.voiceSound = snd;
  }

  private loadedVoice(clips: string): string[] {
    let keys = this.voiceClips.get(clips);
    if (!keys) {
      const cache = (this.manager as Phaser.Sound.WebAudioSoundManager).game.cache.audio;
      keys = [];
      for (let n = 1; n <= VOICE_CLIPS; n++) if (cache.exists(voiceKey(clips, n))) keys.push(voiceKey(clips, n));
      this.voiceClips.set(clips, keys);
    }
    return keys;
  }

  // ---------------------------------------------------------------- громкость

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    this.saveSettings();
    bus.emit('audio:mute', this.muted);
    return this.muted;
  }

  setVolume(kind: 'music' | 'sfx', v: number): void {
    this.volumes[kind] = Phaser.Math.Clamp(v, 0, 1);
    this.applyVolumes();
    this.saveSettings();
  }

  private applyVolumes(): void {
    const m = this.muted ? 0 : 1;
    if (this.musicGain) this.musicGain.gain.value = this.volumes.music * m;
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx * m;
    const c = this.current;
    // Не трогаем sound.volume пока идёт fade-in tween — иначе громкость прыгает на 100%
    if (c?.sound && !(c.fadeUntil && performance.now() < c.fadeUntil)) {
      c.sound.setVolume((c.def.volume ?? 1) * this.volumes.music * m);
    }
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(AUDIO.key);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d.music === 'number') this.volumes.music = d.music;
      if (typeof d.sfx === 'number') this.volumes.sfx = d.sfx;
      this.muted = !!d.muted;
    } catch {
      /* ignore */
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(AUDIO.key, JSON.stringify({ ...this.volumes, muted: this.muted }));
    } catch {
      /* ignore */
    }
  }

  private anyScene(): Phaser.Scene | undefined {
    const game = (this.manager as Phaser.Sound.WebAudioSoundManager | undefined)?.game;
    return game?.scene.getScenes(true)[0];
  }
}

export const audio = new AudioSystem();
