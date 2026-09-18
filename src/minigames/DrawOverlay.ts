import { audio } from '../core/Audio';

/** Размер холста рисунка (в пикселях исходника; на экране масштабируется). */
export const DRAW_SIZE = 384;

const PALETTE = [
  '#1b1420', '#6b3a45', '#d9605f', '#f2a24d', '#f7d34a', '#8fd19e', '#3f7a33', '#43b5e6',
  '#2f4fa3', '#c24bd6', '#f2a7c3', '#a67c52', '#8a8a96', '#ffffff', '#f6f0e4', '#5a3a7a',
];
const SIZES = [4, 9, 16];

type Tool = 'brush' | 'eraser' | 'fill';

export interface DrawOverlayCallbacks {
  onDone(canvas: HTMLCanvasElement, hint: string): void;
  onCancel(): void;
}

const STYLE_ID = 'draw-overlay-style';
const CSS = `
.dro { position: fixed; z-index: 20; display: flex; flex-direction: column; box-sizing: border-box; padding: 2.2% 3%;
  background: #f6e4e6; color: #6b3a45; font-family: "PixelFont", "Courier New", monospace; user-select: none; touch-action: none;
  background-image: radial-gradient(#f0cfd6 1.5px, transparent 1.6px), radial-gradient(#f0cfd6 1.5px, transparent 1.6px);
  background-size: 28px 28px; background-position: 0 0, 14px 14px; }
.dro * { box-sizing: border-box; }
.dro h2 { margin: 0 0 .4em; font-size: clamp(14px, 2.6vh, 26px); font-weight: normal; text-align: center; letter-spacing: .02em; }
.dro .body { flex: 1; display: flex; gap: 2%; min-height: 0; }
/* глобальный canvas { position: relative; z-index: 1 } (index.html, для канваса Phaser) иначе поднимает холст над .status */
.dro .cv { flex: none; height: 100%; aspect-ratio: 1; background: #fff; border: 3px solid #6b3a45; border-radius: 8px; position: static; z-index: auto;
  box-shadow: inset 0 0 0 4px #fff4f4, 0 8px 20px rgba(107,58,69,.25); cursor: crosshair; touch-action: none; image-rendering: pixelated; }
.dro .tools { flex: 1; display: flex; flex-direction: column; gap: 1.4vh; min-width: 0; font-size: clamp(10px, 1.7vh, 16px); }
.dro .pal { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
.dro .sw { aspect-ratio: 1; border: 2px solid #6b3a45; border-radius: 4px; cursor: pointer; }
.dro .sw.on { outline: 3px solid #f2a7c3; outline-offset: 1px; }
.dro .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.dro button { font: inherit; color: #6b3a45; background: #fff4f4; border: 2px solid #6b3a45; border-radius: 6px; padding: .35em .8em; cursor: pointer; }
.dro button.on { background: #f2a7c3; } .dro button:hover { background: #fbe4e6; } .dro button.on:hover { background: #f2a7c3; }
.dro button.p { background: #6b3a45; color: #fff4f4; font-size: 1.15em; padding: .5em 1.2em; }
.dro button.p:hover { background: #8a4a58; }
.dro .sz { width: 2.6em; height: 2.6em; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
.dro .sz i { display: block; border-radius: 50%; background: #6b3a45; }
.dro input { font: inherit; color: #6b3a45; background: #fff; border: 2px solid #6b3a45; border-radius: 6px; padding: .35em .6em; width: 100%; }
.dro .hint { color: #9c6b76; font-size: .85em; }
.dro .spacer { flex: 1; }
.dro .x { position: absolute; top: 1.5%; right: 2%; font-size: 1.2em; padding: .2em .6em; }
.dro .status { position: absolute; inset: 0; z-index: 5; display: none; align-items: center; justify-content: center; flex-direction: column; gap: 1.2vh;
  background: rgba(246,228,230,.985); text-align: center; padding: 4%; }
.dro .status.open { display: flex; }
.dro .status .big { font-size: clamp(16px, 3vh, 30px); }
.dro .status .cap { font-size: clamp(12px, 2vh, 20px); max-width: 60ch; color: #6b3a45; font-style: italic; }
.dro .status img { image-rendering: pixelated; width: clamp(96px, 22vh, 220px); height: auto; background: #fff; border: 3px solid #6b3a45; border-radius: 8px; padding: 6px; }
.dro .dots::after { content: ''; animation: dro-dots 1.2s steps(4) infinite; }
@keyframes dro-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
`;

/**
 * DOM-оверлей рисовалки (в духе Gartic Phone) поверх канваса игры: холст, палитра, размеры кисти,
 * ластик, заливка, отмена, очистка, подпись «что это», кнопка «Готово». Экран статуса — отправка и результат.
 * Игра рисуется в Phaser, а рисовать в DOM-канвасе проще и надёжнее (события указателя, курсоры, undo).
 */
