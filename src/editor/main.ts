import './style.css';
import type { Cutscene, DialogueLine, MapDef } from '../types';
import { MAPS } from '../data/maps';
import { HANDMADE_CUTSCENES } from '../data/cutscenes';
import { EDITED_CUTSCENES } from '../data/cutscenes/edited';
import { HANDMADE_DIALOGUES } from '../data/dialogues';
import { EDITED_DIALOGUES } from '../data/dialogues/edited';
import { MapEditor, blankMap } from './MapEditor';
import { CutsceneEditor } from './CutsceneEditor';
import { DialogueEditor } from './DialogueEditor';
import { mapToTs, mapsIndexToTs, cutscenesToTs, dialoguesToTs, saveFile, hasCall } from './serialize';
import { el, clear, button, toast } from './dom';

/**
 * Редактор карт, катсцен и диалогов (dev-инструмент): http://localhost:5173/editor.html
 * Данные берутся из тех же модулей, что и игра; сохранение — POST /__editor/save (vite.config.ts) прямо
 * в src/data/*.ts, после чего Vite перезагружает модули и редактор перерисовывается с новыми данными.
 * Карты пишутся в свой файл, катсцены/диалоги — в edited.ts (перекрывают рукописные из index.ts).
 */
type Tab = 'maps' | 'cutscenes' | 'dialogues';
const TAB_LABELS: Record<Tab, string> = { maps: 'Карты', cutscenes: 'Катсцены', dialogues: 'Диалоги' };

const app = document.getElementById('app')!;
clear(app);

let tab = (sessionStorage.getItem('editor.tab') as Tab) || 'maps';
let current: MapEditor | CutsceneEditor | DialogueEditor | null = null;
const sidebar = el('aside', { class: 'sidebar' });
const content = el('main', { class: 'content' });
const gamePane = el('div', { class: 'game-pane hidden' });
const gameFrame = el('iframe', { class: 'game-frame', title: 'игра' });
const tabsEl = el('nav', { class: 'tabs' });
const header = el('header', {},
  el('h1', {}, 'bgame · редактор'),
  tabsEl,
  el('span', { style: { flex: '1' } }),
  button('Игра ▾', () => gamePane.classList.toggle('hidden')),
  el('a', { class: 'b', href: '/', target: '_blank' }, 'Открыть игру'),
);
gamePane.append(
  el('div', { class: 'game-bar' },
    el('span', { class: 'dim' }, 'Превью игры (перезагрузи после сохранения)'),
    button('⟳', () => { gameFrame.src = gameFrame.src; }, 'b sm'),
    button('✕', () => gamePane.classList.add('hidden'), 'b sm'),
  ),
  gameFrame,
);
app.append(header, el('div', { class: 'body' }, sidebar, content), gamePane, el('datalist', { id: 'cutscene-ids' }), el('datalist', { id: 'dialogue-ids' }));

const allCutscenes = (): Record<string, Cutscene> => ({ ...HANDMADE_CUTSCENES, ...EDITED_CUTSCENES });
const allDialogues = () => ({ ...HANDMADE_DIALOGUES, ...EDITED_DIALOGUES });

function fillDatalists(): void {
  const cl = document.getElementById('cutscene-ids')!;
  const dl = document.getElementById('dialogue-ids')!;
  cl.replaceChildren(...Object.keys(allCutscenes()).map((id) => el('option', { value: id })));
  dl.replaceChildren(...Object.keys(allDialogues()).map((id) => el('option', { value: id })));
}

function openGame(query: string): void {
  gamePane.classList.remove('hidden');
  gameFrame.src = `/?${query}`;
}

async function guarded(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(String((e as Error).message ?? e), false);
  }
}

// ---------------------------------------------------------------- вкладки и списки

function renderTabs(): void {
  clear(tabsEl);
  for (const t of Object.keys(TAB_LABELS) as Tab[]) {
    tabsEl.appendChild(button(TAB_LABELS[t], () => setTab(t), `tab${tab === t ? ' active' : ''}`));
  }
}

