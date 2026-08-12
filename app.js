/* FERRO — diário de treino pessoal. Dados 100% locais (localStorage). */
'use strict';

/* ================= utils ================= */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const pad = n => String(n).padStart(2,'0');
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES3 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DOW = ['seg','ter','qua','qui','sex','sáb','dom'];
const DIAS = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

const dt = s => new Date(s);                       // 'YYYY-MM-DDTHH:MM' -> local
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const ym  = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
const nowLocal = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDia = d => `${DIAS[d.getDay()].slice(0,3)} ${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
const fmtDataLonga = d => `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const fmtYm = k => { const [y,m] = k.split('-'); return `${MESES[+m-1]} ${y}`; };
const nbr = (n, dec=0) => (n ?? 0).toLocaleString('pt-BR', {maximumFractionDigits:dec, minimumFractionDigits:0});
const kg = n => `${nbr(n, n % 1 ? 1 : 0)} kg`;
const volFmt = n => n >= 10000 ? `${nbr(n/1000,1)} t` : `${nbr(n)} kg`;
const minFmt = mins => mins >= 60 ? `${Math.floor(mins/60)}h${pad(Math.round(mins%60))}` : `${Math.round(mins)} min`;
const numIn = v => { const n = parseFloat(String(v).replace(',','.')); return isFinite(n) ? n : null; };
const epley = (w,r) => r > 1 ? w * (1 + r/30) : w;

function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ================= store ================= */
const KEY = 'ferro.v1';
let db;
function load(){
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch(e){ db = null; }
  if (!db || !db.routines){
    db = JSON.parse(JSON.stringify(window.SEED));
    save();
  }
  db.bodyweight = db.bodyweight || [];
  db.settings = db.settings || {restDefault:90};
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch(e){ toast('Erro ao salvar: armazenamento cheio?'); }
}

/* ---------- derived ---------- */
const woSorted = () => [...db.workouts].sort((a,b) => dt(b.start) - dt(a.start)); // desc
function woVolume(w){
  let v = 0;
  for (const ex of w.exercises) for (const s of ex.sets)
    if (s.t !== 'w' && s.w != null && s.r != null) v += s.w * s.r;
  return v;
}
function woSets(w){ return w.exercises.reduce((a,ex) => a + ex.sets.filter(s => s.t !== 'w').length, 0); }
function woDur(w){ return w.end ? Math.max(0,(dt(w.end) - dt(w.start))/60000) : 0; }
function exNames(){
  const seen = new Map(); // name -> last date
  for (const w of woSorted()) for (const ex of w.exercises)
    if (!seen.has(ex.name)) seen.set(ex.name, w.start);
  for (const r of db.routines) for (const ex of r.exercises)
    if (!seen.has(ex.name)) seen.set(ex.name, '0');
  return [...seen.keys()];
}
function exHistory(name){ // asc by date, one point per workout
  const out = [];
  for (const w of woSorted().reverse()){
    let bw = null, be = null, vol = 0; const sets = [];
    for (const ex of w.exercises) if (ex.name === name)
      for (const s of ex.sets){
        sets.push(s);
        if (s.w != null && s.r != null){
          if (s.t !== 'w'){
            vol += s.w * s.r;
            if (bw === null || s.w > bw) bw = s.w;
            const e = epley(s.w, s.r);
            if (be === null || e > be) be = e;
          }
        }
      }
    if (sets.length) out.push({date:w.start, id:w.id, bw, be, vol, sets});
  }
  return out;
}
function maxBefore(name, startISO){
  let m = null;
  for (const w of db.workouts){
    if (dt(w.start) >= dt(startISO)) continue;
    for (const ex of w.exercises) if (ex.name === name)
      for (const s of ex.sets) if (s.t !== 'w' && s.w != null && s.r != null && (m === null || s.w > m)) m = s.w;
  }
  return m;
}
function lastPerf(name){ // most recent sets for placeholder ghosts
  for (const w of woSorted())
    for (const ex of w.exercises)
      if (ex.name === name) return ex.sets.filter(s => s.w != null || s.r != null);
  return [];
}
function weekCount(){
  const now = new Date();
  const d = new Date(now); const dow = (d.getDay()+6)%7; // seg=0
  d.setDate(d.getDate()-dow); d.setHours(0,0,0,0);
  return db.workouts.filter(w => dt(w.start) >= d).length;
}
function nextRoutine(){
  const names = db.routines.map(r => r.name);
  for (const w of woSorted()){
    const i = names.indexOf(w.name);
    if (i >= 0) return db.routines[(i+1) % db.routines.length];
  }
  return db.routines[0];
}

/* ================= router ================= */
let route = {v:'home'};
function nav(v, params={}){ route = {v, ...params}; render(); window.scrollTo(0,0); }
function render(){
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.nav === route.v));
  const views = {home:vHome, history:vHistory, progress:vProgress, plan:vPlan, settings:vSettings,
                 workout:vWorkout, detail:vDetail, month:vMonth, editRoutine:vEditRoutine};
  (views[route.v] || vHome)();
}

