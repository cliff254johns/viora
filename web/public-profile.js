/* ═══════════════════════════════════════════════════════════════
   VIORA — PUBLIC PROFILE RENDERER
   ═══════════════════════════════════════════════════════════════

   Used by every employee page (cliff.html, jane.html, etc.).
   Each page declares its slug in <head>:
     <script>window.__VIORA_PROFILE_SLUG__ = "cliff";</script>

   Reads from: viora_data/orgs/viora/employeeProfiles/{slug}
   Renders into: #profile-root

   If slug missing or not found → renders #profile-not-found template.
   ═══════════════════════════════════════════════════════════════ */

const FIREBASE_VERSION = '10.12.5';
const FB_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC9gCBt-xR8t9n6rTGNvDZ5usUGiW-Dqxc",
  authDomain: "cliffclient-35ec5.firebaseapp.com",
  databaseURL: "https://cliffclient-35ec5-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cliffclient-35ec5",
  storageBucket: "cliffclient-35ec5.firebasestorage.app",
  messagingSenderId: "519782791696",
  appId: "1:519782791696:web:6e1a654ddeed14b72b2895",
};

const ROOT = 'viora_data/orgs/viora';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function loadFirebase() {
  const [appMod, dbMod] = await Promise.all([
    import(`${FB_CDN}/firebase-app.js`),
    import(`${FB_CDN}/firebase-database.js`),
  ]);
  let app;
  try { app = appMod.getApp(); } catch (_) { app = appMod.initializeApp(FIREBASE_CONFIG); }
  const db = dbMod.getDatabase(app);
  return { app, db, ref: dbMod.ref, get: dbMod.get };
}

async function boot() {
  const root = document.getElementById('profile-root');
  if (!root) return;

  const slug = (window.__VIORA_PROFILE_SLUG__ || '').toString().trim().toLowerCase();
  if (!slug) {
    renderNotFound(root);
    return;
  }

  let profile = null;
  try {
    const fb = await loadFirebase();
    const snap = await fb.get(fb.ref(fb.db, `${ROOT}/employeeProfiles/${slug}`));
    if (snap.exists()) {
      profile = snap.val();
    }
  } catch (err) {
    console.error('[profile] load failed:', err);
  }

  if (!profile) {
    renderNotFound(root);
    return;
  }

  renderProfile(root, profile);
  updateMeta(profile);
}

