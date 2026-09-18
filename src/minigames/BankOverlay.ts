import { audio } from '../core/Audio';

export interface BankOverlayCallbacks {
  /** попытка перевода дошла до «недостаточно средств» и окно закрыто */
  onDone(): void;
  /** закрыли, не переводя */
  onCancel(): void;
}

/** Банк из пасхалки: баланс, кому, «номер карты» валиден по количеству цифр (как у обычной карты). */
export const BANK = {
  name: 'ЗайцБанк',
  balance: '200 000',
  currency: '₴',
  recipient: 'Настасье',
  cardDigits: 16,
  processingMs: 3600,
};

const STYLE_ID = 'bank-overlay-style';
const CSS = `
.bko { position: fixed; z-index: 20; container-type: size; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  background: rgba(11,10,16,.82); font-family: "PixelFont", "Courier New", monospace; color: #1b1420; user-select: none; }
.bko * { box-sizing: border-box; }
.bko .mon { position: relative; width: 78%; height: 88%; max-width: 1100px; background: #3a3a44; border-radius: 14px; padding: 2.2% 2.2% 3.4%;
  box-shadow: 0 0 0 4px #24242c, 0 18px 40px rgba(0,0,0,.6); display: flex; flex-direction: column; }
.bko .mon::after { content: ''; position: absolute; left: 50%; bottom: 1.1%; width: 9px; height: 9px; border-radius: 50%; background: #5fd66a; transform: translateX(-50%); box-shadow: 0 0 8px #5fd66a; }
.bko .scr { flex: 1; background: #f4f6fa; border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; min-height: 0; position: relative; }
.bko .bar { background: #dfe3ea; padding: .5em .9em; display: flex; align-items: center; gap: .6em; font-size: clamp(9px, 3.2cqh, 14px); color: #4a4a55; }
.bko .bar .dot { width: .8em; height: .8em; border-radius: 50%; background: #c9c2b6; }
.bko .bar .url { flex: 1; background: #fff; border-radius: 1em; padding: .25em .9em; }
.bko .bar .x { font: inherit; background: none; border: 0; cursor: pointer; padding: .1em .5em; color: #4a4a55; font-size: 1.3em; }
.bko .bar .x:hover { color: #d9605f; }
.bko .app { flex: 1; padding: 2.5% 6%; display: flex; flex-direction: column; gap: 3.5cqh; font-size: clamp(11px, 4.2cqh, 20px); overflow: hidden; }
.bko .hdr { display: flex; align-items: center; justify-content: space-between; }
.bko .logo { font-size: 1.5em; font-weight: bold; color: #2f4fa3; letter-spacing: .04em; }
.bko .logo i { display: inline-block; width: .9em; height: .9em; background: #2f4fa3; border-radius: 50% 50% 50% 0; margin-right: .3em; transform: rotate(-45deg); }
.bko .who { color: #6b6b75; font-size: .85em; }
.bko .card { background: linear-gradient(135deg, #2f4fa3, #1c2f6e); color: #fff; border-radius: 12px; padding: 1.2em 1.4em; display: flex; flex-direction: column; gap: .3em; box-shadow: 0 8px 18px rgba(47,79,163,.35); }
.bko .card .n { font-size: .85em; opacity: .8; letter-spacing: .1em; }
.bko .card .b { font-size: 1.7em; color: #8fe39a; font-weight: bold; }
.bko .card .b small { font-size: .5em; color: #c9f0cf; font-weight: normal; margin-left: .5em; }
.bko .card .brand { align-self: flex-end; font-style: italic; font-weight: bold; letter-spacing: .06em; font-size: 1.1em; color: #ffd45a; }
.bko h3 { margin: .4em 0 0; font-size: 1.1em; font-weight: normal; color: #2a1f2d; }
.bko .to { display: flex; align-items: center; gap: .6em; }
.bko .ava { width: 2.2em; height: 2.2em; border-radius: 50%; background: #f2a7c3; display: flex; align-items: center; justify-content: center; color: #6b3a45; font-weight: bold; }
.bko label { display: flex; flex-direction: column; gap: .25em; font-size: .85em; color: #6b6b75; }
.bko input { font: inherit; font-size: 1.15em; letter-spacing: .12em; padding: .45em .7em; border: 2px solid #c9c2b6; border-radius: 8px; background: #fff; color: #1b1420; width: 100%; outline: none; }
.bko input:focus { border-color: #2f4fa3; }
.bko input.bad { border-color: #d9605f; }
.bko .row { display: flex; gap: 1em; }
.bko .row label { flex: 1; }
.bko .err { min-height: 1.2em; color: #d9605f; font-size: .8em; }
.bko button.p { font: inherit; font-size: 1.05em; background: #2f4fa3; color: #fff; border: 0; border-radius: 8px; padding: .6em 1.2em; cursor: pointer; align-self: flex-start; }
.bko button.p:hover { background: #3b60c4; } .bko button.p:disabled { background: #9aa6c7; cursor: default; }
.bko .proc { position: absolute; inset: 0; background: rgba(244,246,250,.97); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 4cqh; font-size: clamp(12px, 4.5cqh, 22px); }
.bko .proc.open { display: flex; }
.bko .visa { font-size: 3em; font-style: italic; font-weight: bold; color: #1a1f71; letter-spacing: .02em; }
.bko .visa b { color: #f7b600; }
.bko .track { width: 46%; height: .8em; background: #dfe3ea; border-radius: 1em; overflow: hidden; position: relative; }
.bko .track i { position: absolute; top: 0; bottom: 0; width: 34%; border-radius: 1em; background: linear-gradient(90deg, #1a1f71, #3b60c4, #f7b600); animation: bko-slide 1.1s linear infinite; }
@keyframes bko-slide { from { left: -34%; } to { left: 100%; } }
.bko .pst { color: #4a4a55; }
.bko .ntf { position: absolute; top: 4%; right: 3%; width: 46%; min-width: 220px; background: #fff; border-left: 6px solid #d9605f; border-radius: 10px; padding: 1em 1.2em; box-shadow: 0 10px 28px rgba(0,0,0,.28);
  font-size: clamp(11px, 4cqh, 18px); transform: translateY(-140%); transition: transform .45s cubic-bezier(.2,.9,.3,1.2); display: flex; flex-direction: column; gap: .5em; }
.bko .ntf.in { transform: translateY(0); }
.bko .ntf .t { font-weight: bold; color: #d9605f; }
.bko .ntf .m { color: #2a1f2d; }
.bko .ntf .s { color: #8a8a96; font-size: .8em; }
.bko .ntf button { font: inherit; align-self: flex-end; background: #eef0f5; border: 0; border-radius: 6px; padding: .4em .9em; cursor: pointer; color: #2f4fa3; }
.bko .ntf button:hover { background: #dfe3ea; }
`;