function setTab(t: Tab): void {
  if (current?.dirty && !confirm('Есть несохранённые изменения. Перейти без сохранения?')) return;
  tab = t;
  sessionStorage.setItem('editor.tab', t);
  renderTabs();
  renderSidebar();
  const sel = sessionStorage.getItem(`editor.sel.${tab}`);
  if (sel) open(sel);
  else clear(content);
}

function renderSidebar(): void {
  clear(sidebar);
  const selKey = sessionStorage.getItem(`editor.sel.${tab}`);
  const entry = (id: string, label: string, note?: string) =>
    el('button', { class: `ent${selKey === id ? ' active' : ''}`, onClick: () => open(id) }, label, note ? el('small', {}, note) : null);
  if (tab === 'maps') {
    sidebar.appendChild(el('h3', {}, 'Карты'));
    for (const k of Object.keys(MAPS)) sidebar.appendChild(entry(k, k, MAPS[k].title));
    sidebar.appendChild(button('＋ карта', () => {
      const key = prompt('key новой карты (латиница, например forest):');
      if (key) openNewMap(key.trim());
    }, 'b sm'));
  } else if (tab === 'cutscenes') {
    sidebar.appendChild(el('h3', {}, 'Катсцены'));
    const all = allCutscenes();
    for (const id of Object.keys(all)) {
      const note = EDITED_CUTSCENES[id] ? 'edited.ts' : hasCall(all[id].script) ? 'код (call)' : 'index.ts';
      sidebar.appendChild(entry(id, id, note));
    }
    sidebar.appendChild(button('＋ катсцена', () => {
      const id = prompt('id новой катсцены:');
      if (id) openNewCutscene(id.trim());
    }, 'b sm'));
  } else {
    sidebar.appendChild(el('h3', {}, 'Диалоги'));
    const all = allDialogues();
    for (const id of Object.keys(all)) {
      const note = EDITED_DIALOGUES[id] ? 'edited.ts' : typeof all[id] === 'function' ? 'функция (код)' : 'index.ts';
      sidebar.appendChild(entry(id, id, note));
    }
    sidebar.appendChild(button('＋ диалог', () => {
      const id = prompt('id нового диалога:');
      if (id) openNewDialogue(id.trim());
    }, 'b sm'));
  }
}

function mount(editor: MapEditor | CutsceneEditor | DialogueEditor): void {
  current = editor;
  clear(content);
  content.appendChild(editor.root);
}

function open(id: string): void {
  if (current?.dirty && sessionStorage.getItem(`editor.sel.${tab}`) !== id && !confirm('Есть несохранённые изменения. Открыть другое без сохранения?')) return;
  sessionStorage.setItem(`editor.sel.${tab}`, id);
  renderSidebar();
  if (tab === 'maps') {
    const def = MAPS[id];
    if (!def) return clear(content);
    mount(new MapEditor(def, mapCtx()));
  } else if (tab === 'cutscenes') {
    const cs = allCutscenes()[id];
    if (!cs) return clear(content);
    mount(new CutsceneEditor(cs, cutsceneCtx(), false, !hasCall(cs.script)));
  } else {
    const d = allDialogues()[id];
    if (!d) return clear(content);
    if (typeof d === 'function') {
      clear(content);
      content.appendChild(el('div', { class: 'card' }, el('h3', {}, id), el('p', { class: 'dim' }, 'Этот диалог — функция от состояния (варианты по флагам). Правится в src/data/dialogues/index.ts.')));
      current = null;
      return;
    }
    mount(new DialogueEditor(id, d, dialogueCtx()));
  }
}

function openNewMap(key: string): void {
  if (MAPS[key]) return void toast('такая карта уже есть', false);
  sessionStorage.setItem(`editor.sel.${tab}`, key);
  mount(new MapEditor(blankMap(key), mapCtx(), true));
}

