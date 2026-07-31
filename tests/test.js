// Frontend logic tests for src/index.html. Run: node test.js
const { boot, bootReady } = require('./harness');

// Pin the date so month-boundary behaviour is asserted, not left to the calendar.
async function onDate(iso) {
  const g = await bootReady({ now: iso });
  g.api.state.logs = {};
  return g;
}

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
      { id: 'g1', type: 'count', target: 10, title: 'Problems',
        subs: [{ id: 's1', title: 'DP' }, { id: 's2', title: 'Trees' }] },
      { id: 'g2', type: 'list', title: 'To learn',
        subs: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }, { id: 'l3', title: 'C' }] },
      { id: 'g3', type: 'daily', title: 'Job hunt',
        subs: [{ id: 'd1', title: 'Applications' }] },
    ],
    logs: {
      '2026-06-30': { s1: 5 },
      '2026-07-02': { s1: 2, s2: 1 },
      '2026-07-03': { d1: 1 },
      '2026-07-10': { s1: 3, l1: 1 },
      '2026-08-01': { s2: 4 },
    },
  };
  g.api.view = { y: 2026, m: 6 };
  return g.api;
}

t('dayTotal sums the check-ins logged against a day', async () => {
  const a = await fixture();
  eq(a.dayTotal('2026-07-02'), 3, 'two subs, 2 + 1');
  eq(a.dayTotal('2026-07-03'), 1);
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
// Everything that measures activity goes through dayKeys(), so there is one place
// to change if a second source of activity is ever added back.
t('dayKeys lists every logged day once, sorted', async () => {
  const a = await fixture();
  const ks = a.dayKeys();
  eq(ks.filter(k => k === '2026-07-03').length, 1, 'no duplicate');
  eq(ks, [...ks].sort(), 'sorted, so ks[0] is the earliest activity');
  eq(ks[0], '2026-06-30');
});
t('firstDone records the earliest date per sub', async () => {
  const a = await fixture();
  const F = a.firstDone();
  eq(F.s1, '2026-06-30', 'earliest wins, not latest');
  eq(F.l1, '2026-07-10');
  eq(F.l2, undefined, 'untouched sub absent');
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
// Pace is drawn and no longer narrated, so what each branch has to get right is how
// far the two segments reach. The geometry itself is asserted under "the projection
// track" below; these cover which branch produces which shape.
t('pace: a past month shows what was done and never projects', async () => {
  const a = await fixture();
  a.view = { y: 2020, m: 0 };
  has(a.paceLine(40, 40), 'class="done" style="width:100%"');
  no(a.paceLine(40, 40), 'class="proj"', 'a finished month has no future');
  has(a.paceLine(33, 40), 'class="done" style="width:82.5%"');
  no(a.paceLine(33, 40), 'class="proj"');
});
t('pace: a met target fills the track and projects nothing further', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  const s = a.paceLine(40, 40);
  has(s, 'width:100%'); no(s, 'class="proj"');
});
// The line this replaced opened with "N days left · 20.0 a day gets there" — a demand
// made of a goal you had not started. Same principle as dropping "not started" (§4.3).
t('pace: a goal with nothing done shows an empty track and asks for nothing', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  const s = a.paceLine(0, 40);
  has(s, 'class="done" style="width:0%"');
  no(s, 'class="proj"', 'nothing to infer a rate from');
  no(s, 'a day gets there', 'and it no longer asks for one');
});
t('pace never emits NaN or Infinity', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };          // July, 31 days
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
t('achievements: list completions and count-goal target hits, newest first', async () => {
  const a = await fixture();
  a.state.logs = {
    '2026-07-01': { s1: 4 },
    '2026-07-02': { s1: 4 },
    '2026-07-03': { s1: 4 },   // cumulative 12 >= target 10 -> hit fires here
    '2026-07-04': { s1: 4 },   // still over target -> must NOT fire again
    '2026-07-05': { l1: 1 },
    '2026-08-20': { s1: 20 },  // new month -> fires again
  };
  const out = a.achievements();
  const hits = out.filter(x => x.hit);
  eq(hits.length, 2, 'one hit per month, fired once each');
  eq(hits.map(x => x.d).sort(), ['2026-07-03', '2026-08-20']);
  ok(out.some(x => x.t === 'A' && x.d === '2026-07-05'), 'list item recorded');
  const dates = out.map(x => x.d);
  eq(dates, [...dates].sort().reverse(), 'sorted newest first');
});
t('achievements is empty for a fresh log', async () => {
  const a = await fixture();
  a.state.logs = {};
  eq(a.achievements().length, 0);
});

// ---------- rendering ----------
t('day panel renders the calendar, the goals and their chips', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'day';
  a.render();
  const html = g.captured.app;
  has(html, 'class="cal"');
  no(html, 'class="year"', 'the year strip is gone; ‹ › and the stats chart navigate months');
  has(html, 'Problems'); has(html, 'To learn'); has(html, 'Job hunt');
  has(html, 'data-add='); has(html, 'data-tog=');
  no(html, 'Ad-hoc', 'the ad-hoc section is gone');
  no(html, 'id="adhocIn"');
});
// Stats answers one question now: how much have I done. Everything it used to draw
// answered a different one — when in the week do I work, am I trending, what share is
// each goal of the whole — and none of those is an amount.
t('stats is one amount per goal and the list of finished things', async () => {
  const g = await bootReady();
  const a = g.api;
  a.panel = 'stats'; a.render();
  const html = g.captured.app;
  has(html, 'By goal'); has(html, 'Completed');
  eq((html.match(/class="amtrow"/g) || []).length, 3, 'one row per goal');
  no(html, 'Last 12 months'); no(html, 'By weekday'); no(html, 'share of check-ins');
  no(html, 'class="cols"'); no(html, 'data-jm=', 'the month chart is gone, and with it the jump');
});
t('the amount a goal shows is scoped to what that goal counts', async () => {
  const a = await fixture();
  const [count, list, daily] = a.state.goals;
  eq(a.goalAmount(count), { v: 15, u: 'check-ins' }, 's1 10 + s2 5, all time');
  eq(a.goalAmount(list), { v: 1, u: 'of 3 done' }, 'crossed off, not tapped');
  // d1 was logged on one day; three sub-goals ticked on one day is still one day
  eq(a.goalAmount(daily), { v: 1, u: 'day' });
  a.state.logs['2026-07-04'] = { d1: 1 };
  eq(a.goalAmount(daily), { v: 2, u: 'days' });
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
  has(html, `data-gy="${target.id}"`);
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
// + goal sits at the end of the list it appends to, not in a footer that spans both
// columns and lands under the calendar. It never hides: a control that disappears at
// the cap leaves no way in and nothing saying a cap exists.
t('the add-goal entry point closes the goal list and states the cap beside itself', async () => {
  const g = await bootReady();
  const a = g.api;
  a.render();
  const panel = a.dayPanel(a.todayKey(), a.todayKey());
  has(panel, 'class="addrow"', 'it lives in the day panel, with the goals');
  has(panel, 'id="ag"');
  ok(panel.indexOf('id="ag"') > panel.lastIndexOf('class="goal"'), 'after the last goal');
  no(panel, 'You already have', 'three of five: nothing in the way');
  while (a.live().length < a.MAXGOALS) a.state.goals.push({ id: a.newId(), type: 'daily', title: 'x', subs: [] });
  const atCap = a.dayPanel(a.todayKey(), a.todayKey());
  has(atCap, 'id="ag"', 'still offered at the cap');
  has(atCap, `You already have ${a.MAXGOALS}. Remove one to add another.`, 'and says so');
  a.render(); a.bind();
  g.els.get('ag').onclick();
  eq(a.live().length, a.MAXGOALS, 'clicking it declines rather than adding a sixth');
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
  for (const p of ['day', 'stats']) {
    a.panel = p; a.render();
    no(g.captured.app, '<script>x</script>', p + ' panel leaked raw markup');
    has(g.captured.app, '&lt;script&gt;', p + ' panel escaped');
  }
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
  a.state = { goals: [], logs: {} };
  for (const p of ['day', 'stats']) { a.panel = p; a.render(); ok(g.captured.app.length > 100, p); }
  has(g.captured.app, 'No goals yet');
});
t('navigating months moves the calendar and leaves the panel alone', async () => {
  const g = await bootReady();
  const a = g.api;
  a.view = { y: 2026, m: 0 };
  a.shift(-1);
  eq(a.view, { y: 2025, m: 11 }, 'wraps to December of the previous year');
  eq(a.panel, 'day', 'there is no review panel to switch to any more');
  eq(a.sel, null, 'but no day in a past month is selected until you click one');
  a.view = { y: 2026, m: 11 };
  a.shift(1);
  eq(a.view, { y: 2027, m: 0 }, 'wraps to January of the next year');
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
t('a newly added goal is written with everything load() needs', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.goals.pop();
  const before = a.state.goals.length;
  const id = a.newId();          // mirror what the #ag click handler does
  a.state.goals.push({ id, type: 'daily', title: 'New goal',
                       subs: [{ id: a.newId(), title: 'New sub-goal' }] });
  const fresh = a.state.goals[a.state.goals.length - 1];
  eq(a.state.goals.length, before + 1);
  eq([fresh.type, fresh.subs.length], ['daily', 1]);
  const copy = JSON.parse(JSON.stringify(a.state));   // what load() would read back
  eq(copy.goals[copy.goals.length - 1], fresh, 'a save/load round trip changes nothing');
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
// The summary line that used to head this panel — days logged, check-ins, attendance,
// and the "Since Jul 31" span — is gone. Stats is four charts and nothing else.
t('stats opens straight into its charts, with no summary figures', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {};
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);
  const html = a.statsPanel();          // the panel alone: the calendar column has its own run readout
  no(html, 'day logged'); no(html, 'attendance'); no(html, 'Since ');
  no(html, 'class="tally', 'no readout block in here any more');
  has(html, 'Completed · 0 items', 'and zero is still plural');
});
t('no "1 <noun>s" anywhere in a single-item render', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {};
  a.sel = a.todayKey();
  a.bump(a.state.goals[2].subs[0].id, 1);
  for (const p of ['day', 'stats']) {
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
t('pace is drawn, never narrated', async () => {
  const a = await fixture();
  a.view = { y: TY, m: TM };
  const s = a.paceLine(1, DIM * 10);
  no(s, 'class="pline"'); no(s, 'class="rate"');
  no(s, '/day'); no(s, 'short'); no(s, 'by month end');
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
  for (const p of ['day', 'stats']) {
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
  a.state.logs = {};
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
  g.api.state.logs = {};
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
t('streak is 0 when the run ended before yesterday', async () => {
  const a = await withRun(6, 2);              // finished two days ago
  eq(a.streak(), 0);
});
t('the run appears in the tally, pluralised', async () => {
  const g = await bootReady();
  const a = g.api;
  a.state.logs = {};
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);
  a.render();
  has(g.captured.app, '<b>1</b><em>day in a row');
  no(g.captured.app, '<b>1</b><em>days in a row');
  const d = a.today(); d.setDate(d.getDate() - 1);
  a.state.logs[a.key(d)] = { x: 1 };
  a.render();
  has(g.captured.app, '<b>2</b><em>days in a row');
});
// The run is the only readout left under the calendar and it hides itself at zero,
// so the container has to go with it — an empty one would draw its rule under nothing,
// the same way the footer did.
t('the readout block disappears entirely when there is no run', async () => {
  const g = await bootReady();
  g.api.state.logs = {};
  g.api.render();
  no(g.captured.app, 'in a row');
  no(g.captured.app, 'class="tally mono"', 'no container, so no rule');
  no(g.captured.app, 'active this month', 'the active-days readout is gone for good');
  g.api.sel = g.api.todayKey();
  g.api.bump(g.api.state.goals[0].subs[0].id, 1);
  has(g.captured.app, 'class="tally mono"', 'and it returns once there is a run');
});

// ---------- the Done line folds ----------
// A long list finishes far more than it keeps open, and the finished pile is the least
// actionable thing on screen. Unfolded, 23 of them pushed the next goal off the bottom.
async function longList(doneCount) {
  const g = await bootReady({ now: '2026-07-31' });
  const a = g.api;
  const subs = Array.from({ length: 40 }, (_, i) => ({ id: 'l' + i, title: 'Topic ' + i }));
  const logs = {};
  // crossed off one a week, so the dates are distinct and ordered
  subs.slice(0, doneCount).forEach((s, i) => { logs['2026-0' + (1 + (i % 6)) + '-' + String(1 + i % 28).padStart(2, '0')] = { [s.id]: 1 }; });
  a.state = { goals: [{ id: 'gl', type: 'list', title: 'To learn', subs }], logs };
  a.view = { y: 2026, m: 6 };
  a.doneOpen.clear();
  return a;
}
t('a short Done line is shown whole, with nothing to unfold', async () => {
  const a = await longList(4);
  const html = a.goalBlock(a.state.goals[0], a.todayKey(), a.firstDone());
  eq((html.match(/class="undone"/g) || []).length, 4, 'all four');
  no(html, 'more'); no(html, 'Show fewer');
});
t('a long Done line folds to DONEMAX, saying how many are hidden', async () => {
  const a = await longList(23);
  const html = a.goalBlock(a.state.goals[0], a.todayKey(), a.firstDone());
  eq((html.match(/class="undone"/g) || []).length, a.DONEMAX, 'five shown');
  has(html, '+18 more', 'and the rest are counted, not silently dropped');
  has(html, '<b>23</b><i>/40</i>', 'the count beside the title still says 23 of 40');
});
t('unfolding shows every finished item, and offers the way back', async () => {
  const a = await longList(23);
  a.doneOpen.add('gl');
  const html = a.goalBlock(a.state.goals[0], a.todayKey(), a.firstDone());
  eq((html.match(/class="undone"/g) || []).length, 23, 'all of them');
  has(html, 'Show fewer');
  no(html, 'more<', 'and nothing left to expand');
});
t('the Done line is newest first, so the fold keeps what you just crossed off', async () => {
  const a = await longList(23);
  const html = a.goalBlock(a.state.goals[0], a.todayKey(), a.firstDone());
  const dates = [...html.matchAll(/<em>(\d+\/\d+)<\/em>/g)].map(m => m[1]);
  eq(dates.length, a.DONEMAX);
  const F = a.firstDone();
  const shown = [...html.matchAll(/data-clear="(l\d+)"/g)].map(m => m[1]);
  const newest = a.state.goals[0].subs.filter(s => F[s.id]).sort((x, y) => F[x.id] < F[y.id] ? 1 : -1)
    .slice(0, a.DONEMAX).map(s => s.id);
  eq(shown, newest, 'the five most recently finished');
});

// ---------- reordering goals ----------
// state.goals is the render order, so a move is a splice and persistence is free. The
// screen shows live(), so the risky part is that an archived goal sits in the array
// without being on screen — every move is resolved against the array, never a screen index.
t('a goal moves to before another one', async () => {
  const a = await fixture();
  a.moveGoal('g3', 'g1');
  eq(a.state.goals.map(x => x.id), ['g3', 'g1', 'g2']);
  a.moveGoal('g3', null);
  eq(a.state.goals.map(x => x.id), ['g1', 'g2', 'g3'], 'null means last');
});
t('moving a goal onto itself, or a goal that is not there, changes nothing', async () => {
  const a = await fixture();
  const before = a.state.goals.map(x => x.id);
  a.moveGoal('g2', 'g2');
  a.moveGoal('nope', 'g1');
  eq(a.state.goals.map(x => x.id), before);
});
t('the arrow keys move a goal one visible place', async () => {
  const a = await fixture();
  a.nudgeGoal('g3', -1);
  eq(a.state.goals.map(x => x.id), ['g1', 'g3', 'g2'], 'up');
  a.nudgeGoal('g3', 1);
  eq(a.state.goals.map(x => x.id), ['g1', 'g2', 'g3'], 'and back down');
});
t('a goal at either end does not wrap round', async () => {
  const a = await fixture();
  a.nudgeGoal('g1', -1);
  a.nudgeGoal('g3', 1);
  eq(a.state.goals.map(x => x.id), ['g1', 'g2', 'g3'], 'both moves refused');
});
// The trap: an archived goal is in the array but not on screen, so "one place down"
// counted in screen positions would jump it.
t('reordering steps over an archived goal instead of through it', async () => {
  const a = await fixture();
  a.state.logs = { '2026-07-02': { s2: 1 } };     // only g1 has history
  a.dropGoal('g1');                               // archived: still in the array, off screen
  eq(a.state.goals.map(x => x.id), ['g1', 'g2', 'g3']);
  eq(a.live().map(x => x.id), ['g2', 'g3'], 'two on screen');
  a.nudgeGoal('g3', -1);
  eq(a.live().map(x => x.id), ['g3', 'g2'], 'the visible order swapped');
  ok(a.state.goals.includes(a.state.goals.find(x => x.id === 'g1')), 'and g1 is still there');
});
t('every goal offers a drag handle, and it names the goal it moves', async () => {
  const g = await bootReady();
  const a = g.api;
  a.render();
  const html = g.captured.app;
  eq((html.match(/class="ghandle"/g) || []).length, 3, 'one per goal');
  has(html, 'aria-label="Move Problems"');
  has(html, 'data-goal="' + a.state.goals[0].id + '"');
  a.editing = a.state.goals[0].id; a.render();
  eq((g.captured.app.match(/class="ghandle"/g) || []).length, 2,
     'the goal being edited has no handle: its text has to stay selectable');
});

// ---------- the year heatmap ----------
// The same encoding as the calendar at a wider zoom: one cell per day, the same ramp,
// the same rule that past days are filled and future ones outlined.
t('the heatmap is a year of days, 53 weeks by 7, ending on today', async () => {
  const g = await bootReady({ now: '2026-07-31' });
  const a = g.api;
  const html = a.heatmap();
  eq((html.match(/class="hd/g) || []).length, a.HWEEKS * 7, 'every day has a cell');
  const start = a.heatStart();
  eq(start.getDay(), 0, 'the grid starts on a Sunday, so the rows are weekdays');
  eq(a.diffDays(start, a.today()), (a.HWEEKS - 1) * 7 + a.today().getDay(),
     'and runs up to today');
  has(html, `data-hk="${a.todayKey()}"`, 'today has a cell');
  has(html, 'class="hd today"');
});
t('heatmap days after today are outlined and not clickable', async () => {
  const g = await bootReady({ now: '2026-07-31' });      // a Friday: Sat is still to come
  const html = g.api.heatmap();
  eq((html.match(/class="hd future"/g) || []).length, 1, 'the rest of this week');
  no(html, 'data-hk="2026-08-01"', 'a future day carries no jump target');
});
t('a heatmap cell carries the same level as the calendar cell for that day', async () => {
  const a = await fixture();
  a.view = { y: 2026, m: 6 };
  const day = '2026-07-02';                              // s1 2 + s2 1 = 3 check-ins
  eq(a.dayTotal(day), 3);
  const lvl = a.level(3);
  has(a.heatmap(), `data-l="${lvl}" data-hk="${day}"`);
  has(a.calendar(a.todayKey()), `data-l="${lvl}" data-k="${day}"`);
});
t('a heatmap cell names its date and count in a tooltip', async () => {
  const a = await fixture();
  has(a.heatmap(), 'title="Jul 2 · 3 check-ins"');
  has(a.heatmap(), 'title="Jul 3 · 1 check-in"', 'singular');
});
// Labelling by the week's last day named a month a column early — the week of Jul 26
// ends on Aug 1, and was headed "Aug" while six of its seven days were July.
t('the heatmap labels a month at the first week that begins inside it', async () => {
  const g = await bootReady({ now: '2026-07-31' });
  const a = g.api;
  const html = a.heatmap();
  const labels = [...html.matchAll(/<i>([A-Z][a-z]{2})(?: (\d{4}))?<\/i>/g)].map(m => m[1]);
  const years = [...html.matchAll(/<i>[A-Z][a-z]{2} (\d{4})<\/i>/g)].map(m => m[1]);
  // a 53-week window spans two calendar years, so "Jul ... Jan ... Jul" would not say
  // which July you are looking at
  eq(years, ['2025', '2026'], 'the year is named on the first label and where it changes');
  const idx = labels.map(x => a.MONS.indexOf(x));
  ok(idx.every(x => x >= 0), 'every label is a real month: ' + labels.join(' '));
  // unwrap the year boundary, then the sequence must strictly increase
  let carry = 0;
  const abs = idx.map((m, i) => { if (i && m < idx[i - 1]) carry += 12; return m + carry; });
  ok(abs.every((v, i) => i === 0 || v > abs[i - 1]),
     'in chronological order, none repeated: ' + labels.join(' '));
  eq(labels[labels.length - 1], 'Jul', 'ending on the month in progress, not the next one');
  eq(labels[0], 'Jul', 'a 53-week window opens in the same month it closes in');
  // Two are dropped, both for the same reason. Aug: the window opens on Jul 27, so its
  // first Sunday is one column after July's label. Feb: it follows "Jan 2026", which is
  // nearly twice as wide as a bare month and claims the room to prove it.
  eq(labels.length, 11, 'a label too close to the previous one is dropped, not crowded');
  no(labels.join(' '), 'Jul Aug');
  no(labels.join(' '), 'Jan Feb', 'the pair that collided once the year was added');
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
  a.state.logs = {};
  const cal = a.calendar('2026-07-31');
  no(cal, 'cL'); no(cal, 'cR');
});

// ---------- the view switcher ----------
t('every view renders the same two tabs', async () => {
  const g = await bootReady();
  for (const p of ['day', 'stats']) {
    g.api.panel = p; g.api.render();
    eq((g.captured.app.match(/class="tab[ "]/g) || []).length, 2, p + ' tab count');
    has(g.captured.app, 'data-tab="day"');
    has(g.captured.app, 'data-tab="stats"');
    no(g.captured.app, 'data-tab="review"', 'the month review is gone');
  }
});
t('exactly one tab is marked current, and it matches the panel', async () => {
  const g = await bootReady();
  for (const p of ['day', 'stats']) {
    g.api.panel = p; g.api.render();
    eq((g.captured.app.match(/class="tab on"/g) || []).length, 1, p + ' has one active tab');
    has(g.captured.app, `class="tab on" data-tab="${p}" aria-current="page"`, p + ' marks itself');
  }
});
// The tab rail used to carry a middle tab that renamed itself to whatever month was in
// view. With the review gone the month is named only by the calendar's own heading.
t('the tab rail no longer names a month', async () => {
  const g = await bootReady();
  const a = g.api;
  a.view = { y: 2026, m: 5 }; a.render();
  no(g.captured.app, '>This month<');
  no(g.captured.app, 'class="tab">June<', 'the rail is two fixed labels now');
  has(g.captured.app, 'June 2026', 'the calendar still says which month you are looking at');
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

// ---------- the editor speaks in plain terms ----------
t('every editor control carries a label', async () => {
  const g = await bootReady();
  const a = g.api;
  a.editing = a.state.goals[0].id; a.render();          // the count goal
  const html = g.captured.app;
  has(html, '<span class="flbl">What a tap does</span>');
  has(html, '<span class="flbl">Monthly target</span>');
  has(html, 'Sub-goals');
  eq((html.match(/class="frow"/g) || []).length, 2, 'two labelled fields on a count goal');
});
t('the type options describe what tapping does, not the internal kind', async () => {
  const g = await bootReady();
  const a = g.api;
  a.editing = a.state.goals[0].id; a.render();
  const html = g.captured.app;
  has(html, 'Marks the day done');
  has(html, 'Adds one to a monthly total');
  has(html, 'Crosses it off for good');
  for (const jargon of ['>Daily<', '>Count<', '>List<'])
    no(html, jargon, 'no implementation vocabulary in the picker');
});
t('"Daily" no longer appears anywhere, so the two pickers cannot be confused', async () => {
  const g = await bootReady();
  const a = g.api;
  for (const id of a.state.goals.map(x => x.id)) {
    a.editing = id; a.render();
    no(g.captured.app, 'Daily', 'the type and cadence pickers shared this word');
  }
});
t('a non-count goal drops the monthly-target field and its caption', async () => {
  const g = await bootReady();
  const a = g.api;
  a.editing = a.state.goals[1].id; a.render();           // the list goal
  const html = g.captured.app;
  eq((html.match(/class="frow"/g) || []).length, 1, 'only one field applies');
  no(html, 'Monthly target');
  no(html, 'resets to 0 on the 1st', 'the caption is about the target, so it goes too');
});

// ---------- the early-month ETA (§8.1) ----------
// A rate measured over two days projects nonsense: three done on the 1st would send
// the projected segment all the way across the track.
t('no projection segment is drawn before ETAMIN days have elapsed', async () => {
  for (const day of ['01', '02', '03', '04']) {
    const g = await onDate(`2026-01-${day}`);
    const a = g.api;
    a.view = { y: 2026, m: 0 };
    const s = a.paceLine(3, 40);
    no(s, 'class="proj"', `Jan ${day}: must not project`);
    has(s, 'class="done" style="width:7.5%"', `Jan ${day}: but what is done still shows`);
  }
});
t('the projection appears once the rate has enough days behind it', async () => {
  const g = await onDate('2026-01-05');
  const a = g.api;
  a.view = { y: 2026, m: 0 };
  has(a.paceLine(3, 40), 'class="proj"', 'on the 5th a rate is worth drawing');
});
t('ETAMIN is the documented cutoff, not a magic number', async () => {
  const g = await onDate('2026-01-10');
  eq(g.api.ETAMIN, 5);
});
t('a met target still reads met early in the month', async () => {
  const g = await onDate('2026-01-02');
  const a = g.api;
  a.state.goals = [{ id: 'gx', type: 'count', target: 2, title: 'X', subs: [{ id: 'sx', title: 's' }] }];
  a.state.logs = { '2026-01-01': { sx: 2 } };
  a.view = { y: 2026, m: 0 };
  has(a.paceLine(2, 2), 'width:100%', 'the track fills');
  has(a.goalBlock(a.state.goals[0], '2026-01-02', a.firstDone()), '>met<',
      'the ETAMIN cutoff must not suppress a real result');
});

// ---------- month boundaries, pinned ----------
t('the last day of a month leaves zero days and never divides by zero', async () => {
  const g = await onDate('2026-01-31');
  const a = g.api;
  a.view = { y: 2026, m: 0 };
  for (const done of [0, 5, 39, 40, 99]) {
    const s = a.paceLine(done, 40);
    ok(!/NaN|Infinity|undefined/.test(s), `done=${done} produced: ${s}`);
  }
});
t('a leap day is a real, clickable day', async () => {
  const g = await onDate('2024-02-29');
  const a = g.api;
  eq(a.todayKey(), '2024-02-29');
  eq(a.daysIn(2024, 1), 29);
  a.view = { y: 2024, m: 1 };
  has(a.calendar('2024-02-29'), 'data-k="2024-02-29"');
});
t('the streak spans a month boundary', async () => {
  const g = await onDate('2026-03-02');
  const a = g.api;
  a.state.logs = { '2026-02-27': {x:1}, '2026-02-28': {x:1}, '2026-03-01': {x:1}, '2026-03-02': {x:1} };
  eq(a.streak(), 4, 'Feb 28 -> Mar 1 is consecutive');
});
t('the streak spans a leap-day boundary', async () => {
  const g = await onDate('2024-03-01');
  const a = g.api;
  a.state.logs = { '2024-02-28': {x:1}, '2024-02-29': {x:1}, '2024-03-01': {x:1} };
  eq(a.streak(), 3, 'the 29th exists in 2024, so the run is unbroken');
});
t('a run of 3 in a 28-day February is not miscounted', async () => {
  const g = await onDate('2026-02-28');
  const a = g.api;
  a.state.logs = { '2026-02-26': {x:1}, '2026-02-27': {x:1}, '2026-02-28': {x:1} };
  eq(a.streak(), 3);
  eq(a.activeDays(2026, 1), 3);
});

// ---------- the browser fallback actually works in a browser (§7.1) ----------
// It used to call window.storage, which is not a browser API: the page rendered
// but every save threw, so the documented styling workflow silently lost edits.
t('the browser backend round-trips through localStorage', async () => {
  const g = await bootReady();
  const a = g.api;
  eq(a.Store.kind, 'browser');
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 2);
  await new Promise(r => setTimeout(r, 400));          // the 250ms debounce
  eq(a.saveErr, false, 'the save must not fail');
  const raw = g.store.get('checkin-v3');
  ok(raw, 'something was written');
  eq(typeof raw, 'string', 'localStorage holds strings');
  const parsed = JSON.parse(raw);
  eq(parsed.logs[a.todayKey()][a.state.goals[0].subs[0].id], 2);
});
t('a browser reload restores what was saved', async () => {
  const g = await bootReady();
  const a = g.api;
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 3);
  await new Promise(r => setTimeout(r, 400));
  const saved = g.store.get('checkin-v3');
  // a second boot sharing the same storage is the reload
  const g2 = await bootReady();
  g2.store.set('checkin-v3', saved);
  await g2.api.load();
  eq(g2.api.dayTotal(g2.api.todayKey()), 3, 'the check-ins survived');
});
t('the footer never shows a write error on the happy path', async () => {
  const g = await bootReady();
  const a = g.api;
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);
  await new Promise(r => setTimeout(r, 400));
  a.render();
  no(g.captured.app, 'Write failed', 'this is what the broken fallback used to show');
});

// ---------- the footer carries only what acts on the goals ----------
t('the footer offers no export, no import and no file path', async () => {
  const g = await bootReady();
  const a = g.api;
  a.render();
  const html = g.captured.app;
  no(html, 'Export a copy'); no(html, 'Import');
  no(html, 'id="dl"'); no(html, 'id="imp"'); no(html, 'id="up"');
  no(html, 'class="tools"');
  no(html, 'checkin.json', 'the data-file path is not surfaced');
  no(html, 'Browser local storage');
});
// Regression: with three goals and nothing archived, every part of the footer is
// conditional and all of them were empty — but the container still rendered, drawing
// its top rule and padding as a line across the page under no content at all.
// The footer is still assembled from its parts and skipped when they are all empty —
// it cannot go empty now that + goal is permanent, but the guard is what stops the
// next conditional part from bringing back a rule drawn under no content.
// Every part of the footer is conditional again now that + goal has moved out, so an
// empty one must not render — it would draw its rule across the page under no content.
t('a footer with nothing in it is not rendered', async () => {
  const g = await bootReady();
  const a = g.api;
  a.render();
  eq(a.notice, ''); eq(a.saveErr, false);
  no(g.captured.app, 'class="foot"', 'no container, so no rule and no padding');
  a.sel = a.todayKey();
  a.bump(a.state.goals[0].subs[0].id, 1);
  a.dropGoal(a.state.goals[0].id);                 // logged, so it archives onto the shelf
  has(g.captured.app, 'class="foot"', 'and it comes back when it has content');
});
// The one thing the footer must still say. Persistence failing silently would be the
// worst failure this app has, so it survived the strip.
t('a failed write still reports itself in the footer', async () => {
  const g = await bootReady();
  const a = g.api;
  a.render();
  no(g.captured.app, 'Write failed', 'quiet on the happy path');
  a.saveErr = true; a.render();
  has(g.captured.app, 'Write failed. Changes were not saved.');
  has(g.captured.app, 'class="bad"');
});

t('persisted JSON stores only goals and logs — no cached totals', async () => {
  const a = await fixture();
  const round = JSON.parse(JSON.stringify(a.state));
  eq(Object.keys(round).sort(), ['goals', 'logs']);
  for (const g of round.goals) {
    const bad = Object.keys(g).filter(k => !['id', 'type', 'target', 'title', 'subs', 'archived'].includes(k));
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
t('load drops the dead cadence field from an older file', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', type: 'daily', cad: 'weekly', title: 'g', subs: [{ id: 'b', title: 'x' }] }], logs: {} });
  eq('cad' in g.api.state.goals[0], false, 'a setting that no longer does anything is tidied away');
  eq(g.api.dayTotal('2026-07-01'), 0);
});
// The distinction is deliberate: `cad` was a setting with nothing in it, but `adhoc`
// held lines somebody typed. Removing the feature must not delete the writing.
t('load leaves an older file\'s ad-hoc entries alone rather than deleting them', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', type: 'daily', title: 'g', subs: [{ id: 'b', title: 'x' }] }],
                             logs: {}, adhoc: { '2026-07-03': ['fix bug'] } });
  eq(g.api.state.adhoc, { '2026-07-03': ['fix bug'] }, 'still in the file');
  eq(g.api.dayTotal('2026-07-03'), 0, 'but it no longer counts as activity');
  eq(g.api.dayKeys(), [], 'and it is not a logged day');
});
t('load defaults a missing goal type and subs array', async () => {
  const g = await loadFrom({ goals: [{ id: 'a', title: 'no type' }], logs: {} });
  eq(g.api.state.goals[0].type, 'daily');
  eq(g.api.state.goals[0].subs, []);
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

// ---------- archive, not erase (§4.5) ----------
// Removing a goal must not rewrite the days it was checked in on: those days were
// counted by the calendar, the streak and every past month while the goal existed.
async function arch(now = '2026-07-15') {
  const g = await bootReady({ now });
  g.api.state = {
    goals: [
      { id: 'g1', type: 'count', cad: 'daily', target: 10, title: 'Problems',
        subs: [{ id: 's1', title: 'DP' }, { id: 's2', title: 'Trees' }] },
      { id: 'g2', type: 'list', cad: 'monthly', title: 'To learn',
        subs: [{ id: 'l1', title: 'A' }, { id: 'l2', title: 'B' }] },
      { id: 'g3', type: 'daily', cad: 'weekly', title: 'Job hunt',
        subs: [{ id: 'd1', title: 'Applications' }] },
    ],
    logs: {
      '2026-06-30': { s1: 5 },
      '2026-07-02': { s1: 2, s2: 1 },
      '2026-07-03': { d1: 1 },
      '2026-07-10': { s1: 3, l1: 1 },
    },
    adhoc: {},
  };
  g.api.view = { y: 2026, m: 6 }; g.api.sel = '2026-07-15';
  return g;
}
const unlogged = { id: 'g4', type: 'daily', cad: 'weekly', title: 'Never used', subs: [{ id: 'n1', title: 'x' }] };

t('a goal that has been logged is archived, and its check-ins are untouched', async () => {
  const g = await arch(); const a = g.api;
  const before = JSON.stringify(a.state.logs);
  a.dropGoal('g1');
  eq(a.state.goals.length, 3, 'still in the file');
  eq(a.state.goals[0].archived, true, 'flagged, not removed');
  eq(JSON.stringify(a.state.logs), before, 'not one log entry changed');
  eq(a.subTotal('s1'), 10); eq(a.dayTotal('2026-07-02'), 3);
  eq(a.activeDays(2026, 6), 3, 'July still had three active days');
});
t('a goal that was never logged is deleted outright', async () => {
  const g = await arch(); const a = g.api;
  a.state.goals.push(JSON.parse(JSON.stringify(unlogged)));
  a.dropGoal('g4');
  eq(a.state.goals.length, 3, 'gone from the file');
  eq(a.state.goals.some(x => x.id === 'g4'), false);
  eq(a.archiveShelf(), '', 'nothing archived, so nothing on the shelf — it is simply gone');
});
t('an archived goal leaves the check-in screen', async () => {
  const g = await arch(); const a = g.api;
  has(a.dayPanel('2026-07-15', '2026-07-15'), 'data-add="s1"', 'tappable while live');
  a.dropGoal('g1');
  const html = a.dayPanel('2026-07-15', '2026-07-15');
  no(html, 'data-add="s1"', 'no longer tappable');
  no(html, 'Problems', 'and its heading is gone');
});
t('an archived goal stops counting against MAXGOALS', async () => {
  const g = await arch(); const a = g.api;
  while (a.live().length < a.MAXGOALS) a.state.goals.push({ id: a.newId(), type: 'daily', title: 'x', subs: [] });
  a.render(); a.bind();
  g.els.get('ag').onclick();
  eq(a.live().length, a.MAXGOALS, 'at the cap, so nothing was added');
  const before = a.state.goals.length;
  a.dropGoal('g1');                                 // g1 has logs, so it archives
  a.render(); a.bind();
  g.els.get('ag').onclick();
  eq(a.live().length, a.MAXGOALS, 'archiving freed the slot and the new goal took it');
  eq(a.state.goals.length, before + 1, 'the archived one is still in the file');
});
t('stats still credit an archived goal, and say it is archived', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g1'); a.dropGoal('g2');
  const sp = a.statsPanel();
  has(sp, 'Problems', 'it keeps its row');
  has(sp, '<span class="v">11</span>', 'with its real total');
  has(sp, '<i class="gone">archived</i>', 'and says why a name you no longer track is here');
  ok(a.achievements().some(x => x.t === 'A'), 'and a finished list item stays an achievement');
});
t('an archived goal is gone from the check-in screen but not from the record', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g3');
  no(a.dayPanel('2026-07-15', '2026-07-15'), 'Job hunt', 'not something you are skipping');
  eq(a.subTotal('d1'), 1, 'but the day it was worked still counts');
  eq(a.dayTotal('2026-07-03'), 1);
});
// Removing a goal offers nothing back on the spot any more. An archived goal is still
// fully recoverable from the shelf; a never-logged one is not recoverable at all.
t('a removed goal leaves no undo offer behind', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g1');
  a.render();
  no(g.captured.app, 'Undo');
  no(g.captured.app, 'Archived “Problems”');
  has(a.archiveShelf(), 'data-rg="g1"', 'the shelf is the way back');
});t('restoring is refused when the live goals are already at the cap', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g1');
  while (a.live().length < a.MAXGOALS) a.state.goals.push({ id: a.newId(), type: 'daily', title: 'x', subs: [] });
  a.restoreGoal('g1');
  eq(a.state.goals.find(x => x.id === 'g1').archived, true, 'still archived');
  has(a.notice, `You already have ${a.MAXGOALS} goals`, 'and it says why');
});
t('a permanent delete asks first, naming what it will cost', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g1');
  has(a.archiveShelf(), 'data-pg="g1"', 'the shelf offers it');
  a.purging = 'g1';
  has(a.archiveShelf(), 'and its 11 check-ins for good?', 'the question states the count');
});
t('a permanent delete removes the goal and every log it owned', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g1'); a.purgeGoal('g1');
  eq(a.state.goals.length, 2);
  eq(a.subTotal('s1'), 0); eq(a.subTotal('s2'), 0);
  eq(a.dayTotal('2026-06-30'), 0, 'a day that held only its check-ins is now empty');
  eq(a.dayTotal('2026-07-10'), 1, 'a shared day keeps the other goal\'s entry');
  eq(a.state.logs['2026-06-30'], undefined, 'and the empty day is dropped, not left as {}');
});
t('a logged sub-goal archives and keeps counting; an unlogged one is deleted', async () => {
  const g = await arch(); const a = g.api;
  a.dropSub('s1');
  eq(a.state.goals[0].subs[0].archived, true, 'kept, flagged');
  eq(a.goalCount(a.state.goals[0], 2026, 6), 6, 'July total still counts it');
  a.state.goals[0].subs.push({ id: 's3', title: 'Fresh' });
  a.dropSub('s3');
  eq(a.state.goals[0].subs.some(s => s.id === 's3'), false, 'nothing to preserve, so it goes');
});
t('an archived sub-goal is untappable but has a way back in the editor', async () => {
  const g = await arch(); const a = g.api;
  a.dropSub('s1');
  no(a.dayPanel('2026-07-15', '2026-07-15'), 'data-add="s1"', 'no chip');
  const ed = a.goalEditor(a.state.goals[0]);
  has(ed, 'data-rs="s1"', 'the editor lists it with Restore');
  no(ed, 'data-st="s1"', 'but it is not editable while archived');
  a.restoreSub('s1');
  eq(a.state.goals[0].subs[0].archived, undefined);
  has(a.dayPanel('2026-07-15', '2026-07-15'), 'data-add="s1"', 'tappable again');
});
// The archived sub's own history is what must survive; nothing in the UI reads it
// as recent activity any more, but the goal's totals still count it.
t('an archived sub-goal keeps counting toward the goal it belongs to', async () => {
  const g = await bootReady({ now: '2026-07-15' });
  const a = g.api;
  a.state = { goals: [{ id: 'x', type: 'daily', title: 'X',
                        subs: [{ id: 'a1', title: 'old' }, { id: 'b1', title: 'new' }] }],
              logs: { '2026-07-01': { a1: 1 }, '2026-07-14': { b1: 1 } } };
  a.view = { y: 2026, m: 6 };
  eq(a.goalDays(a.state.goals[0], 2026, 6), 2, 'both days count while both subs are live');
  a.dropSub('b1');
  eq(a.goalDays(a.state.goals[0], 2026, 6), 2, 'and still do once one is archived');
  no(a.goalBlock(a.state.goals[0], '2026-07-15', a.firstDone()), 'data-tog="b1"', 'but it is untappable');
});
// The × used to remove the goal. It reads as "close this panel" everywhere else in
// software, and that is how a goal got destroyed by someone meaning to put the editor
// away. Panel-level × now closes; removing is a button that says which removal it is.
t('the editor × closes the editor and cannot remove anything', async () => {
  const g = await arch(); const a = g.api;
  const ed = a.goalEditor(a.state.goals[0]);
  has(ed, '<button class="x" data-edit="" title="Close">', 'the × is a close control');
  no(ed, 'class="x" data-dg', 'no × anywhere removes the goal');
  eq((ed.match(/data-dg=/g) || []).length, 1, 'exactly one control removes the goal');
});
t('the editor names the removal it will perform, and what survives', async () => {
  const g = await arch(); const a = g.api;
  const ed = a.goalEditor(a.state.goals[0]);
  has(ed, '<button class="drop" data-dg="g1">Archive this goal</button>', 'labelled, not an icon');
  has(ed, 'The 11 check-ins it already has stay in past months', 'naming what is kept');
  a.state.goals.push(JSON.parse(JSON.stringify(unlogged)));
  const ed2 = a.goalEditor(a.state.goals[3]);
  has(ed2, '>Delete this goal</button>', 'nothing logged, so it is a plain delete');
  has(ed2, 'nothing to keep', 'and it says so');
  no(ed2, 'stay in past months', 'no promise about check-ins it does not have');
});
t('sub-goal rows keep their × , because a row-level × removes that row', async () => {
  const g = await arch(); const a = g.api;
  const ed = a.goalEditor(a.state.goals[0]);
  has(ed, 'data-ds="s1"', 'the sub-goal row still has its own remove control');
  has(ed, 'class="x" data-ds="s1"', 'and it is still an ×');
});
t('Save is the primary button and closes the editor', async () => {
  const g = await arch(); const a = g.api;
  has(a.goalEditor(a.state.goals[0]), '<button class="btn pri" data-edit="">Save</button>');
});
t('the archived flag survives a save/load round trip', async () => {
  const g = await arch(); const a = g.api;
  a.dropGoal('g1');
  const reloaded = JSON.parse(JSON.stringify(a.state));
  eq(reloaded.goals[0].archived, true, 'still archived on disk');
  a.state = reloaded;
  eq(a.live().length, 2, 'and still off the check-in screen');
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
  eq(calls.find(c => c[0] === 'save_data'), ['save_data', { data: '{"x":1}' }], 'save_data payload');
  eq(calls.filter(c => c[0] === 'data_path').length, 0, 'nothing asks for the path any more');
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