/* ================= HOME ================= */
let calCur = null; // Date of displayed month
function vHome(){
  const nxt = nextRoutine();
  const last = woSorted()[0];
  const now = new Date();
  if (!calCur) calCur = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCount = db.workouts.filter(w => ym(dt(w.start)) === ym(now)).length;

  let resume = '';
  if (db.active){
    resume = `<button class="btn primary" data-a="resume" style="margin-bottom:12px">▶ Continuar ${esc(db.active.name)} (em andamento)</button>`;
  }
  $('#view').innerHTML = `
    ${resume}
    <div class="hero">
      <div class="eyebrow">Próximo treino</div>
      <div class="title">${esc(nxt ? nxt.name : '—')}</div>
      <div class="sub">${last ? `Último: ${esc(last.name)} · ${fmtDia(dt(last.start))}` : 'Nenhum treino registrado ainda'}</div>
      ${nxt ? `<button class="btn primary" data-a="start" data-id="${nxt.id}">Começar agora</button>` : ''}
    </div>
    <div class="statrow">
      <div class="stat"><div class="v num">${weekCount()}</div><div class="l">esta semana</div></div>
      <div class="stat"><div class="v num">${monthCount}</div><div class="l">em ${MESES3[now.getMonth()]}</div></div>
      <div class="stat"><div class="v num">${db.workouts.length}</div><div class="l">no total</div></div>
    </div>
    <div class="row" style="gap:8px;margin-bottom:4px">
      ${db.routines.map(r => `<button class="btn slim" data-a="start" data-id="${r.id}" style="flex:1">${esc(r.name.replace('Treino ',''))}</button>`).join('')}
    </div>
    <div class="h2">Calendário</div>
    <div class="card cal">${calHTML(calCur)}</div>
    <button class="linkrow" data-a="month" data-k="${ym(calCur)}">
      <span>Relatório de <b style="text-transform:capitalize">${MESES[calCur.getMonth()]}</b></span><span class="arrow">›</span>
    </button>`;

  bind('#view', {
    start: el => startWorkout(el.dataset.id),
    resume: () => nav('workout'),
    month: el => nav('month', {k: el.dataset.k}),
    calprev: () => { calCur = new Date(calCur.getFullYear(), calCur.getMonth()-1, 1); render(); },
    calnext: () => { calCur = new Date(calCur.getFullYear(), calCur.getMonth()+1, 1); render(); },
    day: el => { const ws = db.workouts.filter(w => ymd(dt(w.start)) === el.dataset.d);
                 if (ws.length) nav('detail', {id: ws[ws.length-1].id, from:'home'}); },
  });
}
function calHTML(cur){
  const y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y,m,1), off = (first.getDay()+6)%7, nd = new Date(y,m+1,0).getDate();
  const trained = new Set(db.workouts.map(w => ymd(dt(w.start))));
  const tod = ymd(new Date());
  let cells = DOW.map(d => `<div class="dow">${d}</div>`).join('');
  for (let i=0;i<off;i++) cells += `<div class="cal-day off"></div>`;
  for (let d=1; d<=nd; d++){
    const key = `${y}-${pad(m+1)}-${pad(d)}`;
    const cls = ['cal-day', trained.has(key)?'trained':'', key===tod?'today':''].join(' ');
    cells += `<button class="${cls}" data-a="day" data-d="${key}">${d}</button>`;
  }
  return `<div class="cal-head">
      <button data-a="calprev" aria-label="Mês anterior">‹</button>
      <span class="m">${MESES[m]} ${y}</span>
      <button data-a="calnext" aria-label="Mês seguinte">›</button>
    </div><div class="cal-grid">${cells}</div>`;
}

/* ================= WORKOUT ================= */
function startWorkout(routineId){
  if (db.active && !confirm('Já existe um treino em andamento. Descartar e começar outro?')) { nav('workout'); return; }
  const r = db.routines.find(x => x.id === routineId);
  if (!r) return;
  db.active = {
    name: r.name, routineId, start: nowLocal(),
    exercises: r.exercises.map(e => ({
      name: e.name, rest: e.rest ?? db.settings.restDefault ?? 90,
      perSide: !!e.perSide, superset: e.superset || 0,
      tgt: `${e.sets}×${e.repsMin}–${e.repsMax}`,
      prev: lastPerf(e.name),
      sets: Array.from({length: e.sets}, () => ({t:'n', w:null, r:null, done:false})),
    })),
  };
  save(); nav('workout');
}
let clockIv = null;
function vWorkout(){
  const a = db.active;
  if (!a){ nav('home'); return; }
  const els = a.exercises.map((ex,xi) => {
    const rows = ex.sets.map((s,si) => {
      const p = ex.prev[si];
      const ghost = p && p.w != null ? `${nbr(p.w, p.w%1?1:0)} × ${p.r ?? '–'}` : (p && p.d ? `${Math.round(p.d/60)} min` : '—');
      return `<div class="set-grid ${s.done?'done':''} ${s.t==='w'?'warm':''}">
        <button class="sn" data-a="warm" data-x="${xi}" data-s="${si}" title="Alternar aquecimento">${s.t==='w'?'W':si+1}</button>
        <span class="prev num">${ghost}</span>
        <input type="text" inputmode="decimal" placeholder="${p && p.w != null ? nbr(p.w, p.w%1?1:0) : 'kg'}"
               value="${s.w ?? ''}" data-a="inw" data-x="${xi}" data-s="${si}" aria-label="Peso">
        <input type="text" inputmode="numeric" placeholder="${p && p.r != null ? p.r : 'reps'}"
               value="${s.r ?? ''}" data-a="inr" data-x="${xi}" data-s="${si}" aria-label="Repetições">
        <button class="ck" data-a="ck" data-x="${xi}" data-s="${si}" aria-label="Concluir série">${s.done?'✓':''}</button>
      </div>`;
    }).join('');
    return `<div class="ex-card ${ex.superset?'ss1':''}">
      <div class="spread">
        <div>
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-meta num">${ex.tgt} · descanso ${fmtRest(ex.rest)}
            ${ex.perSide ? ' <span class="chip side">por lado</span>' : ''}
            ${ex.superset ? ' <span class="chip ss">superset</span>' : ''}</div>
        </div>
      </div>
      <div class="set-grid hd"><span></span><span>anterior</span><span style="text-align:center">kg</span><span style="text-align:center">reps</span><span></span></div>
      ${rows}
      <button class="addset" data-a="addset" data-x="${xi}">+ adicionar série</button>
    </div>`;
  }).join('');

  $('#view').innerHTML = `
    <div class="wo-head spread">
      <div>
        <div class="name">${esc(a.name)}</div>
        <div class="small muted">começou ${a.start.slice(11)}</div>
      </div>
      <div class="clock num" id="wo-clock">0:00</div>
    </div>
    ${els}
    <button class="btn primary" data-a="finish" style="margin-top:6px">Concluir treino</button>
    <button class="btn danger slim" data-a="discard" style="margin-top:10px">Descartar treino</button>`;

  clearInterval(clockIv);
  const tick = () => { const m = Math.floor((Date.now() - dt(a.start))/60000), s = Math.floor((Date.now() - dt(a.start))/1000)%60;
    const el = $('#wo-clock'); if (el) el.textContent = `${m}:${pad(s)}`; };
  tick(); clockIv = setInterval(tick, 1000);

  bind('#view', {
    warm: el => { const s = a.exercises[el.dataset.x].sets[el.dataset.s]; s.t = s.t==='w'?'n':'w'; save(); render(); },
    addset: el => { const ex = a.exercises[el.dataset.x]; ex.sets.push({t:'n', w:null, r:null, done:false}); save(); render(); },
    ck: el => {
      const ex = a.exercises[el.dataset.x], si = +el.dataset.s, s = ex.sets[si];
      if (!s.done){
        // fill from inputs / placeholders
        const grid = el.closest('.set-grid');
        const wi = grid.querySelector('[data-a=inw]'), ri = grid.querySelector('[data-a=inr]');
        s.w = numIn(wi.value !== '' ? wi.value : wi.placeholder);
        s.r = numIn(ri.value !== '' ? ri.value : ri.placeholder);
        s.done = true;
        startRest(ex.rest, ex.name);
      } else { s.done = false; }
      save(); render();
    },
    finish: () => finishWorkout(),
    discard: () => { if (confirm('Descartar este treino? Nada será salvo.')) { db.active = null; save(); stopRest(); nav('home'); } },
  });
  // inputs persist on change
  $$('#view input[data-a=inw], #view input[data-a=inr]').forEach(inp => {
    inp.addEventListener('input', () => {
      const ex = a.exercises[inp.dataset.x], s = ex.sets[inp.dataset.s];
      const v = numIn(inp.value);
      if (inp.dataset.a === 'inw') s.w = v; else s.r = v;
      save();
    });
  });
}
const fmtRest = sec => sec >= 60 ? `${Math.floor(sec/60)}:${pad(sec%60)}` : `${sec}s`;

