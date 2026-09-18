import Phaser from 'phaser';
import { TILE, PORTRAIT_SIZE, DIR_ROWS, DIALOGUE_PANEL } from '../config';
import { TILE_LIST, TILESET_COLUMNS } from '../systems/MapLoader';
import type { AssetDef } from '../data/assets';

/**
 * Заглушки-текстуры, рисуются на canvas, если настоящего файла нет.
 * Нужны, чтобы игру можно было собирать и играть до готовности арта.
 */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function shade(color: string, k: number): string {
  const n = parseInt(color.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

/** Одна клетка тайлсета-заглушки: цвет из tiles.json, рамка у solid, имя подписью. */
function drawTilePlaceholder(ctx: CanvasRenderingContext2D, i: number): void {
  const t = TILE_LIST[i];
  const x = (i % TILESET_COLUMNS) * TILE;
  const y = Math.floor(i / TILESET_COLUMNS) * TILE;
  ctx.fillStyle = t.color;
  ctx.fillRect(x, y, TILE, TILE);
  // лёгкая фактура: несколько детерминированных точек потемнее
  ctx.fillStyle = shade(t.color, 0.85);
  for (let k = 0; k < 6; k++) {
    const px = (i * 7 + k * 13) % (TILE - 2);
    const py = (i * 11 + k * 5) % (TILE - 2);
    ctx.fillRect(x + px, y + py, 2, 2);
  }
  if (t.solid) {
    ctx.strokeStyle = shade(t.color, 0.6);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.font = '7px monospace';
  ctx.fillText(t.name.slice(0, 6), x + 2, y + TILE - 3);
}

/**
 * Канвас тайлсета (без Phaser — им же пользуется редактор карт). Без `image` — сплошная заглушка.
 * С `image` (настоящий tileset.png) — его копия, где пустые клетки (тайл ещё не нарисован, или файл
 * короче tiles.json) дорисованы заглушками, чтобы на карте было видно имя и цвет, а не дыру.
 */
export function tilesetCanvas(image?: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const cols = TILESET_COLUMNS;
  const rows = Math.ceil(TILE_LIST.length / cols);
  const [c, ctx] = canvas(cols * TILE, rows * TILE);
  if (image) ctx.drawImage(image, 0, 0);
  const alpha = image ? ctx.getImageData(0, 0, c.width, c.height).data : null;
  TILE_LIST.forEach((t, i) => {
    if (t.name === 'empty') return;
    if (alpha && !cellEmpty(alpha, c.width, i)) return;
    drawTilePlaceholder(ctx, i);
  });
  return c;
}

function cellEmpty(rgba: Uint8ClampedArray, width: number, i: number): boolean {
  const x0 = (i % TILESET_COLUMNS) * TILE;
  const y0 = Math.floor(i / TILESET_COLUMNS) * TILE;
  for (let y = y0; y < y0 + TILE; y++) {
    for (let x = x0; x < x0 + TILE; x++) {
      if (rgba[(y * width + x) * 4 + 3] !== 0) return false;
    }
  }
  return true;
}

export function makeTileset(scene: Phaser.Scene, key: string): void {
  scene.textures.addCanvas(key, tilesetCanvas());
}

/** Настоящий tileset.png уже загружен — подменить текстуру копией с заглушками в пустых клетках. */
export function patchTileset(scene: Phaser.Scene, key: string): void {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const merged = tilesetCanvas(src);
  scene.textures.remove(key);
  scene.textures.addCanvas(key, merged);
}

/** Спрайтшит персонажа: строки = направления (down,left,right,up), столбцы = кадры ходьбы. */
export function makeCharacter(
  scene: Phaser.Scene,
  key: string,
  fw: number,
  fh: number,
  color: number,
  label: string,
  frames: number,
): void {
  const [c, ctx] = canvas(fw * frames, fh * DIR_ROWS.length);
  const base = hex(color);
  DIR_ROWS.forEach((dir, row) => {
    for (let f = 0; f < frames; f++) {
      const ox = f * fw;
      const oy = row * fh;
      const legOff = f === 1 ? -2 : f === 3 ? 2 : 0; // "шаг"
      const bob = f % 2 === 1 ? 1 : 0;
      const bodyW = Math.round(fw * 0.6);
      const bodyH = Math.round(fh * 0.45);
      const bx = ox + (fw - bodyW) / 2;
      const by = oy + fh * 0.35 - bob;
      // ноги
      ctx.fillStyle = shade(base, 0.6);
      ctx.fillRect(bx + 2 + legOff, by + bodyH, bodyW / 2 - 3, fh - (by - oy) - bodyH);
      ctx.fillRect(bx + bodyW / 2 + 1 - legOff, by + bodyH, bodyW / 2 - 3, fh - (by - oy) - bodyH);
      // тело
      ctx.fillStyle = base;
      ctx.fillRect(bx, by, bodyW, bodyH);
      // голова
      const headR = Math.round(fw * 0.32);
      const hx = ox + fw / 2;
      const hy = by - headR + 2;
      ctx.fillStyle = shade(base, 1.15);
      ctx.beginPath();
      ctx.arc(hx, hy, headR, 0, Math.PI * 2);
      ctx.fill();
      // глаза показывают направление
      ctx.fillStyle = '#111';
      const ex = dir === 'left' ? -4 : dir === 'right' ? 4 : 0;
      if (dir !== 'up') {
        ctx.fillRect(hx - 3 + ex, hy - 1, 2, 2);
        ctx.fillRect(hx + 1 + ex, hy - 1, 2, 2);
      }
      // контур и буква
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bodyW - 1, bodyH - 1);
      ctx.fillStyle = '#111';
      ctx.font = '8px monospace';
      ctx.fillText(label, bx + 2, by + bodyH - 3);
    }
  });
  scene.textures.addSpriteSheet(key, c as unknown as HTMLImageElement, { frameWidth: fw, frameHeight: fh });
}

export function makePortrait(scene: Phaser.Scene, key: string, color: number, label: string): void {
  const s = PORTRAIT_SIZE;
  const [c, ctx] = canvas(s, s);
  const base = hex(color);
  ctx.fillStyle = shade(base, 0.4);
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2 - 4, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(s * 0.2, s * 0.65, s * 0.6, s * 0.35);
  ctx.fillStyle = '#111';
  ctx.fillRect(s * 0.4, s * 0.42, 4, 4);
  ctx.fillRect(s * 0.56, s * 0.42, 4, 4);
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 4, 16);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, s - 2, s - 2);
  scene.textures.addCanvas(key, c);
}

