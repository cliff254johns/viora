// Shared idempotent publisher for VIORA portal events.
// Call only after the business record has been successfully written.
export async function publishVioraEvent({
  db, ref, set, eventId, source, category, title, body, url,
  level = "info", icon = "fa-bell", actorUid = ""
}) {
  if (!db || typeof ref !== "function" || typeof set !== "function" || !eventId) {
    return { ok: false, reason: "missing-dependency" };
  }
  const clean = (value) => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 110);
  const sourceKey = clean(source || "portal");
  const eventKey = clean(eventId);
  const id = sourceKey + "-" + eventKey;
  const payload = {
    id,
    sourceEventId: sourceKey + ":" + eventKey,
    eventId: sourceKey + ":" + eventKey,
    source: sourceKey,
    category: category || sourceKey,
    title: String(title || "VIORA update").slice(0, 180),
    body: String(body || "").slice(0, 500),
    url: url || "/main.html#dashboard",
    level,
    icon,
    ts: new Date().toISOString(),
    read: false,
    by: actorUid || null
  };
  try {
    await set(ref(db, "viora_data/orgs/viora/notifications/" + id), payload);
    return { ok: true, id };
  } catch (error) {
    console.warn("[viora-notifications] publish failed", sourceKey, eventKey, error?.code || error?.message || error);
    return { ok: false, reason: error?.code || "write-failed" };
  }
}
