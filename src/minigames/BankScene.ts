import { MinigameScene, type MinigameData } from './MinigameScene';
import { BankOverlay } from './BankOverlay';
import { audio } from '../core/Audio';

/**
 * Пасхалка «компьютер зайчонка»: DOM-оверлей с банковским приложением (BankOverlay). Сцена только держит
 * мир на паузе. won — если дошли до «недостаточно средств»; закрыли раньше — lost.
 */
export class BankScene extends MinigameScene {
  private overlay?: BankOverlay;

  constructor() {
    super('MG_Bank');
  }

  override init(data: MinigameData): void {
    super.init(data);
  }

  create(): void {
    this.setup(0x0b0a10);
    audio.sfx('select', { volume: 0.6 });
    this.overlay = new BankOverlay(this.game.canvas, {
      onDone: () => this.finish({ won: true }),
      onCancel: () => this.finish({ won: false }),
    });
    this.events.once('shutdown', () => {
      this.overlay?.destroy();
      this.overlay = undefined;
    });
  }
}