function finishWorkout(){
  const a = db.active;
  const done = a.exercises.some(ex => ex.sets.some(s => s.done));
  if (!done && !confirm('Nenhuma série concluída. Salvar mesmo assim?')) return;
  const w = {
    id: uid(), name: a.name, start: a.start, end: nowLocal(),
    exercises: a.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.filter(s => s.done).map(({t,w,r}) => { const o = {t}; if (w!=null) o.w=w; if (r!=null) o.r=r; return o; }),
    })).filter(ex => ex.sets.length),
  };
  // PRs (compare against history BEFORE this workout)
  const prs = [];
  for (const ex of w.exercises){
    const prevMax = maxBefore(ex.name, w.start);
    let best = null;
    for (const s of ex.sets) if (s.t!=='w' && s.w!=null && (best===null || s.w>best)) best = s.w;
    if (best != null && prevMax != null && best > prevMax) prs.push({name: ex.name, w: best, prev: prevMax});
  }
  db.workouts.push(w);
  db.active = null;
  save(); stopRest(); clearInterval(clockIv);
  const vol = woVolume(w), dur = woDur(w);
  openSheet(`
    <div class="sheet-title">Treino concluído 💪</div>
    <div class="summary-big">${volFmt(vol)}</div>
    <div class="muted small" style="margin-bottom:14px">volume total · ${woSets(w)} séries · ${minFmt(dur)}</div>
    ${prs.length ? `<div class="h2" style="margin-top:4px">Recordes</div>` +
      prs.map(p => `<div class="spread" style="padding:7px 0;border-bottom:1px solid var(--line)">
        <span>${esc(p.name)}</span>
        <span><span class="chip pr">PR</span> <b class="num">${kg(p.w)}</b>${p.prev!=null?` <span class="faint small num">(antes ${kg(p.prev)})</span>`:''}</span>
      </div>`).join('') : `<div class="muted small">Sem recordes hoje. Constância também é progresso.</div>`}
    <button class="btn primary" data-a="close" style="margin-top:16px">Fechar</button>`,
    {close: () => { closeSheet(); nav('home'); }});
}

/* ================= REST TIMER ================= */
const rest = {ends:0, total:0, iv:null};
let audioCtx = null;
document.addEventListener('touchstart', initAudio, {once:true});
document.addEventListener('click', initAudio, {once:true});
function initAudio(){ try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} }
function beep(){
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  [0,.25,.5].forEach((d,i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = i===2 ? 1175 : 880; o.type = 'sine';
    const t = audioCtx.currentTime + d;
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.35,t+.02); g.gain.exponentialRampToValueAtTime(.0001,t+.18);
    o.start(t); o.stop(t+.2);
  });
  if (navigator.vibrate) navigator.vibrate([180,80,180]);
}
function startRest(sec, label){
  rest.ends = Date.now() + sec*1000; rest.total = sec*1000; rest.fired = false;
  $('#rest-lbl').textContent = 'Descanso · ' + label.slice(0,28);
  $('#restbar').classList.add('on'); $('#restbar').classList.remove('zero');
  clearInterval(rest.iv); rest.iv = setInterval(tickRest, 200); tickRest();
}
function tickRest(){
  const left = rest.ends - Date.now();
  const bar = $('#restbar');
  if (left <= 0){
    $('#rest-t').textContent = '0:00';
    bar.querySelector('.fill').style.transform = 'scaleX(0)';
    if (!rest.fired){ rest.fired = true; beep(); bar.classList.add('zero'); $('#rest-lbl').textContent = 'Pronto — próxima série'; }
    if (left < -8000) stopRest();
    return;
  }
  const s = Math.ceil(left/1000);
  $('#rest-t').textContent = `${Math.floor(s/60)}:${pad(s%60)}`;
  bar.querySelector('.fill').style.transform = `scaleX(${Math.max(0,left/rest.total)})`;
}
function stopRest(){ clearInterval(rest.iv); $('#restbar').classList.remove('on','zero'); }
$('#rest-plus').addEventListener('click', () => { rest.ends += 15000; rest.total += 15000; rest.fired = false; $('#restbar').classList.remove('zero'); tickRest(); });
$('#rest-skip').addEventListener('click', stopRest);
document.addEventListener('visibilitychange', () => { if (!document.hidden && rest.iv) tickRest(); });

