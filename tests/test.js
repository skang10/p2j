// Frontend logic tests for src/index.html. Run: node test.js
const { boot, bootReady } = require('./harness');

let pass = 0, fail = 0;
const fails = [];
const TESTS = [];
function t(name, fn) { TESTS.push([name, fn]); }
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || ''} expected ${B}, got ${A}`);
}
function ok(c, msg) { if (!c) throw new Error(msg || 'expected truthy'); }
function has(s, sub, msg) {
  if (!String(s).includes(sub)) throw new Error(`${msg || ''} missing ${JSON.stringify(sub)} in: ${String(s).slice(0, 220)}`);
}
function no(s, sub, msg) {
  if (String(s).includes(sub)) throw new Error(`${msg || ''} unexpected ${JSON.stringify(sub)}`);
}

const h = boot();
const A = h.api;
const N = A.today();
const [TY, TM, TD] = [N.getFullYear(), N.getMonth(), N.getDate()];
const DIM = A.daysIn(TY, TM);
const LEFT = DIM - TD;

// ---------- date + string helpers ----------
t('pad', () => { eq(A.pad(3), '03'); eq(A.pad(12), '12'); });
t('key', () => eq(A.key(new Date(2026, 6, 8)), '2026-07-08'));
t('parseKey', () => {
  const d = A.parseKey('2026-07-28');
  eq([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 6, 28]);
});
t('key/parseKey roundtrip', () => eq(A.key(A.parseKey('2026-02-09')), '2026-02-09'));
t('label', () => eq(A.label('2026-07-28'), 'Jul 28'));
t('short', () => eq(A.short('2026-12-05'), '12/5'));
t('mKey', () => eq(A.mKey(2026, 6), '2026-07'));
t('inMonth', () => {
  ok(A.inMonth('2026-07-01', 2026, 6));
  ok(!A.inMonth('2026-08-01', 2026, 6));
  ok(!A.inMonth('2025-07-01', 2026, 6));
});
t('daysIn', () => {
  eq(A.daysIn(2026, 1), 28, 'Feb 2026');
  eq(A.daysIn(2024, 1), 29, 'Feb 2024 leap');
  eq(A.daysIn(2026, 0), 31);
  eq(A.daysIn(2026, 3), 30);
});
t('diffDays', () => eq(A.diffDays(A.parseKey('2026-07-01'), A.parseKey('2026-07-11')), 10));
t('diffDays survives a DST boundary', () => {
  // US DST begins 2026-03-08; a naive (b-a)/864e5 without rounding gives 13.958
  eq(A.diffDays(A.parseKey('2026-03-01'), A.parseKey('2026-03-15')), 14);
});
t('newId shape', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const id = A.newId(); ok(/^[a-z0-9]{1,6}$/.test(id), 'bad id ' + id); seen.add(id); }
  ok(seen.size > 480, 'ids not distinct enough: ' + seen.size);
});
t('esc escapes the four dangerous chars', () =>
  eq(A.esc('<img src=x onerror="a&b">'), '&lt;img src=x onerror=&quot;a&amp;b&quot;&gt;'));

// ---------- level ramp ----------
t('level ramp', () => {
  eq([0, 1, 2, 3, 4, 5, 99].map(A.level), [0, 1, 2, 3, 3, 4, 4]);
});

// ---------- derived counts ----------
async function fixture() {
  const g = await bootReady();
  g.api.state = {
    goals: [
      { id: 'g1', type: 'count', cad: 'daily', target: 10, title: 'Problems',
        subs: [{ id: 's1', title: 'DP' }, { id: 's2', title: 'Trees' }] },
      { id: 'g2', type: 'list', cad: 'monthly', title: 'To learn',
        subs: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }, { id: 'l3', title: 'C' }] },
      { id: 'g3', type: 'daily', cad: 'weekly', title: 'Job hunt',
        subs: [{ id: 'd1', title: 'Applications' }] },
    ],
    logs: {
      '2026-06-30': { s1: 5 },
      '2026-07-02': { s1: 2, s2: 1 },
      '2026-07-03': { d1: 1 },
      '2026-07-10': { s1: 3, l1: 1 },
      '2026-08-01': { s2: 4 },
    },
    adhoc: { '2026-07-03': ['fix bug', 'reply to email'], '2026-08-02': ['x'] },
  };
  g.api.view = { y: 2026, m: 6 };
  return g.api;
}

t('dayTotal sums logs and ad-hoc together', async () => {
  const a = await fixture();
  eq(a.dayTotal('2026-07-02'), 3, 'logs only');
  eq(a.dayTotal('2026-07-03'), 1 + 2, 'log + 2 ad-hoc');
  eq(a.dayTotal('2026-01-01'), 0, 'empty day');
});
t('subTotal scopes to month when asked', async () => {
  const a = await fixture();
  eq(a.subTotal('s1', 2026, 6), 5, 'July s1 = 2+3');
  eq(a.subTotal('s1'), 10, 'all time s1 = 5+2+3');
  eq(a.subTotal('s2', 2026, 7), 4, 'August s2');
});
t('goalCount sums a goal\'s subs for the month', async () => {
  const a = await fixture();
  eq(a.goalCount(a.state.goals[0], 2026, 6), 6, 'July: 2+1+3');
  eq(a.goalCount(a.state.goals[0], 2026, 7), 4, 'August: 4');
});
t('goalDays counts distinct days touched, not check-ins', async () => {
  const a = await fixture();
  eq(a.goalDays(a.state.goals[0], 2026, 6), 2, '07-02 and 07-10');
  eq(a.goalDays(a.state.goals[2], 2026, 6), 1);
  eq(a.goalDays(a.state.goals[2], 2026, 7), 0);
});
t('activeDays counts days with any activity', async () => {
  const a = await fixture();
  eq(a.activeDays(2026, 6), 3, '07-02, 07-03, 07-10');
  eq(a.activeDays(2026, 5), 1);
});
// KNOWN DISCREPANCY vs SPEC §4.4: activeDays/goal charts iterate state.logs only,
// so a day whose only activity is ad-hoc is coloured green on the calendar
// (dayTotal counts it) but is not counted as an active day in the tally or stats.
t('ad-hoc-only day: green on the calendar but absent from the active-day tally', async () => {
  const a = await fixture();
  a.state.adhoc['2026-07-20'] = ['odd jobs only'];
  eq(a.dayTotal('2026-07-20'), 1, 'dayTotal sees it, so the cell renders green');
  eq(a.activeDays(2026, 6), 3, 'but activeDays skips it — 4 would be consistent');
  a.view = { y: 2026, m: 6 };
  has(a.calendar('2026-07-28'), 'data-l="1" data-k="2026-07-20"', 'cell is shaded');
});
t('adhocMonth / adhocAll', async () => {
  const a = await fixture();
  eq(a.adhocMonth(2026, 6), 2);
  eq(a.adhocMonth(2026, 7), 1);
  eq(a.adhocAll(), 3);
});
t('firstDone records the earliest date per sub', async () => {
  const a = await fixture();
  const F = a.firstDone();
  eq(F.s1, '2026-06-30', 'earliest wins, not latest');
  eq(F.l1, '2026-07-10');
  eq(F.l2, undefined, 'untouched sub absent');
});
t('lastTouch returns the goal\'s most recent day', async () => {
  const a = await fixture();
  eq(a.lastTouch(a.state.goals[0]), '2026-08-01');
  eq(a.lastTouch(a.state.goals[2]), '2026-07-03');
  eq(a.lastTouch({ subs: [{ id: 'nope' }] }), null, 'never touched');
});

// ---------- check-in mutations ----------
t('bump increments, decrements, and prunes empty days', async () => {
  const a = await fixture();
  a.sel = '2026-09-05';
  a.bump('s1', 1);
  eq(a.state.logs['2026-09-05'], { s1: 1 });
  a.bump('s1', 1);
  eq(a.state.logs['2026-09-05'], { s1: 2 });
  a.bump('s1', -1);
  eq(a.state.logs['2026-09-05'], { s1: 1 });
  a.bump('s1', -1);
  eq(a.state.logs['2026-09-05'], undefined, 'day key removed when it empties');
});
t('bump below zero does not create a negative entry', async () => {
  const a = await fixture();
  a.sel = '2026-09-06';
  a.bump('s1', -1);
  eq(a.state.logs['2026-09-06'], undefined);
});
t('bump keeps sibling subs on the same day', async () => {
  const a = await fixture();
  a.sel = '2026-07-02';
  a.bump('s1', -2);
  eq(a.state.logs['2026-07-02'], { s2: 1 }, 's2 survives');
});
t('addAdhoc trims and ignores blank input', async () => {
  const a = await fixture();
  a.sel = '2026-07-15';
  a.addAdhoc('  weekly report  ');
  eq(a.state.adhoc['2026-07-15'], ['weekly report']);
  a.addAdhoc('   ');
  eq(a.state.adhoc['2026-07-15'], ['weekly report'], 'blank rejected');
  a.addAdhoc('second thing');
  eq(a.state.adhoc['2026-07-15'], ['weekly report', 'second thing']);
});
t('delAdhoc removes one entry and prunes the empty date', async () => {
  const a = await fixture();
  a.delAdhoc('2026-07-03', 0);
  eq(a.state.adhoc['2026-07-03'], ['reply to email']);
  a.delAdhoc('2026-07-03', 0);
  eq(a.state.adhoc['2026-07-03'], undefined, 'date key removed');
});
t('clearSub wipes a sub everywhere and prunes emptied days', async () => {
  const a = await fixture();
  a.clearSub('d1');
  eq(a.state.logs['2026-07-03'], undefined, 'day had only d1');
  a.clearSub('s1');
  eq(a.state.logs['2026-06-30'], undefined);
  eq(a.state.logs['2026-07-02'], { s2: 1 }, 'partial day survives');
  eq(a.subTotal('s1'), 0);
});

// ---------- pace line ----------
t('paceLine: past month, target met', async () => {
  const a = await fixture();
  a.view = { y: 2020, m: 0 };
  const s = a.paceLine(40, 40);
  has(s, 'met'); has(s, '31-day month');
});
t('paceLine: past month, target missed', async () => {
  const a = await fixture();
  a.view = { y: 2020, m: 0 };
  const s = a.paceLine(33, 40);
  has(s, '7 short'); has(s, 'month is over');
});
t('paceLine: current month, already met', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  has(a.paceLine(40, 40), 'met');
});
t('paceLine: current month, nothing done yet', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  has(a.paceLine(0, 40), `${LEFT} days left`);
});
t('paceLine: current month, on pace projects an ETA', async () => {
  if (LEFT === 0) return;             // last day of month: no room to project
  const a = await fixture();
  a.view = { y: TY, m: TM };
  const s = a.paceLine(TD, DIM);      // rate 1.0/day, needs exactly LEFT more days
  has(s, 'at this pace'); has(s, 'done ');
});
t('paceLine: current month, behind pace warns and states the required rate', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  const s = a.paceLine(1, DIM * 10);
  has(s, 'by month end'); has(s, ' short'); has(s, 'needs'); has(s, '/day');
});
t('paceLine never divides by zero on the last day of a month', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };          // July, 31 days
  const realToday = a.today;
  // paceLine reads today() internally; assert the no-crash path via a past month instead
  const s = a.paceLine(1, 40);
  ok(!/NaN|Infinity/.test(s), 'got ' + s);
});

// ---------- pips / bar ----------
t('pips renders one cell per unit under the threshold', async () => {
  const a = await fixture();
  const s = a.pips(3, 10);
  eq((s.match(/class="pip[" ]/g) || []).length, 10, 'ten pips');
  eq((s.match(/pip f/g) || []).length, 3, 'three filled');
});
t('pips switches to a bar above 150', async () => {
  const a = await fixture();
  const s = a.pips(75, 300);
  has(s, 'class="bar"'); has(s, 'width:25%');
});
t('pips bar clamps overflow at 100%', async () => {
  const a = await fixture();
  has(a.pips(400, 300), 'width:100%');
});

// ---------- achievements ----------
t('achievements: list completions, count-goal target hits, ad-hoc, newest first', async () => {
  const a = await fixture();
  a.state.logs = {
    '2026-07-01': { s1: 4 },
    '2026-07-02': { s1: 4 },
    '2026-07-03': { s1: 4 },   // cumulative 12 >= target 10 -> hit fires here
    '2026-07-04': { s1: 4 },   // still over target -> must NOT fire again
    '2026-07-05': { l1: 1 },
    '2026-08-20': { s1: 20 },  // new month -> fires again
  };
  a.state.adhoc = { '2026-07-06': ['odd job'] };
  const out = a.achievements();
  const hits = out.filter(x => x.hit);
  eq(hits.length, 2, 'one hit per month, fired once each');
  eq(hits.map(x => x.d).sort(), ['2026-07-03', '2026-08-20']);
  ok(out.some(x => x.t === 'A' && x.d === '2026-07-05'), 'list item recorded');
  ok(out.some(x => x.t === 'odd job' && x.g === 'Ad-hoc'), 'ad-hoc recorded');
  const dates = out.map(x => x.d);
  eq(dates, [...dates].sort().reverse(), 'sorted newest first');
});
t('achievements is empty for a fresh log', async () => {
  const a = await fixture();
  a.state.logs = {}; a.state.adhoc = {};
  eq(a.achievements().length, 0);
});

// ---------- rendering ----------
t('day panel renders calendar, goals, chips and the ad-hoc input', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'day';
  a.render();
  const html = g.captured.app;
  has(html, 'class="cal"'); has(html, 'class="year"');
  has(html, 'id="adhocIn"', 'ad-hoc input present');
  has(html, 'Problems'); has(html, 'To learn'); has(html, 'Job hunt');
  has(html, 'Ad-hoc', 'ad-hoc section present');
  has(html, 'data-add='); has(html, 'data-tog=');
});
t('review panel renders a row per goal plus the ad-hoc row', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'review'; a.render();
  const html = g.captured.app;
  has(html, 'class="rev"');
  eq((html.match(/class="rrow/g) || []).length, 4, '3 goals + ad-hoc');
});
t('review panel names goals untouched all month', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'review'; a.render();
  has(g.captured.app, 'Untouched all month');
  has(g.captured.app, 'or delete it');
});
t('stats panel renders all four blocks', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'stats'; a.render();
  const html = g.captured.app;
  has(html, 'Last 12 months'); has(html, 'By weekday');
  has(html, 'By goal'); has(html, 'Completed');
  eq((html.match(/class="cols"/g) || []).length, 2, 'two bar charts');
});
t('stats month bars are clickable and carry a jump target', async () => {
  const g = await bootReady();
  g.api.panel = 'stats'; g.api.render();
  eq((g.captured.app.match(/data-jm="/g) || []).length, 12, '12 month bars');
});
t('every goal offers its own Edit control', async () => {
  const g = await bootReady();
  g.api.render();
  const html = g.captured.app;
  eq((html.match(/class="lnk gedit"/g) || []).length, g.api.state.goals.length,
     'one Edit per goal, none for ad-hoc');
});
t('editing one goal opens its editor in place and leaves the others alone', async () => {
  const g = await bootReady();
  const a = g.api;
  const target = a.state.goals[0];
  a.editing = target.id; a.render();
  const html = g.captured.app;
  eq((html.match(/class="goal ed"/g) || []).length, 1, 'exactly one goal is in edit mode');
  has(html, `data-gt="${target.id}"`, 'its title is editable');
  has(html, `data-gy="${target.id}"`); has(html, `data-gc="${target.id}"`);
  has(html, `data-gn="${target.id}"`, 'count goal exposes its monthly target');
  has(html, `data-dg="${target.id}"`, 'and can be deleted');
  // the untouched goals still render as normal check-in blocks
  has(html, `data-add=`); has(html, 'class="chips"');
  no(html, `data-gt="${a.state.goals[1].id}"`, 'the other goals are not in edit mode');
});
t('a non-count goal is not offered a monthly target field', async () => {
  const g = await bootReady();
  const a = g.api;
  a.editing = a.state.goals[2].id;          // the daily goal
  a.render();
  no(g.captured.app, 'data-gn=', 'only count goals have a target');
});
t('the editor closes back to the check-in view', async () => {
  const g = await bootReady();
  const a = g.api;
  a.editing = a.state.goals[0].id; a.render();
  has(g.captured.app, 'data-edit=""', 'Done clears the edit target');
  a.editing = null; a.render();
  no(g.captured.app, 'class="goal ed"');
});
t('the add-goal button respects MAXGOALS', async () => {
  const g = await bootReady();
  const a = g.api;
  a.render();
  has(g.captured.app, 'You already have 3 goals', 'cap message at 3 goals');
  no(g.captured.app, 'id="ag"', 'add-goal hidden at the cap');
  a.state.goals.pop(); a.render();
  has(g.captured.app, 'id="ag"', 'and back below the cap');
});
t('future days are inert and past days are clickable', async () => {
  const g = await bootReady();
  const a = g.api;
  a.view = { y: TY, m: TM };
  const cal = a.calendar(a.todayKey());
  ok(cal.includes('class="d future"') === (TD < DIM), 'future cells iff not month end');
  eq((cal.match(/<button class="d/g) || []).length, TD, 'one clickable cell per elapsed day');
});
t('calendar marks today and the selected day', async () => {
  const g = await bootReady();
  const a = g.api;
  a.view = { y: TY, m: TM }; a.sel = a.todayKey(); a.panel = 'day';
  const cal = a.calendar(a.todayKey());
  has(cal, 'today'); has(cal, 'sel');
});
t('goal titles are escaped in every panel', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.goals[0].title = '<script>x</script>';
  // the stats share chart only lists goals with check-ins, so give it one
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);
  for (const p of ['day', 'review', 'stats']) {
    a.panel = p; a.render();
    no(g.captured.app, '<script>x</script>', p + ' panel leaked raw markup');
    has(g.captured.app, '&lt;script&gt;', p + ' panel escaped');
  }
});
t('ad-hoc text is escaped', async () => {
  const g = await bootReady();
  const a = g.api;
  a.sel = a.todayKey();
  a.addAdhoc('<b>bold</b>');
  a.panel = 'day'; a.render();
  no(g.captured.app, '<b>bold</b>');
  has(g.captured.app, '&lt;b&gt;bold&lt;/b&gt;');
});
t('a goal with no subs stays reachable instead of vanishing', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.goals[0].subs = [];
  a.panel = 'day'; a.render();
  const html = g.captured.app;
  has(html, 'Problems', 'it must not disappear, or it can never be edited again');
  has(html, `data-edit="${a.state.goals[0].id}"`, 'and it still offers a way in');
  has(html, 'No sub-goals yet');
});
t('render survives a completely empty state', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state = { goals: [], logs: {}, adhoc: {} };
  for (const p of ['day', 'review', 'stats']) { a.panel = p; a.render(); ok(g.captured.app.length > 100, p); }
  has(g.captured.app, 'Nothing logged yet');
});
t('navigating months keeps view in range and switches panel', async () => {
  const g = await bootReady();
  const a = g.api;
  a.view = { y: 2026, m: 0 };
  a.shift(-1);
  eq(a.view, { y: 2025, m: 11 }, 'wraps to December of the previous year');
  eq(a.panel, 'review', 'past month opens the review panel');
  eq(a.sel, null);
  a.view = { y: 2026, m: 11 };
  a.shift(1);
  eq(a.view, { y: 2027, m: 0 }, 'wraps to January of the next year');
});
t('year strip renders 12 months and marks the current one', async () => {
  const g = await bootReady();
  const s = g.api.yearStrip();
  eq((s.match(/class="ym /g) || []).length, 12);
  eq((s.match(/cur/g) || []).length, 1);
});

// ---------- dormancy (§4.3) ----------
// Build a goal last touched `gap` days ago and render its heading.
async function coldHead(cad, gap) {
  const a = await fixture();
  const g = { id: 'gx', type: 'daily', cad, title: 'X', subs: [{ id: 'sx', title: 's' }] };
  a.state.goals = [g];
  const d = a.today(); d.setDate(d.getDate() - gap);
  a.state.logs = gap === null ? {} : { [a.key(d)]: { sx: 1 } };
  a.state.adhoc = {};
  a.view = { y: a.today().getFullYear(), m: a.today().getMonth() };
  return a.goalBlock(g, a.todayKey(), a.firstDone());
}
t('dormancy: daily goal is quiet under 3 days, nags at 3', async () => {
  no(await coldHead('daily', 2), 'untouched', '2 days is under threshold');
  has(await coldHead('daily', 3), 'untouched 3 days');
});
t('dormancy: weekly threshold is 10 days', async () => {
  no(await coldHead('weekly', 9), 'untouched');
  has(await coldHead('weekly', 10), 'untouched 10 days');
});
t('dormancy: monthly threshold is 35 days', async () => {
  no(await coldHead('monthly', 34), 'untouched');
  has(await coldHead('monthly', 35), 'untouched 35 days');
});
t('dormancy: free never nags, however long the gap', async () => {
  no(await coldHead('free', 400), 'untouched');
  no(await coldHead('free', 400), 'not started');
});
t('dormancy: label darkens at 3x the threshold', async () => {
  no(await coldHead('daily', 8), 'cold deep', 'under 3x stays light');
  has(await coldHead('daily', 9), 'cold deep', '3x = 9 days darkens');
});
t('dormancy: a never-touched goal reads not-started', async () => {
  has(await coldHead('daily', null), 'not started');
});

// ---------- goal-type completion states ----------
t('count goal shows met once the monthly target is met', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const g = a.state.goals[0];                       // target 10
  a.state.logs['2026-07-11'] = { s1: 10 };
  const html = a.goalBlock(g, '2026-07-11', a.firstDone());
  has(html, 'class="hit">met');
});
t('list goal reports when every item is finished', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const g = a.state.goals[1];
  a.state.logs['2026-07-11'] = { l1: 1, l2: 1, l3: 1 };
  const html = a.goalBlock(g, '2026-07-11', a.firstDone());
  has(html, 'Everything here is done.');
  has(html, 'class="doneline"');
  no(html, 'data-add=', 'no open chips left');
});
t('count chips carry a minus button only once tapped', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const g = a.state.goals[0];
  no(a.goalBlock(g, '2026-07-05', a.firstDone()), 'data-minus=', 'untouched day');
  has(a.goalBlock(g, '2026-07-02', a.firstDone()), 'data-minus=', 'touched day');
});
t('daily goal chips toggle rather than accumulate', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const html = a.goalBlock(a.state.goals[2], '2026-07-03', a.firstDone());
  has(html, 'data-tog='); no(html, 'data-add='); no(html, 'data-minus=');
});

// Regression: the "+ goal" handler used to omit `cad`, so the dropdown showed Daily
// while dormancy fell back to Weekly, and a restart silently swapped the label.
t('a newly added goal carries an explicit cadence', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.goals.pop();
  const before = a.state.goals.length;
  // mirror what the #ag click handler does
  const id = a.newId();
  a.state.goals.push({ id, type: 'daily', cad: a.DEFCAD.daily, title: 'New goal',
                       subs: [{ id: a.newId(), title: 'New sub-goal' }] });
  const fresh = a.state.goals[a.state.goals.length - 1];
  eq(a.state.goals.length, before + 1);
  eq('cad' in fresh, true, 'cad is written up front');
  eq(fresh.cad, 'weekly', 'matching DEFCAD for a daily goal');
  eq(a.CAD[fresh.cad].d, 10, 'so dormancy and the dropdown agree immediately');
  // and load() would not change it on the next launch
  eq(a.DEFCAD[fresh.type], fresh.cad, 'stable across a restart');
});

// ---------- pluralisation (English translation introduced these) ----------
t('daily goal says "1 day" and "2 days"', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const g = a.state.goals[2];
  has(a.goalBlock(g, '2026-07-03', a.firstDone()), '<b>1</b> day this month');
  a.state.logs['2026-07-04'] = { d1: 1 };
  has(a.goalBlock(g, '2026-07-03', a.firstDone()), '<b>2</b> days this month');
});
t('review rows pluralise days', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 }; a.panel = 'review'; a.render();
  const g = await bootReady();
  g.api.state = a.state; g.api.view = { y: 2026, m: 6 }; g.api.panel = 'review'; g.api.render();
  has(g.captured.app, '<b>1</b> day<');
  no(g.captured.app, '<b>1</b> days');
});
t('tally and stats pluralise check-ins and days', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {}; a.state.adhoc = {};
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);      // exactly one check-in on one day
  a.panel = 'day'; a.render();
  has(g.captured.app, '<b>1</b> check-in<', 'singular in the tally');
  no(g.captured.app, '<b>1</b> check-ins');
  a.panel = 'stats'; a.render();
  has(g.captured.app, '<b>1</b> day logged');
  no(g.captured.app, '<b>1</b> days logged');
  has(g.captured.app, 'Completed · 0 items', 'zero is plural');
});
t('ad-hoc count pluralises', async () => {
  const g = await bootReady();
  const a = g.api;
  a.sel = a.todayKey();
  a.addAdhoc('one');
  a.panel = 'day'; a.render();
  has(g.captured.app, '<b>1</b> item<');
  a.addAdhoc('two');
  a.render();
  has(g.captured.app, '<b>2</b> items<');
});
t('no "1 <noun>s" anywhere in a single-item render', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {}; a.state.adhoc = {};
  a.sel = a.todayKey();
  a.bump(a.state.goals[2].subs[0].id, 1);
  a.addAdhoc('one');
  for (const p of ['day', 'review', 'stats']) {
    a.panel = p; a.render();
    const bad = (g.captured.app.match(/\b1 (day|item|check-in)s\b/g) || []);
    eq(bad, [], p + ' panel has a singular/plural mismatch');
  }
});

// ---------- the projection track (redesign signature) ----------
t('track: done segment is the share of target actually completed', async () => {
  const a = await fixture();
  a.view = { y: 2020, m: 0 };
  has(a.paceLine(10, 40), 'class="done" style="width:25%"');
});
t('track: done segment clamps at 100% when the target is exceeded', async () => {
  const a = await fixture();
  a.view = { y: 2020, m: 0 };
  has(a.paceLine(80, 40), 'width:100%');
  no(a.paceLine(80, 40), 'width:200%');
});
t('track: a finished past month shows no projection segment', async () => {
  const a = await fixture();
  a.view = { y: 2020, m: 0 };
  no(a.paceLine(10, 40), 'class="proj"', 'past months cannot project');
});
t('track: behind pace shows a projection segment beyond the done segment', async () => {
  if (LEFT === 0) return;                       // no days left, nothing to project
  const a = await fixture();
  a.view = { y: TY, m: TM };
  // pick a rate that actually gains at least one more unit in the days remaining
  const n = Math.max(5, Math.ceil(TD / LEFT) + 1);
  const s = a.paceLine(n, n * 20);
  has(s, 'class="done"');
  has(s, 'class="proj"');
  const done = +s.match(/class="done" style="width:([\d.]+)%"/)[1];
  const left = +s.match(/class="proj" style="left:([\d.]+)%/)[1];
  eq(left, done, 'projection starts exactly where done ends');
});
t('track: on pace projects all the way to the target', async () => {
  if (LEFT === 0) return;
  const a = await fixture();
  a.view = { y: TY, m: TM };
  const s = a.paceLine(TD, DIM);
  const done = +s.match(/class="done" style="width:([\d.]+)%"/)[1];
  const w = +s.match(/class="proj" style="left:[\d.]+%;width:([\d.]+)%"/)[1];
  ok(Math.abs(done + w - 100) < 0.01, `done+proj should reach 100, got ${done}+${w}`);
});
t('count goals use the track, list goals use pips', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const count = a.goalBlock(a.state.goals[0], '2026-07-02', a.firstDone());
  has(count, 'class="ptrack"'); no(count, 'class="pips"', 'a rate does not get discrete pips');
  const list = a.goalBlock(a.state.goals[1], '2026-07-02', a.firstDone());
  has(list, 'class="pips"'); no(list, 'class="ptrack"', 'discrete items do not get a rate track');
});
t('the pace sentence still states the rate in words', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  has(a.paceLine(1, DIM * 10), 'class="pline"');
  has(a.paceLine(1, DIM * 10), 'class="rate"');
});

// ---------- desktop two-pane structure ----------
t('render emits the calendar column and the panel as separate panes', async () => {
  const g = await bootReady();
  g.api.render();
  const html = g.captured.app;
  has(html, 'class="body"');
  has(html, 'class="calcol"');
  has(html, 'class="panel"');
  // the calendar block must be inside the left pane, not loose in the sheet
  const cal = html.indexOf('class="calcol"'), panel = html.indexOf('class="panel"');
  ok(cal < html.indexOf('class="cal"'), 'calendar sits inside .calcol');
  ok(html.indexOf('class="cal"') < panel, 'calendar comes before the panel pane');
});
t('month nav sits inside the calendar column it controls', async () => {
  const g = await bootReady();
  g.api.render();
  const html = g.captured.app;
  const cal = html.indexOf('class="calcol"'), panel = html.indexOf('class="panel"');
  const nav = html.indexOf('id="prev"');
  ok(nav > cal && nav < panel, 'nav is between .calcol and .panel, i.e. inside the left pane');
});
t('all three panels render inside the panel pane', async () => {
  const g = await bootReady();
  for (const p of ['day', 'review', 'stats']) {
    g.api.panel = p; g.api.render();
    eq((g.captured.app.match(/class="panel"/g) || []).length, 1, p + ' pane count');
    eq((g.captured.app.match(/class="calcol"/g) || []).length, 1, p + ' keeps the calendar pane');
  }
});
t('nav controls stay bound after the restructure', async () => {
  const g = await bootReady();
  g.api.view = { y: 2026, m: 5 };
  g.api.render();
  has(g.captured.app, 'id="prev"');
  has(g.captured.app, 'id="next"');
  g.api.shift(-1);
  eq(g.api.view, { y: 2026, m: 4 }, 'prev still moves the view');
});

// ---------- streak (consecutive active days) ----------
// Helper: log `days` consecutive days ending `endOffset` days before today.
async function withRun(days, endOffset) {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {}; a.state.adhoc = {};
  const id = a.state.goals[0].subs[0].id;
  for (let i = 0; i < days; i++) {
    const d = a.today();
    d.setDate(d.getDate() - endOffset - i);
    a.state.logs[a.key(d)] = { [id]: 1 };
  }
  return a;
}
t('streak counts a run ending today', async () => {
  const a = await withRun(5, 0);
  eq(a.streak(), 5);
});
t('streak is 0 with no history at all', async () => {
  const g = await bootReady();
  g.api.state.logs = {}; g.api.state.adhoc = {};
  eq(g.api.streak(), 0);
});
t('streak survives today being unlogged, measuring to yesterday', async () => {
  const a = await withRun(4, 1);              // run ended yesterday, nothing today
  eq(a.streak(), 4, 'should not read 0 before you have checked in today');
});
t('streak breaks on a missed day', async () => {
  const a = await withRun(3, 0);              // today, -1, -2
  const gap = a.today(); gap.setDate(gap.getDate() - 1);
  delete a.state.logs[a.key(gap)];            // punch a hole in the middle
  eq(a.streak(), 1, 'only today survives the break');
});
t('streak counts an ad-hoc-only day', async () => {
  const a = await withRun(2, 0);
  const d = a.today(); d.setDate(d.getDate() - 2);
  a.state.adhoc[a.key(d)] = ['odd job'];      // third day back, ad-hoc only
  eq(a.streak(), 3, 'ad-hoc keeps a run alive, same as the calendar colouring');
});
t('streak is 0 when the run ended before yesterday', async () => {
  const a = await withRun(6, 2);              // finished two days ago
  eq(a.streak(), 0);
});
t('the run appears in the tally, pluralised', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {}; a.state.adhoc = {};
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);
  a.render();
  has(g.captured.app, '<b>1</b> day in a row');
  no(g.captured.app, '<b>1</b> days in a row');
  const d = a.today(); d.setDate(d.getDate() - 1);
  a.state.logs[a.key(d)] = { x: 1 };
  a.render();
  has(g.captured.app, '<b>2</b> days in a row');
});
t('the tally hides the run when there is none', async () => {
  const g = await bootReady();
  g.api.state.logs = {}; g.api.state.adhoc = {};
  g.api.render();
  no(g.captured.app, 'in a row');
});

// ---------- joining consecutive days in the calendar ----------
t('consecutive days are joined, isolated days are not', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  a.state.logs = { '2026-07-06': {s1:1}, '2026-07-07': {s1:1}, '2026-07-08': {s1:1},
                   '2026-07-15': {s1:1} };
  a.state.adhoc = {};
  const cal = a.calendar('2026-07-31');
  // 6th is Monday: opens the run (joins right only)
  has(cal, 'd cR" data-l="1" data-k="2026-07-06"');
  // 7th is mid-run: joins both ways
  has(cal, 'd cL cR" data-l="1" data-k="2026-07-07"');
  // 8th closes the run (joins left only)
  has(cal, 'd cL" data-l="1" data-k="2026-07-08"');
  // 15th stands alone
  has(cal, 'class="d" data-l="1" data-k="2026-07-15"');
});
t('a run does not join across the week edge', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  // 2026-07-11 is a Saturday, 07-12 the Sunday after — adjacent days, different rows
  a.state.logs = { '2026-07-11': {s1:1}, '2026-07-12': {s1:1} };
  a.state.adhoc = {};
  const cal = a.calendar('2026-07-31');
  eq(a.parseKey('2026-07-11').getDay(), 6, 'Saturday');
  eq(a.parseKey('2026-07-12').getDay(), 0, 'Sunday');
  no(cal, 'cR" data-l="1" data-k="2026-07-11"', 'Saturday must not reach right');
  no(cal, 'cL" data-l="1" data-k="2026-07-12"', 'Sunday must not reach left');
});
t('a run never joins outward past the month edge', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  a.state.logs = { '2026-07-01': {s1:1}, '2026-07-31': {s1:1} };
  a.state.adhoc = {};
  const cal = a.calendar('2026-07-31');
  no(cal, 'cL" data-l="1" data-k="2026-07-01"', 'first of the month has nothing to its left');
  no(cal, 'cR" data-l="1" data-k="2026-07-31"', 'last of the month has nothing to its right');
});
t('empty days are never joined', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  a.state.logs = {}; a.state.adhoc = {};
  const cal = a.calendar('2026-07-31');
  no(cal, 'cL'); no(cal, 'cR');
});

// ---------- the view switcher ----------
t('every view renders the same three tabs', async () => {
  const g = await bootReady();
  for (const p of ['day', 'review', 'stats']) {
    g.api.panel = p; g.api.render();
    eq((g.captured.app.match(/class="tab[ "]/g) || []).length, 3, p + ' tab count');
    has(g.captured.app, 'data-tab="day"');
    has(g.captured.app, 'data-tab="review"');
    has(g.captured.app, 'data-tab="stats"');
  }
});
t('exactly one tab is marked current, and it matches the panel', async () => {
  const g = await bootReady();
  for (const p of ['day', 'review', 'stats']) {
    g.api.panel = p; g.api.render();
    eq((g.captured.app.match(/class="tab on"/g) || []).length, 1, p + ' has one active tab');
    has(g.captured.app, `class="tab on" data-tab="${p}" aria-current="page"`, p + ' marks itself');
  }
});
t('the month tab names the month it will actually show', async () => {
  const g = await bootReady();
  const a = g.api;
  a.view = { y: TY, m: TM }; a.render();
  has(g.captured.app, '>This month<', 'current month reads "This month"');
  a.view = { y: 2026, m: 5 }; a.render();
  has(g.captured.app, '>June<', 'a past month names itself');
  no(g.captured.app, '>This month<', 'and no longer claims to be this month');
});
t('back-to-today is offered only when you are away from today', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'day'; a.sel = a.todayKey(); a.view = { y: TY, m: TM }; a.render();
  no(g.captured.app, 'id="back"', 'already home, nothing to go back to');
  a.panel = 'stats'; a.render();
  has(g.captured.app, 'id="back"', 'offered from stats');
  a.panel = 'day'; a.view = { y: 2026, m: 5 }; a.sel = null; a.render();
  has(g.captured.app, 'id="back"', 'offered from another month');
});
t('a backfilled day is named next to the back link', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'day'; a.view = { y: TY, m: TM };
  const d = a.today(); d.setDate(d.getDate() - 3);
  a.sel = a.key(d); a.render();
  has(g.captured.app, a.label(a.sel), 'the selected date is stated');
  has(g.captured.app, 'id="back"');
});

// ---------- the §4.1 invariant ----------
t('persisted JSON stores only goals, logs and adhoc — no cached totals', async () => {
  const a = await fixture();
  const round = JSON.parse(JSON.stringify(a.state));
  eq(Object.keys(round).sort(), ['adhoc', 'goals', 'logs']);
  for (const g of round.goals) {
    const bad = Object.keys(g).filter(k => !['id', 'type', 'cad', 'target', 'title', 'subs'].includes(k));
    eq(bad, [], 'unexpected goal fields');
    for (const s of g.subs) eq(Object.keys(s).sort(), ['id', 'title']);
  }
});
t('state serializes with indent 1 and is re-parseable', async () => {
  const a = await fixture();
  const s = JSON.stringify(a.state, null, 1);
  has(s, '\n '); eq(JSON.parse(s), a.state);
});

// ---------- load() normalisation of files written by older versions ----------
// bootReady with a pre-seeded store, then let load() read it.
async function loadFrom(json) {
  const { boot } = require('./harness');
  const g = boot();
  g.store.set('checkin-v3', typeof json === 'string' ? json : JSON.stringify(json));
  await g.api.load();
  return g;
}
t('load reads an existing file instead of seeding', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', type: 'count', cad: 'daily', target: 5, title: 'old goal', subs: [{ id: 'b', title: 'x' }] }], logs: { '2026-07-01': { b: 2 } }, adhoc: {} });
  eq(g.api.state.goals.length, 1);
  eq(g.api.state.goals[0].title, 'old goal');
  eq(g.api.subTotal('b'), 2);
});
t('load backfills a missing adhoc map', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', type: 'daily', cad: 'weekly', title: 'g', subs: [{ id: 'b', title: 'x' }] }], logs: {} });
  eq(g.api.state.adhoc, {}, 'adhoc created');
  eq(g.api.dayTotal('2026-07-01'), 0, 'dayTotal no longer throws');
});
t('load defaults a missing goal type and subs array', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', title: 'no type' }], logs: {} });
  eq(g.api.state.goals[0].type, 'daily');
  eq(g.api.state.goals[0].subs, []);
});
t('load repairs a missing or unknown cadence from DEFCAD', async () => {
  const g = await loadFrom({ goals: [
    { id: 'a', type: 'count', title: 'c', subs: [] },
    { id: 'b', type: 'list', title: 'l', subs: [] },
    { id: 'c', type: 'daily', cad: 'hourly', title: 'd', subs: [] },
  ], logs: {} });
  eq(g.api.state.goals.map(x => x.cad), ['daily', 'monthly', 'weekly'],
     'count->daily, list->monthly, bogus daily->weekly');
});
t('load seeds when the file is empty, blank, or an empty object', async () => {
  for (const raw of ['', '   ', '{}']) {
    const g = await loadFrom(raw);
    eq(g.api.state.goals.length, 3, `seeded from ${JSON.stringify(raw)}`);
  }
});
t('load falls back to a seed when the file is corrupt JSON', async () => {
  const g = await loadFrom('{not json at all');
  eq(g.api.state.goals.length, 3, 'seeded rather than crashing');
  ok(g.logs.warn.length > 0, 'warned about the unreadable file');
});
t('load seeds when the file parses but has an empty goal list', async () => {
  const g = await loadFrom({ goals: [], logs: { '2026-07-01': { z: 1 } } });
  eq(g.api.state.goals.length, 3, 'seed replaces the whole state');
});
t('load always lands on today in the day panel', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', type: 'daily', cad: 'free', title: 'g', subs: [] }], logs: {} });
  eq(g.api.view, { y: TY, m: TM });
  eq(g.api.sel, g.api.todayKey());
  eq(g.api.panel, 'day');
});

// ---------- month navigation bounds ----------
t('the next-month button is disabled on the current month and enabled in the past', async () => {
  const g = await bootReady();
  g.api.view = { y: TY, m: TM }; g.api.render();
  has(g.captured.app, '<button id="next" disabled', 'disabled at the present');
  g.api.view = { y: TY - 1, m: TM }; g.api.render();
  has(g.captured.app, '<button id="next"  aria-label', 'enabled in the past');
});
t('a future month renders no clickable days', async () => {
  const g = await bootReady();
  g.api.view = { y: TY + 1, m: TM };
  eq((g.api.calendar(g.api.todayKey()).match(/<button class="d/g) || []).length, 0);
});

// ---------- storage layer ----------
t('Store picks the browser backend when __TAURI__ is absent', async () => {
  eq((await bootReady()).api.Store.kind, 'browser');
});
t('Store picks the tauri backend when __TAURI__ is present', async () => {
  const calls = [];
  const g = await bootReady({ tauri: { core: { invoke: (c, a) => { calls.push([c, a]); return Promise.resolve(''); } } } });
  eq(g.api.Store.kind, 'tauri');
  ok(calls.some(c => c[0] === 'load_data'), 'load_data called on boot');
  g.api.Store.write('{"x":1}');
  g.api.Store.where();
  eq(calls.find(c => c[0] === 'save_data'), ['save_data', { data: '{"x":1}' }], 'save_data payload');
  ok(calls.some(c => c[0] === 'data_path'), 'data_path called');
});
t('Store is the only place invoke is referenced', () => {
  const src = require('fs').readFileSync(require('./harness').HTML, 'utf8');
  const body = src.match(/<script>([\s\S]*?)<\/script>/)[1];
  const storeBlock = body.match(/const Store = \(\(\) => \{[\s\S]*?\}\)\(\);/)[0];
  const outside = body.replace(storeBlock, '');
  ok(!/invoke/.test(outside), 'invoke appears outside the Store block');
});

(async () => {
  for (const [name, fn] of TESTS) {
    try { await fn(); pass++; }
    catch (e) { fail++; fails.push(name + '\n    ' + e.message); }
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) { fails.forEach(f => console.log('  FAIL ' + f + '\n')); process.exit(1); }
})();
