import { SENSOR_TYPES, ENTITY_TYPES, STATUS_LABELS, getSnapshot, updateObservation, startLive, resetLive, isLive, ingestThreat, recordLaunch } from './data.js';
import { connectBackendFeed } from './backend-feed.js';
import { createFeedLayer } from './monitor-feed-layer.js';
import { createLocalMap } from './cesium-map.js';
import { setupMonitorOverlays } from './monitor-overlays.js';
import { defaultMapConfig } from './map-config.js';
import { setupPlaceSearch } from './place-search.js';

const paths = {
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7"/><circle cx="12" cy="12" r="1"/>',
  history: '<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l4 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 17l9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  filter: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="17" r="2" fill="currentColor"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  sort: '<path d="M4 5h14M4 10h10M4 15h6M19 12v8m-3-3 3 3 3-3"/>',
  link: '<path d="m9 14 6-6M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0" transform="translate(0 0) scale(.95)"/>',
  expand: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  focus: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="4"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>', 'arrow-right': '<path d="M4 12h16m-5-5 5 5-5 5"/>',
  archive: '<path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6"/>',
  check: '<path d="m5 12 4 4L20 5"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  uas: '<path d="m7 7 10 10M17 7 7 17M9 9h6v6H9z"/><circle cx="5" cy="5" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>',
  person: '<circle cx="12" cy="5" r="3"/><path d="M12 8v7m-6-5 6 2 6-2M12 15l-4 7m4-7 4 7"/>',
  ugv: '<path d="M4 9h16v9H4zM8 9V5h8v4M2 13h2m16 0h2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>',
  usv: '<path d="m3 13 9-4 9 4-4 7H7zM8 11V6h8v5M12 6V2M2 22l5-2 5 2 5-2 5 2"/>',
  unknown: '<path d="m12 2 10 10-10 10L2 12zM10 9a2 2 0 0 1 4 0c0 1.5-2 1.5-2 3M12 16h.01"/>',
  acoustic: '<path d="M4 9v6M8 5v14M12 2v20M16 6v12M20 9v6"/>',
  rf: '<path d="M5 7a10 10 0 0 1 14 0M8 10a6 6 0 0 1 8 0M10 13a3 3 0 0 1 4 0M12 17v4"/><circle cx="12" cy="16" r="1"/>',
  eoir: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5M12 17h.01"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.help}</svg>`;
const $ = (id) => document.getElementById(id);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = (value) => new Intl.DateTimeFormat('ro-RO', { timeZone:'Europe/Bucharest',hour:'2-digit',minute:'2-digit' }).format(new Date(value));
const clock = (value) => new Intl.DateTimeFormat('ro-RO', { timeZone:'Europe/Bucharest',hour:'2-digit',minute:'2-digit',second:'2-digit' }).format(new Date(value));
const state = { snapshot:null, selected:'OBS-024', selectionType:'observation', role:'operator',view:'map',statusFilter:'active',types:new Set(Object.keys(ENTITY_TYPES)),query:'',eventFilter:'all',feed:{configured:false,connected:false,authenticated:false,username:null} };
let map, overlays, feed, feedLayer, toastTimeout, mutationPending=false, closeTarget=null, launchTarget=null, sourcePending=false;

document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));

