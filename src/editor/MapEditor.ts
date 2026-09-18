import { IDLE_FRAME, TILE } from '../config';
import { tilesetCanvas } from '../core/Placeholders';
import { CHARACTERS } from '../data/characters';
import { BASE_LEGEND } from '../data/maps/legend';
import { MUSIC } from '../data/music';
import { TILE_LIST, TILES, TILESET_COLUMNS } from '../systems/MapLoader';
import type { Dir, MapDef, MapItem, MapNpc, MapTrigger } from '../types';
import { append, button, checkbox, clear, el, field, input, select } from './dom';
import { DIRS } from './schema';

type Layer = 'ground' | 'objects' | 'overhead';
type Tool = 'paint' | 'erase' | 'fill' | 'pick' | 'select';
type ObjKind = 'spawn' | 'exit' | 'npc' | 'item' | 'trigger';
interface Sel {
  kind: ObjKind;
  /** индекс в массиве или имя точки появления */
  ref: number | string;
}

const LAYERS: Layer[] = ['ground', 'objects', 'overhead'];
const LAYER_LABELS: Record<Layer, string> = { ground: 'Земля', objects: 'Объекты', overhead: 'Над головой' };
const TOOLS: [Tool, string][] = [['paint', 'Кисть'], ['erase', 'Ластик'], ['fill', 'Заливка'], ['pick', 'Пипетка'], ['select', 'Выбор/перенос']];
const OBJ_LABELS: Record<ObjKind, string> = { spawn: 'Появление', exit: 'Выход', npc: 'NPC', item: 'Предмет', trigger: 'Триггер' };
const SYMBOL_POOL = 'ABCDEFGIJKMNOPQRUVXYZaehijlmnrtuvyz0123456789!@$&*+<>?/|"\'';

export interface MapEditorCtx {
  mapKeys: string[];
  cutsceneIds: string[];
  dialogueIds: string[];
  onSave: (def: MapDef, isNew: boolean) => Promise<void>;
  onOpenInGame: (def: MapDef, spawn: string) => void;
}

/**
 * Редактор карты: холст с тайлами (три слоя), палитра из tiles.json, объекты (точки появления, выходы,
 * NPC, предметы, триггеры) с формой свойств. Работает с копией MapDef, сохраняет через ctx.onSave.
 */
export class MapEditor {
  readonly root: HTMLElement;
  private model: MapDef;
  private cells: Record<Layer, string[][]>;
  private w = 0;
  private h = 0;
  private layer: Layer = 'ground';
  private tool: Tool = 'paint';
  private tile = 'grass';
  private zoom = 2;
  private sel: Sel | null = null;
  private placing: ObjKind | null = null;
  private hover: { x: number; y: number } | null = null;
  private drag: { sel: Sel; ox: number; oy: number } | null = null;
  private painting = false;
  private tileset: HTMLCanvasElement | HTMLImageElement;
  private sprites = new Map<string, HTMLImageElement | null>();
  private canvas = el('canvas', { class: 'map-canvas' });
  private ctx = this.canvas.getContext('2d')!;
  private props = el('div', { class: 'props' });
  private palette = el('div', { class: 'palette' });
  private toolbar = el('div', { class: 'toolbar' });
  private status = el('div', { class: 'status' });
  private showGrid = true;
  private layerAlpha = true;
  dirty = false;
  private undoStack: string[] = [];
  readonly isNew: boolean;

