import Phaser from 'phaser';
import type { DialogueLine } from '../types';
import { DIALOGUE, DIALOGUE_PANEL, GAME_WIDTH, GAME_HEIGHT, PORTRAIT_SIZE } from '../config';
import { setupCamera, TEXT_RESOLUTION, isMobileDevice } from '../core/Render';
import { bus } from '../core/EventBus';
import { CHARACTERS, PLAYER_ID } from '../data/characters';
import { audio } from '../core/Audio';
import { gameState } from '../core/GameState';
import { isInputLocked, lockInput, unlockInput } from '../core/InputLock';
import { AUDIO } from '../config';
import { itemName, itemTexture, totalGifts } from '../data/gifts';
import { GameInput } from '../core/Input';

/**
 * Оверлей поверх мира: панель диалога (текст с "печатью", справа портрет и плашка имени), варианты
 * ответа, подсказка взаимодействия, название локации, инвентарь (иконки посылок в углу, панель по I),
 * настройки звука (панель по Esc: громкость музыки и эффектов, mute).
 * Общается с миром только через шину событий.
 * Геометрия панели — DIALOGUE_PANEL в config.ts (картинка цельная, области заданы прямоугольниками).
 */
export class UIScene extends Phaser.Scene {
  private box!: Phaser.GameObjects.Image;
  private portrait!: Phaser.GameObjects.Image;
  private nameText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private arrow!: Phaser.GameObjects.Text;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private group!: Phaser.GameObjects.Container;
  /** инвентарь: строка иконок в углу и раскрытая панель */
  private invHud!: Phaser.GameObjects.Container;
  private invPanel!: Phaser.GameObjects.Container;
  private invKeys: Phaser.Input.Keyboard.Key[] = [];
  /** настройки (Esc): панель, выбранная строка, клавиши ←/→/↑/↓ */
  private setPanel!: Phaser.GameObjects.Container;
  private setRow = 0;
  private setKeys: Record<'left' | 'right' | 'up' | 'down', Phaser.Input.Keyboard.Key[]> = { left: [], right: [], up: [], down: [] };
  private setRefresh: (() => void) | null = null;

  /** Сенсорное управление для мобильных устройств */
  private touchGroup!: Phaser.GameObjects.Container;

