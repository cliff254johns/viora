/* City-level geographic intelligence for the main CRM Leads tab.
   Outreach Centre writes to the same orgs/viora/leads node as the main CRM,
   so this view plots both sources together without a second, stale copy. */
let _mainLeadGeoMap=null,_mainLeadGeoLayer=null,_mainLeadHeatLayer=null,_mainLeadGeoToken=0;
let _mainLeadMapResizeBound=false;
const _mainGeoCacheKey='viora-main-lead-city-cache-v3';
function _mainGeoCache(){try{return JSON.parse(localStorage.getItem(_mainGeoCacheKey)||'{}')}catch{return {}}}
async function _mainGeocodeCity(q,cache){if(Object.prototype.hasOwnProperty.call(cache,q))return cache[q];const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Geocoder '+r.status);const a=await r.json();const p=a[0]?{lat:+a[0].lat,lng:+a[0].lon}:null;cache[q]=p;try{localStorage.setItem(_mainGeoCacheKey,JSON.stringify(cache))}catch{}return p}
function _addMainVioraMapLayerControl(map,layers){
 const control=L.control({position:'topright'});
 control.onAdd=function(){const root=L.DomUtil.create('div','viora-map-layer-control leaflet-bar');const trigger=L.DomUtil.create('button','viora-map-layer-trigger',root);trigger.type='button';trigger.title='Map layers';trigger.setAttribute('aria-label','Choose map style');trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<i class="fa-solid fa-layer-group"></i>';const menu=L.DomUtil.create('div','viora-map-layer-menu',root);menu.hidden=true;[['vegetation','Vegetation'],['streets','Street map'],['satellite','Satellite'],['osm','OpenStreetMap']].forEach(([key,label])=>{const b=L.DomUtil.create('button','viora-map-layer-option',menu);b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(key==='vegetation'));b.addEventListener('click',()=>{Object.values(layers).forEach(layer=>{if(map.hasLayer(layer))map.removeLayer(layer)});layers[key].addTo(map);menu.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));menu.hidden=true;trigger.setAttribute('aria-expanded','false');});});trigger.addEventListener('click',()=>{menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});L.DomEvent.disableClickPropagation(root);L.DomEvent.disableScrollPropagation(root);return root;};control.addTo(map);return control;
}
function _ensureMainLeadMap(){
 const el=document.getElementById('mainLeadMap');if(!el||!window.L)return;
 if(_mainLeadGeoMap){setTimeout(()=>_mainLeadGeoMap&&_mainLeadGeoMap.invalidateSize(true),100);return}
 if(el.clientWidth<80)return;
 el.replaceChildren();
 _mainLeadGeoMap=L.map(el,{worldCopyJump:true,scrollWheelZoom:true,preferCanvas:true,maxZoom:19}).setView([18,5],1);
 const streets=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
 const osmStreets=L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'© OpenStreetMap contributors © CARTO'});
 const terrain=L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'© OpenStreetMap contributors © CARTO'});
 const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'});
 const boundaries=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,opacity:.95,attribution:'Country boundaries & place labels © Esri'});
 terrain.addTo(_mainLeadGeoMap);boundaries.addTo(_mainLeadGeoMap);_addMainVioraMapLayerControl(_mainLeadGeoMap,{vegetation:terrain,streets:streets,satellite:satellite,osm:osmStreets});_mainLeadGeoMap.fitBounds([[-82,-180],[82,180]],{padding:[8,8],maxZoom:2,animate:false});_mainLeadGeoMap._vioraWorldFitted=true;_mainLeadGeoMap._vioraUserZoomed=false;_mainLeadGeoMap.on('zoomend',()=>{if(_mainLeadGeoMap.getZoom()>2)_mainLeadGeoMap._vioraUserZoomed=true;});_mainLeadGeoMap.on('resize',()=>{_mainLeadGeoMap.invalidateSize(true);if(!_mainLeadGeoMap._vioraUserZoomed)_mainLeadGeoMap.fitBounds([[-82,-180],[82,180]],{padding:[8,8],maxZoom:2,animate:false});});
 _mainLeadGeoLayer=L.layerGroup().addTo(_mainLeadGeoMap);
 if(!_mainLeadMapResizeBound){window.addEventListener('resize',()=>{if(_mainLeadGeoMap)setTimeout(()=>_mainLeadGeoMap&&_mainLeadGeoMap.invalidateSize(true),120)});_mainLeadMapResizeBound=true}
 requestAnimationFrame(()=>requestAnimationFrame(()=>_mainLeadGeoMap&&_mainLeadGeoMap.invalidateSize(true)));
}
async function renderMainLeadGeoMap(force=false){
 const el=document.getElementById('mainLeadMap');if(!el)return;
 const token=++_mainLeadGeoToken,raw=_data().leads;
 const all=Array.isArray(raw)?raw.slice():Object.entries(raw||{}).map(([id,v])=>({id,...(v||{})}));
 const located=all.filter(l=>String(l.city||'').trim()&&String(l.country||'').trim());
 const set=(id,v)=>{const n=document.getElementById(id);if(n)n.textContent=String(v)};
 set('mainMapLocated',located.length);set('mainMapUnlocated',all.length-located.length);
 const refresh=document.getElementById('mainMapRefresh');
 if(refresh&&!refresh._vioraBound){refresh._vioraBound=true;refresh.addEventListener('click',()=>renderMainLeadGeoMap(true))}
 if(!window.L){el.innerHTML='<div class="viora-map-loading">Map library unavailable. Reconnect and refresh this view.</div>';return}
 _ensureMainLeadMap();
 if(!_mainLeadGeoMap){
   el.innerHTML='<div class="viora-map-loading"><i class="fa-solid fa-globe fa-spin"></i> Preparing the world map…</div>';
   const pane=document.getElementById('tab-marketing-leads');
   if(pane&&pane.classList.contains('active')&&el.clientWidth<80){
     setTimeout(()=>{if(!_mainLeadGeoMap&&document.getElementById('tab-marketing-leads')?.classList.contains('active'))renderMainLeadGeoMap(force)},220);
   }
   return;
 }
 requestAnimationFrame(()=>requestAnimationFrame(()=>_mainLeadGeoMap&&_mainLeadGeoMap.invalidateSize(true)));
 const grouped=new Map();
 // Deliberately city-level: street addresses are not used to position map points.
 located.forEach(l=>{const city=String(l.city).trim(),country=String(l.country).trim(),key=city+', '+country;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(l)});
 const cache=_mainGeoCache(),points=[];let n=0;
 for(const [label,records] of grouped){
   if(token!==_mainLeadGeoToken)return;
   try{const p=await _mainGeocodeCity(label,cache);if(p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng))points.push({label,records,...p})}
   catch(e){console.warn('[VIORA main map] geocoding failed for',label,e)}
   n++;set('mainMapCities',points.length);
   if(n<grouped.size)await new Promise(r=>setTimeout(r,1100));
 }
 if(token!==_mainLeadGeoToken)return;
 _mainLeadGeoLayer.clearLayers();
 if(_mainLeadHeatLayer){_mainLeadGeoMap.removeLayer(_mainLeadHeatLayer);_mainLeadHeatLayer=null}
 const heat=[];
 points.forEach(p=>{
   const count=p.records.length;
   const dot=L.circleMarker([p.lat,p.lng],{radius:Math.min(18,7+Math.sqrt(count)*2.2),color:'#e6f7ff',weight:1.5,fillColor:'#38bdf8',fillOpacity:.94});
   const safeLabel=String(p.label).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
   dot.bindPopup('<div class="viora-main-map-popup"><strong>'+safeLabel+'</strong><small>'+count+' recorded lead'+(count===1?'':'s')+'</small></div>');
   dot.addTo(_mainLeadGeoLayer);
   heat.push([p.lat,p.lng,Math.min(1,.35+count*.13)]);
 });
 if(window.L.heatLayer&&heat.length)_mainLeadHeatLayer=L.heatLayer(heat,{radius:42,blur:30,maxZoom:6,minOpacity:.3,gradient:{0.12:'#2563eb',0.34:'#06b6d4',0.58:'#22c55e',0.8:'#f59e0b',1:'#ef4444'}}).addTo(_mainLeadGeoMap);
 set('mainMapCities',points.length);
 // Keep the full world visible instead of auto-zooming into one lead cluster.
 if(!_mainLeadGeoMap._vioraWorldFitted){_mainLeadGeoMap.fitBounds([[-82,-180],[82,180]],{padding:[8,8],maxZoom:2,animate:false});_mainLeadGeoMap._vioraWorldFitted=true;}
 if(located.length&&!points.length)console.warn('[VIORA main map] No city locations could be geocoded.');
 requestAnimationFrame(()=>requestAnimationFrame(()=>_mainLeadGeoMap&&_mainLeadGeoMap.invalidateSize(true)));
}
// ═══════════════════════════════════════════════════════════════
// main/viora-main-renderers.js
// ═══════════════════════════════════════════════════════════════
// All "register" renderers for the VIORA admin shell.
//
// Public contract:
//   initMainRenderers(deps) → returns an object with every
//   exported renderer + getFeeSummary + renderPresAttachments.
//
// Export surface (must match what main.js imports):
//   initMainRenderers,
//   renderLeads, renderDeals, renderPipelineKanban,
//   renderContracts, renderProposals,
//   renderAppointments, renderPresentations,
//   renderInventory, renderInvoices, renderPayments,
//   renderLedger, renderExpenses, renderPayroll
//
// Extra exports (called via _renderers?.xxx from main.js):
//   getFeeSummary, renderPresAttachments,
//   dedupeLeads, syncMarketToLeads, syncBlueprintLeads, syncOrderLeads
//
// No imports from main.js. No direct Firebase. No window.* writes
// at module load (except one guarded Object.assign on Viora).
// ═══════════════════════════════════════════════════════════════

