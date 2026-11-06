/* ═══════════════════════════════════════════════════════════════
   VIORA — HOME CONTENT EDITOR
   ═══════════════════════════════════════════════════════════════

   Admin editor for the landing page (index.html).
   Reads / writes: viora_data/orgs/viora/homeContent

   Public API:
     initHomeContent({ db, ref, set, get, P, state, toast, logActivity, escapeHtml, $ })
     renderHomeContent()  → renders the editor UI into #tab-home-content

   Drop into main.html as a new tab. Fields:
     - Hero
     - Intent tiles (4)
     - Tour (3 buckets × families × categories, with per-category
             viewSampleUrl, demoUrl, gallery, products, faqs)
     - Product strip heading
     - Ecosystem map nodes
     - Dashboard preview numbers
     - Case strip heading
     - Pricing tiers
     - Academy teaser
     - Contact copy
   ═══════════════════════════════════════════════════════════════ */

let D = null;

const DEFAULTS = {
  hero: {
    eyebrow: 'The VIORA Ecosystem',
    titleLine1: 'Everything Your Business Needs.',
    titleLine2: 'Connected.',
    subtitle: 'Run smarter, sell more and grow with an integrated ecosystem of business software, digital services, commerce and expert support.',
    primaryCta: { label: 'Explore the Ecosystem →', href: '#tour' },
    secondaryCta: { label: 'Book a demo', href: 'contact_us.html' },
  },
  intentTiles: [
    { title: 'Explore the ecosystem', desc: '45+ solutions across 35 industries', href: '#tour', icon: 'fa-layer-group' },
    { title: 'Browse products', desc: 'Instant KES pricing, delivered live', href: 'market.html', icon: 'fa-store' },
    { title: 'Subscribe to a plan', desc: 'Manage your subscription and invoices', href: 'client.html', icon: 'fa-crown' },
    { title: 'Training academy', desc: 'Courses, checklists, certificates', href: 'training.html', icon: 'fa-graduation-cap' },
  ],
  tour: {
    eyebrow: 'What we build',
    heading: '45+ solutions. One core.',
    sub: 'Every product in this tour is designed, built and supported by VIORA. You buy from us directly — no marketplace middlemen, no third-party vendors.',
    buckets: [
      {
        key: 'run',
        name: 'Run my business',
        desc: 'Software systems that run your operation — designed, built and supported by VIORA.',
        families: [
          { key: 'core',         name: 'Core business systems',     desc: 'The foundation — sales, stock, finance.', items: ['business-mgmt','financial','operational','inventory-pos'] },
          { key: 'vertical',     name: 'Vertical industry systems', desc: 'Purpose-built for a specific sector.',   items: ['retail','restaurant','clinic','hospital','pharmacy','school','hotel','salon','gym','garage','veterinary','farm','construction','real-estate','funeral','laundry','security','cleaning','greenhouse','photography','event','recruitment','travel','printing'] },
          { key: 'professional', name: 'Professional practice',     desc: 'Law, architecture, insurance, consulting.', items: ['law','architecture','insurance'] },
        ],
      },
      {
        key: 'sell',
        name: 'Sell more online',
        desc: 'Online presence and storefronts — designed, built and hosted by VIORA.',
        families: [
          { key: 'storefront', name: 'Storefronts',     desc: 'Sell online, connected to your stock.', items: ['ecommerce','commerce','online-stores'] },
          { key: 'web',        name: 'Web experiences', desc: 'Custom websites and 3D experiences.',   items: ['web3d','web','entertainment-web'] },
          { key: 'media',      name: 'Media & branding',desc: 'Video, graphics, brand identity.',      items: ['video','graphics','branding'] },
        ],
      },
      {
        key: 'build',
        name: 'Build something custom',
        desc: 'Bespoke systems, AI and mobile — architected and delivered by VIORA.',
        families: [
          { key: 'software',     name: 'Custom software',  desc: 'Bespoke builds, integrations, APIs.', items: ['custom','enterprise','api'] },
          { key: 'intelligence', name: 'AI & intelligence',desc: 'Assistants, automation, analytics.',  items: ['ai-assistant','ai-automation','ai-analytics'] },
          { key: 'mobile',       name: 'Mobile',           desc: 'Native and cross-platform apps.',    items: ['android','mobile-apps'] },
        ],
      },
    ],
    categories: {
      /* Defaults live in assets/default-categories.js */
    },
    presentationLinks: [
      { label: 'Prefer the full brand story?',  name: 'Brand Presentation',   href: 'inde.html' },
      { label: 'Prefer the immersive 3D tour?', name: 'Product Presentation', href: '3d.html' },
    ],
  },
  productStrip: {
    eyebrow: 'From the marketplace',
    heading: 'Buy the systems we build.',
    sub: 'Live pricing in KES. Instant delivery.',
    ctaLabel: 'Browse all products →',
    ctaHref: 'market.html',
    limit: 6,
  },
  ecosystemMap: {
    eyebrow: 'Ecosystem map',
    heading: 'Ten connected domains. One core.',
    sub: 'VIORA Core sits at the centre. Every domain reads from and writes to it.',
    nodes: [
      { name: 'Business',     color: '#2267EE', desc: 'ERP, POS, accounting, inventory.' },
      { name: 'Marketplace',  color: '#23C7D9', desc: 'Products, promos, orders.' },
      { name: 'Clients',      color: '#8B5CF6', desc: 'Businesses running on VIORA.' },
      { name: 'Partners',     color: '#F59E0B', desc: 'Channel and delivery partners.' },
      { name: 'Products',     color: '#10B981', desc: 'Catalogue synced in real time.' },
      { name: 'Training',     color: '#EF4444', desc: 'Academy courses and certificates.' },
      { name: 'Finance',      color: '#EC4899', desc: 'Invoicing and payments.' },
      { name: 'Analytics',    color: '#6366F1', desc: 'Reports and business insight.' },
      { name: 'Integrations', color: '#14B8A6', desc: 'APIs and connectors.' },
      { name: 'Security',     color: '#F97316', desc: 'Identity, access, compliance.' },
    ],
  },
  dashboardPreview: {
    eyebrow: 'Business preview',
    heading: 'Run your business from one place.',
    sub: 'A preview of the VIORA Business Management experience.',
    revenue: 4280000,
    sales: 1284,
  },
  caseStrip: {
    eyebrow: 'Case studies',
    heading: 'What changed when they switched.',
    sub: 'Two illustrative scenarios based on typical VIORA deployments.',
  },
  pricing: {
    eyebrow: 'Pricing',
    heading: 'Straightforward pricing. Flexible by design.',
    sub: 'Indicative starting prices — final pricing scoped per deployment. Prices in KES, excluding VAT.',
    tiers: [
      { name: 'Starter',    tagline: 'Small teams',         bullets: ['Core modules','Up to 5 users','Email support','Onboarding guide'],                                   cta: 'Subscribe',      ctaHref: 'client.html' },
      { name: 'Growth',     tagline: 'Growing businesses',  featured: true, bullets: ['Everything in Starter','Up to 25 users','POS + Inventory + Accounting','Priority support','Quarterly training'], cta: 'Subscribe',      ctaHref: 'client.html' },
      { name: 'Enterprise', tagline: 'Complex operations',  bullets: ['All modules','Unlimited users','Custom development','Dedicated support','SLA-backed uptime'],           cta: 'Talk to sales',  ctaHref: 'contact_us.html' },
    ],
  },
  academyTeaser: {
    eyebrow: 'Academy',
    heading: 'Learn the systems your business runs on.',
    sub: 'Courses, checklists and certificates. Built on the VIORA modules you actually use.',
    ctaLabel: 'Explore the Academy →',
    ctaHref: 'training.html',
  },
  contact: {
    eyebrow: 'Contact',
    heading: "Let's build a smarter business together.",
    sub: "Tell us about your business and we'll get back with a clear next step.",
    email: 'support@viora.co.ke',
    whatsapp: '254713428774',
    hours: 'Mon – Fri · 8:00 – 18:00 EAT · Online worldwide',
  },
};

