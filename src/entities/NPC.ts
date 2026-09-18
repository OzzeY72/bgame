import Phaser from 'phaser';
import { Actor } from './Actor';
import type { Dir, MapNpc } from '../types';

/** NPC: стоит на месте, при взаимодействии — диалог или катсцена. */
export class NPC extends Actor {
  readonly def: MapNpc;

  constructor(scene: Phaser.Scene, def: MapNpc) {
    super(scene, def.id, def.sprite, def.x, def.y, (def.dir ?? 'down') as Dir);
    this.def = def;
    this.staticWhenIdle = true;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setImmovable(true);
    body.moves = false;
  }
}