let D = null;

/* Alias used by some diagnostics/older call sites */
export function renderEmployeeList() {
  return renderEmployees();
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
export function initMainRenderers(deps) {
  if (!deps || typeof deps !== 'object') {
    throw new Error('[main-renderers] initMainRenderers requires a deps object');
  }
  D = deps;

  // Reset caches on re-init so a fresh deps bag rebuilds cleanly.
  _resetRenderCaches();

  const api = {
    // The 14 register renderers main.js imports:
    renderLeads,
    renderDeals,
    renderPipelineKanban,
    renderContracts,
    renderProposals,
    renderAppointments,
    renderPresentations,
    renderInventory,
    renderInvoices,
    renderPayments,
    renderLedger,
    renderExpenses,
    renderPayroll,

    // Extra renderers main.js reads from _renderers:
    getFeeSummary,
    renderPresAttachments,
    renderMsProductsList: _bridgeRenderMsProductsList,
    renderMsSummary:      _bridgeRenderMsSummary,
    applyCampMediaTypeUI: _bridgeApplyCampMediaTypeUI,

    // Lead-sync helpers main.js wraps as window.__viora*:
    dedupeLeads,
    syncMarketToLeads,
    syncBlueprintLeads,
    syncOrderLeads,

    // Also export these so main.js's setRenderActiveTabImpl stays wired:
    // (nothing here — renderActiveTab lives in main.js itself)
  };

  // Namespace onto window.Viora for inline onclick= handlers that
  // reference the sync helpers directly.
  try {
    window.Viora = window.Viora || {};
    window.__vioraDedupeLeads       = dedupeLeads;
    window.__vioraSyncMarketToLeads = syncMarketToLeads;
    window.__vioraSyncBlueprintLeads = syncBlueprintLeads;
    window.__vioraSyncOrderLeads    = syncOrderLeads;
  } catch (_) { /* non-fatal */ }

  return api;
}

/* ═══════════════════════════════════════════════════════════════
   SAFE ACCESSORS
   All of these return a sensible fallback if the dep isn't wired.
   ═══════════════════════════════════════════════════════════════ */
const _noop = () => {};

function _d() {
  if (!D) throw new Error('[main-renderers] initMainRenderers() was not called');
  return D;
}

function _safe$(id) {
  const d = _d();
  if (typeof d.$ === 'function') {
    try { return d.$(id); } catch (_) {}
  }
  if (typeof document !== 'undefined') return document.getElementById(id);
  return null;
}

function _state() {
  const d = _d();
  return d.state || { data: {}, operator: null };
}

function _data() {
  const s = _state();
  return (s && s.data && typeof s.data === 'object') ? s.data : {};
}

function _val(id) {
  const el = _safe$(id);
  return el ? String(el.value || '') : '';
}

function _setVal(id, v) {
  const el = _safe$(id);
  if (el) el.value = v == null ? '' : String(v);
}

function _esc(s) {
  const d = _d();
  if (typeof d.escapeHtml === 'function') {
    try { return d.escapeHtml(s); } catch (_) {}
  }
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Quote-safe escape for embedding inside an inline `onclick='...'`. */
function _q(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '\\x3c')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function _fmtDate(v) {
  const d = _d();
  if (typeof d.fmtDate === 'function') {
    try { return d.fmtDate(v); } catch (_) {}
  }
  return v ? String(v) : '—';
}

function _fmtDateTime(date, time) {
  const d = _d();
  if (typeof d.fmtDateTime === 'function') {
    try { return d.fmtDateTime(date, time); } catch (_) {}
  }
  if (!date) return '—';
  return String(date) + (time ? ' ' + String(time) : '');
}

function _fmtKES(n, curr) {
  const d = _d();
  if (typeof d.fmtKES === 'function') {
    try { return d.fmtKES(n, curr); } catch (_) {}
  }
  const v = Number(n) || 0;
  const sym = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : 'KSh ';
  return sym + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _fmtUSD(n) {
  const d = _d();
  if (typeof d.fmtUSD === 'function') {
    try { return d.fmtUSD(n); } catch (_) {}
  }
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _usdToKes(v) {
  const d = _d();
  if (typeof d.usdToKes === 'function') {
    try { return d.usdToKes(v); } catch (_) {}
  }
  return Math.round((Number(v) || 0) * 129);
}

function _timeAgo(t) {
  const d = _d();
  if (typeof d.timeAgo === 'function') {
    try { return d.timeAgo(t); } catch (_) {}
  }
  return t ? String(t) : '';
}

function _todayStr() {
  const d = _d();
  if (typeof d.todayStr === 'function') {
    try { return d.todayStr(); } catch (_) {}
  }
  return new Date().toISOString().slice(0, 10);
}

function _daysBetween(v) {
  const d = _d();
  if (typeof d.daysBetween === 'function') {
    try { return d.daysBetween(v); } catch (_) {}
  }
  if (!v) return 0;
  const today = _todayStr();
  const a = new Date(String(v).slice(0, 10) + 'T00:00:00Z').getTime();
  const b = new Date(today + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / 86400000);
}

function _isOverdue(v) {
  const d = _d();
  if (typeof d.isOverdue === 'function') {
    try { return d.isOverdue(v); } catch (_) {}
  }
  if (!v) return false;
  return String(v).slice(0, 10) < _todayStr();
}

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _toast(msg, type) {
  const d = _d();
  if (typeof d.toast === 'function') {
    try { d.toast(msg, type || 'info'); } catch (_) {}
  }
}

function _logActivity() {
  const d = _d();
  if (typeof d.logActivity === 'function') {
    try { return d.logActivity.apply(null, arguments); } catch (_) {}
  }
  return Promise.resolve();
}

function _upsertDoc() {
  const d = _d();
  if (typeof d.upsertDoc === 'function') {
    try { return d.upsertDoc.apply(null, arguments); } catch (e) { return Promise.reject(e); }
  }
  return Promise.reject(new Error('upsertDoc not wired'));
}

function _deleteDoc() {
  const d = _d();
  if (typeof d.deleteDoc === 'function') {
    try { return d.deleteDoc.apply(null, arguments); } catch (e) { return Promise.reject(e); }
  }
  return Promise.reject(new Error('deleteDoc not wired'));
}

function _confirm(msg, opts) {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.vioraConfirm === 'function') {
      try {
        Promise.resolve(window.vioraConfirm(msg, opts || {})).then(resolve, () => resolve(false));
        return;
      } catch (_) { /* fall through */ }
    }
    try {
      resolve(typeof confirm === 'function' ? !!confirm(msg) : true);
    } catch (_) {
      resolve(true);
    }
  });
}

function _openModal(id) {
  const d = _d();
  if (typeof d.openModal === 'function') {
    try { d.openModal(id); } catch (_) {}
  }
}

function _closeModal(id) {
  const d = _d();
  if (typeof d.closeModal === 'function') {
    try { d.closeModal(id); } catch (_) {}
  }
}

function _contactButtons(entity, kind) {
  const d = _d();
  if (typeof d.contactButtons === 'function') {
    try { return d.contactButtons(entity, kind) || ''; } catch (_) {}
  }
  return '';
}

function _getClient(id) {
  const d = _d();
  if (typeof d.getClient === 'function') {
    try { return d.getClient(id) || null; } catch (_) {}
  }
  return null;
}

function _getClientName(id) {
  const d = _d();
  if (typeof d.getClientName === 'function') {
    try { return d.getClientName(id) || '—'; } catch (_) {}
  }
  const c = _getClient(id);
  return (c && c.name) || '—';
}

function _getProject(id) {
  const d = _d();
  if (typeof d.getProject === 'function') {
    try { return d.getProject(id) || null; } catch (_) {}
  }
  return (_data().projects || []).find(p => p && p.id === id) || null;
}

function _getProjectNumber(id) {
  const d = _d();
  if (typeof d.getProjectNumber === 'function') {
    try { return d.getProjectNumber(id) || '—'; } catch (_) {}
  }
  const p = _getProject(id);
  return (p && p.projectNumber) || '—';
}

function _getEmployeeName(id) {
  const list = (_data().entities || []);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e && e.id === id) return e.name || '—';
  }
  return '—';
}

function _getInvoiceTotals(inv) {
  const d = _d();
  if (typeof d.getInvoiceTotals === 'function') {
    try { return d.getInvoiceTotals(inv) || { total: 0 }; } catch (_) {}
  }
  return { total: _num(inv && inv.total) };
}

function _getInvoicePaid(invoiceId) {
  const d = _d();
  if (typeof d.getInvoicePaidAmount === 'function') {
    try { return _num(d.getInvoicePaidAmount(invoiceId)); } catch (_) {}
  }
  return 0;
}

function _getInvoiceStatus(inv) {
  const d = _d();
  if (typeof d.getInvoiceStatusDerived === 'function') {
    try { return d.getInvoiceStatusDerived(inv) || 'draft'; } catch (_) {}
  }
  return (inv && inv.status) || 'draft';
}

