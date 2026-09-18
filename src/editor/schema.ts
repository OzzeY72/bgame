import type { CutsceneCmd } from '../types';
import { CHARACTERS } from '../data/characters';
import { MUSIC } from '../data/music';
import { SFX_NAMES } from '../data/assets';
import { MINIGAMES } from '../minigames';
import { ITEM_NAMES } from '../data/gifts';

/**
 * Описание команд катсцен для форм редактора: вид команды → поля (путь в объекте, тип ввода).
 * Источник истины по командам — CutsceneCmd в src/types.ts; здесь только как их показывать.
 */
export type FieldType = 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'point' | 'points' | 'list';

export interface FieldDef {
  /** путь в объекте команды, например ['camera', 'pan'] */
  path: string[];
  label: string;
  type: FieldType;
  options?: () => string[];
  /** можно оставить пустым (поле не пишется) */
  optional?: boolean;
  hint?: string;
}

export interface CmdKind {
  kind: string;
  label: string;
  group: string;
  fields: FieldDef[];
  /** новая команда этого вида */
  make: () => CutsceneCmd;
  /** подходит ли объект под этот вид */
  match: (c: CutsceneCmd) => boolean;
}

export const DIRS = ['down', 'left', 'right', 'up'];
const dirOpts = () => DIRS;
const charOpts = () => Object.keys(CHARACTERS);
const actorHint = 'player или id NPC на карте / spawn';