  constructor(def: MapDef, private ectx: MapEditorCtx, isNew = false) {
    this.isNew = isNew;
    this.model = structuredClone(def);
    this.model.legend = { ...BASE_LEGEND, ...this.model.legend };
    this.cells = { ground: [], objects: [], overhead: [] };
    this.loadCells();
    this.tileset = tilesetCanvas();
    const img = new Image();
    img.onload = () => {
      this.tileset = tilesetCanvas(img); // пустые клетки — заглушками, как в игре
      this.renderPalette(); // палитра уже нарисована заглушками — перерисовать настоящим тайлсетом
      this.draw();
    };
    img.src = '/assets/tiles/tileset.png';

    this.root = el('div', { class: 'map-editor' },
      this.toolbar,
      el('div', { class: 'map-body' },
        el('div', { class: 'map-scroll' }, this.canvas),
        el('div', { class: 'map-side' }, this.props, el('h3', {}, 'Тайлы'), this.palette),
      ),
      this.status,
    );
    this.canvas.addEventListener('mousedown', (e) => this.onDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', () => this.onUp());
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.draw();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.renderToolbar();
    this.renderPalette();
    this.renderProps();
    this.resizeCanvas();
    this.draw();
  }

  get def(): MapDef {
    this.storeCells();
    return this.model;
  }

  // ---------------------------------------------------------------- модель

  private loadCells(): void {
    const m = this.model;
    this.h = m.ground.length;
    this.w = Math.max(...m.ground.map((r) => r.length), 1);
    const toCells = (rows: string[] | undefined, fill: string) =>
      Array.from({ length: this.h }, (_, y) => Array.from({ length: this.w }, (_, x) => rows?.[y]?.[x] ?? fill));
    this.cells.ground = toCells(m.ground, '.');
    this.cells.objects = toCells(m.objects, ' ');
    this.cells.overhead = toCells(m.overhead, ' ');
  }

  private storeCells(): void {
    const m = this.model;
    m.ground = this.cells.ground.map((r) => r.join(''));
    m.objects = this.cells.objects.map((r) => r.join(''));
    const oh = this.cells.overhead.map((r) => r.join(''));
    if (oh.some((r) => r.trim())) m.overhead = oh;
    else delete m.overhead;
  }

  private tileIndex(ch: string): number {
    const name = this.model.legend[ch];
    if (!name || name === 'empty') return -1;
    return TILES[name]?.index ?? -1;
  }

  /** Символ для тайла: из легенды или новый (записывается в легенду карты). */
  private symbolFor(name: string): string {
    if (name === 'empty') return ' ';
    for (const [ch, n] of Object.entries(this.model.legend)) if (n === name) return ch;
    const used = new Set(Object.keys(this.model.legend));
    const ch = [...SYMBOL_POOL].find((c) => !used.has(c)) ?? '?';
    this.model.legend[ch] = name;
    return ch;
  }

  private snapshot(): void {
    this.storeCells();
    this.undoStack.push(JSON.stringify(this.model));
    if (this.undoStack.length > 40) this.undoStack.shift();
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.model = JSON.parse(s);
    this.loadCells();
    this.sel = null;
    this.markDirty();
    this.resizeCanvas();
    this.renderProps();
    this.draw();
  }

  private markDirty(): void {
    this.dirty = true;
    this.status.textContent = `${this.model.key} · ${this.w}×${this.h} · не сохранено (Ctrl+S)`;
  }

  markSaved(): void {
    this.dirty = false;
    this.status.textContent = `${this.model.key} · ${this.w}×${this.h} · сохранено`;
  }

  private resize(w: number, h: number): void {
    if (w < 1 || h < 1 || w > 200 || h > 200) return;
    this.snapshot();
    for (const l of LAYERS) {
      const fill = l === 'ground' ? '.' : ' ';
      const rows = this.cells[l];
      while (rows.length < h) rows.push([]);
      rows.length = h;
      for (let y = 0; y < h; y++) {
        const r = (rows[y] ??= []);
        while (r.length < w) r.push(fill);
        r.length = w;
      }
    }
    this.w = w;
    this.h = h;
    this.markDirty();
    this.resizeCanvas();
    this.renderProps();
    this.draw();
  }

  // ---------------------------------------------------------------- тулбар и палитра

  private renderToolbar(): void {
    clear(this.toolbar);
    const tb = this.toolbar;
    for (const l of LAYERS) tb.appendChild(button(LAYER_LABELS[l], () => this.setLayer(l), `b${this.layer === l ? ' on' : ''}`));
    tb.appendChild(el('span', { class: 'sep' }));
    for (const [t, label] of TOOLS) tb.appendChild(button(label, () => this.setTool(t), `b${this.tool === t ? ' on' : ''}`));
    tb.appendChild(el('span', { class: 'sep' }));
    for (const k of Object.keys(OBJ_LABELS) as ObjKind[]) {
      tb.appendChild(button(`＋ ${OBJ_LABELS[k]}`, () => this.startPlacing(k), `b${this.placing === k ? ' on' : ''}`));
    }
    tb.appendChild(el('span', { class: 'sep' }));
    tb.appendChild(button('Сетка', () => { this.showGrid = !this.showGrid; this.draw(); }, `b${this.showGrid ? ' on' : ''}`));
    tb.appendChild(button('−', () => this.setZoom(this.zoom - 0.5)));
    tb.appendChild(el('span', { class: 'zoom' }, `${this.zoom}×`));
    tb.appendChild(button('+', () => this.setZoom(this.zoom + 0.5)));
    tb.appendChild(button('Отменить', () => this.undo()));
    tb.appendChild(el('span', { style: { flex: '1' } }));
    const spawnSel = select(Object.keys(this.model.spawns), Object.keys(this.model.spawns)[0] ?? '', () => {});
    tb.appendChild(el('span', { class: 'dim' }, 'Тест: появиться в '));
    tb.appendChild(spawnSel);
    tb.appendChild(button('▶ В игре', () => this.ectx.onOpenInGame(this.def, spawnSel.value)));
    tb.appendChild(button('Сохранить', () => void this.save(), 'b p'));
  }

  private setLayer(l: Layer): void {
    this.layer = l;
    if (this.tool === 'select') this.tool = 'paint';
    this.placing = null;
    this.renderToolbar();
    this.draw();
  }

  private setTool(t: Tool): void {
    this.tool = t;
    this.placing = null;
    this.renderToolbar();
  }

  private startPlacing(k: ObjKind): void {
    this.placing = this.placing === k ? null : k;
    this.tool = 'select';
    this.renderToolbar();
  }

  private setZoom(z: number): void {
    this.zoom = Math.min(4, Math.max(1, z));
    this.renderToolbar();
    this.resizeCanvas();
    this.draw();
  }

  private renderPalette(): void {
    clear(this.palette);
    for (const t of TILE_LIST) {
      const c = el('canvas', { width: TILE, height: TILE });
      const cx = c.getContext('2d')!;
      cx.imageSmoothingEnabled = false;
      if (t.name !== 'empty') this.blit(cx, t.index, 0, 0, 1);
      const sym = Object.entries(this.model.legend).find(([, n]) => n === t.name)?.[0];
      const item = el('div', { class: `pt${this.tile === t.name ? ' on' : ''}`, title: `${t.name}${t.solid ? ' (стена)' : ''}${t.top ? ` +${t.top}` : ''}`, onClick: () => {
        this.tile = t.name;
        if (this.tool !== 'paint' && this.tool !== 'fill') this.setTool('paint');
        this.renderPalette();
      } }, c, el('span', {}, t.name), el('b', {}, sym ?? '·'));
      this.palette.appendChild(item);
    }
  }

  // ---------------------------------------------------------------- свойства

  private renderProps(): void {
    clear(this.props);
    const p = this.props;
    const m = this.model;
    p.appendChild(el('h3', {}, 'Карта'));
    p.appendChild(field('key (имя файла)', input(m.key, (v) => { m.key = v.trim(); this.markDirty(); }, { disabled: !this.isNew })));
    p.appendChild(field('Название', input(m.title, (v) => { m.title = v; this.markDirty(); })));
    p.appendChild(field('Фон', input(`#${(m.bg ?? 0).toString(16).padStart(6, '0')}`, (v) => { m.bg = parseInt(v.replace('#', ''), 16) || 0; this.markDirty(); this.draw(); }, { type: 'color' })));
    p.appendChild(field('Музыка', select(['', ...Object.keys(MUSIC)], m.music ?? '', (v) => { if (v) m.music = v; else delete m.music; this.markDirty(); })));
    p.appendChild(field('Катсцены при входе (через запятую)', input((m.onEnter ?? []).join(', '), (v) => { const l = v.split(',').map((s) => s.trim()).filter(Boolean); if (l.length) m.onEnter = l; else delete m.onEnter; this.markDirty(); }, { list: 'cutscene-ids' })));
    p.appendChild(el('div', { class: 'row' },
      field('Ширина', input(this.w, (v) => this.resize(Number(v) || this.w, this.h), { type: 'number', min: 1, max: 200 })),
      field('Высота', input(this.h, (v) => this.resize(this.w, Number(v) || this.h), { type: 'number', min: 1, max: 200 })),
    ));

    const s = this.sel;
    if (!s) {
      p.appendChild(el('p', { class: 'dim' }, 'Выбери объект на карте (инструмент «Выбор») или добавь новый кнопками ＋.'));
      return;
    }
    p.appendChild(el('h3', {}, OBJ_LABELS[s.kind]));
    const upd = () => {
      this.markDirty();
      this.draw();
    };
    const dirSel = (v: Dir | undefined, set: (d: Dir | undefined) => void) => select(['', ...DIRS], v ?? '', (x) => { set((x || undefined) as Dir | undefined); upd(); });
    const flags = (v: string[] | undefined, set: (l: string[] | undefined) => void) =>
      input((v ?? []).join(', '), (x) => { const l = x.split(',').map((t) => t.trim()).filter(Boolean); set(l.length ? l : undefined); upd(); }, { placeholder: 'flag, !flag' });
    const num = (v: number | undefined, set: (n: number | undefined) => void, opt = false) =>
      input(v ?? '', (x) => { set(x === '' && opt ? undefined : Number(x) || 0); upd(); }, { type: 'number' });
    const txt = (v: string | undefined, set: (t: string | undefined) => void, attrs: Record<string, unknown> = {}) =>
      input(v ?? '', (x) => { set(x.trim() || undefined); upd(); }, attrs);

    if (s.kind === 'spawn') {
      const name = s.ref as string;
      const sp = m.spawns[name];
      p.appendChild(field('Имя', input(name, (v) => {
        const n = v.trim();
        if (!n || n === name) return;
        delete m.spawns[name];
        m.spawns[n] = sp;
        this.sel = { kind: 'spawn', ref: n };
        this.renderToolbar();
        upd();
        this.renderProps();
      })));
      p.appendChild(el('div', { class: 'row' }, field('x', num(sp.x, (n) => (sp.x = n ?? 0))), field('y', num(sp.y, (n) => (sp.y = n ?? 0)))));
      p.appendChild(field('Куда смотрит', dirSel(sp.dir, (d) => { if (d) sp.dir = d; else delete sp.dir; })));
      p.appendChild(button('Удалить', () => { delete m.spawns[name]; this.sel = null; this.renderToolbar(); upd(); this.renderProps(); }, 'b danger'));
      return;
    }
    if (s.kind === 'exit') {
      const e = m.exits![s.ref as number];
      p.appendChild(el('div', { class: 'row' }, field('x', num(e.x, (n) => (e.x = n ?? 0))), field('y', num(e.y, (n) => (e.y = n ?? 0))), field('w', num(e.w, (n) => (e.w = n), true)), field('h', num(e.h, (n) => (e.h = n), true))));
      p.appendChild(field('На карту', select(this.ectx.mapKeys, e.to, (v) => { e.to = v; upd(); })));
      p.appendChild(field('Точка появления там', txt(e.spawn, (t) => (e.spawn = t ?? 'start'))));
      p.appendChild(button('Удалить', () => { m.exits!.splice(s.ref as number, 1); this.sel = null; upd(); this.renderProps(); }, 'b danger'));
      return;
    }
    if (s.kind === 'trigger') {
      const t = m.triggers![s.ref as number];
      p.appendChild(field('id', txt(t.id, (v) => (t.id = v ?? 'trigger'))));
      p.appendChild(el('div', { class: 'row' }, field('x', num(t.x, (n) => (t.x = n ?? 0))), field('y', num(t.y, (n) => (t.y = n ?? 0))), field('w', num(t.w, (n) => (t.w = n), true)), field('h', num(t.h, (n) => (t.h = n), true))));
      p.appendChild(field('Катсцена', txt(t.cutscene, (v) => (t.cutscene = v ?? ''), { list: 'cutscene-ids' })));
      p.appendChild(field('Условия if', flags(t.if, (l) => (t.if = l))));
      p.appendChild(button('Удалить', () => { m.triggers!.splice(s.ref as number, 1); this.sel = null; upd(); this.renderProps(); }, 'b danger'));
      return;
    }
    if (s.kind === 'npc') {
      const n = m.npcs![s.ref as number];
      p.appendChild(field('id', txt(n.id, (v) => (n.id = v ?? 'npc'))));
      p.appendChild(field('Спрайт', select(Object.values(CHARACTERS).map((c) => c.sprite), n.sprite, (v) => { n.sprite = v; upd(); })));
      p.appendChild(el('div', { class: 'row' }, field('x', num(n.x, (v) => (n.x = v ?? 0))), field('y', num(n.y, (v) => (n.y = v ?? 0)))));
      p.appendChild(field('Куда смотрит', dirSel(n.dir, (d) => { if (d) n.dir = d; else delete n.dir; })));
      p.appendChild(field('Диалог', txt(n.dialogue, (v) => (n.dialogue = v), { list: 'dialogue-ids' })));
      p.appendChild(field('или катсцена', txt(n.cutscene, (v) => (n.cutscene = v), { list: 'cutscene-ids' })));
      p.appendChild(field('Условия if', flags(n.if, (l) => (n.if = l))));
      p.appendChild(button('Удалить', () => { m.npcs!.splice(s.ref as number, 1); this.sel = null; upd(); this.renderProps(); }, 'b danger'));
      return;
    }
    if (s.kind === 'item') {
      const it = m.items![s.ref as number];
      p.appendChild(field('id', txt(it.id, (v) => (it.id = v ?? 'item'))));
      p.appendChild(field('Спрайт (ключ текстуры)', txt(it.sprite, (v) => (it.sprite = v ?? 'prop_gift'), { placeholder: 'prop_camera, prop_gift, prop_easel...' })));
      p.appendChild(el('div', { class: 'row' }, field('x', num(it.x, (v) => (it.x = v ?? 0))), field('y', num(it.y, (v) => (it.y = v ?? 0)))));
      p.appendChild(field('Диалог', txt(it.dialogue, (v) => (it.dialogue = v), { list: 'dialogue-ids' })));
      p.appendChild(field('или катсцена', txt(it.cutscene, (v) => (it.cutscene = v), { list: 'cutscene-ids' })));
      p.appendChild(el('div', { class: 'row' },
        field('Забирается', checkbox(!!it.pickup, (v) => { if (v) it.pickup = true; else delete it.pickup; upd(); })),
        field('Проходимый', checkbox(!!it.passable, (v) => { if (v) it.passable = true; else delete it.passable; upd(); })),
        field('Коробка-подарок', checkbox(!!it.gift, (v) => { if (v) it.gift = { item: 'camera' }; else delete it.gift; upd(); this.renderProps(); })),
      ));
      if (it.gift) {
        const g = it.gift;
        p.appendChild(field('Предмет внутри', txt(g.item, (v) => (g.item = v ?? 'camera')), 'camera, vinyl, headphones, dyson, drawn (нарисованный)'));
        p.appendChild(field('Забирается при флаге', txt(g.unlock, (v) => (g.unlock = v)), 'например minigame:rhythm:won; пусто — сразу'));
        p.appendChild(field('Диалог, пока заперта', txt(g.lockedDialogue, (v) => (g.lockedDialogue = v), { list: 'dialogue-ids' })));
      }
      p.appendChild(field('Условия if', flags(it.if, (l) => (it.if = l))));
      p.appendChild(button('Удалить', () => { m.items!.splice(s.ref as number, 1); this.sel = null; upd(); this.renderProps(); }, 'b danger'));
    }
  }

  // ---------------------------------------------------------------- мышь

  private cellAt(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const s = TILE * this.zoom;
    return { x: Math.floor((e.clientX - r.left) / s), y: Math.floor((e.clientY - r.top) / s) };
  }

  private onDown(e: MouseEvent): void {
    const c = this.cellAt(e);
    if (c.x < 0 || c.y < 0 || c.x >= this.w || c.y >= this.h) return;
    if (e.button === 2) {
      this.pick(c);
      return;
    }
    if (this.placing) {
      this.snapshot();
      this.addObject(this.placing, c);
      this.placing = null;
      this.renderToolbar();
      return;
    }
    if (this.tool === 'select') {
      const hit = this.hitTest(c);
      this.sel = hit;
      if (hit) this.drag = { sel: hit, ox: c.x, oy: c.y };
      this.renderProps();
      this.draw();
      return;
    }
    if (this.tool === 'pick') {
      this.pick(c);
      return;
    }
    this.snapshot();
    this.painting = true;
    this.applyTool(c);
  }

  private onMove(e: MouseEvent): void {
    const c = this.cellAt(e);
    this.hover = c.x >= 0 && c.y >= 0 && c.x < this.w && c.y < this.h ? c : null;
    if (this.painting && this.hover && (this.tool === 'paint' || this.tool === 'erase')) this.applyTool(c);
    if (this.drag && this.hover) {
      const dx = c.x - this.drag.ox;
      const dy = c.y - this.drag.oy;
      if (dx || dy) {
        this.moveObject(this.drag.sel, dx, dy);
        this.drag.ox = c.x;
        this.drag.oy = c.y;
        this.renderProps();
      }
    }
    this.draw();
  }

  private onUp(): void {
    this.painting = false;
    this.drag = null;
  }

  private pick(c: { x: number; y: number }): void {
    for (const l of [...LAYERS].reverse()) {
      const ch = this.cells[l][c.y][c.x];
      const name = this.model.legend[ch];
      if (name && name !== 'empty') {
        this.tile = name;
        this.layer = l;
        this.setTool('paint');
        this.renderPalette();
        return;
      }
    }
  }

  private applyTool(c: { x: number; y: number }): void {
    const rows = this.cells[this.layer];
    const empty = this.layer === 'ground' ? '.' : ' ';
    if (this.tool === 'paint') {
      const ch = this.symbolFor(this.tile);
      if (rows[c.y][c.x] === ch) return;
      rows[c.y][c.x] = ch;
    } else if (this.tool === 'erase') {
      rows[c.y][c.x] = empty;
    } else if (this.tool === 'fill') {
      const target = rows[c.y][c.x];
      const ch = this.symbolFor(this.tile);
      if (target === ch) return;
      const stack = [[c.x, c.y]];
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h || rows[y][x] !== target) continue;
        rows[y][x] = ch;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }
    this.markDirty();
    this.draw();
  }

