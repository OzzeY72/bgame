import Phaser from 'phaser';

/**
 * Обёртка над клавиатурой: WASD/стрелки — движение, E/Space/Enter/Z — действие, Esc — меню.
 * Одна на сцену World. Блокируется на время катсцен/диалогов через `locked`.
 */
export class GameInput {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private actionKeys: Phaser.Input.Keyboard.Key[];
  locked = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as GameInput['wasd'];
    this.actionKeys = [
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
    ];
  }

  /** Вектор движения (-1..1 по осям), нормализованный по диагонали. */
  axis(): { x: number; y: number } {
    if (this.locked) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  /** true один раз на нажатие клавиши действия; в залоченном состоянии всегда false. */
  actionJustPressed(): boolean {
    return this.anyActionJustPressed() && !this.locked;
  }

  /** Читает JustDown у всех клавиш действия (сбрасывает флаг), независимо от блокировки. */
  anyActionJustPressed(): boolean {
    let pressed = false;
    for (const k of this.actionKeys) if (Phaser.Input.Keyboard.JustDown(k)) pressed = true;
    return pressed;
  }
}
