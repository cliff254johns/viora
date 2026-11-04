// main/orbit-shell.js
// ═══════════════════════════════════════════════════════════════
// Orbit shell — 24-module sidebar router for campaign.html
// (Billing removed by request.)
//
// Renders the sidebar, wires navigation, hosts every module renderer.
// Delegates to ./orbit-modules.js for each module's content.
// ═══════════════════════════════════════════════════════════════

import {
  renderOverview,
  renderContentStudio,
  renderCalendar,
  renderPublishingCentre,
  renderCreativeStudio,
  renderInbox,
  renderCRM,
  renderListening,
  renderAgents,
  renderAutomation,
  renderAnalyticsModule,
  renderCompetitorsModule,
  renderReports,
  renderClients,
  renderApprovals,
  renderMediaLibrary,
  renderKnowledge,
  renderTeam,
  renderIntegrations,
  renderSettings,
  renderAdmin,
  renderAccountsModule,
  renderCampaignsModule,
} from './orbit-modules.js';

let _ctx = null;
let _activeModule = 'overview';

/* ── Sidebar definition (24 modules, grouped) ── */
const SIDEBAR = [
  { group: 'Workspace', items: [
    { key: 'overview',   label: 'Overview',            icon: 'fa-house' },
    { key: 'accounts',   label: 'Social accounts',     icon: 'fa-share-nodes' },
    { key: 'content',    label: 'Content studio',      icon: 'fa-pen-nib' },
    { key: 'calendar',   label: 'Content calendar',    icon: 'fa-calendar-days' },
    { key: 'publishing', label: 'Publishing centre',   icon: 'fa-paper-plane' },
    { key: 'campaigns',  label: 'Campaigns',           icon: 'fa-bullhorn' },
    { key: 'creative',   label: 'Creative studio',     icon: 'fa-wand-magic-sparkles' },
  ]},
  { group: 'Engagement', items: [
    { key: 'inbox',      label: 'Unified inbox',       icon: 'fa-inbox' },
    { key: 'crm',        label: 'CRM & leads',         icon: 'fa-user-group' },
    { key: 'listening',  label: 'Social listening',    icon: 'fa-ear-listen' },
  ]},
  { group: 'Intelligence', items: [
    { key: 'agents',     label: 'AI agents',           icon: 'fa-robot' },
    { key: 'automation', label: 'Automation centre',   icon: 'fa-diagram-project' },
    { key: 'analytics',  label: 'Analytics & BI',      icon: 'fa-chart-line' },
    { key: 'competitors',label: 'Competitors',         icon: 'fa-flag' },
    { key: 'reports',    label: 'Reports',             icon: 'fa-file-lines' },
  ]},
  { group: 'Organisation', items: [
    { key: 'clients',    label: 'Clients & brands',    icon: 'fa-building' },
    { key: 'approvals',  label: 'Approvals',           icon: 'fa-check-double' },
    { key: 'media',      label: 'Media library',       icon: 'fa-photo-film' },
    { key: 'knowledge',  label: 'Brand knowledge',     icon: 'fa-book' },
    { key: 'team',       label: 'Team & roles',        icon: 'fa-users-gear' },
    { key: 'integrations', label: 'Integrations',      icon: 'fa-plug' },
    { key: 'settings',   label: 'Settings',            icon: 'fa-gear' },
    { key: 'admin',      label: 'Platform admin',      icon: 'fa-shield-halved' },
  ]},
];

/* Flat lookup for crumb + search */
const MODULE_MAP = (() => {
  const m = {};
  for (const g of SIDEBAR) for (const it of g.items) m[it.key] = it;
  return m;
})();

const RENDERERS = {
  overview: renderOverview,
  accounts: renderAccountsModule,
  content: renderContentStudio,
  calendar: renderCalendar,
  publishing: renderPublishingCentre,
  campaigns: renderCampaignsModule,
  creative: renderCreativeStudio,
  inbox: renderInbox,
  crm: renderCRM,
  listening: renderListening,
  agents: renderAgents,
  automation: renderAutomation,
  analytics: renderAnalyticsModule,
  competitors: renderCompetitorsModule,
  reports: renderReports,
  clients: renderClients,
  approvals: renderApprovals,
  media: renderMediaLibrary,
  knowledge: renderKnowledge,
  team: renderTeam,
  integrations: renderIntegrations,
  settings: renderSettings,
  admin: renderAdmin,
};

export function initOrbitShell(ctx) {
  _ctx = ctx || {};
  _activeModule = 'overview';
  renderSidebar();
  wireNav();
  wireMobileNav();
  wireHash();
  const initial = (location.hash || '#overview').slice(1);
  navigate(MODULE_MAP[initial] ? initial : 'overview', { skipHash: true });
}

