/* ═══════════════════════════════════════════════════════════════
   VIORA — HOME CONTENT EDITOR (v2.0)
   ═══════════════════════════════════════════════════════════════

   Admin editor for the landing page (index.html).

   Reads / writes:
     viora_data/orgs/viora/homeContent              → hero, intent, etc.
     viora_data/orgs/viora/homeContent/tour/meta     → tour eyebrow/heading/sub
     viora_data/orgs/viora/homeContent/tour/buckets  → flat node, per-key
     viora_data/orgs/viora/homeContent/tour/families → flat node, per-key
     viora_data/orgs/viora/homeContent/productStrip  → strip config
     viora_data/orgs/viora/industries                → flat node, per-key

   Public API:
     initHomeContent({ db, ref, set, get, P, state, toast, logActivity, escapeHtml, $ })
     renderHomeContent() → renders into #tab-home-content

   v2.0 changes:
     • Split old "Tour" into "Buckets & Families" + "Industries"
     • Industries editor = full side panel with client-side image resize
     • No hardcoded defaults — everything lives in Firebase
     • Add Product category dropdown reads from `industries` node
   ═══════════════════════════════════════════════════════════════ */

let D = null;

/* ── Constants ── */
const INDUSTRIES_PATH = 'industries';
const HOME_PATH       = 'homeContent';
const TOUR_META_PATH  = 'homeContent/tour/meta';
const BUCKETS_PATH    = 'homeContent/tour/buckets';
const FAMILIES_PATH   = 'homeContent/tour/families';
const STRIP_PATH      = 'homeContent/productStrip';

const MAX_IMAGE_DIM   = 800;
const JPEG_QUALITY    = 0.80;

/* 24-swatch color palette */
const COLOR_PALETTE = [
  '#2267EE','#23C7D9','#8B5CF6','#10B981','#F59E0B','#EC4899',
  '#EF4444','#F97316','#14B8A6','#6366F1','#0EA5E9','#A855F7',
  '#64748B','#DC2626','#059669','#D97706','#7C3AED','#DB2777',
  '#0891B2','#65A30D','#EA580C','#4338CA','#BE123C','#15803D'
];

/* ── Defaults that must still render the page shell ── */
const HERO_DEFAULTS = {
  eyebrow: 'The VIORA Ecosystem',
  titleLine1: 'Everything Your Business Needs.',
  titleLine2: 'Connected.',
  subtitle: 'Run smarter, sell more and grow with an integrated ecosystem of business software, digital services, commerce and expert support.',
  primaryCta:   { label: 'Explore the Ecosystem →', href: '#tour' },
  secondaryCta: { label: 'Book a demo',            href: 'contact_us.html' }
};

const INTENT_DEFAULTS = [
  { title: 'Explore the ecosystem', desc: '45+ solutions across 35 industries', href: '#tour',           icon: 'fa-layer-group' },
  { title: 'Browse products',       desc: 'Instant KES pricing, delivered live', href: 'market.html',    icon: 'fa-store' },
  { title: 'Subscribe to a plan',   desc: 'Manage your subscription and invoices', href: 'client.html',  icon: 'fa-crown' },
  { title: 'Training academy',      desc: 'Courses, checklists, certificates',  href: 'training.html',  icon: 'fa-graduation-cap' }
];

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
export function initHomeContent(deps) {
  D = deps;
}

/* ═══════════════════════════════════════════════════════════════
   RENDER — main entry point
   ═══════════════════════════════════════════════════════════════ */
export function renderHomeContent() {
  const host = document.getElementById('tab-home-content');
  if (!host) return;

  host.innerHTML = `
    <div style="padding:24px;max-width:1200px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin:0 0 4px;font-size:22px;">Home Content</h2>
          <p style="margin:0;color:var(--text-muted);font-size:.85rem;">
            Edit the landing page (index.html) and the industries catalog.
            Changes save per-section.
          </p>
        </div>
        <button type="button" class="btn btn-success" id="hc-save-btn">
          <i class="fa-solid fa-check"></i> Save all text sections
        </button>
      </div>

      <div id="hc-status" style="margin-bottom:16px;font-size:.85rem;min-height:20px;"></div>

      <div class="hc-tabs" style="display:flex;gap:4px;padding:4px;background:rgba(0,0,0,.2);border-radius:10px;margin-bottom:20px;flex-wrap:wrap;">
        ${[
          ['Hero','hero'],
          ['Intent','intent'],
          ['Buckets & Families','buckets'],
          ['Industries','industries'],
          ['Products','products'],
          ['Ecosystem','ecosystem'],
          ['Dashboard','dashboard'],
          ['Cases','cases'],
          ['Pricing','pricing'],
          ['Academy','academy'],
          ['Contact','contact']
        ].map(([label, key], i) => `
          <button type="button" class="btn btn-xs hc-tab-btn" data-tab="${key}"
            style="border-radius:8px;padding:8px 14px;${i === 0 ? 'background:var(--accent-blue);color:#fff;border-color:var(--accent-blue);' : ''}">
            ${label}
          </button>
        `).join('')}
      </div>

      <div id="hc-panels"></div>
    </div>

    <!-- Industry editor slide-in panel -->
    <div id="hc-industry-panel" style="display:none;position:fixed;top:0;right:0;bottom:0;width:600px;max-width:100vw;
      background:var(--bg-elev-1);border-left:1px solid var(--border-color);z-index:9999;overflow-y:auto;
      box-shadow:-10px 0 40px rgba(0,0,0,.4);">
    </div>
    <div id="hc-industry-backdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;"></div>
  `;

  renderPanels();

  /* Tab switching */
  host.querySelectorAll('.hc-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      host.querySelectorAll('.hc-tab-btn').forEach(b => {
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
      });
      btn.style.background = 'var(--accent-blue)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--accent-blue)';
      host.querySelectorAll('[data-panel]').forEach((p) => {
        p.style.display = p.dataset.panel === btn.dataset.tab ? 'block' : 'none';
      });
    });
  });

  document.getElementById('hc-save-btn').addEventListener('click', saveAllTextSections);
}

/* ═══════════════════════════════════════════════════════════════
   PANEL DISPATCHER
   ═══════════════════════════════════════════════════════════════ */