  private hitTest(c: { x: number; y: number }): Sel | null {
    const m = this.model;
    const inRect = (o: { x: number; y: number; w?: number; h?: number }) => c.x >= o.x && c.x < o.x + (o.w ?? 1) && c.y >= o.y && c.y < o.y + (o.h ?? 1);
    for (let i = (m.npcs ?? []).length - 1; i >= 0; i--) if (m.npcs![i].x === c.x && m.npcs![i].y === c.y) return { kind: 'npc', ref: i };
    for (let i = (m.items ?? []).length - 1; i >= 0; i--) if (m.items![i].x === c.x && m.items![i].y === c.y) return { kind: 'item', ref: i };
    for (const [n, s] of Object.entries(m.spawns)) if (s.x === c.x && s.y === c.y) return { kind: 'spawn', ref: n };
    for (let i = (m.exits ?? []).length - 1; i >= 0; i--) if (inRect(m.exits![i])) return { kind: 'exit', ref: i };
    for (let i = (m.triggers ?? []).length - 1; i >= 0; i--) if (inRect(m.triggers![i])) return { kind: 'trigger', ref: i };
    return null;
  }

  private moveObject(s: Sel, dx: number, dy: number): void {
    const m = this.model;
    const o =
      s.kind === 'spawn' ? m.spawns[s.ref as string] :
      s.kind === 'exit' ? m.exits![s.ref as number] :
      s.kind === 'trigger' ? m.triggers![s.ref as number] :
      s.kind === 'npc' ? m.npcs![s.ref as number] : m.items![s.ref as number];
    if (!o) return;
    o.x += dx;
    o.y += dy;
    this.markDirty();
  }

