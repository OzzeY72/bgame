import Phaser from 'phaser';
import type { Dir, MapDef, MapItem, MapTrigger, MinigameResult } from '../types';
import { TILE } from '../config';
import { bus } from '../core/EventBus';
import { setupCamera } from '../core/Render';
import { gameState, type PackedGift } from '../core/GameState';
import { GameInput } from '../core/Input';
import { resetInputLock, lockInput, unlockInput } from '../core/InputLock';
import { DIR_VEC, opposite } from '../core/Directions';
import { audio } from '../core/Audio';
import { Actor } from '../entities/Actor';
import { Player } from '../entities/Player';
import { NPC } from '../entities/NPC';
import { buildMap, type BuiltMap } from '../systems/MapLoader';
import { addWater } from '../systems/Water';
import { dialogue } from '../systems/DialogueManager';
import { CutsceneRunner, type CutsceneContext } from '../systems/CutsceneRunner';
import { getMap } from '../data/maps';
import { getCutscene, CUTSCENES } from '../data/cutscenes';
import { CHARACTERS, PLAYER_ID } from '../data/characters';
import { defaultGiftLines, itemName, itemTexture, LOCKED_GIFT_LINES, totalGifts } from '../data/gifts';
import { runMinigame, MINIGAMES } from '../minigames';

interface WorldData {
  map: string;
  spawn: string;
}

/** Предмет на карте (спрайт + описание). */
interface WorldItem {
  def: MapItem;
  obj: Phaser.Physics.Arcade.Image;
}

type Focus = { kind: 'npc'; npc: NPC } | { kind: 'item'; item: WorldItem };

/** Текущая непрозрачность затемнения камеры (0 — экран виден, 1 — чёрный). */
function fadeAlpha(cam: Phaser.Cameras.Scene2D.Camera): number {
  return (cam.fadeEffect as unknown as { alpha: number }).alpha;
}

/** Отладочные параметры адреса: ?cutscene=<id> — сыграть при входе, ?mg=<id> — сразу запустить мини-игру. Срабатывают один раз. */
const debugParams = new URLSearchParams(location.search);
let debugUsed = false;

/**
 * Универсальная сцена локации. Получает ключ карты и точку появления, строит tilemap,
 * расставляет игрока/NPC/предметы, обрабатывает взаимодействие, выходы, триггеры и катсцены.
 * Переход между локациями = fade + restart этой же сцены с другими данными.
 */
export class WorldScene extends Phaser.Scene implements CutsceneContext {
  readonly state = gameState;
  readonly dialogue = dialogue;

  private mapKey = '';
  private spawnKey = '';
  def!: MapDef;
  private built!: BuiltMap;
  private keys!: GameInput;
  private actors = new Map<string, Actor>();
  private items: WorldItem[] = [];
  private focus: Focus | null = null;
  private transitioning = false;
  /** триггеры, внутри которых игрок стоит сейчас (повторный запуск — только после выхода) */
  private insideTriggers = new Set<string>();
  private ambientTimer?: Phaser.Time.TimerEvent;
  /** растёт при каждом init(): проверка "сцена ещё та же" после await (см. CutsceneContext.epoch) */
  epoch = 0;
  player!: Player;
  runner!: CutsceneRunner;

  constructor() {
    super('World');
  }

  /** CutsceneContext: сцена мира. */
  get world(): Phaser.Scene {
    return this;
  }

  init(data: WorldData): void {
    this.mapKey = data.map;
    this.spawnKey = data.spawn;
    this.actors.clear();
    this.items = [];
    this.focus = null;
    this.transitioning = false;
    this.insideTriggers.clear();
    this.epoch++;
    resetInputLock();
    dialogue.abort();
  }