function openNewCutscene(id: string): void {
  sessionStorage.setItem(`editor.sel.${tab}`, id);
  mount(new CutsceneEditor({ id, script: [{ think: '' }] }, cutsceneCtx(), true));
}

function openNewDialogue(id: string): void {
  sessionStorage.setItem(`editor.sel.${tab}`, id);
  mount(new DialogueEditor(id, [{ who: 'anastasiia', text: '' }], dialogueCtx(), true));
}

// ---------------------------------------------------------------- сохранение

function mapCtx() {
  return {
    mapKeys: Object.keys(MAPS),
    cutsceneIds: Object.keys(allCutscenes()),
    dialogueIds: Object.keys(allDialogues()),
    onSave: async (def: MapDef, isNew: boolean) => {
      await saveFile(`src/data/maps/${def.key}.ts`, mapToTs(def));
      if (isNew || !MAPS[def.key]) await saveFile('src/data/maps/index.ts', mapsIndexToTs([...Object.keys(MAPS), def.key]));
      sessionStorage.setItem('editor.sel.maps', def.key);
      toast(`сохранено: src/data/maps/${def.key}.ts`);
    },
    onOpenInGame: (def: MapDef, spawn: string) =>
      void guarded(async () => {
        if (current?.dirty) await (current as MapEditor).save();
        openGame(`new&map=${def.key}&spawn=${encodeURIComponent(spawn)}`);
      }),
  };
}

function cutsceneCtx() {
  return {
    mapKeys: Object.keys(MAPS),
    spawnsOf: (map: string) => Object.keys(MAPS[map]?.spawns ?? {}),
    onSave: async (cs: Cutscene) => {
      const list = Object.values({ ...EDITED_CUTSCENES, [cs.id]: cs });
      await saveFile('src/data/cutscenes/edited.ts', cutscenesToTs(list));
      sessionStorage.setItem('editor.sel.cutscenes', cs.id);
      toast('сохранено: src/data/cutscenes/edited.ts');
    },
    onDelete: async (id: string) => {
      if (!EDITED_CUTSCENES[id] || !confirm(`Убрать «${id}» из edited.ts?`)) return;
      const rest = { ...EDITED_CUTSCENES };
      delete rest[id];
      await guarded(async () => {
        await saveFile('src/data/cutscenes/edited.ts', cutscenesToTs(Object.values(rest)));
        toast('удалено из edited.ts');
      });
    },
    onPlay: (cs: Cutscene, map: string, spawn: string) =>
      void guarded(async () => {
        if (current?.dirty && current instanceof CutsceneEditor) await current.save();
        openGame(`new&map=${map}&spawn=${encodeURIComponent(spawn)}&cutscene=${encodeURIComponent(cs.id)}`);
      }),
  };
}

function dialogueCtx() {
  return {
    onSave: async (id: string, lines: DialogueLine[]) => {
      await saveFile('src/data/dialogues/edited.ts', dialoguesToTs({ ...EDITED_DIALOGUES, [id]: lines }));
      sessionStorage.setItem('editor.sel.dialogues', id);
      toast('сохранено: src/data/dialogues/edited.ts');
    },
    onDelete: async (id: string) => {
      if (!EDITED_DIALOGUES[id] || !confirm(`Убрать «${id}» из edited.ts?`)) return;
      const rest = { ...EDITED_DIALOGUES };
      delete rest[id];
      await guarded(async () => {
        await saveFile('src/data/dialogues/edited.ts', dialoguesToTs(rest));
        toast('удалено из edited.ts');
      });
    },
  };
}

// Ctrl+S — сохранить текущее
const onKey = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (current) void guarded(() => current!.save());
  }
};
window.addEventListener('keydown', onKey);

renderTabs();
fillDatalists();
setTab(tab);

// после сохранения Vite обновляет модули данных; этот модуль сам принимает обновление и перерисовывается
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => window.removeEventListener('keydown', onKey));
}