function renderProfile(root, p) {
  const name = p.displayName || 'Team member';
  const title = p.title || '';
  const tagline = p.tagline || '';
  const avatar = p.avatar || '';
  const cover = p.coverImage || '';
  const bio = p.bio || '';
  const skills = Array.isArray(p.skills) ? p.skills.filter(Boolean) : [];
  const languages = Array.isArray(p.languages) ? p.languages.filter(Boolean) : [];
  const location = p.location || '';
  const joinedAt = p.joinedAt || '';
  const links = p.links || {};
  const projects = Array.isArray(p.projects) ? p.projects.filter(x => x && x.name) : [];
  const testimonials = Array.isArray(p.testimonials) ? p.testimonials.filter(x => x && x.text) : [];
  const availability = p.availability || '';

  const initials = name.split(' ').map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();

  const availabilityLabel = {
    'available': 'Available',
    'busy': 'Busy',
    'on-leave': 'On leave',
  }[availability] || '';

  const joinedFormatted = formatJoined(joinedAt);

  /* Social links */
  const socialLinks = [];
  if (links.email)    socialLinks.push(`<a href="mailto:${esc(links.email)}" class="profile-social email" title="Email"><i class="fa-solid fa-envelope"></i></a>`);
  if (links.whatsapp) socialLinks.push(`<a href="https://wa.me/${esc(links.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener" class="profile-social whatsapp" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>`);
  if (links.linkedin) socialLinks.push(`<a href="${esc(links.linkedin)}" target="_blank" rel="noopener" class="profile-social linkedin" title="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>`);
  if (links.github)   socialLinks.push(`<a href="${esc(links.github)}" target="_blank" rel="noopener" class="profile-social github" title="GitHub"><i class="fa-brands fa-github"></i></a>`);
  if (links.twitter)  socialLinks.push(`<a href="${esc(links.twitter)}" target="_blank" rel="noopener" class="profile-social twitter" title="Twitter"><i class="fa-brands fa-twitter"></i></a>`);
  if (links.website)  socialLinks.push(`<a href="${esc(links.website)}" target="_blank" rel="noopener" class="profile-social" title="Website"><i class="fa-solid fa-globe"></i></a>`);

  /* Meta line items */
  const metaItems = [];
  if (location)   metaItems.push(`<span class="profile-meta-item"><i class="fa-solid fa-location-dot"></i> ${esc(location)}</span>`);
  if (joinedFormatted) metaItems.push(`<span class="profile-meta-item"><i class="fa-solid fa-calendar"></i> Joined ${esc(joinedFormatted)}</span>`);
  if (languages.length) metaItems.push(`<span class="profile-meta-item"><i class="fa-solid fa-language"></i> ${esc(languages.join(', '))}</span>`);

  /* Projects */
  const projectsHTML = projects.map(pr => `
    <article class="profile-project">
      <div class="profile-project-head">
        <h3 class="profile-project-name">${esc(pr.name || '')}</h3>
        ${pr.year ? `<span class="profile-project-year">${esc(String(pr.year))}</span>` : ''}
      </div>
      ${pr.role ? `<p class="profile-project-role">${esc(pr.role)}</p>` : ''}
      ${pr.description ? `<p class="profile-project-desc">${esc(pr.description)}</p>` : ''}
      ${pr.link ? `<a href="${esc(pr.link)}" class="profile-project-link" target="_blank" rel="noopener">View project <i class="fa-solid fa-arrow-right"></i></a>` : ''}
    </article>
  `).join('');

  /* Testimonials */
  const testimonialsHTML = testimonials.map(t => `
    <figure class="profile-testimonial">
      <p class="profile-testimonial-text">${esc(t.text || '')}</p>
      <figcaption class="profile-testimonial-from">
        <strong>${esc(t.from || 'Client')}</strong>${t.role ? ` · ${esc(t.role)}` : ''}
      </figcaption>
    </figure>
  `).join('');

  /* Assemble */
  const html = `
    <section class="profile-hero">
      <div class="profile-cover">
        ${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : ''}
      </div>
      <div class="profile-cover-inner">
        <div class="profile-avatar">
          ${avatar ? `<img src="${esc(avatar)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.parentNode.textContent='${initials}';">` : initials}
          ${availabilityLabel ? `<span class="profile-availability ${esc(availability)}">${esc(availabilityLabel)}</span>` : ''}
        </div>
      </div>
      <div class="wrap">
        <div class="profile-header">
          <div class="profile-header-text">
            <h1>${esc(name)}</h1>
            ${title ? `<p class="profile-title">${esc(title)}</p>` : ''}
            ${tagline ? `<p class="profile-tagline">${esc(tagline)}</p>` : ''}
            ${metaItems.length ? `<div class="profile-meta">${metaItems.join('')}</div>` : ''}
            ${socialLinks.length ? `<div class="profile-socials">${socialLinks.join('')}</div>` : ''}
          </div>
          <div class="profile-contact-ctas">
            <a href="contact_us.html?ref=${esc(p.slug || '')}" class="btn btn-primary">Work with ${esc(name.split(' ')[0])} →</a>
            ${links.whatsapp ? `<a href="https://wa.me/${esc(links.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener" class="btn btn-ghost">WhatsApp</a>` : ''}
          </div>
        </div>
      </div>
    </section>

    ${bio ? `
      <section class="profile-section">
        <div class="profile-section-inner">
          <h2>About</h2>
          <p class="profile-bio">${esc(bio)}</p>
        </div>
      </section>
    ` : ''}

    ${skills.length ? `
      <section class="profile-section">
        <div class="profile-section-inner">
          <h2>Skills</h2>
          <div class="profile-skills">
            ${skills.map(s => `<span class="profile-skill">${esc(s)}</span>`).join('')}
          </div>
        </div>
      </section>
    ` : ''}

    ${projects.length ? `
      <section class="profile-section">
        <div class="profile-section-inner">
          <h2>Projects</h2>
          <div class="profile-projects">
            ${projectsHTML}
          </div>
        </div>
      </section>
    ` : ''}

    ${testimonials.length ? `
      <section class="profile-section">
        <div class="profile-section-inner">
          <h2>What clients say</h2>
          <div class="profile-testimonials">
            ${testimonialsHTML}
          </div>
        </div>
      </section>
    ` : ''}

    <section class="profile-contact-cta">
      <div class="profile-section-inner">
        <h2>Want to work with ${esc(name.split(' ')[0])}?</h2>
        <p>${esc(name.split(' ')[0])} is part of the VIORA team. Send us a message and we'll connect you.</p>
        <div class="profile-contact-cta-actions">
          <a href="contact_us.html?ref=${esc(p.slug || '')}" class="btn btn-primary btn-lg">Get in touch →</a>
          <a href="about.html#team" class="btn btn-ghost btn-lg">Meet the rest of the team</a>
        </div>
      </div>
    </section>
  `;

  root.innerHTML = html;
}

function formatJoined(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

function updateMeta(p) {
  const name = p.displayName || 'Team member';
  const title = p.title || '';
  const desc = p.tagline || p.bio || '';
  const avatar = p.avatar || 'https://viora.co.ke/viora.png';

  document.title = `${name}${title ? ' — ' + title : ''} · VIORA Ecosystems`;

  const setMeta = (attr, name, content) => {
    if (!content) return;
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  setMeta('name', 'description', desc);
  setMeta('property', 'og:title', `${name} · VIORA Ecosystems`);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:image', avatar);
  setMeta('property', 'og:type', 'profile');
  const canonicalUrl = window.location.origin + window.location.pathname.replace(/\\.html$/i, '');
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('name', 'twitter:card', 'summary');
  setMeta('name', 'twitter:title', `${name} · VIORA Ecosystems`);
  setMeta('name', 'twitter:description', desc);
  setMeta('name', 'twitter:image', avatar);
}

function renderNotFound(root) {
  const tpl = document.getElementById('profile-not-found');
  if (tpl && tpl.content) {
    root.innerHTML = '';
    root.appendChild(tpl.content.cloneNode(true));
  } else {
    root.innerHTML = `
      <section style="padding:160px 0 100px;text-align:center;">
        <div class="wrap" style="max-width:560px;">
          <h1 style="font-size:40px;margin-bottom:16px;">Profile not found</h1>
          <p style="color:var(--muted);margin-bottom:32px;">That profile doesn't exist or has been unpublished.</p>
          <a href="about.html#team" class="btn btn-primary btn-lg">See the whole team →</a>
        </div>
      </section>
    `;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}