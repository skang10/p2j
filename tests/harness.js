// Loads src/index.html's <script> into a vm context with minimal DOM stubs and
// exposes its internals, so the derived logic can be exercised without a browser.
// index.html itself is never modified — only read.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'src', 'index.html');

const NAMES = `KEY DOW MAXGOALS CAD DEFCAD
pad key today todayKey parseKey label short mKey inMonth daysIn diffDays newId esc cadName TAP
Store load save seed
dayTotal adhocMonth adhocAll level subTotal firstDone lastTouch activeDays goalDays goalCount streak
bump addAdhoc delAdhoc clearSub
render calendar yearStrip dayPanel adhocBlock goalBlock paceLine pips tick
reviewPanel achievements cols statsPanel goalEditor tabs track bind shift`.split(/\s+/).filter(Boolean);

const MUTABLE = ['state', 'view', 'sel', 'panel', 'editing', 'dataPath', 'saveErr', 'refocus'];

function makeElement(id) {
  return {
    id,
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    dataset: {},
    style: {},
    focus() {},
    onclick: null, oninput: null, onchange: null, onkeydown: null,
    disabled: false,
    value: '',
  };
}

// opts.storage: false to omit window.storage entirely (real-browser condition)
function boot(opts = {}) {
  const src = fs.readFileSync(HTML, 'utf8');
  const m = src.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no <script> block found in index.html');

  const els = new Map();
  const captured = {};
  const doc = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeElement(id));
      const el = els.get(id);
      if (id === 'app') {
        // record every render so tests can assert on emitted markup
        Object.defineProperty(el, 'innerHTML', {
          configurable: true,
          get() { return captured.app || ''; },
          set(v) { captured.app = v; },
        });
      }
      return el;
    },
    querySelectorAll() { return []; },
  };

  const store = new Map();
  const win = {};
  if (opts.storage !== false) {
    win.storage = {
      async get(k) { return store.has(k) ? { value: store.get(k) } : null; },
      async set(k, v) { store.set(k, v); },
    };
  }
  if (opts.tauri) win.__TAURI__ = opts.tauri;

  const logs = { warn: [], error: [] };
  const ctx = {
    window: win,
    document: doc,
    console: {
      log: () => {},
      warn: (...a) => logs.warn.push(a.map(String).join(' ')),
      error: (...a) => logs.error.push(a.map(String).join(' ')),
    },
    setTimeout, clearTimeout, Math, Date, JSON, Object, Array, String, Number,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const epilogue = `
;globalThis.__api = {
  ${MUTABLE.map(n => `get ${n}(){return ${n}}, set ${n}(v){${n}=v}`).join(',\n  ')},
  ${NAMES.join(', ')}
};`;

  vm.runInContext(m[1] + epilogue, ctx, { filename: 'index.html:script' });
  return { api: ctx.__api, captured, store, logs, els };
}

// The script kicks off an async load() on evaluation; wait for it to land before
// tests touch state/view, otherwise they race the first render.
const settle = () => new Promise(r => setImmediate(r));
async function bootReady(opts) {
  const h = boot(opts);
  for (let i = 0; i < 8 && h.api.view === null; i++) await settle();
  return h;
}

module.exports = { boot, bootReady, settle, HTML };