function toast(message,error=false){clearTimeout(toastTimeout);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimeout=setTimeout(()=>$('toast').hidden=true,4500);}
function statusChip(status){return `<span class="status-chip status-${escape(status)}">${escape(STATUS_LABELS[status])}</span>`;}
function glyph(type){return `<span class="entity-glyph" style="--entity-color:${ENTITY_TYPES[type].color}">${icon(type)}</span>`;}
function visibleObservations(){return state.snapshot.observations.filter(o=>(state.statusFilter==='all'||(state.statusFilter==='closed'?o.status==='closed':o.status!=='closed'))&&state.types.has(o.type)&&`${o.id} ${o.name} ${o.zone} ${ENTITY_TYPES[o.type].label} ${o.threatType||''} ${o.droneType||''}`.toLocaleLowerCase('ro').includes(state.query.toLocaleLowerCase('ro')));}
function renderList(){
  const items=visibleObservations();
  $('observation-count').textContent=String(items.length).padStart(2,'0');
  $('active-count').textContent=state.snapshot.observations.filter(o=>o.status!=='closed').length;
  $('observation-list').innerHTML=items.length?items.map(o=>`<button class="observation-card ${state.selected===o.id&&state.selectionType==='observation'?'selected':''}" data-observation="${escape(o.id)}" aria-pressed="${state.selected===o.id&&state.selectionType==='observation'}"><div class="observation-card-top">${glyph(o.type)}<span class="observation-identity"><strong>${escape(o.live?o.threatType:ENTITY_TYPES[o.type].label)}</strong><small>${escape(o.id)}${o.live&&o.droneType?` · ${escape(o.droneType)}`:''}</small></span><span class="card-time">${time(o.lastSeen)}</span></div><div class="card-bottom">${statusChip(o.status)}<span class="card-zone">${escape(o.zone)}</span></div></button>`).join(''):isLive()&&!state.snapshot.observations.length?`<div class="empty-state">${icon('radar')}${state.feed.connected?'Nicio amenințare primită de la server.':'Aștept conexiunea cu serverul C2.'}</div>`:`<div class="empty-state">${icon('search')}Nicio observație pentru filtrele selectate.<br><button class="text-button" data-reset-filters>Resetează filtrele</button></div>`;
}
function renderDetails(){
  if(state.selectionType==='sensor'){renderSensorDetail();return;}
  const o=state.snapshot.observations.find(o=>o.id===state.selected);
  if(!o){$('details-panel').innerHTML='<div class="empty-state">Selectează o observație pentru detalii.</div>';return;}
  if(o.live){renderThreatDetail(o);return;}
  const sources=o.sensorIds.map(id=>state.snapshot.sensors.find(s=>s.id===id)).filter(Boolean);
  const events=state.snapshot.events.filter(e=>e.observationId===o.id).slice(0,1);
  $('details-panel').innerHTML=`<div class="detail-heading"><span>DETALII OBSERVAȚIE</span><code>${escape(o.id)}</code></div><div class="detail-body"><div class="detail-identity">${glyph(o.type)}<div><h2>${escape(ENTITY_TYPES[o.type].label)}</h2>${statusChip(o.status)}</div></div><p class="detail-description">${escape(o.description)}</p><div class="confidence-box"><div class="confidence-head"><span>Încredere în clasificare</span><strong>${o.confidence}<small style="display:inline;font-size:10px">%</small></strong></div><div class="confidence-track"><span style="width:${o.confidence}%"></span></div><small>VALOARE SIMULATĂ · NECALIBRATĂ</small></div><div class="detail-section"><h3 class="section-label">CONTEXT</h3><dl class="detail-grid"><div><dt>Zonă demonstrativă</dt><dd>${escape(o.zone)}</dd></div><div><dt>Prima observație</dt><dd><code>${time(o.firstSeen)} EEST</code></dd></div><div><dt>Ultima observație</dt><dd><code>${time(o.lastSeen)} EEST</code></dd></div><div><dt>Poziție geografică</dt><dd>Nefurnizată</dd></div></dl></div><div class="detail-section"><h3 class="section-label">SURSE ASOCIATE <span class="count-badge">${sources.length}</span></h3>${sources.map(s=>`<div class="source-row" style="--sensor-color:${SENSOR_TYPES[s.type].color}"><span class="sensor-dot"></span><div><strong>${escape(s.name)}</strong><small>${escape(s.vendor)}</small></div><button class="icon-button" data-sensor="${s.id}" aria-label="Detalii ${escape(s.name)}">${icon('arrow-right')}</button></div>`).join('')}</div>${events.length?`<div class="detail-section"><h3 class="section-label">ULTIMUL EVENIMENT</h3><div class="mini-timeline">${events.map(e=>`<div class="mini-event"><strong>${escape(e.title)}</strong><small>${time(e.time)} · DEMO</small></div>`).join('')}</div></div>`:''}</div>${evaluationActions(o,'Evaluare demonstrativă a observației. Nu transmite comenzi către dispozitive.')}`;
}
function evaluationActions(o,note){return `<div class="detail-actions">${state.role==='watcher'?`<div class="readonly-note">${icon('lock')}<span>Mod watcher<br>${o.live?'Acces doar pentru vizualizare.':'Acces demonstrativ doar pentru vizualizare.'}</span></div>`:`<p>${note}</p>${o.status==='closed'?`<button class="button button-primary" data-action="review">${icon('history')}Redeschide verificarea</button>`:`<button class="button button-primary" data-action="${o.status==='new'?'review':'confirmed'}" ${o.status==='confirmed'?'disabled':''}>${icon(o.status==='new'?'search':'check')}${o.status==='new'?'Începe verificarea':o.status==='confirmed'?'Evaluare confirmată':'Confirmă evaluarea'}</button><div class="secondary-actions"><button class="button button-secondary" data-open-close>${icon('archive')}Închide observația</button></div>`}`}</div>`;}
function renderThreatDetail(o){
  const f=state.feed;
  const blocked=state.role!=='operator'?'Rolul Watcher nu poate trimite comenzi.':!f.connected?'Serverul C2 nu este conectat.':!f.authenticated?'Autentifică-te pentru a trimite comenzi.':o.status==='closed'?'Observația este închisă.':'';
  $('details-panel').innerHTML=`<div class="detail-heading"><span>DETALII AMENINȚARE</span><code>${escape(o.id)}</code></div><div class="detail-body"><div class="detail-identity">${glyph(o.type)}<div><h2>${escape(o.threatType)}</h2>${statusChip(o.status)}</div></div>
<div class="detail-section"><h3 class="section-label">DETECȚIE</h3><dl class="detail-grid"><div><dt>Tip dronă</dt><dd>${escape(o.droneType||'Nespecificat')}</dd></div><div><dt>Primită la</dt><dd><code>${clock(o.firstSeen)}</code></dd></div><div><dt>Senzor</dt><dd>${escape(o.sensorType||'Nespecificat')}</dd></div><div><dt>Poziția senzorului</dt><dd><code>${escape(o.zone)}</code></dd></div></dl><button class="button button-secondary full-width" data-fly>${icon('focus')}Arată senzorul pe hartă</button><p class="detail-note">Serverul trimite poziția senzorului, nu a țintei. Ora este cea a primirii mesajului.</p></div>
<div class="detail-section"><h3 class="section-label">INTERCEPTOARE PROPUSE DE SERVER <span class="count-badge">${o.interceptors.length}</span></h3>${o.interceptors.length?o.interceptors.map((name,index)=>`<div class="source-row interceptor-row"><span class="interceptor-rank">${index+1}</span><div><strong>${escape(name)}</strong></div><button class="button button-secondary" data-launch="${index}" ${blocked?'disabled':''}>Lansează…</button></div>`).join(''):'<p class="detail-note">Serverul nu a propus niciun interceptor.</p>'}${blocked&&o.interceptors.length?`<p class="detail-note">${blocked}</p>`:''}${o.launches.length?`<div class="mini-timeline">${o.launches.map(l=>`<div class="mini-event"><strong>Comandă trimisă · ${escape(l.interceptor)}</strong><small>${clock(l.sentAt)} · executarea nu este confirmată de interfață</small></div>`).join('')}</div>`:''}</div></div>${evaluationActions(o,'Evaluare locală a observației; nu este trimisă serverului.')}`;
}
function renderSensorDetail(){
  const s=state.snapshot.sensors.find(s=>s.id===state.selected);
  if(!s)return;
  const type=SENSOR_TYPES[s.type];
  $('details-panel').innerHTML=`<div class="detail-heading"><span>DETALII SENZOR</span><code>${s.id}</code></div><div class="detail-body"><div class="detail-identity"><span class="entity-glyph" style="--entity-color:${type.color}">${icon(s.type)}</span><div><h2>${escape(s.name)}</h2><span class="status-chip ${s.status==='online'?'status-confirmed':'status-new'}">${s.live?'A raportat detecții':s.status==='online'?'Online · demo':'Offline · demo'}</span></div></div><p class="detail-description">${escape(s.description)}</p><div class="detail-section"><h3 class="section-label">INFORMAȚII</h3><dl class="detail-grid"><div><dt>Tip</dt><dd>${type.label}</dd></div><div><dt>${s.live?'Sursă':'Furnizor'}</dt><dd>${escape(s.vendor)}</dd></div><div><dt>${s.live?'Ultima detecție':'Ultima stare'}</dt><dd>${time(s.lastSeen)} EEST</dd></div><div><dt>Poziție geografică</dt><dd>${s.live?`<code>${s.position.latitude.toFixed(4)}, ${s.position.longitude.toFixed(4)}</code>`:'Nefurnizată'}</dd></div></dl>${s.live?`<button class="button button-secondary full-width" data-fly>${icon('focus')}Arată pe hartă</button>`:''}</div></div><div class="detail-actions"><p>${s.live?'Senzor cunoscut numai din mesajele de amenințare ale serverului C2.':'Dispozitiv demonstrativ. Nu există o conexiune reală la senzor.'}</p><button class="button button-secondary full-width" data-open-sensors>Vezi toți senzorii ${icon('arrow-right')}</button></div>`;
}
function renderSensors(){
  const sensors=state.snapshot.sensors, online=sensors.filter(s=>s.status==='online').length;
  $('sensors-view').innerHTML=`<div class="view-intro"><div><h2>Inventar senzori</h2><p>${isLive()?'Senzorii care au raportat amenințări prin serverul C2.':'O interfață comună, indiferent de tehnologie sau furnizor. Stările afișate sunt simulate.'}</p></div><div class="view-stats"><div><strong>${online}<span>${isLive()?'au raportat detecții':'online în demo'}</span></strong></div>${isLive()?'':`<div><strong>${sensors.length-online}<span>offline în demo</span></strong></div>`}</div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>SENZOR</th><th>TIP</th><th>FURNIZOR</th><th>${isLive()?'STARE':'STARE DEMO'}</th><th>ULTIMA STARE</th><th></th></tr></thead><tbody>${sensors.map(s=>`<tr><td><div class="sensor-name"><span class="entity-glyph" style="--entity-color:${SENSOR_TYPES[s.type].color}">${icon(s.type)}</span><span>${escape(s.name)}<small>${s.id}</small></span></div></td><td>${SENSOR_TYPES[s.type].label}</td><td class="muted">${escape(s.vendor)}</td><td><span class="sensor-state"><i class="status-dot ${s.status==='online'?'green':'amber'}"></i>${s.status==='online'?'Online':'Offline'}</span></td><td class="muted">${time(s.lastSeen)} EEST</td><td><button class="text-button" data-sensor="${s.id}">Detalii ${icon('arrow-right')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function renderActivity(){
  const events=state.snapshot.events.filter(e=>state.eventFilter==='all'||e.kind===state.eventFilter);
  $('activity-view').innerHTML=`<div class="view-intro"><div><h2>Jurnal de activitate</h2><p>${isLive()?'Mesaje de la serverul C2, evaluări locale și comenzi trimise · ora României':'Evenimente și evaluări demonstrative · 9 octombrie 2026 · EEST'}</p></div><select id="event-filter" class="event-filter" aria-label="Filtrează jurnalul"><option value="all">Toate evenimentele</option><option value="info">Informații</option><option value="warning">Atenționări</option><option value="success">Evaluări</option></select></div>${events.map(e=>`<div class="event-row"><div class="event-time">${time(e.time)}</div><div class="event-icon ${e.kind}">${icon(e.kind==='warning'?'warning':e.kind==='success'?'check':'history')}</div><div class="event-content"><strong>${escape(e.title)}</strong><p>${escape(e.description)}</p></div>${e.observationId?`<button class="text-button" data-observation="${escape(e.observationId)}">${escape(e.observationId)} ${icon('arrow-right')}</button>`:''}</div>`).join('')||'<div class="empty-state">Nu există evenimente pentru acest filtru.</div>'}`;
  $('event-filter').value=state.eventFilter;
  $('event-filter').addEventListener('change',e=>{state.eventFilter=e.target.value;renderActivity();});
}
function render(){renderList();renderDetails();renderSensors();renderActivity();}
function setView(view){
  if(!['map','sensors','activity'].includes(view))return;
  state.view=view;
  $('monitor-layout').hidden=view!=='map';$('sensors-view').hidden=view!=='sensors';$('activity-view').hidden=view!=='activity';
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const titles={map:'Tablou de monitorizare',sensors:'Rețeaua de senzori',activity:'Jurnal de activitate'};
  $('page-title').innerHTML=`${titles[view]}<span class="heading-dot"></span>`;
  $('page-description').textContent={map:'O imagine comună. Toți senzorii, într-un singur loc.',sensors:'Starea și sursele datelor, într-un format comun.',activity:'Context pentru fiecare observație și evaluare.'}[view];
  if(view==='map')requestAnimationFrame(()=>map?.resize());
}
function selectObservation(id){state.selected=id;state.selectionType='observation';setView('map');renderList();renderDetails();}
function resetFilters(){state.query='';state.types=new Set(Object.keys(ENTITY_TYPES));state.statusFilter='active';$('search-input').value='';document.querySelectorAll('#type-filters input').forEach(i=>i.checked=true);syncFilterTabs();renderList();}
function syncFilterTabs(){document.querySelectorAll('[data-status-filter]').forEach(b=>{const selected=b.dataset.statusFilter===state.statusFilter;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});}
async function changeStatus(id,status,reason=''){
  if(mutationPending)return false;
  mutationPending=true;
  document.querySelectorAll('[data-action],[data-open-close]').forEach(b=>b.disabled=true);
  try{await updateObservation(id,status,{role:state.role,reason});state.snapshot=await getSnapshot();render();toast(`Evaluare actualizată: ${STATUS_LABELS[status].toLocaleLowerCase('ro')}.`);return true;}
  catch(error){toast(error.message,true);return false;}
  finally{mutationPending=false;renderDetails();}
}

document.addEventListener('click',e=>{
  const observation=e.target.closest('[data-observation]');if(observation){selectObservation(observation.dataset.observation);return;}
  const sensor=e.target.closest('[data-sensor]');if(sensor){state.selected=sensor.dataset.sensor;state.selectionType='sensor';setView('map');renderList();renderDetails();return;}
  const view=e.target.closest('[data-view]');if(view){setView(view.dataset.view);return;}
  const filter=e.target.closest('[data-status-filter]');if(filter){state.statusFilter=filter.dataset.statusFilter;syncFilterTabs();renderList();return;}
  const action=e.target.closest('[data-action]');if(action){changeStatus(state.selected,action.dataset.action);return;}
  if(e.target.closest('[data-open-close]')){closeTarget=state.selected;$('close-reason').value='';$('close-dialog').showModal();return;}
  if(e.target.closest('[data-fly]')){const item=state.selectionType==='sensor'?state.snapshot.sensors.find(x=>x.id===state.selected):state.snapshot.observations.find(x=>x.id===state.selected);if(item?.position)map?.flyToPlace({lon:item.position.longitude,lat:item.position.latitude,height:2500});return;}
  const launch=e.target.closest('[data-launch]');if(launch){openLaunch(Number(launch.dataset.launch));return;}
  if(e.target.closest('[data-open-sensors]'))setView('sensors');
  if(e.target.closest('[data-reset-filters]'))resetFilters();
});
$('type-filters').innerHTML=Object.entries(ENTITY_TYPES).map(([type,v])=>`<label><input type="checkbox" value="${type}" checked>${v.label}</label>`).join('');
$('type-filters').addEventListener('change',e=>{if(e.target.checked)state.types.add(e.target.value);else state.types.delete(e.target.value);renderList();});
$('clear-filters').addEventListener('click',resetFilters);
$('filter-button').addEventListener('click',()=>{$('filter-menu').hidden=!$('filter-menu').hidden;$('filter-button').setAttribute('aria-expanded',String(!$('filter-menu').hidden));});
$('search-input').addEventListener('input',e=>{state.query=e.target.value;renderList();});
$('role-select').addEventListener('change',e=>{state.role=e.target.value;$('role-avatar').textContent=state.role==='operator'?'OP':'WA';$('session-role').textContent=`SESIUNE ${state.role==='operator'?'OPERATOR':'WATCHER'}${isLive()?'':' DEMO'}`;$('close-dialog').close();renderDetails();toast(state.role==='watcher'?'Mod watcher: vizualizare și filtrare.':isLive()?'Mod operator activ.':'Mod operator demonstrativ activ.');});
$('close-form').addEventListener('submit',async e=>{e.preventDefault();if(!closeTarget)return;const ok=await changeStatus(closeTarget,'closed',$('close-reason').value);if(ok)$('close-dialog').close();});
$('cancel-close').addEventListener('click',()=>$('close-dialog').close());
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
$('map-info-button').addEventListener('click',()=>$('help-dialog').showModal());
$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('view-activity').addEventListener('click',()=>setView('activity'));
$('map-expand').addEventListener('click',()=>{const expanded=$('workspace').classList.toggle('map-expanded');$('map-expand').setAttribute('aria-pressed',String(expanded));$('map-expand').setAttribute('aria-label',expanded?'Restrânge zona hărții':'Mărește zona hărții');requestAnimationFrame(()=>map?.resize());});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();setView('map');$('search-input').focus();}});
$('export-button').addEventListener('click',()=>{
  const cell=v=>{let s=String(v??'');if(/^[=+@-]/.test(s))s="'"+s;return `"${s.replaceAll('"','""')}"`;};
  const live=isLive();
  const rows=live?[['EDTH Monitor · MESAJE DE LA SERVERUL C2'],['ID','Tip amenințare','Tip dronă','Evaluare locală','Tip senzor','Latitudine senzor','Longitudine senzor','Interceptoare propuse','Comenzi trimise','Primită (ISO)'],...state.snapshot.observations.map(o=>[o.id,o.threatType,o.droneType,STATUS_LABELS[o.status],o.sensorType,o.position.latitude,o.position.longitude,o.interceptors.join(', '),o.launches.map(l=>`${l.interceptor} @ ${l.sentAt}`).join(', '),o.firstSeen])]:[['EDTH Monitor · DATE DEMONSTRATIVE'],['ID','Tip','Stare','Zonă fictivă','Încredere simulată (%)','Ultima observație (ISO)'],...state.snapshot.observations.map(o=>[o.id,ENTITY_TYPES[o.type].label,STATUS_LABELS[o.status],o.zone,o.confidence,o.lastSeen])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=live?'edth-raport.csv':'edth-raport-demo.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(live?'Raportul a fost exportat.':'Raportul demonstrativ a fost exportat.');
});

function sourceLabels(){
  const c=map?.getConfig();if(!c)return;
  const romania=c.kind==='romania';
  $('map-source-label').textContent=c.name;$('overlay-base-label').textContent=c.name;
  $('tile-scheme-label').textContent=romania?'Străzi · localități · clădiri':`${c.scheme.toUpperCase()} · ${c.projection}`;
  $('map-level-label').textContent=romania?(map.getMode()==='3d'?'3D: înălțimi clădiri estimate':'2D: contururi OpenStreetMap'):`Niveluri ${c.minimumLevel}–${c.maximumLevel}`;
  $('map-surface-label').textContent=romania?'relief local':'elipsoid WGS84';
}
function fillSourceForm(c){if(c.kind==='romania')c=defaultMapConfig;$('source-name').value=c.name;$('source-url').value=c.url.replace('{reverseY}','{y}');$('source-scheme').value=c.scheme;$('source-projection').value=c.projection;$('source-min').value=c.minimumLevel;$('source-max').value=c.maximumLevel;$('source-bounds').value=c.bounds?.join(', ')??'';$('source-credit').value=c.credit;$('source-error').hidden=true;}
$('source-open').addEventListener('click',()=>{overlays?.close();fillSourceForm(map?.getConfig()||defaultMapConfig);$('source-dialog').showModal();});
$('source-default').addEventListener('click',()=>{fillSourceForm(defaultMapConfig);document.querySelector('.custom-source').open=true;});
document.querySelector('.custom-source').addEventListener('toggle',e=>{$('apply-source').hidden=!e.target.open;});
$('apply-source').hidden=true;
$('source-romania').addEventListener('click',async()=>{
  if(sourcePending||!map)return;
  sourcePending=true;$('source-romania').disabled=true;$('source-error').hidden=true;
  try{if(await map.useRomania()){sourceLabels();$('source-dialog').close();toast('Harta locală a României este activă.');}else{toast($('map-status').textContent,true);}}
  catch(error){toast(error.message,true);}
  finally{sourcePending=false;$('source-romania').disabled=false;}
});
$('cancel-source').addEventListener('click',()=>$('source-dialog').close());
$('source-dialog').addEventListener('cancel',e=>{if(sourcePending)e.preventDefault();});
$('source-form').addEventListener('submit',async e=>{
  e.preventDefault();if(sourcePending)return;
  if(!map){$('source-error').textContent='Motorul hărții nu este disponibil. Verifică resursele Cesium și suportul WebGL.';$('source-error').hidden=false;return;}
  const bounds=$('source-bounds').value.trim();
  const c={name:$('source-name').value,url:$('source-url').value.trim(),scheme:$('source-scheme').value,projection:$('source-projection').value,minimumLevel:Number($('source-min').value),maximumLevel:Number($('source-max').value),credit:$('source-credit').value,bounds:bounds?bounds.split(',').map(x=>x.trim()===''?NaN:Number(x.trim())):null};
  sourcePending=true;['apply-source','cancel-source','source-default','source-romania'].forEach(id=>$(id).disabled=true);$('apply-source').textContent='Se verifică…';$('source-error').hidden=true;
  try{const ok=await map.setSource(c);if(ok){sourceLabels();$('source-dialog').close();toast('Sursa cartografică locală a fost aplicată.');}else{$('source-error').textContent=$('map-status').textContent;$('source-error').hidden=false;}}
  catch(error){$('source-error').textContent=error.message;$('source-error').hidden=false;}
  finally{sourcePending=false;['apply-source','cancel-source','source-default','source-romania'].forEach(id=>$(id).disabled=false);$('apply-source').textContent='Aplică raster';}
});

state.snapshot=await getSnapshot();render();
if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
try{
  map=createLocalMap({container:$('cesium-container'),onViewerReady:viewer=>{overlays=setupMonitorOverlays(viewer);feedLayer=createFeedLayer(window.Cesium,viewer);},onStatus:({state:status,message})=>{if(status==='ready')overlays?.raise();$('map-status').hidden=status==='ready';$('map-status').classList.toggle('error',status==='error');$('map-status').textContent=message;sourceLabels();},onCamera:({longitude,latitude,height})=>{$('map-coordinates').textContent=`${Math.abs(latitude).toFixed(3)}° ${latitude<0?'S':'N'} · ${Math.abs(longitude).toFixed(3)}° ${longitude<0?'W':'E'} · ${height<1000?`${Math.round(height)} m`:`${(height/1000).toFixed(1)} km`}`;} });
  const placeSearch=setupPlaceSearch(place=>map.flyToPlace({...place,height:place.height??1600}));
  $('romania-home').addEventListener('click',()=>{placeSearch.clear();map.home();});
  $('zoom-in').addEventListener('click',()=>map.zoomIn());$('zoom-out').addEventListener('click',()=>map.zoomOut());$('reset-map').addEventListener('click',()=>map.home());
  for(const mode of ['2d','3d'])$(`mode-${mode}`).addEventListener('click',()=>{if(!map.setMode(mode))return;$('map-mode-label').textContent=mode.toUpperCase();$('map-navigation-hint').textContent=mode==='3d'?'Zoom pentru clădiri · Ctrl + trage pentru înclinare':'Trage pentru deplasare · Rotița pentru zoom';sourceLabels();for(const m of ['2d','3d']){$(`mode-${m}`).classList.toggle('active',m===mode);$(`mode-${m}`).setAttribute('aria-pressed',String(m===mode));}});
  window.addEventListener('pagehide',event=>{if(!event.persisted){feed?.close();feedLayer?.destroy();overlays?.destroy();map?.destroy();}});
  window.addEventListener('pageshow',event=>{if(event.persisted)map?.resize();});
}catch(error){$('map-status').hidden=false;$('map-status').classList.add('error');$('map-status').textContent=error.message||'Harta nu poate porni. Verifică suportul WebGL și fișierele Cesium locale.';['mode-2d','mode-3d','zoom-in','zoom-out','reset-map'].forEach(id=>$(id).disabled=true);}

fetch('./maps/romania/manifest.json',{mode:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(m=>{
  $('map-package-info').textContent=`Pachet vectorial: ${Number(m.tileCount||0).toLocaleString('ro-RO')} tile-uri · niveluri ${m.minzoom}–${m.maxzoom}, cu apropiere suplimentară din aceleași date. Sursa: Geofabrik / OpenStreetMap, ODbL 1.0.`;
}).catch(()=>{$('map-package-info').textContent='Metadatele pachetului local nu sunt disponibile.';});

// ---- Serverul C2: flux live, autentificare și comanda de lansare -------------------------------
let renderQueued=false, lastMessageAt=null, loginOffered=false, feedSession=null;
function queueRender(){
  if(renderQueued)return;renderQueued=true;
  setTimeout(async()=>{renderQueued=false;state.snapshot=await getSnapshot();if(!state.snapshot.observations.some(o=>o.id===state.selected)&&state.selectionType==='observation')state.selected=state.snapshot.observations[0]?.id??null;render();renderFeedStatus();},60);
}
function renderFeedStatus(){
  const f=state.feed;
  if(!f.configured)return;
  $('feed-status').classList.toggle('offline',!f.connected);
  $('feed-status-text').textContent=f.connected?'Server C2 · conectat':'Server C2 · deconectat';
  $('last-update').textContent=lastMessageAt?`Ultimul mesaj · ${clock(lastMessageAt)}`:f.connected?'Aștept mesaje de la server':'Fără conexiune la server';
  $('login-button').hidden=false;
  $('login-button').textContent=f.authenticated?`Autentificat · ${f.username}`:'Autentificare';
  $('login-button').classList.toggle('button-primary',f.connected&&!f.authenticated);
  $('login-button').classList.toggle('button-secondary',!f.connected||f.authenticated);
  $('login-button').disabled=f.authenticated;
}
function enterLiveMode(){
  if(isLive())return;
  startLive();state.selected=null;feedLayer?.clear();
  $('workspace-label').textContent='Server C2';$('workspace-tag').textContent='LIVE';
  $('workspace-eyebrow').textContent='SERVER C2';$('footer-environment').textContent='DATE LIVE';
  $('footer-data').textContent='Cesium · Tile-uri locale · Mesaje de la serverul C2';
  $('header-date').textContent=new Intl.DateTimeFormat('ro-RO',{timeZone:'Europe/Bucharest',day:'2-digit',month:'short',year:'numeric'}).format(new Date()).replace('.','').toUpperCase();
  $('role-select').options[0].textContent='Operator';$('role-select').options[1].textContent='Watcher';
  $('session-role').textContent=`SESIUNE ${state.role==='operator'?'OPERATOR':'WATCHER'}`;
  $('observations-footnote').textContent='Amenințări primite de la serverul C2';
  $('close-dialog-note').textContent='Înregistrează motivul închiderii. Evaluarea rămâne locală; nu este trimisă serverului.';
}
function onFeedStatus(status){
  const before=state.feed;state.feed=status;
  if(!status.configured)return;
  enterLiveMode();
  // A restarted bridge numbers its messages from one again: what the page holds belongs to the old run.
  if(status.session){if(feedSession&&status.session!==feedSession){resetLive();feedLayer?.clear();state.selected=null;lastMessageAt=null;}feedSession=status.session;}
  if(status.connected&&!before.connected&&before.configured)toast('Conexiune cu serverul C2 restabilită.');
  if(!status.connected&&before.connected)toast('Conexiunea cu serverul C2 s-a întrerupt.',true);
  if(status.connected&&!status.authenticated&&!loginOffered&&!document.querySelector('dialog[open]')){loginOffered=true;openLogin();}
  queueRender();
}
function onFeedThreat(threat){
  const added=ingestThreat(threat);if(!added)return;
  lastMessageAt=threat.receivedAt;
  feedLayer?.addSensor({id:added.sensor.id,name:added.sensor.name,latitude:added.sensor.position.latitude,longitude:added.sensor.position.longitude,color:SENSOR_TYPES[added.sensor.type].color});
  // Messages replayed after a page reload are history, not a new alert.
  if(Date.now()-Date.parse(threat.receivedAt)<5000)toast(`Amenințare nouă: ${threat.threat_type}${threat.drone_type?` · ${threat.drone_type}`:''}`,true);
  queueRender();
}
function onFeedPoint(point){lastMessageAt=point.receivedAt;feedLayer?.addPoint(point);if(!renderQueued)renderFeedStatus();}

function openLogin(){$('login-error').hidden=true;$('login-form').reset();$('login-dialog').showModal();$('login-username').focus();}
$('login-button').addEventListener('click',openLogin);
$('cancel-login').addEventListener('click',()=>$('login-dialog').close());
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!feed)return;
  const username=$('login-username').value,password=$('login-password').value;
  $('login-password').value='';$('submit-login').disabled=true;$('login-error').hidden=true;
  try{
    if(await feed.login(username,password)){$('login-dialog').close();toast('Autentificare acceptată de server.');}
    else{$('login-error').textContent='Autentificare respinsă de server.';$('login-error').hidden=false;}
  }catch(error){$('login-error').textContent=error.message;$('login-error').hidden=false;}
  finally{$('submit-login').disabled=false;}
});

