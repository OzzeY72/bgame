import type { DialogueLine } from '../types';
import { CHARACTERS } from '../data/characters';
import { SFX_NAMES } from '../data/assets';
import { el, clear, field, select, input, button } from './dom';

export interface DialogueEditorCtx {
  onSave: (id: string, lines: DialogueLine[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const THINK = '__think';

/**
 * Редактор диалога-массива: реплики (кто / мысль, текст, портрет, звук, варианты ответа).
 * Диалоги-функции (вариативные по флагам) редактор не открывает — они правятся в коде.
 */
export class DialogueEditor {
  readonly root: HTMLElement;
  private lines: DialogueLine[];
  private list = el('div', { class: 'lines' });
  private status = el('div', { class: 'status' });
  dirty = false;
  private id: string;
  readonly isNew: boolean;

  constructor(id: string, lines: DialogueLine[], private ectx: DialogueEditorCtx, isNew = false) {
    this.id = id;
    this.isNew = isNew;
    this.lines = structuredClone(lines);
    this.root = el('div', { class: 'dlg-editor' },
      el('div', { class: 'row' },
        field('id', input(id, (v) => { this.id = v.trim(); this.markDirty(); }, { disabled: !isNew })),
        el('span', { style: { flex: '1' } }),
        button('Сохранить', () => void this.save(), 'b p'),
        !isNew ? button('Удалить из edited.ts', () => void this.ectx.onDelete(this.id), 'b danger') : null,
      ),
      this.list,
      this.status,
    );
    this.render();
  }

  private markDirty(): void {
    this.dirty = true;
    this.status.textContent = 'не сохранено (Ctrl+S)';
  }

  private render(): void {
    clear(this.list);
    const chars = Object.keys(CHARACTERS);
    this.lines.forEach((ln, i) => {
      const who = ln.think || !ln.who ? THINK : ln.who;
      const card = el('div', { class: 'line' });
      card.append(
        el('div', { class: 'cmd-head' },
          el('span', { class: 'num' }, `${i + 1}`),
          select([THINK, ...chars], who, (v) => {
            if (v === THINK) {
              delete ln.who;
              ln.think = true;
            } else {
              ln.who = v;
              delete ln.think;
            }
            this.markDirty();
            this.render();
          }, { [THINK]: 'мысль (без портрета)', ...Object.fromEntries(chars.map((c) => [c, CHARACTERS[c].name])) }),
          el('span', { style: { flex: '1' } }),
          button('↑', () => { if (i > 0) { [this.lines[i - 1], this.lines[i]] = [this.lines[i], this.lines[i - 1]]; this.markDirty(); this.render(); } }, 'b sm'),
          button('↓', () => { if (i < this.lines.length - 1) { [this.lines[i + 1], this.lines[i]] = [this.lines[i], this.lines[i + 1]]; this.markDirty(); this.render(); } }, 'b sm'),
          button('✕', () => { this.lines.splice(i, 1); this.markDirty(); this.render(); }, 'b sm danger'),
        ),
        el('textarea', { rows: 2, onChange: (e: Event) => { ln.text = (e.target as HTMLTextAreaElement).value; this.markDirty(); } }, ln.text),
        el('div', { class: 'row' },
          who !== THINK ? field('Портрет (эмоция)', input(ln.portrait ?? '', (v) => { if (v.trim()) ln.portrait = v.trim(); else delete ln.portrait; this.markDirty(); }, { placeholder: `${CHARACTERS[who]?.portrait ?? ''}_happy` })) : null,
          field('Звук', select(['', ...SFX_NAMES], ln.sfx ?? '', (v) => { if (v) ln.sfx = v; else delete ln.sfx; this.markDirty(); })),
          field('Варианты ответа', button(ln.choices ? 'убрать' : 'добавить', () => {
            if (ln.choices) delete ln.choices;
            else ln.choices = [{ label: 'Да' }, { label: 'Нет' }];
            this.markDirty();
            this.render();
          }, 'b sm')),
        ),
      );
      if (ln.choices) {
        const ch = el('div', { class: 'choices' });
        ln.choices.forEach((c, j) => {
          ch.appendChild(el('div', { class: 'row' },
            field('Вариант', input(c.label, (v) => { c.label = v; this.markDirty(); })),
            field('→ диалог next', input(c.next ?? '', (v) => { if (v.trim()) c.next = v.trim(); else delete c.next; this.markDirty(); }, { list: 'dialogue-ids' })),
            field('ставит флаг', input(c.setFlag ?? '', (v) => { if (v.trim()) c.setFlag = v.trim(); else delete c.setFlag; this.markDirty(); })),
            button('✕', () => { ln.choices!.splice(j, 1); this.markDirty(); this.render(); }, 'b sm danger'),
          ));
        });
        ch.appendChild(button('＋ вариант', () => { ln.choices!.push({ label: '' }); this.markDirty(); this.render(); }, 'b sm'));
        card.appendChild(ch);
      }
      this.list.appendChild(card);
    });
    this.list.appendChild(el('div', { class: 'row' },
      button('＋ реплика', () => { this.lines.push({ who: 'anastasiia', text: '' }); this.markDirty(); this.render(); }),
      button('＋ мысль', () => { this.lines.push({ think: true, text: '' }); this.markDirty(); this.render(); }),
    ));
  }

  async save(): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/i.test(this.id)) throw new Error('id диалога — латиница/цифры/подчёркивание');
    await this.ectx.onSave(this.id, structuredClone(this.lines));
    this.dirty = false;
    this.status.textContent = 'сохранено';
  }
}
