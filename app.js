/* PINEAPPLE METHOD — diário de treino pessoal. Dados 100% locais (localStorage). */
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
  if (normalize()) save(); // persiste migrações na hora
}
function normalize(){
  const had = Array.isArray(db.programs) && db.programs.length > 0;
  db.bodyweight = db.bodyweight || [];
  db.settings = db.settings || {restDefault:90};
  db.exMuscles = db.exMuscles || {};
  // v8: planejamentos (caixas de rotinas). Migração não destrutiva.
  if (!Array.isArray(db.programs) || !db.programs.length){
    const pid = uid();
    db.programs = [{id: pid, name: 'Planejamento 1'}];
    for (const r of db.routines) r.pid = pid;
    db.settings.activeProg = pid;
  }
  if (!db.programs.some(p => p.id === db.settings.activeProg)) db.settings.activeProg = db.programs[0].id;
  for (const r of db.routines) if (!db.programs.some(p => p.id === r.pid)) r.pid = db.settings.activeProg;
  return !had; // true se migrou agora
}
const actRoutines = () => db.routines.filter(r => r.pid === db.settings.activeProg);
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch(e){ toast('Erro ao salvar: armazenamento cheio?'); }
}

/* ---------- derived ---------- */
const woSorted = () => [...db.workouts].sort((a,b) => dt(b.start) - dt(a.start)); // desc
function woVolume(w){
  let v = 0;
  for (const ex of w.exercises) for (const s of ex.sets)
    if (s.t !== 'w' && s.w != null && s.r != null) v += s.w * (s.r + (s.r2 || 0));
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
            vol += s.w * (s.r + (s.r2 || 0));
            if (bw === null || s.w > bw) bw = s.w;
            const reff = s.r2 != null ? Math.min(s.r, s.r2) : s.r; // unilateral: perna mais fraca
            const e = epley(s.w, reff);
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
  const rs = actRoutines(); // só o planejamento ativo
  if (!rs.length) return null;
  const names = rs.map(r => r.name);
  for (const w of woSorted()){
    const i = names.indexOf(w.name);
    if (i >= 0) return rs[(i+1) % rs.length];
  }
  return rs[0];
}

/* ================= MÚSCULOS ================= */
const MUSCLES = [
  ['peito','Peito'], ['ombro','Ombro'], ['trapezio','Trapézio'], ['dorsal','Dorsal'],
  ['lombar','Lombar'], ['biceps','Bíceps'], ['triceps','Tríceps'], ['antebraco','Antebraço'],
  ['abdomen','Abdômen'], ['obliquo','Oblíquos'], ['quadriceps','Quadríceps'],
  ['posterior','Post. de coxa'], ['gluteo','Glúteo'], ['panturrilha','Panturrilha'],
];
const MLABEL = Object.fromEntries(MUSCLES);
const mnorm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();

/* dicionário exato (nomes do plano/histórico) com dica de sensação */
const EXDB = {
  'supino inclinado (halter)': {p:['peito','ombro'], s:['triceps'], tip:'Desça até sentir a parte de cima do peito alongar e suba apertando o peitoral. Se o ombro gritar, encoste mais as escápulas no banco.'},
  'remada unilateral (halter)': {p:['dorsal'], s:['biceps','trapezio','antebraco'], tip:'Puxe com as costas, não com o braço: pense em levar o cotovelo ao bolso. Deve queimar na lateral das costas, não no bíceps primeiro.'},
  'agachamento bulgaro': {p:['quadriceps','gluteo'], s:['posterior'], tip:'A perna da frente faz o trabalho: sinta a coxa e o glúteo dela. Tronco levemente inclinado à frente acende mais o glúteo.'},
  'desenvolvimento sentado (halter)': {p:['ombro'], s:['triceps','trapezio'], tip:'Empurre para o teto sem arquear a lombar. A queimação certa é no ombro; se pinicar no pescoço, baixe o peso.'},
  'roda abdominal': {p:['abdomen'], s:['obliquo','lombar'], tip:'Contraia o abdômen o tempo todo, como se fossem te dar um soco. A lombar não pode afundar; se doer embaixo das costas, encurte o movimento.'},
  'supino reto / floor press (halter)': {p:['peito'], s:['triceps','ombro'], tip:'Sinta o peito esticar embaixo e contrair em cima. Cotovelos a uns 45° do tronco, não abertos em cruz.'},
  'remada curvada (2 halteres)': {p:['dorsal','trapezio'], s:['biceps','lombar'], tip:'Costas retas, puxe os cotovelos para trás e junte as escápulas. Deve queimar no meio das costas.'},
  'terra romeno (halter)': {p:['posterior','gluteo'], s:['lombar','antebraco'], tip:'Empurre o quadril para trás com joelhos quase esticados até a parte de trás da coxa alongar bem. Suba apertando o glúteo, sem puxar com a lombar.'},
  'elevacao lateral (halter)': {p:['ombro'], s:['trapezio'], tip:'Suba até a altura dos ombros com cotovelos levemente dobrados. Queima na lateral do ombro; se você encolher os ombros, o peso está pesado demais.'},
  'elevacao de quadril (escapulas no banco)': {p:['gluteo'], s:['posterior'], tip:'Suba o quadril apertando o bumbum no topo por 1 segundo. Queixo levemente para baixo; quem empurra é o calcanhar.'},
  'supino declinado / crucifixo inclinado': {p:['peito'], s:['ombro','triceps'], tip:'No crucifixo, abra como um abraço invertido e sinta o peito alongar; não deixe virar supino dobrando demais o cotovelo.'},
  'remada peito apoiado (banco inclinado)': {p:['dorsal','trapezio'], s:['biceps'], tip:'O banco tira a lombar do jogo: puxe os cotovelos para trás e esprema as escápulas. Sinta o meio das costas.'},
  'afundo reverso': {p:['quadriceps','gluteo'], s:['posterior'], tip:'Dê o passo para trás e desça reto; a perna da frente empurra o chão para subir. Sinta coxa e glúteo da perna da frente.'},
  'rosca inclinada (halter)': {p:['biceps'], s:['antebraco'], tip:'Braço caído para trás do corpo estica mais o bíceps: sinta alongar embaixo e aperte em cima, sem balançar o tronco.'},
  'triceps testa (halter)': {p:['triceps'], s:[], tip:'Cotovelos apontados para o teto e parados; só o antebraço se move. Queima atrás do braço.'},
  'face pull (elastico)': {p:['ombro','trapezio'], s:['dorsal'], tip:'Puxe em direção ao rosto abrindo as mãos, como quem mostra os músculos. Sinta atrás do ombro e entre as escápulas; ótimo para postura.'},
};

/* inferência por palavra-chave para nomes fora do dicionário (ordem importa) */
const INFER = [
  [/face ?pull/, {p:['ombro','trapezio'], s:['dorsal']}],
  [/encolhimento|shrug/, {p:['trapezio'], s:['antebraco']}],
  [/remada alta/, {p:['trapezio','ombro'], s:['biceps']}],
  [/punho/, {p:['antebraco'], s:[]}],
  [/rosca/, {p:['biceps'], s:['antebraco']}],
  [/coice de gluteo/, {p:['gluteo'], s:[]}],
  [/triceps|frances|testa|coice|kickback/, {p:['triceps'], s:[]}],
  [/mergulho|paralela|\bdips?\b/, {p:['triceps','peito'], s:['ombro']}],
  [/crucifixo inverso|voador inverso|reverse fly/, {p:['ombro'], s:['trapezio']}],
  [/crucifixo|voador|\bfly\b|cross ?over|peck?[ -]?deck/, {p:['peito'], s:['ombro']}],
  [/supino|flexao de brac|press de peito|floor press|push ?up/, {p:['peito'], s:['triceps','ombro']}],
  [/desenvolvimento|militar|arnold/, {p:['ombro'], s:['triceps','trapezio']}],
  [/elevacao lateral|elevacao frontal/, {p:['ombro'], s:[]}],
  [/puxada|pull ?down|pull ?up|barra fixa|chin ?up/, {p:['dorsal'], s:['biceps']}],
  [/pull ?over/, {p:['dorsal','peito'], s:['triceps']}],
  [/remada|serrote/, {p:['dorsal'], s:['biceps','trapezio']}],
  [/romeno|stiff/, {p:['posterior','gluteo'], s:['lombar']}],
  [/levantamento terra|\bterra\b|deadlift/, {p:['posterior','gluteo'], s:['lombar','dorsal','antebraco']}],
  [/bulgaro|afundo|avanco|passada|lunge|step[ -]?up|subida no banco/, {p:['quadriceps','gluteo'], s:['posterior']}],
  [/agachamento|squat|leg ?press|\bhack\b/, {p:['quadriceps','gluteo'], s:['posterior']}],
  [/extensora|extensao de perna/, {p:['quadriceps'], s:[]}],
  [/flexora|nordic|flexao de perna|flexao de joelho/, {p:['posterior'], s:[]}],
  [/elevacao de quadril|hip ?thrust|ponte|elevacao pelvica/, {p:['gluteo'], s:['posterior']}],
  [/gluteo|abduc|abdutor/, {p:['gluteo'], s:[]}],
  [/adutor|aducao/, {p:['quadriceps'], s:['gluteo']}],
  [/panturrilha|\bcalf\b|gemeo/, {p:['panturrilha'], s:[]}],
  [/prancha lateral/, {p:['obliquo'], s:['abdomen']}],
  [/prancha|plank/, {p:['abdomen'], s:['obliquo','lombar']}],
  [/obliquo|russian|lenhador|rotacao de tronco/, {p:['obliquo'], s:['abdomen']}],
  [/roda|abdominal|abdomen|crunch|\binfra\b|\bsupra\b|sit ?up|elevacao de perna|canivete/, {p:['abdomen'], s:['obliquo']}],
  [/lombar|hiperextensao|good ?morning|superman/, {p:['lombar'], s:['gluteo','posterior']}],
];

