/** Крошечный помощник для сборки DOM без фреймворка. */
export type Child = Node | string | null | undefined | false | Child[];

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'value' && 'value' in e) (e as HTMLInputElement).value = String(v);
    else if (k === 'checked' && 'checked' in e) (e as HTMLInputElement).checked = !!v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, String(v));
  }
  append(e, children);
  return e;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(e: HTMLElement): void {
  while (e.firstChild) e.removeChild(e.firstChild);
}

/** Поле формы: подпись + инпут. */
export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return el('label', { class: 'f' }, el('span', {}, label), input, hint ? el('small', {}, hint) : null);
}

export function select(options: string[], value: string, onChange: (v: string) => void, labels?: Record<string, string>): HTMLSelectElement {
  const s = el('select', { onChange: (e: Event) => onChange((e.target as HTMLSelectElement).value) });
  for (const o of options) s.appendChild(el('option', { value: o, selected: o === value }, labels?.[o] ?? (o === '' ? '—' : o)));
  s.value = value;
  return s;
}

export function input(value: string | number, onChange: (v: string) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  return el('input', { value: String(value ?? ''), onChange: (e: Event) => onChange((e.target as HTMLInputElement).value), ...attrs });
}

export function checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  return el('input', { type: 'checkbox', checked: value, onChange: (e: Event) => onChange((e.target as HTMLInputElement).checked) });
}

export function button(label: string, onClick: () => void, cls = 'b'): HTMLButtonElement {
  return el('button', { class: cls, type: 'button', onClick }, label);
}

export function toast(text: string, ok = true): void {
  const t = el('div', { class: `toast ${ok ? 'ok' : 'err'}` }, text);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}
