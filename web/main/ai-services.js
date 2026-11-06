// main/ai-services.js
// ═══════════════════════════════════════════════════════════════
//  AI Services — Smart Filing, Priority Ranking, Anomaly Detection
//  Extracted from main.js. All three are self-contained IIFEs.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
let _esc = null;                          // cached escapeHtml
let _warned = new Set();                  // dedupe warnings

const REQUIRED_CTX = ['callFn', 'state', 'toast'];

export function initAIServices(ctx) {
  _ctx = ctx || {};
  _esc = typeof _ctx.escapeHtml === 'function' ? _ctx.escapeHtml : _defaultEscape;
  _warned.clear();
  for (const k of REQUIRED_CTX) {
    if (!_ctx[k] && !_warned.has(k)) {
      _warned.add(k);
      console.warn(`[AIServices] missing ctx.${k}`);
    }
  }
}

function ctx() { return _ctx || {}; }

function _defaultEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Defer DOM append + rAF-batch if available. Falls back to microtask.
const _raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (cb) => setTimeout(cb, 0);

/* ═══════════════════════════════════════════════════════════════
   AI SMART FILING
   ═══════════════════════════════════════════════════════════════ */
export const AIFiling = (function () {
  const TOAST_TTL = 8000;

  // Only one toast visible at a time. We track both the element and the
  // pending timer so we can cleanly cancel a prior toast when replacing it.
  let _activeToastEl = null;
  let _activeToastTimer = null;

  async function classifyDocument({ fileName, mime, textExtract = '' }) {
    const callFn = ctx().callFn;
    if (typeof callFn !== 'function') return null;
    try {
      const res = await callFn('ai/classifyDocument', { fileName, mime, textExtract });
      return res || null;
    } catch (e) {
      console.warn('[AIFiling] classifyDocument failed', e);
      return null;
    }
  }

  async function maybeFileDocument({ fileName, mime, entityType, clientId, docRef }) {
    // Only clientDoc is supported today — bail early before hitting the AI.
    if (entityType !== 'clientDoc' || !clientId || !docRef) return;

    const { upsertDoc, getClient } = ctx();
    if (typeof upsertDoc !== 'function' || typeof getClient !== 'function') return;

    const res = await classifyDocument({ fileName, mime });
    // Treat "other" / zero-or-invalid-confidence as no-suggestion (avoids noisy toasts).
    if (!res || !res.category || res.category === 'other') return;
    const confidence = Number(res.confidence);
    if (!Number.isFinite(confidence) || confidence <= 0) return;

    const pct = ` (${Math.round(confidence * 100)}%)`;
    const forWho = res.clientName ? ` for ${res.clientName}` : '';
    const message = `AI filed this as "${res.category}"${pct}${forWho}`;

    showSuggestionToast(message, async () => {
      const c = getClient(clientId);
      if (!c || !Array.isArray(c.documents)) return;
      const idx = c.documents.findIndex((d) => d.id === docRef.id);
      if (idx < 0) return;
      const d = c.documents[idx];
      d.aiCategory   = res.category;
      d.aiClientName = res.clientName || null;
      d.aiRefNumber  = res.refNumber  || null;
      d.aiAmount     = res.amount     || null;
      d.aiDate       = res.date       || null;
      await upsertDoc('entities', c, c._rev);
    });
  }

  function _clearActiveToast() {
    if (_activeToastTimer) {
      clearTimeout(_activeToastTimer);
      _activeToastTimer = null;
    }
    if (_activeToastEl && _activeToastEl.parentNode) {
      _activeToastEl.remove();
    }
    _activeToastEl = null;
  }

  function showSuggestionToast(message, onAccept) {
    const esc = _esc || _defaultEscape;

    // Replace any existing toast immediately (avoid DOM pile-up + timer leak).
    _clearActiveToast();

    let el = null;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      if (el && el.parentNode) el.remove();
      if (_activeToastEl === el) {
        _activeToastEl = null;
        _activeToastTimer = null;
      }
    };

    const dismiss = () => cleanup();

    const accept = async () => {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      try {
        if (onAccept) await onAccept();
      } catch (e) {
        console.warn('[AIFiling] onAccept failed', e);
      }
      if (el && el.parentNode) el.remove();
      if (_activeToastEl === el) {
        _activeToastEl = null;
        _activeToastTimer = null;
      }
    };

    _raf(() => {
      el = document.createElement('div');
      el.className = 'ai-suggestion-toast';
      el.innerHTML =
        '<div class="ai-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>' +
        '<div class="ai-body">' +
          '<div class="ai-title">AI Smart Filing</div>' +
          '<div class="ai-desc">' + esc(message) + '</div>' +
          '<div class="ai-actions">' +
            '<button type="button" data-act="accept">Accept</button>' +
            '<button type="button" data-act="dismiss">Dismiss</button>' +
          '</div>' +
        '</div>';

      // Single delegated listener (one closure instead of two onclick props).
      el.addEventListener('click', (ev) => {
        const act = ev.target && ev.target.getAttribute
          ? ev.target.getAttribute('data-act')
          : null;
        if (act === 'accept') accept();
        else if (act === 'dismiss') dismiss();
      }, { passive: true });

      document.body.appendChild(el);
      _activeToastEl = el;
      timeoutId = setTimeout(dismiss, TOAST_TTL);
      _activeToastTimer = timeoutId;
    });
  }

  return { classifyDocument, maybeFileDocument, showSuggestionToast };
})();

/* ═══════════════════════════════════════════════════════════════
   AI PRIORITY RE-RANKING
   ═══════════════════════════════════════════════════════════════ */
