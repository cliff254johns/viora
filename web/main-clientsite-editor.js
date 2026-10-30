/* ═══════════════════════════════════════════════════════════
   VIORA — MAIN PUBLIC SITE EDITOR  (v7.2 — perf + correctness)
   Every section of public.html is editable from the
   "Public Site" tab in main.html.

   All writes go to ONE node:
       viora_data/orgs/viora/clientsite
   public.js subscribes to that node → changes appear on every
   device within ~200 ms (Firebase RTDB push).

   v7.2 changes (public API unchanged):
     • saveField()      — writes only the mutated sub-path.
       No more full-tree read-modify-write race, no more 1 MB
       round-trip on a 20-byte nav-label change.
     • saveMerged()     — scoped read-modify-write per section.
     • createCache()    — 5 s TTL cache around loadSite().
     • In-flight guard  — Save button disabled during onSubmit.
     • JSON editor      — replaces window.prompt() with a proper
       modal + JSON.parse + schema check.
     • normalizeField() — one place for array ↔ string conversion.
     • Image upload     — optional canvas compression.
     • Double-load guard.
     • renderClientsite debounced (250 ms).
   ═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  if (window.__vioraClientsiteLoaded) return;
  window.__vioraClientsiteLoaded = true;

  const SITE_PATH = "viora_data/orgs/viora/clientsite";
  const TREE_ROOT = SITE_PATH.split("/").slice(0, -1).join("/"); // viora_data/orgs/viora

  const dbRef  = () => window._internals.ref(window._internals.db, SITE_PATH);
  const dbRefS = (sub) => window._internals.ref(window._internals.db, SITE_PATH + "/" + sub);
  const dbGet  = (r) => window._internals.get(r || dbRef());
  const dbSet  = (r, v) => window._internals.set(r, v);
  const dbUpd  = (r, v) => window._internals.update(r, v);
  const toast  = (msg, type) => window._internals.toast(msg, type);
  const esc    = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ═══════════════════════════════════════════════════════════
     CACHED LOADER — 5 s TTL
     Opening 5 modals in a row = 1 fetch.
     ═══════════════════════════════════════════════════════════ */
  let _siteCache = { data: null, ts: 0 };
  const CACHE_TTL = 5000;

  async function loadSite(force) {
    const now = Date.now();
    if (!force && _siteCache.data && (now - _siteCache.ts) < CACHE_TTL) {
      return _siteCache.data;
    }
    const snap = await dbGet(dbRef());
    const data = snap.exists() ? (snap.val() || {}) : {};
    _siteCache = { data, ts: now };
    return data;
  }

  function invalidateSiteCache() { _siteCache = { data: null, ts: 0 }; }

  /* ═══════════════════════════════════════════════════════════
     WRITES — scoped, no full-tree round-trip
     ═══════════════════════════════════════════════════════════ */

  /** Write a single sub-path. No read needed. */
  async function saveField(path, value, label) {
    try {
      await dbSet(dbRefS(path), value);
      invalidateSiteCache();
      toast((label || path) + " saved — live everywhere.", "success");
      scheduleClientsiteRerender();
    } catch (e) {
      toast("Save failed: " + e.message, "error");
      throw e;
    }
  }

  /** Write several sibling fields under one section, preserving the rest. */
  async function saveMerged(section, values, label) {
    try {
      const existing = await loadSite();
      const next = Object.assign({}, existing[section] || {}, values);
      await dbSet(dbRefS(section), next);
      invalidateSiteCache();
      toast((label || section) + " saved — live everywhere.", "success");
      scheduleClientsiteRerender();
    } catch (e) {
      toast("Save failed: " + e.message, "error");
      throw e;
    }
  }

  /** Write a whole section (used for array-replacing ops). */
  async function saveSection(section, value, label) {
    try {
      await dbSet(dbRefS(section), value);
      invalidateSiteCache();
      toast((label || section) + " saved — live everywhere.", "success");
      scheduleClientsiteRerender();
    } catch (e) {
      toast("Save failed: " + e.message, "error");
      throw e;
    }
  }

  /* Debounced re-render of the admin preview (avoids N renders on bulk edits). */
  let _rerenderTimer = 0;
  function scheduleClientsiteRerender() {
    clearTimeout(_rerenderTimer);
    _rerenderTimer = setTimeout(() => {
      if (typeof Viora.renderClientsite === "function") {
        try { Viora.renderClientsite(); } catch (e) { console.warn(e); }
      }
    }, 250);
  }

  /* ═══════════════════════════════════════════════════════════
     FIELD NORMALISATION — single source of truth
     ═══════════════════════════════════════════════════════════ */
  const FIELD_NORMALIZERS = {
    // section → field → { toForm, fromForm }
    industries: {
      features: {
        toForm:   v => Array.isArray(v) ? v.join("\n") : (v || ""),
        fromForm: v => String(v || "").split("\n").map(s => s.trim()).filter(Boolean)
      }
    },
    projects: {
      tags: {
        toForm:   v => Array.isArray(v) ? v.join(", ") : (v || ""),
        fromForm: v => String(v || "").split(",").map(s => s.trim()).filter(Boolean)
      }
    },
    skills: {
      level: {
        toForm:   v => (v == null ? 80 : v),
        fromForm: v => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
        }
      }
    }
  };

  function prepareForForm(section, item) {
    const out = Object.assign({}, item);
    const rules = FIELD_NORMALIZERS[section];
    if (!rules) return out;
    for (const key of Object.keys(rules)) {
      if (out[key] !== undefined) out[key] = rules[key].toForm(out[key]);
    }
    return out;
  }

  function normalizeFromForm(section, values) {
    const out = Object.assign({}, values);
    const rules = FIELD_NORMALIZERS[section];
    if (!rules) return out;
    for (const key of Object.keys(rules)) {
      if (out[key] !== undefined) out[key] = rules[key].fromForm(out[key]);
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════
     GENERIC MODAL FORM BUILDER
     ═══════════════════════════════════════════════════════════ */
  function openFormModal(opts) {
    const {
      title, fields, initial = {}, onSubmit,
      submitLabel = "Save", icon = "fa-pen-to-square"
    } = opts;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay active";
    overlay.style.zIndex = "9999";

    const fieldsHtml = fields.map(f => {
      const raw = initial[f.key];
      const val = raw != null ? raw : (f.default != null ? f.default : "");
      const req = f.required ? "required" : "";
      const help = f.help
        ? `<small style="display:block;font-size:.68rem;color:var(--text-light);margin-top:3px;">${esc(f.help)}</small>`
        : "";

      let input;
      if (f.type === "textarea") {
        input = `<textarea data-key="${esc(f.key)}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || "")}">${esc(val)}</textarea>`;
      } else if (f.type === "select") {
        input = `<select data-key="${esc(f.key)}" ${req}>${(f.options || []).map(o =>
          `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? "selected" : ""}>${esc(o.label)}</option>`
        ).join("")}</select>`;
      } else if (f.type === "number") {
        input = `<input type="number" data-key="${esc(f.key)}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : ""} ${req} placeholder="${esc(f.placeholder || "")}" />`;
      } else if (f.type === "color") {
        input = `<input type="color" data-key="${esc(f.key)}" value="${esc(val || "#00d4ff")}" />`;
      } else if (f.type === "checkbox") {
        input = `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" data-key="${esc(f.key)}" ${val ? "checked" : ""} /> <span>${esc(f.label || "")}</span></label>`;
      } else {
        input = `<input type="text" data-key="${esc(f.key)}" value="${esc(val)}" ${req} placeholder="${esc(f.placeholder || "")}" />`;
      }

      const labelHtml = f.type === "checkbox"
        ? ""
        : `<label>${esc(f.label || f.key)}</label>`;
      return `<div style="margin-bottom:10px;">${labelHtml}${input}${help}</div>`;
    }).join("");

    overlay.innerHTML = `
      <div class="modal" style="max-width:640px;">
        <h2 style="margin-bottom:16px;">
          <span class="modal-icon"><i class="fa-solid ${icon}"></i></span>
          ${esc(title)}
        </h2>
        <form id="__csForm" style="max-height:60vh;overflow-y:auto;padding-right:6px;">${fieldsHtml}</form>
        <div class="form-actions" style="margin-top:16px;">
          <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>
          <button type="button" class="btn btn-success" data-act="save">
            <i class="fa-solid fa-check"></i> ${esc(submitLabel)}
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", close);

    // Enter key submits (except in textarea)
    overlay.querySelector("#__csForm").addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveBtn.click();
      }
    });

    const saveBtn = overlay.querySelector('[data-act="save"]');
    let inFlight = false;

    saveBtn.addEventListener("click", async () => {
      if (inFlight) return;                    // ← guards double-click
      inFlight = true;
      const originalHtml = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';

      try {
        const values = {};
        overlay.querySelectorAll("[data-key]").forEach(el => {
          const k = el.dataset.key;
          if (el.type === "checkbox") values[k] = el.checked;
          else if (el.type === "number") values[k] = el.value === "" ? "" : Number(el.value);
          else values[k] = el.value;
        });

        for (const f of fields) {
          if (f.required && !values[f.key]) {
            toast(`${f.label || f.key} is required.`, "warning");
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHtml;
            inFlight = false;
            return;
          }
        }

        await onSubmit(values);
        close();
      } catch (e) {
        toast("Save failed: " + (e.message || e), "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
        inFlight = false;
      }
    });

    const first = overlay.querySelector("[data-key]");
    if (first) setTimeout(() => first.focus(), 50);
  }

  /* ═══════════════════════════════════════════════════════════
     JSON EDITOR MODAL — replaces window.prompt()
     ═══════════════════════════════════════════════════════════ */
  function openJsonModal({ title, icon, initial, placeholder, onSubmit, validate }) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay active";
    overlay.style.zIndex = "9999";
    overlay.innerHTML = `
      <div class="modal" style="max-width:720px;">
        <h2 style="margin-bottom:12px;">
          <span class="modal-icon"><i class="fa-solid ${icon}"></i></span>
          ${esc(title)}
        </h2>
        <p style="font-size:.78rem;color:var(--text-secondary);margin-bottom:10px;">
          Edit the JSON below. Invalid JSON will be rejected.
        </p>
        <textarea id="__jsonArea" spellcheck="false" style="width:100%;min-height:320px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.8rem;line-height:1.4;padding:12px;border-radius:10px;border:1.5px solid var(--border-color);background:var(--bg-input);color:var(--text-primary);resize:vertical;">${esc(JSON.stringify(initial, null, 2))}</textarea>
        <div id="__jsonErr" style="color:var(--accent-red);font-size:.78rem;margin-top:6px;min-height:18px;"></div>
        <div class="form-actions" style="margin-top:12px;">
          <button type="button" class="btn btn-outline" data-act="cancel">Cancel</button>
          <button type="button" class="btn btn-outline" data-act="format"><i class="fa-solid fa-align-left"></i> Format</button>
          <button type="button" class="btn btn-success" data-act="save"><i class="fa-solid fa-check"></i> Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const area = overlay.querySelector("#__jsonArea");
    const errBox = overlay.querySelector("#__jsonErr");
    const close = () => overlay.remove();

    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", close);
    overlay.querySelector('[data-act="format"]').addEventListener("click", () => {
      try {
        area.value = JSON.stringify(JSON.parse(area.value), null, 2);
        errBox.textContent = "";
      } catch (e) {
        errBox.textContent = e.message;
      }
    });

    let inFlight = false;
    overlay.querySelector('[data-act="save"]').addEventListener("click", async () => {
      if (inFlight) return;
      let parsed;
      try {
        parsed = JSON.parse(area.value);
      } catch (e) {
        errBox.textContent = "Invalid JSON: " + e.message;
        return;
      }
      if (validate) {
        const msg = validate(parsed);
        if (msg) { errBox.textContent = msg; return; }
      }
      inFlight = true;
      const btn = overlay.querySelector('[data-act="save"]');
      const html = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
      try {
        await onSubmit(parsed);
        close();
      } catch (e) {
        errBox.textContent = "Save failed: " + (e.message || e);
        btn.disabled = false;
        btn.innerHTML = html;
        inFlight = false;
      }
    });

    setTimeout(() => area.focus(), 50);
  }

  /* ═══════════════════════════════════════════════════════════
     IMAGE UPLOAD — with optional canvas compression
     ═══════════════════════════════════════════════════════════ */
  const MAX_RAW_BYTES   = 4 * 1024 * 1024;   // reject >4 MB before compression
  const MAX_FINAL_BYTES = 500 * 1024;        // reject >500 KB after compression
  const MAX_DIMENSION   = 1600;              // longest edge after compression

  async function compressImage(file, { maxDim = MAX_DIMENSION, quality = 0.82 } = {}) {
    // Fast path: tiny PNGs / SVGs pass through unchanged.
    if (file.type === "image/svg+xml" || file.size < 80 * 1024) return file;

    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });

    let { width: w, height: h } = img;
    if (w <= maxDim && h <= maxDim && file.size < MAX_FINAL_BYTES) {
      return file; // already small enough
    }
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);

    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  }

  function pickAndSaveImage({ label, onDataUrl }) {
    if (typeof window.pickFile !== "function") {
      toast("File picker not available.", "error");
      return;
    }
    window.pickFile({
      accept: "image/*",
      onPick: async file => {
        if (!file) return;
        if (file.size > MAX_RAW_BYTES) {
          toast(`Image too large (${Math.round(file.size / 1024)} KB). Max ${MAX_RAW_BYTES / 1024 / 1024} MB.`, "error");
          return;
        }
        try {
          const compressed = await compressImage(file);
          if (compressed.size > MAX_FINAL_BYTES) {
            toast(`Compressed image still too large (${Math.round(compressed.size / 1024)} KB). Max ${MAX_FINAL_BYTES / 1024} KB.`, "error");
            return;
          }
          const dataUrl = await new Promise(res => {
            const r = new FileReader();
            r.onload = e => res(e.target.result);
            r.readAsDataURL(compressed);
          });
          await onDataUrl(dataUrl, compressed);
        } catch (e) {
          toast("Upload failed: " + e.message, "error");
        }
      }
    });
  }

  window.Viora = window.Viora || {};

  /* ═══════════════════════════════════════════════════════════
     HERO
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteHero = async function () {
    const site = await loadSite();
    const h = site.hero || {};
    openFormModal({
      title: "Edit Hero Section", icon: "fa-heading", initial: h,
      fields: [
        { key: "name", label: "Display Name", placeholder: "Clifford Munene" },
        { key: "badge", label: "Badge Pill Text", placeholder: "VIORA · EcoSystems" },
        { key: "title", label: "Main Heading", placeholder: "Business Operating Systems..." },
        { key: "bio", label: "Bio Paragraph", type: "textarea", rows: 4 },
        { key: "typedPhrases", label: "Typed Phrases", help: "Comma-separated." },
        { key: "btn1Label", label: "Primary Button Label", placeholder: "Book a Demo" },
        { key: "btn1Link", label: "Primary Button Link", placeholder: "#contact" },
        { key: "btn2Label", label: "Secondary Button Label", placeholder: "Download App" },
        { key: "btn2Link", label: "Secondary Button Link", placeholder: "https://..." },
        { key: "stat1Value", label: "Stat 1 — Value" }, { key: "stat1Label", label: "Stat 1 — Label" },
        { key: "stat2Value", label: "Stat 2 — Value" }, { key: "stat2Label", label: "Stat 2 — Label" },
        { key: "stat3Value", label: "Stat 3 — Value" }, { key: "stat3Label", label: "Stat 3 — Label" }
      ],
      onSubmit: vals => saveMerged("hero", vals, "Hero")
    });
  };

  Viora.uploadSiteHeroImage = function () {
    pickAndSaveImage({
      label: "Hero image",
      onDataUrl: dataUrl => saveField("hero/image", dataUrl, "Hero image")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     BRANDING
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteBranding = async function () {
    const site = await loadSite();
    const b = site.branding || {};
    openFormModal({
      title: "Edit Branding & Contact", icon: "fa-palette", initial: b,
      fields: [
        { key: "name", label: "Owner / Display Name" },
        { key: "company", label: "Company / Tagline" },
        { key: "email", label: "Contact Email" },
        { key: "phone", label: "Contact Phone", help: "Used for WhatsApp + tel: links." },
        { key: "location", label: "Location Line" },
        { key: "footerName", label: "Footer Company Name" },
        { key: "founderLabel", label: "Label Above Name" },
        { key: "locationLabel", label: "Label Above Location" },
        { key: "accentColor", label: "Accent Color", type: "color" },
        { key: "primaryColor", label: "Primary Background", type: "color" }
      ],
      onSubmit: vals => saveMerged("branding", vals, "Branding")
    });
  };

  Viora.uploadSiteLogo = function () {
    pickAndSaveImage({
      label: "Logo",
      onDataUrl: dataUrl => saveField("branding/logoUrl", dataUrl, "Logo")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     NAV
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteNav = async function () {
    const site = await loadSite();
    const n = site.nav || {};
    openFormModal({
      title: "Edit Navigation Labels", icon: "fa-bars", initial: n,
      fields: [
        { key: "brandText", label: "Brand Text" },
        { key: "brandIcon", label: "Brand Icon", help: "FontAwesome class" },
        { key: "portalLabel", label: "Portal Button Label" },
        { key: "about", label: "Nav — About" },
        { key: "industries", label: "Nav — Industries" },
        { key: "services", label: "Nav — Services" },
        { key: "skills", label: "Nav — Skills" },
        { key: "projects", label: "Nav — Projects" },
        { key: "faq", label: "Nav — FAQ" },
        { key: "contact", label: "Nav — Contact" }
      ],
      onSubmit: vals => saveMerged("nav", vals, "Navigation")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     SECTION HEADERS
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteSectionHeader = async function (sectionKey, sectionLabel) {
    const site = await loadSite();
    const s = site[sectionKey] || {};
    openFormModal({
      title: "Edit " + (sectionLabel || sectionKey) + " Header",
      icon: "fa-heading",
      initial: { subtitle: s.subtitle, heading: s.heading, desc: s.desc },
      fields: [
        { key: "subtitle", label: "Subtitle" },
        { key: "heading", label: "Heading", help: 'HTML allowed. Use <span class="highlight">…</span> for accent.' },
        { key: "desc", label: "Description", type: "textarea", rows: 3 }
      ],
      onSubmit: vals => saveMerged(sectionKey, vals, sectionLabel || sectionKey)
    });
  };

  // Short-hand helpers — one per section.
  const HEADER_SECTIONS = [
    ["ecosystem", "Ecosystem"], ["industries", "Industries"], ["services", "Services"],
    ["skills", "Skills"], ["projects", "Projects"], ["testimonials", "Testimonials"],
    ["blog", "Blog"], ["faq", "FAQ"], ["tech", "Tech"],
    ["stats", "Stats"], ["contact", "Contact"]
  ];
  for (const [key, label] of HEADER_SECTIONS) {
    const fnName = "editSite" + key.charAt(0).toUpperCase() + key.slice(1) + "Header";
    Viora[fnName] = () => Viora.editSiteSectionHeader(key, label);
  }
  // Aliases used elsewhere in the codebase.
  Viora.editSiteEcosystemHeader    = () => Viora.editSiteSectionHeader("ecosystem", "Ecosystem");
  Viora.editSiteIndustriesHeader   = () => Viora.editSiteSectionHeader("industries", "Industries");
  Viora.editSiteServicesHeader     = () => Viora.editSiteSectionHeader("services", "Services");
  Viora.editSiteSkillsHeader       = () => Viora.editSiteSectionHeader("skills", "Skills");
  Viora.editSiteProjectsHeader     = () => Viora.editSiteSectionHeader("projects", "Projects");
  Viora.editSiteTestimonialsHeader = () => Viora.editSiteSectionHeader("testimonials", "Testimonials");
  Viora.editSiteBlogHeader         = () => Viora.editSiteSectionHeader("blog", "Blog");
  Viora.editSiteFaqHeader          = () => Viora.editSiteSectionHeader("faq", "FAQ");
  Viora.editSiteTechHeader         = () => Viora.editSiteSectionHeader("tech", "Tech");
  Viora.editSiteStatsHeader        = () => Viora.editSiteSectionHeader("stats", "Stats");
  Viora.editSiteContactHeader      = () => Viora.editSiteSectionHeader("contact", "Contact");

  /* ═══════════════════════════════════════════════════════════
     ECOSYSTEM FLOW + CTA  (JSON editor, no prompt())
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteEcosystemFlow = async function () {
    const site = await loadSite();
    const steps = (site.ecosystem && site.ecosystem.steps) || [];
    openJsonModal({
      title: "Edit Ecosystem Flow Steps", icon: "fa-diagram-project",
      initial: steps,
      onSubmit: parsed => saveField("ecosystem/steps", parsed, "Ecosystem flow"),
      validate: v => {
        if (!Array.isArray(v)) return "Must be a JSON array.";
        for (let i = 0; i < v.length; i++) {
          const s = v[i];
          if (!s || typeof s !== "object") return `Item ${i} must be an object.`;
          if (typeof s.title !== "string" || !s.title.trim()) return `Item ${i} needs a "title" string.`;
        }
        return null;
      }
    });
  };

  Viora.editSiteEcosystemCta = async function () {
    const site = await loadSite();
    const eco = site.ecosystem || {};
    openFormModal({
      title: "Edit Ecosystem CTA Band", icon: "fa-bullseye",
      initial: { ctaHeading: eco.ctaHeading || "", ctaBody: eco.ctaBody || "" },
      fields: [
        { key: "ctaHeading", label: "CTA Heading", help: "HTML allowed." },
        { key: "ctaBody", label: "CTA Body", type: "textarea", rows: 3 }
      ],
      onSubmit: vals => saveMerged("ecosystem", vals, "Ecosystem CTA")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     COMPARISON
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteCompareRows = async function () {
    const site = await loadSite();
    const rows = (site.compare && site.compare.rows) || [];
    openJsonModal({
      title: "Edit Comparison Rows", icon: "fa-table-list",
      initial: rows,
      onSubmit: parsed => saveField("compare/rows", parsed, "Comparison rows"),
      validate: v => {
        if (!Array.isArray(v)) return "Must be a JSON array.";
        for (let i = 0; i < v.length; i++) {
          const r = v[i];
          if (!r || typeof r !== "object") return `Item ${i} must be an object.`;
          if (typeof r.capability !== "string") return `Item ${i} needs a "capability" string.`;
        }
        return null;
      }
    });
  };

  Viora.editSiteCompareColumns = async function () {
    const site = await loadSite();
    const c = site.compare || {};
    openFormModal({
      title: "Edit Comparison Column Headers", icon: "fa-table-columns",
      initial: {
        colCap: c.colCap || "Capability",
        colStandalone: c.colStandalone || "Standalone Stack",
        colEcosystem: c.colEcosystem || "Viora Ecosystem"
      },
      fields: [
        { key: "colCap", label: "Capability Column" },
        { key: "colStandalone", label: "Standalone Column" },
        { key: "colEcosystem", label: "Ecosystem Column" }
      ],
      onSubmit: vals => saveMerged("compare", vals, "Comparison columns")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     ARRAY SECTIONS
     ═══════════════════════════════════════════════════════════ */
  const SECTION_SCHEMAS = {
    services:     { label: "Service",          icon: "fa-briefcase",     fields: [
      { key: "icon", label: "Icon (FontAwesome)" },
      { key: "title", label: "Title", required: true },
      { key: "description", label: "Description", type: "textarea", rows: 3 }
    ]},
    skills:       { label: "Skill",            icon: "fa-code-branch",   fields: [
      { key: "name", label: "Name", required: true },
      { key: "icon", label: "Icon (FontAwesome)" },
      { key: "level", label: "Level (0–100)", type: "number", default: 80 }
    ]},
    projects:     { label: "Project",          icon: "fa-folder-open",   fields: [
      { key: "title", label: "Title", required: true },
      { key: "description", label: "Description", type: "textarea", rows: 3 },
      { key: "image", label: "Image URL" },
      { key: "tags", label: "Tags (comma-separated)" },
      { key: "link", label: "External Link" }
    ]},
    industries:   { label: "Industry",         icon: "fa-industry",      fields: [
      { key: "key", label: "Key (unique ID)", required: true },
      { key: "icon", label: "Icon (FontAwesome)" },
      { key: "title", label: "Title", required: true },
      { key: "tagline", label: "Tagline" },
      { key: "pain", label: "The Problem", type: "textarea", rows: 3 },
      { key: "features", label: "Features (one per line)", type: "textarea", rows: 5 }
    ]},
    blog:         { label: "Blog Post",        icon: "fa-newspaper",     fields: [
      { key: "tag", label: "Tag" },
      { key: "date", label: "Date" },
      { key: "title", label: "Title", required: true },
      { key: "excerpt", label: "Excerpt", type: "textarea", rows: 3 },
      { key: "read", label: "Read Time" }
    ]},
    faq:          { label: "FAQ",              icon: "fa-circle-question", fields: [
      { key: "q", label: "Question", required: true },
      { key: "a", label: "Answer", type: "textarea", rows: 4, required: true }
    ]},
    testimonials: { label: "Testimonial",      icon: "fa-quote-left",    fields: [
      { key: "name", label: "Name", required: true },
      { key: "role", label: "Role / Company" },
      { key: "text", label: "Quote", type: "textarea", rows: 4, required: true }
    ]},
    tech:         { label: "Tech Item",        icon: "fa-microchip",     fields: [
      { key: "name", label: "Name", required: true },
      { key: "icon", label: "Icon (FontAwesome)" }
    ]},
    stats:        { label: "Stats Banner Item", icon: "fa-chart-simple", fields: [
      { key: "icon", label: "Icon (FontAwesome)" },
      { key: "value", label: "Value", required: true },
      { key: "label", label: "Label", required: true }
    ]}
  };

  Viora.editSiteArrayItem = async function (section, index) {
    const schema = SECTION_SCHEMAS[section];
    if (!schema) { toast("Unknown section: " + section, "error"); return; }
    const site = await loadSite();
    const items = Array.isArray(site[section]?.items) ? site[section].items.slice() : [];
    const isNew = index < 0;
    const initial = isNew ? {} : Object.assign({}, items[index]);
    const prepared = prepareForForm(section, initial);

    openFormModal({
      title: isNew ? `New ${schema.label}` : `Edit ${schema.label}`,
      icon: schema.icon, initial: prepared,
      submitLabel: isNew ? "Add" : "Save",
      fields: schema.fields,
      onSubmit: async vals => {
        const final = normalizeFromForm(section, vals);
        const nextItems = items.slice();
        if (isNew) nextItems.push(final);
        else       nextItems[index] = Object.assign({}, items[index], final);
        await saveSection(section, Object.assign({}, site[section] || {}, { items: nextItems }), schema.label);
      }
    });
  };

  Viora.deleteSiteArrayItem = async function (section, index) {
    const schema = SECTION_SCHEMAS[section];
    if (!schema) return;
    if (!confirm(`Delete this ${schema.label.toLowerCase()}?`)) return;
    const site = await loadSite();
    const items = Array.isArray(site[section]?.items) ? site[section].items.slice() : [];
    items.splice(index, 1);
    await saveSection(section, Object.assign({}, site[section] || {}, { items }), schema.label + " delete");
  };

  /* ═══════════════════════════════════════════════════════════
     CONTACT LABELS
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteContactLabels = async function () {
    const site = await loadSite();
    const c = site.contact || {};
    openFormModal({
      title: "Edit Contact Section Labels", icon: "fa-address-card", initial: c,
      fields: [
        { key: "infoHeading", label: "Contact Info Heading" },
        { key: "formHeading", label: "Form Heading" },
        { key: "nameLabel", label: "Form — Name Label" },
        { key: "emailLabel", label: "Form — Email Label" },
        { key: "subjectLabel", label: "Form — Subject Label" },
        { key: "messageLabel", label: "Form — Message Label" },
        { key: "submitLabel", label: "Form — Submit Button" }
      ],
      onSubmit: vals => saveMerged("contact", vals, "Contact labels")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     MOBILE NAV LABELS
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteMobileNav = async function () {
    const site = await loadSite();
    const m = site.mobile || {};
    openFormModal({
      title: "Edit Mobile Bottom Nav Labels", icon: "fa-mobile-screen", initial: m,
      fields: [
        { key: "navHome", label: "Home" }, { key: "navEco", label: "Eco" },
        { key: "navInd", label: "Ind." }, { key: "navServ", label: "Serv." },
        { key: "navWork", label: "Work" }, { key: "navFaq", label: "FAQ" },
        { key: "navContact", label: "Contact" }
      ],
      onSubmit: vals => saveMerged("mobile", vals, "Mobile nav")
    });
  };

  /* ═══════════════════════════════════════════════════════════
     SEO
     ═══════════════════════════════════════════════════════════ */
  Viora.editSiteSeo = async function () {
    const site = await loadSite();
    const seo = site.seo || {};
    openFormModal({
      title: "Edit SEO & Social Preview", icon: "fa-magnifying-glass", initial: seo,
      fields: [
        { key: "title", label: "Page Title" },
        { key: "description", label: "Meta Description", type: "textarea", rows: 3 },
        { key: "ogImage", label: "OG Image URL" }
      ],
      onSubmit: vals => saveMerged("seo", vals, "SEO")
    });
  };

  console.log("[VIORA] Clientsite editor loaded (v7.2).");
})();