/* ================= HISTORY ================= */
function vHistory(){
  const ws = woSorted();
  if (!ws.length){ $('#view').innerHTML = `<div class="h1">Histórico</div><div class="card muted">Nenhum treino ainda. Comece um pelo Início.</div>`; return; }
  const groups = new Map();
  for (const w of ws){ const k = ym(dt(w.start)); if (!groups.has(k)) groups.set(k,[]); groups.get(k).push(w); }
  let html = `<div class="h1">Histórico</div>`;
  for (const [k, arr] of groups){
    html += `<button class="linkrow" data-a="month" data-k="${k}" style="border:none;padding:14px 2px 8px">
      <span class="h2" style="margin:0;text-transform:capitalize">${fmtYm(k)} · ${arr.length} treino${arr.length>1?'s':''}</span>
      <span class="small" style="color:var(--steel);font-weight:700">relatório ›</span></button>`;
    html += arr.map(w => {
      const d = dt(w.start);
      return `<button class="wo-item" data-a="open" data-id="${w.id}">
        <div class="spread"><span class="nm">${esc(w.name)}</span><span class="faint small num">${pad(d.getDate())}/${pad(d.getMonth()+1)}</span></div>
        <div class="meta">${fmtDia(d)} · ${minFmt(woDur(w))} · ${woSets(w)} séries · ${volFmt(woVolume(w))}</div>
      </button>`;
    }).join('');
  }
  $('#view').innerHTML = html;
  bind('#view', {
    open: el => nav('detail', {id: el.dataset.id}),
    month: el => nav('month', {k: el.dataset.k}),
  });
}

