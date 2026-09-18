import Phaser from 'phaser';
import type { Cutscene, CutsceneCmd, Dir, MinigameResult } from '../types';
import { audio } from '../core/Audio';
import type { Actor } from '../entities/Actor';
import { bus } from '../core/EventBus';
import { lockInput, unlockInput } from '../core/InputLock';
import { gameState, type GameState, type PackedGift } from '../core/GameState';
import { dialogue, type DialogueManager } from './DialogueManager';
import { getCutscene } from '../data/cutscenes';
import { TILE } from '../config';

/** Что катсцене нужно от мира. Реализует WorldScene. */
export interface CutsceneContext {
  /** сцена мира (Phaser.Scene) */
  world: Phaser.Scene;
  /** номер "жизни" сцены: растёт при каждом restart. Если изменился — команды выполнять нельзя */
  epoch: number;
  state: GameState;
  dialogue: DialogueManager;
  getActor(id: string): Actor | undefined;
  spawnActor(id: string, sprite: string, tx: number, ty: number, dir?: Dir): Actor;
  removeActor(id: string): void;
  warp(map: string, spawn: string): Promise<void>;
  /** запустить мини-игру поверх мира и дождаться результата */
  runMinigame(id: string): Promise<MinigameResult>;
  /** открыть посылку из инвентаря на тайле карты: анимация, реплики предмета, предмет в инвентарь */
  openGift(g: PackedGift, at: [tx: number, ty: number]): Promise<void>;
}

/**
 * Исполнитель катсцен (в духе Stardew Valley event scripts).
 * Команды выполняются последовательно, `parallel` — одновременно.
 * На время катсцены управление игроком заблокировано (bus 'input:lock').
 * `warp` должен быть последней командой: сцена перезапускается.
 */
export class CutsceneRunner {
  running = false;
  /** id актёров, которых катсцена двигала/поворачивала — им надо вернуть взгляд в камеру по окончании. */
  private turnedActors = new Set<string>();

  constructor(private ctx: CutsceneContext) {}

  /** Запустить по id; учитывает once/if. Возвращает true, если катсцена сыграна. */
  async runById(id: string): Promise<boolean> {
    return this.run(getCutscene(id));
  }

  async run(cs: Cutscene): Promise<boolean> {
    const flag = `cutscene:${cs.id}`;
    if (cs.once && gameState.flag(flag)) return false;
    if (!gameState.check(cs.if)) return false;
    if (this.running) {
      console.warn(`[cutscene] "${cs.id}" пропущена: уже идёт другая`);
      return false;
    }
    this.running = true;
    lockInput();
    bus.emit('cutscene:start', cs.id);
    this.ctx.getActor('player')?.stopMoving();
    const epoch = this.ctx.epoch;
    let warped = false;
    this.turnedActors.clear();
    try {
      for (const cmd of cs.script) {
        if (this.ctx.epoch !== epoch) break; // сцена перезапущена (warp)
        const r = await this.exec(cmd);
        if (r === 'warp') {
          warped = true;
          break;
        }
      }
      if (cs.once) gameState.set(flag);
    } catch (e) {
      console.error(`[cutscene] ошибка в "${cs.id}":`, e);
    } finally {
      this.running = false;
      unlockInput();
      if (!warped) {
        // NPC, которых катсцена куда-то поворачивала, по окончании смотрят на игрока (вперёд, в камеру)
        for (const id of this.turnedActors) {
          if (id !== 'player') this.ctx.getActor(id)?.face('down');
        }
        bus.emit('cutscene:end', cs.id);
      }
    }
    return true;
  }

  private actor(id: string): Actor {
    const a = this.ctx.getActor(id);
    if (!a) throw new Error(`Актёр "${id}" не найден на карте`);
    return a;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((res) => this.ctx.world.time.delayedCall(ms, res));
  }

  private camEvent(event: string): Promise<void> {
    return new Promise((res) => this.ctx.world.cameras.main.once(event, () => res()));
  }