  private addObject(k: ObjKind, c: { x: number; y: number }): void {
    const m = this.model;
    if (k === 'spawn') {
      let n = 'spawn';
      let i = 1;
      while (m.spawns[n]) n = `spawn${i++}`;
      m.spawns[n] = { x: c.x, y: c.y, dir: 'down' };
      this.sel = { kind: 'spawn', ref: n };
    } else if (k === 'exit') {
      (m.exits ??= []).push({ x: c.x, y: c.y, w: 1, h: 1, to: this.ectx.mapKeys.find((x) => x !== m.key) ?? m.key, spawn: 'start' });
      this.sel = { kind: 'exit', ref: m.exits.length - 1 };
    } else if (k === 'trigger') {
      const t: MapTrigger = { id: `trigger${(m.triggers?.length ?? 0) + 1}`, x: c.x, y: c.y, w: 1, h: 1, cutscene: '' };
      (m.triggers ??= []).push(t);
      this.sel = { kind: 'trigger', ref: m.triggers.length - 1 };
    } else if (k === 'npc') {
      const n: MapNpc = { id: `npc${(m.npcs?.length ?? 0) + 1}`, sprite: 'freya', x: c.x, y: c.y, dir: 'down' };
      (m.npcs ??= []).push(n);
      this.sel = { kind: 'npc', ref: m.npcs.length - 1 };
    } else {
      const it: MapItem = { id: `item${(m.items?.length ?? 0) + 1}`, sprite: 'prop_gift', x: c.x, y: c.y };
      (m.items ??= []).push(it);
      this.sel = { kind: 'item', ref: m.items.length - 1 };
    }
    this.markDirty();
    this.renderProps();
    this.draw();
  }

