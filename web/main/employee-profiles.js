/* ═══════════════════════════════════════════════════════════════
   VIORA — EMPLOYEE PROFILES EDITOR
   ═══════════════════════════════════════════════════════════════

   Admin editor for the per-employee profile pages (cliff.html, etc).
   Reads / writes: viora_data/orgs/viora/employeeProfiles/{slug}

   Public API:
     initEmployeeProfiles({ db, ref, set, get, P, state, toast, logActivity, escapeHtml, $ })
     renderEmployeeProfiles()  → renders the editor into #tab-employee-profiles

   Each profile is one entry under employeeProfiles/{slug}.
   The public page (cliff.html, jane.html, etc.) declares its slug
   in <head> and renders from that node.

   To publish a new employee, add their record here AND copy
   public.template.html → {slug}.html (changing the slug line).
   ═══════════════════════════════════════════════════════════════ */

let D = null;
let _currentSlug = null;

export function initEmployeeProfiles(deps) {
  D = deps;
}

/* ═══════════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════════ */
export function renderEmployeeProfiles() {
  const host = document.getElementById('tab-employee-profiles');
  if (!host) return;

  const profiles = D.state?.data?.employeeProfiles || {};
  const slugs = Object.keys(profiles).sort();

  host.innerHTML = `
    <div style="padding:24px;max-width:1100px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin:0 0 4px;font-size:22px;">Employee Profiles</h2>
          <p style="margin:0;color:var(--text-muted);font-size:.85rem;">Each employee has their own public page (cliff.html, jane.html, etc).</p>
        </div>
        <button type="button" class="btn btn-success" id="ep-new-btn">
          <i class="fa-solid fa-plus"></i> New employee
        </button>
      </div>

      <div id="ep-status" style="margin-bottom:16px;font-size:.85rem;min-height:20px;"></div>

      <div style="display:grid;grid-template-columns:280px 1fr;gap:20px;">

        <!-- LEFT — list -->
        <div style="background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);padding:12px;max-height:70vh;overflow-y:auto;">
          <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;">
            ${slugs.length} profile${slugs.length === 1 ? '' : 's'}
          </div>
          <div id="ep-list">
            ${slugs.length ? slugs.map(slug => {
              const p = profiles[slug] || {};
              const published = p.showOnTeam !== false;
              return `
                <button type="button" class="ep-list-item btn btn-outline btn-xs" data-slug="${escAttr(slug)}" style="width:100%;justify-content:flex-start;text-align:left;margin-bottom:6px;padding:10px 12px;">
                  <div style="display:flex;align-items:center;gap:10px;width:100%;">
                    <img src="${escAttr(p.avatar || 'https://viora.co.ke/viora.png')}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';"/>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escAttr(p.displayName || slug)}</div>
                      <div style="font-size:.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escAttr(p.title || '')}</div>
                    </div>
                    ${published ? '<i class="fa-solid fa-circle-check" style="color:var(--accent-green);font-size:.7rem;"></i>' : '<i class="fa-solid fa-eye-slash" style="color:var(--text-muted);font-size:.7rem;"></i>'}
                  </div>
                </button>
              `;
            }).join('') : '<p style="text-align:center;color:var(--text-muted);font-size:.82rem;padding:20px 0;">No profiles yet. Click <strong>New employee</strong> to create one.</p>'}
          </div>
        </div>

        <!-- RIGHT — editor -->
        <div id="ep-editor" style="background:var(--bg-elev-1);border-radius:12px;border:1px solid var(--border-color);padding:20px;">
          <div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
            <i class="fa-solid fa-user" style="font-size:40px;opacity:.3;margin-bottom:16px;display:block;"></i>
            <p>Select a profile from the list, or create a new one.</p>
          </div>
        </div>
      </div>

      <div style="margin-top:32px;padding:16px;background:rgba(34,103,238,.06);border-radius:10px;border:1px solid rgba(34,103,238,.2);font-size:.85rem;color:var(--text-muted);line-height:1.7;">
        <strong style="color:var(--accent-blue);">Publishing tip:</strong>
        After creating a profile here, copy <code style="color:var(--accent-blue);">public.template.html</code> → <code style="color:var(--accent-blue);">{slug}.html</code> and change the slug line in that file:
        <code style="display:block;padding:8px;background:var(--bg-card-solid);border-radius:6px;margin-top:8px;font-size:.78rem;">&lt;script&gt;window.__VIORA_PROFILE_SLUG__ = "your-slug";&lt;/script&gt;</code>
      </div>
    </div>
  `;

  /* Wire list items */
  host.querySelectorAll('[data-slug]').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentSlug = btn.dataset.slug;
      renderEditor(profiles[_currentSlug] || { slug: _currentSlug });
    });
  });

  /* Wire new button */
  document.getElementById('ep-new-btn')?.addEventListener('click', () => {
    _currentSlug = null;
    renderEditor({
      slug: '',
      displayName: '',
      title: '',
      tagline: '',
      bio: '',
      avatar: '',
      coverImage: '',
      location: '',
      joinedAt: '',
      availability: '',
      showOnTeam: true,
      order: 999,
      skills: [],
      languages: [],
      links: {},
      projects: [],
      testimonials: [],
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   EDITOR
   ═══════════════════════════════════════════════════════════════ */
function renderEditor(p) {
  const host = document.getElementById('ep-editor');
  if (!host) return;

  const isNew = !_currentSlug;

  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="margin:0;font-size:16px;">${isNew ? 'New employee' : `Editing: ${escAttr(p.displayName || _currentSlug)}`}</h3>
      ${!isNew ? `<button type="button" class="btn btn-danger btn-sm" id="ep-delete-btn"><i class="fa-solid fa-trash"></i> Delete</button>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${field('ep-slug', 'Slug (matches filename, no .html)', p.slug || '')}
      ${field('ep-displayName', 'Display name', p.displayName || '')}
      ${field('ep-title', 'Title', p.title || '')}
      ${field('ep-avatar', 'Avatar URL', p.avatar || '')}
      ${field('ep-coverImage', 'Cover image URL', p.coverImage || '')}
      ${field('ep-location', 'Location', p.location || '')}
      ${field('ep-joinedAt', 'Joined (ISO date)', p.joinedAt || '')}
      ${field('ep-order', 'Display order (lower = first)', String(p.order || 999))}
    </div>

    ${textarea('ep-tagline', 'Tagline', p.tagline || '')}
    ${textarea('ep-bio', 'Bio', p.bio || '')}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <label style="display:block;margin-bottom:12px;">
        <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">Availability</span>
        <select id="ep-availability" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;">
          <option value="" ${!p.availability ? 'selected' : ''}>— None —</option>
          <option value="available" ${p.availability === 'available' ? 'selected' : ''}>Available</option>
          <option value="busy" ${p.availability === 'busy' ? 'selected' : ''}>Busy</option>
          <option value="on-leave" ${p.availability === 'on-leave' ? 'selected' : ''}>On leave</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-top:24px;font-size:.85rem;">
        <input type="checkbox" id="ep-showOnTeam" ${p.showOnTeam !== false ? 'checked' : ''}/>
        Show on the about page team grid
      </label>
    </div>

    ${textarea('ep-skills', 'Skills (one per line)', (p.skills || []).join('\n'))}
    ${textarea('ep-languages', 'Languages (one per line)', (p.languages || []).join('\n'))}

    <h4 style="font-size:.82rem;margin:20px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Links</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      ${field('ep-link-email',    'Email',           p.links?.email || '')}
      ${field('ep-link-phone',    'Phone',           p.links?.phone || '')}
      ${field('ep-link-whatsapp', 'WhatsApp',        p.links?.whatsapp || '')}
      ${field('ep-link-linkedin', 'LinkedIn URL',    p.links?.linkedin || '')}
      ${field('ep-link-github',   'GitHub URL',      p.links?.github || '')}
      ${field('ep-link-twitter',  'Twitter/X URL',   p.links?.twitter || '')}
      ${field('ep-link-website',  'Website URL',     p.links?.website || '')}
    </div>

    <h4 style="font-size:.82rem;margin:20px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Projects</h4>
    <div id="ep-projects-list">
      ${(p.projects || []).map((proj, i) => `
        <div style="padding:12px;background:var(--bg-card-solid);border-radius:10px;margin-bottom:8px;border:1px solid var(--border-color);">
          <div style="display:grid;grid-template-columns:2fr 1fr 80px;gap:8px;margin-bottom:6px;">
            <input type="text" class="ep-proj-name" data-idx="${i}" value="${escAttr(proj.name || '')}" placeholder="Project name" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
            <input type="text" class="ep-proj-role" data-idx="${i}" value="${escAttr(proj.role || '')}" placeholder="Role" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
            <input type="number" class="ep-proj-year" data-idx="${i}" value="${escAttr(proj.year || '')}" placeholder="Year" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 40px;gap:8px;">
            <input type="text" class="ep-proj-desc" data-idx="${i}" value="${escAttr(proj.description || '')}" placeholder="Description" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
            <input type="url" class="ep-proj-link" data-idx="${i}" value="${escAttr(proj.link || '')}" placeholder="Link" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
            <button type="button" class="btn btn-danger btn-xs" data-del-proj="${i}">×</button>
          </div>
        </div>
      `).join('')}
      <button type="button" class="btn btn-outline btn-xs" id="ep-add-project">+ Add project</button>
    </div>

    <h4 style="font-size:.82rem;margin:20px 0 10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Testimonials</h4>
    <div id="ep-testi-list">
      ${(p.testimonials || []).map((t, i) => `
        <div style="padding:12px;background:var(--bg-card-solid);border-radius:10px;margin-bottom:8px;border:1px solid var(--border-color);">
          <div style="display:grid;grid-template-columns:1fr 1fr 40px;gap:8px;margin-bottom:6px;">
            <input type="text" class="ep-testi-from" data-idx="${i}" value="${escAttr(t.from || '')}" placeholder="From (name)" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
            <input type="text" class="ep-testi-role" data-idx="${i}" value="${escAttr(t.role || '')}" placeholder="Role / company" style="padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;"/>
            <button type="button" class="btn btn-danger btn-xs" data-del-testi="${i}">×</button>
          </div>
          <textarea class="ep-testi-text" data-idx="${i}" rows="2" placeholder="Text" style="width:100%;padding:8px;border-radius:6px;background:var(--bg-elev-2);border:1px solid var(--border-color);color:var(--text-primary);font-size:.82rem;resize:vertical;">${escAttr(t.text || '')}</textarea>
        </div>
      `).join('')}
      <button type="button" class="btn btn-outline btn-xs" id="ep-add-testi">+ Add testimonial</button>
    </div>

    <div style="margin-top:24px;display:flex;gap:8px;justify-content:flex-end;">
      <button type="button" class="btn btn-success" id="ep-save-btn">
        <i class="fa-solid fa-check"></i> ${isNew ? 'Create profile' : 'Save changes'}
      </button>
    </div>
  `;

  /* Add project */
  document.getElementById('ep-add-project')?.addEventListener('click', () => {
    p.projects = p.projects || [];
    p.projects.push({ name: '', role: '', year: '', description: '', link: '' });
    renderEditor(p);
  });

  /* Delete project */
  host.querySelectorAll('[data-del-proj]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.delProj);
      p.projects = (p.projects || []).filter((_, i) => i !== idx);
      renderEditor(p);
    });
  });

  /* Add testimonial */
  document.getElementById('ep-add-testi')?.addEventListener('click', () => {
    p.testimonials = p.testimonials || [];
    p.testimonials.push({ text: '', from: '', role: '' });
    renderEditor(p);
  });

  /* Delete testimonial */
  host.querySelectorAll('[data-del-testi]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.delTesti);
      p.testimonials = (p.testimonials || []).filter((_, i) => i !== idx);
      renderEditor(p);
    });
  });

  /* Delete profile */
  document.getElementById('ep-delete-btn')?.addEventListener('click', async () => {
    if (!_currentSlug) return;
    if (!confirm(`Delete profile "${_currentSlug}"? The public page (${_currentSlug}.html) will remain but show "not found".`)) return;
    try {
      await D.set(D.ref(D.db, D.P(`employeeProfiles/${_currentSlug}`)), null);
      if (D.state.data.employeeProfiles) delete D.state.data.employeeProfiles[_currentSlug];
      D.toast?.('Profile deleted.', 'success');
      _currentSlug = null;
      renderEmployeeProfiles();
    } catch (err) {
      D.toast?.('Delete failed: ' + err.message, 'error');
    }
  });

  /* Save */
  document.getElementById('ep-save-btn')?.addEventListener('click', () => saveProfile(p, isNew));
}

