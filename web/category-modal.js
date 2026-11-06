/* ═══════════════════════════════════════════════════════════════
   VIORA — CATEGORY MODAL (tour "More" popup)
   ─────────────────────────────────────────────────────────────
   Used ONLY by index.html.
   Renders the detail popup for one tour category, using:
     homeContent.tour.categories[KEY]
       .longDesc
       .included    [array of feature strings]
       .demoUrl     [iframe src — admin-set]
       .gallery     [array of image URLs]
       .products    [array of {name, previewUrl}]
       .faqs        [array of {q, a}]
       .viewSampleUrl
       .orderLabel

   Public API:
     initCategoryModal({ toast })
     openCategoryModal(categoryKey, categoryData)
   ═══════════════════════════════════════════════════════════════ */

let D = null;
let _modalEl = null;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function initCategoryModal(deps) {
  D = deps;
  _buildDOM();
}

function _buildDOM() {
  if (_modalEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay';
  wrap.id = 'cm-categoryModal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'cm-title');
  wrap.innerHTML = `
    <div class="modal-card" style="max-width:760px;max-height:92vh;overflow-y:auto;padding:0;">
      <button class="close-modal" id="cm-close" aria-label="Close" style="top:16px;right:16px;z-index:10;">&times;</button>
      <div id="cm-body" style="padding:32px 28px 28px;"></div>
    </div>
  `;
  document.body.appendChild(wrap);
  _modalEl = wrap;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) _close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrap.classList.contains('active')) _close();
  });
}

