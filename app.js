/* ============================================================
   KASH app.js — Rewrite limpio completo
   Supabase + Auth + Cloud + Budgets + Shared + PDF + FAB
============================================================ */
'use strict';

/* --- SUPABASE --- */
const SUPABASE_URL = 'https://cstilmraomgwkcnukpyd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzdGlsbXJhb21nd2tjbnVrcHlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzI0MTEsImV4cCI6MjA5NzIwODQxMX0.a4dbGG2JpCpONCRCnVyTDZ8nTdJJJ9YqmLKGPh21yro';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken:true, persistSession:true, detectSessionInUrl:true }
});

/* --- CATEGORÍAS POR DEFECTO --- */
const CATS_DEFAULT = {
  ingreso:[
    {nombre:'Salario',emoji:'💼'},{nombre:'Trabajo virtual',emoji:'💻'},
    {nombre:'Alquiler recibido',emoji:'🏠'},{nombre:'Tienda',emoji:'🛍️'},
    {nombre:'Freelance',emoji:'🎯'},{nombre:'Inversiones',emoji:'📈'},
    {nombre:'Regalo',emoji:'🎁'},{nombre:'Otros ingresos',emoji:'💵'},
  ],
  gasto:[
    {nombre:'Vivienda',emoji:'🏠'},{nombre:'Alimentación',emoji:'🛒'},
    {nombre:'Transporte',emoji:'🚌'},{nombre:'Salud',emoji:'🏥'},
    {nombre:'Ocio',emoji:'🎮'},{nombre:'Ropa',emoji:'👕'},
    {nombre:'Educación',emoji:'📚'},{nombre:'Tecnología',emoji:'📱'},
    {nombre:'Restaurantes',emoji:'🍽️'},{nombre:'Suscripciones',emoji:'🔁'},
    {nombre:'Alquiler pagado',emoji:'🏢'},{nombre:'Otros gastos',emoji:'📦'},
  ]
};
const COLORS = ['#7C6BFF','#00E5A0','#FF4D6A','#FFB830','#3B82F6','#EC4899','#10B981','#F97316','#8B5CF6','#14B8A6'];

/* --- ESTADO --- */
let user=null, perfil=null;
let txs=[], cats={ingreso:[...CATS_DEFAULT.ingreso],gasto:[...CATS_DEFAULT.gasto]};
let fixedExps=[], presupuestos=[];
let tipo='ingreso', moneda='EUR', delId=null, catTab='ingreso';
let chartC=null, chartM=null, photoB64=null;
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth(), calSelDay=null;
let espacioActual=null, miembros=[], txsCompartidas=[];

/* --- UTILS --- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function hoy(){ return new Date().toISOString().split('T')[0]; }
function mesHoy(){ return hoy().slice(0,7); }
function icons(){ if(window.lucide) lucide.createIcons(); }

function fmt(n){
  if(!n||n===0) return moneda==='USD'?'$0':'€0';
  const abs=Math.abs(n);
  const str=Number.isInteger(abs)?abs.toString():abs.toFixed(2);
  return moneda==='USD'
    ?'$'+str.replace(/\B(?=(\d{3})+(?!\d))/g,',')
    :'€'+str.replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}

function fmtFecha(d){
  if(!d) return '';
  const MM=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const [y,m,dd]=d.split('-');
  return `${parseInt(dd)} ${MM[parseInt(m)-1]} ${y}`;
}

function getEmoji(nombre){
  return ([...cats.ingreso,...cats.gasto].find(c=>c.nombre===nombre)||{}).emoji||'📌';
}

function textColor(){ return getComputedStyle(document.documentElement).getPropertyValue('--text2').trim()||'#666'; }
function surfaceColor(){ return getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()||'#1C2030'; }

function showToast(msg,type='success'){
  const t=$('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>{ t.className='toast'; },3000);
}

/* --- TEMA --- */
function setTema(t){
  document.documentElement.setAttribute('data-theme',t);
  localStorage.setItem('kash_tema',t);
  const icon=$('theme-icon');
  if(icon){ icon.setAttribute('data-lucide',t==='dark'?'sun':'moon'); icons(); }
  renderChartCats(); renderChartMensual();
}

/* --- MONEDA --- */
function setMoneda(m){
  moneda=m;
  localStorage.setItem('kash_moneda',m);
  document.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.currency===m));
  ['amount-symbol','fx-symbol','bud-symbol'].forEach(id=>{ const el=$(id); if(el) el.textContent=m==='USD'?'$':'€'; });
  renderAll();
}

/* --- TIPO --- */
function setTipo(t){
  tipo=t;
  $('btn-ingreso').classList.toggle('active',t==='ingreso');
  $('btn-gasto').classList.toggle('active',t==='gasto');
  fillCatSelect('f-cat',t);

  // Indicador visible
  const ind = $('tipo-indicator');
  const indIcon = $('tipo-indicator-icon');
  const indText = $('tipo-indicator-text');
  if(ind){
    ind.className = t==='ingreso' ? 'tipo-indicator tipo-indicator--income' : 'tipo-indicator tipo-indicator--expense';
    if(indIcon) indIcon.textContent = t==='ingreso' ? '↑' : '↓';
    if(indText) indText.textContent = t==='ingreso' ? 'Estás añadiendo un INGRESO' : 'Estás añadiendo un GASTO';
  }

  // Cambia el texto del botón
  const btn = $('btn-submit-tx');
  if(btn) btn.textContent = t==='ingreso' ? 'Añadir ingreso' : 'Añadir gasto';

  // Cambia el símbolo de moneda de color
  const sym = $('amount-symbol');
  if(sym) sym.style.color = t==='ingreso' ? 'var(--green)' : 'var(--red)';
}

function fillCatSelect(selId,t){
  const sel=$(selId); if(!sel) return;
  sel.innerHTML=cats[t].map(c=>`<option value="${esc(c.nombre)}">${c.emoji} ${esc(c.nombre)}</option>`).join('');
}

/* --- SUPABASE: PERFIL --- */
async function loadPerfil(){
  const {data}=await sb.from('perfiles').select('*').eq('id',user.id).single();
  if(data){
    perfil=data; moneda=data.moneda||'EUR'; setMoneda(moneda);
    const tema=data.tema||localStorage.getItem('kash_tema')||'dark'; setTema(tema);
    const nn=data.nombre||user.email.split('@')[0];
    const nameEl=$('user-name-header'); if(nameEl) nameEl.textContent=nn;
    const av=$('user-avatar'); if(av) av.textContent=nn[0].toUpperCase();
    const pav=$('profile-avatar'); if(pav) pav.textContent=nn[0].toUpperCase();
    const pname=$('profile-name'); if(pname) pname.value=data.nombre||'';
  }
}

async function updatePerfil(updates){
  await sb.from('perfiles').update({...updates,updated_at:new Date().toISOString()}).eq('id',user.id);
}

/* --- SUPABASE: DATOS --- */
async function loadData(){
  $('app-loading').style.display='flex';
  try{
    const txRes  = await sb.from('transacciones').select('*').eq('user_id',user.id).order('date',{ascending:false});
    const fxRes  = await sb.from('gastos_fijos').select('*').eq('user_id',user.id).order('created_at');
    const catRes = await sb.from('categorias').select('*').eq('user_id',user.id).order('orden');
    const presRes= await sb.from('presupuestos').select('*').eq('user_id',user.id);

    txs       = (txRes.data||[]).map(t=>({...t,desc:t.descripcion,amount:parseFloat(t.amount),fixedId:t.fixed_id}));
    fixedExps = (fxRes.data||[]).map(f=>({...f,desc:f.descripcion,amount:parseFloat(f.amount),lastApplied:f.last_applied}));
    presupuestos = presRes.data||[];

    if(catRes.data&&catRes.data.length>0){
      cats={ingreso:[],gasto:[]};
      (catRes.data||[]).forEach(c=>{ if(cats[c.type]) cats[c.type].push({nombre:c.nombre,emoji:c.emoji,id:c.id}); });
    } else {
      await seedDefaultCats();
    }

    try{ await aplicarGastosFijos(); } catch(e){ console.warn('Fixed expenses error:',e); }

  } catch(e){
    console.error('loadData error:',e);
    showToast('Error cargando datos','error');
  } finally {
    $('app-loading').style.display='none';
    renderAll();
  }
}

async function seedDefaultCats(){
  const rows=[];
  CATS_DEFAULT.ingreso.forEach((c,i)=>rows.push({user_id:user.id,type:'ingreso',nombre:c.nombre,emoji:c.emoji,orden:i}));
  CATS_DEFAULT.gasto.forEach((c,i)=>rows.push({user_id:user.id,type:'gasto',nombre:c.nombre,emoji:c.emoji,orden:i}));
  await sb.from('categorias').insert(rows);
  cats={ingreso:[...CATS_DEFAULT.ingreso],gasto:[...CATS_DEFAULT.gasto]};
}

/* --- GASTOS FIJOS --- */
async function aplicarGastosFijos(){
  const mes=mesHoy();
  const toApply=fixedExps.filter(fx=>fx.active&&fx.lastApplied!==mes);
  if(!toApply.length) return;
  for(const fx of toApply){
    const [y,m]=mes.split('-').map(Number);
    const maxDia=new Date(y,m,0).getDate();
    const dia=Math.min(fx.day,maxDia);
    const fecha=`${mes}-${String(dia).padStart(2,'0')}`;
    const {data}=await sb.from('transacciones').insert({
      user_id:user.id,type:'gasto',descripcion:fx.desc,
      amount:fx.amount,cat:fx.cat,date:fecha,fixed_id:fx.id,moneda
    }).select().single();
    if(data) txs.unshift({...data,desc:data.descripcion,amount:parseFloat(data.amount),fixedId:data.fixed_id});
    await sb.from('gastos_fijos').update({last_applied:mes}).eq('id',fx.id);
    fx.lastApplied=mes;
  }
  if(toApply.length) showToast(`✓ ${toApply.length} gasto(s) fijo(s) aplicados`);
}

/* --- TRANSACCIONES --- */
async function addTransaction(txData){
  const btn=$('btn-submit-tx');
  if(btn){ btn.disabled=true; btn.textContent='Guardando...'; }

  // Refresh session before inserting
  const {data:sessionData} = await sb.auth.getSession();
  if(!sessionData?.session){
    if(btn){ btn.disabled=false; btn.textContent='Añadir movimiento'; }
    showToast('Sesión expirada. Inicia sesión de nuevo.','error');
    setTimeout(()=>showAuth(), 1500);
    return;
  }
  user = sessionData.session.user;

  const {data,error}=await sb.from('transacciones').insert({
    user_id:user.id,type:txData.type,descripcion:txData.desc,
    amount:txData.amount,cat:txData.cat,date:txData.date,
    photo:txData.photo||null,moneda
  }).select().single();
  if(btn){ btn.disabled=false; btn.textContent='Añadir movimiento'; }
  if(error){ 
    showToast('Error: '+error.message,'error'); 
    console.error('Supabase error:',error); 
    alert('Error al guardar: '+error.message+' | Code: '+error.code);
    return; 
  }
  txs.unshift({...data,desc:data.descripcion,amount:parseFloat(data.amount),fixedId:data.fixed_id});
  showToast('✓ Movimiento añadido');
  checkBudgetAlert(txData.cat,txData.amount);
  renderAll();
}