/* ═══════════════════════════════════════════════════════════════
   SAVE PROFILE
   ═══════════════════════════════════════════════════════════════ */
async function saveProfile(p, isNew) {
  const statusEl = document.getElementById('ep-status');
  const btn = document.getElementById('ep-save-btn');

  const slug = getVal('ep-slug').toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (!slug) {
    if (statusEl) { statusEl.textContent = 'Slug is required (lowercase, no spaces).'; statusEl.style.color = 'var(--accent-red)'; }
    return;
  }
  if (!getVal('ep-displayName')) {
    if (statusEl) { statusEl.textContent = 'Display name is required.'; statusEl.style.color = 'var(--accent-red)'; }
    return;
  }
  if (isNew && D.state.data.employeeProfiles && D.state.data.employeeProfiles[slug]) {
    if (statusEl) { statusEl.textContent = `Slug "${slug}" already exists.`; statusEl.style.color = 'var(--accent-red)'; }
    return;
  }

  const projects = [];
  document.querySelectorAll('.ep-proj-name').forEach(inp => {
    const idx = Number(inp.dataset.idx);
    const roleInp = document.querySelector(`.ep-proj-role[data-idx="${idx}"]`);
    const yearInp = document.querySelector(`.ep-proj-year[data-idx="${idx}"]`);
    const descInp = document.querySelector(`.ep-proj-desc[data-idx="${idx}"]`);
    const linkInp = document.querySelector(`.ep-proj-link[data-idx="${idx}"]`);
    if (inp.value.trim()) {
      projects.push({
        name: inp.value.trim(),
        role: roleInp?.value.trim() || '',
        year: Number(yearInp?.value) || null,
        description: descInp?.value.trim() || '',
        link: linkInp?.value.trim() || '',
      });
    }
  });

  const testimonials = [];
  document.querySelectorAll('.ep-testi-from').forEach(inp => {
    const idx = Number(inp.dataset.idx);
    const roleInp = document.querySelector(`.ep-testi-role[data-idx="${idx}"]`);
    const textInp = document.querySelector(`.ep-testi-text[data-idx="${idx}"]`);
    if (textInp?.value.trim()) {
      testimonials.push({
        from: inp.value.trim() || 'Anonymous',
        role: roleInp?.value.trim() || '',
        text: textInp.value.trim(),
      });
    }
  });

  const payload = {
    slug,
    displayName: getVal('ep-displayName'),
    title: getVal('ep-title'),
    tagline: getVal('ep-tagline'),
    bio: getVal('ep-bio'),
    avatar: getVal('ep-avatar'),
    coverImage: getVal('ep-coverImage'),
    location: getVal('ep-location'),
    joinedAt: getVal('ep-joinedAt'),
    availability: getVal('ep-availability'),
    showOnTeam: !!document.getElementById('ep-showOnTeam')?.checked,
    order: Number(getVal('ep-order')) || 999,
    skills: lines(getVal('ep-skills')),
    languages: lines(getVal('ep-languages')),
    links: {
      email: getVal('ep-link-email'),
      phone: getVal('ep-link-phone'),
      whatsapp: getVal('ep-link-whatsapp'),
      linkedin: getVal('ep-link-linkedin'),
      github: getVal('ep-link-github'),
      twitter: getVal('ep-link-twitter'),
      website: getVal('ep-link-website'),
    },
    projects,
    testimonials,
    updatedAt: new Date().toISOString(),
  };

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

  try {
    await D.set(D.ref(D.db, D.P(`employeeProfiles/${slug}`)), payload);
    if (!D.state.data.employeeProfiles) D.state.data.employeeProfiles = {};
    D.state.data.employeeProfiles[slug] = payload;
    _currentSlug = slug;
    if (statusEl) { statusEl.textContent = `✓ Saved. Public page: ${slug}.html`; statusEl.style.color = 'var(--accent-green)'; }
    D.toast?.('Profile saved.', 'success');
    D.logActivity?.('edit', `Employee profile updated: ${slug}`, 'employeeProfiles');
    renderEmployeeProfiles();
  } catch (err) {
    if (statusEl) { statusEl.textContent = '✗ ' + err.message; statusEl.style.color = 'var(--accent-red)'; }
    D.toast?.('Save failed: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Save'; }
  }
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function field(id, label, value) {
  return `
    <label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <input type="text" id="${id}" value="${escAttr(value)}" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;"/>
    </label>
  `;
}

function textarea(id, label, value) {
  return `
    <label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;">${label}</span>
      <textarea id="${id}" rows="3" style="width:100%;padding:9px 12px;border-radius:8px;background:var(--bg-card-solid);border:1px solid var(--border-color);color:var(--text-primary);font-size:.85rem;font-family:inherit;resize:vertical;">${escAttr(value)}</textarea>
    </label>
  `;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

function lines(str) {
  return String(str || '').split('\n').map(s => s.trim()).filter(Boolean);
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default { initEmployeeProfiles, renderEmployeeProfiles };