export const CMD_KINDS: CmdKind[] = [
  { kind: 'fade', label: 'Затемнение', group: 'Экран', match: (c) => 'fade' in c, make: () => ({ fade: 'in', ms: 500 }),
    fields: [{ path: ['fade'], label: 'Направление', type: 'select', options: () => ['in', 'out'] }, { path: ['ms'], label: 'мс', type: 'number', optional: true }] },
  { kind: 'wait', label: 'Пауза', group: 'Экран', match: (c) => 'wait' in c, make: () => ({ wait: 500 }), fields: [{ path: ['wait'], label: 'мс', type: 'number' }] },
  { kind: 'camera.pan', label: 'Камера: к тайлу', group: 'Экран', match: (c) => 'camera' in c && 'pan' in c.camera, make: () => ({ camera: { pan: [0, 0], ms: 600 } }),
    fields: [{ path: ['camera', 'pan'], label: 'Тайл x, y', type: 'point' }, { path: ['camera', 'ms'], label: 'мс', type: 'number', optional: true }] },
  { kind: 'camera.follow', label: 'Камера: следить', group: 'Экран', match: (c) => 'camera' in c && 'follow' in c.camera, make: () => ({ camera: { follow: 'player' } }),
    fields: [{ path: ['camera', 'follow'], label: 'Актёр', type: 'text', hint: actorHint }] },
  { kind: 'camera.shake', label: 'Камера: тряска', group: 'Экран', match: (c) => 'camera' in c && 'shake' in c.camera, make: () => ({ camera: { shake: 0.01, ms: 300 } }),
    fields: [{ path: ['camera', 'shake'], label: 'Сила', type: 'number' }, { path: ['camera', 'ms'], label: 'мс', type: 'number', optional: true }] },

  { kind: 'say', label: 'Реплика', group: 'Текст', match: (c) => 'say' in c, make: () => ({ say: 'anastasiia', text: '' }),
    fields: [{ path: ['say'], label: 'Кто', type: 'select', options: charOpts }, { path: ['text'], label: 'Текст', type: 'textarea' }, { path: ['portrait'], label: 'Портрет', type: 'text', optional: true, hint: 'ключ эмоции, например anastasiia_portrait_happy' }] },
  { kind: 'think', label: 'Мысль', group: 'Текст', match: (c) => 'think' in c, make: () => ({ think: '' }), fields: [{ path: ['think'], label: 'Текст', type: 'textarea' }] },
  { kind: 'dialogue', label: 'Диалог по id', group: 'Текст', match: (c) => 'dialogue' in c, make: () => ({ dialogue: '' }), fields: [{ path: ['dialogue'], label: 'id диалога', type: 'text' }] },

  { kind: 'move', label: 'Пройти на dx, dy', group: 'Актёр', match: (c) => 'actor' in c && 'move' in c, make: () => ({ actor: 'player', move: [0, 1] }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['move'], label: 'dx, dy (тайлы)', type: 'point' }, { path: ['speed'], label: 'Скорость', type: 'number', optional: true }] },
  { kind: 'moveTo', label: 'Идти к тайлу', group: 'Актёр', match: (c) => 'actor' in c && 'moveTo' in c, make: () => ({ actor: 'player', moveTo: [0, 0] }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['moveTo'], label: 'Тайл x, y', type: 'point' }, { path: ['speed'], label: 'Скорость', type: 'number', optional: true }] },
  { kind: 'path', label: 'Идти по точкам', group: 'Актёр', match: (c) => 'actor' in c && 'path' in c, make: () => ({ actor: 'player', path: [[0, 0]] }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['path'], label: 'Точки x,y; x,y', type: 'points' }, { path: ['speed'], label: 'Скорость', type: 'number', optional: true }] },
  { kind: 'face', label: 'Повернуться', group: 'Актёр', match: (c) => 'actor' in c && 'face' in c, make: () => ({ actor: 'player', face: 'down' }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['face'], label: 'Куда', type: 'select', options: dirOpts }] },
  { kind: 'emote', label: 'Эмоция', group: 'Актёр', match: (c) => 'actor' in c && 'emote' in c, make: () => ({ actor: 'player', emote: '!' }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['emote'], label: 'Значок', type: 'select', options: () => ['!', '?', '♥', '...'] }, { path: ['ms'], label: 'мс', type: 'number', optional: true }] },
  { kind: 'anim', label: 'Анимация', group: 'Актёр', match: (c) => 'actor' in c && 'anim' in c, make: () => ({ actor: 'player', anim: '' }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['anim'], label: 'Ключ', type: 'text' }, { path: ['stop'], label: 'Стоп (вернуть idle)', type: 'bool', optional: true }] },
  { kind: 'teleport', label: 'Телепорт', group: 'Актёр', match: (c) => 'actor' in c && 'teleport' in c, make: () => ({ actor: 'player', teleport: [0, 0] }),
    fields: [{ path: ['actor'], label: 'Актёр', type: 'text', hint: actorHint }, { path: ['teleport'], label: 'Тайл x, y', type: 'point' }] },
  { kind: 'spawn', label: 'Создать актёра', group: 'Актёр', match: (c) => 'spawn' in c, make: () => ({ spawn: { id: 'npc', sprite: 'freya', at: [0, 0], dir: 'down' } }),
    fields: [{ path: ['spawn', 'id'], label: 'id', type: 'text' }, { path: ['spawn', 'sprite'], label: 'Спрайт', type: 'select', options: () => Object.values(CHARACTERS).map((c) => c.sprite) }, { path: ['spawn', 'at'], label: 'Тайл x, y', type: 'point' }, { path: ['spawn', 'dir'], label: 'Куда смотрит', type: 'select', options: dirOpts, optional: true }] },
  { kind: 'remove', label: 'Убрать актёра', group: 'Актёр', match: (c) => 'remove' in c, make: () => ({ remove: '' }), fields: [{ path: ['remove'], label: 'id', type: 'text' }] },

  { kind: 'setFlag', label: 'Флаг', group: 'Состояние', match: (c) => 'setFlag' in c, make: () => ({ setFlag: '' }),
    fields: [{ path: ['setFlag'], label: 'Имя флага', type: 'text' }, { path: ['value'], label: 'Значение (пусто = true)', type: 'bool', optional: true }] },
  { kind: 'give', label: 'Дать предмет', group: 'Состояние', match: (c) => 'give' in c, make: () => ({ give: 'camera' }),
    fields: [{ path: ['give'], label: 'Предмет', type: 'text', hint: Object.keys(ITEM_NAMES).join(', ') }] },
  { kind: 'minigame', label: 'Мини-игра', group: 'Состояние', match: (c) => 'minigame' in c, make: () => ({ minigame: 'rhythm' }),
    fields: [{ path: ['minigame'], label: 'id', type: 'select', options: () => Object.keys(MINIGAMES) }] },
  { kind: 'warp', label: 'Перейти на карту (последняя команда)', group: 'Состояние', match: (c) => 'warp' in c, make: () => ({ warp: { map: 'yard', spawn: 'start' } }),
    fields: [{ path: ['warp', 'map'], label: 'Карта', type: 'text' }, { path: ['warp', 'spawn'], label: 'Точка появления', type: 'text' }] },

  { kind: 'music', label: 'Музыка', group: 'Звук', match: (c) => 'music' in c, make: () => ({ music: 'home' }),
    fields: [{ path: ['music'], label: 'Ключ (пусто = тишина)', type: 'select', options: () => ['', ...Object.keys(MUSIC)] }, { path: ['ms'], label: 'мс перехода', type: 'number', optional: true }] },
  { kind: 'sfx', label: 'Звук', group: 'Звук', match: (c) => 'sfx' in c, make: () => ({ sfx: 'select' }),
    fields: [{ path: ['sfx'], label: 'Эффект', type: 'select', options: () => [...SFX_NAMES] }] },

  { kind: 'parallel', label: 'Одновременно (группа)', group: 'Структура', match: (c) => 'parallel' in c, make: () => ({ parallel: [] }), fields: [] },
  { kind: 'branch', label: 'Ветвление по флагам', group: 'Структура', match: (c) => 'branch' in c, make: () => ({ branch: { if: [], then: [], else: [] } }),
    fields: [{ path: ['branch', 'if'], label: 'Условия (через запятую, !flag = не стоит)', type: 'list' }] },
  { kind: 'call', label: 'Код (call)', group: 'Структура', match: (c) => 'call' in c, make: () => ({ call: () => {} }), fields: [] },
];