  private line: DialogueLine | null = null;
  private fullText = '';
  private shown = 0;
  private typing = false;
  private typeTimer?: Phaser.Time.TimerEvent;
  private choiceIndex = 0;
  /** не реагировать на действие сразу после показа реплики (то же нажатие открыло диалог) */
  private ignoreUntil = 0;
  private actionKeys: Phaser.Input.Keyboard.Key[] = [];
  private upKeys: Phaser.Input.Keyboard.Key[] = [];
  private downKeys: Phaser.Input.Keyboard.Key[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    const { padding, fontFamily, fontSize, nameFontSize } = DIALOGUE;
    const P = DIALOGUE_PANEL;
    const T = this.textRect();
    const resolution = TEXT_RESOLUTION;
    setupCamera(this);

    this.box = this.add.image(P.x, P.y, 'ui_box').setOrigin(0, 0);
    this.portrait = this.add
      .image(P.x + P.portrait.x + Math.floor((P.portrait.w - PORTRAIT_SIZE) / 2), P.y + P.portrait.y + Math.floor((P.portrait.h - PORTRAIT_SIZE) / 2), 'anastasiia_portrait')
      .setOrigin(0, 0);
    this.nameText = this.add
      .text(P.x + P.name.x + Math.floor(P.name.w / 2), P.y + P.name.y + Math.floor(P.name.h / 2), '', {
        fontFamily,
        fontSize: `${nameFontSize}px`,
        color: P.ink,
        resolution,
      })
      .setOrigin(0.5, 0.5);
    this.bodyText = this.add.text(T.x, T.y, '', {
      fontFamily,
      fontSize: `${fontSize}px`,
      color: P.ink,
      resolution,
      lineSpacing: 2,
      wordWrap: { width: T.w, useAdvancedWrap: true },
    });
    this.arrow = this.add.text(T.x + T.w - 2, T.y + T.h + padding - 2, '▼', { fontFamily, fontSize: '8px', color: P.ink, resolution }).setOrigin(1, 1);
    this.tweens.add({ targets: this.arrow, y: this.arrow.y + 2, duration: 400, yoyo: true, repeat: -1 });

    this.group = this.add.container(0, 0, [this.box, this.portrait, this.nameText, this.bodyText, this.arrow]);
    this.group.setVisible(false);

    this.prompt = this.add
      .text(GAME_WIDTH - 8, GAME_HEIGHT - 8, '', { fontFamily, fontSize: '10px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 4, y: 2 }, resolution })
      .setOrigin(1, 1)
      .setVisible(false);

    if (isMobileDevice()) {
      this.prompt.setInteractive({ useHandCursor: true });
      this.prompt.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        GameInput.triggerTouchAction();
      });
    }

    this.toast = this.add
      .text(8, 8, '', { fontFamily, fontSize: '12px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 6, y: 3 }, resolution })
      .setAlpha(0);

    this.invHud = this.add.container(GAME_WIDTH - 8, 8).setDepth(50);
    this.invPanel = this.add.container(0, 0).setDepth(60).setVisible(false);
    this.setPanel = this.add.container(0, 0).setDepth(65).setVisible(false);
    this.refreshInventory();

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.invKeys = [K.I, K.ESC].map((k) => kb.addKey(k));
    this.actionKeys = [K.E, K.SPACE, K.ENTER, K.Z].map((k) => kb.addKey(k));
    this.upKeys = [K.UP, K.W].map((k) => kb.addKey(k));
    this.downKeys = [K.DOWN, K.S].map((k) => kb.addKey(k));
    this.setKeys = {
      left: [K.LEFT, K.A].map((k) => kb.addKey(k)),
      right: [K.RIGHT, K.D].map((k) => kb.addKey(k)),
      up: this.upKeys,
      down: this.downKeys,
    };
    // клик/тап тоже листает
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (isMobileDevice()) {
        // На мобильных игнорируем нажатия на элементы управления
        if (pointer.x < 110 && pointer.y > GAME_HEIGHT - 110) return;
        if (pointer.x > GAME_WIDTH - 80 && pointer.y > GAME_HEIGHT - 80) return;
        if (pointer.y < 30) return;
      }

      if (this.time.now > this.ignoreUntil) this.onAction();
    });

    bus.on('dialogue:show', this.showLine, this);
    bus.on('dialogue:hide', this.hide, this);
    bus.on('prompt:show', (t: string) => this.prompt.setText(`[E] ${t}`).setVisible(true));
    bus.on('prompt:hide', () => this.prompt.setVisible(false));
    bus.on('map:enter', this.showToast, this);
    bus.on('toast', this.showToast, this);
    bus.on('inventory:change', this.refreshInventory, this);
    bus.on('banner', this.showBanner, this);
    bus.on('reveal', this.showReveal, this);
    bus.on('input:lock', () => this.invPanel.setVisible(false));
    // M — выключить/включить звук
    kb.on('keydown-M', () => {
      this.showToast(audio.toggleMute() ? 'Звук выключен' : 'Звук включён');
      this.setRefresh?.();
    });

    if (isMobileDevice()) {
      this.setupTouchControls();
    }
  }

