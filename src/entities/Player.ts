import Phaser from 'phaser';
import { Actor } from './Actor';
import type { Dir } from '../types';
import { WALK_SPEED } from '../config';
import type { GameInput } from '../core/Input';

/** Игрок: Actor + управление с клавиатуры. В катсценах управление отключено (input.locked). */
export class Player extends Actor {
  constructor(scene: Phaser.Scene, spriteKey: string, tx: number, ty: number, dir: Dir = 'down') {
    super(scene, 'player', spriteKey, tx, ty, dir);
    this.setCollideWorldBounds(true);
  }

  control(input: GameInput): void {
    if (input.locked) return;
    const { x, y } = input.axis();
    this.moveVector(x, y, WALK_SPEED);
  }
}