async function deleteTransaction(id){
  const {error}=await sb.from('transacciones').delete().eq('id',id).eq('user_id',user.id);
  if(error){ showToast('Error al eliminar','error'); return; }
  txs=txs.filter(t=>t.id!==id);
  showToast('Movimiento eliminado');
  renderAll();
}

/* --- BUDGETS --- */
function checkBudgetAlert(cat,amount){
  const mes=mesHoy();
  const bud=presupuestos.find(p=>p.cat===cat&&p.mes===mes);
  if(!bud) return;
  const gastado=txs.filter(t=>t.type==='gasto'&&t.cat===cat&&t.date.startsWith(mes)).reduce((s,t)=>s+t.amount,0)+amount;
  const pct=(gastado/bud.amount)*100;
  if(pct>=100) showToast(`🚨 Superaste el presupuesto de "${cat}"!`,'error');
  else if(pct>=80) showToast(`⚠️ Al 80% del presupuesto de "${cat}"`,'error');
}

/* --- RENDER: CARDS --- */
function renderCards(){
  const ing=txs.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gas=txs.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  const bal=ing-gas;
  const fxTot=fixedExps.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);
  $('total-income').textContent=fmt(ing);
  $('total-expense').textContent=fmt(gas);
  $('total-fixed').textContent=fmt(fxTot);
  $('sub-income').textContent=txs.filter(t=>t.type==='ingreso').length+' movimientos';
  $('sub-expense').textContent=txs.filter(t=>t.type==='gasto').length+' movimientos';
  $('sub-fixed').textContent=fixedExps.filter(f=>f.active).length+' activos';
  const bEl=$('total-balance');
  bEl.textContent=(bal<0?'-':'')+fmt(bal);
  $('sub-balance').textContent=bal>=0?'✓ Positivo':'✗ Déficit';
}

/* --- RENDER: LISTA --- */
function filteredTxs(){
  const mes=$('filter-month').value, tip=$('filter-type').value, cat=$('filter-cat').value;
  return txs
    .filter(t=>!mes||t.date.startsWith(mes))
    .filter(t=>tip==='todos'||t.type===tip)
    .filter(t=>cat==='todas'||t.cat===cat);
}

function renderLista(){
  const lista=$('tx-list'), empty=$('empty-msg');
  const data=filteredTxs();
  if(!data.length){ lista.innerHTML=''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible');
  lista.innerHTML=data.map(tx=>`
    <div class="tx-item${tx.fixedId?' is-fixed':''}">
      <div class="tx-icon ${tx.type}">${getEmoji(tx.cat)}</div>
      <div class="tx-info">
        <div class="tx-desc">${esc(tx.desc)}</div>
        <span class="tx-pill cat">${esc(tx.cat)}</span>
        ${tx.fixedId?'<span class="tx-pill fixed-tag">🔁 Fijo</span>':''}
      </div>
      ${tx.photo?`<img src="${tx.photo}" class="photo-thumb" data-id="${tx.id}" alt="Factura" />`:''}
      <span class="tx-date">${fmtFecha(tx.date)}</span>
      <span class="tx-amount ${tx.type}">${tx.type==='ingreso'?'+':'−'}${fmt(tx.amount)}</span>
      <button class="tx-del" data-id="${tx.id}" aria-label="Eliminar">✕</button>
    </div>`).join('');
  lista.querySelectorAll('.tx-del').forEach(b=>b.addEventListener('click',()=>openDelModal(b.dataset.id)));
  lista.querySelectorAll('.photo-thumb').forEach(img=>img.addEventListener('click',()=>openPhotoModal(img.dataset.id)));
}

function updateFilterCat(){
  const sel=$('filter-cat'), cur=sel.value;
  const uniq=[...new Set(txs.map(t=>t.cat))].sort();
  sel.innerHTML='<option value="todas">Todas</option>'+uniq.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if(uniq.includes(cur)) sel.value=cur;
}

/* --- RENDER: FIXED --- */
function renderFixed(){
  const lista=$('fixed-list'), empty=$('fixed-empty');
  if(!fixedExps.length){ lista.innerHTML=''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible');
  lista.innerHTML=fixedExps.map(fx=>`
    <div class="fixed-item${fx.active?'':' paused'}">
      <div class="fixed-icon">${getEmoji(fx.cat)}</div>
      <div class="fixed-info">
        <div class="fixed-name">${esc(fx.desc)}</div>
        <div class="fixed-meta">Día ${fx.day} · ${esc(fx.cat)} · ${fx.active?'✅ Activo':'⏸ Pausado'} ${fx.lastApplied?'· '+fx.lastApplied:''}</div>
      </div>
      <div class="fixed-amount">${fmt(fx.amount)}/mes</div>
      <div class="fixed-actions">
        <button class="fixed-btn pause-btn" data-id="${fx.id}">${fx.active?'Pausar':'Activar'}</button>
        <button class="fixed-btn del-btn" data-id="${fx.id}">Eliminar</button>
      </div>
    </div>`).join('');
  lista.querySelectorAll('.pause-btn').forEach(b=>b.addEventListener('click',async()=>{
    const fx=fixedExps.find(f=>f.id===b.dataset.id); if(!fx) return;
    fx.active=!fx.active;
    await sb.from('gastos_fijos').update({active:fx.active}).eq('id',fx.id);
    showToast(fx.active?'Activado':'Pausado'); renderFixed(); renderCards();
  }));
  lista.querySelectorAll('.del-btn').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('¿Eliminar este gasto fijo?')) return;
    await sb.from('gastos_fijos').delete().eq('id',b.dataset.id);
    fixedExps=fixedExps.filter(f=>f.id!==b.dataset.id);
    showToast('Eliminado'); renderFixed(); renderCards();
  }));
}

/* --- RENDER: BUDGETS --- */
function renderBudgets(){
  const mes=$('budget-mes').value||mesHoy();
  const lista=$('budget-list'), empty=$('budget-empty');
  const buds=presupuestos.filter(p=>p.mes===mes);
  if(!buds.length){ lista.innerHTML=''; empty.classList.add('visible'); return; }
  empty.classList.remove('visible');
  lista.innerHTML=buds.map(b=>{
    const gastado=txs.filter(t=>t.type==='gasto'&&t.cat===b.cat&&t.date.startsWith(mes)).reduce((s,t)=>s+t.amount,0);
    const pct=Math.min((gastado/parseFloat(b.amount))*100,100).toFixed(0);
    const cls=+pct>=100?'danger':+pct>=80?'warn':'';
    const color=+pct>=100?'var(--red)':+pct>=80?'var(--amber)':'var(--accent)';
    return `<div class="budget-item">
      <div class="budget-item-header">
        <span class="budget-cat">${getEmoji(b.cat)} ${esc(b.cat)}</span>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span class="budget-amounts"><strong>${fmt(gastado)}</strong> / ${fmt(parseFloat(b.amount))}</span>
          <button class="budget-del" data-cat="${esc(b.cat)}" data-mes="${b.mes}">✕</button>
        </div>
      </div>
      <div class="budget-track"><div class="budget-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="budget-pct" style="color:${color}">${pct}% usado</div>
    </div>`;
  }).join('');
  lista.querySelectorAll('.budget-del').forEach(b=>b.addEventListener('click',async()=>{
    await sb.from('presupuestos').delete().eq('user_id',user.id).eq('cat',b.dataset.cat).eq('mes',b.dataset.mes);
    presupuestos=presupuestos.filter(p=>!(p.cat===b.dataset.cat&&p.mes===b.dataset.mes));
    showToast('Presupuesto eliminado'); renderBudgets();
  }));
}

/* --- RENDER: CHARTS --- */
function renderChartCats(){
  const canvas=$('chart-cats'), empty=$('empty-cats');
  const bycat={};
  txs.filter(t=>t.type==='gasto').forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.amount;});
  const labels=Object.keys(bycat), data=Object.values(bycat);
  if(chartC){chartC.destroy();chartC=null;}
  if(!labels.length){canvas.style.display='none';empty.classList.add('visible');return;}
  canvas.style.display='block';empty.classList.remove('visible');
  chartC=new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:COLORS.slice(0,labels.length),borderWidth:2,borderColor:surfaceColor()}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},color:textColor()}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${fmt(ctx.parsed)}`}}}}});
}

function renderChartMensual(){
  const canvas=$('chart-monthly'), empty=$('empty-monthly');
  const meses={};
  txs.forEach(t=>{const m=t.date.slice(0,7);if(!meses[m])meses[m]={ing:0,gas:0};meses[m][t.type==='ingreso'?'ing':'gas']+=t.amount;});
  const labels=Object.keys(meses).sort();
  const MM=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const lbls=labels.map(m=>{const[y,mo]=m.split('-');return `${MM[parseInt(mo)-1]} ${y.slice(2)}`;});
  if(chartM){chartM.destroy();chartM=null;}
  if(!labels.length){canvas.style.display='none';empty.classList.add('visible');return;}
  canvas.style.display='block';empty.classList.remove('visible');
  const tc=textColor();
  chartM=new Chart(canvas,{type:'bar',data:{labels:lbls,datasets:[{label:'Ingresos',data:labels.map(m=>+meses[m].ing.toFixed(2)),backgroundColor:'#00E5A0',borderRadius:4},{label:'Gastos',data:labels.map(m=>+meses[m].gas.toFixed(2)),backgroundColor:'#FF4D6A',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},color:tc}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{font:{size:11},color:tc}},y:{grid:{color:'rgba(128,128,128,.1)'},ticks:{font:{size:11},color:tc,callback:v=>fmt(v)}}}}});
}

/* --- RENDER: CALENDAR --- */
let calView = 'expense'; // 'income' | 'balance' | 'expense'

function renderCalendar(){
  const MM=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MMshort=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Nav labels
  const prevD=new Date(calYear,calMonth-1,1), nextD=new Date(calYear,calMonth+1,1);
  const titleEl=$('cal-title'); if(titleEl) titleEl.textContent=`${MM[calMonth]} ${calYear}`;
  const prevL=$('cal-prev-label'); if(prevL) prevL.textContent=`${MMshort[prevD.getMonth()]} ${prevD.getFullYear()}`;
  const nextL=$('cal-next-label'); if(nextL) nextL.textContent=`${MMshort[nextD.getMonth()]} ${nextD.getFullYear()}`;

  const grid=$('cal-grid'); if(!grid) return;
  const today=hoy();

  // Build day data
  const byDay={};
  txs.forEach(t=>{
    const[y,m,d]=t.date.split('-');
    if(parseInt(y)===calYear&&parseInt(m)-1===calMonth){
      if(!byDay[d])byDay[d]={ing:0,gas:0};
      byDay[d][t.type==='ingreso'?'ing':'gas']+=t.amount;
    }
  });

  const firstDay=new Date(calYear,calMonth,1).getDay();
  const offset=(firstDay===0)?6:firstDay-1;
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const daysInPrev=new Date(calYear,calMonth,0).getDate();
  const dias=['Lu','Ma','Mi','Ju','Vi','Sa','Do'];

  let html=dias.map(d=>`<div class="cal-day-name-new">${d}</div>`).join('');

  for(let i=offset-1;i>=0;i--)
    html+=`<div class="cal-day-new other-month"><span>${daysInPrev-i}</span></div>`;

  for(let d=1;d<=daysInMonth;d++){
    const ds=String(d).padStart(2,'0');
    const dateStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${ds}`;
    const isToday=dateStr===today, isSel=calSelDay===dateStr;
    const info=byDay[ds];
    let cls='cal-day-new';
    if(isToday) cls+=' today';
    if(isSel)   cls+=' selected';
    let dot='';
    if(info){
      if(info.ing>0&&info.gas>0){ cls+=' has-both'; dot='<div class="cal-day-dot"></div>'; }
      else if(info.ing>0){ cls+=' has-income'; dot='<div class="cal-day-dot"></div>'; }
      else if(info.gas>0){ cls+=' has-expense'; dot='<div class="cal-day-dot"></div>'; }
    }
    html+=`<div class="${cls}" data-date="${dateStr}"><span>${d}</span>${dot}</div>`;
  }

  const total=Math.ceil((offset+daysInMonth)/7)*7;
  for(let d=1;d<=total-offset-daysInMonth;d++)
    html+=`<div class="cal-day-new other-month"><span>${d}</span></div>`;

  grid.innerHTML=html;
  grid.querySelectorAll('.cal-day-new:not(.other-month)').forEach(cell=>
    cell.addEventListener('click',()=>{
      calSelDay=cell.dataset.date;
      renderCalendar();
      showCalDetail(calSelDay);
    })
  );

  // Render category bars
  renderCalCats();

  // Show today's transactions by default
  if(!calSelDay) showCalDetail(today);
}

