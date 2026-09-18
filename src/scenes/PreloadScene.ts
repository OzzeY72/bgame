import Phaser from 'phaser';
import { ASSETS } from '../data/assets';
import { makePlaceholder, patchTileset } from '../core/Placeholders';
import { registerActorAnims } from '../entities/Actor';
import { CHARACTERS } from '../data/characters';
import { DIR_ROWS, WALK_FRAMES, GAME_WIDTH, GAME_HEIGHT, START_MAP, START_SPAWN } from '../config';
import { setupCamera } from '../core/Render';
import { gameState } from '../core/GameState';
import { audio } from '../core/Audio';
import { loadImageTexture } from '../core/Textures';
import { DRAWN_TEXTURE } from '../data/gifts';
import { MAPS } from '../data/maps';

/**
 * Загрузка ассетов. Отсутствующие файлы заменяются заглушками (см. core/Placeholders.ts),
 * так что игра запускается на любом этапе готовности арта. Звук без файла синтезируется (core/Audio.ts).
 * Параметры адреса для отладки: ?new — заново, ?map=<key>&spawn=<name> — начать с локации.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  init(): void {
    gameState.load();
    if (new URLSearchParams(location.search).has('new')) gameState.reset();
  }

  preload(): void {
    setupCamera(this);
    const bar = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 200, 8, 0x333333).setOrigin(0.5);
    const fill = this.add.rectangle(GAME_WIDTH / 2 - 100, GAME_HEIGHT / 2, 0, 8, 0xffffff).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => fill.setSize(200 * p, 8));
    this.load.on('complete', () => {
      bar.destroy();
      fill.destroy();
    });

    const available = (this.registry.get('assets:available') as Set<string> | undefined) ?? new Set<string>();
    const missing: string[] = [];
    for (const a of ASSETS) {
      if (!available.has(a.key)) {
        if (a.type !== 'audio') missing.push(`${a.key} (${a.url})`);
        continue;
      }
      if (a.type === 'spritesheet') {
        this.load.spritesheet(a.key, a.url, { frameWidth: a.frame!.w, frameHeight: a.frame!.h });
      } else if (a.type === 'audio') {
        this.load.audio(a.key, a.url);
      } else {
        this.load.image(a.key, a.url);
      }
    }
    if (missing.length) console.info(`[assets] заглушки для: ${missing.join(', ')}`);
  }

  create(): void {
    // заглушки для того, что не загрузилось; в настоящем тайлсете — для ещё не нарисованных клеток
    for (const a of ASSETS) {
      if (a.type === 'audio') continue;
      if (!this.textures.exists(a.key)) makePlaceholder(this, a);
      else if (a.placeholder?.kind === 'tileset') patchTileset(this, a.key);
    }
    // анимации персонажей
    for (const c of Object.values(CHARACTERS)) {
      registerActorAnims(this, c.sprite, WALK_FRAMES, DIR_ROWS);
    }
    audio.attach(this);
    void this.finish();
  }

  private async finish(): Promise<void> {
    // спрайт нарисованного подарка живёт в сохранении (data: или URL бэкенда)
    if (gameState.drawn && !this.textures.exists(DRAWN_TEXTURE)) {
      const ok = await loadImageTexture(this, DRAWN_TEXTURE, gameState.drawn.url);
      if (!ok) console.warn('[assets] спрайт нарисованного подарка не загрузился:', gameState.drawn.url);
    }
    const params = new URLSearchParams(location.search);
    let map = gameState.map || START_MAP;
    let spawn = gameState.spawn || START_SPAWN;
    const pm = params.get('map');
    if (pm && MAPS[pm]) {
      map = pm;
      spawn = params.get('spawn') ?? Object.keys(MAPS[pm].spawns)[0];
    }
    this.scene.start('World', { map, spawn });
    this.scene.launch('UI');
  }
}
