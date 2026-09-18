import type { Cutscene, CutsceneCmd, DialogueLine, MapDef } from '../types';
import { BASE_LEGEND } from '../data/maps/legend';

/**
 * Генерация TS-исходников из данных редактора. Формат повторяет рукописные файлы (одинарные кавычки,
 * ASCII-строки карты по одной в строке с номером), чтобы диффы читались и файл можно было править руками.
 */

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function str(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function key(k: string): string {
  return IDENT.test(k) ? k : str(k);
}

/** Литерал значения. Массивы/объекты печатаются в одну строку (для команд, объектов карты). */
export function lit(v: unknown, hexKeys = false): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number') return hexKeys ? `0x${v.toString(16).padStart(6, '0')}` : String(v);
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => lit(x)).join(', ')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const parts = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .map((k) => `${key(k)}: ${lit(o[k], k === 'bg')}`);
    return parts.length ? `{ ${parts.join(', ')} }` : '{}';
  }
  return String(v);
}

function rows(name: string, list: string[] | undefined, indent = '  '): string {
  if (!list || !list.length) return '';
  const lines = list.map((r, i) => `${indent}  ${str(r)}, // ${i}`);
  return `${indent}${name}: [\n${lines.join('\n')}\n${indent}],\n`;
}

/** Шапка с номерами столбцов, как в рукописных картах. */
function ruler(w: number): string {
  const tens = Array.from({ length: w }, (_, i) => (i >= 10 ? String(Math.floor(i / 10)) : ' ')).join('');
  const ones = Array.from({ length: w }, (_, i) => String(i % 10)).join('');
  return `  //${tens}\n  //${ones}\n`;
}

/** Файл карты src/data/maps/<key>.ts. Легенда: BASE_LEGEND плюс только отличия. */
export function mapToTs(m: MapDef): string {
  const w = Math.max(...m.ground.map((r) => r.length), 1);
  const extra: Record<string, string> = {};
  for (const [ch, name] of Object.entries(m.legend)) if (BASE_LEGEND[ch] !== name) extra[ch] = name;
  const legend = Object.keys(extra).length ? `{ ...BASE_LEGEND, ${Object.entries(extra).map(([c, n]) => `${key(c)}: ${str(n)}`).join(', ')} }` : 'BASE_LEGEND';
  let out = `import type { MapDef } from '../../types';\nimport { BASE_LEGEND } from './legend';\n\n`;
  out += `/** ${m.title}. Файл сохранён редактором (editor.html) — можно править и руками. */\n`;
  out += `export const ${m.key}: MapDef = {\n`;
  out += `  key: ${str(m.key)},\n  title: ${str(m.title)},\n`;
  if (m.bg !== undefined) out += `  bg: ${lit(m.bg, true)},\n`;
  if (m.music) out += `  music: ${str(m.music)},\n`;
  out += `  legend: ${legend},\n`;
  out += ruler(w);
  out += rows('ground', m.ground);
  out += rows('objects', m.objects);
  out += rows('overhead', m.overhead?.some((r) => r.trim()) ? m.overhead : undefined);
  out += `  spawns: {\n${Object.entries(m.spawns)
    .map(([n, s]) => `    ${key(n)}: ${lit(s)},`)
    .join('\n')}\n  },\n`;
  const list = (name: string, arr: unknown[] | undefined) => {
    if (!arr || !arr.length) return '';
    return `  ${name}: [\n${arr.map((x) => `    ${lit(x)},`).join('\n')}\n  ],\n`;
  };
  out += list('exits', m.exits);
  out += list('npcs', m.npcs);
  out += list('items', m.items);
  out += list('triggers', m.triggers);
  if (m.onEnter?.length) out += `  onEnter: ${lit(m.onEnter)},\n`;
  out += `};\n`;
  return out;
}