function vDetail(){
  const w = db.workouts.find(x => x.id === route.id);
  if (!w){ nav('history'); return; }
  const d = dt(w.start);
  $('#view').innerHTML = `
    <button class="small" style="color:var(--steel);font-weight:700;padding:2px 0 10px" data-a="back">‹ voltar</button>
    <div class="h1" style="margin-bottom:2px">${esc(w.name)}</div>
    <div class="muted small" style="margin-bottom:14px">${fmtDataLonga(d)} · ${d.toTimeString().slice(0,5)}</div>
    <div class="statrow">
      <div class="stat"><div class="v num">${minFmt(woDur(w))}</div><div class="l">duração</div></div>
      <div class="stat"><div class="v num">${woSets(w)}</div><div class="l">séries</div></div>
      <div class="stat"><div class="v num">${volFmt(woVolume(w))}</div><div class="l">volume</div></div>
    </div>
    <div class="card">
      ${w.exercises.map(ex => `<div class="detail-ex">
        <div class="nm">${esc(ex.name)}</div>
        ${ex.sets.map((s,i) => `<div class="detail-set">
          <span style="width:22px;color:${s.t==='w'?'var(--steel)':'var(--faint)'}">${s.t==='w'?'W':i+1}</span>
          ${s.w!=null||s.r!=null ? `<span><b>${s.w!=null?nbr(s.w,s.w%1?1:0):'—'}</b> kg × <b>${s.r??'—'}</b></span>` : ''}
          ${s.d ? `<span><b>${Math.round(s.d/60)}</b> min${s.km?` · <b>${nbr(s.km,2)}</b> km`:''}</span>` : ''}
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <button class="btn danger slim" data-a="del">Apagar este treino</button>`;
  bind('#view', {
    back: () => route.from === 'month' ? nav('month', {k: route.fromK}) :
                route.from ? nav(route.from) : nav('history'),
    del: () => { if (confirm('Apagar este treino do histórico?')){ db.workouts = db.workouts.filter(x => x.id !== w.id); save(); toast('Treino apagado'); nav('history'); } },
  });
}

function vMonth(){
  const k = route.k;
  const ws = woSorted().filter(w => ym(dt(w.start)) === k).reverse();
  const vol = ws.reduce((a,w) => a + woVolume(w), 0);
  const sets = ws.reduce((a,w) => a + woSets(w), 0);
  const mins = ws.reduce((a,w) => a + woDur(w), 0);
  // PRs in month
  const prs = [];
  for (const w of ws) for (const ex of w.exercises){
    const pm = maxBefore(ex.name, w.start);
    let best = null;
    for (const s of ex.sets) if (s.t!=='w' && s.w!=null && (best===null||s.w>best)) best = s.w;
    if (best!=null && pm!=null && best>pm) prs.push({name:ex.name, w:best, prev:pm, date:w.start});
  }
  $('#view').innerHTML = `
    <button class="small" style="color:var(--steel);font-weight:700;padding:2px 0 10px" data-a="back">‹ voltar</button>
    <div class="h1" style="text-transform:capitalize;margin-bottom:14px">${fmtYm(k)}</div>
    <div class="statrow">
      <div class="stat"><div class="v num">${ws.length}</div><div class="l">treinos</div></div>
      <div class="stat"><div class="v num">${volFmt(vol)}</div><div class="l">volume</div></div>
      <div class="stat"><div class="v num">${sets}</div><div class="l">séries</div></div>
    </div>
    <div class="statrow">
      <div class="stat"><div class="v num">${minFmt(mins)}</div><div class="l">tempo total</div></div>
      <div class="stat"><div class="v num">${ws.length?minFmt(mins/ws.length):'—'}</div><div class="l">média/treino</div></div>
      <div class="stat"><div class="v num">${prs.length}</div><div class="l">recordes</div></div>
    </div>
    ${prs.length ? `<div class="h2">Recordes do mês</div><div class="card">` +
      prs.map(p => `<div class="spread" style="padding:7px 0;border-bottom:1px solid var(--line)">
        <span style="flex:1">${esc(p.name)}</span>
        <span class="num"><b>${kg(p.w)}</b> <span class="faint small">(antes ${kg(p.prev)})</span></span>
      </div>`).join('') + `</div>` : ''}
    <div class="h2">Treinos</div>
    ${ws.map(w => { const d = dt(w.start); return `<button class="wo-item" data-a="open" data-id="${w.id}">
      <div class="spread"><span class="nm">${esc(w.name)}</span><span class="faint small num">${pad(d.getDate())}/${pad(d.getMonth()+1)}</span></div>
      <div class="meta">${minFmt(woDur(w))} · ${woSets(w)} séries · ${volFmt(woVolume(w))}</div></button>`; }).join('')
      || '<div class="card muted">Nenhum treino neste mês.</div>'}`;
  bind('#view', {
    back: () => nav('history'),
    open: el => nav('detail', {id: el.dataset.id, from:'month', fromK: k}),
  });
}

/* ================= CHARTS (SVG) ================= */
function niceTicks(min, max, n=4){
  if (min === max){ min = min*0.9; max = max*1.1 || 1; }
  const span = max - min, step0 = span/n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1,2,2.5,5,10].map(x => x*mag).find(x => x >= step0);
  const lo = Math.floor(min/step)*step, hi = Math.ceil(max/step)*step;
  const t = []; for (let v=lo; v<=hi+1e-9; v+=step) t.push(+v.toFixed(6));
  return t;
}
function lineChart(pts, {color='var(--accent)', unit='kg', h=210} = {}){
  const W = 520, P = {l:38, r:14, t:16, b:24};
  if (!pts.length) return `<div class="muted small" style="padding:20px 8px">Sem dados ainda.</div>`;
  const xs = pts.map(p => p.t), ys = pts.map(p => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1){ x0 -= 43200000; x1 += 43200000; }
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length-1];
  const X = t => P.l + (t-x0)/(x1-x0) * (W-P.l-P.r);
  const Y = v => P.t + (1-(v-y0)/(y1-y0||1)) * (h-P.t-P.b);
  let g = '';
  for (const tv of ticks)
    g += `<line x1="${P.l}" x2="${W-P.r}" y1="${Y(tv)}" y2="${Y(tv)}" stroke="var(--line)" stroke-width="1"/>
          <text x="${P.l-6}" y="${Y(tv)+3.5}" fill="var(--faint)" font-size="10" text-anchor="end">${nbr(tv, tv%1?1:0)}</text>`;
  // x labels: month boundaries (or few date labels if short range)
  const days = (x1-x0)/86400000;
  const xl = [];
  if (days > 70){
    const d = new Date(x0); d.setDate(1); d.setHours(0,0,0,0);
    if (d.getTime() < x0) d.setMonth(d.getMonth()+1);
    let lastX = -99;
    while (d.getTime() <= x1){
      const x = X(d.getTime());
      if (x - lastX > 44){ xl.push(`<text x="${x}" y="${h-6}" fill="var(--faint)" font-size="10" text-anchor="middle">${MESES3[d.getMonth()]}${d.getMonth()===0?`/${String(d.getFullYear()).slice(2)}`:''}</text>`); lastX = x; }
      d.setMonth(d.getMonth()+1);
    }
  } else {
    const idxs = pts.length <= 5 ? pts.map((_,i)=>i) : [0, Math.floor(pts.length/2), pts.length-1];
    let lastX = -99;
    for (const i of idxs){ const d = new Date(pts[i].t), x = X(pts[i].t);
      if (x - lastX > 50){ xl.push(`<text x="${x}" y="${h-6}" fill="var(--faint)" font-size="10" text-anchor="middle">${pad(d.getDate())}/${pad(d.getMonth()+1)}</text>`); lastX = x; } }
  }
  const path = pts.map((p,i) => `${i?'L':'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const dots = pts.map((p,i) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${i===pts.length-1?4.5:2.6}" fill="${i===pts.length-1?color:'var(--bg)'}" stroke="${color}" stroke-width="1.6"/>`).join('');
  const lp = pts[pts.length-1];
  const lx = Math.min(X(lp.t), W-P.r-30);
  const label = `<text x="${lx}" y="${Math.max(12, Y(lp.y)-10)}" fill="${color}" font-size="12" font-weight="800" text-anchor="middle">${nbr(lp.y, lp.y%1?1:0)}</text>`;
  return `<svg viewBox="0 0 ${W} ${h}" width="100%" role="img">${g}${xl.join('')}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${label}</svg>`;
}
function barChart(items, {h=210} = {}){ // items: [{label, v}]
  const W = 520, P = {l:8, r:8, t:26, b:22};
  if (!items.length) return `<div class="muted small" style="padding:20px 8px">Sem dados.</div>`;
  const max = Math.max(...items.map(i => i.v)) || 1;
  const bw = (W-P.l-P.r)/items.length;
  let out = '';
  items.forEach((it,i) => {
    const bh = (it.v/max)*(h-P.t-P.b);
    const x = P.l + i*bw + bw*0.14, y = h-P.b-bh;
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*0.72).toFixed(1)}" height="${Math.max(bh,1).toFixed(1)}" rx="4" fill="${i===items.length-1?'var(--accent)':'rgba(255,180,84,.45)'}"/>`;
    if (bw > 26 || i % 2 === (items.length-1) % 2)
      out += `<text x="${(x+bw*0.36).toFixed(1)}" y="${h-6}" fill="var(--faint)" font-size="9.5" text-anchor="middle">${it.label}</text>`;
    if (bw > 30 || i === items.length-1)
      out += `<text x="${(x+bw*0.36).toFixed(1)}" y="${(y-5).toFixed(1)}" fill="var(--muted)" font-size="9.5" text-anchor="middle">${it.v >= 1000 ? nbr(it.v/1000,1)+'k' : nbr(it.v)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${h}" width="100%" role="img">${out}</svg>`;
}

