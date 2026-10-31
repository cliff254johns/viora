/* ═══════════════════════════════════════════════════════════════
   main/renewal-cron.js — VIORA Subscription Renewal Automation
   ─────────────────────────────────────────────────────────────
   Runs as part of the existing orchestration cron. Every pass:

     1. Scans every subscription record.
     2. Fires reminders at 7d / 3d / grace — at most once per day
        per subscription, tracked on the subscription itself.
     3. Flips status → 'expired' the day after (endDate + grace).
     4. Returns a summary the orchestration panel renders.

   Zero side effects beyond:
     • One `vioraNotify()` call per reminder (writes to notifications/)
     • One `logComm()` call per reminder (writes to commLog + fires WA)
     • One `update()` per subscription whose status changes or whose
       reminder timestamp advances

   Idempotent. Safe to run every 15 minutes, every minute, or on demand.
   ═══════════════════════════════════════════════════════════════ */

import {
  SUBSCRIPTION_PATH,
  PLAN,
  STATUS,
  evaluateSubscription,
  DEFAULT_GRACE_HOURS
} from "../subscription-schema.js";

/* ─── Injected deps ─────────────────────────────────────────── */
const D = {
  db: null, ref: null, set: null, get: null, update: null,
  state: null,
  toast: null, logActivity: null, logComm: null,
  getClient: null,
  normalizePhone: null,
  vioraNotify: null
};

/* ─── Thresholds (hours before endDate) ─────────────────────── */
const THRESHOLDS = [
  { key: "7d",     hoursBefore: 24 * 7,  level: "info",    emoji: "⏰" },
  { key: "3d",     hoursBefore: 24 * 3,  level: "warning", emoji: "⚠️" },
  { key: "1d",     hoursBefore: 24,      level: "warning", emoji: "🔔" }
];

/* ─── State exposed for the panel renderer ──────────────────── */
const LAST_RUN = {
  at: null,
  scanned: 0,
  reminded: 0,
  expired: 0,
  errors: 0
};

export function initRenewalCron(deps) {
  Object.assign(D, deps);
  if (!D.db) console.warn("[renewal-cron] init called without db");
}

/* ═══════════════════════════════════════════════════════════════
   MAIN ENTRY
   ═══════════════════════════════════════════════════════════════ */
