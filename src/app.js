const KEY='checkin-v3', DOW=['S','M','T','W','T','F','S'], MAXGOALS=5;
const MON=['January','February','March','April','May','June',
           'July','August','September','October','November','December'];
const MONS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ETAMIN=5;   // days that must have elapsed before a rate is worth projecting (§8.1)
const DONEMAX=5;  // finished list items shown before the rest fold away (§5)
const PAGE_SIZE=5;
let state={goals:[],logs:{}};
let view=null, sel=null, panel='day', editing=null, draftGoal=null, draftIsNew=false, quickAdding=null, saveErr=false;
let noteView=null;
let completionPeek=null;
let draggedSub=null;
const sectionOpen={records:true,days:true,mix:true,completed:true};
const sectionPage={records:0,days:0,mix:0,completed:0,archive:0};
let notice='';
let purging=null;                  // the archived goal awaiting a permanent delete
let dragId=null;                   // the goal being dragged, while it is in the air
let version='';                    // read from the bundle at startup, blank in a browser
const doneOpen=new Set();          // list goals whose finished items are unfolded
const archiveOpen=new Set();       // archived goals whose preserved details are visible

/* ---------- helpers ---------- */
const pad=n=>String(n).padStart(2,'0');
const key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const todayKey=()=>key(today());
const parseKey=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
const label=k=>{const d=parseKey(k);return MONS[d.getMonth()]+' '+d.getDate()};
const short=k=>{const d=parseKey(k);return `${MON[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`};
const mKey=(y,m)=>y+'-'+pad(m+1);
const inMonth=(k,y,m)=>k.startsWith(mKey(y,m));
const inLastMonth=k=>{const end=today(),start=new Date(end);start.setMonth(start.getMonth()-1);
  const d=parseKey(k);return d>=start&&d<=end};
