/* VIORA Engineering Command Centre — session diagnostics and governance tools.
   All sensitive exports remain in the user's browser; no data is uploaded by this module. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state = () => window.state || {};
const root = () => document.getElementById('engineeringCommandRoot');
let sessionErrors = 0;
let lastHealth = null;

if (!window.__vioraEngineeringErrorHooks) {
  window.__vioraEngineeringErrorHooks = true;
  window.addEventListener('error', () => { sessionErrors += 1; });
  window.addEventListener('unhandledrejection', () => { sessionErrors += 1; });
}

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function rows(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.entries(value).map(([id, item]) => item && typeof item === 'object' ? ({ id: item.id || id, ...item }) : item).filter(Boolean);
  return [];
}
function clientRecords() {
  const data = state().data || {};
  const source = rows(data.entities).filter(x => x && (x.type === 'client' || x.entityType === 'client' || x.kind === 'client'));
  const fallback = rows(data.clients || data.customers);
  return source.length ? source : fallback;
}
function safeData(value, depth = 0) {
  if (depth > 12 || value == null) return value;
  if (Array.isArray(value)) return value.map(v => safeData(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (/password|secret|token|api[_-]?key|private[_-]?key|credential|refresh.?token/i.test(key)) continue;
    out[key] = safeData(val, depth + 1);
  }
  return out;
}
function hasClientReference(value, clientId, clientName, projectIds, depth = 0) {
  if (depth > 5 || value == null) return false;
  if (Array.isArray(value)) return value.some(v => hasClientReference(v, clientId, clientName, projectIds, depth + 1));
  if (typeof value !== 'object') return false;
  for (const [key, val] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (['clientid','customerid','entityid','clientuid','customeruid','ownerclientid'].includes(normalized) && String(val) === String(clientId)) return true;
    if (normalized === 'projectid' && projectIds.has(String(val))) return true;
    if ((normalized === 'client' || normalized === 'customer') && val && typeof val === 'object') {
      if (String(val.id || val.uid || '') === String(clientId)) return true;
    }
    if (typeof val === 'object' && hasClientReference(val, clientId, clientName, projectIds, depth + 1)) return true;
  }
  return false;
}
function exportCustomerBundle(clientId) {
  const data = state().data || {};
  const client = clientRecords().find(x => String(x.id || x.uid || '') === String(clientId));
  if (!client) throw new Error('Select a client record that is currently loaded in this workspace.');
  const clientName = client.name || client.company || '';
  const projectRows = rows(data.projects).filter(p => hasClientReference(p, clientId, clientName, new Set()));
  const projectIds = new Set(projectRows.map(p => String(p.id || p.projectId || '')).filter(Boolean));
  const related = {};
  for (const [collection, value] of Object.entries(data)) {
    const collectionRows = rows(value);
    const selected = collectionRows.filter(item => {
      if (!item || typeof item !== 'object') return false;
      if (collection === 'entities') return String(item.id || item.uid || '') === String(clientId);
      if (collection === 'projects') return hasClientReference(item, clientId, clientName, projectIds);
      return hasClientReference(item, clientId, clientName, projectIds);
    });
    if (selected.length) related[collection] = safeData(selected);
  }
  related.client = safeData(client);
  related.projects = safeData(projectRows);
  return {
    exportType: 'VIORA customer data portability snapshot',
    scope: 'Records currently loaded in this signed-in main workspace and matched by known client/project reference fields',
    completeness: 'Best-effort browser export; not a certified complete server-side export. Files, unmounted collections, backups, external processors and records without recognized client references may be absent.',
    exportedAt: new Date().toISOString(),
    client: { id: String(clientId), name: clientName },
    data: related
  };
}

function statusPill(status, label) {
  const cls = status === 'ok' ? 'ecc-good' : status === 'warn' ? 'ecc-warn' : 'ecc-bad';
  return '<span class="ecc-pill '+cls+'">'+esc(label)+'</span>';
}
function renderStatic() {
  const host = root();
  if (!host) return;
  const clientOptions = clientRecords().map(c => '<option value="'+esc(c.id || c.uid || '')+'">'+esc(c.name || c.company || c.email || c.id || 'Unnamed client')+'</option>').join('');
  host.innerHTML = `
    <div class="ecc-wrap">
      <header class="ecc-hero">
        <div>
          <div class="ecc-eyebrow">VIORA PLATFORM OPERATIONS</div>
          <h1 id="engineeringCommandHeading">Engineering Command Centre</h1>
          <p>Engineering health, operational readiness and data-protection governance in one workspace.</p>
        </div>
        <div class="ecc-hero-actions">
          <span id="eccOverallStatus" class="ecc-pill ecc-warn">Checking systems…</span>
          <button type="button" class="ecc-btn ecc-primary" id="eccRefresh"><i class="fa-solid fa-rotate"></i> Refresh checks</button>
        </div>
      </header>

      <div class="ecc-metrics" id="eccMetrics">
        <article class="ecc-metric"><span>Browser connection</span><strong id="eccOnline">—</strong><small>Current device</small></article>
        <article class="ecc-metric"><span>Firebase session</span><strong id="eccFirebase">—</strong><small>Authenticated session</small></article>
        <article class="ecc-metric"><span>Cloudflare API</span><strong id="eccWorker">—</strong><small>Same-origin health endpoint</small></article>
        <article class="ecc-metric"><span>Session errors</span><strong id="eccErrors">${sessionErrors}</strong><small>Since this page was loaded</small></article>
      </div>

      <section class="ecc-section">
        <div class="ecc-section-head"><div><span class="ecc-eyebrow">01 / LIVE DIAGNOSTICS</span><h2>Current session health</h2><p>These checks inspect this browser session. They are not a substitute for Cloudflare-wide telemetry or independent uptime probes.</p></div><span id="eccCheckedAt" class="ecc-muted">Not checked yet</span></div>
        <div class="ecc-check-grid" id="eccChecks"><div class="ecc-empty">Run a health check to inspect this session.</div></div>
        <div class="ecc-actions-row">
          <a class="ecc-btn" href="https://dash.cloudflare.com/" target="_blank" rel="noopener"><i class="fa-solid fa-cloud"></i> Cloudflare dashboard</a>
          <a class="ecc-btn" href="https://github.com/cliff254johns/viora/actions" target="_blank" rel="noopener"><i class="fa-brands fa-github"></i> GitHub Actions</a>
          <a class="ecc-btn" href="https://github.com/cliff254johns/viora/blob/main/docs/VIORA-ENGINEERING-DEEP-AUDIT-2026-11-12.md" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines"></i> Deep audit report</a>
        </div>
      </section>

      <section class="ecc-section">
        <div class="ecc-section-head"><div><span class="ecc-eyebrow">02 / ENGINEERING CONTROLS</span><h2>Readiness register</h2><p>Statuses are intentionally conservative. A code artifact is not treated as proof that an operational control is working.</p></div></div>
        <div class="ecc-register" id="eccEngineeringRegister">
          ${[
            ['Automated CI and browser regression suite','Unit tests passing','Business calculation unit tests and repository contract checks passed; Firebase emulator and authenticated browser journeys require secrets and setup.'],
            ['Cloudflare Worker rate limiting','Updated in branch','Durable Object implementation requires deployed runtime verification.'],
            ['Workers logs and traces','Configured in branch','Confirm production telemetry after deployment.'],
            ['Central error alerting','Gap','Browser/session error counters are local only; central alert routing remains outstanding.'],
            ['Backup and restore drills','Automation prepared','Encrypted daily/monthly R2 backups, retention and guarded restore scripts added; secrets and a restore drill remain.'],
            ['Dependency and secret scanning','Configured in branch','npm audit, Gitleaks and CodeQL workflows added; review their latest run results.'],
            ['Accessibility and Core Web Vitals','Unverified','Playwright/axe smoke tests added; no completed Lighthouse, field Core Web Vitals or manual screen-reader certification.'],
            ['PWA square artwork','Added in branch','192px and 512px square PNG icons added; verify installed app artwork after production deployment.']
          ].map(([name,status,detail])=>'<div class="ecc-register-row"><div><strong>'+esc(name)+'</strong><small>'+esc(detail)+'</small></div>'+statusPill(status==='Updated in branch'?'warn':status==='Configured in branch'?'warn':'bad',status)+'</div>').join('')}
        </div>
      </section>

      <section class="ecc-section">
        <div class="ecc-section-head"><div><span class="ecc-eyebrow">03 / DATA PROTECTION</span><h2>Privacy and compliance controls</h2><p>Kenya DPA and GDPR work is a governance programme, not a one-time website edit. Review the evidence and outstanding owner actions.</p></div></div>
        <div class="ecc-register">
          ${[
            ['Privacy notice and DPA','Drafts present','Legal review, execution and operational alignment required.'],
            ['ODPC registration','Owner verification','Confirm whether VIORA must register as controller, processor or both; retain certificate if required.'],
            ['Retention and deletion','Policy drafted','No automated deletion or backup tombstone workflow is claimed.'],
            ['Data subject access/export','Limited','Current-workspace browser export is best-effort; complete server-side export remains outstanding.'],
            ['Tenant-specific ownership','Unverified','Prove every portal and storage path is tenant-scoped with negative isolation tests.'],
            ['MFA for privileged accounts','Unverified','Confirm enrollment and enforce assurance for privileged operations.'],
            ['Subprocessor register','Draft inventory','Verify legal entities, regions, contracts, retention and transfer mechanisms.'],
            ['Incident response','Runbook drafted','Assign owners and complete a tabletop exercise.'],
            ['SLA','Draft only','Do not make uptime/support commitments before measurement and approval.'],
            ['DPIA / sensitive data','Owner review','Assess health, biometric, child-related and other high-risk processing before deployment.']
          ].map(([name,status,detail])=>'<div class="ecc-register-row"><div><strong>'+esc(name)+'</strong><small>'+esc(detail)+'</small></div>'+statusPill(status==='Drafts present'||status==='Policy drafted'||status==='Draft inventory'||status==='Runbook drafted'||status==='Draft only'?'warn':'bad',status)+'</div>').join('')}
        </div>
        <div class="ecc-actions-row">
          <a class="ecc-btn" href="https://github.com/cliff254johns/viora/tree/main/docs/compliance" target="_blank" rel="noopener"><i class="fa-solid fa-folder-open"></i> Governance documents</a>
          <a class="ecc-btn" href="https://odpc.go.ke/data-protection-laws-kenya/" target="_blank" rel="noopener"><i class="fa-solid fa-scale-balanced"></i> ODPC legal framework</a>
          <a class="ecc-btn" href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener"><i class="fa-solid fa-universal-access"></i> WCAG 2.2</a>
        </div>
      </section>

      <section class="ecc-section">
        <div class="ecc-section-head"><div><span class="ecc-eyebrow">04 / DATA SUBJECT RIGHTS</span><h2>Customer data export</h2><p>Creates a local JSON snapshot from client records already loaded in the current authenticated main workspace. It does not call an external export service.</p></div></div>
        <div class="ecc-export">
          <label for="eccClientSelect">Select client</label>
          <select id="eccClientSelect"><option value="">Choose a loaded client…</option>${clientOptions}</select>
          <button type="button" class="ecc-btn ecc-primary" id="eccExportClient"><i class="fa-solid fa-file-export"></i> Export customer JSON</button>
          <p class="ecc-warning-note"><i class="fa-solid fa-triangle-exclamation"></i> Best-effort export only. It may omit files, data not loaded in this session, external processors and records without known client references. Do not use as the sole GDPR/KDPA response until server-side completeness is implemented and tested.</p>
          <div id="eccExportStatus" class="ecc-muted" role="status" aria-live="polite"></div>
        </div>
      </section>

      <section class="ecc-section">
        <div class="ecc-section-head"><div><span class="ecc-eyebrow">05 / INCIDENT MANAGEMENT</span><h2>Incident record draft</h2><p>Prepare a local incident record for the incident commander. This form does not submit, notify a regulator or create a central audit record.</p></div></div>
        <form class="ecc-incident" id="eccIncidentForm">
          <label>Incident summary<input name="summary" required maxlength="180" placeholder="Briefly describe what happened"></label>
          <div class="ecc-two"><label>Severity<select name="severity"><option>SEV-1 Critical</option><option selected>SEV-2 High</option><option>SEV-3 Normal</option></select></label><label>Detection time<input name="detectedAt" type="datetime-local" required></label></div>
          <label>Potentially affected systems / tenants<textarea name="scope" rows="2" placeholder="Systems, tenant IDs and regions; avoid unnecessary personal data"></textarea></label>
          <label>Containment and next action<textarea name="actions" rows="3" placeholder="What has been contained? What must happen next?"></textarea></label>
          <button type="submit" class="ecc-btn ecc-primary"><i class="fa-solid fa-download"></i> Download incident draft</button>
          <p class="ecc-warning-note">Kenya DPA section 43 has a 72-hour controller notification clock where its threshold is met and a processor-to-controller notice expectation of 48 hours where reasonably practicable. GDPR may impose a separate 72-hour duty where applicable. Escalate immediately to the privacy lead/legal adviser.</p>
        </form>
      </section>

      <footer class="ecc-foot"><strong>Evidence discipline:</strong> green means a live check succeeded in this browser; amber means configured or drafted but not independently verified; red means missing or not verified. This panel is not a certification dashboard.</footer>
    </div>`;

  const refresh = host.querySelector('#eccRefresh');
  refresh?.addEventListener('click', refreshHealth);
  host.querySelector('#eccExportClient')?.addEventListener('click', () => {
    const id = host.querySelector('#eccClientSelect')?.value;
    const status = host.querySelector('#eccExportStatus');
    try {
      if (!id) throw new Error('Choose a client first.');
      const bundle = exportCustomerBundle(id);
      const safeId = String(id).replace(/[^a-z0-9_-]/gi, '-').slice(0, 48);
      downloadJson('viora-customer-export-'+safeId+'-'+new Date().toISOString().slice(0,10)+'.json', bundle);
      if (status) status.textContent = 'Export prepared locally. Check the completeness warning in the downloaded file.';
    } catch (error) { if (status) status.textContent = error.message || 'Export could not be prepared.'; }
  });
  host.querySelector('#eccIncidentForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    downloadJson('viora-incident-draft-'+new Date().toISOString().slice(0,10)+'.json', {
      recordType:'Incident response draft',
      createdAt:new Date().toISOString(),
      status:'Draft — not submitted or centrally recorded',
      incident:values
    });
  });
  refreshHealth();
}

async function refreshHealth() {
  const host = root();
  if (!host) return;
  const checks = [];
  const online = navigator.onLine;
  checks.push({name:'Browser network',ok:online,detail:online?'Browser reports an online connection.':'Browser reports offline mode.'});
  const auth = window.VioraAuth;
  const signedIn = !!(auth && auth.currentUser);
  checks.push({name:'Firebase authentication',ok:signedIn,detail:signedIn?'An authenticated Firebase user is present.':'No authenticated Firebase user is visible to this page.'});
  checks.push({name:'Firebase database SDK',ok:!!window.VioraDb,detail:window.VioraDb?'Database instance is exposed by the main app.':'Database instance is not exposed.'});
  const loaded = Object.keys(state().data || {}).length;
  checks.push({name:'Workspace data snapshot',ok:loaded>0,detail:loaded+' data collections currently loaded in this browser session.'});
  let workerOk=false, workerDetail='Health endpoint unavailable.';
  try {
    const response=await fetch('/api/translation-health',{cache:'no-store',headers:{Accept:'application/json'}});
    const type=response.headers.get('content-type')||'';
    if(response.ok&&type.includes('application/json')){
      const data=await response.json();
      workerOk=!!data.ok;
      workerDetail='Worker responded; AI binding '+(data.aiBinding?'present':'missing')+', rate-limit binding '+(data.rateLimitBinding?'present':'missing')+'.';
      lastHealth=data;
    } else workerDetail='Endpoint returned HTTP '+response.status+' or non-JSON content.';
  } catch(error) { workerDetail=error.message||workerDetail; }
  checks.push({name:'Cloudflare Worker health',ok:workerOk,detail:workerDetail});
  let swDetail='Service worker API unavailable.', swOk=false;
  try {
    if('serviceWorker' in navigator){
      const registration=await navigator.serviceWorker.getRegistration();
      swOk=!!registration;
      swDetail=registration?'Service worker registration found ('+(registration.active?'active':'not yet active')+').':'No service worker registration found for this page.';
    }
  } catch(error) { swDetail=error.message||swDetail; }
  checks.push({name:'PWA service worker',ok:swOk,detail:swDetail});
  const errors=sessionErrors;
  checks.push({name:'Current-session JavaScript errors',ok:errors===0,detail:errors+' uncaught errors/rejections observed since this module loaded.'});
  const allOk=checks.every(c=>c.ok);
  const anyBad=checks.some(c=>!c.ok);
  const overall=document.getElementById('eccOverallStatus');
  if(overall){overall.className='ecc-pill '+(allOk?'ecc-good':anyBad?'ecc-warn':'ecc-bad');overall.textContent=allOk?'Session checks passed':'Review required';}
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  set('eccOnline',online?'Online':'Offline');
  set('eccFirebase',signedIn?'Signed in':'Not signed in');
  set('eccWorker',workerOk?'Healthy':'Unverified');
  set('eccErrors',String(errors));
  set('eccCheckedAt','Checked '+new Date().toLocaleString());
  const list=document.getElementById('eccChecks');
  if(list)list.innerHTML=checks.map(c=>'<article class="ecc-check"><div class="ecc-check-title"><strong>'+esc(c.name)+'</strong>'+statusPill(c.ok?'ok':'bad',c.ok?'Pass':'Review')+'</div><p>'+esc(c.detail)+'</p></article>').join('');
  return checks;
}

function renderEngineeringCommandCentre() {
  if (window.__vioraInvestorRoomMode) {
    import('./investor-data-room.js').then(module => module.renderInvestorDataRoom())
      .catch(error => {
        const host = root();
        if (host) host.innerHTML = '<div class="ecc-section"><h2>Investor Data Room unavailable</h2><p>' + esc(error.message || 'Module failed to load.') + '</p></div>';
      });
    return;
  }
  if (!root()) return;
  if (!root().dataset.initialized) {
    root().dataset.initialized='1';
    renderStatic();
  } else {
    refreshHealth();
  }
}
window.renderEngineeringCommandCentre=renderEngineeringCommandCentre;
window.VioraEngineeringCommandCentre={render:renderEngineeringCommandCentre,refresh:refreshHealth};
