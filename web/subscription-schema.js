/* ═══════════════════════════════════════════════════════════════
   subscription-schema.js — VIORA Subscription data contract
   ─────────────────────────────────────────────────────────────
   Shared by:
     • main.js (worker-facing writes)
     • main/subscriptions.js (admin register)
     • main/renewal-cron.js (automation)
     • main/finance.js (post-invoice-paid activation)
     • The installed PWA (its own copy)

   This module is pure: no Firebase, no DOM, no side effects.
   Everything is a constant, a pure function, or a small helper.
   ═══════════════════════════════════════════════════════════════ */

/* ── Firebase paths ── */
export const SUBSCRIPTION_PATH = 'viora_data/orgs/viora/subscriptions';
export const LICENSES_PATH     = 'viora_data/orgs/viora/licenses';

/* ── Plan enum ── */
export const PLAN = Object.freeze({
  MONTHLY:   'monthly',
  QUARTERLY: 'quarterly',
  YEARLY:    'yearly',
  LIFETIME:  'lifetime',
});

/* ── Status enum ── */
export const STATUS = Object.freeze({
  ACTIVE:          'active',
  EXPIRED:         'expired',
  SUSPENDED:       'suspended',
  CANCELLED:       'cancelled',
  PENDING_PAYMENT: 'pending_payment',
});

/* ── Grace window default (hours) ── */
export const DEFAULT_GRACE_HOURS = 72;

/* ── Days per plan ── */
export const PLAN_DAYS = Object.freeze({
  [PLAN.MONTHLY]:   30,
  [PLAN.QUARTERLY]: 90,
  [PLAN.YEARLY]:    365,
  [PLAN.LIFETIME]:  null,
});

/* ── Plan labels for UI ── */
export const PLAN_LABELS = Object.freeze({
  [PLAN.MONTHLY]:   'Monthly',
  [PLAN.QUARTERLY]: 'Quarterly',
  [PLAN.YEARLY]:    'Yearly',
  [PLAN.LIFETIME]:  'Lifetime',
});