/* dica genérica por músculo primário (fallback) */
const MTIP = {
  peito:'Empurre ou junte pensando em contrair o peito; os braços só transmitem a força.',
  ombro:'Movimento controlado, sem impulso do corpo; a queimação certa fica na "bola" do ombro.',
  trapezio:'Pense em juntar as escápulas, sem encolher o pescoço.',
  dorsal:'Puxe com o cotovelo, não com a mão; sinta a lateral das costas trabalhar.',
  lombar:'Movimento lento, coluna neutra, sem arredondar as costas; pare se houver dor aguda.',
  biceps:'Cotovelo fixo ao lado do corpo; suba sem balançar o tronco.',
  triceps:'Cotovelo parado; só o antebraço se move. Queima atrás do braço.',
  antebraco:'Aperte firme a pegada; o antebraço trabalha segurando e movendo o punho.',
  abdomen:'Contraia como se fosse levar um soco; solte o ar no esforço.',
  obliquo:'Gire ou incline controlando; sinta a lateral da barriga.',
  quadriceps:'Empurre o chão com o pé inteiro; sinta a frente da coxa.',
  posterior:'Quadril para trás, coluna neutra; sinta alongar atrás da coxa.',
  gluteo:'Aperte o bumbum no topo do movimento por 1 segundo.',
  panturrilha:'Suba na ponta do pé o mais alto possível e desça devagar, alongando.',
};

function getMuscles(name){
  const k = mnorm(name);
  if (db.exMuscles && db.exMuscles[k]) return db.exMuscles[k];
  if (EXDB[k]) return EXDB[k];
  for (const [re, m] of INFER) if (re.test(k)) return m;
  return null;
}
function muscleTip(name){
  const m = getMuscles(name);
  if (!m) return null;
  return m.tip || ((m.p && m.p.length) ? MTIP[m.p[0]] : null);
}
/* agrega séries efetivas por músculo (secundário conta metade).
   Aceita sets como array (treino) ou número (rotina). */
function muscleAgg(exercises){
  const agg = new Map();
  for (const ex of exercises){
    const m = getMuscles(ex.name); if (!m) continue;
    let n;
    if (Array.isArray(ex.sets)) n = ex.sets.filter(s => s.t !== 'w' && (s.done === undefined || s.done)).length;
    else n = ex.sets || 0;
    if (!n) continue;
    for (const id of m.p || []) agg.set(id, (agg.get(id)||0) + n);
    for (const id of m.s || []) agg.set(id, (agg.get(id)||0) + n*0.5);
  }
  return [...agg.entries()].sort((a,b) => b[1]-a[1]);
}
/* chips por exercício (sem contagem) — toque abre a ficha do exercício */
function chipsFor(name){
  const m = getMuscles(name);
  if (!m) return `<button class="chip unk" data-a="musx" data-n="${esc(name)}">músculos?</button>`;
  return [
    ...(m.p||[]).map(id => `<button class="chip mus" data-a="musx" data-n="${esc(name)}">${MLABEL[id]}</button>`),
    ...(m.s||[]).map(id => `<button class="chip mus2" data-a="musx" data-n="${esc(name)}">${MLABEL[id]}</button>`),
  ].join('');
}
function chipsAgg(agg, act=''){
  return agg.map(([id,v]) => `<button class="chip mus" ${act}>${MLABEL[id]} <b class="num">${nbr(v, v%1?1:0)}</b></button>`).join('');
}
const MUSCAP = `<p class="faint small" style="margin-top:7px;line-height:1.45">número = séries que trabalharam o músculo (secundário vale meia série)</p>`;

/* ---------- mapa corporal (SVG, frente/costas) ---------- */
function heat(v){
  if (!v) return 'rgba(233,236,241,.05)';
  return `rgba(255,180,84,${(0.16 + 0.84*Math.min(1,v)).toFixed(2)})`;
}
function bodyMapSVG(vals, px){
  const f = id => `fill="${heat(vals[id]||0)}"`;
  const st = 'stroke="rgba(38,46,58,.9)" stroke-width="1"';
  const sil = 'fill="rgba(233,236,241,.03)" stroke="#262E3A" stroke-width="1"';
  const dim = px ? `width="${px}" height="${Math.round(px*224/300)}"` : 'class="bodymap"';
  return `<svg xmlns="http://www.w3.org/2000/svg" ${dim} viewBox="0 0 300 224" role="img" aria-label="Mapa de músculos">
  <!-- FRENTE -->
  <circle cx="78" cy="22" r="12" ${sil}/>
  <rect x="73" y="33" width="10" height="7" ${sil}/>
  <polygon points="55,46 101,46 95,100 61,100" ${sil}/>
  <polygon points="61,100 95,100 93,113 63,113" ${sil}/>
  <rect x="64" y="158" width="11" height="38" rx="5" ${sil}/>
  <rect x="81" y="158" width="11" height="38" rx="5" ${sil}/>
  <polygon points="62,47 78,39 94,47 78,45" ${f('trapezio')} ${st}/>
  <circle cx="55" cy="52" r="9" ${f('ombro')} ${st}/>
  <circle cx="101" cy="52" r="9" ${f('ombro')} ${st}/>
  <rect x="60" y="48" width="17" height="16" rx="5" ${f('peito')} ${st}/>
  <rect x="79" y="48" width="17" height="16" rx="5" ${f('peito')} ${st}/>
  <rect x="69" y="66" width="18" height="32" rx="4" ${f('abdomen')} ${st}/>
  <rect x="60" y="66" width="7" height="30" rx="3" ${f('obliquo')} ${st}/>
  <rect x="89" y="66" width="7" height="30" rx="3" ${f('obliquo')} ${st}/>
  <rect x="44" y="62" width="11" height="25" rx="5" ${f('biceps')} ${st}/>
  <rect x="101" y="62" width="11" height="25" rx="5" ${f('biceps')} ${st}/>
  <rect x="42" y="89" width="10" height="26" rx="5" ${f('antebraco')} ${st}/>
  <rect x="104" y="89" width="10" height="26" rx="5" ${f('antebraco')} ${st}/>
  <rect x="62" y="113" width="14" height="44" rx="6" ${f('quadriceps')} ${st}/>
  <rect x="80" y="113" width="14" height="44" rx="6" ${f('quadriceps')} ${st}/>
  <text x="78" y="216" fill="#5A6272" font-size="11" text-anchor="middle" font-weight="700">frente</text>
  <!-- COSTAS -->
  <circle cx="222" cy="22" r="12" ${sil}/>
  <rect x="217" y="33" width="10" height="7" ${sil}/>
  <polygon points="199,46 245,46 239,100 205,100" ${sil}/>
  <polygon points="205,100 239,100 237,113 207,113" ${sil}/>
  <polygon points="222,40 203,50 222,74 241,50" ${f('trapezio')} ${st}/>
  <circle cx="199" cy="52" r="9" ${f('ombro')} ${st}/>
  <circle cx="245" cy="52" r="9" ${f('ombro')} ${st}/>
  <path d="M205,56 L219,62 L219,92 L208,83 Z" ${f('dorsal')} ${st}/>
  <path d="M239,56 L225,62 L225,92 L236,83 Z" ${f('dorsal')} ${st}/>
  <rect x="213" y="85" width="18" height="14" rx="3" ${f('lombar')} ${st}/>
  <rect x="188" y="62" width="11" height="25" rx="5" ${f('triceps')} ${st}/>
  <rect x="245" y="62" width="11" height="25" rx="5" ${f('triceps')} ${st}/>
  <rect x="186" y="89" width="10" height="26" rx="5" ${f('antebraco')} ${st}/>
  <rect x="248" y="89" width="10" height="26" rx="5" ${f('antebraco')} ${st}/>
  <rect x="206" y="100" width="15" height="18" rx="7" ${f('gluteo')} ${st}/>
  <rect x="223" y="100" width="15" height="18" rx="7" ${f('gluteo')} ${st}/>
  <rect x="206" y="120" width="14" height="38" rx="6" ${f('posterior')} ${st}/>
  <rect x="224" y="120" width="14" height="38" rx="6" ${f('posterior')} ${st}/>
  <rect x="208" y="161" width="11" height="30" rx="5" ${f('panturrilha')} ${st}/>
  <rect x="225" y="161" width="11" height="30" rx="5" ${f('panturrilha')} ${st}/>
  <text x="222" y="216" fill="#5A6272" font-size="11" text-anchor="middle" font-weight="700">costas</text>
</svg>`;
}
function valsFromAgg(agg){
  const max = agg.length ? Math.max(...agg.map(([,v]) => v)) : 1;
  const vals = {};
  for (const [id,v] of agg) vals[id] = v/max;
  return vals;
}