function renderCalCats(){
  const bar=$('cal-cats-bar'); if(!bar) return;
  const mes=`${calYear}-${String(calMonth+1).padStart(2,'0')}`;
  const tMes=txs.filter(t=>t.date.startsWith(mes));

  let data=[];
  if(calView==='income'){
    const bycat={};
    tMes.filter(t=>t.type==='ingreso').forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.amount;});
    data=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  } else {
    const bycat={};
    tMes.filter(t=>t.type==='gasto').forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.amount;});
    data=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  }

  if(!data.length){ bar.innerHTML='<p style="font-size:.78rem;color:var(--text3);text-align:center;padding:.5rem">Sin datos este mes</p>'; return; }

  const total=data.reduce((s,[,a])=>s+a,0);
  const max=data[0][1];
  const colors=['#6C63FF','#FF4D6A','#00E5A0','#FFB830','#3B82F6'];

  bar.innerHTML=data.map(([cat,amt],i)=>{
    const pct=total>0?(amt/total*100).toFixed(1):0;
    const barW=max>0?(amt/max*100).toFixed(1):0;
    return `<div class="cal-cat-row">
      <span class="cal-cat-icon">${getEmoji(cat)}</span>
      <span class="cal-cat-name">${esc(cat)}</span>
      <div class="cal-cat-bar-wrap">
        <div class="cal-cat-track"><div class="cal-cat-fill" style="width:${barW}%;background:${colors[i]}"></div></div>
      </div>
      <span class="cal-cat-amt" style="color:${colors[i]}">${pct}%<br><small style="color:var(--text3)">${fmt(amt)}</small></span>
    </div>`;
  }).join('');
}

function showCalDetail(dateStr){
  const detail=$('cal-detail'), list=$('cal-detail-list'), title=$('cal-detail-title');
  const dayTxs=txs.filter(t=>t.date===dateStr);
  title.textContent=`Movimientos del ${fmtFecha(dateStr)}`;
  detail.style.display='block';
  if(!dayTxs.length){list.innerHTML='<p style="text-align:center;padding:1.5rem;color:var(--text3);font-size:.85rem">Sin movimientos este día.</p>';return;}
  list.innerHTML=dayTxs.map(tx=>`
    <div class="cal-detail-tx">
      <div class="cal-detail-icon ${tx.type}">${getEmoji(tx.cat)}</div>
      <div style="flex:1;min-width:0"><div class="cal-detail-desc">${esc(tx.desc)}</div><div class="cal-detail-cat">${esc(tx.cat)}</div></div>
      ${tx.photo?`<img src="${tx.photo}" class="photo-thumb" data-id="${tx.id}" alt="Factura" style="margin-right:.5rem" />`:''}
      <div class="cal-detail-amt ${tx.type}">${tx.type==='ingreso'?'+':'−'}${fmt(tx.amount)}</div>
    </div>`).join('');
  list.querySelectorAll('.photo-thumb').forEach(img=>img.addEventListener('click',()=>openPhotoModal(img.dataset.id)));
}

/* --- RENDER: RESUMEN --- */
function fillMonthSelect(){
  ['resumen-mes','budget-mes'].forEach(selId=>{
    const sel=$(selId); if(!sel) return;
    const prev=sel.value;
    const all=[...new Set(txs.map(t=>t.date.slice(0,7)))].sort((a,b)=>b.localeCompare(a));
    const cur=mesHoy(); if(!all.includes(cur)) all.unshift(cur);
    const MM=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    sel.innerHTML=all.map(m=>{const[y,mo]=m.split('-');return `<option value="${m}">${MM[parseInt(mo)-1]} ${y}</option>`;}).join('');
    if(prev&&all.includes(prev)) sel.value=prev;
  });
}

function renderResumen(){
  const mes=$('resumen-mes').value, eEl=$('resumen-empty');
  if(!mes) return;
  const [y,mo]=mes.split('-').map(Number);
  const pd=new Date(y,mo-2,1), prev=`${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,'0')}`;
  const tMes=txs.filter(t=>t.date.startsWith(mes)), tPrev=txs.filter(t=>t.date.startsWith(prev));
  ['saving-wrap','top-cats-wrap','vs-wrap'].forEach(id=>{$(id).style.display=tMes.length?'block':'none';});
  if(!tMes.length){eEl.classList.add('visible');['resumen-metrics','top-cats','resumen-vs','resumen-recs'].forEach(id=>{$(id).innerHTML='';});return;}
  eEl.classList.remove('visible');
  const ing=tMes.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gas=tMes.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  const bal=ing-gas, pct=ing>0?Math.max(-100,Math.min(100,(bal/ing)*100)):0;
  const ingP=tPrev.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gasP=tPrev.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  const fxMes=fixedExps.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);
  $('resumen-metrics').innerHTML=`
    <div class="r-metric"><span class="r-metric-label">Ingresos</span><span class="r-metric-value g">${fmt(ing)}</span><span class="r-metric-sub">${tMes.filter(t=>t.type==='ingreso').length} mov.</span></div>
    <div class="r-metric"><span class="r-metric-label">Gastos</span><span class="r-metric-value r">${fmt(gas)}</span><span class="r-metric-sub">${tMes.filter(t=>t.type==='gasto').length} mov.</span></div>
    <div class="r-metric"><span class="r-metric-label">Balance</span><span class="r-metric-value ${bal>=0?'p':'rr'}">${bal<0?'-':''}${fmt(bal)}</span><span class="r-metric-sub">${bal>=0?'Positivo ✓':'Déficit ✗'}</span></div>
    <div class="r-metric"><span class="r-metric-label">Fijos</span><span class="r-metric-value" style="color:var(--amber)">${fmt(fxMes)}</span><span class="r-metric-sub">${fixedExps.filter(f=>f.active).length} activos</span></div>`;
  const fill=$('saving-fill');fill.style.width=Math.abs(pct).toFixed(1)+'%';fill.classList.toggle('neg',bal<0);
  const pEl=$('saving-pct');pEl.textContent=(bal<0?'-':'')+Math.abs(pct).toFixed(1)+'%';pEl.style.color=bal>=0?'var(--accent)':'var(--red)';
  const bycat={};tMes.filter(t=>t.type==='gasto').forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.amount;});
  const top=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).slice(0,5),mx=top.length?top[0][1]:1;
  $('top-cats').innerHTML=top.length?top.map(([cat,amt],i)=>`
    <div class="top-cat-row">
      <span class="top-cat-rank">#${i+1}</span>
      <span class="top-cat-name">${getEmoji(cat)} ${esc(cat)}</span>
      <div class="top-cat-track"><div class="top-cat-fill" style="width:${(amt/mx*100).toFixed(1)}%;background:${COLORS[i]}"></div></div>
      <span class="top-cat-amt">${fmt(amt)}</span>
      <span class="top-cat-pct">${gas>0?(amt/gas*100).toFixed(0):0}%</span>
    </div>`).join(''):'<p style="font-size:.82rem;color:var(--text3)">Sin gastos.</p>';
  function diff(cur,prv){if(!prv)return'<span class="same">Sin datos</span>';const d=cur-prv,p=(Math.abs(d)/prv*100).toFixed(1);if(d>0)return`<span class="down">▲ +${fmt(d)} (${p}%)</span>`;if(d<0)return`<span class="up">▼ −${fmt(Math.abs(d))} (${p}%)</span>`;return'<span class="same">Sin cambios</span>';}
  $('resumen-vs').innerHTML=`<div class="vs-grid"><div class="vs-item"><span class="vs-label">Ingresos</span><span class="vs-value" style="color:var(--green)">${fmt(ing)}</span><span class="vs-diff">${diff(ing,ingP)}</span></div><div class="vs-item"><span class="vs-label">Gastos</span><span class="vs-value" style="color:var(--red)">${fmt(gas)}</span><span class="vs-diff">${diff(gas,gasP)}</span></div></div>${!tPrev.length?'<p style="margin-top:.6rem;font-size:.78rem;color:var(--text3)">No hay datos del mes anterior.</p>':''}`;
  const recs=[];
  if(!ing)recs.push({c:'info',i:'ℹ️',m:'No hay ingresos registrados este mes.'});
  else if(pct>=20)recs.push({c:'good',i:'🌟',m:`¡Excelente! Ahorraste el ${pct.toFixed(1)}% de tus ingresos.`});
  else if(pct>0)recs.push({c:'warn',i:'💛',m:`Ahorraste el ${pct.toFixed(1)}%. Intenta llegar al 20%.`});
  else recs.push({c:'bad',i:'🚨',m:`Gastos superan ingresos en ${fmt(Math.abs(bal))}.`});
  if(top.length){const[tc2,ta]=top[0],p2=(ta/gas*100).toFixed(0);recs.push(+p2>50?{c:'warn',i:'📌',m:`"${tc2}" es el ${p2}% de tus gastos.`}:{c:'info',i:'📊',m:`Mayor gasto: "${tc2}" (${p2}%). Distribución saludable.`});}
  if(gasP>0){const d=((gas-gasP)/gasP*100).toFixed(1);if(gas>gasP&&+d>15)recs.push({c:'bad',i:'📈',m:`Gastos subieron ${d}% vs mes anterior.`});else if(gas<gasP)recs.push({c:'good',i:'📉',m:`Redujiste gastos un ${Math.abs(d)}%.`});else recs.push({c:'info',i:'↔️',m:`Gastos similares al mes anterior.`});}
  if(ingP>0&&ing>0){const d=((ing-ingP)/ingP*100).toFixed(1);if(ing>ingP)recs.push({c:'good',i:'💰',m:`Ingresos aumentaron un ${d}%.`});else if(+Math.abs(d)>10)recs.push({c:'warn',i:'⚠️',m:`Ingresos bajaron un ${Math.abs(d)}%.`});}
  if(pct>=20&&(!gasP||gas<=gasP))recs.push({c:'good',i:'🎉',m:'¡Mes excelente!'});
  $('resumen-recs').innerHTML=recs.map(r=>`<li class="${r.c}"><span class="ri">${r.i}</span><span>${r.m}</span></li>`).join('');
}

