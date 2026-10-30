/* ═══════════════════════════════════════════════════════════════
   VIORA — PURE HELPERS  (hardened + perf-tuned)
   Extracted from main.js (Phase 1)
   No dependencies on state, Firebase, or the Viora object.
   ═══════════════════════════════════════════════════════════════ */

/* ── DOM ── */
export const $ = id => document.getElementById(id);

/* ── IDs ── */
let _uidCounter = 0;
export const uid = () => {
  _uidCounter = (_uidCounter + 1) >>> 0;
  const rnd = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return Date.now().toString(36) + _uidCounter.toString(36) + rnd;
};

/* ── Dates ── */
export const dateToStr = d => {
  const dt = d instanceof Date ? d : new Date();
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0');
};

export const todayStr = () => dateToStr(new Date());

/* Validate an ISO YYYY-MM-DD string strictly. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], da = +m[3];
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  const dt = new Date(y, mo - 1, da);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === da;
}

export const fmtDate = d => {
  if (!d) return '—';
  /* Accept Date objects directly. */
  let y, mo, da;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '—';
    y = d.getFullYear(); mo = d.getMonth() + 1; da = d.getDate();
  } else {
    const s = String(d);
    /* Slice a leading YYYY-MM-DD if present, so ISO timestamps work too. */
    const head = s.slice(0, 10);
    if (!isValidIsoDate(head)) return s;
    y = +head.slice(0, 4); mo = +head.slice(5, 7); da = +head.slice(8, 10);
  }
  const dt = new Date(y, mo - 1, da);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (date, time) => {
  if (!date) return '—';
  return fmtDate(date) + (time ? ' ' + time : '');
};

export const timeAgo = iso => {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 0) {
    const future = Math.abs(diff);
    const mF = Math.floor(future / 60000);
    if (mF < 1) return 'in a moment';
    if (mF < 60) return 'in ' + mF + 'm';
    const hF = Math.floor(mF / 60);
    if (hF < 24) return 'in ' + hF + 'h';
    return 'in ' + Math.floor(hF / 24) + 'd';
  }
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};

/* Signed day delta: positive = s is in the future. */
export const daysBetween = s => {
  const head = String(s || '').slice(0, 10);
  if (!isValidIsoDate(head)) return NaN;
  const [y1, m1, d1] = [ +head.slice(0, 4), +head.slice(5, 7), +head.slice(8, 10) ];
  const now = new Date();
  const y2 = now.getFullYear(), m2 = now.getMonth() + 1, d2 = now.getDate();
  /* Compare using local calendar components via UTC ms — avoids DST drift. */
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((a - b) / 86400000);
};

export const isOverdue = s => {
  const head = String(s || '').slice(0, 10);
  if (!isValidIsoDate(head)) return false;
  return head < todayStr();
};

/* ── Money ── */
export const FX_RATE = 129;

const NUM_FMT_2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const NUM_FMT_0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const fmtKES = (n, curr = 'KES') => {
  const sym = curr === 'USD' ? '$' : curr === 'EUR' ? '€' : 'KSh ';
  return sym + NUM_FMT_2.format(Number(n) || 0);
};

export const fmtUSD = n => '$' + NUM_FMT_2.format(Number(n) || 0);

export const usdToKes = usd => Math.round((Number(usd) || 0) * FX_RATE);

export const kpiFormat = (n, curr) => {
  const v = Number(n) || 0;
  if (curr === 'KES') return 'KSh ' + NUM_FMT_0.format(v);
  return '$' + NUM_FMT_0.format(v);
};

/* ── Strings ── */

/* Compiled once — single pass with a replacer callback. */
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
const HTML_ESCAPE_FN = (c) => HTML_ESCAPE_MAP[c];

export const escapeHtml = s =>
  String(s == null ? '' : s).replace(HTML_ESCAPE_RE, HTML_ESCAPE_FN);

export const fmtBytes = b => {
  const n = Number(b) || 0;
  if (n <= 0) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
};