const daysIn=(y,m)=>new Date(y,m+1,0).getDate();
const diffDays=(a,b)=>Math.round((b-a)/864e5);
const newId=()=>Math.random().toString(36).slice(2,8);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function markdown(s){
  const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return String(s||'').split(/\r?\n/).map(line=>{
    const h=line.match(/^(#{1,3})\s+(.+)/); if(h)return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    if(/^[-*]\s+/.test(line))return `<li>${inline(line.replace(/^[-*]\s+/,''))}</li>`;
    if(/^>\s?/.test(line))return `<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>`;
    return line.trim()?`<p>${inline(line)}</p>`:'<br>';
  }).join('');
}

/* ---------- storage layer: swap the backend here and nowhere else ---------- */
const Store = (() => {
  const T = window.__TAURI__;
  if (T) {                                    // desktop (Tauri): a JSON file on disk
    const invoke = T.core.invoke;
    return { kind:'tauri',
      read:  ()  => invoke('load_data'),
      write: (s) => invoke('save_data', { data: s }) };
  }
  return { kind:'browser',                    // browser fallback (§7.1): localStorage
    read:  async ()  => localStorage.getItem(KEY) || '',
    write: async (s) => { localStorage.setItem(KEY, s); } };
})();

/* ---------- load / save ---------- */
// The version is asked of the running bundle rather than written down here. A third copy
// beside tauri.conf.json and Cargo.toml would go stale silently, and a version display
// that has drifted from the build is worse than no version display at all.
async function readVersion(){
  try{ const T=window.__TAURI__; if(T&&T.app) version=await T.app.getVersion(); }
  catch(e){ version=''; }
}

async function load(){
  let explicitMock=false;
  try{
    const raw = await Store.read();
    if(raw && raw.trim() && raw.trim()!=='{}'){
      state = JSON.parse(raw);
      explicitMock=Boolean(state._mockScenario);
    }
  }catch(e){ console.warn('Read failed, starting fresh', e); }
  if(!state.goals||(!state.goals.length&&!explicitMock)) state=seed();
  if(!state.logs) state.logs={};
  if(!state.noteSnapshots) state.noteSnapshots={};
  state.goals.forEach(g=>{ if(!g.type)g.type='daily'; if(!g.subs)g.subs=[];
    delete g.cad; });   // cadence is gone; drop the dead field on the way through
  const n=today(); view={y:n.getFullYear(),m:n.getMonth()}; sel=todayKey();
  await readVersion();
  render();
}
let timer=null;
function save(){
  clearTimeout(timer);
  timer=setTimeout(async()=>{
    try{ await Store.write(JSON.stringify(state,null,1)); saveErr=false; }
    catch(e){ console.error('Save failed',e); saveErr=true; render(); }
  },250);
}
function seed(){
  return {logs:{},goals:[
    {id:newId(),type:'count',target:40,title:'Problems',subs:[
      {id:newId(),title:'Arrays / strings'},{id:newId(),title:'Lists / trees'},
      {id:newId(),title:'DP'},{id:newId(),title:'Other'}]},
    {id:newId(),type:'list',title:'To learn',subs:[
      {id:newId(),title:'Rolling IC'},{id:newId(),title:'Block bootstrap'},
      {id:newId(),title:'PSI / CSI'},{id:newId(),title:'Kalman filter'}]},
    {id:newId(),type:'daily',title:'Job hunt',subs:[
      {id:newId(),title:'Applications'},{id:newId(),title:'Resume'},{id:newId(),title:'Interview prep'}]}
  ]};
}

/* ---------- derived ---------- */
const dayTotal=k=>Object.values(state.logs[k]||{}).reduce((a,b)=>a+b,0);
const level=n=>n===0?0:n===1?1:n===2?2:n<=4?3:4;
// Every date with any activity, sorted. Kept as the single entry point for
// "which days count", so a second source of activity can be added back in one place.
const dayKeys=()=>Object.keys(state.logs).sort();
function subTotal(id,y,m){
  let n=0;
  for(const k in state.logs){ if(y!==undefined&&!inMonth(k,y,m))continue; n+=state.logs[k][id]||0; }
  return n;
}
function firstDone(){
  const m={};
  Object.keys(state.logs).sort().forEach(d=>Object.keys(state.logs[d]).forEach(s=>{if(!m[s])m[s]=d;}));
  return m;
}
function activeDays(y,m){
  let n=0; for(const k of dayKeys()) if(inMonth(k,y,m)&&dayTotal(k)>0) n++;
  return n;
}
function goalDays(g,y,m){
  let n=0;
  for(const k in state.logs) if(inMonth(k,y,m)&&g.subs.some(s=>state.logs[k][s.id])) n++;
  return n;
}
const goalCount=(g,y,m)=>g.subs.reduce((a,s)=>a+subTotal(s.id,y,m),0);
// Length of the current run of consecutive active days. If today has nothing logged
// yet the run is measured to yesterday, so it does not read 0 every morning before
// you have had a chance to check in.
function streak(){
  const d=today();
  if(dayTotal(key(d))===0) d.setDate(d.getDate()-1);
  let n=0;
  while(dayTotal(key(d))>0){ n++; d.setDate(d.getDate()-1); }
  return n;
}

/* ---------- archive, not erase (§4.5) ---------- */
// Removing a goal means "stop tracking this", not "this never happened". The days it
// was checked in on are facts about those days: the calendar, the streak and every
// past month were computed from them, and silently dropping the entries would rewrite
// a record that was true when it was made. So a goal that has ever been logged is
// archived — it leaves the check-in screen and stops counting against MAXGOALS, but
// its logs stay and past months still report it. A goal with no logs has nothing to
// preserve, so it is simply removed. Same rule one level down, for sub-goals.
const live=()=>state.goals.filter(g=>!g.archived);
const liveSubs=g=>g.subs.filter(s=>!s.archived);
const subLogged=id=>{ for(const k in state.logs) if(state.logs[k][id]) return true; return false; };
const goalLogged=g=>g.subs.some(s=>subLogged(s.id));

function dropGoal(id){
  const i=state.goals.findIndex(g=>g.id===id); if(i<0) return;
  const g=state.goals[i];
  if(goalLogged(g)) g.archived=true;
  else state.goals.splice(i,1);
  if(editing===id){editing=null;draftGoal=null;draftIsNew=false;}
  notice=''; purging=null; save(); render();
}
function dropSub(id){
  for(const g of state.goals){
    const i=g.subs.findIndex(s=>s.id===id); if(i<0) continue;
    if(subLogged(id)) g.subs[i].archived=true; else g.subs.splice(i,1);
    break;
  }
  save(); editing?refreshEditor():render();
}
function restoreGoal(id){
  const g=state.goals.find(x=>x.id===id); if(!g) return;
  if(live().length>=MAXGOALS){
    notice=`You already have ${MAXGOALS} goals. Remove one before restoring another.`;
    render(); return;
  }
  delete g.archived; notice=''; purging=null; save(); render();
}
function restoreSub(id){
  for(const g of state.goals){ const s=g.subs.find(s=>s.id===id); if(s){ delete s.archived; break; } }
  save(); editing?refreshEditor():render();
}
// The only path that removes logs. It exists so archiving is not a one-way street:
// a goal you are certain about can still be erased, and it says how much it will cost.
function purgeGoal(id){
  const i=state.goals.findIndex(g=>g.id===id); if(i<0) return;
  const g=state.goals[i];
  g.subs.forEach(s=>stripSub(s.id));
  state.goals.splice(i,1);
  purging=null;
  notice=`Deleted “${g.title}” and its check-ins.`;
  save(); render();
}

/* ---------- order ---------- */
// state.goals is the render order, so reordering is a splice and persistence is free.
// The screen shows live() — archived goals sit in the array but not on screen — so a
// move is always expressed as "put this one before that one" and resolved against the
// full array. Using a screen index would silently jump an archived goal.
function moveGoal(id,beforeId){
  const from=state.goals.findIndex(g=>g.id===id);
  if(from<0||id===beforeId) return;
  const [g]=state.goals.splice(from,1);
  const to=beforeId==null?-1:state.goals.findIndex(x=>x.id===beforeId);
  state.goals.splice(to<0?state.goals.length:to,0,g);
  save(); render();
}
// Dragging is not the only way to do this: with the handle focused, the arrow keys move
// a goal one place. `after` is the goal it should follow, so moving down means landing
// before whatever came after that.
function nudgeGoal(id,dir){
  const vis=live(), i=vis.findIndex(g=>g.id===id), j=i+dir;
  if(i<0||j<0||j>=vis.length) return;
  moveGoal(id, dir<0 ? vis[j].id : (vis[j+1]?vis[j+1].id:null));
  const h=document.querySelector(`[data-grip="${id}"]`); if(h) h.focus();
}

// The drag itself. Nothing is committed until the mouse is released, so letting go
// away from any goal is a cancel.
function beginDrag(id){
  const rows=()=>[...document.querySelectorAll('[data-goal]')];
  const src=rows().find(r=>r.dataset.goal===id);
  if(!src) return;
  dragId=id; src.classList.add('dragging');
  let over=null, before=true;
  const clear=()=>rows().forEach(r=>r.classList.remove('dropbefore','dropafter'));
  document.onmousemove=e=>{
    clear(); over=null;
    for(const r of rows()){
      const b=r.getBoundingClientRect();
      if(e.clientY<b.top||e.clientY>b.bottom) continue;
      if(r.dataset.goal===id) break;                 // over itself: nowhere to land
      over=r.dataset.goal; before=e.clientY<b.top+b.height/2;
      r.classList.add(before?'dropbefore':'dropafter');
      break;
    }
  };
  document.onmouseup=()=>{
    document.onmousemove=null; document.onmouseup=null;
    clear(); src.classList.remove('dragging'); dragId=null;
    if(!over) return;
    // dropping below a goal means landing before whatever follows it — or last
    const vis=live(), i=vis.findIndex(g=>g.id===over);
    moveGoal(id, before?over:(vis[i+1]?vis[i+1].id:null));
  };
}

/* ---------- check-in ---------- */
function bump(id,delta){
  const k=sel||todayKey(), day=state.logs[k]||{}, v=(day[id]||0)+delta;
  if(v>0) day[id]=v; else delete day[id];
  if(Object.keys(day).length) state.logs[k]=day; else delete state.logs[k];
  save(); render();
}
function findSub(id){
  for(const g of state.goals){const s=g.subs.find(s=>s.id===id);if(s)return {g,s};}
  return null;
}
function completeList(id){
  const found=findSub(id); if(!found)return;
  const k=sel||todayKey();
  if(!state.noteSnapshots)state.noteSnapshots={};
  if(!state.noteSnapshots[k])state.noteSnapshots[k]={};
  state.noteSnapshots[k][id]={title:found.s.title,goalTitle:found.g.title,markdown:found.s.note||''};
  bump(id,1);
}
// Take one sub-goal out of every day it appears in. The only way logs are destroyed,
// shared by the "undone" control and by a permanent delete (§4.5).
function stripSub(id){
  Object.keys(state.logs).forEach(d=>{ delete state.logs[d][id];
    if(!Object.keys(state.logs[d]).length) delete state.logs[d]; });
  Object.keys(state.noteSnapshots||{}).forEach(d=>{delete state.noteSnapshots[d][id];
    if(!Object.keys(state.noteSnapshots[d]).length)delete state.noteSnapshots[d];});
}
function clearSub(id){ stripSub(id); save(); render(); }

/* ---------- render ---------- */
function render(quietEditor=false){
  const n=today(), tk=todayKey();
  const isCur = view.y===n.getFullYear() && view.m===n.getMonth();
  const canNext = view.y<n.getFullYear() || (view.y===n.getFullYear()&&view.m<n.getMonth());
  const run=streak();
  const records=dayKeys().reduce((sum,k)=>sum+dayTotal(k),0);

  document.getElementById('app').innerHTML=`
    <div class="appframe">
      <aside class="sidebar">
        <div class="top">
          <img class="brandmark" src="daybook-icon.png" alt="">
          <div><h1>P2J Daybook</h1></div>
          ${version?`<span class="ver mono">${esc(version)}</span>`:''}
        </div>
        ${tabs()}
        <div class="calcol">
        <div class="nav">
          <button id="prev" aria-label="Previous month">‹</button>
          <span class="m">${MON[view.m]} ${view.y}</span>
          <button id="next" ${canNext?'':'disabled'} aria-label="Next month">›</button>
        </div>
        <div class="dow">${DOW.map(d=>`<i>${d}</i>`).join('')}</div>
        <div class="cal">${calendar(tk)}</div>
        <div class="tally">
          <div class="tallyitem static"><b>${run}</b><em>Day Streak</em></div>
          <button class="tallyitem" id="recordsJump" title="View activity history"><b>${records}</b><em>Total Records</em></button>
        </div>
        </div>
      </aside>
      <main class="workspace">
        <header class="workhead">
          <div>
            <p class="eyebrow">${panel==='day' ? (sel===tk?'Today':'Past day') : panel==='stats' ? `${MON[view.m]} review` : 'Past goals'}</p>
            <h2>${panel==='day' ? (sel===tk?'What will you show up for?':esc(label(sel||tk))) : panel==='stats' ? 'Your month at a glance' : 'Archive'}</h2>
          </div>
          ${panel==='day'?`<div class="daystatus">
            <span class="daymetric"><b>${dayTotal(sel||tk)}</b><span>record${dayTotal(sel||tk)===1?'':'s'}</span></span>
          </div>`:
            panel==='stats'?`<div class="monthswitch" aria-label="Stats month">
              <button data-sm="-1" aria-label="Previous stats month">‹</button>
              <span>${MON[view.m]} ${view.y}</span>
              <button data-sm="1" ${canNext?'':'disabled'} aria-label="Next stats month">›</button>
            </div>`:''}
        </header>
        <div class="panel">
          ${panel==='stats' ? statsPanel() : panel==='archive' ? archivePanel() : dayPanel(sel||tk,tk,quietEditor)}
        </div>
        ${panel==='day'?`<section class="history" aria-label="Activity history">
          <div class="historyhead"><h2>Consistency</h2><span>Last 12 months</span></div>
          ${heatmap()}
        </section>`:''}
      </main>
    </div>
    ${noteView?noteEditor():''}
    ${foot()}`;
  bind();
}

// The footer is down to one thing, and it is the one thing that must never be missed.
// It is still conditional, so the container is too: an empty one drew its top rule and
// padding as a line across the page under no content.
function foot(){
  const bits = [
    saveErr?'<p class="store"><span class="bad">Write failed. Changes were not saved.</span></p>':'',
  ].join('');
  return bits ? `<div class="foot">${bits}</div>` : '';
}
// Everything that has left the check-in screen but not the file. It gets a tab rather
// than a line in the footer: one goal made that line read as a sentence rather than as
// controls (`To learn Restore Delete permanently`), and a second would have made it worse.
// Erasing a goal's logs is the one act here that cannot be undone, so it asks, and the
// question names the cost.
const lastWorked=g=>{ let best=null;
  for(const k in state.logs) if(g.subs.some(s=>state.logs[k][s.id])) if(!best||k>best) best=k;
  return best; };

function archivePanel(){
  const gone=state.goals.filter(g=>g.archived);
  const archivePage=pageOf(gone,'archive');
  const rows=archivePage.items.map(g=>{
    if(purging===g.id){
      const n=goalCount(g);
      return `<div class="arch"><h3>${esc(g.title)}</h3>
        <p class="warnrow">Delete this goal and its ${n} record${n===1?'':'s'} permanently?
          <button class="lnk dgr" data-purge="${g.id}">Delete</button>
          <button class="lnk" id="nopurge">Cancel</button></p></div>`;
    }
    const {v,u}=goalAmount(g), unit=g.type==='count'?`record${v===1?'':'s'}`:u;
    const last=lastWorked(g), open=archiveOpen.has(g.id);
    const details=g.subs.map(s=>`<div class="archsub"><span>${esc(s.title)}</span>
      <b>${subTotal(s.id)}</b><em>record${subTotal(s.id)===1?'':'s'}</em></div>`).join('');
    return `<div class="arch" data-archive-goal="${g.id}">
      <button class="archtoggle" data-ao="${g.id}" aria-expanded="${open}">
        <h3>${esc(g.title)}</h3><span aria-hidden="true">›</span></button>
      <p class="acap"><b>${v}</b> ${unit}${last?` · last worked ${short(last)}`:''}</p>
      ${open?`<div class="archdetail">${details||'<p class="hint">No sub-goals.</p>'}</div>`:''}
      <div class="arow2">
        <button class="lnk" data-rg="${g.id}">Restore</button>
        <button class="lnk dgr" data-pg="${g.id}">Delete permanently</button></div></div>`;
  }).join('');
  return `
    ${notice?`<p class="notice">${esc(notice)}</p>`:''}
    ${rows||`<p class="hint" style="padding:10px 0">Nothing archived. Removing a goal that has
      records puts it here, with its history intact.</p>`}
    ${pager(archivePage,'archive')}`;
}

// A year of days at one cell each, in the same ramp as the calendar — the same
// instrument at a wider zoom, not a borrowed component. Columns are weeks, rows are
// weekdays, and the last column holds today. Clicking a day takes the calendar to it,
// which is the only jump between months left since the year strip and the stats chart
// went; ‹ › alone made a month six back a six-click trip.
const HWEEKS=53;
function heatStart(){
  const n=today(), d=new Date(n);
  d.setDate(d.getDate() - (HWEEKS-1)*7 - n.getDay());   // back to the Sunday of the first week
  return d;
}
function heatmap(){
  const start=heatStart(), n=today(), tk=todayKey();
  let cells='', mons='', shown=-1, shownY=-1, lastAt=-9, lastWide=false;
  for(let w=0;w<HWEEKS;w++){
    // A month is labelled at the first week that begins inside it. Labelling by the
    // week's last day put the name a column early: the week of Jul 26 ends on Aug 1 and
    // was headed "Aug" while six of its seven days were July.
    const wk=new Date(start); wk.setDate(start.getDate()+w*7);
    const m=wk.getMonth();
    // A 53-week window opens partway through a month, so its first label can land a
    // column before the next one and the two collide. Drop a label rather than crowd
    // it — the month is still findable from the ones either side.
    // the year is named where it changes, and on the first label, so the window is
    // never ambiguous about which July it opened in
    const y=wk.getFullYear(), withYear = y!==shownY;
    // a label needs clear columns after the previous one or the two run together; one
    // carrying a year is nearly twice as wide, so it claims more
    const show = m!==shown && w-lastAt>=(lastWide?6:3);
    if(m!==shown) shown=m;
    if(show){ lastAt=w; lastWide=withYear; shownY=y; }
    mons+=`<i${show&&w>HWEEKS-4?' class="edge"':''}>${show?MONS[m]+(withYear?' '+y:''):''}</i>`;
  }
  for(let i=0;i<HWEEKS*7;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const k=key(d);
    if(d>n){ cells+='<span class="hd future"></span>'; continue; }
    const t=dayTotal(k);
    cells+=`<button class="hd${k===tk?' today':''}" data-l="${level(t)}" data-hk="${k}"
      title="${label(k)} · ${t} record${t===1?'':'s'}"></button>`;
  }
  return `<div class="heat">
    <div class="hmons">${mons}</div>
    <div class="hgrid">${cells}</div>
  </div>`;
}

function calendar(tk){
  const {y,m}=view, dim=daysIn(y,m), lead=new Date(y,m,1).getDay(), tdy=today();
  const on=i=>i>=1&&i<=dim&&dayTotal(key(new Date(y,m,i)))>0;
  let h='';
  for(let i=0;i<lead;i++) h+='<div class="d pad"></div>';
  for(let i=1;i<=dim;i++){
    const d=new Date(y,m,i), k=key(d);
    if(d>tdy){ h+=`<div class="d future"><span class="num">${i}</span></div>`; continue; }
    const cls=['d']; if(k===tk)cls.push('today'); if(k===sel&&panel==='day')cls.push('sel');
    // join a run of consecutive days into one bar; runs break at the week edge
    // because the next day is on the following row, not beside this one
    if(on(i)){
      const dow=d.getDay();
      if(dow!==0 && on(i-1)) cls.push('cL');
      if(dow!==6 && on(i+1)) cls.push('cR');
    }
    h+=`<button class="${cls.join(' ')}" data-l="${level(dayTotal(k))}" data-k="${k}"
        title="${label(k)} · ${dayTotal(k)} check-in${dayTotal(k)===1?'':'s'}"><span class="num">${i}</span></button>`;
  }
  return h;
}
// The three views are peers, so they get one persistent switcher rather than a
// heading plus two links that change shape depending on where you already are.
function tabs(){
  const n=today(), tk=todayKey();
  const isCur = view.y===n.getFullYear() && view.m===n.getMonth();
  const home = panel==='day' && sel===tk && isCur;
  const showDate = panel==='day' && sel && sel!==tk;
  // the middle tab names the month it will actually show, so it never reads
  // "This month" while displaying June
  const views=[['day','Today'],['stats','Stats'],['archive','Archive']];
  return `<div class="phead">
      <nav class="tabs">${views.map(([p,name])=>
        `<button class="tab${panel===p?' on':''}" data-tab="${p}"${
          panel===p?' aria-current="page"':''}>${name}</button>`).join('')}</nav>
      <span class="grow"></span>
      ${panel==='day'&&!home?`<span class="ctx">${showDate?esc(label(sel))+' · ':''}<button class="lnk" id="back">Back to today</button></span>`:''}
    </div>`;
}

function dayPanel(k,tk,quietEditor=false){
  if(k!==tk) return snapshotPanel(k);
  const F=firstDone(), full=live().length>=MAXGOALS;
  const activeEditor=editing?(draftGoal||live().find(g=>g.id===editing)):null;
  return `
    ${live().length?live().map(g=>goalBlock(g,k,F)).join('')
      :'<p class="hint" style="padding:10px 0">No goals yet.</p>'}
    <div class="addrow">
      <button class="add addgoal" id="ag"><span aria-hidden="true">+</span> Goal</button>
      ${full?`<p class="cap">You already have ${MAXGOALS}. Remove one to add another.</p>`:''}
    </div>
    ${activeEditor?`<button class="editorbackdrop" data-cancel-edit aria-label="Cancel editing"></button>
      ${goalEditor(activeEditor,quietEditor)}`:''}`;
}

function snapshotPanel(k){
  const day=state.logs[k]||{};
  const goals=state.goals.filter(g=>g.subs.some(s=>day[s.id]));
  const rows=goals.map(g=>{
    const entries=g.subs.filter(s=>day[s.id]);
    const total=entries.reduce((n,s)=>n+day[s.id],0);
    return `<div class="goal snapshot">
      <div class="ghead"><h3>${esc(g.title)}${g.archived?'<i class="gone">archived</i>':''}</h3>
        <span class="prog"><b>${total}</b> record${total===1?'':'s'}</span></div>
      <div class="snapshotchips">${entries.map(s=>{const hasNote=state.noteSnapshots?.[k]?.[s.id];return hasNote
        ?`<button class="snapshotchip notechip" data-note="${s.id}" data-note-date="${k}">${esc(s.title)}<span aria-hidden="true">›</span></button>`
        :`<span class="snapshotchip">${esc(s.title)}${day[s.id]>1?`<b>×${day[s.id]}</b>`:''}</span>`;}).join('')}</div></div>`;
  }).join('');
  return `<div class="snapshotnote">Read-only snapshot</div>
    ${rows||'<p class="hint snapshotempty">No records for this day.</p>'}`;
}

function goalBlock(g,k,F){
  const ed=`<button class="lnk gedit" data-edit="${g.id}">Edit</button>`;
  const grip=`<button class="ghandle" data-grip="${g.id}"
    aria-label="Move ${esc(g.title)}" title="Drag to reorder, or use the arrow keys"></button>`;
  // a goal with no sub-goals still needs a way in, or it becomes unreachable
  const subs=liveSubs(g);   // archived sub-goals keep counting but are no longer tappable
  if(!subs.length) return `<div class="goal" data-goal="${g.id}">${grip}
    <div class="ghead"><h3>${esc(g.title)}</h3><div class="gright">${ed}</div></div>
    ${g.type==='list'?`<div class="chips">${listAddControl(g.id)}</div>`:`<p class="hint" style="margin-top:9px">${g.subs.length
      ? 'Every sub-goal here is archived. Edit to restore one or add another.'
      : 'No sub-goals yet. Edit to add one.'}</p>`}</div>`;
  const {y,m}=view, day=state.logs[k]||{};
  let right='',prog='',pace='',chips='',done='';

  if(g.type==='count'){
    const target=g.target||40, c=goalCount(g,y,m);
    right=`<span class="prog mono">${c>=target?'<span class="hit">met</span> ':''}<b>${c}</b><i>/${target}</i> this month</span>`;
    prog='';
    pace=`<div class="pace">${paceLine(c,target)}</div>`;
    chips=subs.map(s=>{
      const c2=day[s.id]||0;
      const b=`<button class="chip ${c2?'on':''}" data-add="${s.id}">${esc(s.title)}${c2?`<span class="n mono">+${c2}</span>`:''}</button>`;
      return c2?`<span class="grp">${b}<button class="minus" data-minus="${s.id}">−</button></span>`:b;
    }).join('');
  }
  else if(g.type==='list'){
    const open=subs.filter(s=>!F[s.id]);
    // newest first: what this line is for is what you just crossed off, and it matches
    // the order the completion log in Stats already uses
    const fin=subs.filter(s=>F[s.id]).sort((a,b)=>F[a.id]<F[b.id]?1:-1);
    const thisM=fin.filter(s=>inMonth(F[s.id],y,m)).length;
    right=`<span class="prog mono">${thisM?`<b>+${thisM}</b> this month · `:''}<b>${fin.length}</b><i>/${subs.length}</i></span>`;
    prog=`<button class="pipsopen" data-completed-goal="${g.id}" data-complete-drop="${g.id}" aria-expanded="${completionPeek?.id===g.id}" aria-label="Show completed items for ${esc(g.title)}">${pips(fin.length,subs.length)}</button>`;
    chips=open.map(s=>`<span class="listitem noteditem" draggable="true" data-complete-drag="${s.id}" data-drag-goal="${g.id}"><button class="chip noteopen" data-note="${s.id}">${esc(s.title)}</button>
      <button class="listremove" data-list-remove="${s.id}" aria-label="Remove ${esc(s.title)}" title="Remove">×</button></span>`).join('')+listAddControl(g.id);
    // Today is the only place where a completion can be undone. Older work remains
    // available as a read-only fact in Stats and day snapshots instead of leaking back
    // into the active workspace as an editable item.
    const todayDone=fin.filter(s=>F[s.id]===k);
    if(todayDone.length){
      const all=doneOpen.has(g.id), show=all?todayDone:todayDone.slice(0,DONEMAX), rest=todayDone.length-show.length;
      done=`<div class="doneline"><span class="lb">Done</span>${
        show.map(s=>`<button class="undone" data-clear="${s.id}">${esc(s.title)}</button>`).join('')}${
        rest>0?`<button class="lnk fold" data-more="${g.id}">+${rest} more</button>`:''}${
        all&&todayDone.length>DONEMAX?`<button class="lnk fold" data-more="${g.id}">Show fewer</button>`:''}</div>`;
    }
  }
  else{
    const d=goalDays(g,y,m);
    right=`<span class="prog mono"><b>${d}</b> day${d===1?'':'s'} this month</span>`;
    chips=subs.map(s=>`<button class="chip ${day[s.id]?'on':''}" data-tog="${s.id}">${esc(s.title)}</button>`).join('');
  }

  const renderedCompleted=completionPeek?.id===g.id?completedList(g,F):'';
  return `<div class="goal" data-goal="${g.id}">${grip}
    <div class="ghead"><h3>${esc(g.title)}</h3><div class="gright">${right}${ed}</div></div>
    ${prog}${renderedCompleted}${pace}${chips?`<div class="chips">${chips}</div>`:''}${done}</div>`;
}

function completedList(g,F){
  const items=g.subs.filter(s=>F[s.id]).sort((a,b)=>F[a.id]<F[b.id]?1:-1);
  const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  completionPeek.page=Math.max(0,Math.min(completionPeek.page||0,pages-1));
  const start=completionPeek.page*PAGE_SIZE, shown=items.slice(start,start+PAGE_SIZE);
  return `<section class="completedpeek"><div class="peekhead"><span>Completed</span><b>${items.length}</b></div>
    <div class="peeklist">${shown.map(s=>{const d=F[s.id],hasNote=state.noteSnapshots?.[d]?.[s.id];return hasNote
      ?`<button class="peekrow" data-note="${s.id}" data-note-date="${d}"><span>${esc(s.title)}</span><time>${short(d)}</time><i>›</i></button>`
      :`<div class="peekrow"><span>${esc(s.title)}</span><time>${short(d)}</time></div>`;}).join('')}</div>
    ${pages>1?`<div class="peekpager"><button data-completed-page="-1" ${completionPeek.page===0?'disabled':''} aria-label="Previous completed items">‹</button>
      <span>${completionPeek.page+1} / ${pages}</span><button data-completed-page="1" ${completionPeek.page===pages-1?'disabled':''} aria-label="Next completed items">›</button></div>`:''}</section>`;
}

function noteEditor(){
  const found=findSub(noteView.id), snap=noteView.date&&state.noteSnapshots?.[noteView.date]?.[noteView.id];
  if(!found&&!snap)return '';
  const readonly=Boolean(noteView.date), title=snap?.title||found.s.title, goal=snap?.goalTitle||found.g.title;
  const text=readonly?snap.markdown:(found.s.note||'');
  return `<button class="notebackdrop" data-note-close aria-label="Close note"></button>
    <section class="noteview${readonly?' readonly':''}" role="dialog" aria-modal="true" aria-label="${esc(title)} note">
      <header><div><span>${esc(goal)}</span>${readonly?`<h2>${esc(title)}</h2>`:
        `<input class="notetitle" data-note-title="${noteView.id}" value="${esc(title)}" aria-label="Sub-goal title">`}</div>
        <div class="noteactions">${readonly?'':`<button class="notecomplete" data-note-complete="${noteView.id}">Mark complete</button>`}<button data-note-close aria-label="Close note">×</button></div></header>
      ${readonly?`<div class="notedate">Completed ${short(noteView.date)}</div><article class="markdownbody">${text?markdown(text):'<p class="hint">No note was recorded.</p>'}</article>`
      :`<div class="noteedit"><textarea data-note-input="${noteView.id}" placeholder="Start writing...">${esc(text)}</textarea></div>`}
    </section>`;
}

function listAddControl(goalId){
  return quickAdding===goalId
    ? `<span class="quickadd"><input type="text" data-quick-input="${goalId}" placeholder="New sub-goal" aria-label="New sub-goal">
        <button class="quickaddsave" data-quick-save="${goalId}" aria-label="Add sub-goal" title="Add">✓</button>
        <button class="quickaddcancel" data-quick-cancel aria-label="Cancel" title="Cancel">×</button></span>`
    : `<button class="listadd" data-list-add="${goalId}" aria-label="Add sub-goal" title="Add sub-goal">+</button>`;
}

function commitQuickSub(goalId,input){
  const title=input.value.trim(),g=state.goals.find(g=>g.id===goalId&&g.type==='list'&&!g.archived);
  if(!title||!g)return;
  g.subs.push({id:newId(),title});quickAdding=null;save();render();
}

// One goal's editor, rendered where that goal sits. The caption explains only
// the fields actually on screen.
// The type of a goal decides what tapping a chip does, so the options say exactly
// that rather than naming the underlying kind. Every field carries its own label.
// Three verbs, one each. The trailing qualifiers went: "to a monthly total" is said
// better by the Monthly target field that appears the moment you pick it, and "the list"
// only repeated the noun already above the sub-goals.
const TAP={daily:'Marks the day done',count:'Adds one',list:'Crosses it off'};
const subStickerChars=title=>Math.max(9,Math.min(36,title.length+1));
function fitSubInput(input){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)return;
  const style=getComputedStyle(input);
  ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const text=input.value||input.placeholder||'';
  input.style.width=`${Math.min(250,Math.max(54,Math.ceil(ctx.measureText(text).width)+2))}px`;
}
function goalEditor(g,quiet=false){
  const field=(lb,ctrl)=>`<label class="frow"><span class="flbl">${lb}</span><span class="fctl">${ctrl}</span></label>`;
  const keep=goalLogged(g), subs=liveSubs(g), gone=g.subs.filter(s=>s.archived);
  return `<div class="goal ed${quiet?' steady':''}">
    <div class="ehead"><h3>Edit goal</h3>
      <button class="x" data-cancel-edit title="Cancel">×</button></div>
    <input class="etitle" type="text" value="${esc(g.title)}" data-gt="${g.id}" placeholder="Goal">
    <div class="settingsgroup">
      ${field('Tap action',
        `<details class="tapmenu"><summary>${TAP[g.type]}</summary>
          <div class="tapoptions" role="menu">${Object.entries(TAP).map(([v,n])=>
            `<button class="tapoption${g.type===v?' active':''}" data-gy="${g.id}" data-type="${v}" role="menuitemradio" aria-checked="${g.type===v}">
              <span class="check" aria-hidden="true">✓</span><span>${n}</span></button>`).join('')}</div></details>`)}
      ${g.type==='count'?field('Monthly target',
        `<input type="number" min="1" value="${g.target||40}" data-gn="${g.id}">`):''}
    </div>
    <div class="esep"></div>
    ${subs.length?`<p class="flab">Sub-goals <span class="fcount">${subs.length}</span></p>
    <div class="substickers">
      ${subs.map(s=>`<div class="erow sub sticker" style="--chars:${subStickerChars(s.title)}">
        <input type="text" value="${esc(s.title)}" data-st="${s.id}" placeholder="Sub-goal">
        <button class="x" data-ds="${s.id}" title="${subLogged(s.id)?'Archive':'Delete'}">×</button></div>`).join('')}
      <button class="add substickeradd" data-as="${g.id}" aria-label="Add sub-goal" title="Add sub-goal"><span aria-hidden="true">+</span></button>
    </div>`:`<button class="add firstsub" data-as="${g.id}"><span aria-hidden="true">+</span>Add first sub-goal</button>`}
    ${gone.length?`<p class="flab gone">Archived <span class="fcount">${gone.length}</span></p>
      ${gone.map(s=>`<div class="erow sub gone"><span class="sname">${esc(s.title)}</span>
        <button class="lnk" data-rs="${s.id}">Restore</button></div>`).join('')}`:''}
    <div class="esep"></div>
    <div class="dzone">
      <button class="drop" data-dg="${g.id}">${keep?'Archive this goal':'Delete this goal'}</button>
    </div>
    <div class="erow edfoot">
      <span class="grow"></span>
      <button class="btn pri" data-save-edit>Save</button>
    </div>
  </div>`;
}

// The projection track is the app's thesis made visible: the dark segment is what
// is actually done, the light segment is where the current rate lands you by month
// end, and the grey remainder is the shortfall. Sentence below states the same in words.
function track(done,target,proj){
  const dp=Math.max(0,Math.min(100,done/target*100));
  const pp=Math.max(dp,Math.min(100,(proj===undefined?done:proj)/target*100));
  return `<div class="ptrack"><i class="done" style="width:${dp}%"></i>`
       + (pp>dp?`<i class="proj" style="left:${dp}%;width:${pp-dp}%"></i>`:'')
       + `</div>`;
}
// Pace is now shown only as the track: ink for what is done, accent for where this
// rate lands you, the well for the shortfall. The sentence that used to restate it in
// words was removed — including the one it opened with, which demanded a daily rate
// from a goal you had not started. The arithmetic stays, because it decides how far
// the projected segment reaches.
function paceLine(done,target){
  const n=today();
  const isCur = view.y===n.getFullYear()&&view.m===n.getMonth();
  // A month that is over cannot project, and a met target has nothing left to project to.
  if(!isCur || done>=target || done===0) return track(done,target);
  const el=n.getDate(), left=daysIn(view.y,view.m)-el;
  // Early in the month a rate measured over two or three days projects nonsense: three
  // done on the 1st would reach all the way across. Until ETAMIN days have elapsed the
  // track shows only what is actually done. §8.1
  if(el<ETAMIN) return track(done,target);
  const rate=done/el, days=Math.ceil((target-done)/rate);
  return days<=left ? track(done,target,target)             // this pace arrives in time
                    : track(done,target,Math.round(done+rate*left));
}

function pips(d,t){
  if(t>150) return `<div class="bar"><i style="width:${Math.min(100,d/t*100)}%"></i></div>`;
  let h=''; for(let i=0;i<t;i++) h+=`<div class="pip${i<d?' f':''}"></div>`;
  return `<div class="pips">${h}</div>`;
}

function achievements(){
  const out=[], F=firstDone();
  state.goals.forEach(g=>{
    if(g.type==='list')
      g.subs.forEach(s=>{ if(F[s.id]) out.push({d:F[s.id],g:g.title,gid:g.id,sid:s.id,archived:g.archived,t:s.title}); });
    if(g.type==='count'){
      const acc={}, tg=g.target||40;
      Object.keys(state.logs).sort().forEach(k=>{
        let add=0; g.subs.forEach(s=>add+=state.logs[k][s.id]||0);
        if(!add) return;
        const mk=k.slice(0,7), before=acc[mk]||0;
        acc[mk]=before+add;
        if(before<tg && acc[mk]>=tg)
          out.push({d:k,g:g.title,gid:g.id,archived:g.archived,t:`${MONS[+mk.slice(5)-1]} target met · ${tg}`,hit:true});
      });
    }
  });
  return out.sort((a,b)=>a.d<b.d?1:-1);
}

// "How much have I done." An amount per goal, then the things actually finished.
// What was here before answered other questions — when in the week do I work, am I
// trending up — and neither of those is an amount. The per-goal figure is scoped to
// what the goal is: a count goal totals its check-ins, a list goal counts what is
// crossed off, and a daily goal counts days, because three of its sub-goals ticked on
// one day is still one day.
function goalAmount(g,y,m){
  const F=firstDone();
  const dated=s=>F[s.id]&&(y===undefined||inMonth(F[s.id],y,m));
  if(g.type==='list') return {v:g.subs.filter(dated).length, u:`of ${g.subs.length} done`};
  if(g.type==='daily'){
    const d=dayKeys().filter(k=>(y===undefined||inMonth(k,y,m))&&g.subs.some(s=>state.logs[k][s.id])).length;
    return {v:d, u:`day${d===1?'':'s'}`};
  }
  const c=g.subs.reduce((a,s)=>a+subTotal(s.id,y,m),0);
  return {v:c, u:`check-in${c===1?'':'s'}`};
}

function pageOf(items,key){
  const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  sectionPage[key]=Math.max(0,Math.min(sectionPage[key],pages-1));
  const start=sectionPage[key]*PAGE_SIZE;
  return {items:items.slice(start,start+PAGE_SIZE),page:sectionPage[key],pages,total:items.length};
}
function pager(p,key){
  if(p.pages<=1)return '';
  return `<div class="pager"><button data-page="${key}" data-dir="-1" ${p.page===0?'disabled':''} aria-label="Previous page">‹</button>
    <span>${p.page+1} / ${p.pages}</span>
    <button data-page="${key}" data-dir="1" ${p.page===p.pages-1?'disabled':''} aria-label="Next page">›</button></div>`;
}
function foldTitle(key,title){
  return `<button class="sectiontoggle" data-section="${key}" aria-expanded="${sectionOpen[key]}">
    <span class="headingline"><h4>${title}</h4></span></button>`;
}

function statsPanel(){
  if(!state.goals.length) return `<div class="statsempty">
    <div class="emptychart" aria-hidden="true"><i></i><i></i><i></i></div>
    <h3>No stats yet</h3><p>No Goals to chart.</p>
    <button class="btn pri" id="emptyGoal">Create Goal</button></div>`;
  const ach=achievements().filter(a=>inMonth(a.d,view.y,view.m)&&!a.hit);
  const colors=['#176B57','#7B61A8','#3276A8','#C17A32','#B24C62'];
  const monthGoals=state.goals.filter(g=>!g.archived||goalAmount(g,view.y,view.m).v>0);
  const recordPage=pageOf(monthGoals,'records');
  const records=recordPage.items.map(g=>{
    const n=goalCount(g,view.y,view.m);
    return `<button class="recordrow" data-stat-goal="${g.id}" aria-label="${esc(g.title)} · ${n} record${n===1?'':'s'}">
      <div class="recordname"><b>${esc(g.title)}${g.archived?'<i class="gone">archived</i>':''}</b></div>
      <div class="recordvalue"><b>${n}</b><span>record${n===1?'':'s'}</span><i class="recordjump" aria-hidden="true">›</i></div></button>`;
  }).join('');
  const dayEntries=monthGoals.filter(g=>g.type==='daily').flatMap(g=>g.subs
    .filter(s=>!s.archived||subTotal(s.id,view.y,view.m)>0).map(s=>({g,s})));
  const dayPage=pageOf(dayEntries,'days');
  const activeDays=dayPage.items.map(({g,s})=>{
    const n=dayKeys().filter(k=>inMonth(k,view.y,view.m)&&(state.logs[k][s.id]||0)>0).length;
    const pct=Math.min(100,n/daysIn(view.y,view.m)*100);
    return `<div class="daybarrow" data-stat-target="${g.id}"><div class="recordname"><b>${esc(s.title)}${s.archived?'<i class="gone">archived</i>':''}</b>
      <span class="typebadge">${esc(g.title)}</span></div>
      <div class="recordvalue"><b>${n}</b><span>active day${n===1?'':'s'}</span></div>
      <span class="daybartrack" role="img" aria-label="${esc(s.title)} · ${n} active day${n===1?'':'s'}"><i style="width:${pct}%"></i></span></div>`;
  }).join('');
  const donutGoals=state.goals.filter(g=>g.type==='count'&&(!g.archived||goalAmount(g,view.y,view.m).v>0));
  const mixPage=pageOf(donutGoals,'mix');
  const donuts=mixPage.items.map(g=>{
    const active=liveSubs(g), values=active.map(s=>subTotal(s.id,view.y,view.m));
    const total=values.reduce((a,b)=>a+b,0);
    let at=0;
    const stops=values.map((n,i)=>{const from=at;at+=total?n/total*100:0;
      return `${colors[i%colors.length]} ${from}% ${at}%`}).join(',');
    const fill=total&&stops?`conic-gradient(${stops})`:'var(--sunk)';
    return `<section class="donutgroup${active.length>5?' wide':''}" data-stat-target="${g.id}">
      <div class="donut" role="img" aria-label="${esc(g.title)} monthly total ${total}" style="background:${fill}">
        <span><b>${total}</b><em>total</em></span></div>
      <div class="donutmeta"><h4><span>${esc(g.title)}</span>${g.archived?'<i class="gone">archived</i>':''}</h4>
        <div class="donutlegend">${active.map((s,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>
          <em>${esc(s.title)}</em><b>${values[i]}</b></span>`).join('')}</div></div>
    </section>`;
  }).join('');
  const completedPage=pageOf(ach,'completed');

  return `
    <section class="recordsummary">
      <div class="charthead${sectionOpen.records?'':' closed'}"><div>${foldTitle('records','Monthly records')}</div></div>
      ${sectionOpen.records?`<div class="recordlist">${records}</div>${pager(recordPage,'records')}`:''}
    </section>
    ${dayEntries.length?`<section class="chartcard"><div class="charthead${sectionOpen.days?'':' closed'}"><div>${foldTitle('days','Active days')}</div></div>
      ${sectionOpen.days?`<div class="daybarlist">${activeDays}</div>${pager(dayPage,'days')}`:''}</section>`:''}
    ${donutGoals.length?`<section class="chartcard"><div class="charthead${sectionOpen.mix?'':' closed'}"><div>${foldTitle('mix','Category mix')}</div>
      </div>${sectionOpen.mix?`<div class="donutgrid">${donuts}</div>${pager(mixPage,'mix')}`:''}</section>`:''}

    ${ach.length?`<section class="chartcard"><div class="charthead${sectionOpen.completed?'':' closed'}"><div>${foldTitle('completed','Completed')}</div>
      <span class="sectioncount">${ach.length} item${ach.length===1?'':'s'} this month</span></div>
    ${sectionOpen.completed?`<div class="ach">${completedPage.items.map(a=>
      `<div class="arow${a.hit?' hit':''}" data-stat-target="${a.gid}"${a.sid&&state.noteSnapshots?.[a.d]?.[a.sid]?` data-note="${a.sid}" data-note-date="${a.d}" role="button" tabindex="0"`:''}>
        <span class="ad mono">${short(a.d)}</span>
        <span class="completedname"><span class="at">${esc(a.t)}</span>
          <span class="typebadge">${esc(a.g)}${a.archived?'<i class="gone">archived</i>':''}</span></span></div>`).join('')
      }</div>${pager(completedPage,'completed')}`:''}</section>`:''}`;
}

/* ---------- events ---------- */
const on=(q,f)=>document.querySelectorAll(q).forEach(f);
function refreshEditor(focusId=null){
  const current=document.querySelector('.goal.ed'), scroll=current?current.scrollTop:0;
  render(true);
  const drawer=document.querySelector('.goal.ed'); if(drawer) drawer.scrollTop=scroll;
  if(focusId){
    const input=document.querySelector(`[data-st="${focusId}"]`);
    if(input){input.focus();input.select();}
  }
}
function beginEdit(id){
  const source=state.goals.find(g=>g.id===id); if(!source)return;
  draftGoal=JSON.parse(JSON.stringify(source)); draftIsNew=false; editing=id; render();
}
function cancelEdit(){
  editing=null; draftGoal=null; draftIsNew=false; render();
}
function commitEdit(){
  if(!draftGoal)return cancelEdit();
  draftGoal.subs=draftGoal.subs.filter(s=>s.title.trim());
  if(draftIsNew) state.goals.push(draftGoal);
  else{
    const i=state.goals.findIndex(g=>g.id===draftGoal.id);
    if(i>=0) state.goals[i]=draftGoal;
  }
  editing=null; draftGoal=null; draftIsNew=false; save(); render();
}
function createGoal(){
  if(live().length>=MAXGOALS) return;
  const id=newId();
  draftGoal={id,type:'daily',title:'New goal',subs:[]};
  draftIsNew=true; editing=id; panel='day'; render();
}
function navigateGoal(id){
  const g=state.goals.find(g=>g.id===id);if(!g)return;
  if(g.archived){panel='archive';archiveOpen.add(id);render();
    setTimeout(()=>document.querySelector(`[data-archive-goal="${id}"]`)
      ?.scrollIntoView({behavior:'smooth',block:'center'}),0);return;}
  const monthGoals=state.goals.filter(g=>!g.archived||goalAmount(g,view.y,view.m).v>0);
  const key=g.type==='daily'?'days':g.type==='count'?'mix':'completed';
  const items=key==='days'?monthGoals.filter(g=>g.type==='daily').flatMap(g=>g.subs
    .filter(s=>!s.archived||subTotal(s.id,view.y,view.m)>0).map(s=>({g,s}))):
    key==='mix'?state.goals.filter(g=>g.type==='count'&&(!g.archived||goalAmount(g,view.y,view.m).v>0)):
    achievements().filter(a=>inMonth(a.d,view.y,view.m)&&!a.hit);
  const index=key==='completed'?items.findIndex(a=>a.gid===id):
    key==='days'?items.findIndex(x=>x.g.id===id):items.findIndex(g=>g.id===id);
  if(index<0)return;
  sectionOpen[key]=true;sectionPage[key]=Math.floor(index/PAGE_SIZE);render();
  setTimeout(()=>document.querySelector(`[data-stat-target="${id}"]`)
    ?.scrollIntoView({behavior:'smooth',block:'center'}),0);
}
function bind(){
  on('[data-tog]',b=>b.onclick=()=>{const k=sel||todayKey();
    bump(b.dataset.tog,(state.logs[k]||{})[b.dataset.tog]?-1:1);});
  on('[data-add]',b=>b.onclick=()=>bump(b.dataset.add,1));
  on('[data-note]',b=>b.onclick=e=>{e.stopPropagation();noteView={id:b.dataset.note,date:b.dataset.noteDate||null};render();});
  on('[data-note-close]',b=>b.onclick=()=>{noteView=null;render();});
  on('[data-note-complete]',b=>b.onclick=()=>{completeList(b.dataset.noteComplete);noteView=null;render();});
  on('[data-note-input]',i=>i.oninput=()=>{const found=findSub(i.dataset.noteInput);if(!found)return;
    found.s.note=i.value;save();});
  on('[data-note-title]',i=>i.oninput=()=>{const found=findSub(i.dataset.noteTitle);if(!found)return;
    found.s.title=i.value;save();});
  on('[data-minus]',b=>b.onclick=()=>bump(b.dataset.minus,-1));
  on('[data-clear]',b=>b.onclick=()=>clearSub(b.dataset.clear));
  on('[data-list-add]',b=>b.onclick=()=>{quickAdding=b.dataset.listAdd;render();
    setTimeout(()=>document.querySelector(`[data-quick-input="${quickAdding}"]`)?.focus(),0);});
  on('[data-list-remove]',b=>b.onclick=()=>dropSub(b.dataset.listRemove));
  on('[data-complete-drag]',el=>{
    el.ondragstart=e=>{draggedSub=el.dataset.completeDrag;e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',draggedSub);el.classList.add('dragging');};
    el.ondragend=()=>{draggedSub=null;el.classList.remove('dragging');on('[data-complete-drop]',d=>d.classList.remove('dropready'));};
  });
  on('[data-complete-drop]',target=>{
    target.ondragover=e=>{const found=findSub(draggedSub);
      if(found?.g.id!==target.dataset.completeDrop)return;e.preventDefault();e.dataTransfer.dropEffect='move';target.classList.add('dropready');};
    target.ondragleave=()=>target.classList.remove('dropready');
    target.ondrop=e=>{e.preventDefault();target.classList.remove('dropready');const found=findSub(draggedSub);
      if(found?.g.id===target.dataset.completeDrop)completeList(draggedSub);};
  });
  on('[data-quick-input]',i=>i.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();commitQuickSub(i.dataset.quickInput,i);}
    if(e.key==='Escape'){e.preventDefault();quickAdding=null;render();}
  });
  on('[data-quick-save]',b=>b.onclick=()=>{
    const input=document.querySelector(`[data-quick-input="${b.dataset.quickSave}"]`);if(input)commitQuickSub(b.dataset.quickSave,input);
  });
  on('[data-quick-cancel]',b=>b.onclick=()=>{quickAdding=null;render();});
  on('[data-more]',b=>b.onclick=()=>{ const id=b.dataset.more;
    doneOpen.has(id)?doneOpen.delete(id):doneOpen.add(id); render(); });
  on('[data-completed-goal]',b=>b.onclick=()=>{const id=b.dataset.completedGoal;
    completionPeek=completionPeek?.id===id?null:{id,page:0};render();});
  on('[data-completed-page]',b=>b.onclick=()=>{if(b.disabled||!completionPeek)return;
    completionPeek.page+=+b.dataset.completedPage;render();});
  on('[data-ao]',b=>b.onclick=()=>{ const id=b.dataset.ao;
    archiveOpen.has(id)?archiveOpen.delete(id):archiveOpen.add(id); render(); });
  on('[data-sm]',b=>b.onclick=()=>{sectionPage.records=sectionPage.days=sectionPage.mix=sectionPage.completed=0;shift(+b.dataset.sm);});
  on('[data-section]',b=>b.onclick=()=>{const k=b.dataset.section;sectionOpen[k]=!sectionOpen[k];render();});
  on('[data-page]',b=>b.onclick=()=>{if(b.disabled)return;sectionPage[b.dataset.page]+=+b.dataset.dir;render();});
  on('[data-stat-goal]',b=>b.onclick=()=>navigateGoal(b.dataset.statGoal));
  on('.d[data-k]',c=>c.onclick=()=>{ sel=c.dataset.k; panel='day'; render(); });
  on('.hd[data-hk]',c=>c.onclick=()=>{ const d=parseKey(c.dataset.hk);
    view={y:d.getFullYear(),m:d.getMonth()}; sel=c.dataset.hk; panel='day'; render(); });

  document.getElementById('prev').onclick=()=>shift(-1);
  const nx=document.getElementById('next'); if(nx&&!nx.disabled) nx.onclick=()=>shift(1);
  const bk=document.getElementById('back');
  if(bk) bk.onclick=()=>{const n=today();view={y:n.getFullYear(),m:n.getMonth()};sel=todayKey();panel='day';render();};
  const recordsJump=document.getElementById('recordsJump');
  if(recordsJump) recordsJump.onclick=()=>document.querySelector('.history')?.scrollIntoView({behavior:'smooth',block:'start'});
  on('[data-tab]',b=>b.onclick=()=>{
    const p=b.dataset.tab;
    // no day is selected while browsing another month, so the day view returns to today
    if(p==='day'&&!sel){ const n=today(); view={y:n.getFullYear(),m:n.getMonth()}; sel=todayKey(); }
    if(p!=='day'){editing=null;draftGoal=null;draftIsNew=false;}
    panel=p; render();});
  on('[data-edit]',b=>b.onclick=()=>beginEdit(b.dataset.edit));
  on('[data-cancel-edit]',b=>b.onclick=cancelEdit);
  on('[data-save-edit]',b=>b.onclick=commitEdit);

  // Reordering, on plain mouse events rather than HTML5 drag and drop. The native API
  // needs `draggable` set before the gesture begins, and setting it from the handle's
  // mousedown was already too late in the app's own webview — the drag never started.
  // Mouse events have no engine-specific machinery to get wrong, and no library (§2.2).
  on('[data-grip]',h=>{
    h.onmousedown=e=>{ e.preventDefault(); beginDrag(h.dataset.grip); };   // no text selection
    h.onkeydown=e=>{ const d=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
      if(d){ e.preventDefault(); nudgeGoal(h.dataset.grip,d); } };
  });

  const ag=document.getElementById('ag');
  if(ag) ag.onclick=createGoal;
  const emptyGoal=document.getElementById('emptyGoal'); if(emptyGoal) emptyGoal.onclick=createGoal;
  on('[data-as]',b=>b.onclick=()=>{
    const id=newId();
    if(draftGoal&&draftGoal.id===b.dataset.as){draftGoal.subs.push({id,title:''});refreshEditor(id);}
  });
  on('[data-gt]',i=>i.oninput=()=>{if(draftGoal&&draftGoal.id===i.dataset.gt)draftGoal.title=i.value;});
  on('[data-gy]',b=>b.onclick=()=>{const g=draftGoal;
    if(!g||g.id!==b.dataset.gy)return; g.type=b.dataset.type; if(g.type==='count'&&!g.target)g.target=40; refreshEditor();});
  on('[data-gn]',i=>i.oninput=()=>{
    if(draftGoal&&draftGoal.id===i.dataset.gn)draftGoal.target=Math.max(1,+i.value||1);});
  on('[data-st]',i=>{fitSubInput(i);i.oninput=()=>{
    if(!draftGoal)return;const s=draftGoal.subs.find(s=>s.id===i.dataset.st);if(s){
      s.title=i.value;fitSubInput(i);
    }};});
  on('[data-dg]',b=>b.onclick=()=>{if(draftIsNew)cancelEdit();else dropGoal(b.dataset.dg);});
  on('[data-ds]',b=>b.onclick=()=>{if(!draftGoal)return;const i=draftGoal.subs.findIndex(s=>s.id===b.dataset.ds);
    if(i<0)return;subLogged(b.dataset.ds)?draftGoal.subs[i].archived=true:draftGoal.subs.splice(i,1);refreshEditor();});
  on('[data-rs]',b=>b.onclick=()=>{if(!draftGoal)return;const s=draftGoal.subs.find(s=>s.id===b.dataset.rs);
    if(s){delete s.archived;refreshEditor();}});
  on('[data-rg]',b=>b.onclick=()=>restoreGoal(b.dataset.rg));
  on('[data-pg]',b=>b.onclick=()=>{purging=b.dataset.pg; notice=''; render();});
  on('[data-purge]',b=>b.onclick=()=>purgeGoal(b.dataset.purge));
  const np=document.getElementById('nopurge');
  if(np) np.onclick=()=>{purging=null; render();};
}

function shift(d){
  let m=view.m+d, y=view.y;
  if(m<0){m=11;y--;} if(m>11){m=0;y++;}
  view={y,m};
  const n=today(), cur=y===n.getFullYear()&&m===n.getMonth();
  if(panel!=='stats') panel='day';
  sel=cur?todayKey():null;
  render();
}

load();