/**
 * DOM-оверлей «компьютер зайчонка»: монитор, в нём окно браузера с «банковским приложением» — баланс
 * 200 000 грн зелёным, «Отправить Настасье», поле номера карты. Ввёл 16 цифр → полоса «VISA, платёж
 * обрабатывается» → уведомление «у бедняка нет столько денег». Пасхалка, ничего никуда не отправляется.
 */
export class BankOverlay {
  readonly root: HTMLDivElement;
  private cardInput: HTMLInputElement;
  private amountInput: HTMLInputElement;
  private err: HTMLDivElement;
  private sendBtn: HTMLButtonElement;
  private proc: HTMLDivElement;
  private procText: HTMLDivElement;
  private ntf: HTMLDivElement;
  private busy = false;
  private reached = false;
  private timers: number[] = [];
  private onResize = () => this.place();

  constructor(private gameCanvas: HTMLCanvasElement, private cb: BankOverlayCallbacks) {
    if (!document.getElementById(STYLE_ID)) {
      const st = document.createElement('style');
      st.id = STYLE_ID;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'bko';
    this.root.innerHTML = `
      <div class="mon"><div class="scr">
        <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
          <span class="url">🔒 bank.mysh.ua/send</span><button class="x" title="Закрыть (Esc)">✕</button></div>
        <div class="app">
          <div class="hdr"><div class="logo"><i></i>${BANK.name}</div><div class="who">Зайчонок · отделение №…неважно</div></div>
          <div class="card">
            <div class="n">ОСНОВНАЯ КАРТА •••• 0007</div>
            <div class="b">${BANK.balance} ${BANK.currency}<small>доступно</small></div>
            <div class="brand">VISA</div>
          </div>
          <h3>Отправить ${BANK.recipient}</h3>
          <div class="to"><div class="ava">Н</div><div>Настасья · получатель по умолчанию</div></div>
          <div class="row">
            <label>Номер карты получателя<input class="cardn" inputmode="numeric" autocomplete="off" placeholder="0000 0000 0000 0000" maxlength="19"></label>
            <label>Сумма, ${BANK.currency}<input class="amt" inputmode="numeric" autocomplete="off" value="${BANK.balance}"></label>
          </div>
          <div class="err"></div>
          <button class="p send">Отправить →</button>
        </div>
        <div class="proc"><div class="visa">VI<b>SA</b></div><div class="track"><i></i></div><div class="pst">Связываемся с банком…</div></div>
        <div class="ntf"><div class="t">✕ Платёж отклонён</div><div class="m"></div><div class="s">Код ошибки: 0x1F_БЕДНЯК</div><button class="ok">Понятно</button></div>
      </div></div>`;
    this.cardInput = this.root.querySelector('.cardn')!;
    this.amountInput = this.root.querySelector('.amt')!;
    this.err = this.root.querySelector('.err')!;
    this.sendBtn = this.root.querySelector('.send')!;
    this.proc = this.root.querySelector('.proc')!;
    this.procText = this.root.querySelector('.pst')!;
    this.ntf = this.root.querySelector('.ntf')!;

    this.cardInput.addEventListener('input', () => this.formatCard());
    this.cardInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send();
    });
    this.amountInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send();
    });
    this.sendBtn.addEventListener('click', () => this.send());
    this.root.querySelector<HTMLButtonElement>('.x')!.addEventListener('click', () => this.close());
    this.root.querySelector<HTMLButtonElement>('.ok')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('resize', this.onResize);
    document.body.appendChild(this.root);
    this.place();
    setTimeout(() => this.cardInput.focus(), 50);
  }

  /** Оверлей ровно над канвасом игры. */
  private place(): void {
    const r = this.gameCanvas.getBoundingClientRect();
    Object.assign(this.root.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }

  private keyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  private digits(): string {
    return this.cardInput.value.replace(/\D/g, '').slice(0, BANK.cardDigits);
  }

  /** Группы по 4 цифры, как на карте. */
  private formatCard(): void {
    const d = this.digits();
    this.cardInput.value = d.replace(/(.{4})/g, '$1 ').trim();
    this.cardInput.classList.remove('bad');
    this.err.textContent = '';
    if (d.length && d.length % 4 === 0) audio.sfx('blip', { volume: 0.5 });
  }

  private send(): void {
    if (this.busy) return;
    const d = this.digits();
    if (d.length !== BANK.cardDigits) {
      this.cardInput.classList.add('bad');
      this.err.textContent = `В номере карты должно быть ${BANK.cardDigits} цифр (сейчас ${d.length}).`;
      audio.sfx('locked', { volume: 0.6 });
      this.cardInput.focus();
      return;
    }
    const amount = this.amountInput.value.replace(/[^\d]/g, '') || BANK.balance.replace(/\s/g, '');
    this.busy = true;
    this.sendBtn.disabled = true;
    audio.sfx('select');
    this.proc.classList.add('open');
    const steps = ['Связываемся с банком…', 'Проверяем карту получателя…', 'Списываем средства…', 'Ещё раз проверяем баланс…'];
    steps.forEach((t, i) => this.timers.push(window.setTimeout(() => (this.procText.textContent = t), (i * BANK.processingMs) / steps.length)));
    this.timers.push(
      window.setTimeout(() => {
        this.proc.classList.remove('open');
        audio.sfx('notify');
        const pretty = Number(amount).toLocaleString('ru-RU');
        this.ntf.querySelector('.m')!.textContent = `Недостаточно средств: у бедняка нет столько денег (${pretty} ${BANK.currency}). Перевод ${BANK.recipient} не выполнен.`;
        this.ntf.classList.add('in');
        this.reached = true;
        this.busy = false;
        this.root.querySelector<HTMLButtonElement>('.ok')!.focus();
      }, BANK.processingMs),
    );
  }

  private close(): void {
    if (this.busy) return;
    if (this.reached) this.cb.onDone();
    else this.cb.onCancel();
  }

  destroy(): void {
    this.timers.forEach((t) => clearTimeout(t));
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