export function kindOf(c: CutsceneCmd): CmdKind | undefined {
  return CMD_KINDS.find((k) => k.match(c));
}

export function getPath(obj: unknown, path: string[]): unknown {
  let v: unknown = obj;
  for (const p of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

export function setPath(obj: unknown, path: string[], value: unknown): void {
  let v = obj as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof v[path[i]] !== 'object' || v[path[i]] === null) v[path[i]] = {};
    v = v[path[i]] as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (value === undefined) delete v[last];
  else v[last] = value;
}

/** Строка формы → значение по типу поля. Пусто у optional → undefined (поле удаляется). */
export function parseField(f: FieldDef, raw: string | boolean): unknown {
  if (f.type === 'bool') return raw === true || raw === 'true' ? true : f.optional ? undefined : false;
  const s = String(raw).trim();
  if (s === '' && f.optional) return undefined;
  switch (f.type) {
    case 'number': {
      const n = Number(s);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'point': {
      const [a, b] = s.split(/[,\s]+/).map(Number);
      return [a || 0, b || 0];
    }
    case 'points':
      return s
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const [a, b] = p.split(/[,\s]+/).map(Number);
          return [a || 0, b || 0];
        });
    case 'list':
      return s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    case 'select':
      if (f.path[0] === 'music' && s === '') return null;
      return s;
    default:
      return s;
  }
}

/** Значение → строка для формы. */
export function formatField(f: FieldDef, v: unknown): string {
  if (v === undefined || v === null) return '';
  switch (f.type) {
    case 'point':
      return Array.isArray(v) ? `${v[0]}, ${v[1]}` : '';
    case 'points':
      return Array.isArray(v) ? (v as number[][]).map((p) => `${p[0]},${p[1]}`).join('; ') : '';
    case 'list':
      return Array.isArray(v) ? (v as string[]).join(', ') : '';
    default:
      return String(v);
  }
}