export const AIRank = (function () {
  const COOLDOWN_MS = 15 * 60 * 1000;     // ★ v9.5 — 15 min (was 5 min)
  const MAX_TASKS = 20;
  const MAX_DEALS = 20;
  const STUCK_MS  = 60 * 1000;            // auto-release in-flight flag

  async function rerankByAI() {
    const c = ctx();
    const { state, callFn, toast, renderActiveTab, evaluateAllQueues } = c;
    if (!state || !state.data || typeof callFn !== 'function') return;

    // If a run is in-flight: bail while it's healthy; if it looks stuck
    // (older than STUCK_MS), forcibly release the flag before proceeding.
    if (state._aiRankInFlight) {
      const started = state._aiRankStart || 0;
      if (Date.now() - started < STUCK_MS) return; // healthy — let it finish
      // Stuck: release and continue with a fresh run.
      state._aiRankInFlight = false;
      state._aiRankStart = 0;
    }

    // Cooldown: don't hammer the AI endpoint.
    if (Date.now() - (state._aiRankLastRun || 0) < COOLDOWN_MS) return;

    state._aiRankInFlight = true;
    state._aiRankStart = Date.now();

    try {
      const items = [];

      // ── Queues ─────────────────────────────────────────────
      if (typeof evaluateAllQueues === 'function') {
        const queues = evaluateAllQueues() || {};
        const byId = queues.byId;
        if (byId) {
          for (const id in byId) {
            const q = byId[id];
            if (!q || !(q.count > 0)) continue;
            items.push({
              id: `queue:${id}`,
              type: 'queue',
              label: id,
              count: q.count,
              severity: q.severity,
            });
          }
        }
      }

      // ── Tasks (pending) ────────────────────────────────────
      const tasks = state.data.tasks;
      if (Array.isArray(tasks)) {
        let taken = 0;
        for (let i = 0; i < tasks.length && taken < MAX_TASKS; i++) {
          const t = tasks[i];
          if (!t || t.status !== 'pending') continue;
          items.push({
            id: `task:${t.id}`,
            type: 'task',
            label: t.title,
            dueDate: t.dueDate,
            priority: t.priority,
          });
          taken++;
        }
      }

      // ── Deals (open) ───────────────────────────────────────
      const deals = state.data.deals;
      if (Array.isArray(deals)) {
        let taken = 0;
        for (let i = 0; i < deals.length && taken < MAX_DEALS; i++) {
          const d = deals[i];
          if (!d || d.stage === 'Won' || d.stage === 'Lost') continue;
          items.push({
            id: `deal:${d.id}`,
            type: 'deal',
            label: d.title,
            value: d.value,
            stage: d.stage,
          });
          taken++;
        }
      }

      if (items.length === 0) return;

      const res = await callFn('ai/rank', {
        items,
        context: { role: state.operator?.role, hour: new Date().getHours() },
      });

      if (!res || !Array.isArray(res.ranked)) return;

      // Build a fresh cache object, then swap (avoids partial-read races).
      const nextCache = Object.create(null);
      for (let i = 0; i < res.ranked.length; i++) {
        const r = res.ranked[i];
        if (!r || typeof r.id !== 'string') continue;
        nextCache[r.id] = { score: r.score, reason: r.reason, order: i };
      }
      state.data._aiRankCache = nextCache;
      state._aiRankLastRun = Date.now();

      if (typeof toast === 'function') toast('AI re-ranked priorities.', 'success');
      const _modalOpen =
        document.querySelector('.modal-overlay.active') ||
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        (document.getElementById('hc-industry-panel')?.style.display === 'flex') ||
        (document.getElementById('hc-modal-host')?.children.length > 0);

      if (typeof renderActiveTab === 'function' && !_modalOpen) {
        renderActiveTab();
      }
    } catch (e) {
      console.warn('[AIRank] rerankByAI failed', e);
    } finally {
      state._aiRankInFlight = false;
      state._aiRankStart = 0;
    }
  }

  function getScoreFor(key) {
    const state = ctx().state;
    const cache = state && state.data && state.data._aiRankCache;
    if (!cache) return null;
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : null;
  }

  return { rerankByAI, getScoreFor };
})();

/* ═══════════════════════════════════════════════════════════════
   AI ANOMALY DETECTION — manual scan trigger
   ═══════════════════════════════════════════════════════════════ */
export const AIAnomaly = (function () {
  let _running = false;
  const STUCK_MS = 2 * 60 * 1000;         // safety release for hung handoffs
  let _startedAt = 0;

  async function scanNow() {
    const {
      Orchester,
      ORCHESTRATION_HANDOFFS,
      renderOrchestrationPanel,
      toast,
    } = ctx();

    if (!Orchester || !Array.isArray(ORCHESTRATION_HANDOFFS)) return;

    // Guard against double-clicks / overlapping scans.
    if (_running) {
      if (Date.now() - _startedAt < STUCK_MS) return;
      // Stuck — release and proceed.
      _running = false;
    }

    const h = ORCHESTRATION_HANDOFFS.find((x) => x.id === 'daily-anomaly-scan');
    if (!h) return;

    _running = true;
    _startedAt = Date.now();

    try {
      const evt = {
        type: h.on || 'anomaly/scan',
        payload: {},
        meta: {},
        ts: new Date().toISOString(),
      };
      await Orchester.runHandoff(h, evt, { manual: true });
      if (typeof renderOrchestrationPanel === 'function') renderOrchestrationPanel();
      if (typeof toast === 'function') toast('Anomaly scan complete.', 'success');
    } catch (e) {
      console.warn('[AIAnomaly] scanNow failed', e);
      if (typeof toast === 'function') toast('Anomaly scan failed.', 'error');
    } finally {
      _running = false;
      _startedAt = 0;
    }
  }

  return { scanNow };
})();