/* --- CATEGORÍAS --- */
function renderCatList(){
  const lista=$('cat-list'), cs=cats[catTab];
  if(!cs.length){lista.innerHTML='<span style="font-size:.8rem;color:var(--text3);font-style:italic">Sin categorías.</span>';return;}
  lista.innerHTML=cs.map((c,i)=>`
    <span class="cat-chip ${catTab}">
      ${c.emoji} ${esc(c.nombre)}
      <button class="chip-del" data-i="${i}" data-id="${c.id||''}">✕</button>
    </span>`).join('');
  lista.querySelectorAll('.chip-del').forEach(b=>b.addEventListener('click',async()=>{
    const i=parseInt(b.dataset.i), cat=cats[catTab][i];
    const enUso=txs.some(t=>t.cat===cat.nombre);
    if(enUso&&!confirm(`"${cat.nombre}" tiene movimientos. ¿Eliminar?`)) return;
    if(b.dataset.id) await sb.from('categorias').delete().eq('id',b.dataset.id);
    cats[catTab].splice(i,1);
    renderCatList(); fillCatSelect('f-cat',tipo); fillCatSelect('fx-cat','gasto');
  }));
}

/* --- FOTO --- */
function initPhoto(){
  const input=$('f-photo'), label=$('photo-label-text'), preview=$('photo-preview'), wrap=$('photo-preview-wrap'), clearBtn=$('photo-clear');
  input.addEventListener('change',()=>{
    const file=input.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        const MAX=800; let w=img.width,h=img.height;
        if(w>MAX){h=Math.round(h*MAX/w);w=MAX;} if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
        canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);
        photoB64=canvas.toDataURL('image/jpeg',.75);
        preview.src=photoB64;wrap.style.display='block';clearBtn.style.display='inline-block';
        label.textContent='✓ '+file.name;
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
  clearBtn.addEventListener('click',resetPhoto);
}

function resetPhoto(){
  photoB64=null;$('f-photo').value='';$('photo-preview').src='';
  $('photo-preview-wrap').style.display='none';$('photo-clear').style.display='none';
  $('photo-label-text').textContent='Adjuntar factura (opcional)';
}

/* --- MODALES --- */
function openDelModal(id){ delId=id; $('modal-overlay').classList.add('visible'); }
function openPhotoModal(txId){
  const tx=txs.find(t=>t.id===txId); if(!tx||!tx.photo) return;
  $('photo-modal-img').src=tx.photo; $('photo-modal').classList.add('visible');
}

/* --- ESPACIOS COMPARTIDOS --- */
async function loadEspacio(){
  if(!user) return;
  const {data:owned}=await sb.from('espacios').select('*').eq('owner_id',user.id).single();
  if(owned){espacioActual=owned;await loadMiembros();renderEspacio();return;}
  const {data:membership}=await sb.from('espacio_miembros').select('*,espacios(*)').eq('user_id',user.id).eq('estado','activo').single();
  if(membership){espacioActual=membership.espacios;await loadMiembros();renderEspacio();return;}
  const {data:pending}=await sb.from('espacio_miembros').select('*,espacios(*)').eq('email',user.email).eq('estado','pendiente').single();
  if(pending){renderInvitacionPendiente(pending);return;}
  renderSinEspacio();
}

async function loadMiembros(){
  if(!espacioActual) return;
  const {data}=await sb.from('espacio_miembros').select('*').eq('espacio_id',espacioActual.id);
  miembros=data||[];
}

function renderSinEspacio(){
  $('no-space-wrap').style.display='block';
  $('space-wrap').style.display='none';
}

function renderInvitacionPendiente(pending){
  $('no-space-wrap').style.display='none';
  $('space-wrap').style.display='block';
  $('invite-wrap').style.display='none';
  $('shared-toggle-wrap').style.display='none';
  $('pending-invite-wrap').style.display='block';
  $('pending-invite-wrap').querySelector('.pending-invite span').textContent=
    `📬 ${pending.espacios?.nombre||'Alguien'} te invitó a su espacio compartido`;
  $('btn-accept-invite').onclick=async()=>{
    await sb.from('espacio_miembros').update({user_id:user.id,nombre:perfil?.nombre||user.email.split('@')[0],estado:'activo'}).eq('id',pending.id);
    showToast('✓ Invitación aceptada');await loadEspacio();
  };
  $('btn-reject-invite').onclick=async()=>{
    await sb.from('espacio_miembros').update({estado:'rechazado'}).eq('id',pending.id);
    showToast('Invitación rechazada');renderSinEspacio();
  };
}

function renderEspacio(){
  if(!espacioActual){renderSinEspacio();return;}
  $('no-space-wrap').style.display='none';
  $('space-wrap').style.display='block';
  $('pending-invite-wrap').style.display='none';
  $('space-name-display').textContent=espacioActual.nombre;
  const esOwner=espacioActual.owner_id===user.id;
  $('space-role-display').textContent=esOwner?'👑 Administrador':'👤 Miembro';
  $('invite-wrap').style.display=(esOwner&&miembros.length<5)?'block':'none';
  const lista=$('members-list');
  lista.innerHTML=miembros.map(m=>`
    <div class="member-item">
      <div class="member-avatar">${(m.nombre||m.email)[0].toUpperCase()}</div>
      <div class="member-info">
        <div class="member-name">${esc(m.nombre||m.email.split('@')[0])}</div>
        <div class="member-email">${esc(m.email)}</div>
      </div>
      <span class="member-badge ${m.estado}">${m.rol==='admin'?'Admin':m.estado==='activo'?'Activo':'Pendiente'}</span>
      ${esOwner&&m.user_id!==user.id?`<button class="member-remove" data-id="${m.id}">✕</button>`:''}
    </div>`).join('');
  lista.querySelectorAll('.member-remove').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('¿Eliminar este miembro?')) return;
    await sb.from('espacio_miembros').delete().eq('id',btn.dataset.id);
    await loadMiembros();showToast('Miembro eliminado');renderEspacio();
  }));
}

/* --- CSV --- */
function exportCSV(){
  if(!txs.length){showToast('No hay datos','error');return;}
  const rows=[['Fecha','Tipo','Descripción','Categoría',`Importe (${moneda})`,'Fijo'],
    ...txs.map(t=>[t.date,t.type==='ingreso'?'Ingreso':'Gasto',`"${t.desc.replace(/"/g,'""')}"`,t.cat,t.amount.toFixed(2),t.fixedId?'Sí':'No'])];
  const csv=rows.map(r=>r.join(';')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:`kash_${hoy()}.csv`}).click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV descargado');
}

/* --- PDF --- */
function exportPDF(tipo='resumen'){
  if(!window.jspdf){showToast('Cargando PDF...','info');setTimeout(()=>exportPDF(tipo),1000);return;}
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const W=210,margin=18;let y=0;
  const PURPLE=[124,107,255],GREEN=[0,229,160],RED=[255,77,106],AMBER=[255,184,48];
  const DARK=[14,17,32],GRAY=[82,88,122],LIGHT=[240,242,255],WHITE=[255,255,255];
  // Header
  doc.setFillColor(...DARK);doc.rect(0,0,W,38,'F');
  doc.setFillColor(...PURPLE);doc.roundedRect(margin,10,14,14,3,3,'F');
  doc.setTextColor(...WHITE);doc.setFontSize(10);doc.setFont('helvetica','bold');doc.text('K',margin+5,19.5);
  doc.setFontSize(18);doc.text('Kash',margin+18,20);
  doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...LIGHT);
  doc.text('Control Financiero Personal',margin+18,26);
  doc.text(`Generado: ${fmtFecha(hoy())}`,W-margin,20,{align:'right'});
  y=48;
  if(tipo==='resumen'){
    const mes=$('resumen-mes').value||mesHoy();
    const [yr,mo]=mes.split('-').map(Number);
    const nombresM=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    doc.setFontSize(14);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);
    doc.text(`Resumen — ${nombresM[mo-1]} ${yr}`,margin,y);y+=10;
    const tMes=txs.filter(t=>t.date.startsWith(mes));
    const ing=tMes.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
    const gas=tMes.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
    const bal=ing-gas,pct=ing>0?((bal/ing)*100).toFixed(1):0;
    const fxMes=fixedExps.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);
    const cards=[{label:'Ingresos',value:fmt(ing),color:GREEN},{label:'Gastos',value:fmt(gas),color:RED},{label:'Balance',value:(bal<0?'-':'')+fmt(bal),color:bal>=0?PURPLE:RED},{label:'Gastos fijos',value:fmt(fxMes),color:AMBER}];
    const cw=(W-margin*2-9)/4;
    cards.forEach((card,i)=>{
      const cx=margin+i*(cw+3);
      doc.setFillColor(248,249,255);doc.roundedRect(cx,y,cw,22,2,2,'F');
      doc.setDrawColor(...card.color);doc.setLineWidth(0.8);doc.line(cx,y,cx+cw,y);
      doc.setFontSize(6.5);doc.setFont('helvetica','bold');doc.setTextColor(...GRAY);doc.text(card.label.toUpperCase(),cx+cw/2,y+7,{align:'center'});
      doc.setFontSize(11);doc.setFont('helvetica','bold');doc.setTextColor(...card.color);doc.text(card.value,cx+cw/2,y+16,{align:'center'});
    });
    y+=30;
    doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text('Tasa de ahorro',margin,y);
    doc.setTextColor(...PURPLE);doc.text(`${pct}%`,W-margin,y,{align:'right'});y+=5;
    doc.setFillColor(220,222,235);doc.roundedRect(margin,y,W-margin*2,4,2,2,'F');
    const barW=Math.min(Math.abs(+pct),100)/100*(W-margin*2);
    doc.setFillColor(...(bal>=0?PURPLE:RED));doc.roundedRect(margin,y,barW,4,2,2,'F');y+=12;
    // Top cats
    const bycat={};tMes.filter(t=>t.type==='gasto').forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.amount;});
    const top=Object.entries(bycat).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if(top.length){
      doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text('Top categorías de gasto',margin,y);y+=7;
      const mx2=top[0][1];
      const bColors=[[124,107,255],[0,229,160],[255,77,106],[255,184,48],[59,130,246]];
      top.forEach(([cat,amt],i)=>{
        const pctCat=gas>0?(amt/gas*100).toFixed(0):0;
        const bw=(amt/mx2)*(W-margin*2-55);
        doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(...GRAY);doc.text(`#${i+1}`,margin,y+3);
        doc.setTextColor(...DARK);doc.text(cat,margin+8,y+3);
        doc.setFillColor(220,222,235);doc.roundedRect(margin+55,y,W-margin*2-55-30,5,1,1,'F');
        doc.setFillColor(...bColors[i]);doc.roundedRect(margin+55,y,bw,5,1,1,'F');
        doc.setFontSize(7.5);doc.setFont('helvetica','bold');doc.setTextColor(...bColors[i]);
        doc.text(`${fmt(amt)} (${pctCat}%)`,W-margin,y+4,{align:'right'});y+=9;
      });y+=4;
    }
    // Movimientos
    if(tMes.length){
      doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text(`Movimientos (${tMes.length})`,margin,y);y+=7;
      doc.setFillColor(...DARK);doc.rect(margin,y,W-margin*2,7,'F');
      doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(...WHITE);
      doc.text('FECHA',margin+2,y+4.5);doc.text('DESCRIPCIÓN',margin+22,y+4.5);doc.text('CATEGORÍA',margin+90,y+4.5);doc.text('IMPORTE',W-margin-2,y+4.5,{align:'right'});y+=7;
      tMes.slice(0,30).forEach((tx,i)=>{
        if(y>270){doc.addPage();y=20;}
        doc.setFillColor(i%2===0?250:255,i%2===0?250:255,255);doc.rect(margin,y,W-margin*2,6.5,'F');
        doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...GRAY);doc.text(fmtFecha(tx.date),margin+2,y+4.5);
        doc.setTextColor(...DARK);doc.text(tx.desc.length>28?tx.desc.slice(0,28)+'…':tx.desc,margin+22,y+4.5);
        doc.setTextColor(...GRAY);doc.text(tx.cat,margin+90,y+4.5);
        doc.setTextColor(...(tx.type==='ingreso'?GREEN:RED));doc.setFont('helvetica','bold');
        doc.text((tx.type==='ingreso'?'+':'−')+fmt(tx.amount),W-margin-2,y+4.5,{align:'right'});y+=6.5;
      });
    }
  } else {
    doc.setFontSize(14);doc.setFont('helvetica','bold');doc.setTextColor(...DARK);doc.text('Todos los movimientos',margin,y);y+=10;
    doc.setFillColor(...DARK);doc.rect(margin,y,W-margin*2,7,'F');
    doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(...WHITE);
    doc.text('FECHA',margin+2,y+4.5);doc.text('DESCRIPCIÓN',margin+22,y+4.5);doc.text('CATEGORÍA',margin+90,y+4.5);doc.text('IMPORTE',W-margin-2,y+4.5,{align:'right'});y+=7;
    txs.forEach((tx,i)=>{
      if(y>270){doc.addPage();y=20;}
      doc.setFillColor(i%2===0?250:255,i%2===0?250:255,255);doc.rect(margin,y,W-margin*2,6.5,'F');
      doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...GRAY);doc.text(fmtFecha(tx.date),margin+2,y+4.5);
      doc.setTextColor(...DARK);doc.text(tx.desc.length>28?tx.desc.slice(0,28)+'…':tx.desc,margin+22,y+4.5);
      doc.setTextColor(...GRAY);doc.text(tx.cat,margin+90,y+4.5);
      doc.setTextColor(...(tx.type==='ingreso'?GREEN:RED));doc.setFont('helvetica','bold');
      doc.text((tx.type==='ingreso'?'+':'−')+fmt(tx.amount),W-margin-2,y+4.5,{align:'right'});y+=6.5;
    });
  }
  // Footer
  const pages=doc.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p);doc.setFillColor(...DARK);doc.rect(0,287,W,10,'F');
    doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(...LIGHT);
    doc.text('Kash — Control Financiero Personal',margin,293);
    doc.text(`usekash.netlify.app  ·  Pág. ${p} de ${pages}`,W-margin,293,{align:'right'});
  }
  doc.save(tipo==='resumen'?`kash_resumen_${$('resumen-mes').value||mesHoy()}.pdf`:`kash_movimientos_${hoy()}.pdf`);
  showToast('✓ PDF descargado');
}