/* ================= PROGRESS ================= */
let progTab = 'ex', progEx = null, progMetric = 'bw';
function vProgress(){
  const tabs = [['ex','Exercícios'],['vol','Volume mensal'],['peso','Peso corporal']];
  let body = '';
  if (progTab === 'ex') body = progExHTML();
  if (progTab === 'vol') body = progVolHTML();
  if (progTab === 'peso') body = progPesoHTML();
  $('#view').innerHTML = `
    <div class="h1">Progresso</div>
    <div class="seg">${tabs.map(([k,l]) => `<button class="${progTab===k?'on':''}" data-a="tab" data-k="${k}">${l}</button>`).join('')}</div>
    ${body}`;
  bindProgress();
}
function progExHTML(){
  const names = exNames();
  if (!progEx || !names.includes(progEx)) progEx = names[0];
  const hist = exHistory(progEx);
  const metrics = [['bw','Peso máx.'],['e1','1RM est.'],['vol','Volume']];
  const pts = hist.filter(p => p[progMetric === 'e1' ? 'be' : progMetric === 'vol' ? 'vol' : 'bw'] != null)
                  .map(p => ({t: dt(p.date).getTime(), y: progMetric==='e1' ? p.be : progMetric==='vol' ? p.vol : p.bw}));
  const best = pts.length ? Math.max(...pts.map(p => p.y)) : null;
  const recent = hist.slice(-6).reverse();
  return `
    <select data-a="ex" style="width:100%;margin-bottom:12px;font-weight:700">
      ${names.map(n => `<option ${n===progEx?'selected':''}>${esc(n)}</option>`).join('')}
    </select>
    <div class="seg">${metrics.map(([k,l]) => `<button class="${progMetric===k?'on':''}" data-a="metric" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="chartbox">
      <div class="cap"><span>${hist.length} sessões · todo o histórico</span>${best!=null?`<span>melhor: <b class="num" style="color:var(--accent)">${progMetric==='vol'?volFmt(best):kg(Math.round(best*10)/10)}</b></span>`:''}</div>
      ${lineChart(pts, {unit: progMetric==='vol'?'':'kg'})}
    </div>
    ${recent.length ? `<div class="h2">Últimas sessões</div><div class="card">` +
      recent.map(p => `<button class="linkrow" data-a="open" data-id="${p.id}">
        <span class="small num">${fmtDia(dt(p.date))}</span>
        <span class="small num">${p.sets.filter(s=>s.t!=='w').map(s => s.w!=null?`${nbr(s.w,s.w%1?1:0)}×${s.r??'–'}`:'').filter(Boolean).join('  ')}</span>
      </button>`).join('') + `</div>` : `<div class="card muted small">Sem registros deste exercício ainda.</div>`}`;
}
function progVolHTML(){
  const map = new Map();
  for (const w of woSorted().reverse()){
    const k = ym(dt(w.start));
    map.set(k, (map.get(k)||0) + woVolume(w));
  }
  const keys = [...map.keys()].sort();
  const items = [];
  if (keys.length){
    let [y,m] = keys[0].split('-').map(Number);
    const [y1,m1] = keys[keys.length-1].split('-').map(Number);
    while (y < y1 || (y === y1 && m <= m1)){
      const k = `${y}-${pad(m)}`;
      items.push({label: MESES3[m-1] + (m===1?`/${String(y).slice(2)}`:''), v: Math.round(map.get(k)||0), k});
      m++; if (m > 12){ m = 1; y++; }
    }
  }
  const counts = new Map();
  for (const w of db.workouts){ const k = ym(dt(w.start)); counts.set(k,(counts.get(k)||0)+1); }
  return `
    <div class="chartbox"><div class="cap"><span>Volume total por mês (kg levantados)</span></div>${barChart(items)}</div>
    <div class="h2">Treinos por mês</div>
    <div class="card">${[...counts.entries()].reverse().map(([k,c]) => `<button class="linkrow" data-a="month" data-k="${k}">
      <span style="text-transform:capitalize">${fmtYm(k)}</span><span class="num"><b>${c}</b> treino${c>1?'s':''} <span class="arrow">›</span></span>
    </button>`).join('')}</div>`;
}
function progPesoHTML(){
  const bw = [...db.bodyweight].sort((a,b) => a.date < b.date ? -1 : 1);
  const pts = bw.map(x => ({t: dt(x.date+'T12:00').getTime(), y: x.kg}));
  const today = ymd(new Date());
  return `
    <div class="chartbox"><div class="cap"><span>Peso corporal</span>${bw.length?`<span>atual: <b class="num" style="color:var(--steel)">${kg(bw[bw.length-1].kg)}</b></span>`:''}</div>
      ${lineChart(pts, {color:'var(--steel)'})}</div>
    <div class="card">
      <div class="row">
        <input type="date" value="${today}" id="bw-date" style="flex:1">
        <input type="text" inputmode="decimal" placeholder="kg" id="bw-kg" style="width:80px">
        <button class="btn slim" data-a="addbw" style="width:auto;padding:9px 16px">Anotar</button>
      </div>
    </div>
    ${bw.length ? `<div class="card">` + [...bw].reverse().slice(0,12).map(x => `<div class="linkrow">
        <span class="small num">${x.date.split('-').reverse().join('/')}</span>
        <span class="row"><b class="num">${kg(x.kg)}</b><button class="mini" data-a="delbw" data-d="${x.date}" aria-label="apagar">✕</button></span>
      </div>`).join('') + `</div>` : ''}`;
}
function bindProgress(){
  bind('#view', {
    tab: el => { progTab = el.dataset.k; render(); },
    metric: el => { progMetric = el.dataset.k; render(); },
    open: el => nav('detail', {id: el.dataset.id, from:'progress'}),
    month: el => nav('month', {k: el.dataset.k}),
    addbw: () => {
      const kgv = numIn($('#bw-kg').value), d = $('#bw-date').value;
      if (!kgv || !d){ toast('Preencha a data e o peso'); return; }
      db.bodyweight = db.bodyweight.filter(x => x.date !== d);
      db.bodyweight.push({date:d, kg:kgv}); save(); render(); toast('Peso anotado');
    },
    delbw: el => { db.bodyweight = db.bodyweight.filter(x => x.date !== el.dataset.d); save(); render(); },
  });
  const sel = $('#view select[data-a=ex]');
  if (sel) sel.addEventListener('change', () => { progEx = sel.value; render(); });
}

/* ================= PLAN ================= */
function vPlan(){
  $('#view').innerHTML = `
    <div class="h1">Plano de treino</div>
    ${db.routines.map(r => `<div class="card">
      <div class="spread">
        <div>
          <div style="font-weight:800;font-size:16px">${esc(r.name)}</div>
          <div class="muted small">${r.exercises.length} exercícios · ${r.exercises.reduce((a,e)=>a+e.sets,0)} séries</div>
        </div>
        <div class="row">
          <button class="btn slim" data-a="edit" data-id="${r.id}" style="width:auto;padding:8px 14px">Editar</button>
          <button class="btn slim primary" data-a="start" data-id="${r.id}" style="width:auto;padding:8px 14px">Começar</button>
        </div>
      </div>
      <div class="muted small" style="margin-top:10px;line-height:1.7">${r.exercises.map(e => `${esc(e.name)} <span class="faint num">${e.sets}×${e.repsMin}–${e.repsMax}</span>`).join('<br>')}</div>
    </div>`).join('')}
    <button class="btn slim" data-a="new">+ Nova rotina</button>`;
  bind('#view', {
    edit: el => nav('editRoutine', {id: el.dataset.id}),
    start: el => startWorkout(el.dataset.id),
    new: () => {
      const name = prompt('Nome da rotina:', `Treino ${String.fromCharCode(65 + db.routines.length)}`);
      if (!name) return;
      const r = {id: uid(), name, exercises: []};
      db.routines.push(r); save(); nav('editRoutine', {id: r.id});
    },
  });
}
function vEditRoutine(){
  const r = db.routines.find(x => x.id === route.id);
  if (!r){ nav('plan'); return; }
  const known = exNames();
  $('#view').innerHTML = `
    <button class="small" style="color:var(--steel);font-weight:700;padding:2px 0 10px" data-a="back">‹ plano</button>
    <input value="${esc(r.name)}" id="r-name" style="width:100%;font-size:19px;font-weight:800;margin-bottom:12px">
    <div class="card">
      ${r.exercises.map((e,i) => `<div class="pl-ex">
        <div class="spread">
          <span class="nm">${esc(e.name)} ${e.perSide?'<span class="chip side">por lado</span>':''} ${e.superset?'<span class="chip ss">superset</span>':''}</span>
          <span class="row" style="gap:5px">
            <button class="mini" data-a="up" data-i="${i}" aria-label="subir">↑</button>
            <button class="mini" data-a="dn" data-i="${i}" aria-label="descer">↓</button>
            <button class="mini" data-a="rm" data-i="${i}" aria-label="remover" style="color:var(--bad)">✕</button>
          </span>
        </div>
        <div class="pl-ctl">
          <label>séries<input type="number" value="${e.sets}" data-f="sets" data-i="${i}"></label>
          <label>reps mín<input type="number" value="${e.repsMin}" data-f="repsMin" data-i="${i}"></label>
          <label>reps máx<input type="number" value="${e.repsMax}" data-f="repsMax" data-i="${i}"></label>
          <label>desc. (s)<input type="number" value="${e.rest ?? db.settings.restDefault}" data-f="rest" data-i="${i}"></label>
          <label style="flex-direction:row;align-items:center;gap:6px;padding-top:14px">
            <input type="checkbox" ${e.perSide?'checked':''} data-f="perSide" data-i="${i}" style="width:18px;height:18px"> por lado
          </label>
        </div>
      </div>`).join('') || '<div class="muted small">Nenhum exercício. Adicione abaixo.</div>'}
    </div>
    <div class="card">
      <div class="row">
        <input list="exlist" id="new-ex" placeholder="Nome do exercício" style="flex:1">
        <button class="btn slim" data-a="add" style="width:auto;padding:9px 14px">Adicionar</button>
      </div>
      <datalist id="exlist">${known.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    <button class="btn danger slim" data-a="delr">Apagar rotina</button>`;
  const commit = () => { save(); };
  $('#r-name').addEventListener('input', () => { r.name = $('#r-name').value; commit(); });
  $$('#view [data-f]').forEach(inp => inp.addEventListener('change', () => {
    const e = r.exercises[inp.dataset.i], f = inp.dataset.f;
    if (f === 'perSide') e.perSide = inp.checked;
    else { const v = parseInt(inp.value,10); if (isFinite(v) && v > 0) e[f] = v; }
    commit();
  }));
  bind('#view', {
    back: () => nav('plan'),
    up: el => { const i = +el.dataset.i; if (i>0){ [r.exercises[i-1],r.exercises[i]] = [r.exercises[i],r.exercises[i-1]]; commit(); render(); } },
    dn: el => { const i = +el.dataset.i; if (i<r.exercises.length-1){ [r.exercises[i+1],r.exercises[i]] = [r.exercises[i],r.exercises[i+1]]; commit(); render(); } },
    rm: el => { r.exercises.splice(+el.dataset.i,1); commit(); render(); },
    add: () => {
      const n = $('#new-ex').value.trim();
      if (!n) return;
      r.exercises.push({name:n, sets:3, repsMin:8, repsMax:12, rest: db.settings.restDefault});
      commit(); render();
    },
    delr: () => { if (confirm(`Apagar "${r.name}"? O histórico de treinos não é afetado.`)){
      db.routines = db.routines.filter(x => x.id !== r.id); save(); nav('plan'); } },
  });
}

/* ================= SETTINGS ================= */
function vSettings(){
  $('#view').innerHTML = `
    <div class="h1">Ajustes</div>
    <div class="h2">Backup</div>
    <div class="card">
      <button class="btn slim" data-a="exp">Exportar backup (JSON)</button>
      <div style="height:8px"></div>
      <button class="btn slim" data-a="impjson">Importar backup (JSON)</button>
      <div style="height:8px"></div>
      <button class="btn slim" data-a="impcsv">Importar CSV do Hevy</button>
      <p class="faint small" style="margin-top:10px;line-height:1.5">Seus dados vivem só neste aparelho. Exporte um backup de vez em quando e guarde no iCloud/Arquivos. Importar backup substitui tudo; importar CSV do Hevy só acrescenta treinos que ainda não existem.</p>
      <input type="file" id="f-json" accept=".json,application/json" hidden>
      <input type="file" id="f-csv" accept=".csv,text/csv" hidden>
    </div>
    <div class="h2">Preferências</div>
    <div class="card spread">
      <span>Descanso padrão (s)</span>
      <input type="number" id="s-rest" value="${db.settings.restDefault}" style="width:80px">
    </div>
    <div class="h2">Instalação no iPhone</div>
    <div class="card small muted" style="line-height:1.65">
      Abra este endereço no <b style="color:var(--text)">Safari</b> → botão <b style="color:var(--text)">Compartilhar</b> → <b style="color:var(--text)">Adicionar à Tela de Início</b>. O app abre em tela cheia e funciona offline.
    </div>
    <div class="h2">Zona de risco</div>
    <div class="card"><button class="btn danger slim" data-a="wipe">Apagar todos os dados</button></div>
    <p class="faint small" style="text-align:center;margin-top:6px">FERRO v1 · ${db.workouts.length} treinos no aparelho</p>`;
  $('#s-rest').addEventListener('change', () => {
    const v = parseInt($('#s-rest').value,10);
    if (isFinite(v) && v >= 10){ db.settings.restDefault = v; save(); toast('Salvo'); }
  });
  bind('#view', {
    exp: exportJSON,
    impjson: () => $('#f-json').click(),
    impcsv: () => $('#f-csv').click(),
    wipe: () => {
      if (confirm('Apagar TODOS os dados (plano, histórico, peso)?') && confirm('Certeza? Não dá para desfazer sem backup.')){
        localStorage.removeItem(KEY); load(); toast('Dados restaurados ao inicial'); nav('home');
      }
    },
  });
  $('#f-json').addEventListener('change', ev => importJSON(ev.target.files[0]));
  $('#f-csv').addEventListener('change', ev => importHevy(ev.target.files[0]));
}
function exportJSON(){
  const d = new Date();
  const blob = new Blob([JSON.stringify(db, null, 1)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ferro-backup-${ymd(d)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Backup gerado');
}
function importJSON(file){
  if (!file) return;
  file.text().then(t => {
    const d = JSON.parse(t);
    if (!d.routines || !d.workouts) throw new Error('formato');
    if (!confirm(`Substituir tudo pelo backup (${d.workouts.length} treinos)?`)) return;
    db = d; save(); toast('Backup restaurado'); nav('home');
  }).catch(() => toast('Arquivo inválido'));
}
/* --- Hevy CSV --- */
function parseCSV(text){
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){
      if (c === '"'){ if (text[i+1] === '"'){ cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ','){ row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r'){
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length){ row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}
const MON = {jan:1,feb:2,fev:2,mar:3,apr:4,abr:4,may:5,mai:5,jun:6,jul:7,aug:8,ago:8,sep:9,set:9,oct:10,out:10,nov:11,dec:12,dez:12};
function parseHevyDate(s){
  const m = /(\d+) (\w+) (\d{4}),? (\d+):(\d+)/.exec(s);
  if (!m) return null;
  const mo = MON[m[2].slice(0,3).toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${pad(mo)}-${pad(+m[1])}T${pad(+m[4])}:${pad(+m[5])}`;
}
function importHevy(file){
  if (!file) return;
  file.text().then(t => {
    const rows = parseCSV(t);
    const hd = rows[0].map(h => h.trim().toLowerCase());
    const col = n => hd.indexOf(n);
    const iT = col('title'), iS = col('start_time'), iE = col('end_time'),
          iEx = col('exercise_title'), iTy = col('set_type'),
          iW = col('weight_kg') >= 0 ? col('weight_kg') : col('weight_lbs'),
          iR = col('reps'), iD = col('duration_seconds'), iK = col('distance_km');
    if (iT < 0 || iS < 0 || iEx < 0){ toast('CSV não parece ser do Hevy'); return; }
    const lbs = col('weight_kg') < 0 && col('weight_lbs') >= 0;
    const map = new Map();
    for (let ri = 1; ri < rows.length; ri++){
      const r = rows[ri]; if (r.length < 3) continue;
      const start = parseHevyDate(r[iS]); if (!start) continue;
      const key = r[iT] + '|' + start;
      if (!map.has(key)) map.set(key, {id: uid(), name: r[iT], start, end: parseHevyDate(r[iE]) || start, exercises: []});
      const w = map.get(key);
      const name = r[iEx].trim();
      let ex = w.exercises.find(e => e.name === name);
      if (!ex){ ex = {name, sets: []}; w.exercises.push(ex); }
      const s = {t: (r[iTy]||'n')[0] === 'w' ? 'w' : 'n'};
      if (r[iW]) s.w = lbs ? Math.round(parseFloat(r[iW])*0.4536*10)/10 : parseFloat(r[iW]);
      if (r[iR]) s.r = Math.round(parseFloat(r[iR]));
      if (iD >= 0 && r[iD]) s.d = Math.round(parseFloat(r[iD]));
      if (iK >= 0 && r[iK]) s.km = parseFloat(r[iK]);
      ex.sets.push(s);
    }
    const existing = new Set(db.workouts.map(w => w.name + '|' + w.start));
    let added = 0;
    for (const [key, w] of map) if (!existing.has(key)){ db.workouts.push(w); added++; }
    save(); toast(added ? `${added} treinos importados` : 'Nada novo para importar');
  }).catch(() => toast('Erro ao ler o CSV'));
}

/* ================= sheet & binding ================= */
function openSheet(html, actions={}){
  $('#sheet').innerHTML = html;
  $('#sheet-bg').classList.add('on');
  requestAnimationFrame(() => $('#sheet').classList.add('on'));
  bind('#sheet', actions);
}
function closeSheet(){ $('#sheet').classList.remove('on'); $('#sheet-bg').classList.remove('on'); }
$('#sheet-bg').addEventListener('click', closeSheet);
function bind(root, actions){
  $$(root + ' [data-a]').forEach(el => {
    const fn = actions[el.dataset.a];
    if (fn && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') el.addEventListener('click', () => fn(el));
  });
}
$$('#tabbar button, #topbar [data-nav]').forEach(b => b.addEventListener('click', () => nav(b.dataset.nav)));

/* ================= boot ================= */
load();
if (db.active) nav('workout'); else nav('home');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