export function makeProp(scene: Phaser.Scene, key: string, color: number, label: string): void {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = hex(color);
  ctx.fillRect(4, 8, TILE - 8, TILE - 12);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 9, TILE - 10, TILE - 14);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(label, 11, 24);
  scene.textures.addCanvas(key, c);
}

/** Панель диалога 9-slice: 48x48, рамка 8px (белая линия, тёмная заливка). */
/** Панель диалога той же геометрии, что DIALOGUE_PANEL: светлая рамка, окошко портрета и плашка имени. */
export function makeUiBox(scene: Phaser.Scene, key: string): void {
  const P = DIALOGUE_PANEL;
  const [c, ctx] = canvas(P.width, P.height);
  const frame = (r: { x: number; y: number; w: number; h: number }, pad: number) => {
    ctx.fillStyle = '#6b3a45';
    ctx.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    ctx.fillStyle = '#fbe4e6';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  };
  frame({ x: P.text.x - 6, y: P.text.y - 6, w: P.portrait.x + P.portrait.w - P.text.x + 12, h: P.text.h + 12 }, 2);
  frame(P.text, 2);
  frame(P.portrait, 2);
  frame(P.name, 2);
  scene.textures.addCanvas(key, c);
}


/** Монстр: клякса с глазом; спрайтшит той же раскладки, что у персонажей (все направления одинаковые, лёгкое дыхание). */
export function makeMonster(scene: Phaser.Scene, key: string, fw: number, fh: number, color: number, frames: number): void {
  const [c, ctx] = canvas(fw * frames, fh * DIR_ROWS.length);
  const base = hex(color);
  DIR_ROWS.forEach((_dir, row) => {
    for (let f = 0; f < frames; f++) {
      const ox = f * fw;
      const oy = row * fh;
      const breathe = f % 2 === 1 ? 2 : 0;
      const cx = ox + fw / 2;
      const bottom = oy + fh - 2;
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.ellipse(cx, bottom - fh * 0.34 + breathe / 2, fw * 0.36, fh * 0.34 - breathe / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // "ножки"-щупальца у основания
      ctx.fillStyle = shade(base, 0.7);
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + k * fw * 0.14, bottom - 3, 4, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // глаз
      ctx.fillStyle = '#f4f0e0';
      ctx.beginPath();
      ctx.ellipse(cx, bottom - fh * 0.42, fw * 0.16, fh * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b0f22';
      ctx.beginPath();
      ctx.arc(cx + (f === 3 ? 2 : 0), bottom - fh * 0.42, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1b0f22';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, bottom - fh * 0.34 + breathe / 2, fw * 0.36, fh * 0.34 - breathe / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  scene.textures.addSpriteSheet(key, c as unknown as HTMLImageElement, { frameWidth: fw, frameHeight: fh });
}

/** Коробка с подарком: закрытая (с лентой и бантом) или открытая (крышка сзади). */
export function makeGift(scene: Phaser.Scene, key: string, open: boolean): void {
  const [c, ctx] = canvas(TILE, TILE);
  const box = '#d9605f';
  const ribbon = '#f7d34a';
  const dark = '#8f3a3a';
  ctx.fillStyle = box;
  ctx.fillRect(5, 14, 22, 16);
  ctx.fillStyle = dark;
  ctx.fillRect(5, 29, 22, 1);
  ctx.fillRect(26, 14, 1, 16);
  if (!open) {
    ctx.fillStyle = shade(box, 1.12);
    ctx.fillRect(3, 10, 26, 5); // крышка
    ctx.fillStyle = ribbon;
    ctx.fillRect(14, 10, 4, 20); // лента
    ctx.fillRect(3, 12, 26, 2);
    // бант
    ctx.fillRect(9, 5, 5, 5);
    ctx.fillRect(18, 5, 5, 5);
    ctx.fillRect(13, 7, 6, 4);
  } else {
    ctx.fillStyle = shade(box, 1.12);
    ctx.fillRect(4, 4, 24, 5); // крышка откинута назад
    ctx.fillStyle = '#3a1f2d';
    ctx.fillRect(6, 14, 20, 4); // темнота внутри
    ctx.fillStyle = ribbon;
    ctx.fillRect(14, 18, 4, 12);
  }
  ctx.strokeStyle = '#2a1f2d';
  ctx.lineWidth = 1;
  ctx.strokeRect(5.5, 14.5, 21, 15);
  scene.textures.addCanvas(key, c);
}

/** Люк канализации: круг с рёбрами, лежит на дороге. */
export function makeHatch(scene: Phaser.Scene, key: string): void {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = '#2e2a2e';
  ctx.beginPath();
  ctx.ellipse(16, 22, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a4650';
  ctx.beginPath();
  ctx.ellipse(16, 20, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e2a2e';
  ctx.lineWidth = 1;
  for (let i = -8; i <= 8; i += 4) {
    ctx.beginPath();
    ctx.moveTo(16 + i, 14);
    ctx.lineTo(16 + i, 26);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(16, 20, 12, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  scene.textures.addCanvas(key, c);
}

/** Мольберт с холстом (1×2 тайла, низ — ножки). */
export function makeEasel(scene: Phaser.Scene, key: string): void {
  const [c, ctx] = canvas(TILE, TILE * 2);
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, 62);
  ctx.lineTo(16, 12);
  ctx.lineTo(24, 62);
  ctx.moveTo(16, 12);
  ctx.lineTo(16, 62);
  ctx.stroke();
  ctx.fillStyle = '#f6f0e4';
  ctx.fillRect(4, 18, 24, 22);
  ctx.strokeStyle = '#2a1f2d';
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 18.5, 23, 21);
  ctx.fillStyle = '#c95c8a';
  ctx.fillRect(9, 24, 5, 5);
  ctx.fillStyle = '#5f9e4a';
  ctx.fillRect(17, 30, 6, 4);
  ctx.fillStyle = '#7fb3d5';
  ctx.fillRect(12, 32, 4, 4);
  scene.textures.addCanvas(key, c);
}

/** Старый монитор на подставке: серый корпус, синий экран с «окном» и мигающим курсором. */
export function makeComputer(scene: Phaser.Scene, key: string): void {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = '#8a8a96';
  ctx.fillRect(11, 26, 10, 3);
  ctx.fillRect(14, 22, 4, 5);
  ctx.fillStyle = '#c9c2b6';
  ctx.fillRect(3, 4, 26, 19);
  ctx.fillStyle = '#2f4fa3';
  ctx.fillRect(5, 6, 22, 15);
  ctx.fillStyle = '#f6f0e4';
  ctx.fillRect(7, 8, 18, 3);
  ctx.fillStyle = '#5fd66a';
  ctx.fillRect(7, 13, 10, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(7, 17, 2, 2);
  ctx.fillStyle = '#5fd66a';
  ctx.fillRect(26, 21, 2, 1);
  scene.textures.addCanvas(key, c);
}

/** Шахед: тёмное треугольное крыло с двигателем сзади. */
export function makeDrone(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#3a3a44';
  ctx.beginPath();
  ctx.moveTo(w - 2, h / 2);
  ctx.lineTo(4, 2);
  ctx.lineTo(0, h / 2);
  ctx.lineTo(4, h - 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1b1b22';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#55555f';
  ctx.fillRect(w * 0.3, h / 2 - 2, w * 0.45, 4);
  ctx.fillStyle = '#8a8a96';
  ctx.fillRect(0, h / 2 - 3, 3, 6);
  scene.textures.addCanvas(key, c);
}

/** Маленький зелёный дрон-квадрокоптер (свой, сбивать нельзя). */
export function makeGreenDrone(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#4fc36b';
  ctx.fillRect(w / 2 - 4, h / 2 - 3, 8, 6);
  ctx.fillStyle = '#2f8f45';
  ctx.fillRect(0, h / 2 - 1, w, 2);
  ctx.fillStyle = '#9ff0b0';
  ctx.fillRect(0, 0, 5, 2);
  ctx.fillRect(w - 5, 0, 5, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(w / 2 - 1, h / 2 - 1, 2, 2);
  scene.textures.addCanvas(key, c);
}

/** Миска с кормом: красная, вид чуть сверху. */
export function makeBowl(scene: Phaser.Scene, key: string): void {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = '#a83a3a';
  ctx.beginPath();
  ctx.ellipse(16, 21, 12, 6, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillRect(4, 18, 24, 3);
  ctx.fillStyle = '#d64c4c';
  ctx.beginPath();
  ctx.ellipse(16, 18, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a4a2a';
  ctx.beginPath();
  ctx.ellipse(16, 18, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b07a4a';
  for (const [x, y] of [[11, 17], [15, 16], [19, 18], [14, 19], [18, 16]]) ctx.fillRect(x, y, 2, 2);
  scene.textures.addCanvas(key, c);
}

/** Мячик: оранжевый с синей полосой и бликом. */
export function makeBall(scene: Phaser.Scene, key: string): void {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = '#e8853a';
  ctx.beginPath();
  ctx.arc(16, 17, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a6ec9';
  ctx.beginPath();
  ctx.ellipse(16, 17, 9, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd9b3';
  ctx.fillRect(12, 11, 3, 2);
  ctx.fillRect(11, 13, 2, 2);
  scene.textures.addCanvas(key, c);
}

/** Лакомство: косточка. */
export function makeTreat(scene: Phaser.Scene, key: string): void {
  const [c, ctx] = canvas(TILE, TILE);
  ctx.fillStyle = '#f2e6c8';
  ctx.strokeStyle = '#a89870';
  ctx.lineWidth = 1;
  ctx.fillRect(10, 15, 12, 4);
  for (const [x, y] of [[9, 14], [9, 20], [23, 14], [23, 20]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillRect(10, 15, 12, 4);
  ctx.beginPath();
  ctx.moveTo(10, 14.5);
  ctx.lineTo(22, 14.5);
  ctx.moveTo(10, 19.5);
  ctx.lineTo(22, 19.5);
  ctx.stroke();
  scene.textures.addCanvas(key, c);
}

/** Полоска-образец цветов (пока нет реального фото): скруглённая плашка с градиентом на белом. */
export function makeSwatch(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#0a3567');
  grad.addColorStop(0.35, '#3a89c9');
  grad.addColorStop(0.55, '#12242e');
  grad.addColorStop(0.8, '#a9c9a0');
  grad.addColorStop(1, '#eef2df');
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.moveTo(r, 2);
  ctx.arcTo(w - 2, 2, w - 2, h - 2, r);
  ctx.arcTo(w - 2, h - 2, 2, h - 2, r);
  ctx.arcTo(2, h - 2, 2, 2, r);
  ctx.arcTo(2, 2, w - 2, 2, r);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  scene.textures.addCanvas(key, c);
}

export function makePlaceholder(scene: Phaser.Scene, a: AssetDef): void {
  const p = a.placeholder;
  if (!p) return;
  switch (p.kind) {
    case 'tileset':
      return makeTileset(scene, a.key);
    case 'character':
      return makeCharacter(scene, a.key, a.frame!.w, a.frame!.h, p.color ?? 0xffffff, p.label ?? '?', p.frames ?? 4);
    case 'portrait':
      return makePortrait(scene, a.key, p.color ?? 0xffffff, p.label ?? '?');
    case 'prop':
      return makeProp(scene, a.key, p.color ?? 0x888888, p.label ?? '?');
    case 'ui':
      return makeUiBox(scene, a.key);
    case 'monster':
      return makeMonster(scene, a.key, a.frame!.w, a.frame!.h, p.color ?? 0x5a3a7a, p.frames ?? 4);
    case 'gift':
      return makeGift(scene, a.key, false);
    case 'gift_open':
      return makeGift(scene, a.key, true);
    case 'hatch':
      return makeHatch(scene, a.key);
    case 'easel':
      return makeEasel(scene, a.key);
    case 'computer':
      return makeComputer(scene, a.key);
    case 'drone':
      return makeDrone(scene, a.key, a.frame!.w, a.frame!.h);
    case 'drone_green':
      return makeGreenDrone(scene, a.key, a.frame!.w, a.frame!.h);
    case 'bowl':
      return makeBowl(scene, a.key);
    case 'ball':
      return makeBall(scene, a.key);
    case 'treat':
      return makeTreat(scene, a.key);
    case 'swatch':
      return makeSwatch(scene, a.key, a.frame!.w, a.frame!.h);
  }
}