/* ── Status labels for UI ── */
export const STATUS_LABELS = Object.freeze({
  [STATUS.ACTIVE]:          'Active',
  [STATUS.EXPIRED]:         'Expired',
  [STATUS.SUSPENDED]:       'Suspended',
  [STATUS.CANCELLED]:       'Cancelled',
  [STATUS.PENDING_PAYMENT]: 'Pending Payment',
});

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Unique id generator — no crypto dependency (works in any env). */
function _id(prefix = 'sub') {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Compute the end date for a given plan and start date.
 * Returns ISO string, or `null` for lifetime.
 *
 * @param {'monthly'|'quarterly'|'yearly'|'lifetime'} plan
 * @param {string|Date} startDate — ISO or Date
 * @returns {string|null}
 */
export function computeEndDate(plan, startDate) {
  if (plan === PLAN.LIFETIME) return null;
  const days = PLAN_DAYS[plan];
  if (!days) throw new Error(`Unknown plan: ${plan}`);
  const start = startDate instanceof Date ? startDate : new Date(startDate || Date.now());
  const ms = start.getTime() + days * 86400000;
  return new Date(ms).toISOString();
}

/**
 * Build a fully-populated subscription record. Fills every field
 * the admin register, the cron, and the PWA expect. No undefineds.
 *
 * @param {object} opts
 * @returns {object}
 */
export function buildSubscription(opts = {}) {
  const now = new Date().toISOString();
  const plan = opts.plan || PLAN.MONTHLY;
  const startDate = opts.startDate || now;
  const endDate = plan === PLAN.LIFETIME
    ? null
    : (opts.endDate || computeEndDate(plan, startDate));

  const graceHours = Number.isFinite(Number(opts.graceHours))
    ? Math.max(0, Number(opts.graceHours))
    : DEFAULT_GRACE_HOURS;

  return {
    id: opts.id || _id(),
    clientId: opts.clientId || '',
    clientName: opts.clientName || '',
    productId: opts.productId || '',
    productName: opts.productName || '',
    productIcon: opts.productIcon || 'fa-solid fa-cube',
    plan,
    status: opts.status || STATUS.PENDING_PAYMENT,
    startDate,
    endDate,
    graceHours,
    modules: Array.isArray(opts.modules) ? opts.modules.slice() : [],
    amountKES: Number(opts.amountKES) || 0,
    billingCycle: opts.billingCycle || plan,
    autoRenew: !!opts.autoRenew,
    notes: opts.notes || '',
    createdBy: opts.createdBy || 'system',
    createdAt: opts.createdAt || now,
    updatedAt: now,
    renewalCount: Number(opts.renewalCount) || 0,
    paymentIds: Array.isArray(opts.paymentIds) ? opts.paymentIds.slice() : [],
    licenseId: opts.licenseId || null,
    pendingInvoiceId: null,
    pendingExtensionDays: null,
  };
}

/**
 * Validate a subscription record. Returns { ok, errors[] }.
 * `ok` is true only when errors is empty.
 *
 * @param {object} sub
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSubscription(sub) {
  const errors = [];
  if (!sub || typeof sub !== 'object') {
    return { ok: false, errors: ['Subscription must be an object'] };
  }
  if (!sub.id) errors.push('Missing id');
  if (!sub.clientId) errors.push('Missing clientId');
  if (!sub.productId) errors.push('Missing productId');
  if (!sub.plan || !Object.values(PLAN).includes(sub.plan)) {
    errors.push(`Invalid plan: ${sub.plan}`);
  }
  if (sub.status && !Object.values(STATUS).includes(sub.status)) {
    errors.push(`Invalid status: ${sub.status}`);
  }
  if (sub.plan !== PLAN.LIFETIME) {
    if (!sub.endDate) errors.push('Missing endDate (plan is not lifetime)');
    else if (Number.isNaN(Date.parse(sub.endDate))) errors.push('Invalid endDate');
  }
  if (!sub.startDate) errors.push('Missing startDate');
  else if (Number.isNaN(Date.parse(sub.startDate))) errors.push('Invalid startDate');
  return { ok: errors.length === 0, errors };
}

/**
 * Return the derived state of a subscription at `nowMs`.
 * This is the single source of truth for "is it alive?" — every
 * other module calls this and never re-implements grace math.
 *
 * @param {object} sub
 * @param {number} [nowMs] — defaults to Date.now()
 * @returns {{
 *   allowed: boolean,
 *   reason: string,
 *   inGrace: boolean,
 *   msRemaining: number|null,
 *   effectiveEndMs: number|null
 * }}
 */
export function evaluateSubscription(sub, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();

  if (!sub) {
    return { allowed: false, reason: 'missing', inGrace: false, msRemaining: null, effectiveEndMs: null };
  }
  if (sub.plan === PLAN.LIFETIME) {
    return { allowed: true, reason: 'lifetime', inGrace: false, msRemaining: null, effectiveEndMs: null };
  }
  if (sub.status === STATUS.CANCELLED) {
    return { allowed: false, reason: 'cancelled', inGrace: false, msRemaining: null, effectiveEndMs: null };
  }
  if (sub.status === STATUS.SUSPENDED) {
    return { allowed: false, reason: 'suspended', inGrace: false, msRemaining: null, effectiveEndMs: null };
  }
  if (sub.status === STATUS.PENDING_PAYMENT) {
    return { allowed: false, reason: 'pending_payment', inGrace: false, msRemaining: null, effectiveEndMs: null };
  }

  const endMs = Date.parse(sub.endDate || '');
  if (!Number.isFinite(endMs)) {
    return { allowed: false, reason: 'invalid_end_date', inGrace: false, msRemaining: null, effectiveEndMs: null };
  }

  const graceMs = (Number.isFinite(Number(sub.graceHours)) ? Number(sub.graceHours) : DEFAULT_GRACE_HOURS) * 3600000;
  const effectiveEndMs = endMs + graceMs;

  if (now <= endMs) {
    return {
      allowed: true,
      reason: 'active',
      inGrace: false,
      msRemaining: endMs - now,
      effectiveEndMs
    };
  }
  if (now <= effectiveEndMs) {
    return {
      allowed: true,
      reason: 'grace',
      inGrace: true,
      msRemaining: effectiveEndMs - now,
      effectiveEndMs
    };
  }
  return {
    allowed: false,
    reason: 'expired',
    inGrace: false,
    msRemaining: 0,
    effectiveEndMs
  };
}

/**
 * Build a UI-friendly pill describing the subscription state.
 * The admin register renders this directly.
 *
 * @param {object} sub
 * @param {number} [nowMs]
 * @returns {{ tone: 'success'|'warning'|'danger'|'info', label: string }}
 */
export function subscriptionPill(sub, nowMs) {
  const e = evaluateSubscription(sub, nowMs);
  if (!sub) return { tone: 'info', label: 'Missing' };
  if (sub.plan === PLAN.LIFETIME) return { tone: 'success', label: 'Lifetime' };
  switch (e.reason) {
    case 'active':   return { tone: 'success', label: 'Active' };
    case 'grace':    return { tone: 'warning', label: 'Grace' };
    case 'expired':  return { tone: 'danger',  label: 'Expired' };
    case 'suspended':return { tone: 'warning', label: 'Suspended' };
    case 'cancelled':return { tone: 'danger',  label: 'Cancelled' };
    case 'pending_payment': return { tone: 'info', label: 'Pending Payment' };
    default:         return { tone: 'info',    label: e.reason || 'Unknown' };
  }
}

/* ── Default export (convenience) ── */
export default {
  SUBSCRIPTION_PATH,
  LICENSES_PATH,
  PLAN,
  STATUS,
  DEFAULT_GRACE_HOURS,
  PLAN_DAYS,
  PLAN_LABELS,
  STATUS_LABELS,
  computeEndDate,
  buildSubscription,
  validateSubscription,
  evaluateSubscription,
  subscriptionPill,
};