/* ---------- sheets de músculo ---------- */
function openMuscleSheetEx(name){
  const m = getMuscles(name);
  const vals = {};
  if (m){ (m.p||[]).forEach(id => vals[id]=1); (m.s||[]).forEach(id => vals[id]=0.35); }
  const tip = muscleTip(name);
  openSheet(`
    <div class="sheet-title">${esc(name)}</div>
    ${m ? `<div class="muschips" style="margin-bottom:12px">
        ${(m.p||[]).map(id=>`<span class="chip mus">${MLABEL[id]}</span>`).join('')}
        ${(m.s||[]).map(id=>`<span class="chip mus2">${MLABEL[id]}</span>`).join('')}
      </div>${bodyMapSVG(vals)}`
      : '<div class="muted small" style="margin-bottom:10px">Ainda sem informação de músculos para este exercício.</div>'}
    ${tip ? `<div class="tipbox">💡 ${esc(tip)}</div>` : ''}
    <div class="row" style="margin-top:14px;gap:8px">
      <button class="btn slim" data-a="editmus" style="flex:1">Editar músculos</button>
      <button class="btn slim primary" data-a="close" style="flex:1">Fechar</button>
    </div>`,
    {close: closeSheet, editmus: () => openMuscleSelector(name)});
}
function openMuscleSheetSession(exercises, title){
  const agg = muscleAgg(exercises);
  if (!agg.length){ toast('Sem dados de músculos ainda'); return; }
  openSheet(`
    <div class="sheet-title">${esc(title)}</div>
    ${bodyMapSVG(valsFromAgg(agg))}
    <div class="muschips" style="margin-top:12px">${chipsAgg(agg)}</div>
    <p class="faint small" style="margin-top:8px">Número = séries efetivas (músculo secundário conta metade).</p>
    <button class="btn primary slim" data-a="close" style="margin-top:12px">Fechar</button>`,
    {close: closeSheet});
}
function openMuscleSelector(name){
  const k = mnorm(name);
  const cur = getMuscles(name) || {p:[], s:[]};
  const state = {};
  (cur.p||[]).forEach(id => state[id]=1);
  (cur.s||[]).forEach(id => state[id]=2);
  const draw = () => openSheet(`
    <div class="sheet-title">Músculos: ${esc(name)}</div>
    <p class="muted small" style="margin-bottom:8px">Toque para alternar: primário → secundário → nenhum.</p>
    ${MUSCLES.map(([id,lb]) => {
      const stt = state[id]||0;
      return `<button class="musrow ${stt===1?'p1':stt===2?'p2':''}" data-a="cyc" data-m="${id}">
        <span>${lb}</span><span class="tag">${stt===1?'PRIMÁRIO':stt===2?'secundário':'—'}</span></button>`;
    }).join('')}
    <button class="btn primary" data-a="savemus" style="margin-top:14px">Salvar</button>`, {
    cyc: el => { const id = el.dataset.m; state[id] = ((state[id]||0)+1)%3; draw(); },
    savemus: () => {
      const p = [], s = [];
      for (const [id] of MUSCLES){ if (state[id]===1) p.push(id); else if (state[id]===2) s.push(id); }
      db.exMuscles = db.exMuscles || {};
      if (p.length || s.length) db.exMuscles[k] = {p, s};
      else delete db.exMuscles[k];
      save(); toast('Músculos salvos'); closeSheet(); render();
    },
  });
  draw();
}