function C() { return _ctx || {}; }

function renderSidebar() {
  const host = document.getElementById('sidebar');
  if (!host) return;

  const groupsHtml = SIDEBAR.map(g => `
    <div class="nav-label">${g.group}</div>
    <nav class="nav" data-nav-group="${g.group}">
      ${g.items.map(it => `
        <button type="button" data-page="${it.key}">
          <span class="ico"><i class="fa-solid ${it.icon}"></i></span>
          ${it.label}
        </button>
      `).join('')}
    </nav>
  `).join('');

  host.innerHTML = `
    <div class="brand">
      <div class="logo">O</div>
      <div><strong>orbit</strong><small>AI marketing command</small></div>
    </div>
    <div class="workspace">
      <div class="avatar">NW</div>
      <div><b>Northwind Studio</b><small>Business workspace ▾</small></div>
      <span>⌄</span>
    </div>
    ${groupsHtml}
    <div class="sidebar-bottom">
      <div class="planbox">
        <b>VIORA Professional</b>
        <p>AI credits and workspace usage</p>
        <button type="button" data-page="settings">Workspace settings →</button>
      </div>
      <div class="muted small">● Preview · Production integrations pending</div>
    </div>
  `;
}

function wireNav() {
  document.getElementById('sidebar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    navigate(btn.dataset.page);
  });
  document.getElementById('hamb')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('overlay')?.classList.toggle('show');
  });
  document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('overlay')?.classList.remove('show');
  });
}

function wireMobileNav() {
  const bar = document.getElementById('mobileNav');
  if (!bar) return;
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mnav]');
    if (!btn) return;
    navigate(btn.dataset.mnav);
  });
}

function wireHash() {
  window.addEventListener('hashchange', () => {
    const key = (location.hash || '').slice(1);
    if (MODULE_MAP[key] && key !== _activeModule) navigate(key, { skipHash: true });
  });
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATE
   ═══════════════════════════════════════════════════════════════ */
export async function navigate(key, opts = {}) {
  const mod = MODULE_MAP[key];
  if (!mod) return;

  _activeModule = key;
  const ctx = C();

  /* Crumb */
  const crumbEl = document.getElementById('crumb');
  if (crumbEl) crumbEl.textContent = mod.label;

  /* Sidebar highlight */
  document.querySelectorAll('#sidebar [data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === key)
  );
  document.querySelectorAll('#mobileNav [data-mnav]').forEach(b =>
    b.classList.toggle('active', b.dataset.mnav === key)
  );

  /* Sync state.currentTab for the campaigns legacy renderers */
  if (ctx.state) {
    if (key === 'campaigns') ctx.state.currentTab = 'marketing-campaigns';
    else if (key === 'analytics') ctx.state.currentTab = 'campaign-analytics';
    else ctx.state.currentTab = key;
  }

  /* Close mobile sidebar */
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');

  /* Hash */
  if (!opts.skipHash) {
    try { history.replaceState(null, '', '#' + key); } catch (_) {}
  }

  /* Render */
  const view = document.getElementById('view');
  if (!view) return;

  /* Standard renderers */
  const renderer = RENDERERS[key];
  if (typeof renderer === 'function') {
    view.innerHTML = '<div class="muted small" style="padding:24px;">Loading…</div>';
    try {
      const html = await renderer(ctx);
      view.innerHTML = typeof html === 'string' ? html : (html?.html || '');
      // Attach any post-render effects the module returned
      if (html?.mount && typeof html.mount === 'function') {
        requestAnimationFrame(() => { try { html.mount(view); } catch (e) { console.warn(e); } });
      }
    } catch (e) {
      console.error('[orbit] render failed:', key, e);
      view.innerHTML = `<div class="card"><div class="cardhead"><h3>${mod.label}</h3></div>
        <div class="empty">Failed to load: ${String(e.message || e)}</div></div>`;
    }
  } else {
    view.innerHTML = `<div class="card"><div class="cardhead"><h3>${mod.label}</h3></div>
      <div class="empty">Not yet implemented.</div></div>`;
  }
}

export function currentModule() { return _activeModule; }

export function findModuleByName(q) {
  const lc = String(q || '').toLowerCase();
  for (const [key, mod] of Object.entries(MODULE_MAP)) {
    if (mod.label.toLowerCase().includes(lc) || key.includes(lc)) return key;
  }
  return null;
}

export function renderActiveOrbitModule() {
  navigate(_activeModule, { skipHash: true });
}

/* Expose for inline onclick + bootstrap */
window.Orbit = {
  navigate,
  currentModule,
  findModuleByName,
  renderActiveOrbitModule,
  MODULES: MODULE_MAP,
};
