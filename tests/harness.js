// Loads src/app.js into a vm context with minimal DOM stubs and
// exposes its internals, so the derived logic can be exercised without a browser.
// The production script itself is never modified — only read.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'src', 'app.js');
const STYLES = path.join(__dirname, '..', 'src', 'styles.css');

const NAMES = `KEY DOW MONS MAXGOALS
pad key today todayKey parseKey label short mKey inMonth daysIn diffDays newId esc TAP
Store load readVersion save seed ETAMIN DONEMAX doneOpen archiveOpen
dayTotal level dayKeys subTotal firstDone activeDays goalDays goalCount streak
live liveSubs subLogged goalLogged
dropGoal dropSub restoreGoal restoreSub purgeGoal archivePanel lastWorked
moveGoal nudgeGoal beginDrag bump completeList findSub clearSub stripSub markdown noteEditor
render heatmap heatStart HWEEKS calendar dayPanel snapshotPanel goalBlock completedList listAddControl commitQuickSub paceLine pips
achievements goalAmount statsPanel goalEditor tabs track bind bindSwipe shift
beginEdit cancelEdit commitEdit createGoal navigateGoal
PAGE_SIZE sectionOpen sectionPage pageOf pager foldTitle`.split(/\s+/).filter(Boolean);

const MUTABLE = ['state', 'view', 'sel', 'panel', 'editing', 'draftGoal', 'draftIsNew', 'quickAdding', 'noteView', 'completionPeek', 'dataPath', 'saveErr', 'version',
                 'notice', 'purging'];

// A Date subclass whose no-arg constructor returns a fixed instant. Every other
// form (new Date(y, m, d), new Date(str), Date.now()) behaves normally, because
// the app relies on those for real arithmetic.
function fixedDate(iso) {
  if (!iso) return Date;
  const [y, m, d] = iso.split('-').map(Number);
  const fixed = new Date(y, m - 1, d, 12, 0, 0);      // midday, so DST cannot shift the date
  class D extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed.getTime());
      else super(...args);
    }
    static now() { return fixed.getTime(); }
  }
  return D;
}

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

// opts.now: 'YYYY-MM-DD' pins what the script sees as today, so date-dependent
// behaviour (month ends, leap days, the early-month ETA cutoff) can be asserted
// instead of being tested only on whatever day the suite happens to run.
function boot(opts = {}) {
  const src = fs.readFileSync(SCRIPT, 'utf8');

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
    // nothing is really in the document here, so a lookup finds nothing — but the app
    // may still ask (moving a goal hands focus back to its handle)
    querySelector() { return null; },
  };

  // The browser backend talks to localStorage, so the stub has to be one.
  const store = new Map();
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };
  const win = {};
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
    setTimeout, clearTimeout, Math, JSON, Object, Array, String, Number, Set,
    localStorage,
    Date: fixedDate(opts.now),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const epilogue = `
;globalThis.__api = {
  ${MUTABLE.map(n => `get ${n}(){return ${n}}, set ${n}(v){${n}=v}`).join(',\n  ')},
  ${NAMES.join(', ')}
};`;

  vm.runInContext(src + epilogue, ctx, { filename: 'src/app.js' });
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

module.exports = { boot, bootReady, settle, SCRIPT, STYLES };
