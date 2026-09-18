import type { Cutscene, CutsceneCmd } from '../types';
import { CMD_KINDS, kindOf, getPath, setPath, parseField, formatField, type CmdKind } from './schema';
import { el, clear, field, select, input, checkbox, button } from './dom';
import { hasCall } from './serialize';

export interface CutsceneEditorCtx {
  mapKeys: string[];
  spawnsOf: (map: string) => string[];
  onSave: (cs: Cutscene) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPlay: (cs: Cutscene, map: string, spawn: string) => void;
}

/**
 * Редактор катсцены: шапка (id, once, if) и список команд-карточек по схеме CMD_KINDS.
 * parallel/branch — вложенные списки. Работает с копией; сохраняет через ctx.onSave.
 */
export class CutsceneEditor {
  readonly root: HTMLElement;
  private cs: Cutscene;
  private list = el('div', { class: 'cmds' });
  private head = el('div', { class: 'cs-head' });
  private status = el('div', { class: 'status' });
  dirty = false;
  readonly isNew: boolean;

  constructor(cs: Cutscene, private ectx: CutsceneEditorCtx, isNew = false, private editable = true) {
    this.isNew = isNew;
    this.cs = cloneCutscene(cs);
    this.root = el('div', { class: 'cs-editor' }, this.head, this.list, this.status);
    this.renderHead();
    this.renderList();
    this.status.textContent = editable ? '' : 'В скрипте есть call (код) — эта катсцена правится в src/data/cutscenes/index.ts, здесь только просмотр.';
  }

  private markDirty(): void {
    this.dirty = true;
    this.status.textContent = 'не сохранено (Ctrl+S)';
  }

  private renderHead(): void {
    clear(this.head);
    const cs = this.cs;
    const mapSel = select(this.ectx.mapKeys, sessionStorage.getItem('editor.playMap') ?? this.ectx.mapKeys[0], (v) => {
      sessionStorage.setItem('editor.playMap', v);
      spawnSel.replaceChildren(...this.ectx.spawnsOf(v).map((s) => el('option', { value: s }, s)));
    });
    const spawns = this.ectx.spawnsOf(mapSel.value);
    const storedSpawn = sessionStorage.getItem('editor.playSpawn') ?? '';
    const spawnSel = select(spawns, spawns.includes(storedSpawn) ? storedSpawn : spawns[0] ?? '', (v) => sessionStorage.setItem('editor.playSpawn', v));
    this.head.append(
      el('div', { class: 'row' },
        field('id', input(cs.id, (v) => { cs.id = v.trim(); this.markDirty(); }, { disabled: !this.isNew })),
        field('Один раз (once)', checkbox(!!cs.once, (v) => { if (v) cs.once = true; else delete cs.once; this.markDirty(); })),
        field('Условия if (через запятую)', input((cs.if ?? []).join(', '), (v) => { const l = v.split(',').map((s) => s.trim()).filter(Boolean); if (l.length) cs.if = l; else delete cs.if; this.markDirty(); }, { placeholder: 'flag, !flag' })),
      ),
      el('div', { class: 'row' },
        el('span', { class: 'dim' }, 'Проиграть в игре: карта'),
        mapSel,
        el('span', { class: 'dim' }, 'точка'),
        spawnSel,
        button('▶ Проиграть', () => this.ectx.onPlay(this.cs, mapSel.value, spawnSel.value)),
        el('span', { style: { flex: '1' } }),
        this.editable ? button('Сохранить', () => void this.save(), 'b p') : null,
        !this.isNew && this.editable ? button('Удалить из edited.ts', () => void this.ectx.onDelete(cs.id), 'b danger') : null,
      ),
    );
  }

  private renderList(): void {
    clear(this.list);
    this.list.appendChild(this.renderCmds(this.cs.script, 0));
  }

  /** Список команд с кнопками порядка/удаления и добавлением в конец. */
  private renderCmds(arr: CutsceneCmd[], depth: number): HTMLElement {
    const box = el('div', { class: 'cmd-list', dataset: { depth: String(depth) } });
    arr.forEach((cmd, i) => box.appendChild(this.renderCmd(arr, i, depth)));
    box.appendChild(this.addRow(arr, arr.length));
    return box;
  }

  private addRow(arr: CutsceneCmd[], at: number): HTMLElement {
    const groups = [...new Set(CMD_KINDS.map((k) => k.group))];
    const sel = el('select', { class: 'add-sel' }, el('option', { value: '' }, '＋ добавить команду…'));
    for (const g of groups) {
      const og = el('optgroup', { label: g });
      for (const k of CMD_KINDS.filter((x) => x.group === g && x.kind !== 'call')) og.appendChild(el('option', { value: k.kind }, k.label));
      sel.appendChild(og);
    }
    sel.addEventListener('change', () => {
      const k = CMD_KINDS.find((x) => x.kind === sel.value);
      if (!k) return;
      arr.splice(at, 0, k.make());
      this.markDirty();
      this.renderList();
    });
    return el('div', { class: 'add-row' }, sel);
  }