/* ---------- substituição guiada de exercício ---------- */
const EQ = [['halter','Halter'],['banco','Banco'],['elastico','Elástico'],['corpo','Peso do corpo'],['barra','Barra'],['maquina','Máquina'],['polia','Polia']];
/* eq = equipamento NECESSÁRIO; ps = unilateral (por lado) */
const ALTDB = [
  // peito
  {n:'Supino Reto (Halter)', eq:['halter','banco']},
  {n:'Supino Inclinado (Halter)', eq:['halter','banco']},
  {n:'Floor Press (Halter)', eq:['halter']},
  {n:'Crucifixo Reto (Halter)', eq:['halter','banco']},
  {n:'Crucifixo Inclinado (Halter)', eq:['halter','banco']},
  {n:'Flexão de Braços', eq:['corpo']},
  {n:'Flexão de Braços Inclinada (mãos no banco)', eq:['corpo','banco']},
  {n:'Flexão de Braços Declinada (pés no banco)', eq:['corpo','banco']},
  {n:'Pullover (Halter)', eq:['halter','banco']},
  {n:'Supino Reto (Barra)', eq:['barra','banco']},
  {n:'Supino Máquina', eq:['maquina']},
  {n:'Crossover (Polia)', eq:['polia']},
  {n:'Peck Deck', eq:['maquina']},
  // costas
  {n:'Remada Unilateral (Halter)', eq:['halter','banco'], ps:1},
  {n:'Remada Curvada (2 Halteres)', eq:['halter']},
  {n:'Remada Peito Apoiado (Banco Inclinado)', eq:['halter','banco']},
  {n:'Remada com Elástico', eq:['elastico']},
  {n:'Puxada Frontal (Polia)', eq:['polia']},
  {n:'Remada Baixa (Polia)', eq:['polia']},
  {n:'Remada Máquina', eq:['maquina']},
  {n:'Remada Curvada (Barra)', eq:['barra']},
  {n:'Barra Fixa', eq:['corpo']},
  // trapézio / ombro posterior
  {n:'Face Pull (Elástico)', eq:['elastico']},
  {n:'Face Pull (Polia)', eq:['polia']},
  {n:'Encolhimento (Halter)', eq:['halter']},
  {n:'Crucifixo Inverso (Halter)', eq:['halter','banco']},
  {n:'Crucifixo Inverso Máquina', eq:['maquina']},
  {n:'Remada Alta (Halter)', eq:['halter']},
  // ombro
  {n:'Desenvolvimento Sentado (Halter)', eq:['halter','banco']},
  {n:'Desenvolvimento em Pé (Halter)', eq:['halter']},
  {n:'Elevação Lateral (Halter)', eq:['halter']},
  {n:'Elevação Lateral (Elástico)', eq:['elastico']},
  {n:'Elevação Lateral (Polia)', eq:['polia']},
  {n:'Elevação Frontal (Halter)', eq:['halter']},
  {n:'Desenvolvimento Militar (Barra)', eq:['barra']},
  {n:'Desenvolvimento Máquina', eq:['maquina']},
  // bíceps
  {n:'Rosca Direta (Halter)', eq:['halter']},
  {n:'Rosca Alternada (Halter)', eq:['halter']},
  {n:'Rosca Martelo (Halter)', eq:['halter']},
  {n:'Rosca Inclinada (Halter)', eq:['halter','banco']},
  {n:'Rosca Concentrada (Halter)', eq:['halter','banco'], ps:1},
  {n:'Rosca com Elástico', eq:['elastico']},
  {n:'Rosca Direta (Barra)', eq:['barra']},
  {n:'Rosca Direta (Polia)', eq:['polia']},
  {n:'Rosca Scott Máquina', eq:['maquina']},
  // tríceps
  {n:'Tríceps Testa (Halter)', eq:['halter','banco']},
  {n:'Tríceps Francês (Halter)', eq:['halter']},
  {n:'Tríceps Coice (Halter)', eq:['halter','banco'], ps:1},
  {n:'Mergulho no Banco', eq:['corpo','banco']},
  {n:'Tríceps com Elástico', eq:['elastico']},
  {n:'Tríceps Corda (Polia)', eq:['polia']},
  {n:'Paralelas', eq:['corpo']},
  // quadríceps / pernas
  {n:'Agachamento Búlgaro', eq:['halter','banco'], ps:1},
  {n:'Afundo Reverso', eq:['halter'], ps:1},
  {n:'Avanço (Passada)', eq:['halter'], ps:1},
  {n:'Agachamento Taça (Goblet)', eq:['halter']},
  {n:'Agachamento Sumô (Halter)', eq:['halter']},
  {n:'Step-up no Banco', eq:['halter','banco'], ps:1},
  {n:'Agachamento com Salto', eq:['corpo']},
  {n:'Agachamento Livre (Barra)', eq:['barra']},
  {n:'Leg Press', eq:['maquina']},
  {n:'Cadeira Extensora', eq:['maquina']},
  {n:'Hack Machine', eq:['maquina']},
  // posterior de coxa
  {n:'Terra Romeno (Halter)', eq:['halter']},
  {n:'Terra Romeno Unilateral (Halter)', eq:['halter'], ps:1},
  {n:'Stiff (Halter)', eq:['halter']},
  {n:'Good Morning (Halter)', eq:['halter']},
  {n:'Flexão de Perna com Elástico', eq:['elastico']},
  {n:'Nordic Curl', eq:['corpo']},
  {n:'Levantamento Terra (Barra)', eq:['barra']},
  {n:'Mesa Flexora', eq:['maquina']},
  {n:'Cadeira Flexora', eq:['maquina']},
  // glúteo
  {n:'Elevação de Quadril (escápulas no banco)', eq:['halter','banco']},
  {n:'Ponte de Glúteo no Chão', eq:['corpo']},
  {n:'Ponte de Glúteo com Halter', eq:['halter']},
  {n:'Coice de Glúteo (Elástico)', eq:['elastico'], ps:1},
  {n:'Coice de Glúteo (Polia)', eq:['polia'], ps:1},
  {n:'Abdução com Elástico', eq:['elastico']},
  {n:'Cadeira Abdutora', eq:['maquina']},
  {n:'Hip Thrust (Barra)', eq:['barra','banco']},
  // panturrilha
  {n:'Panturrilha em Pé (Halter)', eq:['halter']},
  {n:'Panturrilha Unilateral no Degrau', eq:['corpo'], ps:1},
  {n:'Panturrilha Sentado (Halteres)', eq:['halter','banco']},
  {n:'Panturrilha na Máquina', eq:['maquina']},
  // abdômen / lombar
  {n:'Roda Abdominal', eq:['corpo']},
  {n:'Prancha', eq:['corpo']},
  {n:'Prancha Lateral', eq:['corpo']},
  {n:'Abdominal Supra', eq:['corpo']},
  {n:'Elevação de Pernas', eq:['corpo']},
  {n:'Abdominal Bicicleta', eq:['corpo']},
  {n:'Russian Twist (Halter)', eq:['halter']},
  {n:'Abdominal Infra no Banco', eq:['corpo','banco']},
  {n:'Abdominal Máquina', eq:['maquina']},
  {n:'Superman (Lombar)', eq:['corpo']},
];
function altList(name){
  const m = getMuscles(name);
  if (!m || !m.p || !m.p.length) return [];
  const tgt = new Set(m.p);
  const tgtS = new Set(m.s || []);
  const sel = new Set(db.settings.equip || ['halter','banco','elastico','corpo']);
  const out = [];
  for (const a of ALTDB){
    if (mnorm(a.n) === mnorm(name)) continue;
    if (!a.eq.every(e => sel.has(e))) continue;
    const am = getMuscles(a.n);
    if (!am || !am.p || !am.p.length) continue;
    const hit = am.p.filter(p => tgt.has(p)).length;
    if (!hit) continue;
    // desempate: secundários em comum aproximam o padrão de movimento
    const sHit = (am.s || []).filter(s => tgtS.has(s) || tgt.has(s)).length
               + am.p.filter(p => tgtS.has(p)).length;
    out.push({a, am, hit, sHit, extra: am.p.length - hit});
  }
  out.sort((x,y) => y.hit - x.hit || y.sHit - x.sHit || x.extra - y.extra || x.a.n.localeCompare(y.a.n, 'pt'));
  return out;
}
function openSubSheet(name, ctx){
  if (!db.settings.equip) { db.settings.equip = ['halter','banco','elastico','corpo']; save(); }
  const draw = () => {
    const sel = new Set(db.settings.equip);
    const alts = altList(name);
    const m = getMuscles(name);
    openSheet(`
      <div class="sheet-title">Substituir: ${esc(name)}</div>
      ${m ? `<div class="muschips" style="margin-bottom:12px">
        ${(m.p||[]).map(id=>`<span class="chip mus">${MLABEL[id]}</span>`).join('')}
        ${(m.s||[]).map(id=>`<span class="chip mus2">${MLABEL[id]}</span>`).join('')}</div>` : ''}
      <p class="muted small" style="margin-bottom:6px">Tenho disponível:</p>
      <div class="muschips" style="margin-bottom:12px">
        ${EQ.map(([id,lb]) => `<button class="chip ${sel.has(id)?'mus':'mus2'}" data-a="eq" data-e="${id}">${sel.has(id)?'✓ ':''}${lb}</button>`).join('')}
      </div>
      ${alts.length ? alts.map((o,i) => `<button class="musrow" data-a="pick" data-i="${i}">
          <span style="flex:1">${esc(o.a.n)}${o.a.ps?' <span class="chip side">por lado</span>':''}<br>
            <span style="display:inline-block;margin-top:4px">${o.am.p.map(id=>`<span class="chip mus">${MLABEL[id]}</span>`).join(' ')}
            ${(o.am.s||[]).map(id=>`<span class="chip mus2">${MLABEL[id]}</span>`).join(' ')}</span></span>
          <span class="tag" style="color:var(--steel);white-space:nowrap">usar ›</span>
        </button>`).join('')
        : '<div class="muted small" style="padding:12px 0">Nenhuma alternativa com esse equipamento. Marque mais opções acima.</div>'}
      <button class="btn slim" data-a="close" style="margin-top:14px">Cancelar</button>`, {
      close: closeSheet,
      eq: el => { const id = el.dataset.e, s2 = new Set(db.settings.equip);
                  s2.has(id) ? s2.delete(id) : s2.add(id);
                  db.settings.equip = [...s2]; save(); draw(); },
      pick: el => applySub(alts[+el.dataset.i].a, ctx),
    });
  };
  draw();
}
function applySub(alt, ctx){
  if (ctx.type === 'plan'){
    const r = db.routines.find(x => x.id === ctx.id); if (!r) return;
    const e = r.exercises[ctx.i]; if (!e) return;
    e.name = alt.n; e.perSide = !!alt.ps;
    save(); closeSheet(); render(); toast('Substituído no plano');
  } else {
    const ex = db.active && db.active.exercises[ctx.i]; if (!ex) return;
    if (ex.sets.some(s => s.done)){ toast('Desfaça as séries concluídas (✓) antes de substituir'); return; }
    ex.name = alt.n; ex.perSide = !!alt.ps; ex.prev = lastPerf(alt.n);
    save(); closeSheet(); render(); toast('Substituído só neste treino');
  }
}