function renderPanels() {
  const host = document.getElementById('hc-panels');
  if (!host) return;

  host.innerHTML = `
    <div data-panel="hero" style="display:block;">${renderHeroPanel()}</div>
    <div data-panel="intent" style="display:none;">${renderIntentPanel()}</div>
    <div data-panel="buckets" style="display:none;">${renderBucketsFamiliesPanel()}</div>
    <div data-panel="industries" style="display:none;">${renderIndustriesPanel()}</div>
    <div data-panel="products" style="display:none;">${renderProductsPanel()}</div>
    <div data-panel="ecosystem" style="display:none;">${renderStaticPanel('ecosystem')}</div>
    <div data-panel="dashboard" style="display:none;">${renderStaticPanel('dashboard')}</div>
    <div data-panel="cases" style="display:none;">${renderStaticPanel('cases')}</div>
    <div data-panel="pricing" style="display:none;">${renderStaticPanel('pricing')}</div>
    <div data-panel="academy" style="display:none;">${renderStaticPanel('academy')}</div>
    <div data-panel="contact" style="display:none;">${renderStaticPanel('contact')}</div>
  `;

  bindBucketsFamiliesPanel();
  bindIndustriesPanel();
  bindProductsPanel();
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: HERO (unchanged logic, trimmed)
   ═══════════════════════════════════════════════════════════════ */
function renderHeroPanel() {
  const h = (D.state?.data?.homeContent?.hero) || HERO_DEFAULTS;
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Hero</h3>
      ${field('hc-hero-eyebrow', 'Eyebrow', h.eyebrow)}
      ${field('hc-hero-title1', 'Title line 1', h.titleLine1)}
      ${field('hc-hero-title2', 'Title line 2', h.titleLine2)}
      ${textarea('hc-hero-subtitle', 'Subtitle', h.subtitle)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-hero-cta1-label', 'Primary CTA label', h.primaryCta?.label || '')}
        ${field('hc-hero-cta1-href',  'Primary CTA href',  h.primaryCta?.href  || '')}
        ${field('hc-hero-cta2-label', 'Secondary CTA label', h.secondaryCta?.label || '')}
        ${field('hc-hero-cta2-href',  'Secondary CTA href',  h.secondaryCta?.href  || '')}
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: INTENT (unchanged)
   ═══════════════════════════════════════════════════════════════ */
function renderIntentPanel() {
  const tiles = (D.state?.data?.homeContent?.intentTiles) || INTENT_DEFAULTS;
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Intent Router — 4 tiles</h3>
      ${tiles.map((t, i) => `
        <div class="hc-card" style="padding:14px;background:var(--bg-card-solid);border-radius:10px;margin-bottom:10px;border:1px solid var(--border-color);">
          <strong style="font-size:.82rem;color:var(--accent-blue);">Tile ${i + 1}</strong>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
            ${field(`hc-intent-${i}-title`, 'Title',       t.title)}
            ${field(`hc-intent-${i}-icon`,  'Icon class',  t.icon)}
            ${field(`hc-intent-${i}-desc`,  'Description', t.desc)}
            ${field(`hc-intent-${i}-href`,  'Link',        t.href)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: BUCKETS & FAMILIES
   ═══════════════════════════════════════════════════════════════ */
function renderBucketsFamiliesPanel() {
  const buckets  = flattenNode(D.state?.data?.homeContent?.tour?.buckets);
  const families = flattenNode(D.state?.data?.homeContent?.tour?.families);
  const meta     = D.state?.data?.homeContent?.tour?.meta || {};

  const bucketList = Object.values(buckets)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);margin-bottom:16px;">
      <h3 style="margin:0 0 16px;font-size:15px;">Tour meta</h3>
      ${field('hc-tour-meta-eyebrow', 'Eyebrow', meta.eyebrow || '')}
      ${field('hc-tour-meta-heading', 'Heading', meta.heading || '')}
      ${textarea('hc-tour-meta-sub', 'Subtitle', meta.sub || '')}
      <button type="button" class="btn btn-outline btn-sm" id="hc-save-tour-meta" style="margin-top:8px;">
        <i class="fa-solid fa-check"></i> Save tour meta
      </button>
    </div>

    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;font-size:15px;">Buckets (${bucketList.length})</h3>
        <button type="button" class="btn btn-primary btn-sm" id="hc-add-bucket">
          <i class="fa-solid fa-plus"></i> Add bucket
        </button>
      </div>
      <p style="margin:0 0 16px;font-size:.82rem;color:var(--text-muted);">
        A bucket is a top-level tour tab ("Run my business"). Each bucket contains families,
        each family contains industries.
      </p>
      <div id="hc-bucket-list">
        ${bucketList.length === 0 ? `
          <div style="padding:32px;text-align:center;color:var(--text-muted);background:var(--bg-card-solid);border:1px dashed var(--border-color);border-radius:10px;">
            <i class="fa-solid fa-inbox" style="font-size:32px;margin-bottom:8px;opacity:.5;"></i>
            <p style="margin:0;">No buckets yet. Click <strong>Add bucket</strong> to begin.</p>
          </div>
        ` : bucketList.map(b => renderBucketCard(b, families)).join('')}
      </div>
    </div>
  `;
}

function renderBucketCard(bucket, allFamilies) {
  const familiesInBucket = Object.values(allFamilies)
    .filter(f => f.bucket === bucket.key)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  return `
    <div class="hc-bucket-card" data-bucket-key="${escAttr(bucket.key)}"
         style="padding:16px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:10px;margin-bottom:12px;">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
            <i class="${escAttr(bucket.icon || 'fa-solid fa-cube')}" style="color:${escAttr(bucket.color || '#2267EE')};font-size:20px;"></i>
            <strong style="font-size:1rem;">${escHtml(bucket.name || '(unnamed)')}</strong>
            <code style="font-size:.72rem;color:var(--text-muted);background:var(--bg-elev-2);padding:2px 6px;border-radius:4px;">${escHtml(bucket.key || '')}</code>
          </div>
          <p style="margin:0;font-size:.82rem;color:var(--text-muted);">${escHtml(bucket.desc || '')}</p>
        </div>
        <div style="display:flex;gap:4px;">
          <button type="button" class="btn btn-outline btn-xs" data-edit-bucket="${escAttr(bucket.key)}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="btn btn-danger btn-xs" data-delete-bucket="${escAttr(bucket.key)}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <div style="padding:12px;background:var(--bg-elev-2);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);">
            Families in this bucket (${familiesInBucket.length})
          </strong>
          <button type="button" class="btn btn-outline btn-xs" data-add-family-in="${escAttr(bucket.key)}">
            <i class="fa-solid fa-plus"></i> Add family
          </button>
        </div>
        ${familiesInBucket.length === 0 ? `
          <p style="margin:0;font-size:.78rem;color:var(--text-muted);font-style:italic;">No families yet.</p>
        ` : familiesInBucket.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-card-solid);border-radius:6px;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <i class="${escAttr(f.icon || 'fa-solid fa-folder')}" style="color:${escAttr(bucket.color || '#2267EE')};font-size:14px;"></i>
              <span style="font-size:.85rem;">${escHtml(f.name || '(unnamed)')}</span>
              <code style="font-size:.68rem;color:var(--text-muted);">${escHtml(f.key || '')}</code>
            </div>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn btn-outline btn-xs" data-edit-family="${escAttr(f.key)}" title="Edit">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button type="button" class="btn btn-danger btn-xs" data-delete-family="${escAttr(f.key)}" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function bindBucketsFamiliesPanel() {
  /* Save tour meta */
  document.getElementById('hc-save-tour-meta')?.addEventListener('click', async () => {
    const meta = {
      eyebrow: val('hc-tour-meta-eyebrow'),
      heading: val('hc-tour-meta-heading'),
      sub:     val('hc-tour-meta-sub')
    };
    try {
      await D.set(D.ref(D.db, D.P(TOUR_META_PATH)), meta);
      toast('Tour meta saved.', 'success');
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    }
  });

  /* Add bucket */
  document.getElementById('hc-add-bucket')?.addEventListener('click', () => openBucketEditor(null));

  /* Edit / Delete bucket */
  document.querySelectorAll('[data-edit-bucket]').forEach(btn => {
    btn.addEventListener('click', () => openBucketEditor(btn.dataset.editBucket));
  });
  document.querySelectorAll('[data-delete-bucket]').forEach(btn => {
    btn.addEventListener('click', () => deleteBucket(btn.dataset.deleteBucket));
  });

  /* Add family */
  document.querySelectorAll('[data-add-family-in]').forEach(btn => {
    btn.addEventListener('click', () => openFamilyEditor(null, btn.dataset.addFamilyIn));
  });
  document.querySelectorAll('[data-edit-family]').forEach(btn => {
    btn.addEventListener('click', () => openFamilyEditor(btn.dataset.editFamily, null));
  });
  document.querySelectorAll('[data-delete-family]').forEach(btn => {
    btn.addEventListener('click', () => deleteFamily(btn.dataset.deleteFamily));
  });
}

/* ── Bucket editor — simple prompt-based (we keep it lightweight) ── */
async function openBucketEditor(key) {
  const existing = key
    ? flattenNode(D.state?.data?.homeContent?.tour?.buckets)[key] || {}
    : {};

  const name  = prompt('Bucket name:', existing.name || '');
  if (name === null) return;
  const newKey = key || (prompt('Bucket key (lowercase, no spaces):', (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || '');
  if (!newKey) { toast('Key required.', 'error'); return; }
  const desc  = prompt('Description:', existing.desc || '') || '';
  const icon  = prompt('Icon class (e.g. fa-briefcase):', existing.icon || 'fa-briefcase') || 'fa-briefcase';
  const color = prompt('Color hex:', existing.color || '#2267EE') || '#2267EE';
  const order = parseInt(prompt('Sort order:', String(existing.order || 99)), 10) || 99;

  const bucket = { key: newKey, name, desc, icon, color, order };
  try {
    await D.set(D.ref(D.db, `${D.P(BUCKETS_PATH)}/${newKey}`), bucket);
    if (!D.state.data.homeContent) D.state.data.homeContent = {};
    if (!D.state.data.homeContent.tour) D.state.data.homeContent.tour = {};
    if (!D.state.data.homeContent.tour.buckets) D.state.data.homeContent.tour.buckets = {};
    D.state.data.homeContent.tour.buckets[newKey] = bucket;
    toast(`Bucket "${name}" saved.`, 'success');
    renderPanels();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

async function deleteBucket(key) {
  if (!confirm(`Delete bucket "${key}"? Industries assigned to it will keep their bucket reference (you'll need to reassign them).`)) return;
  try {
    await D.set(D.ref(D.db, `${D.P(BUCKETS_PATH)}/${key}`), null);
    if (D.state.data.homeContent?.tour?.buckets) {
      delete D.state.data.homeContent.tour.buckets[key];
    }
    toast('Bucket deleted.', 'success');
    renderPanels();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

async function openFamilyEditor(key, bucketKey) {
  const existing = key
    ? flattenNode(D.state?.data?.homeContent?.tour?.families)[key] || {}
    : { bucket: bucketKey };

  const buckets = Object.values(flattenNode(D.state?.data?.homeContent?.tour?.buckets));
  const bucketList = buckets.map(b => `${b.key} (${b.name})`).join('\n');

  const name  = prompt('Family name:', existing.name || '');
  if (name === null) return;
  const newKey = key || (prompt('Family key (lowercase, no spaces):', (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || '');
  if (!newKey) { toast('Key required.', 'error'); return; }
  const desc  = prompt('Description:', existing.desc || '') || '';
  const icon  = prompt('Icon class:', existing.icon || 'fa-cube') || 'fa-cube';
  const bucket = prompt(`Bucket key (existing buckets:\n${bucketList}):`, existing.bucket || bucketKey || '') || bucketKey;
  const order = parseInt(prompt('Sort order:', String(existing.order || 99)), 10) || 99;

  const family = { key: newKey, name, desc, icon, bucket, order };
  try {
    await D.set(D.ref(D.db, `${D.P(FAMILIES_PATH)}/${newKey}`), family);
    if (!D.state.data.homeContent.tour.families) D.state.data.homeContent.tour.families = {};
    D.state.data.homeContent.tour.families[newKey] = family;
    toast(`Family "${name}" saved.`, 'success');
    renderPanels();
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  }
}

async function deleteFamily(key) {
  if (!confirm(`Delete family "${key}"?`)) return;
  try {
    await D.set(D.ref(D.db, `${D.P(FAMILIES_PATH)}/${key}`), null);
    if (D.state.data.homeContent?.tour?.families) {
      delete D.state.data.homeContent.tour.families[key];
    }
    toast('Family deleted.', 'success');
    renderPanels();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: INDUSTRIES
   ═══════════════════════════════════════════════════════════════ */
function renderIndustriesPanel() {
  const industries = flattenNode(D.state?.data?.industries);
  const list = Object.values(industries)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <h3 style="margin:0;font-size:15px;">Industries (${list.length})</h3>
        <button type="button" class="btn btn-primary btn-sm" id="hc-add-industry">
          <i class="fa-solid fa-plus"></i> Add industry
        </button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <input type="text" id="hc-ind-search" placeholder="🔍 Search industries…"
               style="flex:1;min-width:200px;padding:8px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;"/>
        <select id="hc-ind-filter-bucket" style="padding:8px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;">
          <option value="">All buckets</option>
          ${Object.values(flattenNode(D.state?.data?.homeContent?.tour?.buckets)).map(b => `<option value="${escAttr(b.key)}">${escHtml(b.name || b.key)}</option>`).join('')}
        </select>
        <select id="hc-ind-filter-family" style="padding:8px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;">
          <option value="">All families</option>
          ${Object.values(flattenNode(D.state?.data?.homeContent?.tour?.families)).map(f => `<option value="${escAttr(f.key)}">${escHtml(f.name || f.key)}</option>`).join('')}
        </select>
      </div>

      <div id="hc-industry-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
        ${list.length === 0 ? `
          <div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--text-muted);background:var(--bg-card-solid);border:1px dashed var(--border-color);border-radius:10px;">
            <i class="fa-solid fa-industry" style="font-size:48px;margin-bottom:12px;opacity:.4;"></i>
            <p style="margin:0 0 8px;">No industries yet.</p>
            <p style="margin:0;font-size:.82rem;">Click <strong>Add industry</strong> to start building your catalog.</p>
          </div>
        ` : list.map(i => renderIndustryCard(i)).join('')}
      </div>
    </div>
  `;
}

function renderIndustryCard(ind) {
  const image = ind.image || ind.imageUrl || '';
  const color = ind.color || '#2267EE';
  return `
    <div class="hc-industry-card" data-industry-key="${escAttr(ind.key)}"
         data-search="${escAttr((ind.name || '').toLowerCase() + ' ' + (ind.marketCategory || '').toLowerCase())}"
         data-bucket="${escAttr(ind.bucket || '')}"
         data-family="${escAttr(ind.family || '')}"
         style="padding:12px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:10px;display:flex;flex-direction:column;gap:8px;">

      <div style="width:100%;height:100px;border-radius:6px;overflow:hidden;background:${color}22;display:flex;align-items:center;justify-content:center;">
        ${image
          ? `<img src="${escAttr(image)}" alt="${escAttr(ind.name || '')}" style="width:100%;height:100%;object-fit:cover;"/>`
          : `<i class="${escAttr(ind.icon || 'fa-solid fa-cube')}" style="font-size:40px;color:${color};"></i>`}
      </div>

      <div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:18px;">${escHtml(ind.emoji || '📦')}</span>
          <strong style="font-size:.88rem;flex:1;">${escHtml(ind.name || '(unnamed)')}</strong>
        </div>
        <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;">${escHtml(ind.marketCategory || '')}</div>
      </div>

      <div style="display:flex;gap:6px;align-items:center;font-size:.68rem;color:var(--text-muted);">
        <code>${escHtml(ind.bucket || '?')}</code> ›
        <code>${escHtml(ind.family || '?')}</code>
        ${!ind.active ? '<span style="color:var(--accent-red);margin-left:auto;">INACTIVE</span>' : ''}
      </div>

      <div style="display:flex;gap:6px;">
        <button type="button" class="btn btn-outline btn-xs" data-edit-industry="${escAttr(ind.key)}" style="flex:1;">
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button type="button" class="btn btn-danger btn-xs" data-delete-industry="${escAttr(ind.key)}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function bindIndustriesPanel() {
  document.getElementById('hc-add-industry')?.addEventListener('click', () => openIndustryEditor(null));

  document.querySelectorAll('[data-edit-industry]').forEach(btn => {
    btn.addEventListener('click', () => openIndustryEditor(btn.dataset.editIndustry));
  });
  document.querySelectorAll('[data-delete-industry]').forEach(btn => {
    btn.addEventListener('click', () => deleteIndustry(btn.dataset.deleteIndustry));
  });

  /* Live filter */
  const search  = document.getElementById('hc-ind-search');
  const fbucket = document.getElementById('hc-ind-filter-bucket');
  const ffamily = document.getElementById('hc-ind-filter-family');

  const applyFilter = () => {
    const q = (search?.value || '').toLowerCase().trim();
    const b = fbucket?.value || '';
    const f = ffamily?.value || '';
    document.querySelectorAll('.hc-industry-card').forEach(card => {
      const matchSearch = !q || card.dataset.search.includes(q);
      const matchBucket = !b || card.dataset.bucket === b;
      const matchFamily = !f || card.dataset.family === f;
      card.style.display = (matchSearch && matchBucket && matchFamily) ? '' : 'none';
    });
  };

  search?.addEventListener('input', applyFilter);
  fbucket?.addEventListener('change', applyFilter);
  ffamily?.addEventListener('change', applyFilter);
}

/* ═══════════════════════════════════════════════════════════════
   INDUSTRY EDITOR PANEL (slide-in)
   ═══════════════════════════════════════════════════════════════ */
function openIndustryEditor(key) {
  const existing = key
    ? flattenNode(D.state?.data?.industries)[key] || {}
    : {
        key: '', name: '', marketCategory: '', emoji: '📦',
        icon: 'fa-cube', color: '#2267EE', image: '', imageUrl: '',
        previewUrl: '', buyUrl: '',
        desc: '', longDesc: '', bullets: [], stats: [],
        included: [], faqs: [],
        bucket: '', family: '', order: 99, active: true
      };

  const panel = document.getElementById('hc-industry-panel');
  const backdrop = document.getElementById('hc-industry-backdrop');
  if (!panel || !backdrop) return;

  panel.style.display = 'block';
  backdrop.style.display = 'block';

  const isNew = !key;
  const imageData = existing.image || existing.imageUrl || '';

  panel.innerHTML = `
    <div style="padding:20px;border-bottom:1px solid var(--border-color);position:sticky;top:0;background:var(--bg-elev-1);z-index:10;display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;font-size:16px;">${isNew ? 'Add Industry' : 'Edit Industry: ' + escHtml(existing.name || key)}</h3>
      <button type="button" id="hc-ind-close" style="background:none;border:none;color:var(--text-muted);font-size:24px;cursor:pointer;line-height:1;">×</button>
    </div>

    <div style="padding:20px;">

      <h4 style="margin:0 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Identity</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-ind-key', 'Key * (lowercase, no spaces)', existing.key || '', isNew ? '' : 'readonly')}
        ${field('hc-ind-name', 'Name *', existing.name || '')}
      </div>
      ${field('hc-ind-marketCategory', 'Market Category * (matches product.category)', existing.marketCategory || '')}
      <div style="display:grid;grid-template-columns:80px 1fr;gap:12px;">
        ${field('hc-ind-emoji', 'Emoji', existing.emoji || '📦')}
        ${field('hc-ind-icon', 'Icon class', existing.icon || 'fa-cube')}
      </div>

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Appearance</h4>
      <label style="display:block;margin-bottom:8px;">
        <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Color</span>
        <div id="hc-ind-palette" style="display:grid;grid-template-columns:repeat(12,1fr);gap:4px;margin-bottom:8px;">
          ${COLOR_PALETTE.map(c => `
            <button type="button" class="hc-color-swatch" data-color="${c}"
              style="background:${c};aspect-ratio:1;border-radius:4px;border:2px solid ${existing.color === c ? '#fff' : 'transparent'};cursor:pointer;padding:0;">
            </button>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="color" id="hc-ind-color-picker" value="${escAttr(existing.color || '#2267EE')}" style="width:40px;height:32px;border:none;background:none;cursor:pointer;"/>
          <input type="text" id="hc-ind-color" value="${escAttr(existing.color || '#2267EE')}" style="flex:1;padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;font-family:monospace;"/>
        </div>
      </label>

      <label style="display:block;margin-top:16px;">
        <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Image</span>
        <div id="hc-ind-image-preview" style="width:100%;height:160px;border-radius:8px;background:var(--bg-elev-2);border:1px dashed var(--border-color);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:8px;">
          ${imageData
            ? `<img src="${escAttr(imageData)}" style="width:100%;height:100%;object-fit:cover;"/>`
            : `<span style="color:var(--text-muted);font-size:.82rem;">No image</span>`}
        </div>
        <input type="file" id="hc-ind-image-file" accept="image/*" style="margin-bottom:8px;font-size:.82rem;"/>
        <input type="url" id="hc-ind-image-url" placeholder="OR paste image URL" value="${escAttr(existing.imageUrl || '')}" style="width:100%;padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
        <p style="margin:6px 0 0;font-size:.7rem;color:var(--text-muted);">Uploads auto-resize to max ${MAX_IMAGE_DIM}×${MAX_IMAGE_DIM}px JPEG 80%.</p>
      </label>

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Placement in tour</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <label style="display:block;">
          <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Bucket *</span>
          <select id="hc-ind-bucket" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;">
            <option value="">— Select bucket —</option>
            ${Object.values(flattenNode(D.state?.data?.homeContent?.tour?.buckets)).map(b => `
              <option value="${escAttr(b.key)}" ${existing.bucket === b.key ? 'selected' : ''}>${escHtml(b.name || b.key)}</option>
            `).join('')}
          </select>
        </label>
        <label style="display:block;">
          <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Family *</span>
          <select id="hc-ind-family" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;">
            <option value="">— Select family —</option>
            ${Object.values(flattenNode(D.state?.data?.homeContent?.tour?.families)).map(f => `
              <option value="${escAttr(f.key)}" data-bucket="${escAttr(f.bucket || '')}" ${existing.family === f.key ? 'selected' : ''}>${escHtml(f.name || f.key)}</option>
            `).join('')}
          </select>
        </label>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        ${field('hc-ind-order', 'Sort order', String(existing.order || 99))}
        <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;padding-top:24px;">
          <input type="checkbox" id="hc-ind-active" ${existing.active !== false ? 'checked' : ''}> Active (visible in tour)
        </label>
      </div>

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Links</h4>
      ${field('hc-ind-previewUrl', 'Preview URL (View sample)', existing.previewUrl || '')}
      ${field('hc-ind-buyUrl', 'Buy URL', existing.buyUrl || '')}

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Copy</h4>
      ${textarea('hc-ind-desc', 'Short description (card)', existing.desc || '')}
      ${textarea('hc-ind-longDesc', 'Long description (More popup)', existing.longDesc || '')}

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Bullets</h4>
      <div id="hc-ind-bullets">
        ${(existing.bullets || []).map((b, i) => bulletRow(b, i)).join('')}
      </div>
      <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-bullet"><i class="fa-solid fa-plus"></i> Add bullet</button>

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Stats</h4>
      <div id="hc-ind-stats">
        ${(existing.stats || []).map((s, i) => statRow(s, i)).join('')}
      </div>
      <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-stat"><i class="fa-solid fa-plus"></i> Add stat</button>

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">What's included</h4>
      <div id="hc-ind-included">
        ${(existing.included || []).map((it, i) => includedRow(it, i)).join('')}
      </div>
      <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-included"><i class="fa-solid fa-plus"></i> Add feature</button>

      <h4 style="margin:24px 0 12px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">FAQs</h4>
      <div id="hc-ind-faqs">
        ${(existing.faqs || []).map((f, i) => faqRow(f, i)).join('')}
      </div>
      <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-faq"><i class="fa-solid fa-plus"></i> Add FAQ</button>

    </div>

    <div style="padding:20px;border-top:1px solid var(--border-color);position:sticky;bottom:0;background:var(--bg-elev-1);display:flex;gap:8px;justify-content:flex-end;">
      ${!isNew ? `<button type="button" class="btn btn-danger" id="hc-ind-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
      <button type="button" class="btn btn-outline" id="hc-ind-cancel">Cancel</button>
      <button type="button" class="btn btn-success" id="hc-ind-save"><i class="fa-solid fa-check"></i> Save industry</button>
    </div>
  `;

  /* Wire close / cancel / backdrop */
  const close = () => {
    panel.style.display = 'none';
    backdrop.style.display = 'none';
    panel.innerHTML = '';
  };
  document.getElementById('hc-ind-close')?.addEventListener('click', close);
  document.getElementById('hc-ind-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', close, { once: true });

  /* Palette swatches */
  panel.querySelectorAll('.hc-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      panel.querySelectorAll('.hc-color-swatch').forEach(s => s.style.border = '2px solid transparent');
      sw.style.border = '2px solid #fff';
      const c = sw.dataset.color;
      document.getElementById('hc-ind-color').value = c;
      document.getElementById('hc-ind-color-picker').value = c;
    });
  });

  /* Color picker sync */
  document.getElementById('hc-ind-color-picker')?.addEventListener('input', (e) => {
    document.getElementById('hc-ind-color').value = e.target.value;
  });
  document.getElementById('hc-ind-color')?.addEventListener('input', (e) => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      document.getElementById('hc-ind-color-picker').value = v;
    }
  });

  /* Image file upload → resize → base64 */
  document.getElementById('hc-ind-image-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await resizeImageToBase64(file);
      document.getElementById('hc-ind-image-preview').innerHTML =
        `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;"/>`;
      panel.dataset.uploadedImage = base64;
      toast('Image resized and ready.', 'success');
    } catch (err) {
      toast('Image failed: ' + err.message, 'error');
    }
  });

  /* Image URL change */
  document.getElementById('hc-ind-image-url')?.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
      document.getElementById('hc-ind-image-preview').innerHTML =
        `<img src="${escAttr(url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=&quot;color:var(--text-muted);font-size:.82rem;&quot;>Invalid URL</span>';"/>`;
    }
  });

  /* Dynamic bullet/stat/included/faq add */
  let bulletIdx = (existing.bullets || []).length;
  let statIdx = (existing.stats || []).length;
  let incIdx = (existing.included || []).length;
  let faqIdx = (existing.faqs || []).length;

  document.getElementById('hc-ind-add-bullet')?.addEventListener('click', () => {
    document.getElementById('hc-ind-bullets').insertAdjacentHTML('beforeend', bulletRow('', bulletIdx++));
    bindRemoveButtons();
  });
  document.getElementById('hc-ind-add-stat')?.addEventListener('click', () => {
    document.getElementById('hc-ind-stats').insertAdjacentHTML('beforeend', statRow({ v: '', l: '' }, statIdx++));
    bindRemoveButtons();
  });
  document.getElementById('hc-ind-add-included')?.addEventListener('click', () => {
    document.getElementById('hc-ind-included').insertAdjacentHTML('beforeend', includedRow('', incIdx++));
    bindRemoveButtons();
  });
  document.getElementById('hc-ind-add-faq')?.addEventListener('click', () => {
    document.getElementById('hc-ind-faqs').insertAdjacentHTML('beforeend', faqRow({ q: '', a: '' }, faqIdx++));
    bindRemoveButtons();
  });

  function bindRemoveButtons() {
    panel.querySelectorAll('[data-remove-row]').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        btn.closest('[data-row]')?.remove();
      });
    });
  }
  bindRemoveButtons();

  /* Delete */
  document.getElementById('hc-ind-delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete industry "${existing.name || key}"?`)) return;
    try {
      await D.set(D.ref(D.db, `${D.P(INDUSTRIES_PATH)}/${key}`), null);
      if (D.state.data.industries) delete D.state.data.industries[key];
      toast('Industry deleted.', 'success');
      close();
      renderPanels();
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  });

  /* Save */
  document.getElementById('hc-ind-save')?.addEventListener('click', async () => {
    const keyVal = val('hc-ind-key');
    if (!keyVal) { toast('Key is required.', 'error'); return; }
    if (!/^[a-z0-9-]+$/.test(keyVal)) { toast('Key must be lowercase letters, numbers, hyphens.', 'error'); return; }

    const name = val('hc-ind-name');
    const marketCategory = val('hc-ind-marketCategory');
    if (!name) { toast('Name is required.', 'error'); return; }
    if (!marketCategory) { toast('Market Category is required.', 'error'); return; }

    const bucket = val('hc-ind-bucket');
    const family = val('hc-ind-family');
    if (!bucket) { toast('Bucket is required.', 'error'); return; }
    if (!family) { toast('Family is required.', 'error'); return; }

    /* Collect dynamic rows */
    const bullets = [];
    panel.querySelectorAll('#hc-ind-bullets [data-row] input').forEach(inp => {
      if (inp.value.trim()) bullets.push(inp.value.trim());
    });
    const stats = [];
    panel.querySelectorAll('#hc-ind-stats [data-row]').forEach(row => {
      const v = row.querySelector('[data-stat-v]')?.value.trim() || '';
      const l = row.querySelector('[data-stat-l]')?.value.trim() || '';
      if (v || l) stats.push({ v, l });
    });
    const included = [];
    panel.querySelectorAll('#hc-ind-included [data-row] input').forEach(inp => {
      if (inp.value.trim()) included.push(inp.value.trim());
    });
    const faqs = [];
    panel.querySelectorAll('#hc-ind-faqs [data-row]').forEach(row => {
      const q = row.querySelector('[data-faq-q]')?.value.trim() || '';
      const a = row.querySelector('[data-faq-a]')?.value.trim() || '';
      if (q) faqs.push({ q, a });
    });

    /* Determine image: uploaded base64 wins, then URL */
    const uploadedBase64 = panel.dataset.uploadedImage || '';
    const imageUrl = val('hc-ind-image-url');
    const image = uploadedBase64 || (existing.image || '');
    const imageUrlFinal = uploadedBase64 ? '' : imageUrl;

    const industry = {
      key: keyVal,
      name,
      marketCategory,
      emoji: val('hc-ind-emoji') || '📦',
      icon: val('hc-ind-icon') || 'fa-cube',
      color: val('hc-ind-color') || '#2267EE',
      image,
      imageUrl: imageUrlFinal,
      previewUrl: val('hc-ind-previewUrl'),
      buyUrl: val('hc-ind-buyUrl'),
      desc: val('hc-ind-desc'),
      longDesc: val('hc-ind-longDesc'),
      bullets,
      stats,
      included,
      faqs,
      bucket,
      family,
      order: parseInt(val('hc-ind-order'), 10) || 99,
      active: !!document.getElementById('hc-ind-active')?.checked,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await D.set(D.ref(D.db, `${D.P(INDUSTRIES_PATH)}/${keyVal}`), industry);
      if (!D.state.data.industries) D.state.data.industries = {};
      D.state.data.industries[keyVal] = industry;
      toast(`Industry "${name}" saved.`, 'success');
      close();
      renderPanels();
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    }
  });

  /* Filter families by bucket */
  document.getElementById('hc-ind-bucket')?.addEventListener('change', (e) => {
    const b = e.target.value;
    const familySel = document.getElementById('hc-ind-family');
    if (!familySel) return;
    const currentValue = familySel.value;
    let stillVisible = false;
    Array.from(familySel.options).forEach(opt => {
      if (!opt.value) return;
      const optBucket = opt.dataset.bucket || '';
      const visible = !b || optBucket === b;
      opt.style.display = visible ? '' : 'none';
      if (visible && opt.value === currentValue) stillVisible = true;
    });
    if (!stillVisible) familySel.value = '';
  });
}