/** src/data/maps/index.ts со всеми картами. */
export function mapsIndexToTs(keys: string[]): string {
  const sorted = [...keys];
  return (
    `import type { MapDef } from '../../types';\n` +
    sorted.map((k) => `import { ${k} } from './${k}';`).join('\n') +
    `\n\n/** Все локации. Файл обновляет редактор (editor.html) при создании карты. */\n` +
    `export const MAPS: Record<string, MapDef> = { ${sorted.join(', ')} };\n\n` +
    `export function getMap(key: string): MapDef {\n  const m = MAPS[key];\n` +
    `  if (!m) throw new Error(\`Карта "\${key}" не найдена. Добавь её в src/data/maps/index.ts\`);\n  return m;\n}\n`
  );
}

/** Команда катсцены: вложенные списки (parallel / branch) — многострочно. */
export function cmdToTs(c: CutsceneCmd, indent: string): string {
  if ('parallel' in c) {
    return `${indent}{ parallel: [\n${c.parallel.map((x) => cmdToTs(x, indent + '  ')).join('\n')}\n${indent}] },`;
  }
  if ('branch' in c) {
    const b = c.branch;
    let s = `${indent}{ branch: {\n${indent}  if: ${lit(b.if)},\n${indent}  then: [\n${b.then.map((x) => cmdToTs(x, indent + '    ')).join('\n')}\n${indent}  ],\n`;
    if (b.else?.length) s += `${indent}  else: [\n${b.else.map((x) => cmdToTs(x, indent + '    ')).join('\n')}\n${indent}  ],\n`;
    return s + `${indent}} },`;
  }
  if ('call' in c) return `${indent}// call: функция не сериализуется — правится в src/data/cutscenes/index.ts`;
  return `${indent}${lit(c)},`;
}

/** Есть ли в скрипте команды call (их редактор не сохраняет). */
export function hasCall(script: CutsceneCmd[]): boolean {
  return script.some((c) => 'call' in c || ('parallel' in c && hasCall(c.parallel)) || ('branch' in c && (hasCall(c.branch.then) || hasCall(c.branch.else ?? []))));
}

/** src/data/cutscenes/edited.ts */
export function cutscenesToTs(list: Cutscene[]): string {
  let out = `import type { Cutscene } from '../../types';\n\n`;
  out += `/**\n * Катсцены, сохранённые редактором (editor.html → «Катсцены»). Файл переписывается целиком,\n * руками не править — правки потеряются. Перекрывают одноимённые из index.ts.\n */\n`;
  out += `export const EDITED_CUTSCENES: Record<string, Cutscene> = {\n`;
  for (const cs of list) {
    out += `  ${key(cs.id)}: {\n    id: ${str(cs.id)},\n`;
    if (cs.once) out += `    once: true,\n`;
    if (cs.if?.length) out += `    if: ${lit(cs.if)},\n`;
    out += `    script: [\n${cs.script.map((c) => cmdToTs(c, '      ')).join('\n')}\n    ],\n  },\n`;
  }
  out += `};\n`;
  return out;
}

/** src/data/dialogues/edited.ts */
export function dialoguesToTs(rec: Record<string, DialogueLine[]>): string {
  let out = `import type { DialogueLine } from '../../types';\n\n`;
  out += `/**\n * Диалоги, сохранённые редактором (editor.html → «Диалоги»). Файл переписывается целиком,\n * руками не править — правки потеряются. Перекрывают одноимённые из index.ts.\n */\n`;
  out += `export const EDITED_DIALOGUES: Record<string, DialogueLine[]> = {\n`;
  for (const [id, lines] of Object.entries(rec)) {
    out += `  ${key(id)}: [\n${lines.map((l) => `    ${lit(l)},`).join('\n')}\n  ],\n`;
  }
  out += `};\n`;
  return out;
}

/** Сохранить файл через dev-плагин Vite (vite.config.ts → editorPlugin). */
export async function saveFile(path: string, content: string): Promise<void> {
  const r = await fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error ?? `HTTP ${r.status}`);
}