function _getProjectAgreed(id) {
  const d = _d();
  if (typeof d.getProjectAgreedTotal === 'function') {
    try { return _num(d.getProjectAgreedTotal(id)); } catch (_) {}
  }
  return 0;
}

function _getProjectPaid(id) {
  const d = _d();
  if (typeof d.getProjectPaidTotal === 'function') {
    try { return _num(d.getProjectPaidTotal(id)); } catch (_) {}
  }
  return 0;
}

/* ═══════════════════════════════════════════════════════════════
   PER-RENDERER CACHES (skip DOM write when nothing changed)
   ═══════════════════════════════════════════════════════════════ */
const _htmlCache = new WeakMap();
let _sig = {
  leads: '',
  deals: '',
  kanban: '',
  contracts: '',
  proposals: '',
  appointments: '',
  presentations: '',
  inventory: '',
  invoices: '',
  payments: '',
  ledger: '',
  expenses: '',
  payroll: '',
  presAttach: '',
};

function _resetRenderCaches() {
  // _htmlCache is a WeakMap — let GC handle it.
  _sig = {
    leads: '', deals: '', kanban: '', contracts: '', proposals: '',
    appointments: '', presentations: '', inventory: '', invoices: '',
    payments: '', ledger: '', expenses: '', payroll: '', presAttach: '',
  };
}

function _setHtml(el, html) {
  if (!el) return false;
  const prev = _htmlCache.get(el);
  if (prev === html) return false;
  _htmlCache.set(el, html);
  el.innerHTML = html;
  return true;
}

function _hash(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function _sigOfArray(arr, fields) {
  if (!Array.isArray(arr) || arr.length === 0) return '0';
  let h = 5381;
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (!rec) continue;
    const id = String(rec.id || '');
    for (let j = 0; j < id.length; j++) h = ((h << 5) + h + id.charCodeAt(j)) | 0;
    for (let f = 0; f < fields.length; f++) {
      const val = rec[fields[f]];
      if (val == null) continue;
      const s = typeof val === 'string' ? val : String(val);
      for (let j = 0; j < s.length; j++) h = ((h << 5) + h + s.charCodeAt(j)) | 0;
    }
  }
  return arr.length + ':' + (h >>> 0).toString(36);
}

/* ═══════════════════════════════════════════════════════════════
   LEADS
   ═══════════════════════════════════════════════════════════════ */