  private renderCmd(arr: CutsceneCmd[], i: number, depth: number): HTMLElement {
    const cmd = arr[i];
    const kind = kindOf(cmd);
    const card = el('div', { class: `cmd${kind?.kind === 'branch' || kind?.kind === 'parallel' ? ' nest' : ''}` });
    const head = el('div', { class: 'cmd-head' },
      el('span', { class: 'num' }, `${i + 1}`),
      this.kindSelect(kind, (k) => {
        arr[i] = k.make();
        this.markDirty();
        this.renderList();
      }),
      el('span', { style: { flex: '1' } }),
      button('↑', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; this.markDirty(); this.renderList(); } }, 'b sm'),
      button('↓', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; this.markDirty(); this.renderList(); } }, 'b sm'),
      button('⧉', () => { arr.splice(i + 1, 0, structuredClone(cmd)); this.markDirty(); this.renderList(); }, 'b sm'),
      button('✕', () => { arr.splice(i, 1); this.markDirty(); this.renderList(); }, 'b sm danger'),
    );
    card.appendChild(head);
    if (!kind) {
      card.appendChild(el('pre', {}, JSON.stringify(cmd)));
      return card;
    }
    if (kind.kind === 'call') {
      card.appendChild(el('div', { class: 'dim' }, 'Произвольный код — правится в src/data/cutscenes/index.ts'));
      return card;
    }
    const fields = el('div', { class: 'cmd-fields' });
    for (const f of kind.fields) {
      const v = getPath(cmd, f.path);
      let inp: HTMLElement;
      const set = (raw: string | boolean) => {
        setPath(cmd, f.path, parseField(f, raw));
        this.markDirty();
      };
      if (f.type === 'bool') inp = checkbox(v === true, set);
      else if (f.type === 'select') inp = select(f.options!(), formatField(f, v), set);
      else if (f.type === 'textarea') inp = el('textarea', { rows: 2, onChange: (e: Event) => set((e.target as HTMLTextAreaElement).value) }, formatField(f, v));
      else inp = input(formatField(f, v), set, { type: f.type === 'number' ? 'number' : 'text', step: 'any', placeholder: f.hint ?? '' });
      fields.appendChild(field(f.label, inp, f.hint && f.type !== 'text' ? f.hint : undefined));
    }
    card.appendChild(fields);
    if ('parallel' in cmd) card.appendChild(el('div', { class: 'nested' }, el('div', { class: 'nest-label' }, 'одновременно:'), this.renderCmds(cmd.parallel, depth + 1)));
    if ('branch' in cmd) {
      cmd.branch.else ??= [];
      card.appendChild(el('div', { class: 'nested' }, el('div', { class: 'nest-label' }, 'если условия выполнены:'), this.renderCmds(cmd.branch.then, depth + 1)));
      card.appendChild(el('div', { class: 'nested' }, el('div', { class: 'nest-label' }, 'иначе:'), this.renderCmds(cmd.branch.else, depth + 1)));
    }
    return card;
  }

  private kindSelect(current: CmdKind | undefined, onChange: (k: CmdKind) => void): HTMLSelectElement {
    const sel = el('select', { class: 'kind-sel' });
    const groups = [...new Set(CMD_KINDS.map((k) => k.group))];
    for (const g of groups) {
      const og = el('optgroup', { label: g });
      for (const k of CMD_KINDS.filter((x) => x.group === g)) og.appendChild(el('option', { value: k.kind, selected: k === current }, k.label));
      sel.appendChild(og);
    }
    sel.addEventListener('change', () => {
      const k = CMD_KINDS.find((x) => x.kind === sel.value);
      if (k && k !== current && confirm('Сменить вид команды? Поля сбросятся.')) onChange(k);
      else sel.value = current?.kind ?? '';
    });
    return sel;
  }

  get value(): Cutscene {
    const cs = cloneCutscene(this.cs);
    if (cs.once === undefined) delete cs.once;
    if (cs.if === undefined) delete cs.if;
    return cs;
  }

  async save(): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/i.test(this.cs.id)) throw new Error('id катсцены — латиница/цифры/подчёркивание');
    if (hasCall(this.cs.script)) throw new Error('в скрипте есть call — сохранить из редактора нельзя');
    await this.ectx.onSave(this.value);
    this.dirty = false;
    this.status.textContent = 'сохранено';
  }
}

/** Копия катсцены (функции call остаются по ссылке). */
export function cloneCutscene(cs: Cutscene): Cutscene {
  const cloneCmd = (c: CutsceneCmd): CutsceneCmd => {
    if ('call' in c) return c;
    if ('parallel' in c) return { parallel: c.parallel.map(cloneCmd) };
    if ('branch' in c) return { branch: { if: [...c.branch.if], then: c.branch.then.map(cloneCmd), else: c.branch.else?.map(cloneCmd) } };
    return structuredClone(c);
  };
  return { id: cs.id, once: cs.once, if: cs.if ? [...cs.if] : undefined, script: cs.script.map(cloneCmd) };
}