/* --- RENDER ALL --- */
function renderAll(){
  renderCards();renderLista();renderFixed();
  renderChartCats();renderChartMensual();
  updateFilterCat();fillMonthSelect();
  renderBudgets();
  if($('tab-annual')?.classList.contains('active')){fillYearSelect();renderAnual();}
  icons();
}

/* --- TABS --- */
function initTabs(){
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      $('tab-'+btn.dataset.tab).classList.add('active');
      if(btn.dataset.tab==='calendar') renderCalendar();
      if(btn.dataset.tab==='summary'){fillMonthSelect();renderResumen();}
      if(btn.dataset.tab==='settings') renderCatList();
      if(btn.dataset.tab==='budget'){fillMonthSelect();renderBudgets();}
      if(btn.dataset.tab==='shared') loadEspacio();
      if(btn.dataset.tab==='annual'){fillYearSelect();renderAnual();}
      icons();
    });
  });
}

/* --- AUTH --- */
function showApp(){ $('auth-screen').style.display='none'; $('app').style.display='block'; }
function showAuth(){ $('auth-screen').style.display='flex'; $('app').style.display='none'; }

function initAuth(){
  document.querySelectorAll('.auth-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $('auth-login').style.display=tab.dataset.tab==='login'?'flex':'none';
      $('auth-register').style.display=tab.dataset.tab==='register'?'flex':'none';
    });
  });
  $('btn-login').addEventListener('click',async()=>{
    const email=$('login-email').value.trim(), pass=$('login-pass').value;
    const errEl=$('login-error');
    if(!email||!pass){errEl.textContent='Completa todos los campos.';return;}
    $('btn-login').textContent='Entrando...';$('btn-login').disabled=true;
    const {error}=await sb.auth.signInWithPassword({email,password:pass});
    $('btn-login').textContent='Entrar';$('btn-login').disabled=false;
    if(error) errEl.textContent=error.message==='Invalid login credentials'?'Email o contraseña incorrectos.':error.message;
  });
  $('btn-register').addEventListener('click',async()=>{
    const name=$('reg-name').value.trim(), email=$('reg-email').value.trim(), pass=$('reg-pass').value;
    const errEl=$('reg-error');
    if(!name||!email||!pass){errEl.textContent='Completa todos los campos.';return;}
    if(pass.length<8){errEl.textContent='Mínimo 8 caracteres.';return;}
    $('btn-register').textContent='Creando...';$('btn-register').disabled=true;
    const {error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:name}}});
    $('btn-register').textContent='Crear cuenta';$('btn-register').disabled=false;
    if(error) errEl.textContent=error.message;
    else{errEl.style.color='var(--green)';errEl.textContent='✓ Revisa tu email para confirmar.';}
  });
  $('btn-forgot').addEventListener('click',async()=>{
    const email=$('login-email').value.trim();
    if(!email){$('login-error').textContent='Escribe tu email primero.';return;}
    await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://usekash.netlify.app'});
    $('login-error').style.color='var(--green)';$('login-error').textContent='✓ Email enviado.';
  });
  async function logout(){
    try {
      await sb.auth.signOut();
    } catch(e) { console.warn(e); }
    user=null;perfil=null;txs=[];cats={ingreso:[...CATS_DEFAULT.ingreso],gasto:[...CATS_DEFAULT.gasto]};
    fixedExps=[];presupuestos=[];espacioActual=null;miembros=[];
    // Clear any cached session
    localStorage.removeItem('sb-cstilmraomgwkcnukpyd-auth-token');
    showAuth();
    showToast('Sesión cerrada');
  }
  $('btn-logout').addEventListener('click',logout);
  $('btn-logout2').addEventListener('click',logout);
  const bl3=$('btn-logout3'); if(bl3) bl3.addEventListener('click',logout);
}