/* Strips non-digits, then normalises to Kenya E.164 (+254...). */
export const normalizePhone = p => {
  if (!p) return '';
  let c = String(p).replace(/[^0-9]/g, '');
  if (!c) return '';
  if (c.startsWith('0')) c = '254' + c.slice(1);
  else if (!c.startsWith('254') && c.length === 9) c = '254' + c;
  return c;
};

export const normalizeEmail = e => String(e || '').toLowerCase().trim();

export const simpleHash = str => {
  const s = String(str == null ? '' : str);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
};

export const emailToId = email => {
  if (!email) return 'unknown-' + uid();
  const s = String(email).toLowerCase().trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return 'mkt-' + (h >>> 0).toString(36).padStart(8, '0');
};

export const generateLicenseKey = () => {
  const seg = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return 'VIORA-' + seg() + '-' + seg();
};

/* ── Timing / environment ── */
let _mqMobile = null;
export const isMobile = () => {
  if (typeof window === 'undefined') return false;
  if (!_mqMobile && typeof window.matchMedia === 'function') {
    _mqMobile = window.matchMedia('(max-width: 899px)');
  }
  return _mqMobile ? _mqMobile.matches : false;
};

export const debounce = (fn, ms = 200) => {
  let t = null;
  const wrapped = (...a) => {
    if (t !== null) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...a); }, ms);
  };
  wrapped.cancel = () => {
    if (t !== null) { clearTimeout(t); t = null; }
  };
  wrapped.flush = (...a) => {
    if (t !== null) { clearTimeout(t); t = null; }
    fn(...a);
  };
  return wrapped;
};

/* ═══════════════════════════════════════════════════════════════
   FILE PICKER
   iOS Safari requires the input exist in the DOM.
   ═══════════════════════════════════════════════════════════════ */
export function pickFile({ accept = '*/*', capture = null, multiple = false, onPick } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  if (capture) input.setAttribute('capture', capture);
  input.multiple = !!multiple;
  input.style.position = 'absolute';
  input.style.left = '-9999px';
  input.style.top = '-9999px';
  input.style.width = '1px';
  input.style.height = '1px';
  input.style.opacity = '0';
  document.body.appendChild(input);

  const cleanup = () => {
    setTimeout(() => { try { input.remove(); } catch (e) {} }, 100);
  };

  input.addEventListener('change', () => {
    const files = multiple
      ? Array.from(input.files || [])
      : (input.files && input.files[0]) || null;
    try {
      if (typeof onPick === 'function') {
        const r = onPick(files);
        if (r && typeof r.catch === 'function') {
          r.catch(err => console.error('[pickFile] onPick failed', err));
        }
      }
    } catch (err) {
      console.error('[pickFile] onPick threw', err);
    } finally {
      cleanup();
    }
  });

  input.click();
}

export function pickFileMobileSplit({ accept = 'image/*,application/pdf', onPick } = {}) {
  if (!isMobile()) {
    pickFile({ accept, onPick });
    return;
  }
  const choice = window.confirm(
    'Tap OK to take a photo now,\nCancel to choose an existing file.\n(Photos are best for scanning documents on mobile.)'
  );
  if (choice) pickFile({ accept: 'image/*', capture: 'environment', onPick });
  else       pickFile({ accept, onPick });
}

/* ═══════════════════════════════════════════════════════════════
   NAMESPACED EXPORT (for `import * as H` at call sites)
   ═══════════════════════════════════════════════════════════════ */
export const H = {
  $, uid,
  todayStr, dateToStr, fmtDate, fmtDateTime, timeAgo, daysBetween, isOverdue,
  FX_RATE, fmtKES, fmtUSD, usdToKes, kpiFormat,
  escapeHtml, fmtBytes, normalizePhone, normalizeEmail, simpleHash, emailToId,
  generateLicenseKey,
  isMobile, debounce,
  pickFile, pickFileMobileSplit,
};

export default H;