export function initHomeContent(deps) {
  D = deps;
}

/* ═══════════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════════ */
export function renderHomeContent() {
  const host = document.getElementById('tab-home-content');
  if (!host) return;

  const live = (D.state?.data?.homeContent) || {};
  const merged = deepMerge(DEFAULTS, live);

  host.innerHTML = `
    <div style="padding:24px;max-width:1100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin:0 0 4px;font-size:22px;">Home Content</h2>
          <p style="margin:0;color:var(--text-muted);font-size:.85rem;">Edit the landing page (index.html). Changes go live instantly on save.</p>
        </div>
        <button type="button" class="btn btn-success" id="hc-save-btn">
          <i class="fa-solid fa-check"></i> Save all changes
        </button>
      </div>

      <div id="hc-status" style="margin-bottom:16px;font-size:.85rem;min-height:20px;"></div>

      <!-- TABS -->
      <div class="hc-tabs" style="display:flex;gap:4px;padding:4px;background:rgba(0,0,0,.2);border-radius:10px;margin-bottom:20px;flex-wrap:wrap;">
        ${['Hero','Intent','Tour','Products','Ecosystem','Dashboard','Cases','Pricing','Academy','Contact'].map((t, i) => `
          <button type="button" class="btn btn-xs hc-tab-btn" data-tab="${i}" style="border-radius:8px;padding:8px 14px;${i === 0 ? 'background:var(--accent-blue);color:#fff;border-color:var(--accent-blue);' : ''}">${t}</button>
        `).join('')}
      </div>

      <!-- PANELS -->
      <div id="hc-panels"></div>
    </div>
  `;

  renderAllPanels(merged);

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
        p.style.display = Number(p.dataset.panel) === Number(btn.dataset.tab) ? 'block' : 'none';
      });
    });
  });

  /* Save */
  document.getElementById('hc-save-btn').addEventListener('click', () => saveAll());
}

