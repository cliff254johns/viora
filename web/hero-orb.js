/* ═══════════════════════════════════════════════════════════
   hero-orb.js — real sun/moon positioning for the VIORA hero
   v5.0 — Bulletproof Safe-Zone rendering
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     Config
     ───────────────────────────────────────────────────────── */
  const HORIZON_Y_FRAC   = 0.74;
  const ZENITH_Y_FRAC    = 0.06;
  const AZ_HALF_SPAN_DEG = 180;

  const AZ_EDGE_PAD_PX   = 40;
  const EDGE_PAD_TOP_PX  = 24;

  const DEFAULT_CENTER_AZ = 180;

  const LERP_MS         = 500;
  const LERP_OVERSHOOT  = 1.05;

  const ARC_SAMPLES = 96;
  const ARC_MIN_VISIBLE_ELEV = -2;

  const OCCLUDE_OPACITY_FLOOR = 0.65; // Keeps sun visible even in heavy rain
  const GLOW_DEFAULT = true;
  const NIGHT_FADE_DEG = -12;

  const DEFAULT_PEAK_NORM = 0.85;

  const REDUCED_MOTION = (function () {
    try {
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      return mq.matches;
    } catch (_) { return false; }
  })();

  /* ─────────────────────────────────────────────────────────
     State
     ───────────────────────────────────────────────────────── */
  const state = {
    orb: null,
    banner: null,
    sunPathEl: null,
    moonPathEl: null,

    location: null,
    sky: null,
    weather: null,

    weatherOcclusion: 0,
    weatherOcclusionTarget: 0,

    targetX: 0, targetY: 0,
    currentX: 0, currentY: 0,
    fromX: 0, fromY: 0,

    lastAzimuthDeg: null,
    lastWindowCenterAz: null,

    rafId: null,
    startedAt: 0,
    duration: 0,

    activeMode: 'sun',
    activeAlpha: 0,

    lastSizePx: 64,
    lastTintKey: '',
    lastOcclusionKey: '',

    glow: GLOW_DEFAULT,

    reducedMotion: REDUCED_MOTION,
    bound: false,
    destroyed: false,
    hasPlacedOnce: false,
    disabled: false,

    rectLeft: 0, rectTop: 0, rectW: 0, rectH: 0,

    arcGenKey: ''
  };

  /* ─────────────────────────────────────────────────────────
     Helpers
     ───────────────────────────────────────────────────────── */
  function azimuthDelta(fromDeg, toDeg) {
    let d = (toDeg - fromDeg) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutBackLite(t) {
    const u = t - 1;
    const c1 = LERP_OVERSHOOT;
    const c3 = c1 + 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }

  /* ─────────────────────────────────────────────────────────
     DOM
     ───────────────────────────────────────────────────────── */
  function ensureOrb() {
    if (state.orb && document.body.contains(state.orb)) return state.orb;
    const orb = document.getElementById('vioraHeroOrb');
    if (!orb) return null;
    state.orb = orb;

    // Base positioning
    orb.style.position = 'absolute';
    orb.style.willChange = 'transform, opacity';
    orb.style.transformOrigin = 'center center';
    orb.style.pointerEvents = 'none';
    orb.style.zIndex = '99';

    return orb;
  }

  function ensureBanner() {
    if (state.banner && document.body.contains(state.banner)) return state.banner;
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return null;
    state.banner = banner;
    return banner;
  }

  function refreshRect() {
    const banner = ensureBanner();
    if (!banner) return false;
    const rect = banner.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    state.rectLeft = rect.left;
    state.rectTop  = rect.top;
    state.rectW    = rect.width;
    state.rectH    = rect.height;
    return true;
  }

  /* ─────────────────────────────────────────────────────────
     SVG arcs
     ───────────────────────────────────────────────────────── */
  function ensurePaths() {
    let svg = document.getElementById('vioraHeroArcSvg');
    if (svg && state.sunPathEl && state.moonPathEl) return;

    const banner = ensureBanner();
    if (!banner) return;

    let sunPath = document.getElementById('vioraHeroSunPath');
    let moonPath = document.getElementById('vioraHeroMoonPath');
    if (sunPath && moonPath) {
      state.sunPathEl = sunPath;
      state.moonPathEl = moonPath;
      return;
    }

    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'vioraHeroArcSvg';
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('viewBox', '0 0 1000 1000');
      svg.style.cssText = [
        'position:absolute', 'inset:0',
        'width:100%', 'height:100%',
        'pointer-events:none',
        'z-index:2'
      ].join(';');
      const skyCanvas = document.getElementById('vioraHeroSkyCanvas');
      if (skyCanvas && skyCanvas.parentNode === banner) {
        banner.insertBefore(svg, skyCanvas.nextSibling);
      } else {
        banner.insertBefore(svg, banner.firstChild);
      }
    }

    if (!sunPath) {
      sunPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      sunPath.id = 'vioraHeroSunPath';
      sunPath.setAttribute('fill', 'none');
      sunPath.setAttribute('stroke', 'rgba(255, 220, 160, 0.4)');
      sunPath.setAttribute('stroke-width', '1.5');
      sunPath.setAttribute('stroke-dasharray', '4 6');
      sunPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(sunPath);
    }
    if (!moonPath) {
      moonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      moonPath.id = 'vioraHeroMoonPath';
      moonPath.setAttribute('fill', 'none');
      moonPath.setAttribute('stroke', 'rgba(200, 220, 255, 0.2)');
      moonPath.setAttribute('stroke-width', '1');
      moonPath.setAttribute('stroke-dasharray', '3 8');
      moonPath.setAttribute('stroke-linecap', 'round');
      svg.appendChild(moonPath);
    }

    state.sunPathEl = sunPath;
    state.moonPathEl = moonPath;
  }

  /* ─────────────────────────────────────────────────────────
     Sun Arc Math
     ───────────────────────────────────────────────────────── */
  let _sunCenterCache = { key: '', az: DEFAULT_CENTER_AZ };

  function localDateKey(loc) {
    try {
      const now = (typeof global.__vioraNow === 'function') ? global.__vioraNow() : new Date();
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: loc.tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(now);
    } catch (_) {
      const now = (typeof global.__vioraNow === 'function') ? global.__vioraNow() : new Date();
      return now.toISOString().slice(0, 10);
    }
  }

  function computeSunNoonAzimuth(loc) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return DEFAULT_CENTER_AZ;
    const key = loc.lat.toFixed(3) + '|' + loc.lon.toFixed(3) + '|' + localDateKey(loc);
    if (_sunCenterCache.key === key) return _sunCenterCache.az;

    let az = null;
    const S = global.Solar;

    if (S && typeof S.getTimes === 'function' && typeof S.getPosition === 'function') {
      try {
        const times = S.getTimes(loc.lat, loc.lon, new Date(), { refTz: loc.tz });
        if (times && times.solarNoon instanceof Date && !Number.isNaN(times.solarNoon.getTime())) {
          const pos = S.getPosition(loc.lat, loc.lon, times.solarNoon);
          if (pos && Number.isFinite(pos.azimuth)) az = pos.azimuth;
        }
      } catch (_) {}
    }

    if (!Number.isFinite(az)) az = loc.lat >= 0 ? 180 : 0;
    _sunCenterCache = { key, az };
    return az;
  }

  function windowCenterFor(body, sky, loc) {
    return computeSunNoonAzimuth(loc);
  }

  function peakNormFromSky(sky) {
    if (!sky || !sky.sun) return DEFAULT_PEAK_NORM;
    const direct = Number(sky.sun.peakNorm);
    if (Number.isFinite(direct) && direct > 0) return clamp(direct, 0, 1);
    const noonElev = Number(sky.sun.solarNoonElevationDeg);
    if (Number.isFinite(noonElev)) return clamp(noonElev / 60, 0, 1);
    if (sky.sun.polarDay) return 1;
    if (sky.sun.polarNight) return 0;
    return DEFAULT_PEAK_NORM;
  }

  /* ─────────────────────────────────────────────────────────
     THE BULLETPROOF POSITIONING (Safe Zone)
     ───────────────────────────────────────────────────────── */
  function projectToScreen(body, centerAz, peakNorm) {
    if (!body) return null;

    const w = state.rectW;
    const h = state.rectH;
    if (w < 2 || h < 2) return null;

    // Hide if below horizon
    if (body.elevation < -12) return null;

    // Clamp the arc fraction so the sun NEVER touches the far edges
    const t = clamp(body.arcFraction, 0.1, 0.9); 
    
    // X: Moves smoothly from 15% to 85% of the screen width
    let x = w * (0.15 + (t * 0.70)); 

    // Y: Base height is 40% from the top, and it arcs up to 15% at noon
    const parabola = 1 - (2 * t - 1) * (2 * t - 1);
    let y = (h * 0.40) - (parabola * h * 0.25); 

    return { x, y };
  }

  function sunTint(elevationDeg) {
    if (elevationDeg >= 30) return 'rgba(255, 250, 235, 1)';
    if (elevationDeg >= 10) {
      const t = (elevationDeg - 10) / 20;
      return `rgba(255, ${Math.round(lerp(210, 250, t))}, ${Math.round(lerp(150, 235, t))}, 1)`;
    }
    if (elevationDeg >= 0) {
      const t = elevationDeg / 10;
      return `rgba(255, ${Math.round(lerp(140, 210, t))}, ${Math.round(lerp(80, 150, t))}, 1)`;
    }
    return 'rgba(255, 120, 70, 1)';
  }

  /* ─────────────────────────────────────────────────────────
     Weather & Opacity
     ───────────────────────────────────────────────────────── */
  function effectiveOpacity(skyAlpha, weatherOcclusion) {
    const occ = clamp(weatherOcclusion, 0, 1);
    const factor = 1 - occ * (1 - OCCLUDE_OPACITY_FLOOR);
    let finalAlpha = clamp(skyAlpha * factor, 0, 1);
    
    // Force minimum 60% opacity during the day so it never vanishes
    if (skyAlpha > 0.5 && finalAlpha < 0.6) {
      finalAlpha = 0.6; 
    }
    return finalAlpha;
  }

  /* ─────────────────────────────────────────────────────────
     Motion
     ───────────────────────────────────────────────────────── */
  function cancelLerp() {
    if (state.rafId != null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  function startLerp(targetX, targetY, immediate) {
    if (state.destroyed) return;
    if (immediate || !state.hasPlacedOnce || state.reducedMotion) {
      cancelLerp();
      state.currentX = targetX;
      state.currentY = targetY;
      state.fromX = targetX;
      state.fromY = targetY;
      state.targetX = targetX;
      state.targetY = targetY;
      state.hasPlacedOnce = true;
      applyTransform();
      return;
    }
    cancelLerp();
    state.fromX = state.currentX;
    state.fromY = state.currentY;
    state.targetX = targetX;
    state.targetY = targetY;
    state.startedAt = performance.now();
    state.duration = LERP_MS;
    state.rafId = requestAnimationFrame(tickLerp);
  }

  function tickLerp() {
    state.rafId = null;
    if (state.destroyed) return;
    const orb = state.orb;
    if (!orb) return;

    const now = performance.now();
    const t = state.duration > 0 ? Math.min(1, (now - state.startedAt) / state.duration) : 1;
    const e = easeOutBackLite(t);

    state.currentX = state.fromX + (state.targetX - state.fromX) * e;
    state.currentY = state.fromY + (state.targetY - state.fromY) * e;

    applyTransform();

    if (t < 1) state.rafId = requestAnimationFrame(tickLerp);
    else {
      state.currentX = state.targetX;
      state.currentY = state.targetY;
      applyTransform();
    }
  }

  function applyTransform() {
    const orb = state.orb;
    if (!orb) return;
    const size = 64; // Fixed size
    const half = size / 2;
    
    // Translate based on current X/Y coords, keeping the orb centered
    const x = Math.round(state.currentX - half);
    const y = Math.round(state.currentY - half);
    orb.style.transform = `translate(${x}px, ${y}px)`;
  }

  /* ─────────────────────────────────────────────────────────
     Public API
     ───────────────────────────────────────────────────────── */
  const api = {
    version: '5.0',

    init(opts) {
      if (state.destroyed) return api;
      opts = opts || {};

      if (opts.location) api.setLocation(opts.location);
      if (!ensureOrb() || !ensureBanner()) return api;
      
      ensurePaths();
      refreshRect();
      
      if (opts.sky) api.setSkyState(opts.sky);
      else api.refreshSkyFromSolar();

      return api;
    },

    setLocation(loc) {
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return api;
      
      state.location = {
        lat: loc.lat, lon: loc.lon, tz: loc.tz || 'UTC', name: loc.name || ''
      };

      cancelLerp();
      state.hasPlacedOnce = false;
      state.currentX = 0;
      state.currentY = 0;
      
      state.arcGenKey = ''; 
      ensurePaths();
      
      if (state.sunPathEl && state.moonPathEl) {
        const sunCenterAz = computeSunNoonAzimuth(state.location);
        const sunD = buildPathD(sampleSunPath(state.location), sunCenterAz);
        state.sunPathEl.setAttribute('d', sunD || '');
      }

      // ★ FIX: Force an immediate repaint with the new solar math
      // instead of waiting for the next weather tick.
      const S = global.Solar;
      if (S && typeof S.getSkyState === 'function') {
        const now = (typeof global.__vioraNow === 'function') ? global.__vioraNow() : new Date();
        const sky = S.getSkyState(state.location.lat, state.location.lon, now);
        if (sky) {
          api.setSkyState(sky);
        }
      }
      
      return api;
    },

    setSkyState(sky) {
      if (state.destroyed || !sky) return api;
      state.sky = sky;

      const orb = ensureOrb();
      if (!orb) return api;

      if (!refreshRect()) {
        // Retry once if the banner hasn't laid out yet
        requestAnimationFrame(() => api.setSkyState(sky));
        return api;
      }

      /* ═══════════════════════════════════════════════════════
         FORCE THE SUN TO BE A SOLID BALL (Overrides all CSS)
         ═══════════════════════════════════════════════════════ */
           /* FORCE THE SUN TO BE A SOLID BALL (Overrides all CSS) */
      orb.style.display = 'block';
      orb.style.width = '64px';
      orb.style.height = '64px';
      orb.style.borderRadius = '50%';
      orb.style.backgroundColor = '#fffbe6'; 
      orb.style.border = '2px solid rgba(255, 255, 255, 0.8)';
      // Massive glow that won't be clipped
      orb.style.boxShadow = '0 0 40px 15px rgba(255, 220, 120, 0.8), 0 0 80px 30px rgba(255, 180, 60, 0.4)';
      orb.style.filter = 'none';  

          const body = pickActiveBody(sky);

      // If the sun is below the horizon, hide it
      if (body.elevation < NIGHT_FADE_DEG) {
        orb.style.opacity = '0';
        orb.style.display = 'none'; 
        return api;
      }

      // ★ FIX: Always show the sun if it's mathematically above the horizon.
      // Do NOT let a missing or loading weather state hide the sun.
         // If the sun is up, show the element again
      orb.style.display = 'block';
      
          // Cloud cover dims the sun, but it never fully vanishes
      const cloudOcclusion = (function () {
        const w = state.weather;
        if (!w) return 0.15;
        const cloud = Number(w.cloudCoverEffective != null ? w.cloudCoverEffective * 100 : w.cloudCover);
        if (!Number.isFinite(cloud)) return 0.15;
        return Math.min(0.85, (cloud / 100) * 0.9);
      })();
      const alpha = Math.max(0.55, effectiveOpacity(body.alpha, cloudOcclusion));
      orb.style.opacity = alpha.toFixed(3);

      // Apply dynamic tint (yellow at noon, orange at sunset)
      const tint = sunTint(body.elevation);
      orb.style.backgroundColor = tint; 

      // Calculate exact position
      const centerAz = windowCenterFor(body, sky, state.location);
      const peakNorm = peakNormFromSky(sky);
      const pos = projectToScreen(body, centerAz, peakNorm);
      
      if (!pos) {
        orb.style.opacity = '0';
        return api;
      }

      // Move the sun!
      startLerp(pos.x, pos.y, !state.hasPlacedOnce);
      return api;
    },

        setWeather(w) {
      state.weather = w || null;
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

    renderNow() {
      if (state.sky) api.setSkyState(state.sky);
      return api;
    },

    destroy() {
      state.destroyed = true;
      cancelLerp();
      state.orb = null;
      state.banner = null;
    }
  };

  /* Helper functions for the arc */
  function pickActiveBody(sky) {
    if (!sky || !sky.sun) return { elevation: -1, arcFraction: 0 };
    const sunElev = Number(sky.sun.elevation);
    const arcFraction = Number(sky.sun.arcFraction);
    return { elevation: sunElev, arcFraction: arcFraction };
  }

  function buildPathD(samples, centerAz) {
    let d = '';
    let penDown = false;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.elev < -2) { penDown = false; continue; }
      
      const innerW = 1000 - AZ_EDGE_PAD_PX * 2;
      let rel = s.az - centerAz;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      
      const x = AZ_EDGE_PAD_PX + ((rel + 180) / 360) * innerW;
      const y = (1000 * HORIZON_Y_FRAC) - (Math.max(0, s.elev) / 90) * (1000 * 0.68);

      if (!penDown) {
        d += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
        penDown = true;
      } else {
        d += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
    }
    return d.trim();
  }

  function sampleSunPath(loc) {
    const S = global.Solar;
    if (!S || typeof S.getPosition !== 'function') return [];
    const now = new Date();
    const samples = [];
    for (let i = 0; i <= ARC_SAMPLES; i++) {
      const t = (now.getTime() - 12*3600000) + (24*3600000) * (i / ARC_SAMPLES);
      try {
        const pos = S.getPosition(loc.lat, loc.lon, new Date(t));
        if (pos && Number.isFinite(pos.azimuth) && Number.isFinite(pos.elevation)) {
          samples.push({ az: pos.azimuth, elev: pos.elevation });
        }
      } catch (_) {}
    }
    return samples;
  }

  Object.defineProperty(global, 'VioraOrb', {
    value: api,
    writable: false,
    configurable: true
  });

})(typeof window !== 'undefined' ? window : globalThis);