  // ---------------------------------------------------------------- отрисовка

  private resizeCanvas(): void {
    const s = TILE * this.zoom;
    this.canvas.width = this.w * s;
    this.canvas.height = this.h * s;
    this.canvas.style.width = `${this.w * s}px`;
    this.canvas.style.height = `${this.h * s}px`;
  }

  private blit(cx: CanvasRenderingContext2D, index: number, dx: number, dy: number, scale: number): void {
    const sx = (index % TILESET_COLUMNS) * TILE;
    const sy = Math.floor(index / TILESET_COLUMNS) * TILE;
    cx.drawImage(this.tileset, sx, sy, TILE, TILE, dx, dy, TILE * scale, TILE * scale);
  }

  private sprite(url: string): HTMLImageElement | null {
    if (this.sprites.has(url)) return this.sprites.get(url)!;
    this.sprites.set(url, null);
    const img = new Image();
    img.onload = () => {
      this.sprites.set(url, img);
      this.draw();
    };
    img.onerror = () => this.sprites.set(url, null);
    img.src = url;
    return null;
  }

  draw(): void {
    const cx = this.ctx;
    const z = this.zoom;
    const s = TILE * z;
    cx.imageSmoothingEnabled = false;
    cx.fillStyle = `#${(this.model.bg ?? 0).toString(16).padStart(6, '0')}`;
    cx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const drawLayer = (l: Layer, alpha: number) => {
      cx.globalAlpha = alpha;
      const rows = this.cells[l];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const idx = this.tileIndex(rows[y][x]);
          if (idx >= 0) this.blit(cx, idx, x * s, y * s, z);
          // авто-кроны: тайл с top рисуется строкой выше (как в MapLoader)
          if (l === 'objects' && idx >= 0) {
            const top = TILE_LIST[idx].top;
            if (top && y > 0 && this.tileIndex(this.cells.overhead[y - 1][x]) < 0) this.blit(cx, TILES[top].index, x * s, (y - 1) * s, z);
          }
        }
      }
      cx.globalAlpha = 1;
    };
    const dim = (l: Layer) => (this.layerAlpha && this.tool !== 'select' && l !== this.layer ? 0.55 : 1);
    drawLayer('ground', dim('ground'));
    drawLayer('objects', dim('objects'));
    // объекты
    const m = this.model;
    const label = (text: string, x: number, y: number, color: string) => {
      cx.font = `${Math.max(9, 5 * z)}px system-ui, sans-serif`;
      cx.fillStyle = 'rgba(0,0,0,.6)';
      const w = cx.measureText(text).width + 4;
      cx.fillRect(x, y - 10, w, 12);
      cx.fillStyle = color;
      cx.fillText(text, x + 2, y);
    };
    const rect = (o: { x: number; y: number; w?: number; h?: number }, color: string) => {
      cx.fillStyle = color;
      cx.globalAlpha = 0.3;
      cx.fillRect(o.x * s, o.y * s, (o.w ?? 1) * s, (o.h ?? 1) * s);
      cx.globalAlpha = 1;
      cx.strokeStyle = color;
      cx.lineWidth = 2;
      cx.strokeRect(o.x * s + 1, o.y * s + 1, (o.w ?? 1) * s - 2, (o.h ?? 1) * s - 2);
    };
    for (const e of m.exits ?? []) {
      rect(e, '#43b5e6');
      label(`→ ${e.to}:${e.spawn}`, e.x * s, e.y * s + 12, '#bfe7ff');
    }
    for (const t of m.triggers ?? []) {
      rect(t, '#f2a24d');
      label(`⚡ ${t.id}`, t.x * s, t.y * s + 12, '#ffe0b8');
    }
    for (const it of m.items ?? []) {
      const img = this.sprite(`/assets/props/${it.sprite.replace(/^prop_/, '')}.png`);
      const bx = it.x * s;
      const by = it.y * s;
      if (img) cx.drawImage(img, bx + (s - img.width * z) / 2, by + s - img.height * z, img.width * z, img.height * z);
      else {
        cx.fillStyle = it.gift ? '#d9605f' : '#b58a55';
        cx.fillRect(bx + s * 0.2, by + s * 0.3, s * 0.6, s * 0.6);
        cx.strokeStyle = '#fff';
        cx.strokeRect(bx + s * 0.2, by + s * 0.3, s * 0.6, s * 0.6);
      }
      label(it.gift ? `🎁 ${it.id}` : it.id, bx, by + s - 2, '#fff');
    }
    for (const n of m.npcs ?? []) {
      const ch = Object.values(CHARACTERS).find((c) => c.sprite === n.sprite);
      const fw = ch?.frame.w ?? 32;
      const fh = ch?.frame.h ?? 32;
      const img = this.sprite(`/assets/characters/${n.sprite}.png`);
      const bx = n.x * s + s / 2;
      const by = (n.y + 1) * s;
      if (img) {
        const row = DIRS.indexOf(n.dir ?? 'down');
        cx.drawImage(img, IDLE_FRAME * fw, Math.max(0, row) * fh, fw, fh, bx - (fw * z) / 2, by - fh * z, fw * z, fh * z);
      } else {
        cx.fillStyle = `#${(ch?.color ?? 0x888888).toString(16).padStart(6, '0')}`;
        cx.fillRect(bx - (fw * z) / 3, by - fh * z * 0.9, (fw * z) / 1.5, fh * z * 0.9);
      }
      label(n.id, n.x * s, by - 2, '#fff');
    }
    for (const [name, sp] of Object.entries(m.spawns)) {
      cx.fillStyle = '#8fd19e';
      cx.beginPath();
      cx.arc(sp.x * s + s / 2, sp.y * s + s / 2, s * 0.22, 0, Math.PI * 2);
      cx.fill();
      label(`● ${name}`, sp.x * s, sp.y * s + 12, '#d9ffe0');
    }
    drawLayer('overhead', dim('overhead'));
    // сетка
    if (this.showGrid) {
      cx.strokeStyle = 'rgba(255,255,255,.12)';
      cx.lineWidth = 1;
      for (let x = 0; x <= this.w; x++) {
        cx.beginPath();
        cx.moveTo(x * s + 0.5, 0);
        cx.lineTo(x * s + 0.5, this.h * s);
        cx.stroke();
      }
      for (let y = 0; y <= this.h; y++) {
        cx.beginPath();
        cx.moveTo(0, y * s + 0.5);
        cx.lineTo(this.w * s, y * s + 0.5);
        cx.stroke();
      }
    }
    // выделение и наведение
    if (this.sel) {
      const o = this.selRect(this.sel);
      if (o) {
        cx.strokeStyle = '#f7d34a';
        cx.lineWidth = 3;
        cx.strokeRect(o.x * s + 1.5, o.y * s + 1.5, (o.w ?? 1) * s - 3, (o.h ?? 1) * s - 3);
      }
    }
    if (this.hover) {
      cx.strokeStyle = 'rgba(255,255,255,.8)';
      cx.lineWidth = 1;
      cx.strokeRect(this.hover.x * s + 0.5, this.hover.y * s + 0.5, s - 1, s - 1);
      if ((this.tool === 'paint' || this.tool === 'fill') && this.tile !== 'empty') {
        cx.globalAlpha = 0.6;
        this.blit(cx, TILES[this.tile].index, this.hover.x * s, this.hover.y * s, z);
        cx.globalAlpha = 1;
      }
    }
  }

  private selRect(s: Sel): { x: number; y: number; w?: number; h?: number } | undefined {
    const m = this.model;
    switch (s.kind) {
      case 'spawn':
        return m.spawns[s.ref as string];
      case 'exit':
        return m.exits?.[s.ref as number];
      case 'trigger':
        return m.triggers?.[s.ref as number];
      case 'npc':
        return m.npcs?.[s.ref as number];
      case 'item':
        return m.items?.[s.ref as number];
    }
  }

  async save(): Promise<void> {
    this.storeCells();
    if (!/^[a-z_][a-z0-9_]*$/i.test(this.model.key)) throw new Error('key карты — латиница/цифры/подчёркивание');
    await this.ectx.onSave(this.model, this.isNew);
    this.markSaved();
  }

  destroy(): void {
    window.removeEventListener('mouseup', () => this.onUp());
    this.root.remove();
  }
}

/** Пустая карта для «＋ карта». */
export function blankMap(key: string): MapDef {
  const w = 16;
  const h = 9;
  return {
    key,
    title: key,
    bg: 0x1b2a1b,
    legend: { ...BASE_LEGEND },
    ground: Array.from({ length: h }, () => '.'.repeat(w)),
    objects: Array.from({ length: h }, () => ' '.repeat(w)),
    spawns: { start: { x: Math.floor(w / 2), y: Math.floor(h / 2), dir: 'down' } },
    exits: [],
    npcs: [],
    items: [],
    triggers: [],
  };
}

export { append };