/* ============================================================
   INIT PRINCIPAL
============================================================ */
(async function init(){
  // Tema inmediato
  const tema=localStorage.getItem('kash_tema')||'dark';
  document.documentElement.setAttribute('data-theme',tema);

  initAuth();
  initTabs();
  initPhoto();

  // Auth state
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(session?.user){
      user=session.user;
      showApp();
      // Hide spinner immediately, show content
      const loader=$('app-loading');
      if(loader) loader.style.display='none';
      // Load data in background
      try {
        await loadPerfil();
        await loadData();
        await loadEspacio();
      } catch(e) {
        console.error('Init error:',e);
        if(loader) loader.style.display='none';
        renderAll();
      }
    } else { showAuth(); }
  });

  // Tema toggle
  $('theme-toggle').addEventListener('click',()=>setTema(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));

  // Moneda
  document.querySelectorAll('.seg-btn').forEach(b=>b.addEventListener('click',()=>setMoneda(b.dataset.currency)));

  // Tipo
  $('btn-ingreso').addEventListener('click',()=>setTipo('ingreso'));
  $('btn-gasto').addEventListener('click',()=>setTipo('gasto'));
  fillCatSelect('f-cat','ingreso');
  $('f-date').value=hoy();

  // Form tx
  $('tx-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const desc=$('f-desc').value.trim(), amount=parseFloat($('f-amount').value);
    const cat=$('f-cat').value, date=$('f-date').value||hoy(), errEl=$('form-error');
    if(!desc){errEl.textContent='Escribe una descripción.';return;}
    if(!amount||amount<=0){errEl.textContent='El importe debe ser mayor que 0.';return;}
    errEl.textContent='';
    await addTransaction({type:tipo,desc,amount,cat,date,photo:photoB64});
    $('f-desc').value='';$('f-amount').value='';$('f-date').value=hoy();resetPhoto();
  });

  // Filtros
  ['filter-month','filter-type','filter-cat'].forEach(id=>$(id).addEventListener('change',()=>{renderLista();renderCards();}));
  $('btn-clear-filters').addEventListener('click',()=>{$('filter-month').value='';$('filter-type').value='todos';$('filter-cat').value='todas';renderLista();renderCards();});

  // Gastos fijos
  $('btn-toggle-fixed').addEventListener('click',()=>{
    const wrap=$('fixed-form-wrap'),open=wrap.style.display!=='none';
    wrap.style.display=open?'none':'block';
    $('btn-toggle-fixed').innerHTML=open?'＋ Añadir':'✕ Cerrar';
    if(!open) fillCatSelect('fx-cat','gasto');
  });
  $('btn-add-fixed').addEventListener('click',async()=>{
    const desc=$('fx-desc').value.trim(), amount=parseFloat($('fx-amount').value);
    const cat=$('fx-cat').value, day=parseInt($('fx-day').value), errEl=$('fixed-error');
    if(!desc){errEl.textContent='Escribe un nombre.';return;}
    if(!amount||amount<=0){errEl.textContent='Importe inválido.';return;}
    if(!day||day<1||day>28){errEl.textContent='Día entre 1 y 28.';return;}
    errEl.textContent='';
    const {data,error}=await sb.from('gastos_fijos').insert({user_id:user.id,descripcion:desc,amount,cat,day,active:true,moneda}).select().single();
    if(error){showToast('Error al guardar','error');return;}
    fixedExps.push({...data,desc:data.descripcion,amount:parseFloat(data.amount),lastApplied:data.last_applied});
    await aplicarGastosFijos();showToast('✓ Gasto fijo guardado');
    $('fx-desc').value='';$('fx-amount').value='';$('fx-day').value='';
    $('fixed-form-wrap').style.display='none';$('btn-toggle-fixed').innerHTML='＋ Añadir';
    renderAll();
  });

  // Presupuestos
  $('btn-add-budget').addEventListener('click',()=>{
    const wrap=$('budget-form-wrap'),open=wrap.style.display!=='none';
    wrap.style.display=open?'none':'block';
    if(!open) fillCatSelect('bud-cat','gasto');
  });
  $('btn-save-budget').addEventListener('click',async()=>{
    const cat=$('bud-cat').value, amount=parseFloat($('bud-amount').value);
    const mes=$('budget-mes').value||mesHoy(), errEl=$('budget-error');
    if(!cat){errEl.textContent='Elige una categoría.';return;}
    if(!amount||amount<=0){errEl.textContent='Importe inválido.';return;}
    errEl.textContent='';
    await sb.from('presupuestos').upsert({user_id:user.id,cat,amount,mes,moneda},{onConflict:'user_id,cat,mes'});
    const existing=presupuestos.findIndex(p=>p.cat===cat&&p.mes===mes);
    if(existing>=0) presupuestos[existing].amount=amount;
    else presupuestos.push({user_id:user.id,cat,amount,mes,moneda});
    showToast('✓ Presupuesto guardado');$('bud-amount').value='';
    $('budget-form-wrap').style.display='none';renderBudgets();
  });
  $('budget-mes').addEventListener('change',renderBudgets);
  $('resumen-mes').addEventListener('change',renderResumen);

  // Modal eliminar
  $('modal-confirm').addEventListener('click',async()=>{
    if(!delId) return;
    await deleteTransaction(delId);
    delId=null;$('modal-overlay').classList.remove('visible');
    if($('tab-calendar').classList.contains('active')&&calSelDay) showCalDetail(calSelDay);
  });
  $('modal-cancel').addEventListener('click',()=>{delId=null;$('modal-overlay').classList.remove('visible');});
  $('modal-overlay').addEventListener('click',e=>{if(e.target.id==='modal-overlay'){delId=null;$('modal-overlay').classList.remove('visible');}});

  // Modal foto
  $('photo-modal-close').addEventListener('click',()=>$('photo-modal').classList.remove('visible'));
  $('photo-modal').addEventListener('click',e=>{if(e.target.id==='photo-modal')$('photo-modal').classList.remove('visible');});

  // Calendario
  // Calendar navigation - use event delegation on document
  document.addEventListener('click', e=>{
    if(e.target.closest('#cal-prev')){
      calMonth--;if(calMonth<0){calMonth=11;calYear--;}calSelDay=null;renderCalendar();
    }
    if(e.target.closest('#cal-next')){
      calMonth++;if(calMonth>11){calMonth=0;calYear++;}calSelDay=null;renderCalendar();
    }
  });
  // cal-today removed in new design
  // cal-detail-close removed in new design

  // Perfil
  $('btn-save-profile').addEventListener('click',async()=>{
    const nombre=$('profile-name').value.trim(); if(!nombre) return;
    await updatePerfil({nombre});
    $('user-name-header').textContent=nombre;
    $('user-avatar').textContent=nombre[0].toUpperCase();
    $('profile-avatar').textContent=nombre[0].toUpperCase();
    showToast('✓ Perfil actualizado');
  });

  // Categorías
  $('cat-tab-ingreso').addEventListener('click',()=>{catTab='ingreso';$('cat-tab-ingreso').classList.add('active');$('cat-tab-gasto').classList.remove('active');renderCatList();});
  $('cat-tab-gasto').addEventListener('click',()=>{catTab='gasto';$('cat-tab-gasto').classList.add('active');$('cat-tab-ingreso').classList.remove('active');renderCatList();});
  $('btn-add-cat').addEventListener('click',async()=>{
    const emoji=$('cat-emoji').value.trim()||'📌', nombre=$('cat-name').value.trim(), errEl=$('cat-error');
    if(!nombre){errEl.textContent='Escribe un nombre.';return;}
    if(cats[catTab].some(c=>c.nombre.toLowerCase()===nombre.toLowerCase())){errEl.textContent='Ya existe.';return;}
    errEl.textContent='';
    const {data,error}=await sb.from('categorias').insert({user_id:user.id,type:catTab,nombre,emoji,orden:cats[catTab].length}).select().single();
    if(error){showToast('Error','error');return;}
    cats[catTab].push({nombre,emoji,id:data.id});showToast('✓ Categoría añadida');
    $('cat-emoji').value='';$('cat-name').value='';
    renderCatList();fillCatSelect('f-cat',tipo);fillCatSelect('fx-cat','gasto');
  });

  // Compartir
  $('btn-create-space-main').addEventListener('click',async()=>{
    const nombre=`Espacio de ${perfil?.nombre||user.email.split('@')[0]}`;
    const {data,error}=await sb.from('espacios').insert({owner_id:user.id,nombre}).select().single();
    if(error){showToast('Error','error');return;}
    espacioActual=data;
    await sb.from('espacio_miembros').insert({espacio_id:data.id,user_id:user.id,email:user.email,nombre:perfil?.nombre||user.email.split('@')[0],rol:'admin',estado:'activo'});
    await loadMiembros();showToast('✓ Espacio creado');renderEspacio();
  });
  $('btn-invite').addEventListener('click',async()=>{
    const email=$('invite-email').value.trim().toLowerCase(), errEl=$('invite-error');
    if(!email||!email.includes('@')){errEl.textContent='Email inválido.';return;}
    if(miembros.length>=5){errEl.textContent='Máximo 5 miembros.';return;}
    if(miembros.some(m=>m.email===email)){errEl.textContent='Ya es miembro.';return;}
    errEl.textContent='';
    const {error}=await sb.from('espacio_miembros').insert({espacio_id:espacioActual.id,email,invited_by:user.id,estado:'pendiente',rol:'miembro'});
    if(error){errEl.textContent='Error al invitar.';return;}
    await loadMiembros();showToast(`✓ Invitación enviada a ${email}`);
    $('invite-email').value='';renderEspacio();
  });
  $('btn-view-personal').addEventListener('click',()=>{
    $('btn-view-personal').classList.add('active');
    $('btn-view-shared').classList.remove('active');
    $('shared-summary').style.display='none';
  });
  $('btn-view-shared').addEventListener('click',async()=>{
    $('btn-view-shared').classList.add('active');
    $('btn-view-personal').classList.remove('active');
    if(!espacioActual){$('shared-summary').style.display='none';return;}
    const {data}=await sb.from('transacciones').select('*').eq('espacio_id',espacioActual.id).order('date',{ascending:false}).limit(50);
    txsCompartidas=(data||[]).map(t=>({...t,desc:t.descripcion,amount:parseFloat(t.amount)}));
    const ing=txsCompartidas.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
    const gas=txsCompartidas.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
    const bal=ing-gas;
    $('shared-metrics').innerHTML=`
      <div class="r-metric"><span class="r-metric-label">Ingresos</span><span class="r-metric-value g">${fmt(ing)}</span></div>
      <div class="r-metric"><span class="r-metric-label">Gastos</span><span class="r-metric-value r">${fmt(gas)}</span></div>
      <div class="r-metric"><span class="r-metric-label">Balance</span><span class="r-metric-value ${bal>=0?'p':'rr'}">${bal<0?'-':''}${fmt(bal)}</span></div>
      <div class="r-metric"><span class="r-metric-label">Movimientos</span><span class="r-metric-value">${txsCompartidas.length}</span></div>`;
    $('shared-tx-list').innerHTML=txsCompartidas.slice(0,20).map(tx=>`
      <div class="shared-tx-item">
        <div class="tx-icon ${tx.type}">${getEmoji(tx.cat)}</div>
        <div class="tx-info"><div class="tx-desc">${esc(tx.desc)}</div><span class="tx-pill cat">${esc(tx.cat)}</span></div>
        <span class="tx-date">${fmtFecha(tx.date)}</span>
        <span class="tx-amount ${tx.type}">${tx.type==='ingreso'?'+':'−'}${fmt(tx.amount)}</span>
      </div>`).join('');
    $('shared-summary').style.display='block';
  });

  // Tarjetas clicables
  setTimeout(()=>{
    const goMov=(filterType)=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      document.querySelector('[data-tab="movements"]').classList.add('active');
      $('tab-movements').classList.add('active');
      $('filter-month').value=mesHoy();
      $('filter-type').value=filterType;
      renderLista();window.scrollTo({top:0,behavior:'smooth'});icons();
    };
    const ci=document.querySelector('.card--income');
    const ce=document.querySelector('.card--expense');
    const cb=document.querySelector('.card--balance');
    if(ci){ci.style.cursor='pointer';ci.addEventListener('click',()=>goMov('ingreso'));}
    if(ce){ce.style.cursor='pointer';ce.addEventListener('click',()=>goMov('gasto'));}
    if(cb){cb.style.cursor='pointer';cb.addEventListener('click',()=>goMov('todos'));}
  },500);

  // FAB buttons
  setTimeout(()=>{
    const fabI=$('fab-income'), fabE=$('fab-expense');
    const goForm=(t)=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      document.querySelector('[data-tab="dashboard"]').classList.add('active');
      $('tab-dashboard').classList.add('active');
      setTipo(t);
      setTimeout(()=>{ $('tx-form').scrollIntoView({behavior:'smooth',block:'center'}); $('f-desc').focus(); },100);
      icons();
    };
    if(fabI) fabI.addEventListener('click',()=>goForm('ingreso'));
    if(fabE) fabE.addEventListener('click',()=>goForm('gasto'));
  },500);

  // CSV & PDF
  $('btn-export').addEventListener('click',exportCSV);
  $('btn-export2').addEventListener('click',exportCSV);
  const pdfH=$('btn-export-pdf');   if(pdfH)  pdfH.addEventListener('click',()=>exportPDF('todos'));
  const pdfR=$('btn-pdf-resumen');  if(pdfR)  pdfR.addEventListener('click',()=>exportPDF('resumen'));
  const pdfS=$('btn-export-pdf2'); if(pdfS) pdfS.addEventListener('click',()=>exportPDF('todos'));

  // SW
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  icons();
})();

/* ============================================================
   BALANCE ANUAL
============================================================ */
let chartAnual = null;

function fillYearSelect() {
  const sel = $('annual-year'); if(!sel) return;
  const years = [...new Set(txs.map(t=>t.date.slice(0,4)))].sort((a,b)=>b-a);
  const cur = new Date().getFullYear().toString();
  if(!years.includes(cur)) years.unshift(cur);
  const prev = sel.value;
  sel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
  if(prev && years.includes(prev)) sel.value = prev;
}