  override update(): void {
    const J = Phaser.Input.Keyboard.JustDown;
    const esc = !!this.invKeys[1] && J(this.invKeys[1]);

    // скрывать вирт. контроллеры во время открытия панелей инвентаря/настроек (только мобильные)
    if (isMobileDevice() && this.touchGroup) {
      const modalOpen = this.setPanel.visible || this.invPanel.visible;
      this.touchGroup.setVisible(!modalOpen);
    }
    // настройки открыты — только они и реагируют (ввод мира заблокирован)
    if (this.setPanel.visible) {
      if (esc) this.toggleSettings();
      else this.updateSettings();
      return;
    }
    // I — инвентарь, Esc — настройки (только когда ничего не происходит: нет диалога/катсцены/мини-игры)
    if (this.invKeys[0] && J(this.invKeys[0]) && !this.line && !isInputLocked()) this.toggleInventory();
    else if (esc && this.invPanel.visible) this.toggleInventory();
    else if (esc && !this.line && !isInputLocked()) this.toggleSettings();
    if (!this.line) return;
    const pressed = this.actionKeys.some((k) => Phaser.Input.Keyboard.JustDown(k));
    if (pressed && this.time.now > this.ignoreUntil) this.onAction();
    if (this.line.choices && !this.typing) {
      if (this.upKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.moveChoice(-1);
      if (this.downKeys.some((k) => Phaser.Input.Keyboard.JustDown(k))) this.moveChoice(1);
    }
  }

  // ---------------------------------------------------------------- диалог

  private showLine(line: DialogueLine): void {
    this.line = line;
    this.ignoreUntil = this.time.now + 120;
    this.group.setVisible(true);
    this.prompt.setVisible(false);
    this.clearChoices();

    const think = !!line.think || !line.who;
    const ch = line.who ? CHARACTERS[line.who] : (think ? CHARACTERS[PLAYER_ID] : undefined);
    const P = DIALOGUE_PANEL;

    if (think) {
      this.portrait.setVisible(false);
      this.nameText.setText('');
      this.bodyText.setColor(P.inkDim).setStyle({ fontStyle: 'italic' });
    } else {
      const portraitKey = line.portrait ?? ch?.portrait ?? line.who!;
      const key = this.textures.exists(portraitKey) ? portraitKey : (ch?.portrait ?? 'anastasiia_portrait');
      this.portrait.setTexture(key).setVisible(true);
      this.nameText.setText(ch?.name ?? line.who ?? '');
      this.bodyText.setColor(P.ink).setStyle({ fontStyle: 'normal' });
    }

    if (line.sfx) audio.sfx(line.sfx);
    this.fullText = line.text;
    this.shown = 0;
    this.bodyText.setText('');
    this.arrow.setVisible(false);
    this.typing = true;
    this.typeTimer?.remove();
    this.typeTimer = this.time.addEvent({
      delay: 1000 / DIALOGUE.charsPerSec,
      loop: true,
      callback: () => {
        this.shown++;
        this.bodyText.setText(this.fullText.slice(0, this.shown));
        // «печать» — голос персонажа (клипы из assets/voice или блип) на каждой третьей букве (кроме пробелов), у мыслей тише
        if (this.shown % 3 === 1 && this.fullText[this.shown - 1] !== ' ') {
          audio.voice(ch?.voice?.clips, { volume: think ? 0.4 : 0.8, rate: (ch?.voice?.rate ?? 1) * (think ? 0.8 : 1) });
        }
        if (this.shown >= this.fullText.length) this.finishTyping();
      },
    });
  }

  private finishTyping(): void {
    this.typeTimer?.remove();
    this.typeTimer = undefined;
    this.typing = false;
    this.bodyText.setText(this.fullText);
    if (this.line?.choices) this.renderChoices();
    else this.arrow.setVisible(true);
  }

  private onAction(): void {
    if (!this.line) return;
    if (this.typing) {
      this.finishTyping();
      return;
    }
    if (this.line.choices) {
      bus.emit('dialogue:choice', this.choiceIndex);
    } else {
      bus.emit('dialogue:advance');
    }
  }

  private renderChoices(): void {
    this.clearChoices();
    const { fontFamily, fontSize } = DIALOGUE;
    const x = this.bodyText.x;
    let y = this.bodyText.y + this.bodyText.height + 4;
    this.line!.choices!.forEach((c, i) => {
      const t = this.add.text(x, y, `  ${c.label}`, { fontFamily, fontSize: `${fontSize}px`, color: DIALOGUE_PANEL.inkDim, resolution: TEXT_RESOLUTION });
      if (isMobileDevice()) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerdown', (p: Phaser.Input.Pointer) => {
          p.event.stopPropagation();
          this.choiceIndex = i;
          this.updateChoiceCursor();
          if (this.time.now > this.ignoreUntil) {
            this.onAction();
          }
        });
      }
      this.choiceTexts.push(t);
      y += t.height + 2;
    });
    this.choiceIndex = 0;
    this.updateChoiceCursor();
  }

  private moveChoice(d: number): void {
    const n = this.choiceTexts.length;
    if (!n) return;
    this.choiceIndex = (this.choiceIndex + d + n) % n;
    this.updateChoiceCursor();
  }

  private updateChoiceCursor(): void {
    this.choiceTexts.forEach((t, i) => {
      const label = this.line!.choices![i].label;
      t.setText((i === this.choiceIndex ? '> ' : '  ') + label);
      t.setColor(i === this.choiceIndex ? DIALOGUE_PANEL.ink : DIALOGUE_PANEL.inkDim);
    });
  }

  private clearChoices(): void {
    this.choiceTexts.forEach((t) => t.destroy());
    this.choiceTexts = [];
  }

  private hide(): void {
    this.line = null;
    this.typeTimer?.remove();
    this.typeTimer = undefined;
    this.typing = false;
    this.clearChoices();
    this.group.setVisible(false);
  }

  /** Текстовая область панели в экранных координатах с учётом отступа. */
  private textRect(): { x: number; y: number; w: number; h: number } {
    const P = DIALOGUE_PANEL;
    const pad = DIALOGUE.padding;
    return { x: P.x + P.text.x + pad, y: P.y + P.text.y + pad, w: P.text.w - pad * 2, h: P.text.h - pad * 2 };
  }

  // ---------------------------------------------------------------- инвентарь

  /** Иконки в правом верхнем углу: закрытая коробка — запакованная посылка, предмет — уже открыта. */
  private refreshInventory(): void {
    const { fontFamily } = DIALOGUE;
    this.invHud.removeAll(true);
    const gifts = gameState.gifts;
    if (!gifts.length) {
      this.invHud.setVisible(false);
      return;
    }
    this.invHud.setVisible(true);
    const total = totalGifts();
    const label = this.add.text(0, 0, `${gifts.length}/${total}  [I]`, { fontFamily, fontSize: '9px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 }, resolution: TEXT_RESOLUTION }).setOrigin(1, 0);
    this.invHud.add(label);
    let x = -label.width - 4;
    for (let i = gifts.length - 1; i >= 0; i--) {
      const g = gifts[i];
      const opened = gameState.flag(`opened:${g.id}`);
      const tex = opened ? itemTexture(g.item) : 'prop_gift';
      const img = this.add.image(x, 0, this.textures.exists(tex) ? tex : 'prop_gift').setOrigin(1, 0).setScale(0.5);
      this.invHud.add(img);
      x -= 18;
    }
    if (this.invPanel.visible) this.buildInventoryPanel();
  }

  private toggleInventory(): void {
    const show = !this.invPanel.visible;
    if (show) this.buildInventoryPanel();
    this.invPanel.setVisible(show);
    audio.sfx('select', { volume: 0.5 });
  }

  /** Панель: список посылок (запакована / что внутри). */
  private buildInventoryPanel(): void {
    const { fontFamily } = DIALOGUE;
    const P = DIALOGUE_PANEL;
    this.invPanel.removeAll(true);
    const gifts = gameState.gifts;
    const rows = Math.max(1, gifts.length);
    const w = 220;
    const h = 34 + rows * 20;
    const x = Math.floor((GAME_WIDTH - w) / 2);
    const y = Math.floor((GAME_HEIGHT - h) / 2) - 20;
    const bg = this.add.rectangle(x, y, w, h, 0xfbe4e6).setOrigin(0, 0).setStrokeStyle(2, 0x6b3a45);
    const title = this.add.text(x + w / 2, y + 6, `Инвентарь — посылки ${gifts.length}/${totalGifts()}`, { fontFamily, fontSize: '11px', color: P.ink, resolution: TEXT_RESOLUTION }).setOrigin(0.5, 0);
    this.invPanel.add([bg, title]);
    if (!gifts.length) {
      this.invPanel.add(this.add.text(x + w / 2, y + 26, 'Пусто. Посылки ждут где-то там.', { fontFamily, fontSize: '10px', color: P.inkDim, resolution: TEXT_RESOLUTION }).setOrigin(0.5, 0));
    }
    gifts.forEach((g, i) => {
      const ry = y + 26 + i * 20;
      const opened = gameState.flag(`opened:${g.id}`);
      const tex = opened ? itemTexture(g.item) : 'prop_gift';
      const img = this.add.image(x + 10, ry + 8, this.textures.exists(tex) ? tex : 'prop_gift').setOrigin(0, 0.5).setScale(0.5);
      const text = opened ? itemName(gameState, g.item) : `Посылка №${i + 1} — запакована`;
      const t = this.add.text(x + 32, ry + 8, text, { fontFamily, fontSize: '10px', color: opened ? P.ink : P.inkDim, resolution: TEXT_RESOLUTION }).setOrigin(0, 0.5);
      this.invPanel.add([img, t]);
    });
    const hint = this.add.text(x + w / 2, y + h - 4, gifts.length && gifts.length >= totalGifts() && !gameState.flag('gifts_opened') ? 'Все собраны — нести на почту' : '[I] закрыть', { fontFamily, fontSize: '8px', color: P.inkDim, resolution: TEXT_RESOLUTION }).setOrigin(0.5, 1);
    this.invPanel.add(hint);
  }

  // ---------------------------------------------------------------- настройки (Esc)

  private toggleSettings(): void {
    const show = !this.setPanel.visible;
    if (show) {
      lockInput();
      this.buildSettingsPanel();
    } else {
      this.setPanel.removeAll(true);
      this.setRefresh = null;
      unlockInput();
    }
    this.setPanel.setVisible(show);
    audio.sfx('select', { volume: 0.5 });
  }

  /** ←/→ — громкость выбранной строки, ↑/↓ — выбор строки. */
  private updateSettings(): void {
    const J = Phaser.Input.Keyboard.JustDown;
    const kinds = ['music', 'sfx'] as const;
    if (this.setKeys.up.some((k) => J(k))) this.setRow = (this.setRow + kinds.length - 1) % kinds.length;
    else if (this.setKeys.down.some((k) => J(k))) this.setRow = (this.setRow + 1) % kinds.length;
    else if (this.setKeys.left.some((k) => J(k))) this.changeVolume(kinds[this.setRow], -AUDIO.step);
    else if (this.setKeys.right.some((k) => J(k))) this.changeVolume(kinds[this.setRow], +AUDIO.step);
    else return;
    this.setRefresh?.();
  }

  private changeVolume(kind: 'music' | 'sfx', delta: number): void {
    audio.setVolume(kind, Math.round((audio.volumes[kind] + delta) * 100) / 100);
    if (kind === 'sfx') audio.sfx('select', { volume: 0.6 }); // послушать новый уровень
  }

  /** Панель: два ползунка (музыка, эффекты) — клавиши или клик/перетаскивание по полосе, строка про mute. */
  private buildSettingsPanel(): void {
    const { fontFamily } = DIALOGUE;
    const P = DIALOGUE_PANEL;
    const R = TEXT_RESOLUTION;
    this.setPanel.removeAll(true);
    const w = 236;
    const h = 108;
    const x = Math.floor((GAME_WIDTH - w) / 2);
    const y = Math.floor((GAME_HEIGHT - h) / 2) - 10;
    const bg = this.add.rectangle(x, y, w, h, 0xfbe4e6).setOrigin(0, 0).setStrokeStyle(2, 0x6b3a45);
    const title = this.add.text(x + w / 2, y + 6, 'Настройки', { fontFamily, fontSize: '12px', color: P.ink, resolution: R }).setOrigin(0.5, 0);
    this.setPanel.add([bg, title]);

    const rows: { kind: 'music' | 'sfx'; label: string }[] = [
      { kind: 'music', label: 'Музыка' },
      { kind: 'sfx', label: 'Звуки' },
    ];
    const barX = x + 84;
    const barW = 100;
    const refreshers: (() => void)[] = [];
    rows.forEach((r, i) => {
      const ry = y + 34 + i * 22;
      const cursor = this.add.text(x + 8, ry, '▶', { fontFamily, fontSize: '9px', color: P.ink, resolution: R }).setOrigin(0, 0.5);
      const label = this.add.text(x + 20, ry, r.label, { fontFamily, fontSize: '10px', color: P.ink, resolution: R }).setOrigin(0, 0.5);
      const track = this.add.rectangle(barX, ry, barW, 8, 0xffffff).setOrigin(0, 0.5).setStrokeStyle(1, 0x6b3a45);
      const fill = this.add.rectangle(barX + 1, ry, 0, 6, 0xf2a7c3).setOrigin(0, 0.5);
      const pct = this.add.text(barX + barW + 6, ry, '', { fontFamily, fontSize: '10px', color: P.ink, resolution: R }).setOrigin(0, 0.5);
      // клик/перетаскивание по полосе (зона чуть шире полосы — удобнее попадать)
      const hit = this.add.rectangle(barX - 4, ry, barW + 8, 16, 0, 0).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const setFromPointer = (p: Phaser.Input.Pointer) => {
        const v = Phaser.Math.Clamp((p.x - barX) / barW, 0, 1);
        this.setRow = i;
        audio.setVolume(r.kind, Math.round(v * 20) / 20); // шаг 5 %
        this.setRefresh?.();
      };
      hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
        setFromPointer(p);
        if (r.kind === 'sfx') audio.sfx('select', { volume: 0.6 });
      });
      hit.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) setFromPointer(p);
      });
      this.setPanel.add([cursor, label, track, fill, pct, hit]);
      refreshers.push(() => {
        const v = audio.volumes[r.kind];
        fill.width = Math.round((barW - 2) * v);
        pct.setText(`${Math.round(v * 100)}%`);
        cursor.setVisible(this.setRow === i);
        label.setColor(this.setRow === i ? P.ink : P.inkDim);
      });
    });

    const mute = this.add.text(x + w / 2, y + h - 22, '', { fontFamily, fontSize: '9px', color: P.inkDim, resolution: R }).setOrigin(0.5, 0.5);
    const hint = this.add.text(x + w / 2, y + h - 6, '↑↓ выбрать   ←→ или клик — громкость   [Esc] закрыть', { fontFamily, fontSize: '8px', color: P.inkDim, resolution: R }).setOrigin(0.5, 1);
    this.setPanel.add([mute, hint]);
    refreshers.push(() => mute.setText(audio.muted ? 'Звук выключен — [M] включить' : '[M] выключить звук'));

    this.setRefresh = () => refreshers.forEach((f) => f());
    this.setRefresh();
  }

  /** Крупная надпись по центру (финал): появляется, висит ms, тает. */
  private showBanner(o: { text: string; ms?: number }): void {
    const t = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, o.text, { fontFamily: DIALOGUE.fontFamily, fontSize: '22px', color: '#ffe9a8', stroke: '#6b3a45', strokeThickness: 4, resolution: TEXT_RESOLUTION, align: 'center' })
      .setOrigin(0.5)
      .setDepth(70)
      .setScale(0.6)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.time.delayedCall(o.ms ?? 3000, () => this.tweens.add({ targets: t, alpha: 0, y: t.y - 8, duration: 400, onComplete: () => t.destroy() }));
  }

  /** Картинка с подписью по центру (финал): затемнение, картинка, текст под ней; ждёт клика/клавиши, затем 'reveal:closed'. */
  private showReveal(o: { image: string; caption: string }): void {
    const cx = GAME_WIDTH / 2;
    const dim = this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1b0f22, 0.72).setDepth(80).setAlpha(0);
    const group: { setAlpha(v: number): unknown; destroy(): void }[] = [dim];

    let imgBottom = GAME_HEIGHT / 2 - 10;
    if (this.textures.exists(o.image)) {
      const img = this.add.image(cx, GAME_HEIGHT / 2 - 24, o.image).setDepth(81).setAlpha(0);
      const maxW = GAME_WIDTH - 64;
      if (img.width > maxW) img.setScale(maxW / img.width);
      imgBottom = img.y + img.displayHeight / 2;
      group.push(img);
    }
    const caption = this.add
      .text(cx, imgBottom + 14, o.caption, {
        fontFamily: DIALOGUE.fontFamily,
        fontSize: '12px',
        color: '#ffe9a8',
        align: 'center',
        resolution: TEXT_RESOLUTION,
        wordWrap: { width: GAME_WIDTH - 80, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setDepth(81)
      .setAlpha(0);
    const hint = this.add
      .text(cx, GAME_HEIGHT - 12, '[ESC — закрыть]', { fontFamily: DIALOGUE.fontFamily, fontSize: '8px', color: '#ffffffaa', resolution: TEXT_RESOLUTION })
      .setOrigin(0.5, 1)
      .setDepth(81)
      .setAlpha(0);
    group.push(caption, hint);

    this.tweens.add({ targets: group, alpha: 1, duration: 400 });
    const readyAt = this.time.now + 400;
    const onDismiss = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (this.time.now < readyAt) return;
      this.input.keyboard!.off('keydown', onDismiss);
      this.tweens.add({
        targets: group,
        alpha: 0,
        duration: 300,
        onComplete: () => group.forEach((g) => g.destroy()),
      });
      bus.emit('reveal:closed');
    };
    this.input.keyboard!.on('keydown', onDismiss);
  }

  private showToast(title: string): void {
    this.toast.setText(title).setAlpha(0);
    this.tweens.add({ targets: this.toast, alpha: 1, duration: 300, yoyo: true, hold: 1500 });
  }

  /** Создание элементов сенсорного управления (крестовина D-pad, кнопка E, меню, полноэкранный режим). */
  private setupTouchControls(): void {
    this.touchGroup = this.add.container(0, 0).setDepth(200);

    // ── D-PAD (крестовина) слева внизу ──────────────────────────────────────
    const padCX = 52;
    const padCY = GAME_HEIGHT - 52;
    const btnSize = 20; // полуширина кнопки (квадрат 40×40)
    const gap = 22;     // смещение от центра до кнопки

    /** Одна кнопка крестовины */
    const makeDpadBtn = (
      ox: number, oy: number,
      label: string,
      ax: number, ay: number,
    ) => {
      const x = padCX + ox * gap;
      const y = padCY + oy * gap;

      const bg = this.add.rectangle(x, y, btnSize * 2, btnSize * 2, 0x000000, 0.45)
        .setStrokeStyle(1.5, 0xffffff, 0.55);
      const txt = this.add.text(x, y, label, {
        fontFamily: DIALOGUE.fontFamily,
        fontSize: '12px',
        color: '#ffffff',
        resolution: TEXT_RESOLUTION,
      }).setOrigin(0.5);

      bg.setInteractive({ useHandCursor: true });

      const press = (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        bg.setAlpha(0.85);
        GameInput.setTouchAxis(ax, ay);
      };
      const release = () => {
        bg.setAlpha(1);
        GameInput.setTouchAxis(0, 0);
      };

      bg.on('pointerdown', press);
      bg.on('pointerup', release);
      bg.on('pointerout', release);
      bg.on('pointerupoutside', release);

      this.touchGroup.add([bg, txt]);
    };

    makeDpadBtn( 0, -1, '▲', 0, -1);
    makeDpadBtn( 0,  1, '▼', 0,  1);
    makeDpadBtn(-1,  0, '◀', -1, 0);
    makeDpadBtn( 1,  0, '▶',  1, 0);

    // центральная декоративная точка
    const centerDot = this.add.circle(padCX, padCY, 8, 0x000000, 0.35)
      .setStrokeStyle(1, 0xffffff, 0.3);
    this.touchGroup.add(centerDot);

    // ── Кнопка действия (E) справа внизу ────────────────────────────────────
    const actX = GAME_WIDTH - 42;
    const actY = GAME_HEIGHT - 42;

    const actCircle = this.add.circle(0, 0, 22, 0x000000, 0.45).setStrokeStyle(2, 0xffffff, 0.7);
    const actText = this.add.text(0, 0, 'E', {
      fontFamily: DIALOGUE.fontFamily,
      fontSize: '13px',
      color: '#ffffff',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    const actBtn = this.add.container(actX, actY, [actCircle, actText]);
    actCircle.setInteractive({ useHandCursor: true });

    actCircle.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      actCircle.setScale(0.9);
      GameInput.triggerTouchAction();
      if (this.line && this.time.now > this.ignoreUntil) {
        this.onAction();
      }
    });
    actCircle.on('pointerup', () => actCircle.setScale(1));
    actCircle.on('pointerout', () => actCircle.setScale(1));

    this.touchGroup.add(actBtn);

    // ── Кнопка меню слева вверху ─────────────────────────────────────────────
    const menuBg = this.add.rectangle(8, 8, 44, 16, 0x000000, 0.6)
      .setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.4);
    const menuTxt = this.add.text(30, 16, 'МЕНЮ', {
      fontFamily: DIALOGUE.fontFamily,
      fontSize: '8px',
      color: '#ffffff',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5);

    const menuBtn = this.add.container(0, 0, [menuBg, menuTxt]);
    menuBg.setInteractive({ useHandCursor: true });
    menuBg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      if (this.setPanel.visible) {
        this.toggleSettings();
      } else if (!this.line && !isInputLocked()) {
        this.toggleSettings();
      }
    });

    this.touchGroup.add(menuBtn);

    // ── Кнопка полноэкранного режима справа вверху ───────────────────────────
    const fsBg = this.add.rectangle(GAME_WIDTH - 8, 8, 28, 16, 0x000000, 0.6)
      .setOrigin(1, 0).setStrokeStyle(1, 0xffffff, 0.4);
    const fsTxt = this.add.text(GAME_WIDTH - 22, 16, '⛶', {
      fontFamily: DIALOGUE.fontFamily,
      fontSize: '10px',
      color: '#ffffff',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5, 0.5);

    const fsBtn = this.add.container(0, 0, [fsBg, fsTxt]);
    fsBg.setInteractive({ useHandCursor: true });
    fsBg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {/* ignore */});
      } else {
        document.exitFullscreen().catch(() => {/* ignore */});
      }
    });

    this.touchGroup.add(fsBtn);
  }
}