function renderAllPanels(c) {
  const host = document.getElementById('hc-panels');
  if (!host) return;

  host.innerHTML = `
    <div data-panel="0" style="display:block;">
      ${renderHeroPanel(c.hero)}
    </div>
    <div data-panel="1" style="display:none;">
      ${renderIntentPanel(c.intentTiles)}
    </div>
    <div data-panel="2" style="display:none;">
      ${renderTourPanel(c.tour)}
    </div>
    <div data-panel="3" style="display:none;">
      ${renderProductsPanel(c.productStrip)}
    </div>
    <div data-panel="4" style="display:none;">
      ${renderEcosystemPanel(c.ecosystemMap)}
    </div>
    <div data-panel="5" style="display:none;">
      ${renderDashboardPanel(c.dashboardPreview)}
    </div>
    <div data-panel="6" style="display:none;">
      ${renderCasesPanel(c.caseStrip)}
    </div>
    <div data-panel="7" style="display:none;">
      ${renderPricingPanel(c.pricing)}
    </div>
    <div data-panel="8" style="display:none;">
      ${renderAcademyPanel(c.academyTeaser)}
    </div>
    <div data-panel="9" style="display:none;">
      ${renderContactPanel(c.contact)}
    </div>
  `;

  bindTourPanel();
  bindPricingPanel();
  bindIntentPanel();
}

/* ═══════════════════════════════════════════════════════════════
   PANEL RENDERERS
   ═══════════════════════════════════════════════════════════════ */
