/* ═══════════════════════════════════════════════════════════
   hero-sky.js — real star field for the VIORA hero banner
   ─────────────────────────────────────────────────────────────
   v2.9 — location-follows-banner, live catalog reload

   v2.9 changes vs v2.8:
     • SKY FOLLOWS BANNER. hero-sky.js now reacts to BOTH of
       the ways hero-banner.js announces a location change:
         1. VioraSky.setLocation(loc)          — direct call
         2. window event 'viora:hero-location-change' — broadcast
       Both are deduped through _lastAppliedLocation, so calling
       both for one user pick is a no-op on the second call.

     • LIVE CATALOG RELOAD. hero-globe.js loads stars.bin
       asynchronously and falls back to a synthetic catalog
       while it's loading. Previously, if hero-sky.js read
       the fallback before the real catalog landed, it was
       stuck on synthetic stars forever. Now render() checks
       VioraHeroGlobe._starCatalog() every frame and rebuilds
       when the source changes.

     • SKIP STARS DRAW WHEN alpha < 0.01. drawStarsBatched()
       iterates every star. With 1500 synthetic or ~9000 real
       stars, that's wasted CPU on the small window between
       the early-return threshold (0.01) and the alpha ramp
       (0.02 → 0.35). Now gated by alpha0 >= 0.01.

     • CORRECT MOON TERMINATOR. The visible dark side of the
       moon is now an ellipse whose semi-minor axis is
       r * |1 - 2*phase|, computed against the true illuminated
       limb — matches what you'd see through binoculars.
       Previously the code used a naive circle clip that looked
       "good enough" at 8 px but visibly wrong at 20 px.

     • destroy() removes the location listener.

   v2.8 history (preserved):
     • Moon visible before stars. getVisibleMoon() public API.
     • Everything else — precession, color, twinkle, Milky Way,
       planets, constellations, meteors — unchanged.

   Public API (window.VioraSky):
     init  setLocation  setSkyState  renderNow  destroy
     isReady  getVisibleStars  getVisibleMoon  on  off  debug
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const REDRAW_INTERVAL_MS = 4000;
  const STAR_MAG_LIMIT_DESKTOP = 5.6;
  const STAR_MAG_LIMIT_MOBILE  = 4.8;
  const STAR_MAG_LIMIT_MIN     = 4.2;
  const STAR_MAG_LIMIT_MAX     = 6.0;
  const HORIZON_FADE_DEG   = 6;
  const HORIZON_MARGIN_DEG = 0;
  const DPR_CAP            = 2;
  const DPR_CAP_MOBILE     = 1.75;
  const EXTINCTION_K       = 0.28;
  const AIRMASS_CLAMP      = 6.0;
  const TWINKLE_AMPLITUDE  = 0.18;
  const TWINKLE_SPEED      = 0.0018;
  const METEOR_CHANCE_PER_REDRAW = 0.15;
  const METEOR_MIN_DURATION_MS = 700;
  const METEOR_MAX_DURATION_MS = 1400;

  /* v2.9 — dedupe window for setLocation() calls. */
  const LOCATION_DEDUPE_MS = 250;

  const DEG2RAD = Math.PI / 180;
  const OBLIQUITY = 23.4392911 * DEG2RAD;
  const cosObl = Math.cos(OBLIQUITY);
  const sinObl = Math.sin(OBLIQUITY);

  const state = {
    canvas: null,
    ctx: null,
    dpr: 1,
    w: 0,
    h: 0,

    location: null,
    sky: null,
    starAlpha: 0,
    moonAlpha: 0,
    _lastSetAlpha: -1,
    _lastDrawnAlpha: -1,

    stars: null,
    starsByBucket: null,
    catalogReady: false,

    /* v2.9 — track which source the catalog came from so we can
       detect a real-catalog upgrade. */
    _catalogSource: 'none',

    lastRenderAt: 0,
    rafScheduled: false,
    redrawTimer: null,

    reducedMotion: false,
    bound: false,
    destroyed: false,

    starMagLimit: STAR_MAG_LIMIT_DESKTOP,

    meteors: [],

    seed: 0x9e3779b9,
    prng: null,

    features: {
      twinkle: true,
      moonlight: true,
      zodiacal: true,
      meteors: true,
      constellations: false,
      starLabels: false,
      deepSky: true,
      satellites: false,
      lightPollution: false,
      horizonGlow: true,
      diffractionSpikes: true
    },

    listeners: {},
    lastProjection: [],
    lastMoon: null,

    /* v2.9 — location-follows-banner */
    _lastAppliedLocation: null,
    _lastAppliedAt: 0,
    _heroLocationListener: null
  };

  state.prng = makePRNG(state.seed);

  function makePRNG(seed) {
    let s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s |= 0;
      return ((s >>> 0) / 0xFFFFFFFF);
    };
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function nowFn() {
    try {
      if (typeof global.__vioraNow === 'function') return global.__vioraNow();
      if (global.VioraTime && typeof global.VioraTime.now === 'function') return global.VioraTime.now();
    } catch (_) {}
    return new Date();
  }
  function core_jd(date) { return date.getTime() / 86400000 + 2440587.5; }
  function emit(name, payload) {
    const arr = state.listeners[name];
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      try { arr[i](payload); } catch (_) {}
    }
  }

  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    state.reducedMotion = mq.matches;
    const onChange = () => { state.reducedMotion = mq.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (_) {}

  function localSiderealTimeRad(date, lonDeg) {
    const D = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
    let gmst = (18.697374558 + 24.06570982441908 * D) % 24;
    if (gmst < 0) gmst += 24;
    let lst = gmst + lonDeg / 15;
    lst = ((lst % 24) + 24) % 24;
    return lst * 15 * DEG2RAD;
  }

  function getPrecessMatrix(date) {
    const G = global.VioraHeroGlobe;
    if (G && typeof G._precessMatrix === 'function') {
      const m = G._precessMatrix(date);
      if (m && m.length === 9) return m;
    }
    const precess = (G && typeof G._precess === 'function') ? G._precess : (v) => v;
    const x = precess({ x: 1, y: 0, z: 0 }, date);
    const y = precess({ x: 0, y: 1, z: 0 }, date);
    const z = precess({ x: 0, y: 0, z: 1 }, date);
    return [
      x.x, y.x, z.x,
      x.y, y.y, z.y,
      x.z, y.z, z.z
    ];
  }
  function applyMatrix(m, x, y, z) {
    return {
      x: m[0] * x + m[1] * y + m[2] * z,
      y: m[3] * x + m[4] * y + m[5] * z,
      z: m[6] * x + m[7] * y + m[8] * z
    };
  }

  function refractionDeg(altDeg) {
    if (altDeg > 15) return 0;
    if (altDeg < -2) return 0;
    const t = Math.tan((90 - altDeg) * DEG2RAD);
    return (1.02 / t) / 60;
  }

  function bvToRGB(bv) {
    if (!Number.isFinite(bv)) return [255, 255, 255];
    const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
    return kelvinToRGB(T);
  }
  function kelvinToRGB(T) {
    T = clamp(T, 1000, 40000);
    const t = T / 100;
    let r, g, b;
    if (t <= 66) {
      r = 255;
      g = clamp(99.4708025861 * Math.log(t) - 161.1195681661, 0, 255);
    } else {
      r = clamp(329.698727446 * Math.pow(t - 60, -0.1332047592), 0, 255);
      g = clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492), 0, 255);
    }
    if (t >= 66) b = 255;
    else if (t <= 19) b = 0;
    else b = clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307, 0, 255);
    return [Math.round(r), Math.round(g), Math.round(b)];
  }
  function colorBucketKey(rgb) {
    return ((rgb[0] >> 5) << 6) | ((rgb[1] >> 5) << 3) | (rgb[2] >> 5);
  }

  function magToAlpha(mag, limit) {
    if (!Number.isFinite(mag)) return 0;
    const hi = limit || state.starMagLimit;
    const c = clamp(mag, -1.5, hi);
    const span = hi - (-1.5);
    const norm = 1 - (c - (-1.5)) / span;
    return Math.pow(Math.max(0, norm), 0.42);
  }

  function airmassDimming(altRad) {
    const sinAlt = Math.max(0.01, Math.sin(altRad));
    const airmass = Math.min(AIRMASS_CLAMP, 1 / sinAlt);
    return Math.pow(10, -0.4 * EXTINCTION_K * (airmass - 1));
  }

  /* ═══════════════════════════════════════════════════════════
     Catalog loading — v2.9 detects when a real catalog replaces
     a synthetic fallback so the sky refreshes automatically.
     ═══════════════════════════════════════════════════════════ */
  function _syntheticCatalog() {
    if (state._fallbackCatalog) return state._fallbackCatalog;
    const rnd = (function () {
      let s = 0xBEEF;
      return function () {
        s ^= s << 13; s |= 0;
        s ^= s >>> 17;
        s ^= s << 5;  s |= 0;
        return (s >>> 0) / 0xFFFFFFFF;
      };
    })();
    const fallback = [];
    for (let i = 0; i < 800; i++) {
      const ra = rnd() * 24;
      const dec = (rnd() * 2 - 1) * 90;
      const mag = 1.5 + rnd() * 4;
      fallback.push({ ra, dec, mag });
    }
    state._fallbackCatalog = fallback;
    return fallback;
  }

  function _decorateStars(list) {
    const rnd = makePRNG(0xC0FFEE);
    const stars = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      let bv = s.bv;
      if (!Number.isFinite(bv)) {
        const sp = String(s.sp || s.spectral || '').toUpperCase();
        if (sp) {
          const c = sp[0];
          if      (c === 'O') bv = -0.30;
          else if (c === 'B') bv = -0.15;
          else if (c === 'A') bv =  0.10;
          else if (c === 'F') bv =  0.40;
          else if (c === 'G') bv =  0.65;
          else if (c === 'K') bv =  1.10;
          else if (c === 'M') bv =  1.70;
        }
      }
      const rgb = bvToRGB(Number.isFinite(bv) ? bv : 0.5);
      stars[i] = {
        ra: s.ra, dec: s.dec, mag: s.mag,
        bv: Number.isFinite(bv) ? bv : 0.5,
        rgb,
        bucket: colorBucketKey(rgb),
        seed: rnd() * Math.PI * 2,
        name: s.name || null
      };
    }

    const byBucket = new Map();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let arr = byBucket.get(s.bucket);
      if (!arr) { arr = []; byBucket.set(s.bucket, arr); }
      arr.push(s);
    }
    return { stars, byBucket };
  }

  function _catalogSource() {
    const G = global.VioraHeroGlobe;
    if (!G || typeof G._starCatalog !== 'function') return 'none';
    let list;
    try { list = G._starCatalog(); } catch (_) { list = null; }
    if (!Array.isArray(list) || list.length === 0) return 'none';
    /* hero-globe.js's real catalog has roughly 9000 stars and
       every entry has an `id` or a `bv`. Synthetic has exactly
       1500 (or 800 in hero-sky's own fallback). We detect by
       length, which is cheap and stable. */
    return list.length > 2000 ? 'real' : 'synthetic';
  }

  function ensureCatalog(force) {
    if (state.catalogReady && !force) {
      /* v2.9 — if a real catalog has arrived since we loaded,
         rebuild. */
      const current = _catalogSource();
      if (current === state._catalogSource || current === 'none') return true;
      /* fall through to rebuild */
    }

    const G = global.VioraHeroGlobe;
    let list = null;
    if (G && typeof G._starCatalog === 'function') {
      try { list = G._starCatalog(); } catch (_) { list = null; }
    }

    const source = (Array.isArray(list) && list.length > 0) ? _catalogSource() : 'synthetic';
    if (!Array.isArray(list) || list.length === 0) {
      list = _syntheticCatalog();
    }

    const decorated = _decorateStars(list);
    state.stars = decorated.stars;
    state.starsByBucket = decorated.byBucket;
    state._catalogSource = source;
    state.catalogReady = true;
    return true;
  }

  function ensureCanvas() {
    if (state.canvas && document.body.contains(state.canvas)) return state.canvas;
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return null;

    let canvas = document.getElementById('vioraHeroSkyCanvas');
    if (canvas) {
      state.canvas = canvas;
      state.ctx = canvas.getContext('2d', { alpha: true });
      return canvas;
    }
    canvas = document.createElement('canvas');
    canvas.id = 'vioraHeroSkyCanvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = [
      'position:absolute', 'inset:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:0'
    ].join(';');
    banner.insertBefore(canvas, banner.firstChild);
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d', { alpha: true });
    return canvas;
  }

  function resizeBackingStore() {
    if (!state.canvas || !state.ctx) return false;
    const rect = state.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const isMobile = /Mobi|Android/i.test(navigator.userAgent || '');
    const cap = isMobile ? DPR_CAP_MOBILE : DPR_CAP;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const wantW = Math.round(rect.width * dpr);
    const wantH = Math.round(rect.height * dpr);

    const sizeChanged = (state.canvas.width !== wantW || state.canvas.height !== wantH);
    if (sizeChanged) {
      state.canvas.width = wantW;
      state.canvas.height = wantH;
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else if (state.dpr !== dpr) {
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    state.dpr = dpr;
    state.w = rect.width;
    state.h = rect.height;

    let lim = isMobile ? STAR_MAG_LIMIT_MOBILE : STAR_MAG_LIMIT_DESKTOP;
    if (rect.width * rect.height > 2500000) lim += 0.2;
    state.starMagLimit = clamp(lim, STAR_MAG_LIMIT_MIN, STAR_MAG_LIMIT_MAX);
    return true;
  }

  /* ── Planets ── */
  const PLANET_ELEMENTS = {
    Mercury: { a:[0.38709927,0.00000037], e:[0.20563593,0.00001906], I:[7.00497902,-0.00594749], L:[252.25032350,149472.67411175], w:[77.45779628,0.16047689], O:[48.33076593,-0.12534081], color:[220,220,230], minSize:1.6, maxSize:2.4 },
    Venus:   { a:[0.72333566,0.00000390], e:[0.00677672,-0.00004107], I:[3.39467605,-0.00078890], L:[181.97909950,58517.81538729], w:[131.60246718,0.00268329], O:[76.67984255,-0.27769418], color:[255,240,200], minSize:2.2, maxSize:3.2 },
    Mars:    { a:[1.52371034,0.00001847], e:[0.09339410,0.00007882], I:[1.84969142,-0.00813131], L:[-4.55343205,19140.30268499], w:[-23.94362959,0.44441088], O:[49.55953891,-0.29257343], color:[255,150,110], minSize:1.8, maxSize:2.8 },
    Jupiter: { a:[5.20288700,-0.00011607], e:[0.04838624,-0.00013253], I:[1.30439695,-0.00183714], L:[34.39644051,3034.74612775], w:[14.72847983,0.21252668], O:[100.47390909,0.20469106], color:[255,240,210], minSize:2.2, maxSize:3.4 },
    Saturn:  { a:[9.53667594,-0.00125060], e:[0.05386179,-0.00050991], I:[2.48599187,0.00193609], L:[49.95424423,1222.49362201], w:[92.59887831,-0.41897216], O:[113.66242448,-0.28867794], color:[255,235,180], minSize:2.0, maxSize:3.0 }
  };
  const EARTH_ELEMENTS = { a:[1.00000261,0.00000562], e:[0.01671123,-0.00004392], I:[-0.00001531,-0.01294668], L:[100.46457166,35999.37244981], w:[102.93768193,0.32327364], O:[0.0,0.0] };

  function solveKepler(M, e) {
    let E = M;
    for (let i = 0; i < 3; i++) {
      const f = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      E -= f / fp;
    }
    return E;
  }
  function elementsToHeliocentric(el, T) {
    const a = el.a[0] + el.a[1] * T;
    const e = el.e[0] + el.e[1] * T;
    const I = (el.I[0] + el.I[1] * T) * DEG2RAD;
    const L = (el.L[0] + el.L[1] * T) * DEG2RAD;
    const w = (el.w[0] + el.w[1] * T) * DEG2RAD;
    const O = (el.O[0] + el.O[1] * T) * DEG2RAD;
    const M = L - w;
    const omega = w - O;
    const E = solveKepler(M, e);
    const cosE = Math.cos(E), sinE = Math.sin(E);
    const xOrb = a * (cosE - e);
    const yOrb = a * Math.sqrt(1 - e * e) * sinE;
    const cosW = Math.cos(omega), sinW = Math.sin(omega);
    const cosO = Math.cos(O), sinO = Math.sin(O);
    const cosI = Math.cos(I), sinI = Math.sin(I);
    const x = (cosW * cosO - sinW * sinO * cosI) * xOrb +
              (-sinW * cosO - cosW * sinO * cosI) * yOrb;
    const y = (cosW * sinO + sinW * cosO * cosI) * xOrb +
              (-sinW * sinO + cosW * cosO * cosI) * yOrb;
    const z = (sinW * sinI) * xOrb + (cosW * sinI) * yOrb;
    return { x, y, z };
  }
  function eclipticToEquatorial(lonRad, latRad) {
    const cosLat = Math.cos(latRad);
    const x = cosLat * Math.cos(lonRad);
    const y = cosLat * Math.sin(lonRad);
    const z = Math.sin(latRad);
    const xEq = x;
    const yEq = y * cosObl - z * sinObl;
    const zEq = y * sinObl + z * cosObl;
    return { ra: Math.atan2(yEq, xEq), dec: Math.asin(clamp(zEq, -1, 1)) };
  }
  const MAG_H_G = {
    Mercury: { H: -0.42, G: 0.0380 },
    Venus:   { H: -4.40, G: 0.0009 },
    Mars:    { H: -1.52, G: 0.0160 },
    Jupiter: { H: -9.40, G: 0.0050 },
    Saturn:  { H: -8.88, G: 0.0440 }
  };
  function roughMagnitude(name, e, s) {
    const hg = MAG_H_G[name];
    if (!hg) return 0;
    const ee = Math.max(0.001, Number.isFinite(e) ? e : 1);
    const ss = Math.max(0.001, Number.isFinite(s) ? s : 1);
    const cosPhase = clamp((ss * ss + ee * ee - 1) / (2 * ss * ee), -1, 1);
    if (!Number.isFinite(cosPhase)) return hg.H;
    const phase = Math.acos(cosPhase);
    const inner = (1 - hg.G) * Math.cos(phase) / 2 + hg.G / 2 + 1e-9;
    const mag = hg.H + 5 * Math.log10(ee * ss) - 2.5 * Math.log10(Math.max(1e-12, inner));
    return Number.isFinite(mag) ? mag : hg.H;
  }
  const _planetCache = new Map();
  function planetPosition(name, jd) {
    const key = name + '|' + Math.floor(jd * 24);
    let cached = _planetCache.get(key);
    if (cached) return cached;
    const el = PLANET_ELEMENTS[name];
    if (!el) return null;
    const T = (jd - 2451545.0) / 36525;
    const eh = elementsToHeliocentric(EARTH_ELEMENTS, T);
    const ph = elementsToHeliocentric(el, T);
    const dx = ph.x - eh.x, dy = ph.y - eh.y, dz = ph.z - eh.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const lon = Math.atan2(dy, dx);
    const lat = Math.atan2(dz, Math.sqrt(dx * dx + dy * dy));
    const eq = eclipticToEquatorial(lon, lat);
    const sunDist = Math.sqrt(ph.x * ph.x + ph.y * ph.y + ph.z * ph.z);
    const mag = roughMagnitude(name, dist, sunDist);
    if (!Number.isFinite(eq.ra) || !Number.isFinite(eq.dec) ||
        !Number.isFinite(mag) || !Number.isFinite(dist) ||
        !Number.isFinite(sunDist)) return null;
    const result = Object.freeze({ name, ra: eq.ra, dec: eq.dec, mag, dist, sunDist });
    _planetCache.set(key, result);
    if (_planetCache.size > 64) _planetCache.delete(_planetCache.keys().next().value);
    return result;
  }
  const PLANET_ORDER = ['Mercury','Venus','Mars','Jupiter','Saturn'];
  function getAllPlanets(jd) {
    const out = [];
    for (let i = 0; i < PLANET_ORDER.length; i++) {
      const name = PLANET_ORDER[i];
      const p = planetPosition(name, jd);
      if (!p) continue;
      const el = PLANET_ELEMENTS[name];
      out.push({
        name: p.name, ra: p.ra, dec: p.dec, mag: p.mag,
        color: el.color, minSize: el.minSize, maxSize: el.maxSize
      });
    }
    return out;
  }

  function getMoonPosition(date) {
    const S = global.Solar;
    if (S && typeof S.getMoonPosition === 'function') {
      try {
        const lat = state.location ? state.location.lat : 0;
        const lon = state.location ? state.location.lon : 0;
        return S.getMoonPosition(lat, lon, date);
      } catch (_) {}
    }
    return null;
  }

  const GAL_TO_EQ_M = [
    -0.0548755604, -0.8734370902, -0.4838350155,
     0.4941094279, -0.4448296300,  0.7469822445,
    -0.8676661490, -0.1980763734,  0.4559837762
  ];
  function galacticToEquatorial(lRad, bRad) {
    const cosB = Math.cos(bRad), sinB = Math.sin(bRad);
    const gx = cosB * Math.cos(lRad);
    const gy = cosB * Math.sin(lRad);
    const gz = sinB;
    return {
      x: GAL_TO_EQ_M[0] * gx + GAL_TO_EQ_M[1] * gy + GAL_TO_EQ_M[2] * gz,
      y: GAL_TO_EQ_M[3] * gx + GAL_TO_EQ_M[4] * gy + GAL_TO_EQ_M[5] * gz,
      z: GAL_TO_EQ_M[6] * gx + GAL_TO_EQ_M[7] * gy + GAL_TO_EQ_M[8] * gz
    };
  }
  function sampleGalacticEquator(steps) {
    const out = new Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const lRad = (i / steps) * 2 * Math.PI;
      out[i] = { v: galacticToEquatorial(lRad, 0), l: lRad };
    }
    return out;
  }
  const _galacticSamples = sampleGalacticEquator(180);

  function sampleEcliptic(steps) {
    const out = new Array(steps + 1);
    const poleRa = 270 * DEG2RAD;
    const poleDec = 66.5607 * DEG2RAD;
    const u = { x: Math.cos(poleRa), y: 0, z: Math.sin(poleRa) };
    const px = Math.cos(poleDec) * Math.cos(poleRa);
    const py = Math.sin(poleDec);
    const pz = Math.cos(poleDec) * Math.sin(poleRa);
    const vx = py * u.z - pz * u.y;
    const vy = pz * u.x - px * u.z;
    const vz = px * u.y - py * u.x;
    const vlen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    const v = { x: vx / vlen, y: vy / vlen, z: vz / vlen };
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * 2 * Math.PI;
      const c = Math.cos(a), s = Math.sin(a);
      out[i] = {
        v: {
          x: u.x * c + v.x * s,
          y: u.y * c + v.y * s,
          z: u.z * c + v.z * s
        }
      };
    }
    return out;
  }
  const _eclipticSamples = sampleEcliptic(120);

  const CONSTELLATION_LINES = [
    [[5.9195, 7.407], [5.4188, 6.197], [5.6036, -1.202], [5.5334, -0.299], [5.6793, -1.943], [5.7959, -9.670]],
    [[5.6036, -1.202], [5.7959, -9.670]],
    [[5.5334, -0.299], [5.4188, 6.197]],
    [[11.0621, 61.751], [11.0307, 56.382], [12.2571, 57.033], [12.9005, 55.960], [13.7923, 49.313], [13.3987, 54.925], [11.8972, 53.695], [11.0621, 61.751]],
    [[0.1530, 59.150], [0.6751, 56.537], [0.9451, 60.717], [1.4303, 60.235], [1.9066, 63.670]],
    [[20.6905, 45.280], [20.3705, 40.257], [20.2248, 32.689], [19.7495, 45.131], [20.6905, 45.280], [19.5121, 27.960], [20.2248, 32.689]],
    [[18.6156, 38.784], [18.7461, 37.605], [18.9824, 32.690], [18.7461, 37.605], [18.8347, 33.363], [18.9824, 32.690]],
    [[16.0906, -19.805], [16.0056, -22.622], [16.3530, -25.593], [16.5981, -28.216], [16.8642, -34.293], [16.8360, -34.293], [17.2026, -39.030], [17.6221, -43.000], [17.5600, -37.104], [16.9760, -42.361], [16.4904, -34.902], [16.0056, -22.622]],
    [[12.4433, -63.099], [12.7953, -59.689], [12.5194, -57.113], [12.2525, -58.749], [12.4433, -63.099]],
    [[12.5194, -57.113], [12.4433, -63.099]],
    [[10.1395, 11.967], [10.3328, 19.841], [11.2372, 15.430], [11.0140, 3.665], [10.1222, 16.763], [10.1395, 11.967]],
    [[4.4767, 15.871], [4.3290, 15.628], [5.6275, 21.143], [4.4778, 19.180], [4.4767, 15.871], [4.0111, 12.490]],
    [[6.7525, -16.716], [6.9779, -28.972], [7.1399, -26.393], [7.4010, -29.303], [6.7525, -16.716], [6.3783, -17.956]]
  ];

  const BRIGHT_STAR_NAMES = [
    { ra: 6.7525, dec: -16.716, name: 'Sirius' },
    { ra: 6.3992, dec: -52.696, name: 'Canopus' },
    { ra: 14.6614, dec: -60.835, name: 'Rigil Kentaurus' },
    { ra: 14.2610, dec: 19.182, name: 'Arcturus' },
    { ra: 18.6156, dec: 38.784, name: 'Vega' },
    { ra: 5.2782, dec: 45.998, name: 'Capella' },
    { ra: 7.6550, dec: 5.225, name: 'Procyon' },
    { ra: 5.6036, dec: -1.202, name: 'Rigel' },
    { ra: 1.6286, dec: -57.237, name: 'Achernar' },
    { ra: 5.9195, dec: 7.407, name: 'Betelgeuse' },
    { ra: 14.0637, dec: -60.373, name: 'Hadar' },
    { ra: 19.8464, dec: 8.868, name: 'Altair' },
    { ra: 12.4433, dec: -63.099, name: 'Acrux' },
    { ra: 6.9779, dec: -28.972, name: 'Adhara' },
    { ra: 10.7163, dec: -64.394, name: 'Miaplacidus' },
    { ra: 20.6905, dec: 45.280, name: 'Deneb' },
    { ra: 2.5303, dec: 89.264, name: 'Polaris' },
    { ra: 3.4054, dec: 49.861, name: 'Mirfak' }
  ];

  const DEEP_SKY = [
    { ra: 0.7123, dec: 41.269, name: 'M31',  rx: 1.9, ry: 0.7, rot: 35, alpha: 0.5,  color: [210, 200, 190] },
    { ra: 5.5881, dec: -5.391, name: 'M42',  rx: 0.9, ry: 0.7, rot: 0,  alpha: 0.55, color: [200, 180, 210] },
    { ra: 3.7914, dec: 24.117, name: 'M45',  rx: 1.2, ry: 1.2, rot: 0,  alpha: 0.4,  color: [200, 210, 240] },
    { ra: 0.9270, dec: -72.829, name: 'SMC', rx: 1.8, ry: 1.3, rot: 0,  alpha: 0.4,  color: [200, 200, 210] },
    { ra: 5.3947, dec: -69.756, name: 'LMC', rx: 3.5, ry: 2.6, rot: 0,  alpha: 0.4,  color: [200, 200, 210] },
    { ra: 13.4211, dec: 28.767, name: 'M3',  rx: 0.35, ry: 0.35, rot: 0, alpha: 0.35, color: [210, 210, 210] },
    { ra: 18.0606, dec: -24.386, name: 'M8',  rx: 0.7, ry: 0.5, rot: 0,  alpha: 0.35, color: [210, 190, 200] },
    { ra: 18.3131, dec: -16.177, name: 'M16', rx: 0.5, ry: 0.5, rot: 0,  alpha: 0.3,  color: [200, 200, 220] },
    { ra: 18.3131, dec: -16.177, name: 'M17', rx: 0.5, ry: 0.4, rot: 0,  alpha: 0.3,  color: [210, 200, 200] }
  ];

  function maybeSpawnMeteor() {
    if (!state.features.meteors || state.reducedMotion) return;
    if (state.prng() > METEOR_CHANCE_PER_REDRAW) return;
    const radiants = [
      { name: 'Perseids',     ra: 3.15, dec: 58 },
      { name: 'Geminids',     ra: 7.5,  dec: 32 },
      { name: 'Leonids',      ra: 10.3, dec: 22 },
      { name: 'Quadrantids',  ra: 15.5, dec: 49 },
      { name: 'Eta Aquariids',ra: 22.5, dec: -1 }
    ];
    const rad = radiants[Math.floor(state.prng() * radiants.length)];
    state.meteors.push({
      radiant: rad,
      startT: performance.now(),
      duration: METEOR_MIN_DURATION_MS +
        state.prng() * (METEOR_MAX_DURATION_MS - METEOR_MIN_DURATION_MS),
      length: 60 + state.prng() * 120,
      seed: state.prng() * Math.PI * 2
    });
  }

  function projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                            horizonY, zenithY, raRad, decRad, applyRefraction) {
    const cosDec = Math.cos(decRad);
    const eqX = cosDec * Math.cos(raRad);
    const eqY = Math.sin(decRad);
    const eqZ = cosDec * Math.sin(raRad);
    const p = applyMatrix(matrix, eqX, eqY, eqZ);

    const cosLst = Math.cos(lstRad), sinLst = Math.sin(lstRad);
    const x1 =  cosLst * p.x + sinLst * p.z;
    const y1 =  p.y;
    const z1 = -sinLst * p.x + cosLst * p.z;

    const altSin = sinLat * y1 + cosLat * z1;
    let altDeg = Math.asin(clamp(altSin, -1, 1)) / DEG2RAD;
    if (applyRefraction) altDeg += refractionDeg(altDeg);

    const east = x1;
    const north = cosLat * y1 - sinLat * z1;
    let azRad = Math.atan2(east, north);
    if (azRad < 0) azRad += 2 * Math.PI;

    const sx = (azRad / (2 * Math.PI)) * w;
    const altFrac = clamp(altDeg / 90, 0, 1);
    const sy = horizonY + (zenithY - horizonY) * altFrac;

    return { sx, sy, altDeg, azRad };
  }

  function render() {
    state.rafScheduled = false;
    if (state.destroyed) return;

    /* v2.9 — refresh the catalog before we check alphas so a
       real-catalog upgrade takes effect on the first frame it
       is available. */
    try {
      if (ensureCatalog(false)) {
        /* if source changed, force a repaint */
      }
    } catch (_) {}

    const alpha0 = state.starAlpha;
    const moonA  = state.moonAlpha || 0;

    if (alpha0 < 0.01 && moonA < 0.01) {
      if (state._lastDrawnAlpha !== 0) {
        state._lastDrawnAlpha = 0;
        if (state.ctx && state.w > 0 && state.h > 0) {
          state.ctx.clearRect(0, 0, state.w, state.h);
        }
        state.lastMoon = null;
      }
      return;
    }

    if (!ensureCanvas()) return;
    if (!ensureCatalog(false)) return;
    if (!resizeBackingStore()) return;

    const ctx = state.ctx;
    const w = state.w;
    const h = state.h;
    if (w < 2 || h < 2) return;

    ctx.clearRect(0, 0, w, h);
    state._lastDrawnAlpha = alpha0;

    const loc = state.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;

    const date = nowFn();
    const lstRad = localSiderealTimeRad(date, loc.lon);
    const matrix = getPrecessMatrix(date);
    const sinLat = Math.sin(loc.lat * DEG2RAD);
    const cosLat = Math.cos(loc.lat * DEG2RAD);

    const horizonY = h * 0.72;
    const zenithY  = -h * 0.10;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (state.features.horizonGlow && alpha0 > 0.15) {
      const grad = ctx.createLinearGradient(0, horizonY - h * 0.15, 0, horizonY);
      grad.addColorStop(0, 'rgba(20, 30, 60, 0)');
      grad.addColorStop(1, `rgba(30, 45, 80, ${(0.18 * alpha0).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, horizonY - h * 0.15, w, h * 0.15);
    }

    const visible = [];
    try {
      /* v2.9 — skip the star loop entirely when stars aren't
         visible yet. */
      if (alpha0 >= 0.01) {
        drawStarsBatched(ctx, w, h, matrix, lstRad, sinLat, cosLat,
                         alpha0, horizonY, zenithY, visible, date);
      }
      if (alpha0 > 0.02) {
        drawMilkyWay(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0, horizonY, zenithY);
        drawZodiacalLight(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0);
        if (state.features.deepSky) {
          drawDeepSky(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0, horizonY, zenithY);
        }
        if (state.features.constellations) {
          drawConstellations(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0, horizonY, zenithY);
        }
        drawMeteors(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0, horizonY, zenithY);
        if (state.features.starLabels && w > 720) {
          drawStarLabels(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0, horizonY, zenithY);
        }
      }
      if (state.features.moonlight && moonA > 0.01) {
        drawMoon(ctx, w, h, matrix, lstRad, sinLat, cosLat, moonA, horizonY, zenithY, date);
      }
      drawPlanets(ctx, w, h, matrix, lstRad, sinLat, cosLat, alpha0, horizonY, zenithY, date);
    } catch (err) {}

    ctx.restore();
    state.lastProjection = visible;
    state.lastRenderAt = performance.now();
    emit('rendered', { stars: visible.length, starMagLimit: state.starMagLimit });
  }

  function drawStarsBatched(ctx, w, h, matrix, lstRad, sinLat, cosLat,
                            A, horizonY, zenithY, visibleOut, date) {
    const byBucket = state.starsByBucket;
    if (!byBucket) return;
    const limit = state.starMagLimit;
    const twinkleOn = state.features.twinkle && !state.reducedMotion;
    const tSec = performance.now() * 0.001;

    byBucket.forEach((arr) => {
      const rgb = arr[0].rgb;
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.mag > limit) continue;

        const raRad = s.ra * 15 * DEG2RAD;
        const decRad = s.dec * DEG2RAD;
        const cosDec = Math.cos(decRad);
        const eqX = cosDec * Math.cos(raRad);
        const eqY = Math.sin(decRad);
        const eqZ = cosDec * Math.sin(raRad);

        const p = applyMatrix(matrix, eqX, eqY, eqZ);

        const cosLst = Math.cos(lstRad), sinLst = Math.sin(lstRad);
        const x1 =  cosLst * p.x + sinLst * p.z;
        const y1 =  p.y;
        const z1 = -sinLst * p.x + cosLst * p.z;

        const altSin = sinLat * y1 + cosLat * z1;
        let altDeg = Math.asin(clamp(altSin, -1, 1)) / DEG2RAD;
        if (!Number.isFinite(altDeg)) continue;

        altDeg += refractionDeg(altDeg);
        if (altDeg < HORIZON_MARGIN_DEG) continue;

        const east = x1;
        const north = cosLat * y1 - sinLat * z1;
        let azRad = Math.atan2(east, north);
        if (azRad < 0) azRad += 2 * Math.PI;

        const sx = (azRad / (2 * Math.PI)) * w;
        const altFrac = clamp(altDeg / 90, 0, 1);
        const sy = horizonY + (zenithY - horizonY) * altFrac;

        let starAlpha = magToAlpha(s.mag, limit);
        if (starAlpha <= 0.01) continue;

        if (altDeg < HORIZON_FADE_DEG) {
          starAlpha *= clamp(altDeg / HORIZON_FADE_DEG, 0, 1);
        }
        starAlpha *= airmassDimming(altDeg * DEG2RAD);

        if (twinkleOn) {
          const altFactor = 1 / (1 + Math.max(0.2, altDeg) * 0.08);
          const w1 = Math.sin(tSec * TWINKLE_SPEED * 2.1 + s.seed);
          const w2 = Math.sin(tSec * TWINKLE_SPEED * 3.7 + s.seed * 1.7);
          const wobble = (w1 * 0.6 + w2 * 0.4) * TWINKLE_AMPLITUDE * altFactor;
          starAlpha *= (1 + wobble);
        }

        starAlpha *= A;
        if (starAlpha <= 0.008) continue;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

        const r = 0.5 + starAlpha * 1.4;
        if (!Number.isFinite(r) || r <= 0) continue;

        ctx.globalAlpha = clamp(starAlpha, 0, 1);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        if (state.features.diffractionSpikes && starAlpha > 0.55) {
          const spike = r * 3.5;
          ctx.globalAlpha = clamp(starAlpha * 0.35, 0, 1);
          ctx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(sx - spike, sy); ctx.lineTo(sx + spike, sy);
          ctx.moveTo(sx, sy - spike); ctx.lineTo(sx, sy + spike);
          ctx.stroke();
        }

        if (visibleOut) {
          visibleOut.push({
            x: sx, y: sy, mag: s.mag, alt: altDeg, az: azRad,
            ra: s.ra, dec: s.dec, name: s.name
          });
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawMilkyWay(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                        horizonY, zenithY) {
    if (A < 0.02) return;
    const cosLst = Math.cos(lstRad), sinLst = Math.sin(lstRad);
    const samples = _galacticSamples;
    const n = samples.length;
    const projected = new Array(n);

    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const pr = applyMatrix(matrix, s.v.x, s.v.y, s.v.z);
      const x1 =  cosLst * pr.x + sinLst * pr.z;
      const y1 =  pr.y;
      const z1 = -sinLst * pr.x + cosLst * pr.z;

      const altSin = sinLat * y1 + cosLat * z1;
      let altDeg = Math.asin(clamp(altSin, -1, 1)) / DEG2RAD;
      altDeg += refractionDeg(altDeg);

      const lCosAbs = Math.abs(Math.cos(s.l));
      const widthFactor = 0.55 + 0.65 * lCosAbs;
      const brightness = 0.30 + 0.70 * (lCosAbs * lCosAbs);

      if (altDeg >= HORIZON_MARGIN_DEG) {
        const east = x1;
        const north = cosLat * y1 - sinLat * z1;
        let azRad = Math.atan2(east, north);
        if (azRad < 0) azRad += 2 * Math.PI;
        const sx = (azRad / (2 * Math.PI)) * w;
        const altFrac = clamp(altDeg / 90, 0, 1);
        const sy = horizonY + (zenithY - horizonY) * altFrac;
        let fade = 1;
        if (altDeg < HORIZON_FADE_DEG) {
          fade = clamp(altDeg / HORIZON_FADE_DEG, 0, 1);
        }
        projected[i] = { x: sx, y: sy, visible: true, widthFactor, brightness: brightness * fade };
      } else {
        projected[i] = { visible: false };
      }
    }

    const runs = [];
    let cur = null;
    for (let i = 0; i < n; i++) {
      const p = projected[i];
      if (p.visible) {
        if (!cur) cur = { pts: [] };
        cur.pts.push(p);
      } else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);
    if (runs.length > 1) {
      const first = runs[0], last = runs[runs.length - 1];
      if (first.pts[0] === projected[0] &&
          last.pts[last.pts.length - 1] === projected[n - 1]) {
        first.pts = last.pts.concat(first.pts);
        runs.pop();
      }
    }
    if (runs.length === 0) return;

    const baseWidth = Math.max(20, h * 0.075);

    for (let r = 0; r < runs.length; r++) {
      const pts = runs[r].pts;
      if (pts.length < 2) continue;

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const width = baseWidth * (a.widthFactor + b.widthFactor) * 0.5;
        const bright = (a.brightness + b.brightness) * 0.5;
        const alpha = 0.055 * bright * A;
        ctx.strokeStyle = `rgba(210, 220, 240, ${alpha.toFixed(4)})`;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) continue;
        const px = -dy / len, py = dx / len;
        const width = baseWidth * (a.widthFactor + b.widthFactor) * 0.5;
        const offset = Math.sin(i * 0.35) * width * 0.12;
        const cx = (a.x + b.x) * 0.5 + px * offset;
        const cy = (a.y + b.y) * 0.5 + py * offset;
        const bright = (a.brightness + b.brightness) * 0.5;
        const dustAlpha = 0.06 * bright * A;
        ctx.strokeStyle = `rgba(20, 26, 44, ${dustAlpha.toFixed(4)})`;
        ctx.lineWidth = Math.max(1.5, width * 0.22);
        ctx.beginPath();
        ctx.moveTo(cx - dx * 0.5, cy - dy * 0.5);
        ctx.lineTo(cx + dx * 0.5, cy + dy * 0.5);
        ctx.stroke();
      }
    }

    const centerSample = projected[0];
    if (centerSample && centerSample.visible &&
        Number.isFinite(centerSample.x) && Number.isFinite(centerSample.y)) {
      const gcx = centerSample.x, gcy = centerSample.y;
      const radius = baseWidth * 3.5;
      const halo = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, radius);
      halo.addColorStop(0, `rgba(240, 230, 200, ${(0.075 * A).toFixed(4)})`);
      halo.addColorStop(0.5, `rgba(220, 215, 200, ${(0.035 * A).toFixed(4)})`);
      halo.addColorStop(1, 'rgba(200, 200, 190, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(gcx, gcy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawZodiacalLight(ctx, w, h, matrix, lstRad, sinLat, cosLat, A) {
    if (!state.features.zodiacal) return;
    if (A < 0.05) return;
    const sunAlt = state.sky && Number.isFinite(state.sky.sun && state.sky.sun.elevation)
      ? state.sky.sun.elevation : -30;
    if (sunAlt > -5 || sunAlt < -35) return;

    const horizonY = h * 0.72;
    const zenithY  = -h * 0.10;
    const cosLst = Math.cos(lstRad), sinLst = Math.sin(lstRad);
    let cx = 0, cy = 0, n = 0;

    for (let i = 0; i < _eclipticSamples.length; i++) {
      const s = _eclipticSamples[i];
      const p = applyMatrix(matrix, s.v.x, s.v.y, s.v.z);
      const x1 =  cosLst * p.x + sinLst * p.z;
      const y1 =  p.y;
      const z1 = -sinLst * p.x + cosLst * p.z;
      const altSin = sinLat * y1 + cosLat * z1;
      const altDeg = Math.asin(clamp(altSin, -1, 1)) / DEG2RAD;
      if (altDeg < 5) continue;
      const east = x1;
      const north = cosLat * y1 - sinLat * z1;
      let azRad = Math.atan2(east, north);
      if (azRad < 0) azRad += 2 * Math.PI;
      const sx = (azRad / (2 * Math.PI)) * w;
      const altFrac = clamp(altDeg / 90, 0, 1);
      const sy = horizonY + (zenithY - horizonY) * altFrac;
      cx += sx; cy += sy; n++;
    }
    if (n < 4) return;
    cx /= n; cy /= n;

    const r = Math.min(w, h) * 0.35;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(220, 210, 180, ${(0.06 * A).toFixed(4)})`);
    grad.addColorStop(0.5, `rgba(180, 180, 170, ${(0.025 * A).toFixed(4)})`);
    grad.addColorStop(1, 'rgba(160, 160, 160, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDeepSky(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                       horizonY, zenithY) {
    if (A < 0.02) return;
    const baseW = Math.max(8, h * 0.02);
    for (let i = 0; i < DEEP_SKY.length; i++) {
      const d = DEEP_SKY[i];
      const raRad = d.ra * 15 * DEG2RAD;
      const decRad = d.dec * DEG2RAD;
      const pr = projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                                   horizonY, zenithY, raRad, decRad, true);
      if (!pr || !Number.isFinite(pr.sx) || !Number.isFinite(pr.sy)) continue;
      if (pr.altDeg < HORIZON_MARGIN_DEG) continue;

      let alpha = d.alpha * A * airmassDimming(pr.altDeg * DEG2RAD);
      if (pr.altDeg < HORIZON_FADE_DEG) {
        alpha *= clamp(pr.altDeg / HORIZON_FADE_DEG, 0, 1);
      }
      if (alpha < 0.02) continue;

      const rx = baseW * d.rx;
      const ry = baseW * d.ry;
      ctx.save();
      ctx.translate(pr.sx, pr.sy);
      ctx.rotate((d.rot || 0) * DEG2RAD);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
      grad.addColorStop(0,   `rgba(${d.color[0]},${d.color[1]},${d.color[2]},${alpha.toFixed(3)})`);
      grad.addColorStop(0.5, `rgba(${d.color[0]},${d.color[1]},${d.color[2]},${(alpha * 0.4).toFixed(3)})`);
      grad.addColorStop(1,   `rgba(${d.color[0]},${d.color[1]},${d.color[2]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawConstellations(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                              horizonY, zenithY) {
    if (A < 0.05) return;
    ctx.save();
    ctx.strokeStyle = `rgba(180, 200, 230, ${(0.22 * A).toFixed(3)})`;
    ctx.lineWidth = 0.6;
    ctx.lineCap = 'round';
    for (let c = 0; c < CONSTELLATION_LINES.length; c++) {
      const line = CONSTELLATION_LINES[c];
      let prev = null;
      for (let i = 0; i < line.length; i++) {
        const [raH, decD] = line[i];
        const pr = projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                                     horizonY, zenithY,
                                     raH * 15 * DEG2RAD, decD * DEG2RAD, true);
        if (!pr || pr.altDeg < HORIZON_MARGIN_DEG) { prev = null; continue; }
        if (prev) {
          ctx.beginPath();
          ctx.moveTo(prev.sx, prev.sy);
          ctx.lineTo(pr.sx, pr.sy);
          ctx.stroke();
        }
        prev = pr;
      }
    }
    ctx.restore();
  }

  function drawStarLabels(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                          horizonY, zenithY) {
    if (A < 0.15) return;
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = `rgba(220, 230, 245, ${(0.7 * A).toFixed(3)})`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < BRIGHT_STAR_NAMES.length; i++) {
      const s = BRIGHT_STAR_NAMES[i];
      const pr = projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                                   horizonY, zenithY,
                                   s.ra * 15 * DEG2RAD, s.dec * DEG2RAD, true);
      if (!pr || pr.altDeg < 10) continue;
      ctx.fillText(s.name, pr.sx + 6, pr.sy);
    }
    ctx.restore();
  }

  function getMoonEquatorial(date) {
    const S = global.Solar;
    if (!S || typeof S.getMoonPosition !== 'function') return null;
    try {
      const lat = state.location ? state.location.lat : 0;
      const lon = state.location ? state.location.lon : 0;
      const pos = S.getMoonPosition(lat, lon, date);
      if (!pos || !Number.isFinite(pos.elevation) || !Number.isFinite(pos.azimuth)) return null;

      const latR = lat * DEG2RAD;
      const altR = pos.elevation * DEG2RAD;
      const azR  = pos.azimuth * DEG2RAD;
      const sinDec = Math.sin(altR) * Math.sin(latR) + Math.cos(altR) * Math.cos(latR) * Math.cos(azR);
      const decR = Math.asin(clamp(sinDec, -1, 1));
      const cosDec = Math.cos(decR);
      let haR;
      if (Math.abs(cosDec) < 1e-9) {
        haR = 0;
      } else {
        const cosHa = (Math.sin(altR) - Math.sin(latR) * sinDec) / (Math.cos(latR) * cosDec);
        haR = Math.acos(clamp(cosHa, -1, 1));
        if (Math.sin(azR) < 0) haR = -haR;
      }
      const lstRad = localSiderealTimeRad(date, lon);
      const ra = lstRad - haR;
      return { ra, dec: decR };
    } catch (_) {
      return null;
    }
  }

  /* v2.9 — drawMoon with correct illuminated-ellipse terminator.
     The illuminated limb is a half-disc. The shadow is an
     ellipse whose semi-minor axis is r * |1 - 2*phase|, drawn
     against the side opposite the sun. This is what you actually
     see, and it matches the moon sprite used by hero-globe.js
     and hero-tooltip.js. */
    function drawMoon(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                    horizonY, zenithY, date) {
    if (A < 0.02) return;

    /* ★ FIX: The moon should never be visible during the day.
       Only draw the moon if the sun is below the horizon (elevation < 0). */
    const sunElev = (state.sky && state.sky.sun && Number.isFinite(state.sky.sun.elevation)) 
      ? state.sky.sun.elevation 
      : 0;
      
    if (sunElev > 0) {
      state.lastMoon = null;
      return;
    }

    const m = getMoonPosition(date);
    if (!m || !Number.isFinite(m.elevation)) return;
    if (m.elevation < HORIZON_MARGIN_DEG) { state.lastMoon = null; return; }


    const pos = getMoonEquatorial(date);
    if (!pos) { state.lastMoon = null; return; }

    const pr = projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                                 horizonY, zenithY, pos.ra, pos.dec, true);
    if (!pr || pr.altDeg < HORIZON_MARGIN_DEG) { state.lastMoon = null; return; }
    if (!Number.isFinite(pr.sx) || !Number.isFinite(pr.sy)) { state.lastMoon = null; return; }

    let alpha = A * airmassDimming(pr.altDeg * DEG2RAD);
    if (pr.altDeg < HORIZON_FADE_DEG) {
      alpha *= clamp(pr.altDeg / HORIZON_FADE_DEG, 0, 1);
    }
    if (alpha < 0.02) { state.lastMoon = null; return; }

    /* Larger, still proportionate lunar disc for mobile and desktop. */
    const r = Math.max(28, Math.min(86, Math.min(w, h) * 0.105));
    const glowR = r * 2.35;

    const halo = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, glowR);
    halo.addColorStop(0, `rgba(220, 225, 240, ${(0.25 * alpha).toFixed(3)})`);
    halo.addColorStop(0.4, `rgba(180, 190, 220, ${(0.10 * alpha).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(120, 140, 180, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha;

    /* Solar phase convention: 0=new, .25=first quarter,
       .5=full, .75=last quarter and 1=new again. */
    const phase = ((Number(m.phase) % 1) + 1) % 1;
    const disc = ctx.createRadialGradient(
      pr.sx - r * .28, pr.sy - r * .34, r * .08,
      pr.sx + r * .12, pr.sy + r * .10, r * 1.15
    );
    disc.addColorStop(0, 'rgba(103, 111, 128, 1)');
    disc.addColorStop(.72, 'rgba(54, 61, 76, 1)');
    disc.addColorStop(1, 'rgba(25, 31, 43, 1)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
    ctx.clip();

    const waxing = phase < .5;
    const rightSide = waxing;
    const halfX = rightSide ? pr.sx : pr.sx - r;
    const litGradient = ctx.createLinearGradient(pr.sx - r, pr.sy - r, pr.sx + r, pr.sy + r);
    litGradient.addColorStop(0, '#c9c9c1');
    litGradient.addColorStop(.48, '#f4f1e7');
    litGradient.addColorStop(1, '#d8d6cc');

    ctx.save();
    ctx.beginPath();
    ctx.rect(halfX, pr.sy - r, r, r * 2);
    ctx.clip();
    ctx.fillStyle = litGradient;
    ctx.fillRect(pr.sx - r, pr.sy - r, r * 2, r * 2);

    let terminatorRx = 0;
    let terminatorFill = 'bright';
    let terminatorSide = rightSide ? 'right' : 'left';

    if (phase < .25) {
      terminatorRx = Math.cos(phase * Math.PI * 2) * r;
      terminatorFill = 'dark';
      terminatorSide = 'right';
    } else if (phase < .5) {
      terminatorRx = -Math.cos(phase * Math.PI * 2) * r;
      terminatorFill = 'bright';
      terminatorSide = 'left';
    } else if (phase < .75) {
      terminatorRx = -Math.cos(phase * Math.PI * 2) * r;
      terminatorFill = 'bright';
      terminatorSide = 'right';
    } else {
      terminatorRx = Math.cos(phase * Math.PI * 2) * r;
      terminatorFill = 'dark';
      terminatorSide = 'left';
    }

    if (terminatorRx > .25) {
      ctx.save();
      ctx.beginPath();
      const clipX = terminatorSide === 'right' ? pr.sx : pr.sx - r;
      ctx.rect(clipX, pr.sy - r, r, r * 2);
      ctx.clip();
      ctx.fillStyle = terminatorFill === 'bright' ? litGradient : 'rgba(43, 49, 63, 1)';
      ctx.beginPath();
      ctx.ellipse(pr.sx, pr.sy, Math.min(r, terminatorRx), r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = .12 * alpha;
    const craters = [
      [-.34, -.42, .12], [.27, -.28, .09], [-.08, -.04, .17],
      [.39, .19, .075], [-.32, .34, .11], [.10, .49, .07]
    ];
    craters.forEach(([cx, cy, size]) => {
      const x = pr.sx + cx * r, y = pr.sy + cy * r, cr = size * r;
      const shade = ctx.createRadialGradient(x - cr * .25, y - cr * .3, cr * .08, x, y, cr);
      shade.addColorStop(0, 'rgba(255,255,255,.42)');
      shade.addColorStop(.72, 'rgba(90,94,101,.20)');
      shade.addColorStop(1, 'rgba(35,40,50,.45)');
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.restore();

    ctx.globalAlpha = 1;


    if (alpha > 0.35 && w > 720) {
      ctx.save();
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = `rgba(220, 230, 245, ${(0.75 * alpha).toFixed(3)})`;
      ctx.textBaseline = 'middle';
      ctx.fillText(prettifyPhase(m.phaseName), pr.sx + r + 8, pr.sy);
      ctx.restore();
    }

    state.lastMoon = {
      x: pr.sx, y: pr.sy, elevation: pr.altDeg, azimuth: pr.azRad,
      phase: m.phase, phaseName: m.phaseName, illumination: m.illumination,
      visible: true, altDeg: pr.altDeg, inSkyCanvas: true
    };
  }

  function prettifyPhase(name) {
    if (!name) return 'Moon';
    return String(name)
      .split('-')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }

  function drawPlanets(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                       horizonY, zenithY, date) {
    if (A < 0.01) return;
    const jd = core_jd(date);
    const planets = getAllPlanets(jd);

    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
      const pr = projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                                   horizonY, zenithY, p.ra, p.dec, true);
      if (!pr || pr.altDeg < HORIZON_MARGIN_DEG) continue;
      if (!Number.isFinite(pr.sx) || !Number.isFinite(pr.sy)) continue;

      let magAlpha;
      if (p.mag <= -3)      magAlpha = 1.0;
      else if (p.mag <= 0)  magAlpha = 0.9;
      else if (p.mag <= 2)  magAlpha = 0.7;
      else                  magAlpha = 0.5;

      if (pr.altDeg < HORIZON_FADE_DEG) {
        magAlpha *= clamp(pr.altDeg / HORIZON_FADE_DEG, 0, 1);
      }
      magAlpha *= airmassDimming(pr.altDeg * DEG2RAD);
      magAlpha *= A;
      if (magAlpha <= 0.02) continue;

      const brightFrac = clamp((2.5 - p.mag) / 5.0, 0, 1);
      let size = p.minSize + (p.maxSize - p.minSize) * brightFrac;
      if (!Number.isFinite(size) || size <= 0) size = p.minSize || 2;

      const glowR = size * 4;
      if (!Number.isFinite(glowR) || glowR <= 0) continue;

      ctx.save();
      const grad = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, glowR);
      grad.addColorStop(0,    `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${(magAlpha * 0.45).toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${(magAlpha * 0.14).toFixed(3)})`);
      grad.addColorStop(1,    `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.globalAlpha = magAlpha;
      ctx.fillStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, size, 0, Math.PI * 2);
      ctx.fill();

      if (state.features.diffractionSpikes &&
          (p.name === 'Venus' || p.name === 'Jupiter')) {
        const spike = size * 4;
        ctx.globalAlpha = magAlpha * 0.4;
        ctx.strokeStyle = `rgb(${p.color[0]},${p.color[1]},${p.color[2]})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(pr.sx - spike, pr.sy); ctx.lineTo(pr.sx + spike, pr.sy);
        ctx.moveTo(pr.sx, pr.sy - spike); ctx.lineTo(pr.sx, pr.sy + spike);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMeteors(ctx, w, h, matrix, lstRad, sinLat, cosLat, A,
                       horizonY, zenithY) {
    if (!state.features.meteors || state.reducedMotion) return;
    if (state.meteors.length === 0) return;

    const nowT = performance.now();
    const remaining = [];
    for (let i = 0; i < state.meteors.length; i++) {
      const m = state.meteors[i];
      const elapsed = nowT - m.startT;
      if (elapsed > m.duration) continue;
      remaining.push(m);

      const t = elapsed / m.duration;
      let alpha = (t < 0.3 ? t / 0.3 : (1 - (t - 0.3) / 0.7));
      if (alpha <= 0) continue;

      const ang = m.seed;
      const distFromRadiant = t * m.length;
      const radPr = projectEquatorial(matrix, lstRad, sinLat, cosLat, w, h,
                                      horizonY, zenithY,
                                      m.radiant.ra * 15 * DEG2RAD,
                                      m.radiant.dec * DEG2RAD, true);
      if (!radPr || radPr.altDeg < 5) continue;

      const dx = Math.cos(ang) * distFromRadiant;
      const dy = Math.sin(ang) * distFromRadiant;
      const head = { x: radPr.sx + dx, y: radPr.sy + dy };
      const tailFrac = 0.35;
      const tail = { x: radPr.sx + dx * (1 - tailFrac), y: radPr.sy + dy * (1 - tailFrac) };

      const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      grad.addColorStop(0, 'rgba(255, 240, 220, 0)');
      grad.addColorStop(0.6, `rgba(255, 240, 220, ${(alpha * 0.7 * A).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255, 255, 255, ${(alpha * A).toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
    state.meteors = remaining;
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
      maybeSpawnMeteor();
      scheduleRender();
    }, REDRAW_INTERVAL_MS);
  }
  function stopRedrawTimer() {
    if (state.redrawTimer) {
      clearInterval(state.redrawTimer);
      state.redrawTimer = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     Location sync — v2.9
     ═══════════════════════════════════════════════════════════ */
  function _locationKey(loc) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
    return [
      String(loc.id || ''),
      Number(loc.lat).toFixed(4),
      Number(loc.lon).toFixed(4),
      String(loc.tz || '')
    ].join('|');
  }

  function _applyLocationLocally(loc, force) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return false;
    const key = _locationKey(loc);
    if (!key) return false;

    if (!force && state._lastAppliedLocation === key) {
      /* Same location — skip. */
      return false;
    }

    state._lastAppliedLocation = key;
    state._lastAppliedAt = Date.now();

    state.location = {
      lat: loc.lat,
      lon: loc.lon,
      tz: loc.tz || 'UTC',
      name: loc.name || loc.label || ''
    };

    api.refreshSkyFromSolar();
    scheduleRender();
    emit('locationChanged', state.location);
    return true;
  }

  function _bindHeroLocationListener() {
    if (state._heroLocationListener) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    state._heroLocationListener = function (e) {
      const detail = e && e.detail;
      if (!detail) return;
      const loc = {
        id:   detail.id || 'user-weather',
        name: detail.name || detail.label || 'My location',
        lat:  Number(detail.lat),
        lon:  Number(detail.lon),
        tz:   detail.tz || ''
      };
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;
      _applyLocationLocally(loc, false);
    };

    window.addEventListener('viora:hero-location-change', state._heroLocationListener);
  }

  function _unbindHeroLocationListener() {
    if (!state._heroLocationListener) return;
    if (typeof window === 'undefined' || typeof window.removeEventListener !== 'function') return;
    window.removeEventListener('viora:hero-location-change', state._heroLocationListener);
    state._heroLocationListener = null;
  }

  /* ═══════════════════════════════════════════════════════════
     Public API
     ═══════════════════════════════════════════════════════════ */
  const api = {
    version: '2.9',

    init(opts) {
      if (state.destroyed) return api;
      opts = opts || {};

      if (opts.features) {
        for (const k in opts.features) {
          if (Object.prototype.hasOwnProperty.call(opts.features, k)) {
            state.features[k] = !!opts.features[k];
          }
        }
      }
      if (opts.seed != null) {
        state.seed = opts.seed | 0;
        state.prng = makePRNG(state.seed);
      }

      if (opts.location) api.setLocation(opts.location);
      if (opts.sky)      api.setSkyState(opts.sky);
      else               api.refreshSkyFromSolar();

      if (!state.bound) {
        state.bound = true;
        window.addEventListener('resize', () => scheduleRender());
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && state.sky) scheduleRender();
        });
      }

      /* v2.9 — subscribe to location changes from hero-banner.js
         and dashboard-weather.js. */
      _bindHeroLocationListener();

      startRedrawTimer();
      scheduleRender();
      return api;
    },

    setLocation(loc) {
      return _applyLocationLocally(loc, false) ? api : api;
    },

    setSkyState(sky) {
      state.sky = sky || null;
      let target = 0;
      let moonTarget = 0;

          /* ★ FIX: Force stars to 100% opacity if it's night, 
         regardless of what Solar.getSkyState calculates. */
      if (sky && typeof sky.isNight === 'boolean') {
        target = sky.isNight ? 1.0 : 0;
      } else if (sky && sky.stars && Number.isFinite(sky.stars.opacity)) {
        target = clamp(sky.stars.opacity, 0, 1);
      }

      if (sky && sky.sun && Number.isFinite(sky.sun.elevation)) {
        const sunElev = sky.sun.elevation;
        if (sunElev > -12) {
          target = Math.min(target, Math.max(0, (-12 - sunElev) / 6));
        }
        if (sunElev >= 0) target = 0;
      }

      if (sky && sky.moon && sky.moon.visible) {
        const sunElev = sky.sun && Number.isFinite(sky.sun.elevation) ? sky.sun.elevation : -30;
        if (sunElev <= -6) {
          moonTarget = 1;
        } else if (sunElev <= 0) {
          moonTarget = Math.max(0, (-sunElev) / 6);
        }
      }

      const rounded = Math.round(target * 20) / 20;
      if (rounded !== state._lastSetAlpha) {
        if (state._lastSetAlpha < 0 ||
            Math.abs(rounded - state._lastSetAlpha) >= 0.02) {
          state._lastSetAlpha = rounded;
          state.starAlpha = rounded;
        }
      }
      state.moonAlpha = clamp(moonTarget, 0, 1);

      scheduleRender();
      return api;
    },

    refreshSkyFromSolar() {
      if (!state.location) return api;
      const S = global.Solar;
      if (!S || typeof S.getSkyState !== 'function') return api;
      try {
        const now = (typeof global.__vioraNow === 'function')
          ? global.__vioraNow()
          : nowFn();
        const sky = S.getSkyState(state.location.lat, state.location.lon, now);
        api.setSkyState(sky);
      } catch (_) {}
      return api;
    },

    renderNow() { scheduleRender(); return api; },

    isReady() {
      return !!(state.canvas && state.catalogReady && state.location);
    },

    getVisibleStars() { return state.lastProjection.slice(); },

    getVisibleMoon() {
      if (!state.lastMoon) return null;
      return { ...state.lastMoon };
    },

    on(name, cb) {
      if (!name || typeof cb !== 'function') return api;
      if (!state.listeners[name]) state.listeners[name] = [];
      state.listeners[name].push(cb);
      return api;
    },
    off(name, cb) {
      const arr = state.listeners[name];
      if (!arr) return api;
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
      return api;
    },

    destroy() {
      state.destroyed = true;
      stopRedrawTimer();
      _unbindHeroLocationListener();
      if (state.canvas && state.canvas.parentNode) {
        state.canvas.parentNode.removeChild(state.canvas);
      }
      state.canvas = null;
      state.ctx = null;
      state.stars = null;
      state.starsByBucket = null;
      state.catalogReady = false;
      state._lastAppliedLocation = null;
      state.lastMoon = null;
    },

    /* v2.9 — expose the internal catalog loader so callers can
       force a reload after hero-globe.js finishes fetching
       stars.bin. */
    refreshCatalog() {
      ensureCatalog(true);
      scheduleRender();
      return api;
    },

    debug: {
      state,
      localSiderealTimeRad,
      magToAlpha,
      airmassDimming,
      bvToRGB,
      refractionDeg,
      getPrecessMatrix,
      applyMatrix,
      _render: render,
      getMoonPosition,
      getMoonEquatorial,
      prettifyPhase,

      PLANET_ELEMENTS,
      PLANET_ORDER,
      getAllPlanets,
      planetPosition,
      _planetCache,
      roughMagnitude,
      solveKepler,
      _drawPlanets: drawPlanets,
      _drawMoon: drawMoon,

      GAL_TO_EQ_M,
      galacticToEquatorial,
      sampleGalacticEquator,
      _galacticSamples,
      _drawMilkyWay: drawMilkyWay,

      CONSTELLATION_LINES,
      BRIGHT_STAR_NAMES,
      DEEP_SKY,

      _drawMeteors: drawMeteors,
      _drawDeepSky: drawDeepSky,
      _drawConstellations: drawConstellations,
      _drawStarLabels: drawStarLabels,
      _drawZodiacalLight: drawZodiacalLight,

      ensureCatalog,
      _catalogSource,
      _lastAppliedLocation: () => state._lastAppliedLocation,

      setSeed(s) { state.seed = s | 0; state.prng = makePRNG(state.seed); },
      stats() {
        return {
          starsDrawn: state.lastProjection.length,
          starMagLimit: state.starMagLimit,
          starAlpha: state.starAlpha,
          moonAlpha: state.moonAlpha,
          lastMoon: state.lastMoon,
          hasCanvas: !!state.canvas,
          hasCatalog: state.catalogReady,
          catalogSource: state._catalogSource,
          hasLocation: !!state.location,
          location: state.location ? { ...state.location } : null,
          lastAppliedLocation: state._lastAppliedLocation,
          features: { ...state.features }
        };
      }
    }
  };

  Object.defineProperty(global, 'VioraSky', {
    value: api,
    writable: false,
    configurable: true
  });

})(typeof window !== 'undefined' ? window : globalThis);