  create(): void {
    this.def = getMap(this.mapKey);
    const cam = setupCamera(this);
    cam.setBackgroundColor(this.def.bg ?? 0x000000);
    cam.fadeOut(1, 0, 0, 0); // держим чёрный экран, пока не войдём

    this.built = buildMap(this, this.def);
    addWater(this, this.built);
    this.physics.world.setBounds(0, 0, this.built.widthPx, this.built.heightPx);

    // --- игрок ---
    const spawn = this.def.spawns[this.spawnKey] ?? Object.values(this.def.spawns)[0];
    if (!spawn) throw new Error(`У карты "${this.mapKey}" нет точек появления`);
    this.player = new Player(this, CHARACTERS[PLAYER_ID].sprite, spawn.x, spawn.y, spawn.dir);
    this.actors.set('player', this.player);

    // --- NPC и предметы (по условиям if) ---
    this.syncConditionals();

    // --- коллизии с картой ---
    this.physics.add.collider(this.player, this.built.ground);
    this.physics.add.collider(this.player, this.built.objects);

    // --- камера ---
    cam.setBounds(0, 0, this.built.widthPx, this.built.heightPx);
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, 1, 1);
    cam.centerOn(this.player.x, this.player.y);

    // --- ввод и блокировки ---
    this.keys = new GameInput(this);
    const onLock = () => {
      this.keys.locked = true;
      this.player.stopMoving();
      this.setFocus(null);
    };
    const onUnlock = () => {
      this.keys.locked = false;
      this.syncConditionals();
    };
    bus.on('input:lock', onLock);
    bus.on('input:unlock', onUnlock);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('input:lock', onLock);
      bus.off('input:unlock', onUnlock);
      this.setFocus(null);
      this.ambientTimer?.remove();
    });

    this.runner = new CutsceneRunner(this);
    this.state.map = this.mapKey;
    this.state.spawn = this.spawnKey;
    this.state.save();
    this.restoreMusic();
    this.startAmbient();

    void this.enterMap();
  }

  /** Фоновый эффект локации (`def.ambientSfx`): играет со случайными паузами, пока сцена жива. */
  private startAmbient(): void {
    const name = this.def.ambientSfx;
    if (!name) return;
    const tick = () => {
      audio.sfx(name, { volume: 0.5 + Math.random() * 0.3, rate: 0.85 + Math.random() * 0.3 });
      this.ambientTimer = this.time.delayedCall(1800 + Math.random() * 3000, tick);
    };
    this.ambientTimer = this.time.delayedCall(500 + Math.random() * 1500, tick);
  }

  /** Музыка локации (после мини-игры — вернуть). */
  restoreMusic(): void {
    audio.playMusic(this.def.music ?? null);
  }

  /**
   * Синхронизирует NPC и предметы с флагами: появляются, когда условие `if` стало верным, исчезают,
   * когда перестало. Вызывается при создании и после каждого диалога/катсцены.
   */
  private syncConditionals(): void {
    for (const n of this.def.npcs ?? []) {
      const want = this.state.check(n.if);
      const have = this.actors.get(n.id);
      if (want && !have) {
        const npc = new NPC(this, n);
        this.actors.set(n.id, npc);
        this.physics.add.collider(this.player, npc);
      } else if (!want && have && have !== this.player) {
        have.destroy();
        this.actors.delete(n.id);
      }
    }
    for (const it of this.def.items ?? []) {
      // забранные предметы и посылки (pickup / gift) исчезают с карты
      const taken = (it.pickup && this.state.has(it.id)) || (it.gift && this.state.flag(`packed:${it.id}`));
      const want = this.state.check(it.if) && !taken;
      const have = this.items.find((w) => w.def === it);
      if (want && !have) this.addItem(it);
      else if (!want && have) this.removeItem(have);
    }
  }

  private addItem(it: MapItem): void {
    const obj = this.physics.add.staticImage((it.x + 0.5) * TILE, (it.y + 1) * TILE, it.sprite, it.frame);
    obj.setOrigin(0.5, 1).setDepth((it.y + 1) * TILE);
    obj.body.setSize(TILE - 8, 12).setOffset((obj.width - (TILE - 8)) / 2, obj.height - 12);
    obj.refreshBody();
    this.items.push({ def: it, obj });
    if (!it.passable) this.physics.add.collider(this.player, obj);
  }

  private removeItem(w: WorldItem): void {
    w.obj.destroy();
    this.items = this.items.filter((x) => x !== w);
    if (this.focus?.kind === 'item' && this.focus.item === w) this.setFocus(null);
  }

  /** Вход на карту: катсцены onEnter, затем проявление, если катсцена сама не сделала fade in. */
  private async enterMap(): Promise<void> {
    const epoch = this.epoch;
    // ждём кадр: UI-сцена создаётся после World, а катсцена может сразу начать диалог
    await new Promise<void>((res) => this.events.once(Phaser.Scenes.Events.UPDATE, () => res()));
    if (this.epoch !== epoch) return;
    const cam = this.cameras.main;
    let ran = false;
    const list = [...(this.def.onEnter ?? [])];
    if (!debugUsed) {
      const cs = debugParams.get('cutscene');
      if (cs && CUTSCENES[cs]) list.push(cs);
    }
    for (const id of list) {
      const cs = getCutscene(id);
      const first = cs.script[0];
      const startsWithFadeIn = first && 'fade' in first && first.fade === 'in';
      if (!startsWithFadeIn && fadeAlpha(cam) > 0) cam.fadeIn(300, 0, 0, 0);
      const did = await this.runner.run(cs);
      ran = ran || did;
      if (this.epoch !== epoch) return;
    }
    if (fadeAlpha(cam) > 0 && !cam.fadeEffect.isRunning) cam.fadeIn(300, 0, 0, 0);
    if (!ran) bus.emit('map:enter', this.def.title);
    const mg = debugParams.get('mg');
    if (!debugUsed && mg && MINIGAMES[mg]) {
      debugUsed = true;
      lockInput();
      await this.runMinigame(mg);
      unlockInput();
    }
    debugUsed = true;
  }

  override update(): void {
    if (this.transitioning) return;
    // JustDown читаем каждый кадр, иначе нажатие, сделанное во время диалога,
    // "дождётся" разблокировки и тут же откроет диалог заново.
    const action = this.keys.anyActionJustPressed();
    this.player.control(this.keys);
    for (const a of this.actors.values()) a.tick();

    if (!this.keys.locked) {
      this.updateFocus();
      if (this.focus && action) void this.interact(this.focus);
      this.checkExits();
      this.checkTriggers();
    }
  }

  // ---------------------------------------------------------------- взаимодействие

  private updateFocus(): void {
    const p = this.player;
    const v = DIR_VEC[p.dir];
    const px = p.x + v.x * TILE * 0.8;
    const py = p.y - 6 + v.y * TILE * 0.8;
    let best: Focus | null = null;
    let bestD = TILE * 0.95;
    for (const a of this.actors.values()) {
      if (!(a instanceof NPC)) continue;
      const d = Math.hypot(a.x - px, a.y - 6 - py);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'npc', npc: a };
      }
    }
    for (const it of this.items) {
      const d = Math.hypot(it.obj.x - px, it.obj.y - 6 - py);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'item', item: it };
      }
    }
    this.setFocus(best);
  }

  private setFocus(f: Focus | null): void {
    const same =
      (f === null && this.focus === null) ||
      (f?.kind === 'npc' && this.focus?.kind === 'npc' && f.npc === this.focus.npc) ||
      (f?.kind === 'item' && this.focus?.kind === 'item' && f.item === this.focus.item);
    if (same) return;
    this.focus = f;
    if (!f) bus.emit('prompt:hide');
    else bus.emit('prompt:show', f.kind === 'npc' ? 'Поговорить' : f.item.def.gift ? 'Забрать' : 'Посмотреть');
  }

  private async interact(f: Focus): Promise<void> {
    const epoch = this.epoch;
    if (f.kind === 'npc') {
      const npc = f.npc;
      const d = npc.def;
      npc.face(opposite(this.player.dir));
      if (d.cutscene) {
        await this.runner.runById(d.cutscene);
      } else if (d.dialogue) {
        await this.dialogue.run(d.dialogue);
      }
      this.state.set(`talked:${d.id}`);
      if (this.epoch === epoch && npc.active) npc.face((d.dir ?? 'down') as Dir);
      this.syncConditionals();
      return;
    }
    const it = f.item;
    const d = it.def;
    if (d.gift) {
      await this.takeGift(it);
      return;
    }
    if (d.cutscene) await this.runner.runById(d.cutscene);
    else if (d.dialogue) await this.dialogue.run(d.dialogue);
    if (this.epoch !== epoch) return;
    if (d.pickup) {
      audio.sfx('pickup');
      this.state.give(d.id);
      this.removeItem(it);
    }
    this.state.set(`seen:${d.id}`);
    this.syncConditionals();
  }

  /**
   * Коробка-посылка: заперта, пока нет флага unlock; иначе забирается в инвентарь запакованной
   * (GameState.gifts, флаг packed:<id>) — коробка прыгает к игроку и исчезает с карты. Когда забраны
   * все посылки игры (totalGifts) — флаг gifts_all: зайчонок на почте откроет их по очереди.
   */
  private async takeGift(it: WorldItem): Promise<void> {
    const epoch = this.epoch;
    const d = it.def;
    const g = d.gift!;
    if (g.unlock && !this.state.flag(g.unlock)) {
      audio.sfx('locked');
      if (g.lockedDialogue) await this.dialogue.run(g.lockedDialogue);
      else await this.dialogue.lines(LOCKED_GIFT_LINES);
      return;
    }
    lockInput();
    try {
      audio.sfx('whoosh', { volume: 0.5 });
      const obj = it.obj;
      obj.disableBody(false, false);
      await new Promise<void>((res) =>
        this.tweens.add({ targets: obj, y: obj.y - 18, duration: 180, ease: 'Quad.easeOut', yoyo: false, onComplete: () => res() }),
      );
      if (this.epoch !== epoch) return;
      await new Promise<void>((res) =>
        this.tweens.add({ targets: obj, x: this.player.x, y: this.player.y - 40, scale: 0.3, alpha: 0, duration: 320, ease: 'Quad.easeIn', onComplete: () => res() }),
      );
      if (this.epoch !== epoch) return;
      audio.sfx('pickup');
      this.state.packGift({ id: d.id, item: g.item, dialogue: d.dialogue });
      this.state.set(`seen:${d.id}`);
      this.removeItem(it);
      const total = totalGifts();
      const n = this.state.gifts.length;
      bus.emit('toast', `Посылка забрана (${n}/${total})`);
      if (n >= total && !this.state.flag('gifts_all')) {
        this.state.set('gifts_all');
        await this.dialogue.lines([{ think: true, text: 'Кажется, это была последняя. Все посылки на месте — можно нести на почту.' }]);
      } else if (n === 1) {
        await this.dialogue.lines([{ think: true, text: 'Запакована. Открывать одну не хочется — соберу все и открою вместе.' }]);
      }
    } finally {
      unlockInput();
    }
    this.syncConditionals();
  }

  /**
   * CutsceneContext: открыть посылку из инвентаря на тайле (прилавок почты): коробка опускается на
   * прилавок, крышка, предмет выпрыгивает, реплики (dialogue предмета или общие), предмет летит к игроку.
   */
  async openGift(g: PackedGift, at: [tx: number, ty: number]): Promise<void> {
    const epoch = this.epoch;
    const x = (at[0] + 0.5) * TILE;
    const y = (at[1] + 1) * TILE;
    const tween = (targets: object, cfg: Record<string, unknown>) =>
      new Promise<void>((res) => this.tweens.add({ targets, ...cfg, onComplete: () => res() }));
    const box = this.add.image(x, y - 24, 'prop_gift').setOrigin(0.5, 1).setDepth(y + 1).setAlpha(0);
    await tween(box, { y, alpha: 1, duration: 320, ease: 'Bounce.easeOut' });
    if (this.epoch !== epoch) return;
    audio.sfx('open');
    box.setTexture('prop_gift_open');
    const tex = itemTexture(g.item);
    const spr = this.add.image(x, y - 10, this.textures.exists(tex) ? tex : 'prop_gift').setOrigin(0.5, 1).setDepth(y + 2).setScale(0.2);
    await tween(spr, { y: y - 34, scale: 1, duration: 500, ease: 'Back.easeOut' });
    if (this.epoch !== epoch) return;
    audio.sfx('gift');
    this.tweens.add({ targets: spr, y: spr.y - 3, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.state.set(`opened:${g.id}`);
    if (g.dialogue) await this.dialogue.run(g.dialogue);
    else await this.dialogue.lines(defaultGiftLines(this.state, g.item));
    if (this.epoch !== epoch) return;
    this.tweens.killTweensOf(spr);
    await Promise.all([
      tween(spr, { x: this.player.x, y: this.player.y - 40, scale: 0.3, alpha: 0, duration: 350, ease: 'Quad.easeIn' }),
      tween(box, { alpha: 0, duration: 350, delay: 150 }),
    ]);
    spr.destroy();
    box.destroy();
    audio.sfx('pickup');
    this.state.give(g.item);
    bus.emit('toast', `Получено: ${itemName(this.state, g.item)}`);
  }

  private checkExits(): void {
    const tx = this.player.tileX;
    const ty = this.player.tileY;
    for (const e of this.def.exits ?? []) {
      const w = e.w ?? 1;
      const h = e.h ?? 1;
      if (tx >= e.x && tx < e.x + w && ty >= e.y && ty < e.y + h) {
        void this.warp(e.to, e.spawn);
        return;
      }
    }
  }

  /** Триггеры: вошёл в зону — катсцена (сама решает по once/if); заново — только после выхода из зоны. */
  private checkTriggers(): void {
    const tx = this.player.tileX;
    const ty = this.player.tileY;
    for (const t of this.def.triggers ?? []) {
      const inside = tx >= t.x && tx < t.x + (t.w ?? 1) && ty >= t.y && ty < t.y + (t.h ?? 1);
      if (!inside) {
        this.insideTriggers.delete(t.id);
        continue;
      }
      if (this.insideTriggers.has(t.id)) continue;
      this.insideTriggers.add(t.id);
      if (!this.state.check(t.if)) continue;
      void this.fireTrigger(t);
      return;
    }
  }

  private async fireTrigger(t: MapTrigger): Promise<void> {
    await this.runner.runById(t.cutscene);
    this.syncConditionals();
  }

  // ---------------------------------------------------------------- CutsceneContext

  getActor(id: string): Actor | undefined {
    return this.actors.get(id);
  }

  spawnActor(id: string, sprite: string, tx: number, ty: number, dir: Dir = 'down'): Actor {
    this.removeActor(id);
    const a = new NPC(this, { id, sprite, x: tx, y: ty, dir });
    this.actors.set(id, a);
    this.physics.add.collider(this.player, a);
    return a;
  }

  removeActor(id: string): void {
    const a = this.actors.get(id);
    if (!a || a === this.player) return;
    a.destroy();
    this.actors.delete(id);
  }

  /** Мини-игра поверх мира; после неё возвращаем музыку локации и синхронизируем NPC/предметы. */
  async runMinigame(id: string): Promise<MinigameResult> {
    this.player.stopMoving();
    this.setFocus(null);
    const r = await runMinigame(this, id);
    this.restoreMusic();
    this.syncConditionals();
    return r;
  }

  /** Переход на другую карту. */
  async warp(map: string, spawn: string): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.keys.locked = true;
    this.player.stopMoving();
    this.setFocus(null);
    getMap(map); // бросит понятную ошибку, если карты нет
    const cam = this.cameras.main;
    await new Promise<void>((res) => {
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => res());
      cam.fadeOut(250, 0, 0, 0);
    });
    this.scene.restart({ map, spawn } satisfies WorldData);
  }
}