async function deleteIndustry(key) {
  if (!confirm(`Delete industry "${key}"?`)) return;
  try {
    await D.set(D.ref(D.db, `${D.P(INDUSTRIES_PATH)}/${key}`), null);
    if (D.state.data.industries) delete D.state.data.industries[key];
    toast('Industry deleted.', 'success');
    renderPanels();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

/* Row templates */
function bulletRow(value, idx) {
  return `
    <div data-row style="display:flex;gap:6px;margin-bottom:6px;">
      <input type="text" value="${escAttr(value)}" placeholder="Bullet text…"
        style="flex:1;padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row>×</button>
    </div>
  `;
}
function statRow(stat, idx) {
  return `
    <div data-row style="display:grid;grid-template-columns:1fr 2fr 40px;gap:6px;margin-bottom:6px;">
      <input type="text" data-stat-v value="${escAttr(stat.v || '')}" placeholder="+22%"
        style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
      <input type="text" data-stat-l value="${escAttr(stat.l || '')}" placeholder="stock accuracy"
        style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row>×</button>
    </div>
  `;
}
function includedRow(value, idx) {
  return `
    <div data-row style="display:flex;gap:6px;margin-bottom:6px;">
      <input type="text" value="${escAttr(value)}" placeholder="Feature name…"
        style="flex:1;padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row>×</button>
    </div>
  `;
}
function faqRow(faq, idx) {
  return `
    <div data-row style="display:grid;grid-template-columns:1fr 2fr 40px;gap:6px;margin-bottom:6px;">
      <input type="text" data-faq-q value="${escAttr(faq.q || '')}" placeholder="Question"
        style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
      <input type="text" data-faq-a value="${escAttr(faq.a || '')}" placeholder="Answer"
        style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row>×</button>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   IMAGE RESIZE
   ═══════════════════════════════════════════════════════════════ */
function resizeImageToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Not an image')); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
          const scale = Math.min(MAX_IMAGE_DIM / width, MAX_IMAGE_DIM / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        } catch (err) {
          reject(new Error('Canvas encode failed'));
        }
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: PRODUCTS (strip config)
   ═══════════════════════════════════════════════════════════════ */
function renderProductsPanel() {
  const ps = D.state?.data?.homeContent?.productStrip || {};
  const industries = Object.values(flattenNode(D.state?.data?.industries));

  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Product strip</h3>
      <p style="margin:0 0 16px;font-size:.82rem;color:var(--text-muted);">
        The 12-product carousel below the tour. Products come from Firebase, filtered by the industry you pick below.
      </p>
      ${field('hc-ps-eyebrow', 'Eyebrow', ps.eyebrow || '')}
      ${field('hc-ps-heading', 'Heading', ps.heading || '')}
      ${textarea('hc-ps-sub', 'Subtitle', ps.sub || '')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-ps-ctaLabel', 'CTA label', ps.ctaLabel || '')}
        ${field('hc-ps-ctaHref',  'CTA href',  ps.ctaHref  || '')}
      </div>

      <label style="display:block;margin-bottom:12px;">
        <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Industry to show in strip</span>
        <select id="hc-ps-industry" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;">
          <option value="">— Select an industry —</option>
          ${industries.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(i => `
            <option value="${escAttr(i.key)}" ${ps.industry === i.key ? 'selected' : ''}>
              ${escHtml(i.name || i.key)} (${escHtml(i.marketCategory || '')})
            </option>
          `).join('')}
        </select>
      </label>

      ${field('hc-ps-limit', 'Limit (0 = all)', String(ps.limit || 12))}

      <button type="button" class="btn btn-success btn-sm" id="hc-save-product-strip" style="margin-top:16px;">
        <i class="fa-solid fa-check"></i> Save product strip
      </button>
    </div>
  `;
}

function bindProductsPanel() {
  document.getElementById('hc-save-product-strip')?.addEventListener('click', async () => {
    const strip = {
      eyebrow: val('hc-ps-eyebrow'),
      heading: val('hc-ps-heading'),
      sub: val('hc-ps-sub'),
      ctaLabel: val('hc-ps-ctaLabel'),
      ctaHref: val('hc-ps-ctaHref'),
      industry: val('hc-ps-industry'),
      limit: parseInt(val('hc-ps-limit'), 10) || 0
    };
    try {
      await D.set(D.ref(D.db, D.P(STRIP_PATH)), strip);
      if (!D.state.data.homeContent) D.state.data.homeContent = {};
      D.state.data.homeContent.productStrip = strip;
      toast('Product strip saved.', 'success');
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   STATIC PANELS (ecosystem, dashboard, cases, pricing, academy, contact)
   — trimmed for brevity; they render inputs and are saved by saveAllTextSections
   ═══════════════════════════════════════════════════════════════ */
function renderStaticPanel(kind) {
  const all = D.state?.data?.homeContent || {};
  const section = all[kind] || {};
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);

  if (kind === 'ecosystem') {
    return `
      <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
        <h3 style="margin:0 0 16px;font-size:15px;">Ecosystem map</h3>
        ${field('hc-ecosystem-eyebrow', 'Eyebrow', section.eyebrow || '')}
        ${field('hc-ecosystem-heading', 'Heading', section.heading || '')}
        ${textarea('hc-ecosystem-sub', 'Subtitle', section.sub || '')}
      </div>
    `;
  }
  if (kind === 'dashboard') {
    return `
      <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
        <h3 style="margin:0 0 16px;font-size:15px;">Dashboard preview</h3>
        ${field('hc-dashboard-eyebrow', 'Eyebrow', section.eyebrow || '')}
        ${field('hc-dashboard-heading', 'Heading', section.heading || '')}
        ${textarea('hc-dashboard-sub', 'Subtitle', section.sub || '')}
      </div>
    `;
  }
  if (kind === 'cases') {
    return `
      <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
        <h3 style="margin:0 0 16px;font-size:15px;">Case studies strip</h3>
        ${field('hc-cases-eyebrow', 'Eyebrow', section.eyebrow || '')}
        ${field('hc-cases-heading', 'Heading', section.heading || '')}
        ${textarea('hc-cases-sub', 'Subtitle', section.sub || '')}
      </div>
    `;
  }
  if (kind === 'pricing') {
    return `
      <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
        <h3 style="margin:0 0 16px;font-size:15px;">Pricing</h3>
        ${field('hc-pricing-eyebrow', 'Eyebrow', section.eyebrow || '')}
        ${field('hc-pricing-heading', 'Heading', section.heading || '')}
        ${textarea('hc-pricing-sub', 'Subtitle', section.sub || '')}
      </div>
    `;
  }
  if (kind === 'academy') {
    return `
      <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
        <h3 style="margin:0 0 16px;font-size:15px;">Academy teaser</h3>
        ${field('hc-academy-eyebrow', 'Eyebrow', section.eyebrow || '')}
        ${field('hc-academy-heading', 'Heading', section.heading || '')}
        ${textarea('hc-academy-sub', 'Subtitle', section.sub || '')}
      </div>
    `;
  }
  if (kind === 'contact') {
    return `
      <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
        <h3 style="margin:0 0 16px;font-size:15px;">Contact</h3>
        ${field('hc-contact-eyebrow', 'Eyebrow', section.eyebrow || '')}
        ${field('hc-contact-heading', 'Heading', section.heading || '')}
        ${textarea('hc-contact-sub', 'Subtitle', section.sub || '')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${field('hc-contact-email',    'Email', section.email || '')}
          ${field('hc-contact-whatsapp', 'WhatsApp (digits)', section.whatsapp || '')}
        </div>
        ${field('hc-contact-hours', 'Hours', section.hours || '')}
      </div>
    `;
  }
  return `<div class="hc-card" style="padding:20px;">Unknown panel: ${label}</div>`;
}

/* ═══════════════════════════════════════════════════════════════
   SAVE ALL TEXT SECTIONS
   ═══════════════════════════════════════════════════════════════ */
async function saveAllTextSections() {
  const statusEl = document.getElementById('hc-status');
  const btn = document.getElementById('hc-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

  try {
    const payload = {
      hero: {
        eyebrow: val('hc-hero-eyebrow'),
        titleLine1: val('hc-hero-title1'),
        titleLine2: val('hc-hero-title2'),
        subtitle: val('hc-hero-subtitle'),
        primaryCta:   { label: val('hc-hero-cta1-label'), href: val('hc-hero-cta1-href') },
        secondaryCta: { label: val('hc-hero-cta2-label'), href: val('hc-hero-cta2-href') }
      },
      intentTiles: [0,1,2,3].map(i => ({
        title: val(`hc-intent-${i}-title`),
        icon:  val(`hc-intent-${i}-icon`),
        desc:  val(`hc-intent-${i}-desc`),
        href:  val(`hc-intent-${i}-href`)
      })),
      ecosystem: { eyebrow: val('hc-ecosystem-eyebrow'), heading: val('hc-ecosystem-heading'), sub: val('hc-ecosystem-sub') },
      dashboard: { eyebrow: val('hc-dashboard-eyebrow'), heading: val('hc-dashboard-heading'), sub: val('hc-dashboard-sub') },
      cases:     { eyebrow: val('hc-cases-eyebrow'),     heading: val('hc-cases-heading'),     sub: val('hc-cases-sub') },
      pricing:   { eyebrow: val('hc-pricing-eyebrow'),   heading: val('hc-pricing-heading'),   sub: val('hc-pricing-sub') },
      academy:   { eyebrow: val('hc-academy-eyebrow'),   heading: val('hc-academy-heading'),   sub: val('hc-academy-sub') },
      contact:   {
        eyebrow: val('hc-contact-eyebrow'),
        heading: val('hc-contact-heading'),
        sub: val('hc-contact-sub'),
        email: val('hc-contact-email'),
        whatsapp: val('hc-contact-whatsapp'),
        hours: val('hc-contact-hours')
      }
    };

    // Merge into existing homeContent — don't clobber tour/meta, buckets, families, productStrip
    const current = D.state?.data?.homeContent || {};
    const merged = { ...current, ...payload, updatedAt: new Date().toISOString() };

    await D.set(D.ref(D.db, D.P(HOME_PATH)), merged);
    if (D.state.data) D.state.data.homeContent = merged;

    if (statusEl) { statusEl.textContent = '✓ Saved.'; statusEl.style.color = 'var(--accent-green)'; }
    toast('Home content saved.', 'success');
  } catch (e) {
    if (statusEl) { statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--accent-red)'; }
    toast('Save failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save all text sections'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function val(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function field(id, label, value, extra = '') {
  return `
    <label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <input type="text" id="${id}" value="${escAttr(value)}" ${extra}
        style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
    </label>
  `;
}

function textarea(id, label, value) {
  return `
    <label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <textarea id="${id}" rows="3"
        style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;resize:vertical;">${escAttr(value)}</textarea>
    </label>
  `;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function flattenNode(node) {
  if (!node || typeof node !== 'object') return {};
  if (Array.isArray(node)) {
    const out = {};
    node.forEach((item, i) => { if (item) out[item.key || i] = item; });
    return out;
  }
  return node;
}

function toast(msg, type) {
  if (D?.toast) return D.toast(msg, type);
  try { window.toast?.(msg, type); } catch (_) {}
}

export default { initHomeContent, renderHomeContent };
