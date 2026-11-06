/* ═══════════════════════════════════════════════════════════════
   VIORA — HOME CONTENT EDITOR (v3.0)
   ═══════════════════════════════════════════════════════════════

   Bug fixes over v2.1:
     • openIndustryEditor was missing its closing brace — module
       wouldn't load
     • Duplicate deleteBucket / deleteFamily declarations removed
     • Delete buttons use native confirm() to avoid modal conflicts
     • Grid delete buttons use event delegation (survive re-render)
     • Industry modal: centered vertically, z-index 99999, safe-area
       padding, scrolls the overlay when tall
     • Removed unused confirmModal usage in industry delete path
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

const COLOR_PALETTE = [
  { hex: '#2267EE', label: 'Royal Blue' },
  { hex: '#23C7D9', label: 'Cyan' },
  { hex: '#8B5CF6', label: 'Purple' },
  { hex: '#10B981', label: 'Emerald' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#EF4444', label: 'Red' },
  { hex: '#F97316', label: 'Orange' },
  { hex: '#14B8A6', label: 'Teal' },
  { hex: '#6366F1', label: 'Indigo' },
  { hex: '#0EA5E9', label: 'Sky' },
  { hex: '#A855F7', label: 'Violet' },
  { hex: '#64748B', label: 'Slate' },
  { hex: '#DC2626', label: 'Crimson' },
  { hex: '#059669', label: 'Green' },
  { hex: '#D97706', label: 'Gold' },
  { hex: '#7C3AED', label: 'Deep Purple' },
  { hex: '#DB2777', label: 'Rose' },
  { hex: '#0891B2', label: 'Ocean' },
  { hex: '#65A30D', label: 'Lime' },
  { hex: '#EA580C', label: 'Rust' },
  { hex: '#4338CA', label: 'Navy' },
  { hex: '#BE123C', label: 'Maroon' },
  { hex: '#15803D', label: 'Forest' },
];

const ICON_SUGGESTIONS = [
  'fa-cube', 'fa-store', 'fa-briefcase', 'fa-code', 'fa-globe',
  'fa-mobile-screen', 'fa-user', 'fa-bullhorn', 'fa-palette',
  'fa-robot', 'fa-cloud', 'fa-screwdriver-wrench', 'fa-crown',
  'fa-industry', 'fa-building', 'fa-hospital', 'fa-utensils',
  'fa-graduation-cap', 'fa-hotel', 'fa-scissors', 'fa-dumbbell',
  'fa-car', 'fa-paw', 'fa-seedling', 'fa-helmet-safety',
  'fa-house', 'fa-cross', 'fa-shirt', 'fa-shield-halved',
  'fa-broom', 'fa-leaf', 'fa-camera', 'fa-calendar',
  'fa-user-tie', 'fa-plane', 'fa-print', 'fa-scale-balanced',
  'fa-drafting-compass', 'fa-umbrella', 'fa-wand-magic-sparkles',
];

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
  if (!D.state) D.state = {};
  if (!D.state._hce) D.state._hce = {};
}

/* ═══════════════════════════════════════════════════════════════
   RENDER — main entry point
   ═══════════════════════════════════════════════════════════════ */