export function openCategoryModal(categoryKey, data) {
  if (!_modalEl) _buildDOM();
  if (!data) return;

  const body = _modalEl.querySelector('#cm-body');
  if (!body) return;

  const name = data.name || categoryKey;
  const icon = data.icon || 'fa-cube';
  const desc = data.longDesc || data.desc || '';
  const included = Array.isArray(data.included) ? data.included : [];
  const demoUrl = data.demoUrl || '';
  const gallery = Array.isArray(data.gallery) ? data.gallery.filter(Boolean) : [];
  const products = Array.isArray(data.products) ? data.products.filter(p => p && p.name) : [];
  const faqs = Array.isArray(data.faqs) ? data.faqs.filter(f => f && f.q) : [];
  const viewSampleUrl = data.viewSampleUrl || '';
  const orderLabel = data.orderLabel || name;

  /* === HERO === */
  let html = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-right:40px;">
      <div style="width:56px;height:56px;border-radius:14px;display:grid;place-items:center;font-size:24px;background:linear-gradient(135deg,rgba(34,103,238,.15),rgba(35,199,217,.15));color:var(--accent,#2267EE);flex-shrink:0;">
        <i class="fa-solid ${esc(icon)}"></i>
      </div>
      <div>
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent,#2267EE);font-weight:700;margin-bottom:2px;">VIORA Solution</div>
        <h2 id="cm-title" style="margin:0;font-size:1.5rem;line-height:1.2;">${esc(name)}</h2>
      </div>
    </div>
  `;

  /* === LONG DESCRIPTION === */
  if (desc) {
    html += `
      <div style="margin-bottom:24px;">
        <p style="margin:0;color:var(--muted,#64748B);font-size:.95rem;line-height:1.75;">${esc(desc)}</p>
      </div>
    `;
  }

  /* === WHAT'S INCLUDED === */
  if (included.length) {
    html += `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#64748B);margin:0 0 12px;">What's included</h4>
        <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          ${included.map(f => `
            <li style="display:flex;align-items:flex-start;gap:8px;font-size:.88rem;padding:6px 10px;background:rgba(34,103,238,.05);border-radius:8px;line-height:1.4;">
              <i class="fa-solid fa-check" style="color:var(--accent,#2267EE);margin-top:3px;flex-shrink:0;font-size:.72rem;"></i>
              <span>${esc(f)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  /* === LIVE DEMO === */
  if (demoUrl) {
    html += `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#64748B);margin:0 0 12px;">Live demo</h4>
        <div style="border-radius:12px;overflow:hidden;border:1px solid var(--line,#CBD5E1);background:#000;">
          <iframe src="${esc(demoUrl)}" title="${esc(name)} demo" style="width:100%;height:400px;border:0;display:block;" loading="lazy" allowfullscreen referrerpolicy="no-referrer"></iframe>
        </div>
      </div>
    `;
  }

  /* === GALLERY === */
  if (gallery.length) {
    html += `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#64748B);margin:0 0 12px;">Gallery</h4>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">
          ${gallery.slice(0, 4).map(url => `
            <a href="${esc(url)}" target="_blank" rel="noopener" style="display:block;border-radius:10px;overflow:hidden;border:1px solid var(--line,#CBD5E1);">
              <img src="${esc(url)}" alt="" style="width:100%;height:140px;object-fit:cover;display:block;" loading="lazy" />
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* === PRODUCTS IN THIS CATEGORY === */
  if (products.length) {
    html += `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#64748B);margin:0 0 12px;">Products in this category</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${products.map(p => `
            <a href="${esc(p.previewUrl || '#')}" target="_blank" rel="noopener"
               style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:var(--bg,#F8FAFC);border:1px solid var(--line,#CBD5E1);border-radius:10px;text-decoration:none;color:inherit;transition:all .2s;">
              <span style="font-weight:600;font-size:.92rem;">${esc(p.name)}</span>
              <span style="display:inline-flex;align-items:center;gap:6px;color:var(--accent,#2267EE);font-size:.82rem;font-weight:600;">
                View <i class="fa-solid fa-arrow-right"></i>
              </span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* === FAQS === */
  if (faqs.length) {
    html += `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted,#64748B);margin:0 0 12px;">Questions</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${faqs.map((f, i) => `
            <details style="background:var(--bg,#F8FAFC);border:1px solid var(--line,#CBD5E1);border-radius:10px;padding:0;">
              <summary style="padding:12px 16px;cursor:pointer;font-weight:600;font-size:.9rem;list-style:none;display:flex;justify-content:space-between;align-items:center;">
                <span>${esc(f.q)}</span>
                <i class="fa-solid fa-chevron-down" style="font-size:.7rem;color:var(--muted,#64748B);"></i>
              </summary>
              <div style="padding:0 16px 14px;font-size:.88rem;color:var(--muted,#64748B);line-height:1.65;">${esc(f.a || '')}</div>
            </details>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* === CTA ROW === */
  html += `
    <div style="display:flex;gap:10px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--line,#CBD5E1);margin-top:8px;">
      <button type="button" id="cm-order-btn" class="btn-primary"
              style="flex:1;min-width:180px;padding:12px 20px;border-radius:10px;background:var(--accent,#2267EE);color:#fff;border:0;font-weight:700;font-size:.92rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;">
        <i class="fa-solid fa-bolt"></i> Order now
      </button>
      ${viewSampleUrl ? `
        <a href="${esc(viewSampleUrl)}" target="_blank" rel="noopener"
           style="flex:1;min-width:180px;padding:12px 20px;border-radius:10px;background:transparent;color:inherit;border:1.5px solid var(--line,#CBD5E1);font-weight:700;font-size:.92rem;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;">
          <i class="fa-solid fa-eye"></i> View sample
        </a>
      ` : ''}
      <a href="https://wa.me/254713428774?text=${encodeURIComponent('Hi VIORA, I\'d like to discuss ' + name + '.')}"
         target="_blank" rel="noopener"
         style="flex:1;min-width:180px;padding:12px 20px;border-radius:10px;background:#25D366;color:#fff;font-weight:700;font-size:.92rem;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;">
        <i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp
      </a>
    </div>
  `;

  body.innerHTML = html;

  /* Bind Order now → shared modal */
  body.querySelector('#cm-order-btn').addEventListener('click', () => {
    _close();
    if (window.__vioraOpenOrderModal) {
      window.__vioraOpenOrderModal({ category: data.marketCategory || name });
    }
  });

  /* Bind close */
  _modalEl.querySelector('#cm-close').addEventListener('click', _close);

  _modalEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function _close() {
  if (!_modalEl) return;
  _modalEl.classList.remove('active');
  document.body.style.overflow = '';
}

export default { initCategoryModal, openCategoryModal };