// Shared idempotent publisher for VIORA portal events.
// Call only after the business record has been successfully written.
export async function publishVioraEvent({
  db, ref, set, get, eventId, source, category, title, body, url,
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
    const notificationRef = ref(db, "viora_data/orgs/viora/notifications/" + id);
    let isNew = true;
    if (typeof get === "function") {
      const existingSnap = await get(notificationRef);
      if (existingSnap && existingSnap.exists()) {
        isNew = false;
        const existing = existingSnap.val() || {};
        payload.read = existing.read === true;
        if (existing.readAt) payload.readAt = existing.readAt;
        if (existing.createdAt) payload.createdAt = existing.createdAt;
      }
    }
    await set(notificationRef, payload);
    return { ok: true, id, isNew };
  } catch (error) {
    console.warn("[viora-notifications] publish failed", sourceKey, eventKey, error?.code || error?.message || error);
    return { ok: false, reason: error?.code || "write-failed" };
  }
}