  async exec(cmd: CutsceneCmd): Promise<void | 'warp'> {
    const cam = this.ctx.world.cameras.main;

    if ('fade' in cmd) {
      const ms = cmd.ms ?? 500;
      if (cmd.fade === 'out') {
        cam.fadeOut(ms, 0, 0, 0);
        await this.camEvent(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE);
      } else {
        cam.fadeIn(ms, 0, 0, 0);
        await this.camEvent(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE);
      }
      return;
    }
    if ('wait' in cmd) return this.delay(cmd.wait);

    if ('parallel' in cmd) {
      await Promise.all(cmd.parallel.map((c) => this.exec(c)));
      return;
    }
    if ('branch' in cmd) {
      const list = gameState.check(cmd.branch.if) ? cmd.branch.then : (cmd.branch.else ?? []);
      for (const c of list) {
        const r = await this.exec(c);
        if (r === 'warp') return 'warp';
      }
      return;
    }
    if ('minigame' in cmd) {
      await this.ctx.runMinigame(cmd.minigame);
      return;
    }
    if ('music' in cmd) return void audio.playMusic(cmd.music, { ms: cmd.ms });
    if ('sfx' in cmd) return void audio.sfx(cmd.sfx);
    if ('call' in cmd) {
      await cmd.call(this.ctx);
      return;
    }
    if ('say' in cmd) return this.ctx.dialogue.lines([{ who: cmd.say, text: cmd.text, portrait: cmd.portrait }]);
    if ('think' in cmd) return this.ctx.dialogue.lines([{ think: true, text: cmd.think }]);
    if ('dialogue' in cmd) return this.ctx.dialogue.run(cmd.dialogue);

    if ('camera' in cmd) {
      const c = cmd.camera;
      if ('pan' in c) {
        cam.stopFollow();
        cam.pan((c.pan[0] + 0.5) * TILE, (c.pan[1] + 0.5) * TILE, c.ms ?? 600, 'Sine.easeInOut');
        await this.camEvent(Phaser.Cameras.Scene2D.Events.PAN_COMPLETE);
      } else if ('follow' in c) {
        const a = this.actor(c.follow);
        cam.pan(a.x, a.y - a.height / 2, 400, 'Sine.easeInOut');
        await this.camEvent(Phaser.Cameras.Scene2D.Events.PAN_COMPLETE);
        cam.startFollow(a, true, 1, 1);
      } else if ('shake' in c) {
        cam.shake(c.ms ?? 300, c.shake);
        await this.camEvent(Phaser.Cameras.Scene2D.Events.SHAKE_COMPLETE);
      }
      return;
    }

    if ('spawn' in cmd) {
      this.ctx.spawnActor(cmd.spawn.id, cmd.spawn.sprite, cmd.spawn.at[0], cmd.spawn.at[1], cmd.spawn.dir);
      return;
    }
    if ('remove' in cmd) return void this.ctx.removeActor(cmd.remove);
    if ('setFlag' in cmd) return void gameState.set(cmd.setFlag, cmd.value ?? true);
    if ('give' in cmd) return void gameState.give(cmd.give);
    if ('warp' in cmd) {
      await this.ctx.warp(cmd.warp.map, cmd.warp.spawn);
      return 'warp';
    }

    // --- команды актёра ---
    if ('actor' in cmd) {
      const a = this.actor(cmd.actor);
      if ('move' in cmd) {
        this.turnedActors.add(cmd.actor);
        const [dx, dy] = cmd.move;
        if (dx) await a.walkToTile(a.tileX + dx, a.tileY, cmd.speed);
        if (dy) await a.walkToTile(a.tileX, a.tileY + dy, cmd.speed);
        return;
      }
      if ('moveTo' in cmd) {
        this.turnedActors.add(cmd.actor);
        return a.walkToTile(cmd.moveTo[0], cmd.moveTo[1], cmd.speed);
      }
      if ('path' in cmd) {
        this.turnedActors.add(cmd.actor);
        for (const [tx, ty] of cmd.path) await a.walkToTile(tx, ty, cmd.speed);
        return;
      }
      if ('face' in cmd) {
        this.turnedActors.add(cmd.actor);
        return void a.face(cmd.face);
      }
      if ('anim' in cmd) {
        if (cmd.stop) a.playIdle();
        else if (a.hasAnim(cmd.anim)) a.play(cmd.anim, true);
        else console.warn(`[cutscene] анимации "${cmd.anim}" нет`);
        return;
      }
      if ('emote' in cmd) return a.emote(cmd.emote, cmd.ms);
      if ('teleport' in cmd) return void a.teleportTile(cmd.teleport[0], cmd.teleport[1]);
    }
    console.warn('[cutscene] неизвестная команда', cmd);
  }
}

export { dialogue };
