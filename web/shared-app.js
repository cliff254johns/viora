/* ============================================================
   VIORA SHARED APP RUNTIME v1.0
   Every public page includes this file.
   ============================================================ */
(function () {
  'use strict';

  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  /* ============================================================
     1. THEME
     ============================================================ */
  const rootEl = document.documentElement;
  const savedTheme = localStorage.getItem('viora-theme') || localStorage.getItem('viora_theme') || 'dark';
  if (savedTheme === 'dark' || savedTheme === 'light') {
    rootEl.setAttribute('data-theme', savedTheme);
  }

  function applyTheme(theme) {
    if (theme === 'dark') rootEl.setAttribute('data-theme', 'dark');
    else rootEl.removeAttribute('data-theme');
    localStorage.setItem('viora-theme', theme);
    try { localStorage.setItem('viora_theme', theme); } catch (_) {}
    syncThemeMeta(theme);
  }

  function syncThemeMeta(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0B1120' : '#0A192F');
  }

  if (!rootEl.getAttribute('data-theme')) rootEl.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'dark');
  syncThemeMeta(rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const isDark = rootEl.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark');
  });

  /* ============================================================
     2. ANIMATED NETWORK CANVAS
     ============================================================ */
  const canvas = document.getElementById('globalNetwork');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const particles = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resizeCanvas() {
      W = canvas.width = window.innerWidth * dpr;
      H = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    }

    function seedParticles() {
      particles.length = 0;
      const count = window.innerWidth < 768 ? 55 : 110;
      const w = window.innerWidth, h = window.innerHeight;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.8 + 0.6
        });
      }
    }

    resizeCanvas();
    seedParticles();
    window.addEventListener('resize', () => {
      resizeCanvas();
      seedParticles();
    });

    function draw() {
      if (!ctx) return;
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const isDark = rootEl.getAttribute('data-theme') === 'dark';
      const dotColor  = isDark ? 'rgba(200,225,255,0.55)' : 'rgba(10,25,47,0.42)';
      const lineColor = isDark ? 'rgba(120,180,255,0.22)' : 'rgba(34,103,238,0.18)';
      const connectDist = window.innerWidth < 768 ? 120 : 170;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!prefersReduce) {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        ctx.beginPath();
        ctx.fillStyle = dotColor;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x, dy = p.y - p2.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < connectDist) {
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 0.6 + (1 - dist/connectDist) * 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p.y === p2.y ? p.y : p2.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
      if (!prefersReduce) requestAnimationFrame(draw);
    }
    draw();
  }

  /* ============================================================
     3. NAV SCROLL
     ============================================================ */
  const nav = document.getElementById('nav');
  if (nav) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        nav.classList.toggle('scrolled', window.scrollY > 20);
        ticking = false;
      });
    }, { passive: true });
  }

  /* ============================================================
     4. MOBILE DRAWER
     ============================================================ */
  const burger = document.getElementById('burger');
  const drawer = document.getElementById('drawer');
  if (burger && drawer) {
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
      drawer.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('drawer-open', open);
    });
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        drawer.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('drawer-open');
      }
    });
  }

  /* ============================================================
     5. REVEAL ANIMATIONS
     ============================================================ */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  $$('.reveal, .reveal-stagger').forEach(el => io.observe(el));

  /* ============================================================
     6. CAROUSEL ENGINE
     ============================================================ */
  function initCarousels() {
    $$('[data-carousel]').forEach((wrap) => {
      const track = wrap.querySelector('.carousel-track');
      if (!track) return;

      /* Duplicate content for seamless loop */
      const children = [...track.children];
      if (!wrap.dataset.noDup) {
        children.forEach(c => {
          const clone = c.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          track.appendChild(clone);
        });
      }

      /* Pause toggle */
      let paused = false;
      const pauseBtn = wrap.querySelector('.carousel-pause') || (() => {
        const b = document.createElement('button');
        b.className = 'carousel-pause';
        b.type = 'button';
        b.setAttribute('aria-label', 'Pause carousel');
        b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
        wrap.appendChild(b);
        return b;
      })();

      function setPaused(p) {
        paused = p;
        track.classList.toggle('paused', p);
        pauseBtn.innerHTML = p
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
        pauseBtn.setAttribute('aria-label', p ? 'Resume carousel' : 'Pause carousel');
      }
      pauseBtn.addEventListener('click', () => setPaused(!paused));

      /* Manual scroll buttons */
      const prevBtn = wrap.querySelector('[data-carousel-prev]');
      const nextBtn = wrap.querySelector('[data-carousel-next]');
      if (prevBtn && nextBtn) {
        const step = 320;
        prevBtn.addEventListener('click', () => {
          setPaused(true);
          wrap.scrollBy({ left: -step, behavior: 'smooth' });
        });
        nextBtn.addEventListener('click', () => {
          setPaused(true);
          wrap.scrollBy({ left: step, behavior: 'smooth' });
        });
        wrap.style.overflowX = 'auto';
        wrap.style.scrollBehavior = 'smooth';
        wrap.style.scrollbarWidth = 'thin';
      }
    });
  }
  initCarousels();

  /* ============================================================
     7. MODAL ENGINE
     ============================================================ */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    document.body.classList.add('modal-open');
    const closeBtn = modal.querySelector('.mp-close');
    if (closeBtn) closeBtn.focus();
  }
  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-modal-open]');
    if (opener) {
      e.preventDefault();
      const id = opener.dataset.modalOpen;
      openModal(id);
      /* Populate if data-modal-content */
      const content = opener.dataset.modalContent;
      if (content) {
        try {
          const data = JSON.parse(decodeURIComponent(content));
          const target = document.querySelector(`#${id} [data-modal-target]`);
          if (target) {
            target.innerHTML = `
              <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
                <div class="v-icon ${data.iconClass || 'blue'}" style="margin:0">${data.iconSvg || ''}</div>
                <div>
                  <h2 style="margin:0 0 4px">${data.title}</h2>
                  <span style="font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:700">${data.tag || ''}</span>
                </div>
              </div>
              <p style="font-size:15px;color:var(--muted);line-height:1.75">${data.desc}</p>
              ${data.features ? `
                <div style="margin-top:24px">
                  <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:12px">What's included</h4>
                  <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:10px">${data.features.map(f => `
                    <li style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:8px;font-size:14px">
                      <span style="width:18px;height:18px;border-radius:50%;background:var(--accent);display:grid;place-items:center;flex-shrink:0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                      </span>
                      ${f}
                    </li>`).join('')}
                  </ul>
                </div>` : ''}
              <div style="margin-top:32px;display:flex;gap:12px;flex-wrap:wrap">
                <a href="contact_us.html" class="btn btn-primary">Book a demo →</a>
                <button type="button" class="btn btn-ghost" data-modal-close="${id}">Close</button>
              </div>
            `;
          }
        } catch (err) { /* ignore */ }
      }
    }
    const closer = e.target.closest('[data-modal-close]');
    if (closer) closeModal(closer.dataset.modalClose);
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal-overlay.open').forEach(m => closeModal(m.id));
    }
  });

  /* ============================================================
     8. FILTER CHIPS
     ============================================================ */
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter-chip]');
    if (!chip) return;
    const group = chip.closest('[data-filter-group]');
    if (!group) return;
    const targetId = group.dataset.filterGroup;
    const filter = chip.dataset.filterChip;

    $$(`[data-filter-chip][data-filter-group-id="${targetId}"]`).forEach(c => {
      c.setAttribute('aria-pressed', 'false');
      c.classList.remove('active');
    });
    chip.setAttribute('aria-pressed', 'true');
    chip.classList.add('active');

    const grid = document.getElementById(targetId);
    if (!grid) return;
    $$('[data-category]', grid).forEach(card => {
      const show = filter === 'all' || card.dataset.category.split(' ').includes(filter);
      card.style.display = show ? '' : 'none';
      if (show) {
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = 'cardIn .4s cubic-bezier(.34,1.56,.64,1)';
      }
    });
  });

  /* ============================================================
     9. SMOOTH SCROLL FOR HASH LINKS
     ============================================================ */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: prefersReduce ? 'auto' : 'smooth' });
  });

  /* ============================================================
     10. YEAR
     ============================================================ */
  const yrEl = document.getElementById('yr');
  if (yrEl) yrEl.textContent = new Date().getFullYear();

  /* ============================================================
     11. CSS INJECTION (cardIn animation)
     ============================================================ */
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes cardIn {
      from { opacity:0; transform: translateY(12px) scale(.98); }
      to   { opacity:1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(styleEl);

})();

/* ============================================================
   12. PORTAL URL HASH ROUTING
   Ensures #signin / #signup bookmarks work on both portals.
   Only runs if the page has .login-tabs (i.e., a portal page).
   ============================================================ */
(function () {
  const tabs = document.querySelectorAll('.login-tabs button');
  if (!tabs.length) return;

  const hash = (location.hash || '').toLowerCase();
  if (hash === '#signup' || hash === '#register') {
    const signupTab = document.querySelector('.login-tabs button[data-flow="signup"]');
    if (signupTab) setTimeout(() => signupTab.click(), 150);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const flow = tab.getAttribute('data-flow');
      if (flow === 'signin') {
        try { history.replaceState(null, '', '#signin'); } catch (e) {}
      } else if (flow === 'signup') {
        try { history.replaceState(null, '', '#signup'); } catch (e) {}
      }
    });
  });
})();