function renderHeroPanel(h) {
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

function renderIntentPanel(tiles) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Intent Router — 4 tiles</h3>
      <p style="margin:0 0 16px;font-size:.82rem;color:var(--text-muted);">The four cards at the top of the intent section.</p>
      <div id="hc-intent-list">
        ${tiles.map((t, i) => `
          <div class="hc-card" style="padding:14px;background:var(--bg-card-solid);border-radius:10px;margin-bottom:10px;border:1px solid var(--border-color);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:.82rem;color:var(--accent-blue);">Tile ${i + 1}</strong>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              ${field(`hc-intent-${i}-title`, 'Title', t.title)}
              ${field(`hc-intent-${i}-icon`,  'Icon (FontAwesome class)', t.icon)}
              ${field(`hc-intent-${i}-desc`,  'Description', t.desc)}
              ${field(`hc-intent-${i}-href`,  'Link', t.href)}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTourPanel(tour) {
  const buckets = tour.buckets || [];
  const categories = tour.categories || {};

  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);margin-bottom:16px;">
      <h3 style="margin:0 0 16px;font-size:15px;">Tour — general</h3>
      ${field('hc-tour-eyebrow', 'Eyebrow', tour.eyebrow)}
      ${field('hc-tour-heading', 'Heading', tour.heading)}
      ${textarea('hc-tour-sub', 'Subtitle', tour.sub)}
    </div>

    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);margin-bottom:16px;">
      <h3 style="margin:0 0 16px;font-size:15px;">Buckets</h3>
      <p style="margin:0 0 12px;font-size:.82rem;color:var(--text-muted);">Each bucket is a top-level tab in the tour (Run / Sell / Build).</p>
      ${buckets.map((b, i) => `
        <div style="padding:14px;background:var(--bg-card-solid);border-radius:10px;margin-bottom:10px;border:1px solid var(--border-color);">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
            ${field(`hc-bucket-${i}-key`,  'Key (lowercase, no spaces)', b.key)}
            ${field(`hc-bucket-${i}-name`, 'Name', b.name)}
          </div>
          ${field(`hc-bucket-${i}-desc`, 'Description', b.desc)}
        </div>
      `).join('')}
    </div>

    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Categories</h3>
      <p style="margin:0 0 12px;font-size:.82rem;color:var(--text-muted);">
        Each category is one card in the tour. Set its viewSampleUrl, demoUrl, gallery, products, and FAQs below.
        Defaults are in <code style="color:var(--accent-blue);font-size:.78rem;">assets/default-categories.js</code>.
      </p>

      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;">Edit category</label>
        <select id="hc-cat-select" style="width:100%;padding:10px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-family:inherit;font-size:.85rem;">
          <option value="">— Select a category to edit —</option>
          ${Object.keys(categories).sort().map(key => {
            const c = categories[key];
            return `<option value="${escAttr(key)}">${escAttr(c.name || key)} (${escAttr(key)})</option>`;
          }).join('')}
        </select>
      </div>

      <div id="hc-cat-editor" style="display:none;padding:16px;background:var(--bg-card-solid);border-radius:10px;border:1px solid var(--border-color);"></div>
    </div>
  `;
}

function renderProductsPanel(ps) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Product strip</h3>
      <p style="margin:0 0 16px;font-size:.82rem;color:var(--text-muted);">The 6 products shown below the tour. Data comes from Firebase <code>products</code> — sorted by totalSold.</p>
      ${field('hc-ps-eyebrow', 'Eyebrow', ps.eyebrow)}
      ${field('hc-ps-heading', 'Heading', ps.heading)}
      ${textarea('hc-ps-sub', 'Subtitle', ps.sub)}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        ${field('hc-ps-cta-label', 'CTA label', ps.ctaLabel)}
        ${field('hc-ps-cta-href',  'CTA href',  ps.ctaHref)}
        ${field('hc-ps-limit',     'Limit',     String(ps.limit || 6))}
      </div>
    </div>
  `;
}

function renderEcosystemPanel(em) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Ecosystem map</h3>
      ${field('hc-em-eyebrow', 'Eyebrow', em.eyebrow)}
      ${field('hc-em-heading', 'Heading', em.heading)}
      ${textarea('hc-em-sub', 'Subtitle', em.sub)}
      <h4 style="font-size:.85rem;margin:20px 0 12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Nodes</h4>
      ${(em.nodes || []).map((n, i) => `
        <div style="display:grid;grid-template-columns:1fr 100px 2fr;gap:10px;margin-bottom:8px;">
          ${field(`hc-em-node-${i}-name`, 'Name', n.name)}
          ${field(`hc-em-node-${i}-color`, 'Color', n.color)}
          ${field(`hc-em-node-${i}-desc`, 'Description', n.desc)}
        </div>
      `).join('')}
    </div>
  `;
}

function renderDashboardPanel(dp) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Dashboard preview</h3>
      <p style="margin:0 0 16px;font-size:.82rem;color:var(--text-muted);">Static demo data shown in the dashboard preview section.</p>
      ${field('hc-dp-eyebrow', 'Eyebrow', dp.eyebrow)}
      ${field('hc-dp-heading', 'Heading', dp.heading)}
      ${textarea('hc-dp-sub', 'Subtitle', dp.sub)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-dp-revenue', 'Revenue (KSh)', String(dp.revenue || 0))}
        ${field('hc-dp-sales',   'Sales count',   String(dp.sales || 0))}
      </div>
    </div>
  `;
}

function renderCasesPanel(cs) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Case studies strip</h3>
      ${field('hc-cs-eyebrow', 'Eyebrow', cs.eyebrow)}
      ${field('hc-cs-heading', 'Heading', cs.heading)}
      ${textarea('hc-cs-sub', 'Subtitle', cs.sub)}
    </div>
  `;
}

function renderPricingPanel(pr) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Pricing</h3>
      ${field('hc-pr-eyebrow', 'Eyebrow', pr.eyebrow)}
      ${field('hc-pr-heading', 'Heading', pr.heading)}
      ${textarea('hc-pr-sub', 'Subtitle', pr.sub)}

      <h4 style="font-size:.85rem;margin:20px 0 12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Tiers</h4>
      <div id="hc-pricing-tiers">
        ${(pr.tiers || []).map((t, i) => `
          <div class="hc-card" style="padding:14px;background:var(--bg-card-solid);border-radius:10px;margin-bottom:10px;border:1px solid var(--border-color);">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">
              ${field(`hc-pr-tier-${i}-name`, 'Name', t.name)}
              ${field(`hc-pr-tier-${i}-tagline`, 'Tagline', t.tagline)}
            </div>
            ${textarea(`hc-pr-tier-${i}-bullets`, 'Bullets (one per line)', (t.bullets || []).join('\n'))}
            <div style="display:grid;grid-template-columns:1fr 1fr 120px;gap:10px;">
              ${field(`hc-pr-tier-${i}-cta`, 'CTA label', t.cta)}
              ${field(`hc-pr-tier-${i}-ctaHref`, 'CTA href', t.ctaHref)}
              <label style="display:flex;align-items:center;gap:6px;font-size:.8rem;margin-top:20px;">
                <input type="checkbox" id="hc-pr-tier-${i}-featured" ${t.featured ? 'checked' : ''}> Featured
              </label>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAcademyPanel(at) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Academy teaser</h3>
      ${field('hc-at-eyebrow', 'Eyebrow', at.eyebrow)}
      ${field('hc-at-heading', 'Heading', at.heading)}
      ${textarea('hc-at-sub', 'Subtitle', at.sub)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-at-ctaLabel', 'CTA label', at.ctaLabel)}
        ${field('hc-at-ctaHref',  'CTA href',  at.ctaHref)}
      </div>
    </div>
  `;
}

function renderContactPanel(ct) {
  return `
    <div class="hc-card" style="padding:20px;background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);">
      <h3 style="margin:0 0 16px;font-size:15px;">Contact</h3>
      ${field('hc-ct-eyebrow', 'Eyebrow', ct.eyebrow)}
      ${field('hc-ct-heading', 'Heading', ct.heading)}
      ${textarea('hc-ct-sub', 'Subtitle', ct.sub)}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${field('hc-ct-email',    'Email',    ct.email)}
        ${field('hc-ct-whatsapp', 'WhatsApp (digits only)', ct.whatsapp)}
      </div>
      ${field('hc-ct-hours', 'Hours', ct.hours)}
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   TOUR — category editor
   ═══════════════════════════════════════════════════════════════ */
function bindTourPanel() {
  const sel = document.getElementById('hc-cat-select');
  const editor = document.getElementById('hc-cat-editor');
  if (!sel || !editor) return;

  sel.addEventListener('change', () => {
    const key = sel.value;
    if (!key) { editor.style.display = 'none'; return; }
    const allCats = deepMerge(window.__VIORA_DEFAULT_CATEGORIES || {}, (D.state?.data?.homeContent?.tour?.categories) || {});
    const cat = allCats[key] || {};
    renderCategoryEditor(editor, key, cat);
    editor.style.display = 'block';
  });
}

function renderCategoryEditor(host, key, cat) {
  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h4 style="margin:0;font-size:.92rem;">Editing: <span style="color:var(--accent-blue);">${escAttr(cat.name || key)}</span></h4>
      <code style="font-size:.72rem;color:var(--text-muted);">${escAttr(key)}</code>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
      ${field(`hc-cat-${key}-name`, 'Name', cat.name || '')}
      ${field(`hc-cat-${key}-icon`, 'Icon (FontAwesome)', cat.icon || '')}
    </div>
    ${field(`hc-cat-${key}-desc`, 'Short description (card)', cat.desc || '')}
    ${textarea(`hc-cat-${key}-longDesc`, 'Long description (More popup)', cat.longDesc || '')}
    ${textarea(`hc-cat-${key}-bullets`, 'Bullets (one per line)', (cat.bullets || []).join('\n'))}
    ${textarea(`hc-cat-${key}-stats`, 'Stats (format: value|label, one per line)', (cat.stats || []).map(s => `${s.v}|${s.l}`).join('\n'))}
    ${textarea(`hc-cat-${key}-included`, 'Included features (one per line)', (cat.included || []).join('\n'))}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${field(`hc-cat-${key}-viewSampleUrl`, 'View sample URL (opens in new tab)', cat.viewSampleUrl || '')}
      ${field(`hc-cat-${key}-demoUrl`, 'Demo URL (embedded in More popup)', cat.demoUrl || '')}
    </div>

    ${textarea(`hc-cat-${key}-gallery`, 'Gallery image URLs (one per line)', (cat.gallery || []).join('\n'))}

    <label style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;margin-top:12px;">Products in this category</label>
    <div id="hc-cat-${key}-products">
      ${(cat.products || []).map((p, i) => `
        <div style="display:grid;grid-template-columns:1fr 2fr 40px;gap:8px;margin-bottom:6px;">
          <input type="text" class="hc-prod-name-${key}" data-idx="${i}" value="${escAttr(p.name || '')}" placeholder="Product name" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
          <input type="url" class="hc-prod-url-${key}" data-idx="${i}" value="${escAttr(p.previewUrl || '')}" placeholder="https://preview…" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
          <button type="button" class="btn btn-danger btn-xs" data-del-product="${i}">×</button>
        </div>
      `).join('')}
      <button type="button" class="btn btn-outline btn-xs" id="hc-add-product-${key}" style="margin-top:6px;">+ Add product</button>
    </div>

    <label style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;margin-top:12px;">FAQs</label>
    <div id="hc-cat-${key}-faqs">
      ${(cat.faqs || []).map((f, i) => `
        <div style="display:grid;grid-template-columns:1fr 2fr 40px;gap:8px;margin-bottom:6px;">
          <input type="text" class="hc-faq-q-${key}" data-idx="${i}" value="${escAttr(f.q || '')}" placeholder="Question" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
          <input type="text" class="hc-faq-a-${key}" data-idx="${i}" value="${escAttr(f.a || '')}" placeholder="Answer" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
          <button type="button" class="btn btn-danger btn-xs" data-del-faq="${i}">×</button>
        </div>
      `).join('')}
      <button type="button" class="btn btn-outline btn-xs" id="hc-add-faq-${key}" style="margin-top:6px;">+ Add FAQ</button>
    </div>

    <div style="margin-top:16px;text-align:right;">
      <button type="button" class="btn btn-success btn-sm" id="hc-cat-${key}-save">
        <i class="fa-solid fa-check"></i> Save this category
      </button>
    </div>
  `;

  /* Add product */
  const addProdBtn = document.getElementById(`hc-add-product-${key}`);
  if (addProdBtn) addProdBtn.addEventListener('click', () => {
    cat.products = cat.products || [];
    cat.products.push({ name: '', previewUrl: '' });
    renderCategoryEditor(host, key, cat);
  });

  /* Delete product */
  host.querySelectorAll('[data-del-product]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.delProduct);
      cat.products = (cat.products || []).filter((_, i) => i !== idx);
      renderCategoryEditor(host, key, cat);
    });
  });

  /* Add FAQ */
  const addFaqBtn = document.getElementById(`hc-add-faq-${key}`);
  if (addFaqBtn) addFaqBtn.addEventListener('click', () => {
    cat.faqs = cat.faqs || [];
    cat.faqs.push({ q: '', a: '' });
    renderCategoryEditor(host, key, cat);
  });

  /* Delete FAQ */
  host.querySelectorAll('[data-del-faq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.delFaq);
      cat.faqs = (cat.faqs || []).filter((_, i) => i !== idx);
      renderCategoryEditor(host, key, cat);
    });
  });

  /* Save category */
  const saveBtn = document.getElementById(`hc-cat-${key}-save`);
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const products = [];
    host.querySelectorAll(`.hc-prod-name-${key}`).forEach((inp) => {
      const idx = Number(inp.dataset.idx);
      const urlInp = host.querySelector(`.hc-prod-url-${key}[data-idx="${idx}"]`);
      if (inp.value.trim()) {
        products.push({ name: inp.value.trim(), previewUrl: urlInp?.value.trim() || '' });
      }
    });

    const faqs = [];
    host.querySelectorAll(`.hc-faq-q-${key}`).forEach((inp) => {
      const idx = Number(inp.dataset.idx);
      const aInp = host.querySelector(`.hc-faq-a-${key}[data-idx="${idx}"]`);
      if (inp.value.trim()) {
        faqs.push({ q: inp.value.trim(), a: aInp?.value.trim() || '' });
      }
    });

    const stats = (getVal(`hc-cat-${key}-stats`) || '').split('\n').map(line => {
      const [v, l] = line.split('|').map(s => (s || '').trim());
      return v ? { v, l: l || '' } : null;
    }).filter(Boolean);

    const catUpdate = {
      name: getVal(`hc-cat-${key}-name`),
      icon: getVal(`hc-cat-${key}-icon`),
      desc: getVal(`hc-cat-${key}-desc`),
      longDesc: getVal(`hc-cat-${key}-longDesc`),
      bullets: lines(getVal(`hc-cat-${key}-bullets`)),
      stats,
      included: lines(getVal(`hc-cat-${key}-included`)),
      viewSampleUrl: getVal(`hc-cat-${key}-viewSampleUrl`),
      demoUrl: getVal(`hc-cat-${key}-demoUrl`),
      gallery: lines(getVal(`hc-cat-${key}-gallery`)),
      products,
      faqs,
    };

    try {
      const path = D.P(`homeContent/tour/categories/${key}`);
      await D.set(D.ref(D.db, path), catUpdate);
      if (!D.state.data.homeContent) D.state.data.homeContent = {};
      if (!D.state.data.homeContent.tour) D.state.data.homeContent.tour = {};
      if (!D.state.data.homeContent.tour.categories) D.state.data.homeContent.tour.categories = {};
      D.state.data.homeContent.tour.categories[key] = catUpdate;
      D.toast?.(`Category "${key}" saved.`, 'success');
      D.logActivity?.('edit', `Home category updated: ${key}`, 'homeContent');
    } catch (err) {
      D.toast?.('Save failed: ' + err.message, 'error');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   PRICING + INTENT helper binders (no-op for now — handled at save)
   ═══════════════════════════════════════════════════════════════ */
function bindPricingPanel() {}
function bindIntentPanel() {}

/* ═══════════════════════════════════════════════════════════════
   SAVE ALL
   ═══════════════════════════════════════════════════════════════ */
async function saveAll() {
  const statusEl = document.getElementById('hc-status');
  const btn = document.getElementById('hc-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
  if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }

  try {
    const payload = {
      hero: {
        eyebrow: getVal('hc-hero-eyebrow'),
        titleLine1: getVal('hc-hero-title1'),
        titleLine2: getVal('hc-hero-title2'),
        subtitle: getVal('hc-hero-subtitle'),
        primaryCta: { label: getVal('hc-hero-cta1-label'), href: getVal('hc-hero-cta1-href') },
        secondaryCta: { label: getVal('hc-hero-cta2-label'), href: getVal('hc-hero-cta2-href') },
      },
      intentTiles: [0,1,2,3].map(i => ({
        title: getVal(`hc-intent-${i}-title`),
        icon:  getVal(`hc-intent-${i}-icon`),
        desc:  getVal(`hc-intent-${i}-desc`),
        href:  getVal(`hc-intent-${i}-href`),
      })),
      tour: {
        eyebrow: getVal('hc-tour-eyebrow'),
        heading: getVal('hc-tour-heading'),
        sub: getVal('hc-tour-sub'),
        buckets: readBuckets(),
        categories: (D.state?.data?.homeContent?.tour?.categories) || {},
        presentationLinks: (D.state?.data?.homeContent?.tour?.presentationLinks) || DEFAULTS.tour.presentationLinks,
      },
      productStrip: {
        eyebrow: getVal('hc-ps-eyebrow'),
        heading: getVal('hc-ps-heading'),
        sub: getVal('hc-ps-sub'),
        ctaLabel: getVal('hc-ps-cta-label'),
        ctaHref: getVal('hc-ps-cta-href'),
        limit: Number(getVal('hc-ps-limit')) || 6,
      },
      ecosystemMap: {
        eyebrow: getVal('hc-em-eyebrow'),
        heading: getVal('hc-em-heading'),
        sub: getVal('hc-em-sub'),
        nodes: (DEFAULTS.ecosystemMap.nodes || []).map((n, i) => ({
          name: getVal(`hc-em-node-${i}-name`) || n.name,
          color: getVal(`hc-em-node-${i}-color`) || n.color,
          desc: getVal(`hc-em-node-${i}-desc`) || n.desc,
        })),
      },
      dashboardPreview: {
        eyebrow: getVal('hc-dp-eyebrow'),
        heading: getVal('hc-dp-heading'),
        sub: getVal('hc-dp-sub'),
        revenue: Number(getVal('hc-dp-revenue')) || 0,
        sales: Number(getVal('hc-dp-sales')) || 0,
      },
      caseStrip: {
        eyebrow: getVal('hc-cs-eyebrow'),
        heading: getVal('hc-cs-heading'),
        sub: getVal('hc-cs-sub'),
      },
      pricing: {
        eyebrow: getVal('hc-pr-eyebrow'),
        heading: getVal('hc-pr-heading'),
        sub: getVal('hc-pr-sub'),
        tiers: readPricingTiers(),
      },
      academyTeaser: {
        eyebrow: getVal('hc-at-eyebrow'),
        heading: getVal('hc-at-heading'),
        sub: getVal('hc-at-sub'),
        ctaLabel: getVal('hc-at-ctaLabel'),
        ctaHref: getVal('hc-at-ctaHref'),
      },
      contact: {
        eyebrow: getVal('hc-ct-eyebrow'),
        heading: getVal('hc-ct-heading'),
        sub: getVal('hc-ct-sub'),
        email: getVal('hc-ct-email'),
        whatsapp: getVal('hc-ct-whatsapp'),
        hours: getVal('hc-ct-hours'),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: D.state?.operator?.name || 'admin',
    };

    await D.set(D.ref(D.db, D.P('homeContent')), payload);
    if (D.state) D.state.data.homeContent = payload;

    if (statusEl) { statusEl.textContent = '✓ All changes saved. Live on the landing page within seconds.'; statusEl.style.color = 'var(--accent-green)'; }
    D.toast?.('Home content saved.', 'success');
    D.logActivity?.('edit', 'Home content updated', 'homeContent');
  } catch (err) {
    if (statusEl) { statusEl.textContent = '✗ ' + err.message; statusEl.style.color = 'var(--accent-red)'; }
    D.toast?.('Save failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save all changes'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   FORM READERS
   ═══════════════════════════════════════════════════════════════ */
function getVal(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function lines(str) {
  return String(str || '').split('\n').map(s => s.trim()).filter(Boolean);
}

function readBuckets() {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const key = getVal(`hc-bucket-${i}-key`);
    if (!key) continue;
    out.push({
      key,
      name: getVal(`hc-bucket-${i}-name`),
      desc: getVal(`hc-bucket-${i}-desc`),
      families: DEFAULTS.tour.buckets[i]?.families || [],
    });
  }
  return out;
}

function readPricingTiers() {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const name = getVal(`hc-pr-tier-${i}-name`);
    if (!name) continue;
    out.push({
      name,
      tagline: getVal(`hc-pr-tier-${i}-tagline`),
      bullets: lines(getVal(`hc-pr-tier-${i}-bullets`)),
      cta: getVal(`hc-pr-tier-${i}-cta`),
      ctaHref: getVal(`hc-pr-tier-${i}-ctaHref`),
      featured: !!document.getElementById(`hc-pr-tier-${i}-featured`)?.checked,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function field(id, label, value) {
  return `
    <label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <input type="text" id="${id}" value="${escAttr(value)}" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
    </label>
  `;
}

function textarea(id, label, value) {
  return `
    <label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <textarea id="${id}" rows="3" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;resize:vertical;">${escAttr(value)}</textarea>
    </label>
  `;
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function deepMerge(a, b) {
  if (!a || typeof a !== 'object') return b;
  if (!b || typeof b !== 'object') return a;
  const out = Array.isArray(a) ? [...a] : { ...a };
  Object.keys(b).forEach((k) => {
    if (b[k] != null && typeof b[k] === 'object' && !Array.isArray(b[k])) {
      out[k] = deepMerge(a[k], b[k]);
    } else if (b[k] !== undefined) {
      out[k] = b[k];
    }
  });
  return out;
}

export default { initHomeContent, renderHomeContent };