/* ---------- exportar treino como imagem (PNG compartilhável) ---------- */
function rr(x, y, w, h, r, ctx){ // rounded rect path
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function svgToImage(svg){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
async function renderWorkoutPNG(w){
  const W = 1080, P = 66;
  const agg = mMuscleSortTop(muscleAgg(w.exercises));
  const d = dt(w.start);
  const meas = document.createElement('canvas').getContext('2d');

  // chips: quebra de linha por medição
  meas.font = `700 30px ${FONT}`;
  const chipItems = agg.map(([id,v]) => `${MLABEL[id]}  ${nbr(v, v%1?1:0)}`);
  const chipLines = [];
  { let cur = [], cw = 0;
    for (const t of chipItems){
      const bw = meas.measureText(t).width + 48;
      if (cw + bw + 18 > W - 2*P && cur.length){ chipLines.push(cur); cur = []; cw = 0; }
      cur.push({t, w: bw}); cw += bw + 18;
    }
    if (cur.length) chipLines.push(cur);
  }
  // altura exata (mesma aritmética do desenho abaixo)
  let exH = 0;
  for (const ex of w.exercises) exH += 52 + ex.sets.length*46 + 30;
  const mapW = 620, mapH = Math.round(mapW*224/300);
  const musH = agg.length ? 20 + mapH + 40 + chipLines.length*64 + 26 : 0;
  const H = (P+8) + 74 + 46 + 64 + 96 + musH + 30 + exH + 84;

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = '#0C0E12'; x.fillRect(0, 0, W, H);
  let y = P + 8;

  // wordmark
  x.font = `900 34px ${FONT}`;
  x.fillStyle = '#E9ECF1'; x.fillText('PINEAPPLE', P, y);
  x.fillStyle = '#FFB454'; x.fillText('METHOD', P + x.measureText('PINEAPPLE ').width, y);
  y += 74;
  // título e data
  x.font = `900 62px ${FONT}`; x.fillStyle = '#E9ECF1'; x.fillText(w.name, P, y); y += 46;
  x.font = `400 31px ${FONT}`; x.fillStyle = '#8B94A3';
  x.fillText(`${fmtDataLonga(d)} · ${d.toTimeString().slice(0,5)}`, P, y); y += 64;
  // stats
  const stats = [[minFmt(woDur(w)),'duração'], [String(woSets(w)),'séries'], [volFmt(woVolume(w)),'volume']];
  const colW = (W - 2*P) / 3;
  stats.forEach(([v,l], i) => {
    const cx = P + i*colW;
    x.fillStyle = '#151920'; rr(cx, y-52, colW-18, 108, 16, x); x.fill();
    x.strokeStyle = '#262E3A'; x.lineWidth = 2; x.stroke();
    x.font = `800 44px ${FONT}`; x.fillStyle = i===2 ? '#FFB454' : '#E9ECF1';
    x.fillText(v, cx+26, y+4);
    x.font = `400 26px ${FONT}`; x.fillStyle = '#8B94A3'; x.fillText(l, cx+26, y+42);
  });
  y += 96;

  if (agg.length){
    x.font = `700 27px ${FONT}`; x.fillStyle = '#8B94A3';
    x.fillText('M Ú S C U L O S   T R A B A L H A D O S', P, y); y += 20;
    try {
      const img = await svgToImage(bodyMapSVG(valsFromAgg(agg), mapW*2)); // 2x p/ nitidez
      x.drawImage(img, (W-mapW)/2, y, mapW, mapH);
    } catch(e){}
    y += mapH + 40;
    for (const line of chipLines){
      let cx = P;
      for (const c of line){
        x.fillStyle = 'rgba(255,180,84,.16)'; rr(cx, y-36, c.w, 52, 26, x); x.fill();
        x.font = `700 30px ${FONT}`; x.fillStyle = '#FFB454'; x.fillText(c.t, cx+24, y);
        cx += c.w + 18;
      }
      y += 64;
    }
    y += 26;
  }

  // separador
  x.strokeStyle = '#262E3A'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(P, y-14); x.lineTo(W-P, y-14); x.stroke();
  y += 30;

  for (const ex of w.exercises){
    x.font = `800 36px ${FONT}`; x.fillStyle = '#E9ECF1'; x.fillText(ex.name, P, y); y += 52;
    ex.sets.forEach((s, i) => {
      x.font = `700 29px ${FONT}`; x.fillStyle = s.t==='w' ? '#7FB2E5' : '#5A6272';
      x.fillText(s.t==='w' ? 'W' : String(i+1), P+8, y);
      let txt = '';
      if (s.w != null || s.r != null){
        txt = `${s.w!=null?nbr(s.w, s.w%1?1:0):'—'} kg × ${s.r ?? '—'}${s.r2!=null?`/${s.r2} (D/E)`:''}`;
      } else if (s.d){
        txt = `${Math.round(s.d/60)} min${s.km?` · ${nbr(s.km,2)} km`:''}`;
      }
      x.font = `600 31px ${FONT}`; x.fillStyle = '#C7CDD8'; x.fillText(txt, P+70, y);
      y += 46;
    });
    y += 30;
  }
  // rodapé
  x.font = `400 26px ${FONT}`; x.fillStyle = '#5A6272'; x.textAlign = 'center';
  x.fillText('PINEAPPLE METHOD · diário de treino', W/2, H-40);
  x.textAlign = 'left';
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
const mMuscleSortTop = agg => agg; // já vem ordenado por volume
async function shareWorkoutImage(w){
  try {
    toast('Gerando imagem…');
    const blob = await renderWorkoutPNG(w);
    if (!blob){ toast('Erro ao gerar imagem'); return; }
    const file = new File([blob], `pineapple-${ymd(dt(w.start))}.png`, {type:'image/png'});
    if (navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title: w.name});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
  } catch(e){ if (!e || e.name !== 'AbortError') toast('Não deu para compartilhar'); }
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
      ${actRoutines().map(r => `<button class="btn slim" data-a="start" data-id="${r.id}" style="flex:1">${esc(r.name.replace('Treino ',''))}</button>`).join('')}
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
  save(); acquireWake(); nav('workout');
}
let clockIv = null;
function vWorkout(){
  const a = db.active;
  if (!a){ nav('home'); return; }
  const els = a.exercises.map((ex,xi) => {
    const side = !!ex.perSide;
    const rows = ex.sets.map((s,si) => {
      const p = ex.prev[si];
      const pr = p && p.r != null ? (p.r2 != null ? `${p.r}/${p.r2}` : p.r) : null;
      const ghost = p && p.w != null ? `${nbr(p.w, p.w%1?1:0)} × ${pr ?? '–'}` : (p && p.d ? `${Math.round(p.d/60)} min` : '—');
      // cascata: valores desta sessão têm prioridade sobre a sessão anterior
      let cw = null, cr = null, cr2 = null;
      for (let j = si-1; j >= 0; j--){
        const q = ex.sets[j];
        if (cw == null && q.w != null) cw = q.w;
        if (cr == null && q.r != null) cr = q.r;
        if (cr2 == null && q.r2 != null) cr2 = q.r2;
        if (cw != null && cr != null) break;
      }
      const phW = cw != null ? nbr(cw, cw%1?1:0) : (p && p.w != null ? nbr(p.w, p.w%1?1:0) : 'kg');
      const phR = cr != null ? cr : (p && p.r != null ? p.r : 'reps');
      const phR2 = cr2 != null ? cr2 : (p && p.r2 != null ? p.r2 : (cr != null ? cr : 'reps'));
      const repsIn = side
        ? `<input type="text" inputmode="numeric" placeholder="${phR}" value="${s.r ?? ''}" data-a="inr" data-x="${xi}" data-s="${si}" aria-label="Reps direita">
           <input type="text" inputmode="numeric" placeholder="${phR2}" value="${s.r2 ?? ''}" data-a="inr2" data-x="${xi}" data-s="${si}" aria-label="Reps esquerda">`
        : `<input type="text" inputmode="numeric" placeholder="${phR}" value="${s.r ?? ''}" data-a="inr" data-x="${xi}" data-s="${si}" aria-label="Repetições">`;
      return `<div class="set-grid ${side?'side':''} ${s.done?'done':''} ${s.t==='w'?'warm':''}">
        <button class="sn" data-a="warm" data-x="${xi}" data-s="${si}" title="Alternar aquecimento">${s.t==='w'?'W':si+1}</button>
        <span class="prev num">${ghost}</span>
        <input type="text" inputmode="decimal" placeholder="${phW}"
               value="${s.w ?? ''}" data-a="inw" data-x="${xi}" data-s="${si}" aria-label="Peso">
        ${repsIn}
        <button class="ck" data-a="ck" data-x="${xi}" data-s="${si}" aria-label="Concluir série">${s.done?'✓':''}</button>
      </div>`;
    }).join('');
    return `<div class="ex-card ${ex.superset?'ss1':''}">
      <div class="spread">
        <div>
          <div class="ex-name">${esc(ex.name)}</div>
          <div class="ex-meta num" style="margin-bottom:5px">${ex.tgt} · descanso ${fmtRest(ex.rest)}
            ${ex.perSide ? ' <span class="chip side">por lado</span>' : ''}
            ${ex.superset ? ' <span class="chip ss">superset</span>' : ''}</div>
          <div class="muschips" style="margin-bottom:8px">${chipsFor(ex.name)}</div>
        </div>
        <div class="row" style="gap:6px;flex-shrink:0">
          <button class="mini" data-a="sub" data-x="${xi}" aria-label="Substituir exercício" style="width:38px;height:38px;font-size:16px">⇄</button>
          <button class="vidbtn" data-a="video" data-n="${esc(ex.name)}" aria-label="Ver demonstração no YouTube">▶</button>
        </div>
      </div>
      <div class="set-grid hd ${side?'side':''}"><span></span><span>anterior</span><span style="text-align:center">kg</span>${side?'<span style="text-align:center">dir.</span><span style="text-align:center">esq.</span>':'<span style="text-align:center">reps</span>'}<span></span></div>
      ${rows}
      <div class="row" style="gap:14px">
        <button class="addset" data-a="addset" data-x="${xi}">+ adicionar série</button>
        ${ex.sets.length > 1 && !ex.sets[ex.sets.length-1].done
          ? `<button class="addset" data-a="rmset" data-x="${xi}" style="color:var(--bad)">– remover última</button>` : ''}
      </div>
    </div>`;
  }).join('');

  let liveVol = 0, liveDone = 0, liveTotal = 0;
  for (const ex of a.exercises) for (const s of ex.sets){
    liveTotal++;
    if (s.done){ liveDone++; if (s.t !== 'w' && s.w != null && s.r != null) liveVol += s.w * (s.r + (s.r2 || 0)); }
  }
  $('#view').innerHTML = `
    <div class="wo-head spread">
      <div>
        <div class="name">${esc(a.name)}</div>
        <div class="small muted num">${liveDone}/${liveTotal} séries · <b style="color:var(--accent)">${volFmt(liveVol)}</b> acumulados</div>
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
    video: el => openVideo(el.dataset.n),
    musx: el => openMuscleSheetEx(el.dataset.n),
    sub: el => openSubSheet(a.exercises[el.dataset.x].name, {type:'workout', i:+el.dataset.x}),
    warm: el => { const s = a.exercises[el.dataset.x].sets[el.dataset.s]; s.t = s.t==='w'?'n':'w'; save(); render(); },
    addset: el => { const ex = a.exercises[el.dataset.x]; ex.sets.push({t:'n', w:null, r:null, done:false}); save(); render(); },
    rmset: el => { const ex = a.exercises[el.dataset.x], last = ex.sets[ex.sets.length-1];
                   if (ex.sets.length > 1 && !last.done){ ex.sets.pop(); save(); render(); } },
    ck: el => {
      const ex = a.exercises[el.dataset.x], si = +el.dataset.s, s = ex.sets[si];
      if (!s.done){
        // fill from inputs / placeholders
        const grid = el.closest('.set-grid');
        const wi = grid.querySelector('[data-a=inw]'), ri = grid.querySelector('[data-a=inr]'), ri2 = grid.querySelector('[data-a=inr2]');
        s.w = numIn(wi.value !== '' ? wi.value : wi.placeholder);
        s.r = numIn(ri.value !== '' ? ri.value : ri.placeholder);
        if (ri2) s.r2 = numIn(ri2.value !== '' ? ri2.value : ri2.placeholder);
        s.done = true;
        startRest(ex.rest, ex.name);
      } else { s.done = false; }
      save(); render();
    },
    finish: () => finishWorkout(),
    discard: () => { if (confirm('Descartar este treino? Nada será salvo.')) { db.active = null; save(); stopRest(); releaseWake(); nav('home'); } },
  });
  // inputs persist on change
  $$('#view input[data-a=inw], #view input[data-a=inr], #view input[data-a=inr2]').forEach(inp => {
    inp.addEventListener('input', () => {
      const ex = a.exercises[inp.dataset.x], s = ex.sets[inp.dataset.s];
      const v = numIn(inp.value);
      if (inp.dataset.a === 'inw') s.w = v;
      else if (inp.dataset.a === 'inr2') s.r2 = v;
      else s.r = v;
      save();
    });
  });
}
const fmtRest = sec => sec >= 60 ? `${Math.floor(sec/60)}:${pad(sec%60)}` : `${sec}s`;
function openVideo(name){
  // remove parênteses do nome para a busca ficar mais natural
  const q = 'como fazer ' + name.replace(/\(.*?\)/g, ' ').replace(/\//g, ' ').replace(/\s+/g,' ').trim() + ' exercício técnica';
  window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank');
}

function finishWorkout(){
  const a = db.active;
  const done = a.exercises.some(ex => ex.sets.some(s => s.done));
  if (!done && !confirm('Nenhuma série concluída. Salvar mesmo assim?')) return;
  const w = {
    id: uid(), name: a.name, start: a.start, end: nowLocal(),
    exercises: a.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.filter(s => s.done).map(({t,w,r,r2}) => { const o = {t}; if (w!=null) o.w=w; if (r!=null) o.r=r; if (r2!=null) o.r2=r2; return o; }),
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
  save(); stopRest(); clearInterval(clockIv); releaseWake();
  const vol = woVolume(w), dur = woDur(w);
  const magg = muscleAgg(w.exercises);
  openSheet(`
    <div class="sheet-title">Treino concluído 💪</div>
    <div class="summary-big">${volFmt(vol)}</div>
    <div class="muted small" style="margin-bottom:14px">volume total · ${woSets(w)} séries · ${minFmt(dur)}</div>
    ${magg.length ? `<div class="h2" style="margin-top:4px">Músculos trabalhados</div>
      ${bodyMapSVG(valsFromAgg(magg))}
      <div class="muschips" style="margin-top:10px">${chipsAgg(magg)}</div>
      <p class="faint small" style="margin:6px 0 8px">número = séries que trabalharam o músculo (secundário vale meia série)</p>` : ''}
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
/* iOS: sessão de áudio 'playback' toca mesmo com a chavinha no silencioso (iOS 17+) */
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch(e){}
function initAudio(){
  try { audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ return; }
  try {
    if (audioCtx.state !== 'running') audioCtx.resume();
    // buffer mudo dentro do gesto do usuário: destrava a saída de som no iOS
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination); src.start(0);
  } catch(e){}
}
/* re-destrava a cada toque: o contexto fica "quente" para o beep disparar sozinho depois */
document.addEventListener('touchend', () => { if (!audioCtx || audioCtx.state !== 'running') initAudio(); }, {passive:true});
document.addEventListener('click',    () => { if (!audioCtx || audioCtx.state !== 'running') initAudio(); });
function beep(){
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  try {
    if (audioCtx.state !== 'running') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine'; o.frequency.value = 1000;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(.6, t+.015);
    g.gain.exponentialRampToValueAtTime(.0001, t+.22);
    o.start(t); o.stop(t+.25);
  } catch(e){}
  if (navigator.vibrate) navigator.vibrate(200); // Android; iOS não expõe vibração para web apps
}

/* ---------- wake lock: tela não apaga com treino ativo (senão o timer congela) ---------- */
let wakeLock = null;
async function acquireWake(){
  if (!('wakeLock' in navigator) || !db.active) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}
function releaseWake(){ try { if (wakeLock) wakeLock.release(); } catch(e){} wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && db.active) acquireWake(); });
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
    ${(() => { const magg = muscleAgg(w.exercises); return magg.length ? `
    <div class="card">
      <div class="h2" style="margin:0 0 10px">Músculos trabalhados</div>
      ${bodyMapSVG(valsFromAgg(magg))}
      <div class="muschips" style="margin-top:10px">${chipsAgg(magg)}</div>
      ${MUSCAP}
    </div>` : ''; })()}
    <div class="card">
      ${w.exercises.map(ex => `<div class="detail-ex">
        <div class="nm">${esc(ex.name)}</div>
        <div class="muschips" style="margin:3px 0 7px">${chipsFor(ex.name)}</div>
        ${ex.sets.map((s,i) => `<div class="detail-set">
          <span style="width:22px;color:${s.t==='w'?'var(--steel)':'var(--faint)'}">${s.t==='w'?'W':i+1}</span>
          ${s.w!=null||s.r!=null ? `<span><b>${s.w!=null?nbr(s.w,s.w%1?1:0):'—'}</b> kg × <b>${s.r??'—'}${s.r2!=null?`/${s.r2}`:''}</b>${s.r2!=null?' <span class=\"faint\">(D/E)</span>':''}</span>` : ''}
          ${s.d ? `<span><b>${Math.round(s.d/60)}</b> min${s.km?` · <b>${nbr(s.km,2)}</b> km`:''}</span>` : ''}
        </div>`).join('')}
      </div>`).join('')}
    </div>
    <button class="btn slim" data-a="share" style="margin-bottom:10px">📤 Compartilhar treino (imagem)</button>
    <button class="btn danger slim" data-a="del">Apagar este treino</button>`;
  bind('#view', {
    back: () => route.from === 'month' ? nav('month', {k: route.fromK}) :
                route.from ? nav(route.from) : nav('history'),
    musx: el => openMuscleSheetEx(el.dataset.n),
    share: () => shareWorkoutImage(w),
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
    ${(() => { const magg = muscleAgg(ws.flatMap(w => w.exercises)); return magg.length ? `
    <div class="h2">Músculos do mês</div>
    <div class="card">
      ${bodyMapSVG(valsFromAgg(magg))}
      <div class="muschips" style="margin-top:10px">${chipsAgg(magg)}</div>
      ${MUSCAP}
    </div>` : ''; })()}
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
    <div class="row" style="margin-bottom:12px">
      <select data-a="ex" style="flex:1;font-weight:700">
        ${names.map(n => `<option ${n===progEx?'selected':''}>${esc(n)}</option>`).join('')}
      </select>
      <button class="mini vid" data-a="video" data-n="${esc(progEx)}" aria-label="ver demonstração" style="width:42px;height:42px">▶</button>
    </div>
    <div class="muschips" style="margin:-4px 0 10px">${chipsFor(progEx)}</div>
    <div class="seg">${metrics.map(([k,l]) => `<button class="${progMetric===k?'on':''}" data-a="metric" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="chartbox">
      <div class="cap"><span>${hist.length} sessões · todo o histórico</span>${best!=null?`<span>melhor: <b class="num" style="color:var(--accent)">${progMetric==='vol'?volFmt(best):kg(Math.round(best*10)/10)}</b></span>`:''}</div>
      ${lineChart(pts, {unit: progMetric==='vol'?'':'kg'})}
    </div>
    ${recent.length ? `<div class="h2">Últimas sessões</div><div class="card">` +
      recent.map(p => `<button class="linkrow" data-a="open" data-id="${p.id}">
        <span class="small num">${fmtDia(dt(p.date))}</span>
        <span class="small num">${p.sets.filter(s=>s.t!=='w').map(s => s.w!=null?`${nbr(s.w,s.w%1?1:0)}×${s.r??'–'}${s.r2!=null?`/${s.r2}`:''}`:'').filter(Boolean).join('  ')}</span>
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
    video: el => openVideo(el.dataset.n),
    musx: el => openMuscleSheetEx(el.dataset.n),
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
let planOpen = {}; // planejamentos inativos expandidos (estado só da sessão de tela)
function vPlan(){
  const act = db.settings.activeProg;
  const progs = [db.programs.find(p => p.id === act), ...db.programs.filter(p => p.id !== act)].filter(Boolean);
  const rCard = r => `<div class="card">
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
      ${(() => { const magg = muscleAgg(r.exercises); return magg.length ? `
      <div class="muschips" style="margin-top:10px">${chipsAgg(magg, `data-a="musr" data-id="${r.id}"`)}</div>` : ''; })()}
    </div>`;
  const block = p => {
    const rs = db.routines.filter(r => r.pid === p.id);
    const isAct = p.id === act;
    const open = isAct || !!planOpen[p.id];
    return `<div class="card" style="${isAct ? 'border-color:var(--accent)' : ''}">
      <div class="spread">
        <div>
          <div style="font-weight:800;font-size:16px">${esc(p.name)}${isAct ? ' <span class="chip ss">ativo</span>' : ''}</div>
          <div class="muted small">${rs.length} rotina(s) · ${rs.reduce((a,r)=>a+r.exercises.length,0)} exercícios</div>
        </div>
        <div class="row">
          ${isAct ? '' : `<button class="btn slim primary" data-a="usep" data-id="${p.id}" style="width:auto;padding:8px 14px">Usar este</button>
          <button class="btn slim" data-a="togp" data-id="${p.id}" style="width:auto;padding:8px 14px">${open ? 'Fechar' : 'Ver'}</button>`}
        </div>
      </div>
      <div class="row" style="gap:16px;margin-top:8px">
        <button class="small" style="color:var(--steel);font-weight:700" data-a="renp" data-id="${p.id}">Renomear</button>
        ${!isAct && db.programs.length > 1 ? `<button class="small" style="color:var(--bad);font-weight:700" data-a="delp" data-id="${p.id}">Excluir</button>` : ''}
      </div>
    </div>
    ${open ? rs.map(rCard).join('') + `<button class="btn slim" data-a="new" data-pid="${p.id}" style="margin-bottom:12px">+ Nova rotina${isAct ? '' : ` em ${esc(p.name)}`}</button>` : ''}`;
  };
  $('#view').innerHTML = `
    <div class="h1">Plano de treino</div>
    ${progs.map(block).join('')}
    <button class="btn slim" data-a="newp">+ Novo planejamento</button>
    <button class="btn slim" data-a="impplan" style="margin-top:8px">⤓ Importar plano (arquivo)</button>
    <p class="faint small" style="margin-top:8px;line-height:1.5;text-align:center">Arquivo .json no formato Pineapple — peça ao Claude a ficha pronta e importe aqui.</p>
    <input type="file" id="f-plan" accept=".json,application/json" hidden>`;
  bind('#view', {
    edit: el => nav('editRoutine', {id: el.dataset.id}),
    start: el => startWorkout(el.dataset.id),
    impplan: () => $('#f-plan').click(),
    musr: el => { const r = db.routines.find(x => x.id === el.dataset.id);
                  if (r) openMuscleSheetSession(r.exercises, `Cobertura: ${r.name}`); },
    usep: el => { db.settings.activeProg = el.dataset.id; delete planOpen[el.dataset.id]; save(); render();
                  const p = db.programs.find(x => x.id === el.dataset.id); toast(`"${p ? p.name : ''}" agora é o planejamento ativo`); },
    togp: el => { planOpen[el.dataset.id] = !planOpen[el.dataset.id]; render(); },
    renp: el => { const p = db.programs.find(x => x.id === el.dataset.id); if (!p) return;
                  const name = prompt('Nome do planejamento:', p.name);
                  if (!name) return;
                  p.name = name.trim().slice(0, 48); save(); render(); },
    delp: el => { const p = db.programs.find(x => x.id === el.dataset.id); if (!p) return;
      const rs = db.routines.filter(r => r.pid === p.id);
      if (confirm(`Excluir "${p.name}"${rs.length ? ` e suas ${rs.length} rotina(s)` : ''}? O histórico de treinos não é afetado.`)){
        db.routines = db.routines.filter(r => r.pid !== p.id);
        db.programs = db.programs.filter(x => x.id !== p.id);
        delete planOpen[p.id];
        normalize(); save(); render(); toast('Planejamento excluído');
      } },
    newp: () => {
      const name = prompt('Nome do novo planejamento:', `Planejamento ${db.programs.length + 1}`);
      if (!name) return;
      const p = {id: uid(), name: name.trim().slice(0, 48)};
      db.programs.push(p); planOpen[p.id] = true; save(); render();
    },
    new: el => {
      const pid = el.dataset.pid || db.settings.activeProg;
      const count = db.routines.filter(r => r.pid === pid).length;
      const name = prompt('Nome da rotina:', `Treino ${String.fromCharCode(65 + count)}`);
      if (!name) return;
      const r = {id: uid(), name, exercises: [], pid};
      db.routines.push(r); save(); nav('editRoutine', {id: r.id});
    },
  });
  const fp = $('#f-plan');
  if (fp) fp.addEventListener('change', ev => { importPlanFile(ev.target.files[0]); ev.target.value = ''; });
}
/* ---------- importar plano (arquivo JSON no formato Pineapple) ---------- */
const clampInt = (v, lo, hi, dflt) => { const n = parseInt(v, 10); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
function importPlanFile(file){
  if (!file) return;
  file.text().then(t => {
    const d = JSON.parse(t);
    const rs = d.routines || d.rotinas;
    if (!Array.isArray(rs) || !rs.length) throw new Error('formato');
    const musMap = {}; // aplicado só na confirmação
    const clean = rs.map(r => ({
      id: uid(),
      name: String(r.name || r.nome || 'Treino').slice(0, 48),
      exercises: (r.exercises || r.exercicios || []).map(e => {
        const name = String(e.name || e.nome || '').trim().slice(0, 64);
        if (name && e.muscles && (e.muscles.p || e.muscles.s)){
          const valid = ids => (Array.isArray(ids) ? ids : []).filter(x => MLABEL[x]);
          const p = valid(e.muscles.p), s = valid(e.muscles.s);
          if (p.length || s.length) musMap[mnorm(name)] = {p, s};
        }
        const o = {
          name,
          sets: clampInt(e.sets ?? e.series, 1, 12, 3),
          repsMin: clampInt(e.repsMin ?? e.repMin, 1, 100, 8),
          repsMax: clampInt(e.repsMax ?? e.repMax, 1, 100, 12),
          rest: clampInt(e.rest ?? e.descanso, 10, 600, db.settings.restDefault ?? 90),
        };
        if (e.perSide || e.porLado) o.perSide = true;
        const ss = clampInt(e.superset, 0, 9, 0);
        if (ss) o.superset = ss;
        return o;
      }).filter(e => e.name),
    })).filter(r => r.exercises.length);
    if (!clean.length) throw new Error('vazio');
    const nEx = clean.reduce((a,r) => a + r.exercises.length, 0);
    const nMus = Object.keys(musMap).length;
    const applyMus = () => { for (const [k,v] of Object.entries(musMap)) db.exMuscles[k] = v; };
    openSheet(`
      <div class="sheet-title">Importar plano</div>
      <p class="muted small" style="margin-bottom:10px"><b style="color:var(--text)">${clean.length}</b> rotina(s) · <b style="color:var(--text)">${nEx}</b> exercícios${nMus ? ` · ${nMus} com músculos definidos no arquivo` : ''}</p>
      ${clean.map(r => `<div class="small" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <b>${esc(r.name)}</b><br>
        <span class="muted" style="line-height:1.7">${r.exercises.map(e => `${esc(e.name)} <span class="faint num">${e.sets}×${e.repsMin}–${e.repsMax}</span>${e.perSide?' <span class="chip side">por lado</span>':''}${e.superset?' <span class="chip ss">superset</span>':''}`).join('<br>')}</span>
      </div>`).join('')}
      <button class="btn primary" data-a="newpp" style="margin-top:14px">Criar novo planejamento</button>
      <button class="btn slim" data-a="addp" style="margin-top:8px">Adicionar ao planejamento ativo</button>
      <button class="btn slim" data-a="repp" style="margin-top:8px">Substituir planejamento ativo</button>
      <button class="btn slim" data-a="close" style="margin-top:8px">Cancelar</button>
      <p class="faint small" style="margin-top:10px">O histórico de treinos nunca é afetado pela importação.</p>`, {
      close: closeSheet,
      newpp: () => {
        const sug = String(d.name || d.nome || `Planejamento ${db.programs.length + 1}`).slice(0, 48);
        const name = prompt('Nome do novo planejamento:', sug);
        if (!name) return; // continua na folha; nada foi gravado
        const p = {id: uid(), name: name.trim().slice(0, 48)};
        db.programs.push(p);
        for (const r of clean) r.pid = p.id;
        db.settings.activeProg = p.id;
        applyMus(); db.routines.push(...clean); save(); closeSheet(); render();
        toast(`"${p.name}" criado e ativado`);
      },
      addp: () => { for (const r of clean) r.pid = db.settings.activeProg;
        applyMus(); db.routines.push(...clean); save(); closeSheet(); render(); toast(`${clean.length} rotina(s) adicionada(s)`); },
      repp: () => { if (confirm('Substituir as rotinas do planejamento ATIVO pelas do arquivo? Os outros planejamentos e o histórico não são afetados.')){
        for (const r of clean) r.pid = db.settings.activeProg;
        applyMus(); db.routines = db.routines.filter(r => r.pid !== db.settings.activeProg).concat(clean);
        save(); closeSheet(); render(); toast('Planejamento substituído'); } },
    });
  }).catch(() => toast('Arquivo de plano inválido'));
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
            <button class="mini" data-a="sub" data-i="${i}" aria-label="substituir">⇄</button>
            <button class="mini vid" data-a="video" data-n="${esc(e.name)}" aria-label="ver demonstração">▶</button>
            <button class="mini" data-a="up" data-i="${i}" aria-label="subir">↑</button>
            <button class="mini" data-a="dn" data-i="${i}" aria-label="descer">↓</button>
            <button class="mini" data-a="rm" data-i="${i}" aria-label="remover" style="color:var(--bad)">✕</button>
          </span>
        </div>
        <div class="muschips" style="margin-top:6px">${chipsFor(e.name)}</div>
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
    <button class="btn slim" data-a="movr" style="margin-bottom:8px">⇢ Mover para outro planejamento</button>
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
    video: el => openVideo(el.dataset.n),
    musx: el => openMuscleSheetEx(el.dataset.n),
    sub: el => openSubSheet(r.exercises[el.dataset.i].name, {type:'plan', id: r.id, i:+el.dataset.i}),
    up: el => { const i = +el.dataset.i; if (i>0){ [r.exercises[i-1],r.exercises[i]] = [r.exercises[i],r.exercises[i-1]]; commit(); render(); } },
    dn: el => { const i = +el.dataset.i; if (i<r.exercises.length-1){ [r.exercises[i+1],r.exercises[i]] = [r.exercises[i],r.exercises[i+1]]; commit(); render(); } },
    rm: el => { r.exercises.splice(+el.dataset.i,1); commit(); render(); },
    add: () => {
      const n = $('#new-ex').value.trim();
      if (!n) return;
      r.exercises.push({name:n, sets:3, repsMin:8, repsMax:12, rest: db.settings.restDefault});
      commit(); render();
      if (!getMuscles(n)) openMuscleSelector(n); // exercício desconhecido: pedir músculos
    },
    movr: () => openMoveSheet(r),
    delr: () => { if (confirm(`Apagar "${r.name}"? O histórico de treinos não é afetado.`)){
      db.routines = db.routines.filter(x => x.id !== r.id); save(); nav('plan'); } },
  });
}
/* ---------- mover rotina entre planejamentos ---------- */
function openMoveSheet(r){
  const cur = db.programs.find(p => p.id === r.pid);
  openSheet(`
    <div class="sheet-title">Mover "${esc(r.name)}"</div>
    <p class="muted small" style="margin-bottom:10px">Está em: <b style="color:var(--text)">${esc(cur ? cur.name : '?')}</b></p>
    ${db.programs.filter(p => p.id !== r.pid).map(p => `
      <button class="btn slim" data-a="mvto" data-id="${p.id}" style="margin-bottom:8px">${esc(p.name)}${p.id === db.settings.activeProg ? ' <span class="chip ss">ativo</span>' : ''}</button>`).join('')}
    <button class="btn slim" data-a="mvnew" style="margin-bottom:8px">+ Novo planejamento…</button>
    <button class="btn slim" data-a="close">Cancelar</button>
    <p class="faint small" style="margin-top:10px">Só muda a caixa da rotina; exercícios e histórico ficam como estão.</p>`, {
    close: closeSheet,
    mvto: el => {
      const p = db.programs.find(x => x.id === el.dataset.id); if (!p) return;
      r.pid = p.id; planOpen[p.id] = true; save(); closeSheet(); nav('plan');
      toast(`Movida para "${p.name}"`);
    },
    mvnew: () => {
      const name = prompt('Nome do novo planejamento:', `Planejamento ${db.programs.length + 1}`);
      if (!name) return;
      const p = {id: uid(), name: name.trim().slice(0, 48)};
      db.programs.push(p); r.pid = p.id; planOpen[p.id] = true; save(); closeSheet(); nav('plan');
      toast(`Movida para "${p.name}"`);
    },
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
    <div class="card">
      <div class="spread" style="margin-bottom:12px">
        <span>Descanso padrão (s)</span>
        <input type="number" id="s-rest" value="${db.settings.restDefault}" style="width:80px">
      </div>
      <button class="btn slim" data-a="testsnd">🔔 Testar aviso sonoro</button>
      <p class="faint small" style="margin-top:8px;line-height:1.5">Não ouviu? Verifique a chavinha de silencioso na lateral do iPhone e o volume. Vibração não funciona em web apps no iOS (limitação da Apple).</p>
    </div>
    <div class="h2">Instalação no iPhone</div>
    <div class="card small muted" style="line-height:1.65">
      Abra este endereço no <b style="color:var(--text)">Safari</b> → botão <b style="color:var(--text)">Compartilhar</b> → <b style="color:var(--text)">Adicionar à Tela de Início</b>. O app abre em tela cheia e funciona offline.
    </div>
    <div class="h2">Zona de risco</div>
    <div class="card"><button class="btn danger slim" data-a="wipe">Apagar todos os dados</button></div>
    <p class="faint small" style="text-align:center;margin-top:6px">PINEAPPLE METHOD v9 · ${db.workouts.length} treinos no aparelho</p>`;
  $('#s-rest').addEventListener('change', () => {
    const v = parseInt($('#s-rest').value,10);
    if (isFinite(v) && v >= 10){ db.settings.restDefault = v; save(); toast('Salvo'); }
  });
  bind('#view', {
    exp: exportJSON,
    impjson: () => $('#f-json').click(),
    impcsv: () => $('#f-csv').click(),
    testsnd: () => { initAudio(); beep(); toast('Tocou o aviso de fim de descanso'); },
    wipe: () => {
      if (confirm('Apagar TODOS os dados (plano, histórico, peso)?') && confirm('Certeza? Não dá para desfazer sem backup.')){
        localStorage.removeItem(KEY); load(); toast('Dados restaurados ao inicial'); nav('home');
      }
    },
  });
  $('#f-json').addEventListener('change', ev => importJSON(ev.target.files[0]));
  $('#f-csv').addEventListener('change', ev => importHevy(ev.target.files[0]));
}
async function exportJSON(){
  const d = new Date();
  const blob = new Blob([JSON.stringify(db, null, 1)], {type:'application/json'});
  const file = new File([blob], `pineapple-backup-${ymd(d)}.json`, {type:'application/json'});
  // iOS: folha de compartilhar é mais confiável que download em PWA instalada
  if (navigator.canShare && navigator.canShare({files:[file]})){
    try { await navigator.share({files:[file], title:'Backup Pineapple'}); return; }
    catch(e){ if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Backup gerado');
}
function importJSON(file){
  if (!file) return;
  file.text().then(t => {
    const d = JSON.parse(t);
    if (!d.routines || !d.workouts) throw new Error('formato');
    if (!confirm(`Substituir tudo pelo backup (${d.workouts.length} treinos)?`)) return;
    db = d; normalize(); save(); toast('Backup restaurado'); nav('home');
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
if (db.active){ nav('workout'); acquireWake(); } else nav('home');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