export function renderLeads() {
  try { renderMainLeadGeoMap(); } catch (e) { console.warn("[renderLeads] map failed", e); }
  try {
    const tb = _safe$('leadsBody');
    if (!tb) return;

    const search = _val('leadSearch').toLowerCase().trim();
    const statusFilter = _val('leadFilterStatus') || 'all';
    const sourceFilter = _val('leadFilterSource') || 'all';

    let list = Array.isArray(_data().leads) ? _data().leads.slice() : [];

    // Sort newest-first before filtering so filter order matches what users expect.
    list.sort((a, b) => {
      const at = (a && (a.createdAt || a.updatedAt)) || '';
      const bt = (b && (b.createdAt || b.updatedAt)) || '';
      return bt.localeCompare(at);
    });

    if (search) {
      list = list.filter(l => l && (
        (l.fullName || '').toLowerCase().includes(search) ||
        (l.email || '').toLowerCase().includes(search) ||
        (l.phone || '').toLowerCase().includes(search) ||
        (l.company || '').toLowerCase().includes(search)
      ));
    }
    if (statusFilter !== 'all') list = list.filter(l => l && l.status === statusFilter);
    if (sourceFilter !== 'all') list = list.filter(l => l && l.source === sourceFilter);

    const sig = _sigOfArray(list, ['fullName', 'status', 'source', 'email', 'phone', 'campaignName']) +
      '|' + statusFilter + '|' + sourceFilter + '|' + search;
    if (sig === _sig.leads) return;
    _sig.leads = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="8" class="empty-state">No leads match. Click <strong>New Lead</strong> to add one.</td></tr>`);
      return;
    }

    const statusCls = {
      'New': 'sent', 'Contacted': 'sent', 'Qualified': 'pending',
      'Proposal Sent': 'pending', 'Negotiation': 'pending',
      'Converted': 'paid', 'Lost': 'overdue',
    };

    const rows = list.map(l => {
      const cls = statusCls[l.status] || 'gray';
      const idSafe = _q(l.id);
      return `<tr>
        <td><strong>${_esc(l.fullName || '—')}</strong>${_contactButtons(l, 'lead')}</td>
        <td>${_esc(l.email || '—')}<br><small style="color:var(--text-secondary);">${_esc(l.phone || '')}</small></td>
        <td>${_esc(l.company || '—')}</td>
        <td><span class="badge badge-purple">${_esc(l.source || '—')}</span></td>
        <td>${_esc(l.campaignName || '—')}</td>
        <td><span class="badge badge-${cls}">${_esc(l.status || '—')}</span></td>
        <td><small>${_timeAgo(l.createdAt)}</small></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editLead('${idSafe}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          ${l.status !== 'Converted' ? `<button class="btn btn-success btn-xs" onclick="Viora.convertLeadToClientDeal && Viora.editLead('${idSafe}')" title="Qualify to convert"><i class="fa-solid fa-arrow-right"></i></button>` : ''}
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteLead('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);

    /* ★ v9.3 — Paint the KPI strip on the Leads tab.
       These IDs exist in main.html inside #tab-marketing-leads.
       Previously they were never updated, so they always showed 0. */
    try {
      const allLeads = Array.isArray(_data().leads) ? _data().leads : [];
      const clientEmails = new Set(
        (_data().entities || [])
          .filter(e => e && e.type === 'client' && e.email)
          .map(e => String(e.email).toLowerCase().trim())
      );
      const clientLeadIds = new Set(
        (_data().entities || [])
          .filter(e => e && e.type === 'client' && e.sourceLeadId)
          .map(e => e.sourceLeadId)
      );

      let liveCount = 0, qualified = 0, converted = 0;
      for (let i = 0; i < allLeads.length; i++) {
        const l = allLeads[i];
        if (!l) continue;
        if (l.status === 'Converted' || clientLeadIds.has(l.id)) { converted++; continue; }
        const em = String(l.email || '').toLowerCase().trim();
        if (em && clientEmails.has(em)) { converted++; continue; }
        liveCount++;
        if (l.status === 'Qualified') qualified++;
      }
      const rate = (liveCount + converted) > 0
        ? Math.round((converted / (liveCount + converted)) * 100)
        : 0;

      const setTxt = (id, v) => {
        const el = document.getElementById(id);
        if (el && el.textContent !== String(v)) el.textContent = String(v);
      };
      setTxt('mkTotal', liveCount);
      setTxt('mkQualified', qualified);
      setTxt('mkConverted', converted);
      setTxt('mkRate', rate + '%');
    } catch (e) { console.warn('[renderLeads] KPI paint failed', e); }
  } catch (e) {
    console.warn('[renderLeads] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   DEALS
   ═══════════════════════════════════════════════════════════════ */
export function renderDeals() {
  try {
    const tb = _safe$('dealsBody');
    if (!tb) return;

    const search = _val('dealSearch').toLowerCase().trim();
    const stageFilter = _val('dealFilterStage') || 'all';

    let list = Array.isArray(_data().deals) ? _data().deals.slice() : [];

    if (search) {
      list = list.filter(d => d && (
        (d.title || '').toLowerCase().includes(search) ||
        (d.clientName || '').toLowerCase().includes(search) ||
        _getClientName(d.clientId).toLowerCase().includes(search)
      ));
    }
    if (stageFilter !== 'all') list = list.filter(d => d && d.stage === stageFilter);

    list.sort((a, b) => {
      const at = (a && (a.createdAt || a.updatedAt)) || '';
      const bt = (b && (b.createdAt || b.updatedAt)) || '';
      return bt.localeCompare(at);
    });

    const sig = _sigOfArray(list, ['title', 'stage', 'value', 'clientId', 'owner']) +
      '|' + stageFilter + '|' + search;
    if (sig === _sig.deals) return;
    _sig.deals = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="7" class="empty-state">No deals match. Click <strong>New Deal</strong> to add one.</td></tr>`);
      return;
    }

    const stageCls = {
      'Quote Sent': 'sent', 'Negotiation': 'pending', 'Contract Sent': 'pending',
      'Won': 'paid', 'Lost': 'overdue',
    };

    const rows = list.map(d => {
      const client = _getClient(d.clientId);
      const cls = stageCls[d.stage] || 'gray';
      const idSafe = _q(d.id);
      return `<tr>
        <td><strong>${_esc(d.title || '—')}</strong>${d.autoGenerated ? ' <span class="badge badge-purple" style="font-size:.55rem;">AUTO</span>' : ''}</td>
        <td>${_esc(d.clientName || _getClientName(d.clientId))}${client ? _contactButtons(client, 'client') : ''}</td>
        <td><strong>${_fmtKES(d.value)}</strong></td>
        <td><span class="badge badge-${cls}">${_esc(d.stage || '—')}</span></td>
        <td>${_esc(d.owner || '—')}</td>
        <td><small>${_timeAgo(d.createdAt)}</small></td>
        <td style="text-align:right;white-space:nowrap;">
          ${d.stage !== 'Won' && d.stage !== 'Lost'
            ? `<button class="btn btn-success btn-xs" onclick="Viora.markDealWon('${idSafe}')" title="Mark Won"><i class="fa-solid fa-check"></i></button>`
            : ''}
          <button class="btn btn-primary btn-xs" onclick="Viora.editDeal('${idSafe}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteDeal('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderDeals] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PIPELINE KANBAN
   ═══════════════════════════════════════════════════════════════ */
export function renderPipelineKanban() {
  try {
    const host = _safe$('pipelineBoard');
    if (!host) return;

    const stages = ['Quote Sent', 'Negotiation', 'Contract Sent', 'Won', 'Lost'];
    const deals = Array.isArray(_data().deals) ? _data().deals : [];

    // Bucket once.
    const buckets = Object.create(null);
    for (let i = 0; i < stages.length; i++) buckets[stages[i]] = [];
    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      if (!d || !d.stage) continue;
      if (buckets[d.stage]) buckets[d.stage].push(d);
    }

    // Sort within each bucket by value descending.
    for (const stage of stages) {
      buckets[stage].sort((a, b) => _num(b.value) - _num(a.value));
    }

    const sig = stages.map(s => s + ':' + buckets[s].map(d =>
      (d.id || '') + '|' + _num(d.value) + '|' + (d.title || '')
    ).join(',')).join('||');
    if (_hash(sig) === _sig.kanban) return;
    _sig.kanban = _hash(sig);

    const stageColor = {
      'Quote Sent':    'var(--accent-blue)',
      'Negotiation':   'var(--accent-gold)',
      'Contract Sent': 'var(--accent-purple)',
      'Won':           'var(--accent-green)',
      'Lost':          'var(--accent-red)',
    };

    let html = '';
    for (let s = 0; s < stages.length; s++) {
      const stage = stages[s];
      const list = buckets[stage];
      const total = list.reduce((sum, d) => sum + _num(d.value), 0);

      let cards = '';
      if (!list.length) {
        cards = `<div class="empty-state" style="padding:24px 8px;font-size:.75rem;color:var(--text-light);">No deals</div>`;
      } else {
        for (let i = 0; i < list.length; i++) {
          const d = list[i];
          const idSafe = _q(d.id);
          cards += `<div class="kanban-card" draggable="true"
                     data-deal-id="${idSafe}"
                     ondragstart="Viora.kanbanDragStart(event)"
                     onclick="Viora.editDeal('${idSafe}')">
            <div class="kc-title">${_esc(d.title || '—')}</div>
            <div class="kc-sub">${_esc(d.clientName || _getClientName(d.clientId))}</div>
            <div class="kc-value">${_fmtKES(d.value)}</div>
            <div class="kc-meta">${_esc(d.owner || '')}</div>
          </div>`;
        }
      }

      html += `<div class="kanban-col" data-stage="${_esc(stage)}"
                    ondragover="Viora.kanbanDragOver(event)"
                    ondragleave="Viora.kanbanDragLeave(event)"
                    ondrop="Viora.kanbanDrop(event)">
        <div class="kanban-header" style="border-top:3px solid ${stageColor[stage] || 'var(--border-color)'};">
          <span>${_esc(stage)}</span>
          <span style="font-size:.7rem;color:var(--text-secondary);">${list.length} · ${_fmtKES(total)}</span>
        </div>
        <div class="kanban-cards">${cards}</div>
      </div>`;
    }

    host.innerHTML = html;
  } catch (e) {
    console.warn('[renderPipelineKanban] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CONTRACTS
   ═══════════════════════════════════════════════════════════════ */
export function renderContracts() {
  try {
    const tb = _safe$('contractsBody');
    if (!tb) return;

    const list = Array.isArray(_data().contracts) ? _data().contracts.slice() : [];
    list.sort((a, b) => {
      const at = (a && a.expiryDate) || '9999';
      const bt = (b && b.expiryDate) || '9999';
      return at.localeCompare(bt);
    });

    const sig = _sigOfArray(list, ['title', 'status', 'expiryDate', 'value', 'clientId']);
    if (sig === _sig.contracts) return;
    _sig.contracts = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="7" class="empty-state">No contracts yet. Click <strong>New Contract</strong>.</td></tr>`);
      return;
    }

    const statusCls = { 'Active': 'active', 'Draft': 'gray', 'Expired': 'overdue', 'Terminated': 'overdue', 'Completed': 'paid' };

    const rows = list.map(c => {
      let expCls = 'active';
      let expLbl = '—';
      if (c.expiryDate) {
        const d = _daysBetween(c.expiryDate);
        if (d < 0)        { expCls = 'overdue'; expLbl = `Expired ${Math.abs(d)}d ago`; }
        else if (d <= 30) { expCls = 'pending'; expLbl = `${d}d left`; }
        else              { expLbl = _fmtDate(c.expiryDate); }
      }
      const cls = statusCls[c.status] || 'gray';
      const idSafe = _q(c.id);
      return `<tr>
        <td><strong>${_esc(c.title || '—')}</strong></td>
        <td>${_esc(c.clientName || _getClientName(c.clientId))}</td>
        <td>${_fmtKES(c.value)}</td>
        <td>${_fmtDate(c.startDate)}</td>
        <td><span class="badge badge-${expCls}">${_esc(expLbl)}</span></td>
        <td><span class="badge badge-${cls}">${_esc(c.status || '—')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editContract('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteContract('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderContracts] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PROPOSALS
   ═══════════════════════════════════════════════════════════════ */
export function renderProposals() {
  try {
    const tb = _safe$('proposalsBody');
    if (!tb) return;

    const list = Array.isArray(_data().proposals) ? _data().proposals.slice() : [];
    list.sort((a, b) => ((b && b.createdAt) || '').localeCompare((a && a.createdAt) || ''));

    const sig = _sigOfArray(list, ['title', 'sentAt', 'createdAt', 'leadId', 'dealId']);
    if (sig === _sig.proposals) return;
    _sig.proposals = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="6" class="empty-state">No proposals yet. Use the Proposal Studio to generate one.</td></tr>`);
      return;
    }

    const rows = list.map(p => {
      const idSafe = _q(p.id);
      const sent = !!p.sentAt;
      return `<tr>
        <td><strong>${_esc(p.title || '—')}</strong></td>
        <td>${_esc(p.serviceArea || '—')}</td>
        <td>${_esc(p.tone || '—')}</td>
        <td>${sent ? `<span class="badge badge-paid">Sent ${_timeAgo(p.sentAt)}</span>` : '<span class="badge badge-pending">Draft</span>'}</td>
        <td><small>${_timeAgo(p.createdAt)}</small></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.viewProposal && Viora.viewProposal('${idSafe}')" title="View"><i class="fa-solid fa-eye"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteProposal && Viora.deleteProposal('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderProposals] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   APPOINTMENTS
   ═══════════════════════════════════════════════════════════════ */
export function renderAppointments() {
  try {
    const host = _safe$('appointmentsList');
    if (!host) return;

    const filter = _val('apptFilter') || 'all';
    const search = _val('apptSearch').toLowerCase().trim();
    const today = _todayStr();

    let list = Array.isArray(_data().appointments) ? _data().appointments.slice() : [];

    if (filter === 'today')   list = list.filter(a => a && a.date === today && a.status !== 'cancelled');
    else if (filter === 'upcoming') list = list.filter(a => a && a.date >= today && a.status === 'scheduled');
    else if (filter === 'past')     list = list.filter(a => a && a.date < today);

    if (search) {
      list = list.filter(a => a && (
        (a.title || '').toLowerCase().includes(search) ||
        (a.clientName || '').toLowerCase().includes(search) ||
        _getClientName(a.clientId).toLowerCase().includes(search)
      ));
    }

    // Sort: scheduled first (by date), then others by date desc
    list.sort((a, b) => {
      const aSch = a && a.status === 'scheduled' ? 0 : 1;
      const bSch = b && b.status === 'scheduled' ? 0 : 1;
      if (aSch !== bSch) return aSch - bSch;
      const aKey = (a && a.date) + 'T' + ((a && a.startTime) || '00:00');
      const bKey = (b && b.date) + 'T' + ((b && b.startTime) || '00:00');
      return aSch === 0 ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
    });

    const sig = _sigOfArray(list, ['title', 'date', 'startTime', 'status', 'clientId', 'type']) +
      '|' + filter + '|' + search;
    if (sig === _sig.appointments) return;
    _sig.appointments = sig;

    if (!list.length) {
      _setHtml(host, `<div class="empty-state" style="padding:32px;text-align:center;">No appointments match. Click <strong>New Appointment</strong>.</div>`);
      return;
    }

    const statusCls = { 'scheduled': 'pending', 'held': 'paid', 'missed': 'overdue', 'cancelled': 'gray' };

    const html = list.map(a => {
      const cls = statusCls[a.status] || 'gray';
      const idSafe = _q(a.id);
      const todayBadge = a.date === today ? ' <span class="badge badge-overdue" style="font-size:.55rem;">TODAY</span>' : '';
      const mode = a.mode && a.mode !== 'In-person' ? ` · ${_esc(a.mode)}` : '';
      const location = a.location ? `<br><small style="color:var(--text-secondary);">📍 ${_esc(a.location)}</small>` : '';
      const actions = a.status === 'scheduled'
        ? `<button class="btn btn-success btn-xs" onclick="Viora.markAppointmentHeld('${idSafe}')" title="Mark held"><i class="fa-solid fa-check"></i></button>
           <button class="btn btn-gold btn-xs" onclick="Viora.markAppointmentMissed('${idSafe}')" title="Mark missed"><i class="fa-solid fa-xmark"></i></button>`
        : '';
      return `<div class="card-3d ${a.status === 'cancelled' ? 'done' : ''}">
        <div class="card-info">
          <div class="card-title">
            ${_esc(a.title || '—')}${todayBadge}
            <span class="badge badge-${cls}">${_esc(a.status || 'scheduled')}</span>
          </div>
          <div class="card-sub">
            ${_esc(a.clientName || _getClientName(a.clientId))} · ${_esc(a.type || '')}${mode}
            ${location}
          </div>
          <div class="card-stats">
            <div class="stat"><span class="val">${_fmtDate(a.date)}</span><span class="lbl">Date</span></div>
            <div class="stat"><span class="val">${_esc(a.startTime || '—')}</span><span class="lbl">Start</span></div>
            <div class="stat"><span class="val">${_esc(a.assignedName || '—')}</span><span class="lbl">Owner</span></div>
          </div>
        </div>
        <div class="card-actions">
          ${actions}
          <button class="btn btn-primary btn-xs" onclick="Viora.editAppointment('${idSafe}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteAppointment('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');

    _setHtml(host, html);
  } catch (e) {
    console.warn('[renderAppointments] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PRESENTATIONS
   ═══════════════════════════════════════════════════════════════ */
export function renderPresentations() {
  try {
    const host = _safe$('presentationsList');
    if (!host) return;

    const filter = _val('presFilter') || 'all';
    const search = _val('presSearch').toLowerCase().trim();

    let list = Array.isArray(_data().presentations) ? _data().presentations.slice() : [];

    if (filter !== 'all') list = list.filter(p => p && p.status === filter);
    if (search) {
      list = list.filter(p => p && (
        (p.title || '').toLowerCase().includes(search) ||
        (p.clientName || '').toLowerCase().includes(search) ||
        _getClientName(p.clientId).toLowerCase().includes(search)
      ));
    }

    list.sort((a, b) => {
      const ak = (a && a.date) || '';
      const bk = (b && b.date) || '';
      return bk.localeCompare(ak);
    });

    const sig = _sigOfArray(list, ['title', 'date', 'status', 'clientId', 'type']) + '|' + filter + '|' + search;
    if (sig === _sig.presentations) return;
    _sig.presentations = sig;

    if (!list.length) {
      _setHtml(host, `<div class="empty-state" style="padding:32px;text-align:center;">No presentations match. Click <strong>New Presentation</strong>.</div>`);
      return;
    }

    const statusCls = {
      'delivered': 'sent', 'accepted': 'paid', 'rejected': 'overdue',
      'follow-up': 'pending', 'closed': 'gray',
    };

    const html = list.map(p => {
      const cls = statusCls[p.status] || 'gray';
      const idSafe = _q(p.id);
      return `<div class="card-3d">
        <div class="card-info">
          <div class="card-title">
            ${_esc(p.title || '—')}
            <span class="badge badge-${cls}">${_esc(p.status || '—')}</span>
          </div>
          <div class="card-sub">
            ${_esc(p.clientName || _getClientName(p.clientId))} · ${_esc(p.type || '')} · ${_esc(p.channel || '')}
          </div>
          <div class="card-stats">
            <div class="stat"><span class="val">${_fmtDate(p.date)}</span><span class="lbl">Date</span></div>
            <div class="stat"><span class="val">${_esc(p.presenterName || '—')}</span><span class="lbl">Presenter</span></div>
            <div class="stat"><span class="val">${(p.attachments || []).length}</span><span class="lbl">Files</span></div>
          </div>
          ${p.outcome ? `<div class="card-sub" style="margin-top:6px;color:var(--accent-green);">→ ${_esc(p.outcome)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-xs" onclick="Viora.editPresentation('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePresentation('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }).join('');
        /* ★ KPI strip — count from the FULL dataset, not the filtered list */
    try {
      const allPres = Array.isArray(_data().presentations) ? _data().presentations : [];
      let total = 0, delivered = 0, accepted = 0, rejected = 0;
      for (let i = 0; i < allPres.length; i++) {
        const p = allPres[i];
        if (!p) continue;
        total++;
        if (p.status === 'delivered') delivered++;
        else if (p.status === 'accepted') accepted++;
        else if (p.status === 'rejected') rejected++;
      }
      const setTxt = (id, v) => {
        const el = _safe$(id);
        if (el && el.textContent !== String(v)) el.textContent = String(v);
      };
      setTxt('prTotal', total);
      setTxt('prDelivered', delivered);
      setTxt('prAccepted', accepted);
      setTxt('prRejected', rejected);
    } catch (_) {}

    _setHtml(host, html);
  } catch (e) {
    console.warn('[renderPresentations] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   INVENTORY
   ═══════════════════════════════════════════════════════════════ */
export function renderInventory() {
  try {
    const tb = _safe$('inventoryBody');
    if (!tb) return;

    const search = _val('inventorySearch').toLowerCase().trim();
    const filter = _val('inventoryFilterStatus') || 'all';

    let list = Array.isArray(_data().inventory) ? _data().inventory.slice() : [];

    if (search) {
      list = list.filter(i => i && (
        (i.name || '').toLowerCase().includes(search) ||
        (i.sku || '').toLowerCase().includes(search)
      ));
    }
    if (filter === 'low') list = list.filter(i => i && _num(i.qty) <= _num(i.reorder));
    else if (filter === 'out') list = list.filter(i => i && _num(i.qty) <= 0);

    list.sort((a, b) => {
      const aLow = _num(a && a.qty) <= _num(a && a.reorder) ? 0 : 1;
      const bLow = _num(b && b.qty) <= _num(b && b.reorder) ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return (a && a.name || '').localeCompare(b && b.name || '');
    });

    const sig = _sigOfArray(list, ['sku', 'name', 'qty', 'reorder', 'price']) + '|' + filter + '|' + search;
    if (sig === _sig.inventory) return;
    _sig.inventory = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="8" class="empty-state">No inventory items match. Click <strong>New Item</strong>.</td></tr>`);
      return;
    }

    const rows = list.map(i => {
      const qty = _num(i.qty);
      const reorder = _num(i.reorder);
      const low = qty <= reorder;
      const out = qty <= 0;
      const cls = out ? 'overdue' : low ? 'pending' : 'active';
      const idSafe = _q(i.id);
      const source = i._source === 'product' ? ' <span class="badge badge-purple" style="font-size:.55rem;">MIRROR</span>' : '';
      return `<tr>
        <td style="font-family:monospace;font-size:.75rem;">${_esc(i.sku || '—')}</td>
        <td><strong>${_esc(i.name || '—')}</strong>${source}</td>
        <td><span class="badge badge-${cls}">${qty}</span></td>
        <td>${reorder}</td>
        <td>${_fmtKES(i.cost)}</td>
        <td>${_fmtKES(i.price)}</td>
        <td>${_fmtKES(qty * _num(i.price))}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn btn-primary btn-xs" onclick="Viora.editInventory('${idSafe}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteInventory('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderInventory] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   INVOICES
   ═══════════════════════════════════════════════════════════════ */
export function renderInvoices() {
  try {
    const tb = _safe$('invoicesBody');
    if (!tb) return;

    const search = _val('invoiceSearch').toLowerCase().trim();
    const filter = _val('invoiceFilterStatus') || 'all';

    let list = Array.isArray(_data().invoices) ? _data().invoices.slice() : [];

    if (search) {
      list = list.filter(inv => inv && (
        (inv.number || '').toLowerCase().includes(search) ||
        _getClientName(inv.clientId).toLowerCase().includes(search)
      ));
    }
    if (filter !== 'all') {
      list = list.filter(inv => _getInvoiceStatus(inv) === filter);
    }

    list.sort((a, b) => ((b && b.date) || '').localeCompare((a && a.date) || ''));

    // Aggregate KPI totals for the header strip (single pass).
    let totalAll = 0, totalPaid = 0, totalOutstanding = 0, unpaidCount = 0, overdueCount = 0;
    const today = _todayStr();
    const allInvoices = Array.isArray(_data().invoices) ? _data().invoices : [];
    for (let i = 0; i < allInvoices.length; i++) {
      const inv = allInvoices[i];
      if (!inv) continue;
      const t = _num(_getInvoiceTotals(inv).total);
      const p = _num(_getInvoicePaid(inv.id));
      totalAll += t;
      totalPaid += p;
      const st = _getInvoiceStatus(inv);
      if (st !== 'paid' && st !== 'draft') {
        unpaidCount++;
        totalOutstanding += Math.max(0, t - p);
        if (st === 'overdue' || (inv.dueDate && inv.dueDate < today && st !== 'paid')) overdueCount++;
      }
    }

    _updateKpiStrip({
      invoicesTotal: totalAll,
      invoicesPaid: totalPaid,
      invoicesOutstanding: totalOutstanding,
      invoicesUnpaidCount: unpaidCount,
      invoicesOverdueCount: overdueCount,
    });

    const sig = _sigOfArray(list, ['number', 'date', 'dueDate', 'status', 'currency', 'clientId']) +
      '|' + filter + '|' + search;
    if (sig === _sig.invoices) return;
    _sig.invoices = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="8" class="empty-state">No invoices match. Click <strong>Generate Invoice</strong>.</td></tr>`);
      return;
    }

    const rows = list.map(inv => {
      const total = _num(_getInvoiceTotals(inv).total);
      const paid = _num(_getInvoicePaid(inv.id));
      const balance = Math.max(0, total - paid);
      const st = _getInvoiceStatus(inv);
      const idSafe = _q(inv.id);
      return `<tr>
        <td><strong>${_esc(inv.number || '—')}</strong></td>
        <td>${_esc(_getClientName(inv.clientId))}</td>
        <td>${_fmtDate(inv.date)}</td>
        <td>${_fmtDate(inv.dueDate)}</td>
        <td><strong>${_fmtKES(total, inv.currency)}</strong></td>
        <td style="color:var(--accent-green);">${_fmtKES(paid, inv.currency)}</td>
        <td style="color:${balance > 0 ? 'var(--accent-gold)' : 'var(--accent-green)'};font-weight:600;">${_fmtKES(balance, inv.currency)}</td>
        <td>
          <span class="badge badge-${_esc(st)}">${_esc(st)}</span>
          <div style="margin-top:4px;white-space:nowrap;">
            <button class="btn btn-primary btn-xs" onclick="Viora.viewInvoice('${idSafe}')" title="View"><i class="fa-solid fa-eye"></i></button>
            <button class="btn btn-danger btn-xs" onclick="Viora.deleteInvoice('${idSafe}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderInvoices] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PAYMENTS
   ═══════════════════════════════════════════════════════════════ */
export function renderPayments() {
  try {
    const tb = _safe$('paymentsBody');
    if (!tb) return;

    const search = _val('paymentSearch').toLowerCase().trim();
    let list = Array.isArray(_data().payments) ? _data().payments.slice() : [];

    if (search) {
      list = list.filter(p => p && (
        (p.reference || '').toLowerCase().includes(search) ||
        _getClientName(p.clientId).toLowerCase().includes(search) ||
        (p.method || '').toLowerCase().includes(search)
      ));
    }

    list.sort((a, b) => ((b && b.date) || '').localeCompare((a && a.date) || ''));

    // Aggregate totals.
    let totalReceived = 0;
    const all = _data().payments || [];
    for (let i = 0; i < all.length; i++) totalReceived += _num(all[i] && all[i].amount);

    _updateKpiStrip({
      paymentsTotal: totalReceived,
      paymentsCount: all.length,
    });

    const sig = _sigOfArray(list, ['amount', 'date', 'method', 'reference', 'clientId']) + '|' + search;
    if (sig === _sig.payments) return;
    _sig.payments = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="7" class="empty-state">No payments match. Click <strong>Record Payment</strong>.</td></tr>`);
      return;
    }

    const rows = list.map(p => {
      const idSafe = _q(p.id);
      return `<tr>
        <td>${_fmtDate(p.date)}</td>
        <td><strong>${_esc(_getClientName(p.clientId))}</strong></td>
        <td>${p.projectId ? `<span class="badge badge-purple">${_esc(_getProjectNumber(p.projectId))}</span>` : '—'}</td>
        <td><strong style="color:var(--accent-green);">${_fmtKES(p.amount, p.currency)}</strong></td>
        <td><span class="badge badge-active">${_esc(p.method || '—')}</span></td>
        <td><small style="font-family:monospace;">${_esc(p.reference || '—')}</small></td>
        <td style="text-align:right;">
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePayment('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderPayments] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   LEDGER
   ═══════════════════════════════════════════════════════════════ */
export function renderLedger() {
  try {
    const tb = _safe$('ledgerBody');
    if (!tb) return;

    const list = Array.isArray(_data().ledger) ? _data().ledger.slice() : [];
    list.sort((a, b) => ((b && b.date) || '').localeCompare((a && a.date) || ''));

    // Aggregate.
    let totalDebit = 0, totalCredit = 0;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const lines = (entry && entry.lines) || [];
      for (let j = 0; j < lines.length; j++) {
        totalDebit += _num(lines[j].debit);
        totalCredit += _num(lines[j].credit);
      }
    }

    _updateKpiStrip({
      ledgerDebit: totalDebit,
      ledgerCredit: totalCredit,
      ledgerDifference: totalDebit - totalCredit,
    });

    const sig = _sigOfArray(list, ['date', 'memo', 'refType', 'refId']) +
      '|' + totalDebit.toFixed(2) + '|' + totalCredit.toFixed(2);
    if (sig === _sig.ledger) return;
    _sig.ledger = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="6" class="empty-state">No ledger entries. Click <strong>Post Journal</strong> to record one.</td></tr>`);
      return;
    }

    const rows = list.map(entry => {
      const lines = Array.isArray(entry && entry.lines) ? entry.lines : [];
      let debit = 0, credit = 0;
      for (let i = 0; i < lines.length; i++) {
        debit += _num(lines[i].debit);
        credit += _num(lines[i].credit);
      }
      const detail = lines.map(l =>
        `<div style="font-size:.72rem;">${_esc(l.account || '')}: ${l.debit ? 'DR ' + _fmtKES(l.debit) : ''}${l.debit && l.credit ? ' · ' : ''}${l.credit ? 'CR ' + _fmtKES(l.credit) : ''}</div>`
      ).join('');
      return `<tr>
        <td>${_fmtDate(entry.date)}</td>
        <td><strong>${_esc(entry.memo || '—')}</strong><div style="margin-top:4px;">${detail}</div></td>
        <td><span class="badge badge-purple">${_esc(entry.refType || '—')}</span></td>
        <td><small style="font-family:monospace;">${_esc(entry.refId || '—')}</small></td>
        <td style="text-align:right;">${_fmtKES(debit)}</td>
        <td style="text-align:right;">${_fmtKES(credit)}</td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderLedger] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   EXPENSES
   ═══════════════════════════════════════════════════════════════ */
export function renderExpenses() {
  try {
    const tb = _safe$('expensesBody');
    if (!tb) return;

    const search = _val('expenseSearch').toLowerCase().trim();
    const filter = _val('expenseFilterStatus') || 'all';

    let list = Array.isArray(_data().expenses) ? _data().expenses.slice() : [];

    if (search) {
      list = list.filter(e => e && (
        (e.vendor || '').toLowerCase().includes(search) ||
        (e.description || '').toLowerCase().includes(search) ||
        (e.category || '').toLowerCase().includes(search)
      ));
    }
    if (filter !== 'all') list = list.filter(e => e && e.status === filter);

    list.sort((a, b) => ((b && b.date) || '').localeCompare((a && a.date) || ''));

    const all = _data().expenses || [];
    let total = 0, pending = 0;
    for (let i = 0; i < all.length; i++) {
      total += _num(all[i] && all[i].amount);
      if (all[i] && all[i].status === 'Pending') pending += _num(all[i].amount);
    }

    _updateKpiStrip({
      expensesTotal: total,
      expensesPending: pending,
    });

    const sig = _sigOfArray(list, ['vendor', 'amount', 'date', 'status', 'category']) + '|' + filter + '|' + search;
    if (sig === _sig.expenses) return;
    _sig.expenses = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="7" class="empty-state">No expenses match. Click <strong>Record Expense</strong>.</td></tr>`);
      return;
    }

    const statusCls = { 'Pending': 'pending', 'Approved': 'sent', 'Paid': 'paid', 'Rejected': 'overdue' };

    const rows = list.map(e => {
      const cls = statusCls[e.status] || 'gray';
      const idSafe = _q(e.id);
      return `<tr>
        <td>${_fmtDate(e.date)}</td>
        <td><strong>${_esc(e.vendor || '—')}</strong></td>
        <td><span class="badge badge-purple">${_esc(e.category || '—')}</span></td>
        <td>${_esc(e.method || '—')}</td>
        <td><strong>${_fmtKES(e.amount)}</strong></td>
        <td><span class="badge badge-${cls}">${_esc(e.status || '—')}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-danger btn-xs" onclick="Viora.deleteExpense('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderExpenses] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PAYROLL
   ═══════════════════════════════════════════════════════════════ */
export function renderPayroll() {
  try {
    const tb = _safe$('payrollBody');
    if (!tb) return;

    const filter = _val('payrollFilterPeriod') || 'all';
    let list = Array.isArray(_data().payroll) ? _data().payroll.slice() : [];

    if (filter !== 'all') list = list.filter(p => p && p.period === filter);

    list.sort((a, b) => {
      const ap = (a && a.period) || '';
      const bp = (b && b.period) || '';
      if (ap !== bp) return bp.localeCompare(ap);
      return ((a && a.employeeName) || '').localeCompare((b && b.employeeName) || '');
    });

    // Aggregate.
    const all = _data().payroll || [];
    let totalGross = 0, totalNet = 0, totalStatutory = 0;
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (!p) continue;
      totalGross += _num(p.gross);
      totalNet += _num(p.net);
      const ded = p.deductions || {};
      totalStatutory += _num(ded.paye) + _num(ded.nssf) + _num(ded.shif) + _num(ded.housingLevy);
    }

    _updateKpiStrip({
      payrollGross: totalGross,
      payrollNet: totalNet,
      payrollStatutory: totalStatutory,
    });

    const sig = _sigOfArray(list, ['employeeId', 'period', 'gross', 'net', 'status']) + '|' + filter;
    if (sig === _sig.payroll) return;
    _sig.payroll = sig;

    if (!list.length) {
      _setHtml(tb, `<tr><td colspan="8" class="empty-state">No payroll runs match. Click <strong>Run Payroll</strong>.</td></tr>`);
      return;
    }

    const rows = list.map(p => {
      const idSafe = _q(p.id);
      const ded = p.deductions || {};
      const deductStr = [
        ded.paye ? `PAYE ${_fmtKES(ded.paye)}` : '',
        ded.nssf ? `NSSF ${_fmtKES(ded.nssf)}` : '',
        ded.shif ? `SHIF ${_fmtKES(ded.shif)}` : '',
        ded.housingLevy ? `Housing ${_fmtKES(ded.housingLevy)}` : '',
      ].filter(Boolean).join(' · ') || '—';
      const statusCls = p.status === 'Paid' ? 'paid' : 'pending';
      const anomaly = p.anomalyFlag ? ' <span class="badge badge-overdue" style="font-size:.55rem;">⚠</span>' : '';
      return `<tr>
        <td><strong>${_esc(p.employeeName || _getEmployeeName(p.employeeId))}</strong>${anomaly}</td>
        <td>${_esc(p.period || '—')}</td>
        <td>${_num(p.attendance)}</td>
        <td>${_fmtKES(p.gross)}</td>
        <td><small>${_esc(deductStr)}</small></td>
        <td><strong style="color:var(--accent-green);">${_fmtKES(p.net)}</strong></td>
        <td><span class="badge badge-${statusCls}">${_esc(p.status || 'Pending')}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          ${p.status !== 'Paid' ? `<button class="btn btn-success btn-xs" onclick="Viora.markPayrollPaid('${idSafe}')" title="Mark paid"><i class="fa-solid fa-check"></i></button>` : ''}
          <button class="btn btn-danger btn-xs" onclick="Viora.deletePayroll('${idSafe}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');

    _setHtml(tb, rows);
  } catch (e) {
    console.warn('[renderPayroll] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   KPI STRIP (soft update helper)
   ═══════════════════════════════════════════════════════════════ */
function _updateKpiStrip(map) {
  const setTxt = (id, v) => {
    const el = _safe$(id);
    if (!el) return;
    const s = typeof v === 'string' ? v : String(v);
    if (el.textContent !== s) el.textContent = s;
  };

  if ('invoicesTotal' in map)               setTxt('invKpiTotal',       _fmtKES(map.invoicesTotal));
  if ('invoicesPaid' in map)                setTxt('invKpiPaid',        _fmtKES(map.invoicesPaid));
  if ('invoicesOutstanding' in map)         setTxt('invKpiOutstanding', _fmtKES(map.invoicesOutstanding));
  if ('invoicesUnpaidCount' in map)         setTxt('invKpiUnpaid',      String(map.invoicesUnpaidCount));
  if ('invoicesOverdueCount' in map)        setTxt('invKpiOverdue',     String(map.invoicesOverdueCount));

  if ('paymentsTotal' in map)               setTxt('payKpiTotal',       _fmtKES(map.paymentsTotal));
  if ('paymentsCount' in map)               setTxt('payKpiCount',       String(map.paymentsCount));

  if ('ledgerDebit' in map)                 setTxt('ledKpiDebit',       _fmtKES(map.ledgerDebit));
  if ('ledgerCredit' in map)                setTxt('ledKpiCredit',      _fmtKES(map.ledgerCredit));
  if ('ledgerDifference' in map) {
    const el = _safe$('ledKpiDiff');
    if (el) {
      el.textContent = _fmtKES(map.ledgerDifference);
      el.style.color = Math.abs(map.ledgerDifference) < 0.01 ? 'var(--accent-green)' : 'var(--accent-red)';
    }
  }

  if ('expensesTotal' in map)               setTxt('expKpiTotal',       _fmtKES(map.expensesTotal));
  if ('expensesPending' in map)             setTxt('expKpiPending',     _fmtKES(map.expensesPending));

  if ('payrollGross' in map)                setTxt('prKpiGross',        _fmtKES(map.payrollGross));
  if ('payrollNet' in map)                  setTxt('prKpiNet',          _fmtKES(map.payrollNet));
  if ('payrollStatutory' in map)            setTxt('prKpiStatutory',    _fmtKES(map.payrollStatutory));
}

/* ═══════════════════════════════════════════════════════════════
   FEE SUMMARY (used by buildVioraHandlers / finance.js)
   ═══════════════════════════════════════════════════════════════ */
export function getFeeSummary(clientId) {
  try {
    if (!clientId) return { totalFees: 0, totalPaid: 0, balance: 0, installments: [], progress: 0 };

    const client = _getClient(clientId);
    const projects = Array.isArray(_data().projects)
      ? _data().projects.filter(p => p && p.clientId === clientId && p.status !== 'cancelled')
      : [];

    let agreed = 0, paid = 0;
    for (let i = 0; i < projects.length; i++) {
      agreed += _getProjectAgreed(projects[i].id);
      paid   += _getProjectPaid(projects[i].id);
    }

    // Fall back to client-level installments if no projects.
    if (!projects.length && client) {
      const insts = Array.isArray(client.installments) ? client.installments : [];
      for (let i = 0; i < insts.length; i++) {
        agreed += _num(insts[i] && insts[i].amount);
        if (insts[i] && insts[i].paid) paid += _num(insts[i].amount);
      }
    }

    return {
      totalFees: agreed,
      totalPaid: paid,
      balance: Math.max(0, agreed - paid),
      installments: (client && Array.isArray(client.installments)) ? client.installments : [],
      progress: agreed > 0 ? Math.min(100, (paid / agreed) * 100) : 0,
    };
  } catch (e) {
    console.warn('[getFeeSummary] failed', e);
    return { totalFees: 0, totalPaid: 0, balance: 0, installments: [], progress: 0 };
  }
}

/* ═══════════════════════════════════════════════════════════════
   PRESENTATION ATTACHMENTS
   ═══════════════════════════════════════════════════════════════ */
export function renderPresAttachments() {
  try {
    const host = _safe$('presAttachList');
    if (!host) return;

    const s = _state();
    const list = Array.isArray(s.pendingPresAttachments) ? s.pendingPresAttachments : [];

    const sig = list.map(a => `${a.id || ''}|${a.name || ''}|${a.size || 0}`).join(',');
    if (_hash(sig) === _sig.presAttach) return;
    _sig.presAttach = _hash(sig);

    if (!list.length) {
      _setHtml(host, `<div style="font-size:.75rem;color:var(--text-light);padding:6px 0;">No attachments yet.</div>`);
      return;
    }

    const fmtBytes = typeof _d().fmtBytes === 'function'
      ? (n) => { try { return _d().fmtBytes(n); } catch (_) { return String(n) + ' B'; } }
      : (n) => {
          const b = _num(n);
          if (b < 1024) return b + ' B';
          if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
          return (b / 1048576).toFixed(1) + ' MB';
        };

    /* ★ v9.6 — Show a distinct icon per MIME type, and add a View button */
    const iconFor = (mime, name) => {
      const m = String(mime || '').toLowerCase();
      const n = String(name || '').toLowerCase();
      if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return 'fa-file-image';
      if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'fa-file-pdf';
      if (m.startsWith('video/') || /\.(mp4|webm|mov|avi)$/.test(n)) return 'fa-file-video';
      if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/.test(n)) return 'fa-file-audio';
      if (/\.(xls|xlsx|csv)$/.test(n)) return 'fa-file-excel';
      if (/\.(doc|docx)$/.test(n)) return 'fa-file-word';
      if (/\.(ppt|pptx)$/.test(n)) return 'fa-file-powerpoint';
      if (m.startsWith('text/') || /\.(txt|md)$/.test(n)) return 'fa-file-lines';
      if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'fa-file-zipper';
      return 'fa-paperclip';
    };

    const html = list.map((a, i) => {
      const icon = iconFor(a.mime, a.name);
      const hasData = !!a.data;
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:8px;margin-bottom:4px;">
        <i class="fa-solid ${icon}" style="color:var(--accent-blue);font-size:1rem;width:18px;text-align:center;"></i>
        <span style="flex:1;font-size:.78rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(a.name || '—')}">${_esc(a.name || '—')}</span>
        <span style="font-size:.68rem;color:var(--text-secondary);white-space:nowrap;">${fmtBytes(a.size || 0)}</span>
        ${hasData ? `<button type="button" class="btn btn-primary btn-xs" onclick="Viora.viewPresAttachment && Viora.viewPresAttachment(${i})" title="Preview"><i class="fa-solid fa-eye"></i></button>` : ''}
        ${hasData ? `<button type="button" class="btn btn-outline btn-xs" onclick="Viora.downloadPresAttachment && Viora.downloadPresAttachment(${i})" title="Download"><i class="fa-solid fa-download"></i></button>` : ''}
        <button type="button" class="btn btn-danger btn-xs" onclick="Viora.removePresAttachment && Viora.removePresAttachment(${i})" title="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>
    `;
    }).join('');

    _setHtml(host, html);
  } catch (e) {
    console.warn('[renderPresAttachments] failed', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   THIN BRIDGES — pass-through to marketplace module when available
   ═══════════════════════════════════════════════════════════════ */
function _bridgeRenderMsProductsList() {
  const d = _d();
  if (typeof d.renderMsProductsList === 'function') {
    try { return d.renderMsProductsList(); } catch (_) {}
  }
}

function _bridgeRenderMsSummary() {
  const d = _d();
  if (typeof d.renderMsSummary === 'function') {
    try { return d.renderMsSummary(); } catch (_) {}
  }
}

function _bridgeApplyCampMediaTypeUI(type) {
  const d = _d();
  if (typeof d.applyCampMediaTypeUI === 'function') {
    try { return d.applyCampMediaTypeUI(type); } catch (_) {}
  }
}

/* ═══════════════════════════════════════════════════════════════
   LEAD SYNC HELPERS
   ─────────────────────────────────────────────────────────────
   These are the missing implementations that main.js wraps as
   window.__vioraDedupeLeads / __vioraSyncMarketToLeads /
   __vioraSyncBlueprintLeads / __vioraSyncOrderLeads.

   Each is idempotent, uses upsertDoc / deleteDoc (injected), and
   never throws on the happy path.
   ═══════════════════════════════════════════════════════════════ */

/** Merge duplicate leads by normalised email, keeping the first non-converted
 *  one and deleting the rest. Also skips emails that already have a client. */
export async function dedupeLeads() {
  try {
    const leads = Array.isArray(_data().leads) ? _data().leads.slice() : [];
    if (!leads.length) return { removed: 0 };

    const normEmail = (typeof _d().normalizeEmail === 'function')
      ? _d().normalizeEmail
      : (e) => String(e || '').toLowerCase().trim();

    const clientEmails = new Set(
      (_data().entities || [])
        .filter(e => e && e.type === 'client' && e.email)
        .map(e => normEmail(e.email))
    );

    /* ➕ NEW — blocklist guard. Emails here are permanently deleted leads
       and must never be re-materialized nor re-deduped into existence. */
    const blocklist = new Set(
      (Array.isArray(_data().deletedMarketEmails) ? _data().deletedMarketEmails : [])
        .map(normEmail)
    );

    const byKey = new Map();
    const toDelete = [];

    for (const l of leads) {
      if (!l) continue;
      const email = normEmail(l.email);
      if (!email) continue;

      // ➕ NEW — blocklisted lead: remove it from state.data.leads
      if (blocklist.has(email)) {
        toDelete.push(l.id);
        continue;
      }

      // Skip leads whose email is already a client.
      if (clientEmails.has(email)) {
        toDelete.push(l.id);
        continue;
      }
    

      const existing = byKey.get(email);
      if (!existing) {
        byKey.set(email, l);
        continue;
      }

      // Prefer "Converted" status.
      if (l.status === 'Converted' && existing.status !== 'Converted') {
        toDelete.push(existing.id);
        byKey.set(email, l);
      } else {
        toDelete.push(l.id);
      }
    }

    let removed = 0;
    for (const id of toDelete) {
      try {
        await _deleteDoc('leads', id, false);
        removed++;
      } catch (e) {
        console.warn('[dedupeLeads] delete failed', id, e);
      }
    }

    if (removed > 0) {
      await _logActivity('delete', 'Leads deduplicated', `${removed} duplicate(s) removed`);
    }

    return { removed };
  } catch (e) {
    console.warn('[dedupeLeads] failed', e);
    return { removed: 0, error: String(e && e.message || e) };
  }
}

/** For each marketplace lead, ensure a matching entry exists in `leads`. */
/** For each marketplace lead, ensure a matching entry exists in `leads`. */
export async function syncMarketToLeads() {
  try {
    const market = Array.isArray(_data().marketLeads) ? _data().marketLeads : [];
    if (!market.length) return { created: 0 };

    const normEmail = (typeof _d().normalizeEmail === 'function')
      ? _d().normalizeEmail
      : (e) => String(e || '').toLowerCase().trim();

    const leadEmails = new Set(
      (_data().leads || [])
        .filter(l => l && l.email)
        .map(l => normEmail(l.email))
    );

    const clientEmails = new Set(
      (_data().entities || [])
        .filter(e => e && e.type === 'client' && e.email)
        .map(e => normEmail(e.email))
    );

    /* ➕ NEW — blocklist guard. Skip re-creating leads that were deleted. */
    const blocklist = new Set(
      (Array.isArray(_data().deletedMarketEmails) ? _data().deletedMarketEmails : [])
        .map(normEmail)
    );

    let created = 0;
    for (const m of market) {
      if (!m) continue;
      const email = normEmail(m.email);
      if (!email) continue;
      if (leadEmails.has(email)) continue;
      if (clientEmails.has(email)) continue;
      if (blocklist.has(email)) continue;   // ➕ NEW

      const lead = {
        id: m.leadId || ('mkt-lead-' + email.replace(/[^a-z0-9]/g, '-')),
        fullName: m.name || m.email || 'Marketplace Lead',
        email: m.email || '',
        phone: m.phone || '',
        source: 'Marketplace',
        status: m.status === 'customer' ? 'Qualified' : 'New',
        campaignId: null,
        campaignName: 'Marketplace',
        notes: m.lastProductName ? `Interested in: ${m.lastProductName}` : '',
        createdAt: m.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _fromMarket: true,
      };

      try {
        await _upsertDoc('leads', lead);
        leadEmails.add(email);
        created++;
      } catch (e) {
        console.warn('[syncMarketToLeads] create failed', email, e);
      }
    }

    if (created > 0) {
      await _logActivity('add', 'Marketplace leads synced', `${created} new lead(s) created`);
    }

    return { created };
  } catch (e) {
    console.warn('[syncMarketToLeads] failed', e);
    return { created: 0, error: String(e && e.message || e) };
  }
}

/** For each marketplace purchase/interest, ensure a Blueprint-style lead exists. */
/** For each marketplace purchase/interest, ensure a Blueprint-style lead exists. */
export async function syncBlueprintLeads() {
  try {
    // Blueprint leads come from the public "request a blueprint" form.
    // If a `blueprintLeads` node exists in state.data, mirror them into `leads`.
    const bp = Array.isArray(_data().blueprintLeads) ? _data().blueprintLeads : [];
    if (!bp.length) return { created: 0 };

    const normEmail = (typeof _d().normalizeEmail === 'function')
      ? _d().normalizeEmail
      : (e) => String(e || '').toLowerCase().trim();

    const leadEmails = new Set(
      (_data().leads || [])
        .filter(l => l && l.email)
        .map(l => normEmail(l.email))
    );

    /* ➕ NEW — blocklist guard. */
    const blocklist = new Set(
      (Array.isArray(_data().deletedMarketEmails) ? _data().deletedMarketEmails : [])
        .map(normEmail)
    );

    let created = 0;
    for (const b of bp) {
      if (!b) continue;
      const email = normEmail(b.email);
      if (!email || leadEmails.has(email)) continue;
      if (blocklist.has(email)) continue;   // ➕ NEW

      const lead = {
        id: 'bp-lead-' + email.replace(/[^a-z0-9]/g, '-'),
        fullName: b.name || b.email || 'Blueprint Lead',
        email: b.email || '',
        phone: b.phone || '',
        source: 'Blueprint',
        status: 'New',
        campaignId: null,
        campaignName: 'Blueprint Form',
        notes: b.industry ? `Industry: ${b.industry}` : (b.notes || ''),
        createdAt: b.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _fromBlueprint: true,
      };

      try {
        await _upsertDoc('leads', lead);
        leadEmails.add(email);
        created++;
      } catch (e) {
        console.warn('[syncBlueprintLeads] create failed', email, e);
      }
    }

    if (created > 0) {
      await _logActivity('add', 'Blueprint leads synced', `${created} new lead(s) created`);
    }

    return { created };
  } catch (e) {
    console.warn('[syncBlueprintLeads] failed', e);
    return { created: 0, error: String(e && e.message || e) };
  }
}

/** For each marketplace order, create a lead if none exists for that email. */
export async function syncOrderLeads() {
  try {
    const orders = Array.isArray(_data().orders) ? _data().orders : [];
    if (!orders.length) return { created: 0 };

    const normEmail = (typeof _d().normalizeEmail === 'function')
      ? _d().normalizeEmail
      : (e) => String(e || '').toLowerCase().trim();

    const leadEmails = new Set(
      (_data().leads || [])
        .filter(l => l && l.email)
        .map(l => normEmail(l.email))
    );

    const clientEmails = new Set(
      (_data().entities || [])
        .filter(e => e && e.type === 'client' && e.email)
        .map(e => normEmail(e.email))
    );

    /* ➕ NEW — blocklist guard. Skip re-creating leads that were deleted. */
    const blocklist = new Set(
      (Array.isArray(_data().deletedMarketEmails) ? _data().deletedMarketEmails : [])
        .map(normEmail)
    );

    let created = 0;
    const seen = new Set();
    for (const o of orders) {
      if (!o) continue;
      const email = normEmail(o.customerEmail);
      if (!email) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      if (leadEmails.has(email)) continue;
      if (clientEmails.has(email)) continue;
      if (blocklist.has(email)) continue;   // ➕ NEW

      const lead = {
        id: 'ord-lead-' + email.replace(/[^a-z0-9]/g, '-'),
        fullName: o.customerName || o.customerEmail || 'Order Customer',
        email: o.customerEmail || '',
        phone: o.customerPhone || '',
        source: 'Marketplace',
        status: 'Qualified',
        campaignId: null,
        campaignName: 'Marketplace Order',
        notes: `Order ${o.id} — ${_fmtKES(o.totalKES)}`,
        createdAt: o.timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _fromMarket: true,
      };

      try {
        await _upsertDoc('leads', lead);
        leadEmails.add(email);
        created++;
      } catch (e) {
        console.warn('[syncOrderLeads] create failed', email, e);
      }
    }

    if (created > 0) {
      await _logActivity('add', 'Order leads synced', `${created} new lead(s) created`);
    }

    return { created };
  } catch (e) {
    console.warn('[syncOrderLeads] failed', e);
    return { created: 0, error: String(e && e.message || e) };
  }
}
