/* ═══════════════════════════════════════════════════════════
   hero-terminator.js — real day/night sky gradient
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const REDRAW_INTERVAL_MS = 8000;
  const DPR_CAP = 2;

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
    sunElev: 18,
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
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    state.reducedMotion = !!(mq && mq.matches);
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', () => { state.reducedMotion = mq.matches; });
    } else if (mq && mq.addListener) {
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
    if (!state.canvas || !state.ctx) return false;
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

  function lerpRGB(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  function skyPalette(sunElev, cloudCover) {
    const safeElev = Number.isFinite(sunElev) ? sunElev : 18;
    const cloud = Math.max(0, Math.min(1, (cloudCover || 0) / 100));

    let top, mid, bottom;

    if (safeElev >= 6) {
      top = [35, 88, 190];
      mid = [82, 152, 230];
      bottom = [190, 222, 250];
    } else if (safeElev > -6) {
      const t = (safeElev + 6) / 12;
      top = lerpRGB([12, 18, 46], [35, 88, 190], t);
      mid = lerpRGB([120, 96, 140], [82, 152, 230], t);
      bottom = lerpRGB([255, 175, 120], [190, 222, 250], t);
    } else if (safeElev > -12) {
      const t = (safeElev + 12) / 6;
      top = lerpRGB([4, 8, 22], [12, 18, 46], t);
      mid = lerpRGB([8, 12, 28], [120, 96, 140], t);
      bottom = lerpRGB([20, 28, 55], [255, 175, 120], t);
    } else {
      top = [3, 6, 18];
      mid = [8, 12, 27];
      bottom = [14, 19, 38];
    }

    if (cloud > 0.18 && safeElev > -6) {
      const grey = [150, 156, 170];
      const k = Math.min(1, (cloud - 0.18) / 0.82) * 0.9;
      top = lerpRGB(top, grey, k * 0.55);
      mid = lerpRGB(mid, grey, k * 0.8);
      bottom = lerpRGB(bottom, [200, 210, 220], k * 0.6);
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
    if (w < 2 || h < 2 || !ctx) return;

    ctx.clearRect(0, 0, w, h);

    const sunElev = Number.isFinite(state.sunElev) ? state.sunElev : 18;
    const sunAz = Number.isFinite(state.sunAz) ? state.sunAz : 180;
    const cloud = Number.isFinite(state.cloudCover) ? state.cloudCover : 25;

    const pal = skyPalette(sunElev, cloud);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgb(${pal.top[0]},${pal.top[1]},${pal.top[2]})`);
    grad.addColorStop(0.6, `rgb(${pal.mid[0]},${pal.mid[1]},${pal.mid[2]})`);
    grad.addColorStop(1, `rgb(${pal.bottom[0]},${pal.bottom[1]},${pal.bottom[2]})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (Math.abs(sunElev) < 18 && cloud < 95) {
      const glowX = ((sunAz % 360) + 360) % 360 / 360 * w;
      const intensity = 1 - Math.min(1, Math.abs(sunElev) / 18);
      const warmth = Math.max(0.15, 1 - cloud / 100);
      const glow = ctx.createRadialGradient(glowX, h, 0, glowX, h, w * 0.75);
      glow.addColorStop(0, `rgba(255, 200, 120, ${0.42 * intensity * warmth})`);
      glow.addColorStop(0.45, `rgba(255, 150, 80, ${0.18 * intensity * warmth})`);
      glow.addColorStop(1, 'rgba(255, 150, 80, 0)');
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
    if (state.redrawTimer) {
      clearInterval(state.redrawTimer);
      state.redrawTimer = null;
    }
  }

  const api = {
    version: '2.3',

    init(opts) {
      if (state.destroyed) return api;
      opts = opts || {};
      if (opts.location) api.setLocation(opts.location);
      if (opts.sky) api.setSkyState(opts.sky);
      else api.refreshSkyFromSolar();

      if (!state.bound) {
        state.bound = true;
        if (typeof window !== 'undefined') {
          window.addEventListener('resize', () => { if (state.sky) scheduleRender(); });
        }
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

      const sun = sky.sun || {};
      const moon = sky.moon || {};

      state.sunElev = Number.isFinite(Number(sun.elevation)) ? Number(sun.elevation) : 18;
      state.sunAz = Number.isFinite(Number(sun.azimuth)) ? Number(sun.azimuth) : 180;
      state.moonElev = Number.isFinite(Number(moon.elevation)) ? Number(moon.elevation) : 0;
      state.moonAz = Number.isFinite(Number(moon.azimuth)) ? Number(moon.azimuth) : 180;
      state.moonAlpha = moon.visible ? (Number(moon.illumination) || 0.5) : 0;

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
        const now = typeof global.__vioraNow === 'function' ? global.__vioraNow() : new Date();
        const sky = S.getSkyState(state.location.lat, state.location.lon, now);
        api.setSkyState(sky || {
          sun: { elevation: 18, azimuth: 180 },
          moon: { visible: false, illumination: 0 }
        });
      } catch (_) {}
      return api;
    },

    renderNow() { scheduleRender(); return api; },

    destroy() {
      state.destroyed = true;
      stopRedrawTimer();
      if (state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
      state.canvas = null;
      state.ctx = null;
    }
  };

  Object.defineProperty(global, 'VioraTerminator', { value: api, writable: false, configurable: true });
})(typeof window !== 'undefined' ? window : globalThis);