function renderAnual() {
  const year = $('annual-year')?.value || new Date().getFullYear().toString();
  const tYear = txs.filter(t=>t.date.startsWith(year));
  const ing   = tYear.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gas   = tYear.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  const bal   = ing-gas;
  const gasExtra = tYear.filter(t=>t.type==='gasto'&&!t.fixedId).reduce((s,t)=>s+t.amount,0);
  const gasFijo  = tYear.filter(t=>t.type==='gasto'&&t.fixedId).reduce((s,t)=>s+t.amount,0);

  // Métricas
  $('annual-metrics').innerHTML = `
    <div class="r-metric"><span class="r-metric-label">Ingresos ${year}</span><span class="r-metric-value g">${fmt(ing)}</span><span class="r-metric-sub">${tYear.filter(t=>t.type==='ingreso').length} movimientos</span></div>
    <div class="r-metric"><span class="r-metric-label">Gastos ${year}</span><span class="r-metric-value r">${fmt(gas)}</span><span class="r-metric-sub">${tYear.filter(t=>t.type==='gasto').length} movimientos</span></div>
    <div class="r-metric"><span class="r-metric-label">Balance ${year}</span><span class="r-metric-value ${bal>=0?'p':'rr'}">${bal<0?'-':''}${fmt(bal)}</span><span class="r-metric-sub">${bal>=0?'Positivo ✓':'Déficit ✗'}</span></div>
    <div class="r-metric"><span class="r-metric-label">Ahorro promedio</span><span class="r-metric-value p">${fmt(bal/12)}/mes</span><span class="r-metric-sub">promedio mensual</span></div>`;

  // Gráfica anual
  const MM = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const ingData = MM.map((_,i)=>{
    const m = `${year}-${String(i+1).padStart(2,'0')}`;
    return +txs.filter(t=>t.type==='ingreso'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0).toFixed(2);
  });
  const gasData = MM.map((_,i)=>{
    const m = `${year}-${String(i+1).padStart(2,'0')}`;
    return +txs.filter(t=>t.type==='gasto'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0).toFixed(2);
  });

  if(chartAnual){chartAnual.destroy();chartAnual=null;}
  const canvas=$('chart-annual');
  if(canvas){
    canvas.style.display='block';
    const tc=textColor();
    chartAnual=new Chart(canvas,{type:'bar',data:{labels:MM,datasets:[
      {label:'Ingresos',data:ingData,backgroundColor:'#00E5A0',borderRadius:4},
      {label:'Gastos',data:gasData,backgroundColor:'#FF4D6A',borderRadius:4}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},color:tc}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`}}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:tc}},y:{grid:{color:'rgba(128,128,128,.1)'},ticks:{font:{size:10},color:tc,callback:v=>fmt(v)}}}}});
  }

  // Fijos vs Variables
  $('annual-breakdown-content').innerHTML = `
    <div class="sim-detail-row"><span>Gastos fijos (recurrentes)</span><span class="sim-detail-val" style="color:var(--amber)">${fmt(gasFijo)}</span></div>
    <div class="sim-detail-row"><span>Gastos variables (extras)</span><span class="sim-detail-val" style="color:var(--red)">${fmt(gasExtra)}</span></div>
    <div class="sim-detail-row"><span>% que son extras</span><span class="sim-detail-val">${gas>0?(gasExtra/gas*100).toFixed(1):0}%</span></div>
    <div class="sim-detail-row"><span>Promedio gasto extra/mes</span><span class="sim-detail-val">${fmt(gasExtra/12)}</span></div>`;

  // Highlights
  const monthData = MM.map((name,i)=>{
    const m=`${year}-${String(i+1).padStart(2,'0')}`;
    const mIng=txs.filter(t=>t.type==='ingreso'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0);
    const mGas=txs.filter(t=>t.type==='gasto'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0);
    return {name,ing:mIng,gas:mGas,bal:mIng-mGas};
  }).filter(m=>m.ing>0||m.gas>0);

  if(monthData.length){
    const bestMonth  = monthData.reduce((a,b)=>b.bal>a.bal?b:a);
    const worstMonth = monthData.reduce((a,b)=>b.bal<a.bal?b:a);
    const maxGas     = Math.max(...monthData.map(m=>m.gas));

    $('annual-highlights-content').innerHTML = monthData.map(m=>`
      <div class="annual-month-row">
        <span class="annual-month-name">${m.name}</span>
        <div class="annual-month-bar-wrap">
          <div class="annual-month-bar-track">
            <div class="annual-month-bar-fill" style="width:${maxGas>0?(m.gas/maxGas*100).toFixed(1):0}%;background:${m.bal>=0?'#00E5A0':'#FF4D6A'}"></div>
          </div>
          <div class="annual-month-amounts">
            <span style="color:var(--green)">+${fmt(m.ing)}</span>
            <span style="color:var(--red)">-${fmt(m.gas)}</span>
            <span style="color:${m.bal>=0?'var(--accent)':'var(--red)'}">${m.bal>=0?'+':''}${fmt(m.bal)}</span>
          </div>
        </div>
        ${m.name===bestMonth.name?'<span class="annual-badge best">Mejor</span>':''}
        ${m.name===worstMonth.name&&worstMonth.bal<0?'<span class="annual-badge worst">Peor</span>':''}
      </div>`).join('');
  } else {
    $('annual-highlights-content').innerHTML='<p style="font-size:.82rem;color:var(--text3)">Sin datos para este año.</p>';
  }

  // Proyección gastos fijos
  const fxTotalMes = fixedExps.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);
  const projEl = $('fixed-annual-projection');
  if(projEl){
    if(!fixedExps.filter(f=>f.active).length){
      projEl.innerHTML='<p style="font-size:.82rem;color:var(--text3)">No tienes gastos fijos configurados.</p>';
    } else {
      const totalAnual = fxTotalMes*12;
      projEl.innerHTML = `
        <div class="fixed-proj-item" style="background:var(--accent-dim);border-color:rgba(124,107,255,.3);margin-bottom:.75rem">
          <div><div class="fixed-proj-name" style="color:var(--accent)">Total para vivir</div><div class="fixed-proj-month" style="color:var(--accent)">${fmt(fxTotalMes)}/mes</div></div>
          <div class="fixed-proj-vals"><div class="fixed-proj-year" style="color:var(--accent)">${fmt(totalAnual)}/año</div></div>
        </div>` +
        fixedExps.filter(f=>f.active).map(fx=>`
        <div class="fixed-proj-item">
          <div><div class="fixed-proj-name">${getEmoji(fx.cat)} ${esc(fx.desc)}</div><div class="fixed-proj-month">${fmt(fx.amount)}/mes</div></div>
          <div class="fixed-proj-vals"><div class="fixed-proj-year">${fmt(fx.amount*12)}/año</div></div>
        </div>`).join('');
    }
  }

  renderForecast();
  icons();
}

/* ============================================================
   PRONÓSTICO
============================================================ */
function renderForecast() {
  const foreEl = $('forecast-metrics'); if(!foreEl) return;

  // Promedio de los últimos 3 meses
  const meses3 = [];
  for(let i=1;i<=3;i++){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    meses3.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const avgIng = meses3.map(m=>txs.filter(t=>t.type==='ingreso'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0)).reduce((a,b)=>a+b,0)/3;
  const avgGas = meses3.map(m=>txs.filter(t=>t.type==='gasto'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0)).reduce((a,b)=>a+b,0)/3;
  const avgBal = avgIng-avgGas;
  const ahorro6  = avgBal*6;
  const ahorro12 = avgBal*12;

  foreEl.innerHTML = `
    <div class="r-metric"><span class="r-metric-label">Ingreso estimado</span><span class="r-metric-value g">${fmt(avgIng)}</span><span class="r-metric-sub">próximo mes</span></div>
    <div class="r-metric"><span class="r-metric-label">Gasto estimado</span><span class="r-metric-value r">${fmt(avgGas)}</span><span class="r-metric-sub">próximo mes</span></div>
    <div class="r-metric"><span class="r-metric-label">Ahorro en 6 meses</span><span class="r-metric-value ${ahorro6>=0?'p':'rr'}">${fmt(ahorro6)}</span><span class="r-metric-sub">si mantienes el ritmo</span></div>
    <div class="r-metric"><span class="r-metric-label">Ahorro en 1 año</span><span class="r-metric-value ${ahorro12>=0?'p':'rr'}">${fmt(ahorro12)}</span><span class="r-metric-sub">proyección anual</span></div>`;
}

/* ============================================================
   SIMULADOR DE DECISIONES
============================================================ */
function initSimulator() {
  const btn = $('btn-simulate'); if(!btn) return;
  btn.addEventListener('click',()=>{
    const op1Name = $('sim-op1-name').value.trim()||'Opción A';
    const op1Cost = parseFloat($('sim-op1-cost').value)||0;
    const op1Init = parseFloat($('sim-op1-init').value)||0;
    const op2Name = $('sim-op2-name').value.trim()||'Opción B';
    const op2Cost = parseFloat($('sim-op2-cost').value)||0;
    const op2Init = parseFloat($('sim-op2-init').value)||0;
    const months  = parseInt($('sim-months').value)||12;

    const total1 = op1Init + op1Cost*months;
    const total2 = op2Init + op2Cost*months;
    const diff   = Math.abs(total1-total2);
    const winner = total1<=total2 ? op1Name : op2Name;
    const loser  = total1<=total2 ? op2Name : op1Name;

    const res = $('sim-result');
    res.style.display='block';
    res.innerHTML=`
      <div class="sim-winner">
        <div class="sim-winner-label">Mejor opción en ${months} meses</div>
        <div class="sim-winner-name">✓ ${esc(winner)}</div>
        <div class="sim-winner-save">Ahorras ${fmt(diff)} vs ${esc(loser)}</div>
      </div>
      <div class="sim-detail-row"><span>${esc(op1Name)} — Total</span><span class="sim-detail-val">${fmt(total1)}</span></div>
      <div class="sim-detail-row"><span style="padding-left:1rem;font-size:.78rem;color:var(--text3)">Inicial: ${fmt(op1Init)} + ${fmt(op1Cost)}/mes × ${months}</span><span></span></div>
      <div class="sim-detail-row"><span>${esc(op2Name)} — Total</span><span class="sim-detail-val">${fmt(total2)}</span></div>
      <div class="sim-detail-row"><span style="padding-left:1rem;font-size:.78rem;color:var(--text3)">Inicial: ${fmt(op2Init)} + ${fmt(op2Cost)}/mes × ${months}</span><span></span></div>
      <div class="sim-detail-row"><span>Diferencia</span><span class="sim-detail-val" style="color:var(--green)">${fmt(diff)}</span></div>`;
  });
}


/* --- Análisis financiero local inteligente --- */
function analizarFinanzas(q, {ing, gas, bal, bycat, topCats, avgGas, fxTotal}) {
  const q2 = q.toLowerCase();
  const pct = ing>0?((bal/ing)*100).toFixed(1):0;
  const top = Object.entries(bycat).sort((a,b)=>b[1]-a[1]);
  const topCat = top[0];

  if(q2.includes('gasto') && (q2.includes('más')||q2.includes('mas')||q2.includes('mayor'))) {
    if(!topCat) return '📊 Aún no tienes gastos registrados. ¡Empieza añadiendo tus primeros movimientos!';
    const pctTop = gas>0?(topCat[1]/gas*100).toFixed(1):0;
    return `📊 Tu mayor gasto es <strong>${topCat[0]}</strong> con <strong>${fmt(topCat[1])}</strong>, que representa el ${pctTop}% de tus gastos totales.<br><br>${+pctTop>40?'⚠️ Esa categoría consume una parte importante de tu presupuesto. Considera si puedes reducirla.':'✅ La distribución parece razonable. Sigue así.'}`;
  }
  if(q2.includes('ahorro') || q2.includes('ahorra')) {
    if(!ing) return '💡 Añade tus ingresos para que pueda calcular tu tasa de ahorro.';
    return `💰 Actualmente tienes un balance de <strong>${fmt(bal)}</strong>.<br><br>Tu tasa de ahorro es del <strong>${pct}%</strong> ${+pct>=20?'🌟 ¡Excelente! Estás por encima del 20% recomendado.':+pct>0?'💛 Intenta llegar al 20% reduciendo gastos variables.':'🚨 Estás gastando más de lo que ingresas. Revisa tus gastos urgentemente.'}<br><br>Promedio mensual de gasto: <strong>${fmt(avgGas)}</strong>.`;
  }
  if(q2.includes('pronóstico')||q2.includes('pronostico')||q2.includes('próximo')||q2.includes('siguiente')) {
    if(!ing) return '💡 Necesitas registrar al menos 1 mes de datos para generar un pronóstico.';
    const proj12 = bal*12;
    return `🔮 Basado en tu historial:<br><br>• Ingreso estimado próximo mes: <strong>${fmt(ing/Math.max(new Set(txs.map(t=>t.date.slice(0,7))).size,1))}</strong><br>• Gasto estimado próximo mes: <strong>${fmt(avgGas)}</strong><br>• Ahorro proyectado en 1 año: <strong style="color:${proj12>=0?'var(--green)':'var(--red)'}">${fmt(proj12)}</strong><br><br>${proj12>=0?'✅ Vas por buen camino. Mantén el ritmo.':'⚠️ Si sigues a este ritmo, tendrás un déficit. Considera reducir gastos.'}`;
  }
  if(q2.includes('recomend')||q2.includes('consejo')||q2.includes('mejor')) {
    const recs = [];
    if(+pct<20&&ing>0) recs.push(`💛 Tu tasa de ahorro es ${pct}%. Intenta llegar al 20% reduciendo gastos en <strong>${topCat?.[0]||'la categoría más cara'}</strong>.`);
    if(fxTotal>ing*0.5&&ing>0) recs.push(`🏠 Tus gastos fijos (<strong>${fmt(fxTotal)}/mes</strong>) superan el 50% de tus ingresos. Evalúa si puedes reducir alguno.`);
    if(topCat&&gas>0&&topCat[1]/gas>0.5) recs.push(`📌 <strong>${topCat[0]}</strong> es el 50%+ de tus gastos. Diversifica o reduce en esta categoría.`);
    if(bal>=0) recs.push(`✅ Tu balance es positivo (<strong>${fmt(bal)}</strong>). Considera invertir parte del ahorro.`);
    if(!recs.length) recs.push('✅ Tus finanzas parecen estar en buen estado. ¡Sigue registrando todos tus movimientos para mejores análisis!');
    return recs.join('<br><br>');
  }
  if(q2.includes('fijo')||q2.includes('recurrente')) {
    if(!fxTotal) return '💡 No tienes gastos fijos configurados. Ve a la pestaña Inicio y añade tus gastos recurrentes (alquiler, suscripciones, etc.)';
    return `🔁 Tus gastos fijos mensuales son <strong>${fmt(fxTotal)}</strong>, lo que equivale a <strong>${fmt(fxTotal*12)}</strong> al año.<br><br>${ing>0?`Representan el <strong>${(fxTotal/ing*100).toFixed(1)}%</strong> de tus ingresos.${fxTotal/ing>0.5?' ⚠️ Es un porcentaje alto. Revisa si puedes eliminar alguno.':' ✅ Porcentaje razonable.'}`:''}`; 
  }
  if(q2.includes('balance')||q2.includes('situación')||q2.includes('situacion')||q2.includes('estado')) {
    return `📊 <strong>Tu situación financiera actual:</strong><br><br>• Ingresos totales: <strong style="color:var(--green)">${fmt(ing)}</strong><br>• Gastos totales: <strong style="color:var(--red)">${fmt(gas)}</strong><br>• Balance: <strong style="color:${bal>=0?'var(--accent)':'var(--red)'}">${fmt(bal)}</strong><br>• Tasa de ahorro: <strong>${pct}%</strong><br>• Gastos fijos/mes: <strong>${fmt(fxTotal)}</strong><br><br>${+pct>=20?'🌟 ¡Excelente situación financiera!':+pct>0?'💛 Situación estable, pero puedes mejorar tu ahorro.':'🚨 Situación de déficit. Necesitas reducir gastos urgentemente.'}`;
  }
  // Default
  return `🤔 Puedo ayudarte con:<br><br>• <strong>¿En qué gasto más?</strong> — análisis por categoría<br>• <strong>¿Cuánto ahorro?</strong> — tasa de ahorro<br>• <strong>Pronóstico</strong> — proyección del próximo mes<br>• <strong>Recomendaciones</strong> — consejos personalizados<br>• <strong>¿Cuáles son mis gastos fijos?</strong> — proyección anual<br>• <strong>¿Cuál es mi balance?</strong> — situación general<br><br>¡Pregúntame cualquiera de estas!`;
}

/* ============================================================
   ASISTENTE IA
============================================================ */
async function askAI(question) {
  const input = $('ai-input');
  const msgs  = $('ai-messages');
  if(!msgs) return;

  const q = question || (input?.value.trim());
  if(!q) return;
  if(input) input.value='';

  // Mensaje del usuario
  msgs.innerHTML += `
    <div class="ai-msg ai-msg--user">
      <div class="ai-bubble">${esc(q)}</div>
      <div class="ai-avatar user">Yo</div>
    </div>`;

  // Loading
  const loadId = 'ai-load-'+Date.now();
  msgs.innerHTML += `<div class="ai-msg" id="${loadId}"><div class="ai-avatar">K</div><div class="ai-bubble loading">Analizando tus datos...</div></div>`;
  msgs.scrollTop = msgs.scrollHeight;

  // Contexto financiero del usuario
  const ing   = txs.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gas   = txs.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  const bal   = ing-gas;
  const bycat = {};
  txs.filter(t=>t.type==='gasto').forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.amount;});
  const topCats = Object.entries(bycat).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([c,a])=>`${c}: ${fmt(a)}`).join(', ');
  const meses3  = [];
  for(let i=1;i<=3;i++){const d=new Date();d.setMonth(d.getMonth()-i);meses3.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
  const avgGas = meses3.map(m=>txs.filter(t=>t.type==='gasto'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0)).reduce((a,b)=>a+b,0)/3;
  const fxTotal = fixedExps.filter(f=>f.active).reduce((s,f)=>s+f.amount,0);

  const contexto = `Datos financieros del usuario:
- Ingresos totales: ${fmt(ing)}
- Gastos totales: ${fmt(gas)}
- Balance: ${fmt(bal)}
- Top categorías de gasto: ${topCats||'Sin datos'}
- Gasto promedio últimos 3 meses: ${fmt(avgGas)}/mes
- Gastos fijos mensuales: ${fmt(fxTotal)}/mes
- Moneda: ${moneda}`;

  try {
    const reply = analizarFinanzas(q, {ing, gas, bal, bycat, topCats, avgGas, fxTotal});
    const loadEl = $(loadId);
    if(loadEl) loadEl.querySelector('.ai-bubble').innerHTML = reply.replace(/\n/g,'<br>');
  } catch(e) {
    const loadEl=$(loadId);
    if(loadEl) loadEl.querySelector('.ai-bubble').innerHTML='No pude analizar tus datos. Intenta de nuevo.';
  }
  msgs.scrollTop=msgs.scrollHeight;
}

/* ============================================================
   AÑADIR DESDE CALENDARIO
============================================================ */
function initCalendarAdd() {
  const btn = $('btn-add-from-cal'); if(!btn) return;
  let calTipo = 'ingreso';

  btn.addEventListener('click',()=>{
    if(!calSelDay) return;
    const form = $('cal-mini-form');
    const isOpen = form.style.display !== 'none';
    form.style.display = isOpen ? 'none' : 'block';
    btn.textContent = isOpen ? '＋ Añadir' : '✕ Cancelar';
    if(!isOpen){
      fillCatSelect('cal-f-cat', calTipo);
      const dateEl = $('cal-form-date');
      if(dateEl) dateEl.textContent = fmtFecha(calSelDay);
      const symEl = $('cal-amount-symbol');
      if(symEl) symEl.textContent = moneda==='USD'?'$':'€';
      $('cal-f-desc').focus();
    }
  });

  // Toggle tipo en mini form
  $('cal-btn-ingreso').addEventListener('click',()=>{
    calTipo='ingreso';
    $('cal-btn-ingreso').classList.add('active');
    $('cal-btn-gasto').classList.remove('active');
    fillCatSelect('cal-f-cat','ingreso');
  });
  $('cal-btn-gasto').addEventListener('click',()=>{
    calTipo='gasto';
    $('cal-btn-gasto').classList.add('active');
    $('cal-btn-ingreso').classList.remove('active');
    fillCatSelect('cal-f-cat','gasto');
  });

  // Submit mini form
  $('btn-cal-submit').addEventListener('click', async()=>{
    const desc   = $('cal-f-desc').value.trim();
    const amount = parseFloat($('cal-f-amount').value);
    const cat    = $('cal-f-cat').value;
    const errEl  = $('cal-form-error');
    if(!desc)         { errEl.textContent='Escribe una descripción.'; return; }
    if(!amount||amount<=0){ errEl.textContent='Importe inválido.'; return; }
    errEl.textContent='';
    await addTransaction({type:calTipo, desc, amount, cat, date:calSelDay});
    // Reset form
    $('cal-f-desc').value='';
    $('cal-f-amount').value='';
    $('cal-mini-form').style.display='none';
    $('btn-add-from-cal').textContent='＋ Añadir';
    // Refresh calendar detail
    showCalDetail(calSelDay);
    renderCalendar();
  });
}

/* ============================================================
   INIT ANUAL + SIMULADOR + IA
============================================================ */
(function initAnnual(){
  const tryInit = setInterval(()=>{
    const yearSel = $('annual-year');
    const aiSend  = $('btn-ai-send');
    const aiInput = $('ai-input');
    if(!yearSel) return;
    clearInterval(tryInit);

    // Año selector
    fillYearSelect();
    yearSel.addEventListener('change', renderAnual);

    // AI
    if(aiSend) aiSend.addEventListener('click',()=>askAI());
    if(aiInput) aiInput.addEventListener('keydown',e=>{ if(e.key==='Enter') askAI(); });

    // Simulador
    initSimulator();

    // Calendario add
    initCalendarAdd();

  }, 400);
})();

/* ============================================================
   NUEVO CALENDARIO — eventos de vista y FABs
============================================================ */
(function initNewCalendar(){
  const tryInit = setInterval(()=>{
    const vIncome  = $('cal-view-income');
    const fabInc   = $('cal-fab-income');
    const fabExp   = $('cal-fab-expense');
    const fabSet   = $('cal-fab-settings');
    const miniClose= $('cal-mini-close');
    if(!vIncome) return;
    clearInterval(tryInit);

    // View tabs
    ['cal-view-income','cal-view-balance','cal-view-expense'].forEach(id=>{
      const btn=$(id); if(!btn) return;
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.cal-view-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        calView = btn.dataset.view;
        renderCalCats();
      });
    });

    // FAB income
    if(fabInc) fabInc.addEventListener('click',()=>{
      const form=$('cal-mini-form');
      form.style.display='block';
      $('cal-btn-ingreso').classList.add('active');
      $('cal-btn-gasto').classList.remove('active');
      fillCatSelect('cal-f-cat','ingreso');
      const sym=$('cal-amount-symbol'); if(sym) sym.textContent=moneda==='USD'?'$':'€';
      const dateTitle=$('cal-form-date-title');
      if(dateTitle) dateTitle.textContent=`Añadir ingreso — ${fmtFecha(calSelDay||hoy())}`;
      form.scrollIntoView({behavior:'smooth'});
      $('cal-f-desc').focus();
    });

    // FAB expense
    if(fabExp) fabExp.addEventListener('click',()=>{
      const form=$('cal-mini-form');
      form.style.display='block';
      $('cal-btn-gasto').classList.add('active');
      $('cal-btn-ingreso').classList.remove('active');
      fillCatSelect('cal-f-cat','gasto');
      const sym=$('cal-amount-symbol'); if(sym) sym.textContent=moneda==='USD'?'$':'€';
      const dateTitle=$('cal-form-date-title');
      if(dateTitle) dateTitle.textContent=`Añadir gasto — ${fmtFecha(calSelDay||hoy())}`;
      form.scrollIntoView({behavior:'smooth'});
      $('cal-f-desc').focus();
    });

    // FAB settings → go to settings tab
    if(fabSet) fabSet.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      document.querySelector('[data-tab="settings"]').classList.add('active');
      $('tab-settings').classList.add('active');
      renderCatList(); icons();
    });

    // Close mini form
    if(miniClose) miniClose.addEventListener('click',()=>{
      $('cal-mini-form').style.display='none';
    });

  }, 300);
})();
