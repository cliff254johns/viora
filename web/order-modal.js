/* ═══════════════════════════════════════════════════════════════
   VIORA — ORDER MODAL (shared purchase flow)
   ─────────────────────────────────────────────────────────────
   Used by BOTH market.html and index.html.
   One modal, one schema, one write path — no drift.

   Public API:
     initOrderModal({ firebaseConfig, P, toast, logActivity })
     openOrderModal({ productId?, category?, app? }) → opens modal

   If `productId` is given, the order line references the real product.
   If `category` is given (from the landing tour), the order line is
   a category-level quote request — no productId, amount 0.

   Writes to: viora_data/orgs/viora/orders/{ORD-XXXXX}
   Fires:    vioraNotify (via window.vioraNotify if present)
   ═══════════════════════════════════════════════════════════════ */

let D = null;
let _modalEl = null;
let _currentPayload = null;

const CURRENCY_RATE = 129;   // USD → KES (same as market.js)

const fmtKShFromKes = (kes) =>
  'KSh ' + Math.round(Number(kes) || 0).toLocaleString('en-KE');

const fmtKSh = (usd) =>
  fmtKShFromKes((Number(usd) || 0) * CURRENCY_RATE);

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generateLicenseKey() {
  return 'VIORA-' +
    Math.random().toString(36).slice(2, 6).toUpperCase() + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
export function initOrderModal(deps) {
  D = deps;
  _buildModalDOM();
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC — OPEN
   ═══════════════════════════════════════════════════════════════ */
export function openOrderModal({ productId, category, app } = {}) {
  if (!_modalEl) _buildModalDOM();
  if (!_modalEl) {
    console.error('[order-modal] modal not mounted');
    return;
  }

  const p = productId && app?.products
    ? app.products.find(x => x.id === productId)
    : null;

  if (!productId && !category) {
    console.warn('[order-modal] need productId or category');
    return;
  }

  _currentPayload = {
    productId: productId || null,
    productName: p?.name || category || 'Custom solution',
    category: category || p?.category || '',
    plan: p ? 'monthly' : 'quote-request',
    baseKes: p ? Math.round((Number(p.price) || 0) * CURRENCY_RATE) : 0,
    app,
  };

  _renderForm();
  _modalEl.classList.add('active');
  document.body.style.overflow = 'hidden';

  const nameField = _modalEl.querySelector('#om-name');
  if (nameField) setTimeout(() => nameField.focus(), 120);
}

/* ═══════════════════════════════════════════════════════════════
   DOM — BUILD ONCE
   ═══════════════════════════════════════════════════════════════ */
function _buildModalDOM() {
  if (_modalEl) return;

  const wrap = document.createElement('div');
  wrap.className = 'modal-overlay';
  wrap.id = 'om-purchaseModal';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', 'om-title');
  wrap.innerHTML = `
    <div class="modal-card" style="max-width:560px;">
      <button class="close-modal" id="om-close" aria-label="Close">&times;</button>
      <h3 id="om-title" style="display:flex;align-items:center;gap:10px;">
        <span class="modal-icon" style="background:linear-gradient(135deg,#2267EE,#8B5CF6);width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">
          <i class="fa-solid fa-bag-shopping"></i>
        </span>
        <span>Complete your order</span>
      </h3>
      <form id="om-form" novalidate>
        <div class="modal-field">
          <label>Product / Service</label>
          <input type="text" id="om-product" readonly class="readonly-input" />
        </div>
        <div class="modal-field" id="om-plan-wrap" hidden>
          <label>Plan</label>
          <select id="om-plan"></select>
        </div>
        <div class="modal-field">
          <label>Your Name *</label>
          <input type="text" id="om-name" required placeholder="e.g. Alex Mwangi" autocomplete="name" />
        </div>
        <div class="modal-field">
          <label>Email *</label>
          <input type="email" id="om-email" required placeholder="you@example.com" autocomplete="email" />
        </div>
        <div class="modal-field">
          <label>Phone (M-Pesa) *</label>
          <input type="tel" id="om-phone" required placeholder="254712345678" autocomplete="tel" />
        </div>
        <div class="modal-field">
          <label>Payment Method</label>
          <select id="om-method">
            <option value="mpesa">M-Pesa</option>
            <option value="card">Credit / Debit Card</option>
            <option value="bank">Bank Transfer</option>
            <option value="quote">Send me a quote</option>
          </select>
        </div>
        <div class="modal-field">
          <label>Promo Code (optional)</label>
          <input type="text" id="om-promo" placeholder="e.g. VIORA10" />
        </div>
        <div id="om-summary" class="order-summary-box" style="display:block;">
          <div class="summary-label">Order Summary</div>
          <div id="om-summary-items"></div>
          <div id="om-summary-total" class="summary-total"></div>
        </div>
        <button type="submit" class="btn-primary btn-full" id="om-submit" style="width:100%;margin-top:8px;">
          <i class="fa-solid fa-lock"></i> Submit order
        </button>
        <button type="button" class="btn-outline btn-full" id="om-cancel" style="width:100%;margin-top:8px;">Cancel</button>
        <p style="margin:14px 0 0;font-size:.72rem;color:var(--text-muted,#64748B);text-align:center;line-height:1.5;">
          We'll reach out on <strong>WhatsApp</strong> or <strong>email</strong> with payment instructions and your license key.
        </p>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  _modalEl = wrap;

  /* Backdrop click closes */
  wrap.addEventListener('click', (e) => { if (e.target === wrap) _close(); });
  wrap.querySelector('#om-close').addEventListener('click', _close);
  wrap.querySelector('#om-cancel').addEventListener('click', _close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrap.classList.contains('active')) _close();
  });

  /* Plan change → recompute summary */
  wrap.querySelector('#om-plan').addEventListener('change', _updateSummary);
  wrap.querySelector('#om-promo').addEventListener('input', _updateSummary);

  /* Submit */
  wrap.querySelector('#om-form').addEventListener('submit', _submit);
}

/* ═══════════════════════════════════════════════════════════════
   RENDER FORM
   ═══════════════════════════════════════════════════════════════ */
function _renderForm() {
  const pay = _currentPayload;
  if (!pay) return;

  _modalEl.querySelector('#om-product').value = pay.productName;

  const planWrap = _modalEl.querySelector('#om-plan-wrap');
  const planSel = _modalEl.querySelector('#om-plan');

  if (pay.plan === 'quote-request') {
    planWrap.hidden = true;
    pay.baseKes = 0;
  } else {
    planWrap.hidden = false;
    planSel.innerHTML = `
      <option value="monthly">Monthly — ${fmtKShFromKes(pay.baseKes)}</option>
      <option value="yearly">Yearly — ${fmtKShFromKes(Math.round(pay.baseKes * 10.2))} (save 15%)</option>
      <option value="lifetime">Lifetime — ${fmtKShFromKes(Math.round(pay.baseKes * 26.5))}</option>
    `;
    planSel.value = 'monthly';
  }

  /* Reset the rest */
  _modalEl.querySelector('#om-name').value = '';
  _modalEl.querySelector('#om-email').value = '';
  _modalEl.querySelector('#om-phone').value = '';
  _modalEl.querySelector('#om-method').value = pay.plan === 'quote-request' ? 'quote' : 'mpesa';
  _modalEl.querySelector('#om-promo').value = '';

  _updateSummary();
}

/* ═══════════════════════════════════════════════════════════════
   SUMMARY
   ═══════════════════════════════════════════════════════════════ */
function _updateSummary() {
  if (!_modalEl || !_currentPayload) return;
  const pay = _currentPayload;
  const itemsEl = _modalEl.querySelector('#om-summary-items');
  const totalEl = _modalEl.querySelector('#om-summary-total');
  if (!itemsEl || !totalEl) return;

  if (pay.plan === 'quote-request') {
    itemsEl.innerHTML = `
      <div class="summary-line"><span>${escapeHTML(pay.productName)}</span><span class="accent">Quote</span></div>
      <div class="summary-line" style="font-size:.76rem;color:var(--text-muted,#64748B);">
        <span>We'll scope a quote and email it within 1 business day.</span>
      </div>
    `;
    totalEl.innerHTML = `<div class="summary-line total"><span>Total</span><span class="accent">To be quoted</span></div>`;
    return;
  }

  const plan = _modalEl.querySelector('#om-plan').value || 'monthly';
  const priceMap = {
    monthly: pay.baseKes,
    yearly: Math.round(pay.baseKes * 10.2),
    lifetime: Math.round(pay.baseKes * 26.5),
  };
  const subtotal = priceMap[plan] || pay.baseKes;

  const promoCode = String(_modalEl.querySelector('#om-promo').value || '').trim().toUpperCase();
  let discount = 0;
  let discountLabel = '';
  if (promoCode === 'VIORA10') { discount = Math.round(subtotal * 0.10); discountLabel = '10% off'; }
  else if (promoCode === 'LAUNCH15') { discount = Math.round(subtotal * 0.15); discountLabel = '15% off'; }
  else if (promoCode === 'KES5') { discount = Math.round(subtotal * 0.05); discountLabel = '5% off'; }

  const finalTotal = Math.max(0, subtotal - discount);

  itemsEl.innerHTML = `
    <div class="summary-line"><span>${escapeHTML(pay.productName)} · ${escapeHTML(plan)}</span><span class="accent">${fmtKShFromKes(subtotal)}</span></div>
  `;
  totalEl.innerHTML = `
    ${discount > 0
      ? `<div class="summary-line success"><span>Discount (${escapeHTML(promoCode)} · ${discountLabel})</span><span>− ${fmtKShFromKes(discount)}</span></div>`
      : ''}
    <div class="summary-line total"><span>Total</span><span class="accent">${fmtKShFromKes(finalTotal)}</span></div>
  `;
}

/* ═══════════════════════════════════════════════════════════════
   SUBMIT
   ═══════════════════════════════════════════════════════════════ */
async function _submit(e) {
  e.preventDefault();
  if (!_currentPayload) return;

  const name = _modalEl.querySelector('#om-name').value.trim();
  const email = _modalEl.querySelector('#om-email').value.trim();
  const phone = _modalEl.querySelector('#om-phone').value.trim();
  const method = _modalEl.querySelector('#om-method').value;
  const promo = _modalEl.querySelector('#om-promo').value.trim().toUpperCase();

  if (!name || !email || !phone) {
    D?.toast?.('Name, email and phone are required.', 'error');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    D?.toast?.('Please enter a valid email.', 'error');
    return;
  }

  const submitBtn = _modalEl.querySelector('#om-submit');
  const orig = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…';

  try {
    const pay = _currentPayload;

    /* Compute price again from current form state */
    let subtotalKes = 0;
    let plan = 'quote-request';
    if (pay.plan !== 'quote-request') {
      plan = _modalEl.querySelector('#om-plan').value || 'monthly';
      const priceMap = {
        monthly: pay.baseKes,
        yearly: Math.round(pay.baseKes * 10.2),
        lifetime: Math.round(pay.baseKes * 26.5),
      };
      subtotalKes = priceMap[plan] || pay.baseKes;
    }

    let discountKes = 0;
    if (promo === 'VIORA10') discountKes = Math.round(subtotalKes * 0.10);
    else if (promo === 'LAUNCH15') discountKes = Math.round(subtotalKes * 0.15);
    else if (promo === 'KES5') discountKes = Math.round(subtotalKes * 0.05);

    const totalKes = Math.max(0, subtotalKes - discountKes);
    const licenseKey = pay.plan === 'quote-request' ? null : generateLicenseKey();
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

    const order = {
      id: orderId,
      kind: pay.plan === 'quote-request' ? 'quote' : 'order',
      items: [{
        productId: pay.productId,
        productName: pay.productName,
        category: pay.category,
        plan,
        qty: 1,
        amount: subtotalKes,
        licenseKey,
      }],
      subtotalKes,
      discountKes,
      totalKES: totalKes,
      totalUSD: totalKes / CURRENCY_RATE,
      currency: 'KES',
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      paymentMethod: method,
      paymentStatus: 'pending',
      promoCode: promo || null,
      timestamp: new Date().toISOString(),
      source: pay.plan === 'quote-request' ? 'landing-tour' : 'order-modal',
      status: 'new',
    };

    /* Write to Firebase (direct fetch — no SDK dependency) */
    const dbUrl = (D?.firebaseConfig?.databaseURL || '') + '/' +
      (D?.P?.('orders/' + orderId) || `viora_data/orgs/viora/orders/${orderId}`) + '.json';

    if (!dbUrl || !dbUrl.startsWith('http')) {
      throw new Error('Firebase database URL missing');
    }

    const resp = await fetch(dbUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });

    if (!resp.ok) {
      throw new Error(`Firebase write failed: HTTP ${resp.status}`);
    }

    /* Notify admin (best-effort) */
    try {
      if (typeof window.vioraNotify === 'function') {
        await window.vioraNotify({
          title: `New ${order.kind === 'quote' ? 'quote request' : 'order'}: ${pay.productName}`,
          body: `${name} · ${email} · ${fmtKShFromKes(totalKes)}`,
          icon: 'fa-shopping-bag',
          level: 'info',
          source: 'order-modal',
        });
      }
    } catch (_) {}

    /* Log activity (best-effort) */
    try { D?.logActivity?.('add', `Order placed: ${pay.productName}`, `${name} — ${fmtKShFromKes(totalKes)}`); } catch (_) {}

    /* Success state */
    _modalEl.querySelector('#om-form').innerHTML = `
      <div style="text-align:center;padding:20px 0;">
        <div style="width:72px;height:72px;border-radius:50%;background:rgba(34,197,94,.15);color:#22c55e;display:inline-flex;align-items:center;justify-content:center;font-size:2rem;margin-bottom:16px;">
          <i class="fa-solid fa-check"></i>
        </div>
        <h4 style="margin:0 0 8px;font-size:1.2rem;">${order.kind === 'quote' ? 'Quote request sent' : 'Order received'}</h4>
        <p style="margin:0 0 6px;color:var(--text-muted,#64748B);font-size:.92rem;">
          Reference: <strong style="color:var(--text-primary,#0F172A);">${orderId}</strong>
        </p>
        <p style="margin:0 0 20px;color:var(--text-muted,#64748B);font-size:.88rem;line-height:1.6;">
          We'll reach out on WhatsApp or email within a few minutes during business hours.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <a href="https://wa.me/254713428774?text=${encodeURIComponent('Hi VIORA, I just placed order ' + orderId + ' for ' + pay.productName + '.')}"
             target="_blank" rel="noopener" class="btn-primary"
             style="text-decoration:none;padding:10px 18px;border-radius:8px;background:#25D366;color:#fff;font-weight:700;font-size:.88rem;">
            <i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp
          </a>
          <button type="button" onclick="document.getElementById('om-purchaseModal').classList.remove('active');document.body.style.overflow='';"
                  style="padding:10px 18px;border-radius:8px;background:transparent;border:1.5px solid var(--line,#CBD5E1);color:inherit;font-weight:600;font-size:.88rem;cursor:pointer;">
            Close
          </button>
        </div>
      </div>
    `;

    submitBtn.disabled = false;
    submitBtn.innerHTML = orig;

  } catch (err) {
    console.error('[order-modal] submit failed:', err);
    D?.toast?.('Failed to submit: ' + (err.message || 'unknown error'), 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = orig;
  }
}

function _close() {
  if (!_modalEl) return;
  _modalEl.classList.remove('active');
  document.body.style.overflow = '';
  _currentPayload = null;
  _buildModalDOM();
  _modalEl.querySelector('#om-form').innerHTML = _defaultFormHTML();
  _bindDefaultForm();
}

function _defaultFormHTML() {
  return `
    <div class="modal-field">
      <label>Product / Service</label>
      <input type="text" id="om-product" readonly class="readonly-input" />
    </div>
    <div class="modal-field" id="om-plan-wrap" hidden>
      <label>Plan</label>
      <select id="om-plan"></select>
    </div>
    <div class="modal-field">
      <label>Your Name *</label>
      <input type="text" id="om-name" required placeholder="e.g. Alex Mwangi" autocomplete="name" />
    </div>
    <div class="modal-field">
      <label>Email *</label>
      <input type="email" id="om-email" required placeholder="you@example.com" autocomplete="email" />
    </div>
    <div class="modal-field">
      <label>Phone (M-Pesa) *</label>
      <input type="tel" id="om-phone" required placeholder="254712345678" autocomplete="tel" />
    </div>
    <div class="modal-field">
      <label>Payment Method</label>
      <select id="om-method">
        <option value="mpesa">M-Pesa</option>
        <option value="card">Credit / Debit Card</option>
        <option value="bank">Bank Transfer</option>
        <option value="quote">Send me a quote</option>
      </select>
    </div>
    <div class="modal-field">
      <label>Promo Code (optional)</label>
      <input type="text" id="om-promo" placeholder="e.g. VIORA10" />
    </div>
    <div id="om-summary" class="order-summary-box" style="display:block;">
      <div class="summary-label">Order Summary</div>
      <div id="om-summary-items"></div>
      <div id="om-summary-total" class="summary-total"></div>
    </div>
    <button type="submit" class="btn-primary btn-full" id="om-submit" style="width:100%;margin-top:8px;">
      <i class="fa-solid fa-lock"></i> Submit order
    </button>
    <button type="button" class="btn-outline btn-full" id="om-cancel" style="width:100%;margin-top:8px;">Cancel</button>
  `;
}

function _bindDefaultForm() {
  if (!_modalEl) return;
  const wrap = _modalEl;
  wrap.querySelector('#om-close').addEventListener('click', _close);
  wrap.querySelector('#om-cancel').addEventListener('click', _close);
  wrap.querySelector('#om-plan').addEventListener('change', _updateSummary);
  wrap.querySelector('#om-promo').addEventListener('input', _updateSummary);
  wrap.querySelector('#om-form').addEventListener('submit', _submit);
}

export default { initOrderModal, openOrderModal };