function openLaunch(index){
  const o=state.snapshot.observations.find(x=>x.id===state.selected);
  const interceptor=o?.live?o.interceptors[index]:undefined;
  if(!interceptor||state.role!=='operator'||!state.feed.connected||!state.feed.authenticated||o.status==='closed')return;
  launchTarget={id:o.id,seq:o.seq,interceptor};
  $('launch-interceptor').textContent=interceptor;
  $('launch-threat').textContent=`${o.id} · ${o.threatType}${o.droneType?` · ${o.droneType}`:''}`;
  $('launch-error').hidden=true;$('confirm-launch').disabled=false;
  $('launch-dialog').showModal();$('cancel-launch').focus();
}
$('cancel-launch').addEventListener('click',()=>$('launch-dialog').close());
$('launch-dialog').addEventListener('close',()=>{launchTarget=null;});
$('launch-form').addEventListener('submit',async e=>{
  e.preventDefault();const target=launchTarget;if(!target||!feed)return;
  $('confirm-launch').disabled=true;$('launch-error').hidden=true;
  try{
    const result=await feed.launch(target.seq,target.interceptor);
    recordLaunch(target.id,target.interceptor,result.sentAt);
    $('launch-dialog').close();toast(`Comanda de lansare pentru ${target.interceptor} a fost trimisă serverului.`);queueRender();
  }catch(error){
    // Nothing is retried automatically: the operator decides again.
    $('launch-error').textContent=`${error.message} Comanda nu a fost trimisă.`;$('launch-error').hidden=false;$('confirm-launch').disabled=false;
  }
});

feed=await connectBackendFeed({onStatus:onFeedStatus,onThreat:onFeedThreat,onPoint:onFeedPoint});