export class DrawOverlay {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private color = PALETTE[0];
  private size = SIZES[1];
  private tool: Tool = 'brush';
  private drawing = false;
  private last: { x: number; y: number } | null = null;
  private undo: ImageData[] = [];
  private swatches: HTMLDivElement[] = [];
  private toolBtns: Record<Tool, HTMLButtonElement> = {} as Record<Tool, HTMLButtonElement>;
  private sizeBtns: HTMLButtonElement[] = [];
  private hintInput: HTMLInputElement;
  private status: HTMLDivElement;
  private statusText: HTMLDivElement;
  private resultBox: HTMLDivElement;
  private strokeCount = 0;
  private onResize = () => this.place();

  constructor(private gameCanvas: HTMLCanvasElement, private cb: DrawOverlayCallbacks) {
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'dro';
    this.root.innerHTML = `
      <h2>Нарисуй свой любимый предмет</h2>
      <button class="x" title="Отмена (Esc)">✕</button>
      <div class="body">
        <canvas class="cv" width="${DRAW_SIZE}" height="${DRAW_SIZE}"></canvas>
        <div class="tools">
          <div class="pal"></div>
          <div class="row sizes"></div>
          <div class="row tl">
            <button data-tool="brush" class="on">Кисть</button>
            <button data-tool="eraser">Ластик</button>
            <button data-tool="fill">Заливка</button>
            <button data-act="undo" title="Ctrl+Z">Отменить</button>
            <button data-act="clear">Очистить</button>
          </div>
          <input class="hint-in" maxlength="40" placeholder="Что это? (подсказка художнику, необязательно)">
          <div class="hint">Рисунок отправится нейросети: она превратит его в пиксельный подарок и подпишет.</div>
          <div class="spacer"></div>
          <div class="row"><button class="p done">Готово →</button></div>
        </div>
      </div>
      <div class="status">
        <div class="big st-text"></div>
        <div class="result"></div>
      </div>`;
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, DRAW_SIZE, DRAW_SIZE);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.hintInput = this.root.querySelector('.hint-in')!;
    this.status = this.root.querySelector('.status')!;
    this.statusText = this.root.querySelector('.st-text')!;
    this.resultBox = this.root.querySelector('.result')!;