export async function runRenewalCron() {
  const summary = {
    at: new Date().toISOString(),
    scanned: 0,
    reminded: 0,
    expired: 0,
    reconciled: 0,
    errors: 0,
    details: []
  };

  if (!D.db) { console.warn("[renewal-cron] no db"); return summary; }

  /* ── Phase 0: reconcile paid-but-stuck subscription invoices ── */
  try {
    const invSnap = await D.get(D.ref(D.db, 'viora_data/orgs/viora/invoices'));
    if (invSnap.exists()) {
      const invoices = Object.values(invSnap.val());
      for (const inv of invoices) {
        if (!inv || !inv.subscriptionId || inv.status !== 'paid') continue;
        if (inv._activationReconciledAt) continue;

        const subSnap = await D.get(
          D.ref(D.db, `viora_data/orgs/viora/subscriptions/${inv.subscriptionId}`)
        );
        if (!subSnap.exists()) continue;
        const sub = subSnap.val();

        const stuck =
          sub.status === 'pending_payment' ||
          sub.status === 'expired' ||
          (sub.status === 'active' && sub.endDate && Date.parse(sub.endDate) < Date.now());

        if (stuck) {
          try {
            const { handleSubscriptionInvoicePaid } = await import('./finance.js');
            await handleSubscriptionInvoicePaid(inv);
            await D.update(D.ref(D.db, `viora_data/orgs/viora/invoices/${inv.id}`), {
              _activationReconciledAt: new Date().toISOString()
            });
            summary.reconciled++;
            summary.details.push(`Reconciled: ${inv.number} → ${inv.subscriptionId}`);
            console.log('[renewal-cron] ✓ Reconciled stuck sub from paid invoice', inv.number);
          } catch (e) {
            console.warn('[renewal-cron] reconcile failed for', inv.id, e);
            summary.errors++;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[renewal-cron] reconciliation pass failed:', e);
  }

  let snap;
  try {
    snap = await D.get(D.ref(D.db, SUBSCRIPTION_PATH));
  } catch (e) {
    console.error("[renewal-cron] failed to read subscriptions", e);
    summary.errors++;
    return summary;
  }
  if (!snap.exists()) return summary;

  const all = snap.val();
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);

  for (const [id, sub] of Object.entries(all)) {
    if (!sub || sub.plan === PLAN.LIFETIME) continue;
    summary.scanned++;

    try {
      const result = await processSubscription(id, sub, now, todayIso);
      if (result.reminded) summary.reminded++;
      if (result.expired)  summary.expired++;
      if (result.detail)   summary.details.push(result.detail);
    } catch (e) {
      console.error("[renewal-cron] error on", id, e);
      summary.errors++;
    }
  }

  LAST_RUN.at = summary.at;
  LAST_RUN.scanned = summary.scanned;
  LAST_RUN.reminded = summary.reminded;
  LAST_RUN.expired = summary.expired;
  LAST_RUN.errors = summary.errors;

  return summary;
}

/* ═══════════════════════════════════════════════════════════════
   PER-SUBSCRIPTION PROCESSING
   ═══════════════════════════════════════════════════════════════ */
async function processSubscription(id, sub, nowMs, todayIso) {
  const result = { reminded: false, expired: false, detail: null };

  /* Never touch suspended / cancelled / pending_payment subs */
  if (sub.status === STATUS.SUSPENDED) return result;
  if (sub.status === STATUS.CANCELLED) return result;
  if (sub.status === STATUS.PENDING_PAYMENT) return result;

  const endMs = Date.parse(sub.endDate);
  if (!Number.isFinite(endMs)) return result;

  const graceMs = (Number(sub.graceHours) || DEFAULT_GRACE_HOURS) * 3600 * 1000;
  const hoursToEnd = (endMs - nowMs) / 3600000;

  /* ─── STEP 1 — Auto-expire past grace ─────────────────────── */
  if (nowMs > endMs + graceMs && sub.status !== STATUS.EXPIRED) {
    await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${id}`), {
      status: STATUS.EXPIRED,
      expiredAt: new Date(nowMs).toISOString(),
      expiredBy: "renewal-cron",
      updatedAt: new Date(nowMs).toISOString()
    });

    await D.logActivity(
      "edit",
      "Subscription auto-expired",
      `${sub.clientName || ""} — ${sub.productName || ""} (grace ended)`
    );

    result.expired = true;
    result.detail = `Expired: ${sub.clientName} — ${sub.productName}`;
    return result;
  }

  /* Already expired and reminders done — nothing to do */
  if (sub.status === STATUS.EXPIRED) return result;

  /* ─── STEP 2 — Fire reminders if threshold crossed ────────── */
  const sent = sub.lastReminderAt || {};
  const updatedSent = {};

  for (const t of THRESHOLDS) {
    if (hoursToEnd <= t.hoursBefore && hoursToEnd > 0) {
      /* Only send once per day */
      const priorIso = sent[t.key];
      if (priorIso && priorIso.slice(0, 10) === todayIso) continue;

      const ok = await sendReminder(sub, t, hoursToEnd);
      if (ok) {
        updatedSent[t.key] = new Date(nowMs).toISOString();
        result.reminded = true;
        result.detail = result.detail || `Reminded: ${sub.clientName} (${t.key})`;
      }
    }
  }

  /* ─── STEP 3 — Grace reminder (once) ──────────────────────── */
  const inGrace = nowMs > endMs && nowMs <= endMs + graceMs;
  if (inGrace) {
    const graceKey = "grace";
    const priorIso = sent[graceKey];
    if (!priorIso || priorIso.slice(0, 10) !== todayIso) {
      const ok = await sendReminder(sub, {
        key: "grace",
        level: "danger",
        emoji: "🚨",
        label: "grace period"
      }, hoursToEnd);
      if (ok) {
        updatedSent[graceKey] = new Date(nowMs).toISOString();
        result.reminded = true;
        result.detail = result.detail || `Grace reminder: ${sub.clientName}`;
      }
    }
  }

  /* ─── STEP 4 — Persist reminder timestamps if any changed ─── */
  if (Object.keys(updatedSent).length) {
    await D.update(D.ref(D.db, `${SUBSCRIPTION_PATH}/${id}`), {
      lastReminderAt: { ...sent, ...updatedSent },
      updatedAt: new Date(nowMs).toISOString()
    });
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════════
   SEND REMINDER — notification + WhatsApp + commLog
   ═══════════════════════════════════════════════════════════════ */
async function sendReminder(sub, threshold, hoursToEnd) {
  const t = threshold;
  const days = Math.floor(hoursToEnd / 24);
  const label = t.key === "grace"
    ? "grace period"
    : days <= 1 ? "24 hours" : `${days} days`;

  const title = `${t.emoji} Subscription expires in ${label}`;
  const body  = `${sub.clientName || "Client"} — ${sub.productName || "Product"}`;

  /* ── 1. Fire the shared notification bus ── */
  try {
    if (typeof D.vioraNotify === "function") {
      await D.vioraNotify({
        title,
        body,
        icon: "fa-key",
        level: t.level,
        source: "renewal-cron",
        url: "/main.html?tab=subscriptions"
      });
    }
  } catch (e) {
    console.warn("[renewal-cron] notify failed", e);
  }

  /* ── 2. WhatsApp nudge to the client ── */
  try {
    const client = D.getClient ? D.getClient(sub.clientId) : null;
    const phone = client?.phone;

    if (phone && typeof D.logComm === "function") {
      const message = buildClientMessage(sub, t, hoursToEnd, client);
      await D.logComm(
        "wa",
        sub.clientId,
        client.name || sub.clientName,
        phone,
        "",
        message,
        {
          reason: `sub-reminder-${t.key}`,
          dedupeKey: `sub-remind:${sub.id}:${t.key}:${new Date().toISOString().slice(0, 10)}`,
          subscriptionId: sub.id
        }
      );
    }
  } catch (e) {
    console.warn("[renewal-cron] comm failed", e);
  }

  return true;
}

function buildClientMessage(sub, threshold, hoursToEnd, client) {
  const name = (client?.name || sub.clientName || "there").split(" ")[0];
  const product = sub.productName || "your subscription";
  const renewUrl = `https://viora.co.ke/client.html?renew=${encodeURIComponent(sub.productId)}`;

  if (threshold.key === "grace") {
    return (
      `Hi ${name},\n\n` +
      `🚨 *Your VIORA subscription to ${product} has entered its grace period.*\n\n` +
      `You can still use the software for a few more hours, but it will lock automatically soon.\n\n` +
      `Renew now to avoid interruption:\n${renewUrl}\n\n` +
      `— VIORA Support`
    );
  }

  const days = Math.floor(hoursToEnd / 24);
  const when = days <= 1 ? "less than 24 hours" : `${days} days`;

  return (
    `Hi ${name},\n\n` +
    `⏰ Your VIORA subscription to *${product}* expires in *${when}*.\n\n` +
    `Renew here to keep using it without interruption:\n${renewUrl}\n\n` +
    `Need help? Just reply to this message.\n\n` +
    `— VIORA Support`
  );
}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS — for the dashboard widget
   ═══════════════════════════════════════════════════════════════ */
export function getExpiryOverview() {
  const state = D.state?.data || {};
  const subs = Object.values(state.subscriptions || {});
  const now = Date.now();

  const expiring7d = [];
  const inGrace = [];
  const justExpired = [];
  const expiredLongAgo = [];

  for (const s of subs) {
    if (!s || s.plan === PLAN.LIFETIME) continue;
    if (s.status === STATUS.SUSPENDED || s.status === STATUS.CANCELLED) continue;
    if (s.status === STATUS.PENDING_PAYMENT) continue;

    const endMs = Date.parse(s.endDate || "");
    if (!Number.isFinite(endMs)) continue;

    const graceMs = (Number(s.graceHours) || DEFAULT_GRACE_HOURS) * 3600 * 1000;
    const hoursToEnd = (endMs - now) / 3600000;

    if (now > endMs + graceMs) {
      /* past grace */
      const daysAgo = Math.floor((now - (endMs + graceMs)) / 86400000);
      if (daysAgo < 30) justExpired.push({ ...s, daysAgo });
      else expiredLongAgo.push({ ...s, daysAgo });
    } else if (now > endMs) {
      inGrace.push({ ...s, hoursToEnd });
    } else if (hoursToEnd <= 24 * 7) {
      expiring7d.push({ ...s, hoursToEnd });
    }
  }

  /* Sort by urgency */
  expiring7d.sort((a, b) => a.hoursToEnd - b.hoursToEnd);
  inGrace.sort((a, b) => a.hoursToEnd - b.hoursToEnd);
  justExpired.sort((a, b) => a.daysAgo - b.daysAgo);

  return { expiring7d, inGrace, justExpired, expiredLongAgo };
}

/* ═══════════════════════════════════════════════════════════════
   BULK NOTIFY — one click from the dashboard widget
   ═══════════════════════════════════════════════════════════════ */
export async function bulkNotifyExpiring() {
  const overview = getExpiryOverview();
  const list = [...overview.inGrace, ...overview.expiring7d];

  if (!list.length) {
    D.toast?.("Nothing expiring soon.", "info");
    return { sent: 0 };
  }

  let sent = 0;
  for (const s of list) {
    try {
      const threshold = overview.inGrace.includes(s)
        ? { key: "grace", level: "danger", emoji: "🚨" }
        : { key: "7d",    level: "warning", emoji: "⏰" };
      await sendReminder(s, threshold, s.hoursToEnd || 24);
      sent++;
    } catch (e) {
      console.warn("[renewal-cron] bulk notify failed for", s.id, e);
    }
  }

  await D.logActivity?.(
    "send",
    "Bulk renewal reminders sent",
    `${sent} client${sent === 1 ? "" : "s"} notified`
  );

  D.toast?.(`Sent ${sent} reminder${sent === 1 ? "" : "s"}.`, "success");
  return { sent };
}

export const RenewalCron = {
  run: runRenewalCron,
  getOverview: getExpiryOverview,
  bulkNotify: bulkNotifyExpiring,
  lastRun: () => ({ ...LAST_RUN })
};
