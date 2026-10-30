/* ═══════════════════════════════════════════════════════════
   hero-terminator.js — day/night sky gradient
   v2.1 — Forced Blue Day, Deep Dark Night
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const REDRAW_INTERVAL_MS = 8000;
  const DPR_CAP            = 2;

  const state = {
    canvas: null,
    ctx: null,
    dpr: 1,
    w: 0,
    h: 0,

    location: null,
    sky: null,

    phase: 0,
      sunAz: 180,
    sunElev: 0,
    moonAz: 180,
    moonElev: 0,
    moonAlpha: 0,
    weatherCode: 0,
    cloudCover: 0,

    lastRenderAt: 0,
    rafScheduled: false,
    redrawTimer: null,

    bound: false,
    destroyed: false,
    reducedMotion: false
  };

  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    state.reducedMotion = mq.matches;
    if (mq.addEventListener) {
      mq.addEventListener('change', () => { state.reducedMotion = mq.matches; });
    } else if (mq.addListener) {
      mq.addListener(() => { state.reducedMotion = mq.matches; });
    }
  } catch (_) {}

  function ensureCanvas() {
    if (state.canvas && document.body.contains(state.canvas)) return state.canvas;

    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return null;

    let canvas = document.getElementById('vioraHeroTerminatorCanvas');
    if (canvas) {
      state.canvas = canvas;
      state.ctx = canvas.getContext('2d', { alpha: true });
      return canvas;
    }

    canvas = document.createElement('canvas');
    canvas.id = 'vioraHeroTerminatorCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = [
      'position:absolute', 'inset:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:1'
    ].join(';');

    const skyCanvas = document.getElementById('vioraHeroSkyCanvas');
    if (skyCanvas && skyCanvas.parentNode === banner) {
      banner.insertBefore(canvas, skyCanvas.nextSibling);
    } else {
      banner.insertBefore(canvas, banner.firstChild);
    }

    state.canvas = canvas;
    state.ctx = canvas.getContext('2d', { alpha: true });
    return canvas;
  }

  function resizeBackingStore() {
    if (!state.canvas) return false;
    const rect = state.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const wantW = Math.round(rect.width * dpr);
    const wantH = Math.round(rect.height * dpr);

    if (state.canvas.width !== wantW || state.canvas.height !== wantH) {
      state.canvas.width = wantW;
      state.canvas.height = wantH;
    }
    state.dpr = dpr;
    state.w = rect.width;
    state.h = rect.height;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /* ─────────────────────────────────────────────────────────
     Render Sky
     ───────────────────────────────────────────────────────── */
  function lerpRGB(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  function skyPalette(sunElev, cloudCover) {
    // cloudCover is 0..100. Overcast greys out the sky.
    const cloud = Math.max(0, Math.min(1, (cloudCover || 0) / 100));

    let top, mid, bottom;
    if (sunElev >= 6) {
      // Full daylight — Rayleigh blue
      top    = [45, 110, 210];
      mid    = [80, 150, 230];
      bottom = [180, 210, 245];
    } else if (sunElev > -6) {
      // Twilight — warm horizon, cool zenith. t: 0 at -6°, 1 at +6°
      const t = (sunElev + 6) / 12;
      top    = lerpRGB([20, 25, 70],  [45, 110, 210], t);
      mid    = lerpRGB([150, 80, 90], [80, 150, 230], t);
      bottom = lerpRGB([255, 170, 100], [180, 210, 245], t);
    } else if (sunElev > -12) {
      // Nautical twilight — deep blue with faint horizon warmth
      const t = (sunElev + 12) / 6;
      top    = lerpRGB([4, 8, 22],   [20, 25, 70], t);
      mid    = lerpRGB([8, 14, 32],  [150, 80, 90], t);
      bottom = lerpRGB([18, 22, 48], [255, 170, 100], t);
    } else {
      // Night — near-black with a hint of blue
      top    = [3, 6, 18];
      mid    = [10, 15, 30];
      bottom = [15, 20, 40];
    }

    if (cloud > 0.15 && sunElev > -6) {
      const grey = [140, 150, 165];
      const k = Math.min(1, (cloud - 0.15) / 0.85) * 0.85;
      top    = lerpRGB(top,    grey, k);
      mid    = lerpRGB(mid,    grey, k * 0.85);
      bottom = lerpRGB(bottom, [190, 200, 210], k * 0.7);
    }

    return { top, mid, bottom };
  }

  function render() {
    state.rafScheduled = false;
    if (state.destroyed) return;
    if (!ensureCanvas()) return;
    if (!resizeBackingStore()) return;

    const ctx = state.ctx;
    const w = state.w;
    const h = state.h;
    if (w < 2 || h < 2) return;

    ctx.clearRect(0, 0, w, h);

    const sunElev = Number.isFinite(state.sunElev) ? state.sunElev : 0;
    const sunAz   = Number.isFinite(state.sunAz)   ? state.sunAz   : 180;
    const cloud   = Number.isFinite(state.cloudCover) ? state.cloudCover : 0;

    const pal = skyPalette(sunElev, cloud);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,    `rgb(${pal.top[0]},${pal.top[1]},${pal.top[2]})`);
    grad.addColorStop(0.6,  `rgb(${pal.mid[0]},${pal.mid[1]},${pal.mid[2]})`);
    grad.addColorStop(1,    `rgb(${pal.bottom[0]},${pal.bottom[1]},${pal.bottom[2]})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Horizon glow that follows the real sun azimuth during sunrise/sunset
    if (Math.abs(sunElev) < 15 && cloud < 95) {
      const glowX = (sunAz / 360) * w;
      const intensity = 1 - Math.min(1, Math.abs(sunElev) / 15);
      const warmth = Math.max(0, 1 - cloud / 100);
      const glow = ctx.createRadialGradient(glowX, h, 0, glowX, h, w * 0.7);
      glow.addColorStop(0, `rgba(255, 175, 90, ${0.4 * intensity * warmth})`);
      glow.addColorStop(0.5, `rgba(255, 140, 80, ${0.15 * intensity * warmth})`);
      glow.addColorStop(1, 'rgba(255, 140, 80, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }

    const banner = document.getElementById('vioraHeroBanner');
    if (banner) {
      banner.style.setProperty('--hero-terminator-opacity', '1.0');
    }
  }

  function scheduleRender() {
    if (state.rafScheduled || state.destroyed) return;
    state.rafScheduled = true;
    requestAnimationFrame(render);
  }

  function startRedrawTimer() {
    stopRedrawTimer();
    if (state.reducedMotion) return;
    state.redrawTimer = setInterval(() => {
      if (document.hidden) return;
      if (!state.sky) return;
      scheduleRender();
    }, REDRAW_INTERVAL_MS);
  }

  function stopRedrawTimer() {
    if (state.redrawTimer) { clearInterval(state.redrawTimer); state.redrawTimer = null; }
  }

  const api = {
    version: '2.1',

    init(opts) {
      if (state.destroyed) return api;
      opts = opts || {};
      if (opts.location) api.setLocation(opts.location);
      if (opts.sky)      api.setSkyState(opts.sky);
      else               api.refreshSkyFromSolar();

      if (!state.bound) {
        state.bound = true;
        window.addEventListener('resize', () => { if (state.sky) scheduleRender(); });
      }
      startRedrawTimer();
      scheduleRender();
      return api;
    },

    setLocation(loc) {
      if (!loc) return api;
      state.location = loc;
      api.refreshSkyFromSolar();
      return api;
    },

     setSkyState(sky) {
      if (state.destroyed || !sky) return api;
      state.sky = sky;
      state.sunElev  = Number(sky.sun  && sky.sun.elevation) || 0;
      state.sunAz    = Number(sky.sun  && sky.sun.azimuth)   || 180;
      state.moonElev = Number(sky.moon && sky.moon.elevation) || 0;
      state.moonAz   = Number(sky.moon && sky.moon.azimuth)   || 180;
      state.moonAlpha = (sky.moon && sky.moon.visible)
        ? Number(sky.moon.illumination) || 0.5
        : 0;

      try {
        const W = global.VioraHero && global.VioraHero.debug && global.VioraHero.debug.Weather;
        if (W && typeof W.get === 'function') {
          const w = W.get();
          if (w) {
            if (Number.isFinite(w.code)) state.weatherCode = w.code;
            if (Number.isFinite(w.cloudCover)) state.cloudCover = w.cloudCover;
            else if (Number.isFinite(w.cloudCoverEffective)) {
              state.cloudCover = w.cloudCoverEffective * 100;
            }
          }
        }
      } catch (_) {}

      scheduleRender();
      return api;
    },

    refreshSkyFromSolar() {
      if (!state.location) return api;
      const S = global.Solar;
      if (!S || typeof S.getSkyState !== 'function') return api;
      try {
        const now = (typeof global.__vioraNow === 'function') ? global.__vioraNow() : new Date();
        const sky = S.getSkyState(state.location.lat, state.location.lon, now);
        api.setSkyState(sky);
      } catch (_) {}
      return api;
    },

    renderNow() { scheduleRender(); return api; },
    destroy() {
      state.destroyed = true;
      stopRedrawTimer();
      if (state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
      state.canvas = null; state.ctx = null;
    }
  };

  Object.defineProperty(global, 'VioraTerminator', { value: api, writable: false, configurable: true });
})(typeof window !== 'undefined' ? window : globalThis);