export function renderHomeContent() {
  const host = document.getElementById('tab-home-content');
  if (!host) return;

  const state = D.state._hce = D.state._hce || {};
  const activeTab = state.activeTab || 'hero';

  host.innerHTML = `
    <div style="padding:24px;max-width:1280px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin:0 0 4px;font-size:24px;letter-spacing:-0.02em;">Home Content</h2>
          <p style="margin:0;color:var(--text-muted);font-size:.85rem;">
            Edit the landing page (index.html) and the industries catalog. Changes save per-section.
          </p>
        </div>
        <button type="button" class="btn btn-success" id="hc-save-btn" style="padding:10px 18px;">
          <i class="fa-solid fa-check"></i> Save all text sections
        </button>
      </div>

      <div id="hc-status" style="margin-bottom:16px;font-size:.85rem;min-height:20px;"></div>

      <div class="hc-tabs" style="display:flex;gap:4px;padding:4px;background:var(--bg-elev-2);border-radius:12px;margin-bottom:24px;flex-wrap:wrap;border:1px solid var(--border-color);">
        ${[
          ['Hero','hero','fa-heading'],
          ['Intent','intent','fa-th-large'],
          ['Buckets & Families','buckets','fa-sitemap'],
          ['Industries','industries','fa-industry'],
          ['Products','products','fa-box'],
          ['Ecosystem','ecosystem','fa-circle-nodes'],
          ['Dashboard','dashboard','fa-chart-pie'],
          ['Cases','cases','fa-file-lines'],
          ['Pricing','pricing','fa-tags'],
          ['Academy','academy','fa-graduation-cap'],
          ['Contact','contact','fa-envelope']
        ].map(([label, key, icon]) => {
          const isActive = activeTab === key;
          return `
            <button type="button" class="btn btn-xs hc-tab-btn" data-tab="${key}"
              style="border-radius:9px;padding:8px 14px;font-size:.78rem;display:inline-flex;align-items:center;gap:6px;
                ${isActive
                  ? 'background:var(--accent-blue);color:#fff;border-color:var(--accent-blue);box-shadow:0 4px 12px -2px rgba(34,103,238,.4);'
                  : 'background:transparent;border-color:transparent;'}">
              <i class="fa-solid ${icon}" style="font-size:.72rem;"></i>
              ${label}
            </button>
          `;
        }).join('')}
      </div>

      <div id="hc-panels"></div>
    </div>

    <!-- Modal host (industry editor + bucket/family editors) -->
    <div id="hc-modal-host"></div>
  `;

  renderPanels();

  /* Tab switching */
  host.querySelectorAll('.hc-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      D.state._hce.activeTab = btn.dataset.tab;
      host.querySelectorAll('.hc-tab-btn').forEach(b => {
        b.style.background = '';
        b.style.color = '';
        b.style.borderColor = '';
        b.style.boxShadow = '';
      });
      btn.style.background = 'var(--accent-blue)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--accent-blue)';
      btn.style.boxShadow = '0 4px 12px -2px rgba(34,103,238,.4)';
      host.querySelectorAll('[data-panel]').forEach((p) => {
        p.style.display = p.dataset.panel === btn.dataset.tab ? 'block' : 'none';
      });
    });
  });

  document.getElementById('hc-save-btn').addEventListener('click', saveAllTextSections);

  if (D.state._hce.editorOpenKey) {
    setTimeout(() => openIndustryEditor(D.state._hce.editorOpenKey, true), 50);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PANEL DISPATCHER
   ═══════════════════════════════════════════════════════════════ */
function renderPanels() {
  const host = document.getElementById('hc-panels');
  if (!host) return;
  const activeTab = D.state._hce?.activeTab || 'hero';

  host.innerHTML = `
    <div data-panel="hero" style="display:${activeTab === 'hero' ? 'block' : 'none'};">${renderHeroPanel()}</div>
    <div data-panel="intent" style="display:${activeTab === 'intent' ? 'block' : 'none'};">${renderIntentPanel()}</div>
    <div data-panel="buckets" style="display:${activeTab === 'buckets' ? 'block' : 'none'};">${renderBucketsFamiliesPanel()}</div>
    <div data-panel="industries" style="display:${activeTab === 'industries' ? 'block' : 'none'};">${renderIndustriesPanel()}</div>
    <div data-panel="products" style="display:${activeTab === 'products' ? 'block' : 'none'};">${renderProductsPanel()}</div>
    <div data-panel="ecosystem" style="display:${activeTab === 'ecosystem' ? 'block' : 'none'};">${renderStaticPanel('ecosystem')}</div>
    <div data-panel="dashboard" style="display:${activeTab === 'dashboard' ? 'block' : 'none'};">${renderStaticPanel('dashboard')}</div>
    <div data-panel="cases" style="display:${activeTab === 'cases' ? 'block' : 'none'};">${renderStaticPanel('cases')}</div>
    <div data-panel="pricing" style="display:${activeTab === 'pricing' ? 'block' : 'none'};">${renderStaticPanel('pricing')}</div>
    <div data-panel="academy" style="display:${activeTab === 'academy' ? 'block' : 'none'};">${renderStaticPanel('academy')}</div>
    <div data-panel="contact" style="display:${activeTab === 'contact' ? 'block' : 'none'};">${renderStaticPanel('contact')}</div>
  `;

  bindBucketsFamiliesPanel();
  bindIndustriesPanel();
  bindProductsPanel();
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: HERO
   ═══════════════════════════════════════════════════════════════ */
function renderHeroPanel() {
  const h = (D.state?.data?.homeContent?.hero) || HERO_DEFAULTS;
  return `
    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);">
        <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
          <i class="fa-solid fa-heading"></i>
        </div>
        <div>
          <h3 style="margin:0;font-size:16px;">Hero section</h3>
          <p style="margin:2px 0 0;font-size:.75rem;color:var(--text-muted);">The first thing visitors see.</p>
        </div>
      </div>
      ${field('hc-hero-eyebrow', 'Eyebrow', h.eyebrow)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-hero-title1', 'Title line 1', h.titleLine1)}
        ${field('hc-hero-title2', 'Title line 2', h.titleLine2)}
      </div>
      ${textarea('hc-hero-subtitle', 'Subtitle', h.subtitle)}
      <h4 style="margin:20px 0 10px;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Call to action buttons</h4>
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
   PANEL: INTENT
   ═══════════════════════════════════════════════════════════════ */
function renderIntentPanel() {
  const tiles = (D.state?.data?.homeContent?.intentTiles) || INTENT_DEFAULTS;
  return `
    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);">
        <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
          <i class="fa-solid fa-th-large"></i>
        </div>
        <div>
          <h3 style="margin:0;font-size:16px;">Intent router</h3>
          <p style="margin:2px 0 0;font-size:.75rem;color:var(--text-muted);">The four big cards below the hero.</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${tiles.map((t, i) => `
          <div style="padding:16px;background:var(--bg-card-solid);border-radius:10px;border:1px solid var(--border-color);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span style="width:28px;height:28px;border-radius:6px;background:var(--accent-blue);color:#fff;display:grid;place-items:center;font-size:.7rem;font-weight:700;">${i + 1}</span>
              <strong style="font-size:.88rem;">Tile ${i + 1}</strong>
            </div>
            ${field(`hc-intent-${i}-title`, 'Title',       t.title)}
            ${field(`hc-intent-${i}-icon`,  'Icon class',  t.icon)}
            ${field(`hc-intent-${i}-desc`,  'Description', t.desc)}
            ${field(`hc-intent-${i}-href`,  'Link',        t.href)}
          </div>
        `).join('')}
      </div>
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
    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);">
        <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
          <i class="fa-solid fa-message"></i>
        </div>
        <div>
          <h3 style="margin:0;font-size:16px;">Tour intro text</h3>
          <p style="margin:2px 0 0;font-size:.75rem;color:var(--text-muted);">Appears above the tour on the landing page.</p>
        </div>
      </div>
      ${field('hc-tour-meta-eyebrow', 'Eyebrow', meta.eyebrow || '')}
      ${field('hc-tour-meta-heading', 'Heading', meta.heading || '')}
      ${textarea('hc-tour-meta-sub', 'Subtitle', meta.sub || '')}
      <button type="button" class="btn btn-outline btn-sm" id="hc-save-tour-meta" style="margin-top:8px;">
        <i class="fa-solid fa-check"></i> Save tour intro
      </button>
    </div>

    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
            <i class="fa-solid fa-sitemap"></i>
          </div>
          <div>
            <h3 style="margin:0;font-size:16px;">Buckets (${bucketList.length})</h3>
            <p style="margin:2px 0 0;font-size:.75rem;color:var(--text-muted);">Top-level tour questions ("What are you trying to do?").</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="hc-add-bucket" style="padding:10px 16px;">
          <i class="fa-solid fa-plus"></i> Add bucket
        </button>
      </div>
      <div id="hc-bucket-list">
        ${bucketList.length === 0 ? emptyState({
          icon: 'fa-layer-group',
          title: 'No buckets yet',
          text: 'Buckets are the first thing visitors see in the tour. Start with something like "Run my business".',
          action: { label: 'Add your first bucket', id: 'hc-add-bucket-empty' }
        }) : bucketList.map(b => renderBucketCard(b, families)).join('')}
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
         style="padding:18px;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:12px;margin-bottom:12px;transition:border-color 0.15s;">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="width:36px;height:36px;border-radius:9px;background:${escAttr(bucket.color || '#2267EE')}22;color:${escAttr(bucket.color || '#2267EE')};display:grid;place-items:center;flex-shrink:0;">
              <i class="${escAttr(bucket.icon || 'fa-solid fa-cube')}" style="font-size:16px;"></i>
            </span>
            <strong style="font-size:1rem;">${escHtml(bucket.name || '(unnamed)')}</strong>
            <code style="font-size:.7rem;color:var(--text-muted);background:var(--bg-elev-2);padding:2px 8px;border-radius:5px;font-family:monospace;">${escHtml(bucket.key || '')}</code>
          </div>
          <p style="margin:0;font-size:.82rem;color:var(--text-muted);line-height:1.5;">${escHtml(bucket.desc || '')}</p>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button type="button" class="btn btn-outline btn-xs" data-edit-bucket="${escAttr(bucket.key)}" title="Edit bucket" style="padding:8px 10px;">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="btn btn-danger btn-xs" data-delete-bucket="${escAttr(bucket.key)}" title="Delete bucket" style="padding:8px 10px;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <div style="padding:14px;background:var(--bg-elev-2);border-radius:10px;border:1px solid var(--border-color);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">
            Families (${familiesInBucket.length})
          </strong>
          <button type="button" class="btn btn-outline btn-xs" data-add-family-in="${escAttr(bucket.key)}" style="padding:6px 10px;">
            <i class="fa-solid fa-plus"></i> Add family
          </button>
        </div>
        ${familiesInBucket.length === 0 ? `
          <p style="margin:0;font-size:.78rem;color:var(--text-muted);font-style:italic;">No families yet.</p>
        ` : familiesInBucket.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg-card-solid);border-radius:8px;margin-bottom:4px;border:1px solid var(--border-color);">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;">
              <i class="${escAttr(f.icon || 'fa-solid fa-folder')}" style="color:${escAttr(bucket.color || '#2267EE')};font-size:14px;flex-shrink:0;"></i>
              <span style="font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(f.name || '(unnamed)')}</span>
              <code style="font-size:.68rem;color:var(--text-muted);font-family:monospace;">${escHtml(f.key || '')}</code>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button type="button" class="btn btn-outline btn-xs" data-edit-family="${escAttr(f.key)}" title="Edit family" style="padding:6px 8px;">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button type="button" class="btn btn-danger btn-xs" data-delete-family="${escAttr(f.key)}" title="Delete family" style="padding:6px 8px;">
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
      toast('Tour intro saved.', 'success');
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    }
  });

  document.getElementById('hc-add-bucket')?.addEventListener('click', () => openBucketEditor(null));
  document.getElementById('hc-add-bucket-empty')?.addEventListener('click', () => openBucketEditor(null));

  /* Delegate on the bucket list container so freshly-rendered
     cards still respond to clicks. */
  const bucketList = document.getElementById('hc-bucket-list');
  if (bucketList && !bucketList._delegateBound) {
    bucketList._delegateBound = true;
    bucketList.addEventListener('click', (e) => {
      const editB = e.target.closest('[data-edit-bucket]');
      if (editB) { e.preventDefault(); openBucketEditor(editB.dataset.editBucket); return; }

      const delB = e.target.closest('[data-delete-bucket]');
      if (delB) { e.preventDefault(); deleteBucket(delB.dataset.deleteBucket); return; }

      const addF = e.target.closest('[data-add-family-in]');
      if (addF) { e.preventDefault(); openFamilyEditor(null, addF.dataset.addFamilyIn); return; }

      const editF = e.target.closest('[data-edit-family]');
      if (editF) { e.preventDefault(); openFamilyEditor(editF.dataset.editFamily, null); return; }

      const delF = e.target.closest('[data-delete-family]');
      if (delF) { e.preventDefault(); deleteFamily(delF.dataset.deleteFamily); return; }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   BUCKET EDITOR MODAL
   ═══════════════════════════════════════════════════════════════ */
function openBucketEditor(key) {
  const existing = key
    ? flattenNode(D.state?.data?.homeContent?.tour?.buckets)[key] || {}
    : {};
  const isNew = !key;

  openModal({
    id: 'hc-bucket-editor-modal',
    icon: 'fa-layer-group',
    title: isNew ? 'Add bucket' : `Edit "${existing.name || key}"`,
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${formField('hc-bucket-name', 'Name *', existing.name || '', 'e.g. Run my business')}
        ${formField('hc-bucket-key', 'Key *', existing.key || key || '', 'e.g. run', !isNew)}
      </div>
      ${formTextarea('hc-bucket-desc', 'Description', existing.desc || '', 'What does this bucket cover?')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${iconPickerField('hc-bucket-icon', 'Icon', existing.icon || 'fa-briefcase')}
        ${formField('hc-bucket-order', 'Sort order', String(existing.order || 1))}
      </div>
      ${colorPickerField('hc-bucket-color', 'Color', existing.color || '#2267EE')}
    `,
    footer: `
      <button type="button" class="btn btn-outline" data-modal-cancel>Cancel</button>
      <button type="button" class="btn btn-primary" data-modal-save>
        <i class="fa-solid fa-check"></i> ${isNew ? 'Create bucket' : 'Save changes'}
      </button>
    `,
    onSave: async () => {
      const name = val('hc-bucket-name');
      const keyVal = val('hc-bucket-key');
      if (!name) { toast('Name is required.', 'error'); return; }
      if (!keyVal || !/^[a-z0-9-]+$/.test(keyVal)) { toast('Key must be lowercase letters, numbers, hyphens.', 'error'); return; }

      const bucket = {
        key: keyVal,
        name,
        desc: val('hc-bucket-desc'),
        icon: val('hc-bucket-icon') || 'fa-briefcase',
        color: val('hc-bucket-color') || '#2267EE',
        order: parseInt(val('hc-bucket-order'), 10) || 1
      };
      await D.set(D.ref(D.db, `${D.P(BUCKETS_PATH)}/${keyVal}`), bucket);
      if (!D.state.data.homeContent) D.state.data.homeContent = {};
      if (!D.state.data.homeContent.tour) D.state.data.homeContent.tour = {};
      if (!D.state.data.homeContent.tour.buckets) D.state.data.homeContent.tour.buckets = {};
      D.state.data.homeContent.tour.buckets[keyVal] = bucket;
      closeModal();
      toast(`Bucket "${name}" saved.`, 'success');
      renderPanels();
      document.querySelectorAll('.hc-tab-btn[data-tab="buckets"]').forEach(b => b.click());
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   FAMILY EDITOR MODAL
   ═══════════════════════════════════════════════════════════════ */
function openFamilyEditor(key, presetBucketKey) {
  const existing = key
    ? flattenNode(D.state?.data?.homeContent?.tour?.families)[key] || {}
    : {};
  const buckets = Object.values(flattenNode(D.state?.data?.homeContent?.tour?.buckets))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  if (!buckets.length) {
    toast('Create a bucket first.', 'warning');
    return;
  }

  const currentBucket = existing.bucket || presetBucketKey || buckets[0].key;
  const isNew = !key;

  openModal({
    id: 'hc-family-editor-modal',
    icon: 'fa-folder',
    title: isNew ? 'Add family' : `Edit "${existing.name || key}"`,
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${formField('hc-family-name', 'Name *', existing.name || '', 'e.g. Core business systems')}
        ${formField('hc-family-key', 'Key *', existing.key || key || '', 'e.g. core', !isNew)}
      </div>
      ${formTextarea('hc-family-desc', 'Description', existing.desc || '', 'What is this family about?')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${formSelect('hc-family-bucket', 'Bucket *', buckets.map(b => ({ value: b.key, label: b.name || b.key })), currentBucket)}
        ${formField('hc-family-order', 'Sort order', String(existing.order || 1))}
      </div>
      ${iconPickerField('hc-family-icon', 'Icon', existing.icon || 'fa-cube')}
    `,
    footer: `
      <button type="button" class="btn btn-outline" data-modal-cancel>Cancel</button>
      <button type="button" class="btn btn-primary" data-modal-save>
        <i class="fa-solid fa-check"></i> ${isNew ? 'Create family' : 'Save changes'}
      </button>
    `,
    onSave: async () => {
      const name = val('hc-family-name');
      const keyVal = val('hc-family-key');
      if (!name) { toast('Name is required.', 'error'); return; }
      if (!keyVal || !/^[a-z0-9-]+$/.test(keyVal)) { toast('Key must be lowercase letters, numbers, hyphens.', 'error'); return; }

      const family = {
        key: keyVal,
        name,
        desc: val('hc-family-desc'),
        icon: val('hc-family-icon') || 'fa-cube',
        bucket: val('hc-family-bucket'),
        order: parseInt(val('hc-family-order'), 10) || 1
      };
      await D.set(D.ref(D.db, `${D.P(FAMILIES_PATH)}/${keyVal}`), family);
      if (!D.state.data.homeContent.tour.families) D.state.data.homeContent.tour.families = {};
      D.state.data.homeContent.tour.families[keyVal] = family;
      closeModal();
      toast(`Family "${name}" saved.`, 'success');
      renderPanels();
      document.querySelectorAll('.hc-tab-btn[data-tab="buckets"]').forEach(b => b.click());
    }
  });
}

async function deleteBucket(key) {
  if (!confirm(`Delete bucket "${key}"? Industries assigned to it will need to be reassigned manually.`)) return;
  try {
    await D.set(D.ref(D.db, `${D.P(BUCKETS_PATH)}/${key}`), null);
    if (D.state.data.homeContent?.tour?.buckets) delete D.state.data.homeContent.tour.buckets[key];
    toast('Bucket deleted.', 'success');
    renderPanels();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

async function deleteFamily(key) {
  if (!confirm(`Delete family "${key}"? Industries assigned to it will need to be reassigned manually.`)) return;
  try {
    await D.set(D.ref(D.db, `${D.P(FAMILIES_PATH)}/${key}`), null);
    if (D.state.data.homeContent?.tour?.families) delete D.state.data.homeContent.tour.families[key];
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
    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
            <i class="fa-solid fa-industry"></i>
          </div>
          <div>
            <h3 style="margin:0;font-size:16px;">Industries (${list.length})</h3>
            <p style="margin:2px 0 0;font-size:.75rem;color:var(--text-muted);">Drive the tour AND the marketplace categories.</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="hc-add-industry" style="padding:10px 16px;">
          <i class="fa-solid fa-plus"></i> Add industry
        </button>
      </div>

      ${list.length === 0 ? emptyState({
        icon: 'fa-industry',
        title: 'No industries yet',
        text: 'Industries power both the tour and the marketplace categories. Start with one — like "Retail & Wholesale".',
        action: { label: 'Add your first industry', id: 'hc-add-industry-empty' }
      }) : `
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          <input type="text" id="hc-ind-search" placeholder="🔍 Search industries…"
                 style="flex:1;min-width:200px;padding:10px 14px;border-radius:10px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
          <select id="hc-ind-filter-bucket" style="padding:10px 14px;border-radius:10px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;">
            <option value="">All buckets</option>
            ${Object.values(flattenNode(D.state?.data?.homeContent?.tour?.buckets)).map(b => `<option value="${escAttr(b.key)}">${escHtml(b.name || b.key)}</option>`).join('')}
          </select>
          <select id="hc-ind-filter-family" style="padding:10px 14px;border-radius:10px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;">
            <option value="">All families</option>
            ${Object.values(flattenNode(D.state?.data?.homeContent?.tour?.families)).map(f => `<option value="${escAttr(f.key)}">${escHtml(f.name || f.key)}</option>`).join('')}
          </select>
        </div>

        <div id="hc-industry-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
          ${list.map(i => renderIndustryCard(i)).join('')}
        </div>
      `}
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
         style="padding:0;background:var(--bg-card-solid);border:1px solid var(--border-color);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:all .15s;">

      <div style="width:100%;height:120px;overflow:hidden;background:${color}15;display:flex;align-items:center;justify-content:center;position:relative;">
        ${image
          ? `<img src="${escAttr(image)}" alt="${escAttr(ind.name || '')}" style="width:100%;height:100%;object-fit:cover;"/>`
          : `<i class="${escAttr(ind.icon || 'fa-solid fa-cube')}" style="font-size:44px;color:${color};"></i>`}
        ${!ind.active ? `<span style="position:absolute;top:8px;right:8px;background:var(--accent-red);color:#fff;font-size:.65rem;font-weight:700;letter-spacing:.06em;padding:3px 8px;border-radius:6px;">INACTIVE</span>` : ''}
      </div>

      <div style="padding:14px;flex:1;display:flex;flex-direction:column;gap:8px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
            <span style="font-size:18px;line-height:1;">${escHtml(ind.emoji || '📦')}</span>
            <strong style="font-size:.92rem;line-height:1.2;">${escHtml(ind.name || '(unnamed)')}</strong>
          </div>
          <div style="font-size:.7rem;color:var(--text-muted);">${escHtml(ind.marketCategory || '')}</div>
        </div>

        <div style="display:flex;gap:4px;align-items:center;font-size:.68rem;color:var(--text-muted);font-family:monospace;">
          <span>${escHtml(ind.bucket || '?')}</span>
          <span>›</span>
          <span>${escHtml(ind.family || '?')}</span>
        </div>

        <div style="display:flex;gap:6px;margin-top:auto;">
          <button type="button" class="btn btn-outline btn-xs" data-edit-industry="${escAttr(ind.key)}" style="flex:1;padding:8px 10px;justify-content:center;">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button type="button" class="btn btn-danger btn-xs" data-delete-industry="${escAttr(ind.key)}" style="padding:8px 10px;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindIndustriesPanel() {
  document.getElementById('hc-add-industry')?.addEventListener('click', () => openIndustryEditor(null));
  document.getElementById('hc-add-industry-empty')?.addEventListener('click', () => openIndustryEditor(null));

  /* Delegate clicks on the grid so newly-rendered cards still respond */
  const grid = document.getElementById('hc-industry-grid');
  if (grid && !grid._delegateBound) {
    grid._delegateBound = true;
    grid.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-industry]');
      if (editBtn) {
        e.preventDefault();
        openIndustryEditor(editBtn.dataset.editIndustry);
        return;
      }
      const delBtn = e.target.closest('[data-delete-industry]');
      if (delBtn) {
        e.preventDefault();
        deleteIndustry(delBtn.dataset.deleteIndustry);
        return;
      }
    });
  }

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
   INDUSTRY EDITOR — CENTERED WIDE MODAL
   ═══════════════════════════════════════════════════════════════ */
function openIndustryEditor(key, isRestore = false) {
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

  const host = document.getElementById('hc-modal-host');
  if (!host) {
    console.warn('[openIndustryEditor] #hc-modal-host not found');
    return;
  }

  D.state._hce = D.state._hce || {};
  D.state._hce.editorOpenKey = key || '__new__';
  D.state._hce.editorIsDirty = false;
  D.state._hce.uploadedImage = null;

  const isNew = !key;
  const imageData = existing.image || existing.imageUrl || '';
  const buckets = Object.values(flattenNode(D.state?.data?.homeContent?.tour?.buckets))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
  const families = Object.values(flattenNode(D.state?.data?.homeContent?.tour?.families))
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

  host.innerHTML = `
    <div id="hc-ind-modal" role="dialog" aria-modal="true" aria-labelledby="hc-ind-modal-title"
         style="position:fixed;inset:0;background:rgba(10,25,47,.7);
                display:flex;align-items:center;justify-content:center;
                padding:max(24px, env(safe-area-inset-top, 24px)) 24px max(24px, env(safe-area-inset-bottom, 24px));
                z-index:99999;animation:hcFadeIn .18s ease;overflow-y:auto;">

      <div id="hc-ind-card" style="background:var(--bg-elev-1);border-radius:18px;box-shadow:0 32px 80px -16px rgba(0,0,0,.5);
                  width:100%;max-width:820px;max-height:calc(100vh - 80px);
                  display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border-color);
                  margin:auto;animation:hcSlideUp .22s cubic-bezier(0.34,1.56,0.64,1);">

        <!-- Sticky header -->
        <div style="padding:18px 24px;border-bottom:1px solid var(--border-color);
                    display:flex;justify-content:space-between;align-items:center;flex-shrink:0;background:var(--bg-elev-1);">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;">
            <div style="width:38px;height:38px;border-radius:10px;
                        background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));
                        display:grid;place-items:center;color:#fff;flex-shrink:0;">
              <i class="fa-solid fa-industry"></i>
            </div>
            <div style="min-width:0;">
              <h3 id="hc-ind-modal-title" style="margin:0;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${isNew ? 'Add industry' : escHtml(existing.name || key)}
              </h3>
              <p style="margin:2px 0 0;font-size:.72rem;color:var(--text-muted);">
                ${isNew ? 'New entry' : `<code style="font-family:monospace;">${escHtml(key)}</code>`}
              </p>
            </div>
          </div>
          <button type="button" id="hc-ind-close" aria-label="Close"
                  style="background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-muted);
                         width:34px;height:34px;border-radius:9px;cursor:pointer;font-size:18px;
                         display:grid;place-items:center;line-height:1;flex-shrink:0;">×</button>
        </div>

        <!-- Scroll body (2-column on ≥ 900px) -->
        <div style="flex:1;overflow-y:auto;padding:24px;background:var(--bg-elev-1);">
          <div id="hc-ind-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">

            <!-- IDENTITY -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-id-card" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Identity</h4>
              </div>
              ${formField('hc-ind-key', 'Key *', existing.key || '', 'lowercase, no spaces', !isNew)}
              ${formField('hc-ind-name', 'Name *', existing.name || '', 'e.g. Retail & Wholesale')}
              ${formField('hc-ind-marketCategory', 'Market Category *', existing.marketCategory || '', 'Must match product.category exactly')}
              <div style="display:grid;grid-template-columns:80px 1fr;gap:12px;">
                ${formField('hc-ind-emoji', 'Emoji', existing.emoji || '📦')}
                ${iconPickerField('hc-ind-icon', 'Icon', existing.icon || 'fa-cube')}
              </div>
            </section>

            <!-- APPEARANCE -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-palette" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Appearance</h4>
              </div>
              ${colorPickerField('hc-ind-color', 'Color', existing.color || '#2267EE')}
              ${imagePickerField('hc-ind-image', 'Image', imageData)}
            </section>

            <!-- PLACEMENT -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-sitemap" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Placement in tour</h4>
              </div>
              ${formSelect('hc-ind-bucket', 'Bucket *', buckets.map(b => ({ value: b.key, label: b.name || b.key })), existing.bucket, '— Select bucket —')}
              ${formSelect('hc-ind-family', 'Family *', families.map(f => ({ value: f.key, label: f.name || f.key, bucket: f.bucket })), existing.family, '— Select family —')}
              ${formField('hc-ind-order', 'Sort order', String(existing.order || 99))}
              <label style="display:flex;align-items:center;gap:8px;font-size:.88rem;padding:6px 0;cursor:pointer;">
                <input type="checkbox" id="hc-ind-active" ${existing.active !== false ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;"/>
                Active (visible in tour &amp; marketplace)
              </label>
            </section>

            <!-- LINKS -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-link" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Links</h4>
              </div>
              ${formField('hc-ind-previewUrl', 'Preview URL', existing.previewUrl || '', 'Opens when "View sample" is clicked')}
              ${formField('hc-ind-buyUrl', 'Buy URL', existing.buyUrl || '', 'Optional override for "Buy now"')}
            </section>

            <!-- COPY -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-align-left" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Copy</h4>
              </div>
              ${formTextarea('hc-ind-desc', 'Short description', existing.desc || '', 'Shown on the tour card')}
              ${formTextarea('hc-ind-longDesc', 'Long description', existing.longDesc || '', 'Shown in the "More" popup')}
            </section>

            <!-- BULLETS -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-list-check" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Bullets</h4>
              </div>
              <div id="hc-ind-bullets">
                ${(existing.bullets || []).map((b) => bulletRow(b)).join('')}
              </div>
              <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-bullet" style="margin-top:8px;">
                <i class="fa-solid fa-plus"></i> Add bullet
              </button>
            </section>

            <!-- STATS -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-chart-simple" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Stats</h4>
              </div>
              <div id="hc-ind-stats">
                ${(existing.stats || []).map((s) => statRow(s)).join('')}
              </div>
              <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-stat" style="margin-top:8px;">
                <i class="fa-solid fa-plus"></i> Add stat
              </button>
            </section>

            <!-- INCLUDED -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-circle-check" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">What's included</h4>
              </div>
              <div id="hc-ind-included">
                ${(existing.included || []).map((it) => includedRow(it)).join('')}
              </div>
              <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-included" style="margin-top:8px;">
                <i class="fa-solid fa-plus"></i> Add feature
              </button>
            </section>

            <!-- FAQS -->
            <section>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
                <i class="fa-solid fa-circle-question" style="color:var(--accent-blue);font-size:.85rem;"></i>
                <h4 style="margin:0;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">FAQs</h4>
              </div>
              <div id="hc-ind-faqs">
                ${(existing.faqs || []).map((f) => faqRow(f)).join('')}
              </div>
              <button type="button" class="btn btn-outline btn-xs" id="hc-ind-add-faq" style="margin-top:8px;">
                <i class="fa-solid fa-plus"></i> Add FAQ
              </button>
            </section>

          </div>
        </div>

        <!-- Sticky footer -->
        <div style="padding:14px 24px;border-top:1px solid var(--border-color);
                    display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;background:var(--bg-elev-1);">
          ${!isNew ? `<button type="button" class="btn btn-danger" id="hc-ind-delete" style="margin-right:auto;">
            <i class="fa-solid fa-trash"></i> Delete
          </button>` : ''}
          <button type="button" class="btn btn-outline" id="hc-ind-cancel">Cancel</button>
          <button type="button" class="btn btn-success" id="hc-ind-save">
            <i class="fa-solid fa-check"></i> ${isNew ? 'Create industry' : 'Save changes'}
          </button>
        </div>

      </div>
    </div>

    <style>
      @keyframes hcFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes hcSlideUp { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @media (max-width: 900px) {
        #hc-ind-grid { grid-template-columns: 1fr !important; }
        #hc-ind-card { max-width: calc(100vw - 24px) !important; max-height: calc(100vh - 24px) !important; border-radius: 14px !important; }
      }
    </style>
  `;

  const modal = document.getElementById('hc-ind-modal');
  const card = document.getElementById('hc-ind-card');

  /* Backdrop click does NOTHING (protects unsaved work) */
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { /* no-op */ }
  });

  /* Close with unsaved-changes guard */
  const closeModalFn = async () => {
    if (D.state._hce.editorIsDirty) {
      if (!confirm('You have unsaved changes. Close anyway?')) return;
    }
    modal.style.transition = 'opacity .15s';
    modal.style.opacity = '0';
    setTimeout(() => {
      host.innerHTML = '';
      D.state._hce.editorOpenKey = null;
      D.state._hce.editorIsDirty = false;
      D.state._hce.uploadedImage = null;
    }, 150);
  };

  document.getElementById('hc-ind-close')?.addEventListener('click', closeModalFn);
  document.getElementById('hc-ind-cancel')?.addEventListener('click', closeModalFn);

  /* Escape closes */
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModalFn();
    }
  };
  document.addEventListener('keydown', escHandler);
  const observer = new MutationObserver(() => {
    if (!document.getElementById('hc-ind-modal')) {
      document.removeEventListener('keydown', escHandler);
      observer.disconnect();
    }
  });
  observer.observe(host, { childList: true });

  /* Mark dirty on any input */
  card.querySelectorAll('input, textarea, select').forEach(inp => {
    inp.addEventListener('input', () => { D.state._hce.editorIsDirty = true; });
    inp.addEventListener('change', () => { D.state._hce.editorIsDirty = true; });
  });

  bindColorPicker(card, 'hc-ind-color');
  bindIconPicker(card, 'hc-ind-icon');
  bindImagePicker(card, 'hc-ind-image', async (base64) => {
    D.state._hce.uploadedImage = base64;
    D.state._hce.editorIsDirty = true;
  });

  /* Family dropdown filters by bucket */
  const bucketSel = document.getElementById('hc-ind-bucket');
  const familySel = document.getElementById('hc-ind-family');
  if (bucketSel && familySel) {
    const applyFamilyFilter = () => {
      const b = bucketSel.value;
      const current = familySel.value;
      let stillVisible = false;
      Array.from(familySel.options).forEach(opt => {
        if (!opt.value) return;
        const optBucket = opt.dataset.bucket || '';
        const visible = !b || optBucket === b;
        opt.style.display = visible ? '' : 'none';
        if (visible && opt.value === current) stillVisible = true;
      });
      if (!stillVisible) familySel.value = '';
    };
    bucketSel.addEventListener('change', applyFamilyFilter);
    applyFamilyFilter();
  }

  /* Dynamic row adders */
  const addHandlers = {
    'hc-ind-add-bullet': () => {
      document.getElementById('hc-ind-bullets').insertAdjacentHTML('beforeend', bulletRow(''));
      bindRemoveButtons();
      D.state._hce.editorIsDirty = true;
    },
    'hc-ind-add-stat': () => {
      document.getElementById('hc-ind-stats').insertAdjacentHTML('beforeend', statRow({ v: '', l: '' }));
      bindRemoveButtons();
      D.state._hce.editorIsDirty = true;
    },
    'hc-ind-add-included': () => {
      document.getElementById('hc-ind-included').insertAdjacentHTML('beforeend', includedRow(''));
      bindRemoveButtons();
      D.state._hce.editorIsDirty = true;
    },
    'hc-ind-add-faq': () => {
      document.getElementById('hc-ind-faqs').insertAdjacentHTML('beforeend', faqRow({ q: '', a: '' }));
      bindRemoveButtons();
      D.state._hce.editorIsDirty = true;
    }
  };
  Object.entries(addHandlers).forEach(([id, fn]) => {
    document.getElementById(id)?.addEventListener('click', fn);
  });

  function bindRemoveButtons() {
    card.querySelectorAll('[data-remove-row]').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        btn.closest('[data-row]')?.remove();
        D.state._hce.editorIsDirty = true;
      });
    });
  }
  bindRemoveButtons();

  /* Delete — native confirm to avoid modal layering conflicts */
  document.getElementById('hc-ind-delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete industry "${existing.name || key}"? This cannot be undone.`)) return;
    try {
      await D.set(D.ref(D.db, `${D.P(INDUSTRIES_PATH)}/${key}`), null);
      if (D.state.data.industries) delete D.state.data.industries[key];
      toast('Industry deleted.', 'success');
      modal.style.transition = 'opacity .15s';
      modal.style.opacity = '0';
      setTimeout(() => {
        host.innerHTML = '';
        D.state._hce.editorOpenKey = null;
        D.state._hce.editorIsDirty = false;
        D.state._hce.uploadedImage = null;
        renderPanels();
      }, 150);
    } catch (e) {
      toast('Delete failed: ' + e.message, 'error');
    }
  });

  /* Save */
  document.getElementById('hc-ind-save')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const origHtml = btn.innerHTML;

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

    const bullets = [];
    card.querySelectorAll('#hc-ind-bullets [data-row] input').forEach(inp => {
      if (inp.value.trim()) bullets.push(inp.value.trim());
    });
    const stats = [];
    card.querySelectorAll('#hc-ind-stats [data-row]').forEach(row => {
      const v = row.querySelector('[data-stat-v]')?.value.trim() || '';
      const l = row.querySelector('[data-stat-l]')?.value.trim() || '';
      if (v || l) stats.push({ v, l });
    });
    const included = [];
    card.querySelectorAll('#hc-ind-included [data-row] input').forEach(inp => {
      if (inp.value.trim()) included.push(inp.value.trim());
    });
    const faqs = [];
    card.querySelectorAll('#hc-ind-faqs [data-row]').forEach(row => {
      const q = row.querySelector('[data-faq-q]')?.value.trim() || '';
      const a = row.querySelector('[data-faq-a]')?.value.trim() || '';
      if (q) faqs.push({ q, a });
    });

    const uploadedBase64 = D.state._hce.uploadedImage || '';
    const imageUrl = val('hc-ind-image-url') || '';
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

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

    try {
      await D.set(D.ref(D.db, `${D.P(INDUSTRIES_PATH)}/${keyVal}`), industry);
      if (!D.state.data.industries) D.state.data.industries = {};
      D.state.data.industries[keyVal] = industry;
      D.state._hce.editorIsDirty = false;
      D.state._hce.uploadedImage = null;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
      toast(`Industry "${name}" saved.`, 'success');

      setTimeout(() => {
        modal.style.transition = 'opacity .15s';
        modal.style.opacity = '0';
        setTimeout(() => {
          host.innerHTML = '';
          D.state._hce.editorOpenKey = null;
          renderPanels();
          document.querySelectorAll('.hc-tab-btn[data-tab="industries"]').forEach(b => b.click());
        }, 150);
      }, 500);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      toast('Save failed: ' + err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   DELETE INDUSTRY (from grid)
   ═══════════════════════════════════════════════════════════════ */
async function deleteIndustry(key) {
  if (!confirm(`Delete industry "${key}"? This cannot be undone.`)) return;
  try {
    await D.set(D.ref(D.db, `${D.P(INDUSTRIES_PATH)}/${key}`), null);
    if (D.state.data.industries) delete D.state.data.industries[key];
    toast('Industry deleted.', 'success');
    renderPanels();
  } catch (e) {
    toast('Delete failed: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   FORM COMPONENT HELPERS
   ═══════════════════════════════════════════════════════════════ */
function formField(id, label, value, placeholder = '', readonly = false) {
  return `
    <label style="display:block;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <input type="text" id="${id}" value="${escAttr(value)}" ${placeholder ? `placeholder="${escAttr(placeholder)}"` : ''} ${readonly ? 'readonly' : ''}
        style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:inherit;${readonly ? 'opacity:.65;cursor:not-allowed;' : ''}"/>
    </label>
  `;
}

function formTextarea(id, label, value, placeholder = '') {
  return `
    <label style="display:block;margin-top:14px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <textarea id="${id}" rows="3" ${placeholder ? `placeholder="${escAttr(placeholder)}"` : ''}
        style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:inherit;resize:vertical;">${escHtml(value)}</textarea>
    </label>
  `;
}

function formSelect(id, label, options, currentValue, placeholder = '') {
  return `
    <label style="display:block;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <select id="${id}"
        style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:inherit;">
        ${placeholder ? `<option value="">${escHtml(placeholder)}</option>` : ''}
        ${options.map(o => `<option value="${escAttr(o.value)}" ${o.bucket ? `data-bucket="${escAttr(o.bucket)}"` : ''} ${currentValue === o.value ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function colorPickerField(id, label, value) {
  return `
    <div>
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:6px;margin-bottom:10px;">
        ${COLOR_PALETTE.map(c => `
          <button type="button" class="hc-color-swatch" data-color="${c.hex}" title="${c.label}"
            style="background:${c.hex};aspect-ratio:1;border-radius:6px;border:3px solid ${value === c.hex ? '#fff' : 'transparent'};cursor:pointer;padding:0;box-shadow:${value === c.hex ? '0 0 0 2px ' + c.hex : 'none'};transition:transform .12s;"></button>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <input type="color" id="${id}-picker" value="${escAttr(value)}" style="width:48px;height:38px;border:none;background:none;cursor:pointer;border-radius:6px;"/>
        <input type="text" id="${id}" value="${escAttr(value)}" placeholder="#2267EE"
          style="flex:1;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:monospace;"/>
      </div>
    </div>
  `;
}

function iconPickerField(id, label, value) {
  return `
    <div>
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <div id="${id}-preview" style="width:38px;height:38px;border-radius:8px;background:var(--bg-elev-2);border:1px solid var(--border-color);display:grid;place-items:center;color:var(--text-primary);flex-shrink:0;">
          <i class="fa-solid ${escAttr(value.replace(/^fa-solid\s+/, '') || 'fa-cube')}"></i>
        </div>
        <input type="text" id="${id}" value="${escAttr(value)}" placeholder="fa-cube"
          style="flex:1;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:monospace;"/>
      </div>
      <div id="${id}-suggestions" style="display:flex;flex-wrap:wrap;gap:4px;max-height:80px;overflow-y:auto;padding:6px;background:var(--bg-elev-2);border-radius:8px;border:1px solid var(--border-color);">
        ${ICON_SUGGESTIONS.map(icon => `
          <button type="button" class="hc-icon-suggest" data-icon="fa-solid ${icon}" title="${icon}"
            style="width:32px;height:32px;border-radius:6px;border:1px solid transparent;background:var(--bg-card-solid);color:var(--text-primary);cursor:pointer;display:grid;place-items:center;font-size:.75rem;transition:all .1s;">
            <i class="fa-solid ${icon}"></i>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function imagePickerField(id, label, value) {
  return `
    <div style="margin-top:16px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <div id="${id}-preview" style="width:100%;height:160px;border-radius:10px;background:var(--bg-elev-2);border:2px dashed var(--border-color);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:10px;position:relative;cursor:pointer;transition:border-color .15s;">
        ${value
          ? `<img src="${escAttr(value)}" style="width:100%;height:100%;object-fit:cover;"/>
             <button type="button" id="${id}-remove" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1;display:grid;place-items:center;">×</button>`
          : `<div style="text-align:center;color:var(--text-muted);">
               <i class="fa-solid fa-cloud-arrow-up" style="font-size:28px;margin-bottom:8px;opacity:.5;"></i>
               <p style="margin:0;font-size:.82rem;">Click or drag to upload</p>
               <p style="margin:4px 0 0;font-size:.7rem;">Max 800×800px, JPEG 80%</p>
             </div>`}
      </div>
      <input type="file" id="${id}-file" accept="image/*" style="display:none;"/>
      <input type="url" id="${id}-url" placeholder="OR paste image URL" value="${escAttr(!value ? '' : (value.startsWith('data:') ? '' : value))}"
        style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;font-family:inherit;"/>
    </div>
  `;
}

function bindColorPicker(panel, id) {
  const textInput = document.getElementById(id);
  const colorInput = document.getElementById(id + '-picker');
  const swatches = panel.querySelectorAll('.hc-color-swatch');

  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      swatches.forEach(s => { s.style.border = '3px solid transparent'; s.style.boxShadow = 'none'; });
      sw.style.border = '3px solid #fff';
      sw.style.boxShadow = '0 0 0 2px ' + sw.dataset.color;
      if (textInput) textInput.value = sw.dataset.color;
      if (colorInput) colorInput.value = sw.dataset.color;
      D.state._hce.editorIsDirty = true;
    });
  });

  colorInput?.addEventListener('input', (e) => {
    if (textInput) textInput.value = e.target.value;
    swatches.forEach(s => {
      s.style.border = s.dataset.color === e.target.value ? '3px solid #fff' : '3px solid transparent';
      s.style.boxShadow = s.dataset.color === e.target.value ? '0 0 0 2px ' + s.dataset.color : 'none';
    });
  });

  textInput?.addEventListener('input', (e) => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v) && colorInput) colorInput.value = v;
  });
}

function bindIconPicker(panel, id) {
  const input = document.getElementById(id);
  const preview = document.getElementById(id + '-preview');
  const suggestions = panel.querySelectorAll('.hc-icon-suggest');

  const updatePreview = (v) => {
    if (!preview) return;
    const clean = String(v || '').replace(/^fa-solid\s+/, '').replace(/^fa-/, '').trim();
    preview.innerHTML = `<i class="fa-solid ${clean ? 'fa-' + clean : 'fa-cube'}"></i>`;
  };

  input?.addEventListener('input', (e) => updatePreview(e.target.value));

  suggestions.forEach(btn => {
    btn.addEventListener('click', () => {
      if (input) input.value = btn.dataset.icon;
      updatePreview(btn.dataset.icon);
      D.state._hce.editorIsDirty = true;
    });
  });
}

function bindImagePicker(panel, id, onUpload) {
  const preview = document.getElementById(id + '-preview');
  const fileInput = document.getElementById(id + '-file');
  const urlInput = document.getElementById(id + '-url');
  const removeBtn = document.getElementById(id + '-remove');

  preview?.addEventListener('click', (e) => {
    if (e.target.id === id + '-remove') return;
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await resizeImageToBase64(file);
      preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;"/>
        <button type="button" id="${id}-remove" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1;display:grid;place-items:center;">×</button>`;
      if (urlInput) urlInput.value = '';
      document.getElementById(id + '-remove')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        preview.innerHTML = `<div style="text-align:center;color:var(--text-muted);">
          <i class="fa-solid fa-cloud-arrow-up" style="font-size:28px;margin-bottom:8px;opacity:.5;"></i>
          <p style="margin:0;font-size:.82rem;">Click or drag to upload</p>
          <p style="margin:4px 0 0;font-size:.7rem;">Max 800×800px, JPEG 80%</p>
        </div>`;
        onUpload('');
      });
      onUpload(base64);
      toast('Image resized and ready.', 'success');
    } catch (err) {
      toast('Image failed: ' + err.message, 'error');
    }
  });

  urlInput?.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
      preview.innerHTML = `<img src="${escAttr(url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=&quot;color:var(--text-muted);font-size:.82rem;&quot;>Invalid URL</span>';"/>`;
      onUpload('');
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    preview.innerHTML = `<div style="text-align:center;color:var(--text-muted);">
      <i class="fa-solid fa-cloud-arrow-up" style="font-size:28px;margin-bottom:8px;opacity:.5;"></i>
      <p style="margin:0;font-size:.82rem;">Click or drag to upload</p>
      <p style="margin:4px 0 0;font-size:.7rem;">Max 800×800px, JPEG 80%</p>
    </div>`;
    if (urlInput) urlInput.value = '';
    onUpload('');
  });
}

/* ═══════════════════════════════════════════════════════════════
   ROW TEMPLATES
   ═══════════════════════════════════════════════════════════════ */
function bulletRow(value) {
  return `
    <div data-row style="display:flex;gap:8px;margin-bottom:8px;">
      <input type="text" value="${escAttr(value)}" placeholder="e.g. Point of sale"
        style="flex:1;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row style="padding:8px 10px;">×</button>
    </div>
  `;
}
function statRow(stat) {
  return `
    <div data-row style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin-bottom:8px;">
      <input type="text" data-stat-v value="${escAttr(stat.v || '')}" placeholder="+22%"
        style="padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
      <input type="text" data-stat-l value="${escAttr(stat.l || '')}" placeholder="stock accuracy"
        style="padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row style="padding:8px 10px;">×</button>
    </div>
  `;
}
function includedRow(value) {
  return `
    <div data-row style="display:flex;gap:8px;margin-bottom:8px;">
      <input type="text" value="${escAttr(value)}" placeholder="e.g. Inventory"
        style="flex:1;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row style="padding:8px 10px;">×</button>
    </div>
  `;
}
function faqRow(faq) {
  return `
    <div data-row style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin-bottom:8px;">
      <input type="text" data-faq-q value="${escAttr(faq.q || '')}" placeholder="Question"
        style="padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
      <input type="text" data-faq-a value="${escAttr(faq.a || '')}" placeholder="Answer"
        style="padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
      <button type="button" class="btn btn-danger btn-xs" data-remove-row style="padding:8px 10px;">×</button>
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
   GENERIC MODAL (for bucket/family editors)
   ═══════════════════════════════════════════════════════════════ */
function openModal({ id, icon, title, body, footer, onSave }) {
  const host = document.getElementById('hc-modal-host');
  if (!host) return;

  host.innerHTML = `
    <div id="${id}" style="position:fixed;inset:0;background:rgba(10,25,47,.6);display:flex;align-items:center;justify-content:center;padding:24px;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:hcFadeIn .18s ease;">
      <div style="background:var(--bg-elev-1);border-radius:16px;box-shadow:0 32px 80px -16px rgba(0,0,0,.5);max-width:560px;width:100%;max-height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border-color);">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
              <i class="fa-solid ${icon}"></i>
            </div>
            <h3 style="margin:0;font-size:16px;">${escHtml(title)}</h3>
          </div>
          <button type="button" data-modal-close style="background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-muted);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;display:grid;place-items:center;line-height:1;">×</button>
        </div>
        <div style="padding:20px 24px;overflow-y:auto;flex:1;">${body}</div>
        <div style="padding:16px 24px;border-top:1px solid var(--border-color);display:flex;gap:8px;justify-content:flex-end;">${footer}</div>
      </div>
    </div>
  `;

  const modal = document.getElementById(id);
  const closeFn = () => { host.innerHTML = ''; };

  modal.querySelector('[data-modal-close]')?.addEventListener('click', closeFn);
  modal.querySelector('[data-modal-cancel]')?.addEventListener('click', closeFn);

  modal.querySelector('[data-modal-save]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    try {
      await onSave();
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  });

  bindColorPicker(modal, 'hc-bucket-color');
  bindIconPicker(modal, 'hc-bucket-icon');
  bindIconPicker(modal, 'hc-family-icon');
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════ */
function emptyState({ icon, title, text, action }) {
  return `
    <div style="padding:56px 24px;text-align:center;background:var(--bg-card-solid);border:2px dashed var(--border-color);border-radius:12px;">
      <div style="width:64px;height:64px;border-radius:16px;background:var(--bg-elev-2);display:grid;place-items:center;margin:0 auto 16px;color:var(--text-muted);">
        <i class="fa-solid ${icon}" style="font-size:28px;"></i>
      </div>
      <h3 style="margin:0 0 6px;font-size:1.05rem;">${escHtml(title)}</h3>
      <p style="margin:0 0 ${action ? '20px' : '0'};font-size:.88rem;color:var(--text-muted);max-width:400px;margin-left:auto;margin-right:auto;line-height:1.5;">${escHtml(text)}</p>
      ${action ? `<button type="button" class="btn btn-primary" id="${action.id}" style="padding:10px 20px;">
        <i class="fa-solid fa-plus"></i> ${escHtml(action.label)}
      </button>` : ''}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   PANEL: PRODUCTS
   ═══════════════════════════════════════════════════════════════ */
function renderProductsPanel() {
  const ps = D.state?.data?.homeContent?.productStrip || {};
  const industries = Object.values(flattenNode(D.state?.data?.industries));

  return `
    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);">
        <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
          <i class="fa-solid fa-box"></i>
        </div>
        <div>
          <h3 style="margin:0;font-size:16px;">Product strip</h3>
          <p style="margin:2px 0 0;font-size:.75rem;color:var(--text-muted);">The 12-product carousel on the landing page.</p>
        </div>
      </div>

      ${field('hc-ps-eyebrow', 'Eyebrow', ps.eyebrow || '')}
      ${field('hc-ps-heading', 'Heading', ps.heading || '')}
      ${textarea('hc-ps-sub', 'Subtitle', ps.sub || '')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-ps-ctaLabel', 'CTA label', ps.ctaLabel || '')}
        ${field('hc-ps-ctaHref',  'CTA href',  ps.ctaHref  || '')}
      </div>

      <div style="margin-top:16px;">
        <label style="display:block;">
          <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Industry to show in strip</span>
          <select id="hc-ps-industry" style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:inherit;">
            <option value="">— Select an industry —</option>
            ${industries.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(i => `
              <option value="${escAttr(i.key)}" ${ps.industry === i.key ? 'selected' : ''}>
                ${escHtml(i.name || i.key)} (${escHtml(i.marketCategory || '')})
              </option>
            `).join('')}
          </select>
        </label>
      </div>

      <div style="margin-top:16px;">
        ${field('hc-ps-limit', 'Limit (0 = all)', String(ps.limit || 12))}
      </div>

      <button type="button" class="btn btn-success btn-sm" id="hc-save-product-strip" style="margin-top:16px;padding:10px 18px;">
        <i class="fa-solid fa-check"></i> Save product strip
      </button>
    </div>
  `;
}

function bindProductsPanel() {
  document.getElementById('hc-save-product-strip')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

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
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
      toast('Product strip saved.', 'success');
      setTimeout(() => { btn.disabled = false; btn.innerHTML = origHtml; }, 1200);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
      toast('Save failed: ' + err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   STATIC PANELS
   ═══════════════════════════════════════════════════════════════ */
function renderStaticPanel(kind) {
  const all = D.state?.data?.homeContent || {};
  const section = all[kind] || {};

  const iconMap = {
    ecosystem: 'fa-circle-nodes', dashboard: 'fa-chart-pie', cases: 'fa-file-lines',
    pricing: 'fa-tags', academy: 'fa-graduation-cap', contact: 'fa-envelope'
  };
  const labelMap = {
    ecosystem: 'Ecosystem map', dashboard: 'Dashboard preview', cases: 'Case studies strip',
    pricing: 'Pricing', academy: 'Academy teaser', contact: 'Contact'
  };

  const header = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);">
      <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple,#8B5CF6));display:grid;place-items:center;color:#fff;">
        <i class="fa-solid ${iconMap[kind] || 'fa-cube'}"></i>
      </div>
      <h3 style="margin:0;font-size:16px;">${labelMap[kind] || kind}</h3>
    </div>
  `;

  if (kind === 'contact') {
    return `
      <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
        ${header}
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

  return `
    <div style="padding:24px;background:var(--bg-elev-1);border-radius:14px;border:1px solid var(--border-color);">
      ${header}
      ${field(`hc-${kind}-eyebrow`, 'Eyebrow', section.eyebrow || '')}
      ${field(`hc-${kind}-heading`, 'Heading', section.heading || '')}
      ${textarea(`hc-${kind}-sub`, 'Subtitle', section.sub || '')}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   SAVE ALL TEXT SECTIONS
   ═══════════════════════════════════════════════════════════════ */
async function saveAllTextSections() {
  const statusEl = document.getElementById('hc-status');
  const btn = document.getElementById('hc-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }

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

function field(id, label, value, placeholder = '') {
  return `
    <label style="display:block;margin-bottom:14px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <input type="text" id="${id}" value="${escAttr(value)}" ${placeholder ? `placeholder="${escAttr(placeholder)}"` : ''}
        style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:inherit;"/>
    </label>
  `;
}

function textarea(id, label, value) {
  return `
    <label style="display:block;margin-bottom:14px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <textarea id="${id}" rows="3"
        style="width:100%;padding:10px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.88rem;font-family:inherit;resize:vertical;">${escHtml(value)}</textarea>
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

function closeModal() {
  const host = document.getElementById('hc-modal-host');
  if (host) host.innerHTML = '';
}

export default { initHomeContent, renderHomeContent };