    // палитра
    const pal = this.root.querySelector('.pal')!;
    PALETTE.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'sw' + (c === this.color ? ' on' : '');
      d.style.background = c;
      d.addEventListener('pointerdown', () => this.setColor(c));
      pal.appendChild(d);
      this.swatches.push(d);
    });
    // размеры
    const sizes = this.root.querySelector('.sizes')!;
    SIZES.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'sz' + (s === this.size ? ' on' : '');
      b.innerHTML = `<i style="width:${Math.min(20, s + 4)}px;height:${Math.min(20, s + 4)}px"></i>`;
      b.addEventListener('click', () => this.setSize(s));
      sizes.appendChild(b);
      this.sizeBtns.push(b);
    });
    // инструменты
    this.root.querySelectorAll<HTMLButtonElement>('button[data-tool]').forEach((b) => {
      const t = b.dataset.tool as Tool;
      this.toolBtns[t] = b;
      b.addEventListener('click', () => this.setTool(t));
    });
    this.root.querySelector<HTMLButtonElement>('button[data-act="undo"]')!.addEventListener('click', () => this.doUndo());
    this.root.querySelector<HTMLButtonElement>('button[data-act="clear"]')!.addEventListener('click', () => this.clear());
    this.root.querySelector<HTMLButtonElement>('.done')!.addEventListener('click', () => this.done());
    this.root.querySelector<HTMLButtonElement>('.x')!.addEventListener('click', () => this.cb.onCancel());

    // рисование
    this.canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('resize', this.onResize);

    document.body.appendChild(this.root);
    this.place();
  }

  /** Оверлей ровно над канвасом игры. */
  private place(): void {
    const r = this.gameCanvas.getBoundingClientRect();
    Object.assign(this.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * DRAW_SIZE, y: ((e.clientY - r.top) / r.height) * DRAW_SIZE };
  }

  private pushUndo(): void {
    this.undo.push(this.ctx.getImageData(0, 0, DRAW_SIZE, DRAW_SIZE));
    if (this.undo.length > 25) this.undo.shift();
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    this.pushUndo();
    if (this.tool === 'fill') {
      this.floodFill(Math.floor(p.x), Math.floor(p.y), this.color);
      audio.sfx('splash', { volume: 0.4 });
      this.strokeCount++;
      return;
    }
    this.drawing = true;
    this.last = p;
    this.dot(p);
    audio.sfx('brush', { volume: 0.5 });
    this.strokeCount++;
  }

  private pointerMove(e: PointerEvent): void {
    if (!this.drawing || !this.last) return;
    e.preventDefault();
    const p = this.pos(e);
    const ctx = this.ctx;
    ctx.strokeStyle = this.tool === 'eraser' ? '#ffffff' : this.color;
    ctx.lineWidth = this.tool === 'eraser' ? this.size * 2 : this.size;
    ctx.beginPath();
    ctx.moveTo(this.last.x, this.last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.last = p;
  }

  private pointerUp = (): void => {
    this.drawing = false;
    this.last = null;
  };

  private keyDown = (e: KeyboardEvent): void => {
    if (e.target === this.hintInput) return;
    if (e.key === 'Escape') this.cb.onCancel();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') this.doUndo();
    else if (e.key === 'e' || e.key === 'E') this.setTool(this.tool === 'eraser' ? 'brush' : 'eraser');
    else if (e.key === 'b' || e.key === 'B') this.setTool('brush');
    else if (e.key === 'f' || e.key === 'F') this.setTool('fill');
    else if (e.key === 'Enter' && this.status.classList.contains('open')) this.resultBox.querySelector<HTMLButtonElement>('button')?.click();
  };

  private dot(p: { x: number; y: number }): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.tool === 'eraser' ? '#ffffff' : this.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (this.tool === 'eraser' ? this.size * 2 : this.size) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Заливка области похожего цвета (построчно, без рекурсии). */
  private floodFill(sx: number, sy: number, hex: string): void {
    const img = this.ctx.getImageData(0, 0, DRAW_SIZE, DRAW_SIZE);
    const d = img.data;
    const W = DRAW_SIZE;
    const idx = (x: number, y: number) => (y * W + x) * 4;
    const i0 = idx(sx, sy);
    const target = [d[i0], d[i0 + 1], d[i0 + 2]];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (Math.abs(target[0] - r) + Math.abs(target[1] - g) + Math.abs(target[2] - b) < 6) return;
    const match = (i: number) => Math.abs(d[i] - target[0]) + Math.abs(d[i + 1] - target[1]) + Math.abs(d[i + 2] - target[2]) < 90;
    const stack: number[] = [sx, sy];
    while (stack.length) {
      const y = stack.pop()!;
      let x = stack.pop()!;
      while (x >= 0 && match(idx(x, y))) x--;
      x++;
      let up = false;
      let down = false;
      while (x < W && match(idx(x, y))) {
        const i = idx(x, y);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
        if (y > 0) {
          const m = match(idx(x, y - 1));
          if (m && !up) {
            stack.push(x, y - 1);
            up = true;
          } else if (!m) up = false;
        }
        if (y < W - 1) {
          const m = match(idx(x, y + 1));
          if (m && !down) {
            stack.push(x, y + 1);
            down = true;
          } else if (!m) down = false;
        }
        x++;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }

  private setColor(c: string): void {
    this.color = c;
    this.swatches.forEach((s) => s.classList.toggle('on', s.style.background === c || rgbToHex(s.style.background) === c));
    if (this.tool === 'eraser') this.setTool('brush');
    audio.sfx('select', { volume: 0.4 });
  }

  private setSize(s: number): void {
    this.size = s;
    this.sizeBtns.forEach((b, i) => b.classList.toggle('on', SIZES[i] === s));
  }

  private setTool(t: Tool): void {
    this.tool = t;
    (Object.keys(this.toolBtns) as Tool[]).forEach((k) => this.toolBtns[k].classList.toggle('on', k === t));
    this.canvas.style.cursor = t === 'fill' ? 'cell' : 'crosshair';
  }

  private doUndo(): void {
    const img = this.undo.pop();
    if (img) this.ctx.putImageData(img, 0, 0);
  }

  private clear(): void {
    this.pushUndo();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, DRAW_SIZE, DRAW_SIZE);
  }

  private done(): void {
    if (this.strokeCount === 0) {
      this.setStatus('Сначала что-нибудь нарисуй :)');
      setTimeout(() => this.hideStatus(), 1200);
      return;
    }
    this.cb.onDone(this.canvas, this.hintInput.value.trim());
  }

  /** Экран статуса («отправляем...», «нейросеть рисует...»). */
  setStatus(text: string, busy = false): void {
    this.status.classList.add('open');
    this.statusText.textContent = text;
    this.statusText.classList.toggle('dots', busy);
    this.resultBox.innerHTML = '';
  }

  hideStatus(): void {
    this.status.classList.remove('open');
  }

  /** Показать результат: спрайт, название, подпись, кнопка «Забрать». Резолвится по нажатию. */
  showResult(spriteUrl: string, name: string, caption: string, note?: string): Promise<void> {
    this.setStatus(name);
    this.statusText.classList.remove('dots');
    this.resultBox.innerHTML = `
      <img alt="">
      <div class="cap"></div>
      ${note ? `<div class="hint"></div>` : ''}
      <div class="row" style="justify-content:center;margin-top:1vh"><button class="p">Забрать подарок</button></div>`;
    this.resultBox.querySelector('img')!.src = spriteUrl;
    this.resultBox.querySelector('.cap')!.textContent = caption;
    if (note) this.resultBox.querySelector('.hint')!.textContent = note;
    return new Promise((res) => this.resultBox.querySelector('button')!.addEventListener('click', () => res(), { once: true }));
  }

  /** PNG рисунка как data:-URL. */
  toDataURL(): string {
    return this.canvas.toDataURL('image/png');
  }

  destroy(): void {
    window.removeEventListener('pointerup', this.pointerUp);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return rgb;
  return '#' + m.slice(0, 3).map((n) => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
}
