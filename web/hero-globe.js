/* ═══════════════════════════════════════════════════════════════
   hero-globe.js — realistic rotating globe with real continents
   ─────────────────────────────────────────────────────────────
   v6.1 — location-follows-banner, event-driven sync

   v6.1 changes vs v6.0:
     • GLOBE FOLLOWS BANNER. The globe now reacts to BOTH of
       the ways hero-banner.js announces a location change:
         1. VioraHeroGlobe.setLocation(lon, lat, opts) — direct
         2. window event 'viora:hero-location-change'  — broadcast
       Both are deduped through _lastAppliedLocation, so calling
       both for one user pick is a no-op on the second call.

     • DEDUPE GUARD. setLocation() and flyTo() both honour
       _lastAppliedLocation (rounded to 4 decimals). A pick that
       arrives twice — once from hero-banner.js's _applyLocation
       and once from dashboard-weather.js's saveWeatherLocation
       dispatch — no longer spins the globe twice.

     • FLYTO 250 ms WINDOW. The v6.0 dedupe window was 150 ms
       and matched on raw target rotation. v6.1 widens it to
       250 ms and matches on the rounded target rotation, which
       catches the double-fire that happens when the location
       event and the direct call land within one animation frame.

     • HERO-LOCATION LISTENER. _bindHeroLocationListener() is
       installed on init() and removed on destroy(). It calls
       setLocation() with force-seed so the pin actually moves.

     • _waitForSize(). If getBoundingClientRect() returns 0×0
       (CSS hasn't applied yet, banner is display:none, etc.),
       retry up to 60 frames. Logs one warning if it gives up.

     • setSpin(true) respects state.reducedMotion.

     • setLocation() calls restartRaf() unconditionally.

   Everything else — atlas loader, projection, terminator,
   moon sprite, stars, arcs, pins — is unchanged from v6.0.

   Public API (window.VioraHeroGlobe):
     init(opts)                       — mount + start RAF
     destroy()                        — tear down
     setSkyState(sky)                 — feed sun/moon state
     setLocation(lon, lat, opts)      — fly to a new pin
     focusQuickCity(id)               — fly to a preset city
     addPin(lon, lat, opts)           — add an extra pin
     clearPins()
     addArc(from, to)
     clearArcs()
     flyTo(lon, lat, ms)
     setSpin(speed)                   — speed | false
     setTheme(theme)
     setZoom(z)
     pause() / resume()
     toDataURL(type, quality)
     toBlob(cb, type, quality)
     preload(opts)
     ready                            — Promise<geometry|null>
     _state, _subsolarPoint, _sunVector, _starCatalog,
     _precess, _precessMatrix, _rotationFor, _lonLatToVec,
     _atlasSource, _coastlineRuns, _starCount,
     _starProjectionAge, _countrySphereCount, debug

   Load order:
     hero-solar.js → hero-globe.js → hero-sky.js → hero-banner.js
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     Config
     ───────────────────────────────────────────────────────── */
  const ATLAS_URL_110M = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
  const ATLAS_URL_50M  = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
  const TOPO_URL       = 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';
  const COASTLINE_FALLBACK = '/main/ne_110m_coastline.geojson';
  const STARS_URL      = '/main/stars.bin';

  const SESSION_KEY    = 'viora.globe.atlas.v6';
  const SESSION_TTL_MS = 6 * 60 * 60 * 1000;

  const AUTO_SPIN_RATE = 0; /* v6.1 — no auto-spin: terminator stays locked to real sun */
  const STAR_DRIFT_THRESHOLD = 0.002;
  const MOON_SPRITE_QUANT = 40;      // illumination is quantized to 1/N
  const MOON_MAGNIFICATION = 30;
  const MOON_MAX_PX = 28;
  const MOON_MIN_PX = 3;
  const STAR_MAG_MIN = -1.5;
  const STAR_MAG_MAX = 6.0;

  /* v6.1 — flyTo dedupe window. 250 ms catches the double-fire
     when hero-banner.js calls setLocation() and the location
     event lands in the same animation frame. */
  const FLYTO_DEDUPE_MS = 250;

  /* v6.1 — how long _waitForSize() will retry before giving up. */
  const WAIT_FOR_SIZE_MAX_FRAMES = 60;

  const HOME_LOCATION = Object.freeze({
    id:   'meru',
    name: 'Meru, Kenya',
    lat:  -0.04626,
    lon:  37.65587,
    tz:   'Africa/Nairobi'
  });

  const DEFAULT_THEME = {
    oceanInner:   '#1e4f78',
    oceanMid:     '#0d2844',
    oceanOuter:   '#02080f',
    land:         'rgba(58, 132, 142, 0.62)',
    landNight:    'rgba(20, 40, 60, 0.75)',
    coastline:    'rgba(170, 235, 245, 0.9)',
    border:       'rgba(255, 255, 255, 0.55)',
    rim:          'rgba(34, 211, 238, 0.55)',
    accent:       '#22d3ee',
    pinCore:      '#22d3ee',
    pinDot:       '#ffffff',
    arc:          'rgba(250, 204, 21, 0.75)',
    nightCore:    'rgba(2, 6, 22, 0.82)',
    twilight:     'rgba(255, 175, 90, 0.42)',
    terminator:   'rgba(255, 205, 130, 0.75)',
    grid:         'rgba(255, 255, 255, 0.13)',
    star:         'rgba(255, 255, 255, 0.9)'
  };

  /* ─────────────────────────────────────────────────────────
     Vector math
     ───────────────────────────────────────────────────────── */
  function lonLatToVec(lon, lat) {
    const phi   = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return {
      x: -Math.sin(phi) * Math.cos(theta),
      y:  Math.cos(phi),
      z:  Math.sin(phi) * Math.sin(theta)
    };
  }

  function raDecToVec(raHours, decDeg) {
    const ra  = raHours * 15 * Math.PI / 180;
    const dec = decDeg * Math.PI / 180;
    const cosDec = Math.cos(dec);
    return {
      x: cosDec * Math.cos(ra),
      y: Math.sin(dec),
      z: cosDec * Math.sin(ra)
    };
  }

  /* Precession matrix, cached per hour. */
  const _precessCache = { key: '', m: null };

  function _getPrecessionMatrix(date) {
    const hourKey = Math.floor(date.getTime() / 3600000);
    if (_precessCache.m && _precessCache.key === hourKey) return _precessCache.m;

    const T = ((date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000) / 36525;
    const zeta  = (2306.2181 * T + 0.30188 * T * T) / 3600 * Math.PI / 180;
    const z     = (2306.2181 * T + 1.09468 * T * T) / 3600 * Math.PI / 180;
    const theta = (2004.3109 * T - 0.42665 * T * T) / 3600 * Math.PI / 180;

    const cz = Math.cos(zeta), sz = Math.sin(zeta);
    const ct = Math.cos(theta), st = Math.sin(theta);
    const cZ = Math.cos(z), sZ = Math.sin(z);

    const m = [
      cZ * cz * ct - sZ * sz,     cZ * sz * ct + sZ * cz,     cZ * st,
      -sZ * cz * ct - cZ * sz,    -sZ * sz * ct + cZ * cz,    -sZ * st,
      -cz * st,                   -sz * st,                    ct
    ];

    _precessCache.m = m;
    _precessCache.key = hourKey;
    return m;
  }

  function precessJ2000ToDate(vec, date) {
    const m = _getPrecessionMatrix(date);
    return {
      x: m[0] * vec.x + m[1] * vec.y + m[2] * vec.z,
      y: m[3] * vec.x + m[4] * vec.y + m[5] * vec.z,
      z: m[6] * vec.x + m[7] * vec.y + m[8] * vec.z
    };
  }

  function _precessMatrix(date) {
    return _getPrecessionMatrix(date instanceof Date ? date : new Date(date || Date.now()));
  }

  function rotationFor(lon, lat) {
    const v = lonLatToVec(lon, lat);
    return {
      rotation: Math.atan2(v.x, v.z),
      tilt:     Math.asin(Math.max(-1, Math.min(1, -v.y)))
    };
  }

  function shortestDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI)  d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  const HOME_CAM = rotationFor(HOME_LOCATION.lon, HOME_LOCATION.lat);

  /* ─────────────────────────────────────────────────────────
     State
     ───────────────────────────────────────────────────────── */
  const state = {
    canvas: null,
    ctx: null,
    dpr: 1,
    rotation: HOME_CAM.rotation,
    tilt: HOME_CAM.tilt,
    targetRotation: null,
    targetTilt: null,
    flyStart: 0,
    flyStartRotation: 0,
    flyStartTilt: 0,
    flyDuration: 0,
    velocity: 0,
    zoom: 1,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartRotation: 0,
    dragStartTilt: 0,
    dragLastX: 0,
    dragLastT: 0,
    bound: false,
    atlas: null,
    atlasUrl: null,
    atlasSource: 'pending',
    loading: false,
    rafId: null,
    lastFrame: 0,
    autoSpin: AUTO_SPIN_RATE,
    spinEnabled: true,
    userSpinDisabled: false,
    reducedMotion: false,
    pins: [{
      lon: HOME_LOCATION.lon,
      lat: HOME_LOCATION.lat,
      label: HOME_LOCATION.name,
      id: 'primary'
    }],
    arcs: [],
    theme: { ...DEFAULT_THEME },
    events: new Map(),
    metrics: null,
    liveRegion: null,
    _useOffscreen: false,
    _blit: null,
    _bundled: false,
    _lastSize: { w: 0, h: 0 },
    _lastDpr: 0,
    _cachedLabelWidths: new Map(),
    _heroVisible: true,
    _sunVecCache: { at: 0, vec: null },
    _skyCache: { at: 0, sky: null },
    _scratch: { projected: [] },
      /* Moon sprite */
    moon: null,
    moonSprite: null,
    moonSpriteKey: '',
    /* Real sun elevation, drives the terminator darkness */
    sunElev: 0,
    /* Star table (loaded once) */
    stars: null,
    starsLoading: null,
    /* Canvas cache */
    _starProjection: null,
    /* ResizeObserver */
    _resizeObserver: null,
    _visObserver: null,
    /* Initial pin seeded flag */
    _pinSeeded: false,
    /* v6.1 — location-follows-banner dedupe */
    _lastAppliedLocation: null,
    _heroLocationListener: null,
    _sizeWaitCount: 0,
    _sizeWarned: false
  };

  let readyResolve;
  const readyPromise = new Promise(res => { readyResolve = res; });
  readyPromise.catch(() => {});

  /* ─────────────────────────────────────────────────────────
     Feature detection
     ───────────────────────────────────────────────────────── */
  function detectSupport() {
    if (typeof window === 'undefined') return false;
    const c = document.createElement('canvas');
    if (!c || !c.getContext) return false;
    return !!c.getContext('2d');
  }
  state.supported = detectSupport();
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';

  /* ─────────────────────────────────────────────────────────
     Event bus
     ───────────────────────────────────────────────────────── */
  function emit(name, payload) {
    const list = state.events.get(name);
    if (!list) return;
    for (const cb of list) {
      try { cb(payload); } catch (e) { console.warn('[hero-globe] listener error', e); }
    }
  }
  function on(name, cb) {
    if (!state.events.has(name)) state.events.set(name, new Set());
    state.events.get(name).add(cb);
    return () => off(name, cb);
  }
  function off(name, cb) {
    const list = state.events.get(name);
    if (list) list.delete(cb);
  }
  function track(evt, data) {
    try {
      if (typeof state.metrics === 'function') state.metrics(evt, data);
      else if (global.__vioraMetrics) global.__vioraMetrics(evt, data);
    } catch (_) {}
  }

  /* ─────────────────────────────────────────────────────────
     Reduced motion
     ───────────────────────────────────────────────────────── */
  function checkReducedMotion() {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    state.reducedMotion = mq.matches;
    if (mq.matches) state.spinEnabled = false;
    const handler = () => {
      state.reducedMotion = mq.matches;
      if (state.reducedMotion) state.spinEnabled = false;
      else if (!state.userSpinDisabled) state.spinEnabled = true;
      restartRaf();
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  /* ─────────────────────────────────────────────────────────
     Rotation math
     ───────────────────────────────────────────────────────── */
  function buildMatrix(rotY, tiltX) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    return [
      cy,        0,   -sy,
      sx * sy,   cx,   sx * cy,
      cx * sy,  -sx,   cx * cy
    ];
  }
  function applyMatrix(m, v) {
    return {
      x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
      y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
      z: m[6] * v.x + m[7] * v.y + m[8] * v.z
    };
  }
  function project(v, cx, cy, radius) {
    return {
      x: cx + v.x * radius,
      y: cy - v.y * radius,
      z: v.z,
      visible: v.z > 0
    };
  }

  /* ─────────────────────────────────────────────────────────
     Subsolar point (sun position on Earth's surface)
     ───────────────────────────────────────────────────────── */
  function subsolarPoint(date) {
    const d = date || ((typeof global.__vioraNow === 'function')
      ? global.__vioraNow()
      : new Date());
    const jd = d.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545.0;

    const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
    const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * Math.PI / 180;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    const eps = (23.439 - 0.0000004 * n) * Math.PI / 180;

    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const dec = Math.asin(Math.sin(eps) * sinLambda);
    const ra  = Math.atan2(Math.cos(eps) * sinLambda, cosLambda);

    const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
    const lst = gmst * 15 * Math.PI / 180;
    let H = lst - ra;
    H = ((H + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

    let lonDeg = -H * 180 / Math.PI;
    lonDeg = ((lonDeg + 540) % 360) - 180;
    const latDeg = dec * 180 / Math.PI;

    return { lat: latDeg, lon: lonDeg, declination: dec, hourAngle: H };
  }

  function sunVector(date) {
    const now = (typeof global.__vioraNowMs === 'function') ? global.__vioraNowMs() : Date.now();
    if (state._sunVecCache.vec && now - state._sunVecCache.at < 30000) {
      return state._sunVecCache.vec;
    }
    const s = subsolarPoint(date);
    const v = lonLatToVec(s.lon, s.lat);
    state._sunVecCache.vec = v;
    state._sunVecCache.at = now;
    return v;
  }

  /* ─────────────────────────────────────────────────────────
     Atlas loading
     ───────────────────────────────────────────────────────── */

  function splitAntimeridian(coords) {
    if (!coords || coords.length < 2) return [coords || []];
    const out = [];
    let cur = [coords[0]];
    for (let i = 1; i < coords.length; i++) {
      const lo1 = coords[i - 1][0];
      const lo2 = coords[i][0];
      if (Math.abs(lo2 - lo1) > 180) {
        out.push(cur);
        cur = [coords[i]];
      } else {
        cur.push(coords[i]);
      }
    }
    out.push(cur);
    return out;
  }

  function computeBoundingSphere(rings) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      for (let j = 0; j < r.length; j++) {
        const v = r[j];
        sx += v.x; sy += v.y; sz += v.z; n++;
      }
    }
    if (n === 0) return null;
    let cx = sx / n, cy = sy / n, cz = sz / n;
    const clen = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (clen < 1e-9) return null;
    cx /= clen; cy /= clen; cz /= clen;

    let maxAng = 0;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      for (let j = 0; j < r.length; j++) {
        const v = r[j];
        const dot = v.x * cx + v.y * cy + v.z * cz;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (ang > maxAng) maxAng = ang;
      }
    }
    return { center: { x: cx, y: cy, z: cz }, cosAngularRadius: Math.cos(maxAng) };
  }

  function buildTopoGeometry(atlas, topojson) {
    const countries = topojson.feature(atlas, atlas.objects.countries);
    const borders = topojson.mesh(atlas, atlas.objects.countries, (a, b) => a !== b);

    const countryRings = [];
    for (const f of countries.features) {
      const rings = [];
      const push = coords => {
        for (const part of splitAntimeridian(coords)) {
          if (part.length >= 3) {
            rings.push(part.map(([lo, la]) => lonLatToVec(lo, la)));
          }
        }
      };
      if (!f.geometry) continue;
      if (f.geometry.type === 'Polygon') {
        f.geometry.coordinates.forEach(push);
      } else if (f.geometry.type === 'MultiPolygon') {
        f.geometry.coordinates.forEach(poly => poly.forEach(push));
      }
      if (rings.length) {
        const sphere = computeBoundingSphere(rings);
        countryRings.push({ rings, sphere });
      }
    }

    const borderSegments = [];
    for (const line of borders.coordinates) {
      for (const part of splitAntimeridian(line)) {
        if (part.length >= 2) {
          borderSegments.push(part.map(([lo, la]) => lonLatToVec(lo, la)));
        }
      }
    }
    return { countryRings, borderSegments, source: 'cdn-topo' };
  }

  function buildGeoJSONGeometry(geojson) {
    const lines = geojson && Array.isArray(geojson.features) ? geojson.features : [];
    const rings = [];
    for (const f of lines) {
      if (!f || !f.geometry) continue;
      if (f.geometry.type !== 'LineString') continue;
      for (const part of splitAntimeridian(f.geometry.coordinates || [])) {
        if (part.length >= 2) {
          rings.push(part.map(([lo, la]) => lonLatToVec(lo, la)));
        }
      }
    }
    const sphere = computeBoundingSphere(rings);
    return {
      countryRings: [{ rings, sphere }],
      borderSegments: [],
      source: 'coastline',
    };
  }

  function saveToSession(geometry) {
    try {
      if (typeof sessionStorage === 'undefined') return;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        at: Date.now(),
        source: geometry.source
      }));
    } catch (_) {}
  }

  let _geometryAppliedOnce = false;

  function applyGeometry(geometry) {
    if (!geometry) return;
    if (_geometryAppliedOnce && state.atlas &&
        state.atlas.countryRings.length === geometry.countryRings.length &&
        state.atlasSource === geometry.source) {
      return;
    }
    _geometryAppliedOnce = true;
    state.atlas = geometry;
    state.atlasSource = geometry.source;
    emit('atlasLoaded', { count: geometry.countryRings.length, source: geometry.source });
    track('globe.atlas.ok', { source: geometry.source });
    if (!state._pinSeeded) {
      state._pinSeeded = true;
      seedPinFromLocation(resolveHomeLocation(), { force: false });
    }
    readyResolve(geometry);
  }

  async function loadFallbackCoastline() {
    try {
      const res = await fetch(COASTLINE_FALLBACK, { cache: 'force-cache' });
      if (!res.ok) throw new Error('coastline http ' + res.status);
      const json = await res.json();
      const geometry = buildGeoJSONGeometry(json);
      applyGeometry(geometry);
      console.info('[hero-globe] fallback coastline loaded:',
        geometry.countryRings[0].rings.length, 'rings');
      return geometry;
    } catch (e) {
      console.warn('[hero-globe] fallback coastline failed', e && e.message);
      readyResolve(null);
      return null;
    }
  }

  let _pendingAtlasUrl = null;

  async function loadAtlas(opts) {
    opts = opts || {};
    const url = opts.atlasUrl || ATLAS_URL_110M;
    if (state.loading) { _pendingAtlasUrl = url; return; }
    if (state.atlas && state.atlasUrl === url && !opts.bundledAtlas && state.atlasSource === 'cdn-topo') {
      return;
    }
    state.loading = true;
    state.atlasUrl = url;

    try {
      let atlasRes, topojson;
      if (opts.bundledAtlas) {
        atlasRes = opts.bundledAtlas.topology || opts.bundledAtlas;
        topojson = opts.bundledAtlas.topojson || global.topojson;
        if (!topojson) throw new Error('bundledAtlas requires topojson client');
      } else {
        const [aRes, topo] = await Promise.all([
          fetch(url).then(r => {
            if (!r.ok) throw new Error('atlas http ' + r.status);
            return r.json();
          }),
          import(/* @vite-ignore */ TOPO_URL)
        ]);
        atlasRes = aRes;
        topojson = topo;
      }
      const geometry = buildTopoGeometry(atlasRes, topojson);
      applyGeometry(geometry);
      saveToSession(geometry);
      console.info('[hero-globe] CDN atlas loaded:', geometry.countryRings.length, 'countries');
    } catch (e) {
      console.warn('[hero-globe] CDN atlas unavailable, using fallback coastline:', e && e.message);
      emit('atlasFailed', { error: e, fallback: state.atlasSource });
      track('globe.atlas.fail', { url, message: String(e && e.message || e) });
      if (!state.atlas) await loadFallbackCoastline();
    } finally {
      state.loading = false;
      if (_pendingAtlasUrl && _pendingAtlasUrl !== state.atlasUrl) {
        const next = _pendingAtlasUrl;
        _pendingAtlasUrl = null;
        loadAtlas({ atlasUrl: next });
      }
    }
  }

  function resolveHomeLocation() {
    const candidates = [
      () => (global.state && global.state._heroLocation) || null,
      () => (global.VIORA_HERO_LOCATIONS && global.VIORA_HERO_LOCATIONS[0]) || null
    ];
    for (const get of candidates) {
      let loc;
      try { loc = get(); } catch (_) { loc = null; }
      if (loc && Number.isFinite(loc.lon) && Number.isFinite(loc.lat)) {
        return {
          id:   loc.id   || 'home',
          name: loc.name || loc.label || 'Home',
          lat:  loc.lat,
          lon:  loc.lon,
          tz:   loc.tz   || 'UTC'
        };
      }
    }
    return { ...HOME_LOCATION };
  }

  function seedPinFromLocation(loc, { force = false } = {}) {
    if (!loc) return;
    const hasPrimary = state.pins.some(p => p.id === 'primary');
    if (hasPrimary && !force) return;
    const existing = state.pins.find(p => p.id === 'primary');
    if (existing && existing.lat === loc.lat && existing.lon === loc.lon) return;
    state.pins = [{ lon: loc.lon, lat: loc.lat, label: loc.name, id: 'primary' }];
    updateAriaLabel();
  }

  /* ─────────────────────────────────────────────────────────
     Synthetic star catalog generator
     ───────────────────────────────────────────────────────── */
  function generateStarCatalog(count) {
    count = Number(count) > 0 ? Number(count) : 1500;
    const rnd = (function () {
      let s = 0xC0FFEE;
      return function () {
        s ^= s << 13; s |= 0;
        s ^= s >>> 17;
        s ^= s << 5;  s |= 0;
        return (s >>> 0) / 0xFFFFFFFF;
      };
    })();

    const stars = new Array(count);
    for (let i = 0; i < count; i++) {
      const ra = rnd() * 24;
      const sinDec = rnd() * 2 - 1;
      const dec = Math.asin(sinDec) * 180 / Math.PI;

      const u = rnd();
      let mag;
      if (u < 0.05)       mag = -1.5 + rnd() * 1.5;
      else if (u < 0.20)  mag =  0.0 + rnd() * 1.5;
      else if (u < 0.55)  mag =  1.5 + rnd() * 1.5;
      else if (u < 0.85)  mag =  3.0 + rnd() * 1.5;
      else                mag =  4.5 + rnd() * 1.5;

      stars[i] = {
        ra: Math.round(ra * 100) / 100,
        dec: Math.round(dec * 10) / 10,
        mag: Math.round(mag * 10) / 10,
      };
    }

    const named = [
      { ra: 6.752,  dec: -16.716, mag: -1.5 },
      { ra: 6.399,  dec: -52.696, mag: -0.7 },
      { ra: 14.661, dec: -60.835, mag: -0.3 },
      { ra: 14.261, dec:  19.182, mag: -0.1 },
      { ra: 18.616, dec:  38.784, mag:  0.0 },
      { ra: 5.278,  dec:  45.998, mag:  0.1 },
      { ra: 7.655,  dec:   5.225, mag:  0.4 },
      { ra: 5.604,  dec:  -1.202, mag:  0.2 },
      { ra: 1.629,  dec: -57.237, mag:  0.5 },
      { ra: 5.920,  dec:   7.407, mag:  0.5 },
      { ra: 14.064, dec: -60.373, mag:  0.6 },
      { ra: 19.846, dec:   8.868, mag:  0.8 },
      { ra: 12.443, dec: -63.099, mag:  0.8 },
      { ra: 6.978,  dec: -28.972, mag:  1.5 },
      { ra: 10.716, dec: -64.394, mag:  1.7 },
      { ra: 20.690, dec:  45.280, mag:  1.3 },
      { ra: 2.530,  dec:  89.264, mag:  2.0 },
      { ra: 3.405,  dec:  49.861, mag:  1.8 },
    ];
    for (const n of named) stars.push(n);

    return stars;
  }

  async function loadStars() {
    if (state.stars) return state.stars;
    if (state.starsLoading) return state.starsLoading;

    state.starsLoading = (async () => {
      try {
        const res = await fetch(STARS_URL, { cache: 'force-cache' });
        if (!res.ok) throw new Error('stars http ' + res.status);
        const buf = await res.arrayBuffer();
        const view = new DataView(buf);
        const count = view.getUint16(0, true);
        if (!count || count > 10000) throw new Error('bad star count ' + count);

        const stars = new Array(count);
        let off = 2;
        for (let i = 0; i < count; i++) {
          if (off + 6 > view.byteLength) throw new Error('truncated stars');
          const ra  = view.getInt16(off, true) / 100; off += 2;
          const dec = view.getInt16(off, true) / 10;  off += 2;
          const mag = view.getInt16(off, true) / 10;  off += 2;
          stars[i] = { ra, dec, mag };
        }
        state.stars = stars;
        return stars;
      } catch (e) {
        console.warn('[hero-globe] stars.bin failed — using synthetic catalog:', e.message);
        state.stars = generateStarCatalog(1500);
        return state.stars;
      }
    })();

    return state.starsLoading;
  }

  /* ─────────────────────────────────────────────────────────
     Drawing helpers
     ───────────────────────────────────────────────────────── */

  function resizeBackingStore(c) {
    const currentDpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.getBoundingClientRect();

    if (currentDpr !== state._lastDpr) {
      state.dpr = currentDpr;
      state._lastDpr = currentDpr;
      state._lastSize = { w: 0, h: 0 };
      state._starProjection = null;
      state.moonSprite = null;
      state.moonSpriteKey = '';
    }

    const dpr = state.dpr;
    const wantW = Math.max(2, Math.round(rect.width * dpr));
    const wantH = Math.max(2, Math.round(rect.height * dpr));

    if (c.width !== wantW || c.height !== wantH) {
      c.width = wantW;
      c.height = wantH;
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state._cachedLabelWidths.clear();
    }

    state._lastSize = { w: rect.width, h: rect.height };
    return state._lastSize;
  }

  function invalidateSize() {
    state._lastSize = { w: 0, h: 0 };
  }

  function strokeRun(ctx, pts) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function fillRun(ctx, pts) {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  function visibleRun(vecs, m, cx, cy, radius) {
    if (vecs.length < 3) return [];

    const n = vecs.length;
    const proj = state._scratch.projected;
    if (proj.length < n) proj.length = n;

    for (let i = 0; i < n; i++) {
      const v = vecs[i];
      const x = m[0] * v.x + m[1] * v.y + m[2] * v.z;
      const y = m[3] * v.x + m[4] * v.y + m[5] * v.z;
      const z = m[6] * v.x + m[7] * v.y + m[8] * v.z;
      let p = proj[i];
      if (!p) { p = proj[i] = { x: 0, y: 0, z: 0 }; }
      p.x = x; p.y = y; p.z = z;
    }

    let start = -1;
    for (let i = 0; i < n; i++) {
      if (proj[i].z > 0 || proj[(i + 1) % n].z > 0) { start = i; break; }
    }
    if (start === -1) return [];

    const runs = [];
    let cur = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const j = (i + 1) % n;
      const vi = proj[i];
      const vj = proj[j];
      const zi = vi.z, zj = vj.z;

      if (zi > 0) cur.push(project(vi, cx, cy, radius));

      if ((zi > 0) !== (zj > 0)) {
        const t = zi / (zi - zj);
        const ix = vi.x + (vj.x - vi.x) * t;
        const iy = vi.y + (vj.y - vi.y) * t;
        const edge = { x: ix, y: iy, z: 0 };
        if (zi > 0) {
          cur.push(project(edge, cx, cy, radius));
          if (cur.length > 1) runs.push(cur);
          cur = [];
        } else {
          cur = [];
          cur.push(project(edge, cx, cy, radius));
        }
      }
    }
    if (cur.length > 1) {
      if (runs.length && runs[0].length && proj[start].z <= 0 &&
          proj[(start - 1 + n) % n].z <= 0) {
        runs[0] = cur.concat(runs[0]);
      } else {
        runs.push(cur);
      }
    }
    return runs;
  }

  /* ─────────────────────────────────────────────────────────
     Motion integration
     ───────────────────────────────────────────────────────── */
  function integrateMotion(ts) {
    const now = (typeof ts === 'number') ? ts : performance.now();

    if (state.targetRotation != null) {
      const t = Math.min(1, (now - state.flyStart) / state.flyDuration);
      const e = 1 - Math.pow(1 - t, 3);
      state.rotation = lerpAngle(state.flyStartRotation, state.targetRotation, e);
      state.tilt     = state.flyStartTilt + (state.targetTilt - state.flyStartTilt) * e;
      if (t >= 1) {
        state.rotation = state.targetRotation;
        state.tilt = state.targetTilt;
        state.targetRotation = null;
        state.targetTilt = null;
        emit('flyToEnd');
      }
      return;
    }

    if (!state.isDragging && Math.abs(state.velocity) > 1e-7) {
      const dt = state.lastFrame > 0 ? Math.min(50, now - state.lastFrame) : 16.67;
      state.lastFrame = now;
      state.rotation += state.velocity * dt;
      state.velocity *= 0.945;
      if (Math.abs(state.velocity) < 1e-7) state.velocity = 0;
      return;
    }
    state.lastFrame = now;

    if (!state.isDragging && state.spinEnabled && !state.reducedMotion) {
      state.rotation += state.autoSpin;
    }

    if (state.rotation >  Math.PI) state.rotation -= Math.PI * 2;
    if (state.rotation < -Math.PI) state.rotation += Math.PI * 2;
  }

  function lerpAngle(a, b, t) {
    let diff = (b - a) % (Math.PI * 2);
    if (diff > Math.PI)  diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  /* ─────────────────────────────────────────────────────────
     Main draw loop
     ───────────────────────────────────────────────────────── */
  function draw(ts) {
    const c = state.canvas;
    const ctx = state.ctx;
    if (!c || !ctx) { state.rafId = null; return; }

    if (typeof document !== 'undefined' && document.hidden) {
      state.rafId = null;
      return;
    }
    if (!state._heroVisible) {
      state.rafId = null;
      return;
    }

    const size = resizeBackingStore(c);
    if (!size || size.w < 2 || size.h < 2) {
      /* v6.1 — retry up to N frames, then log once. */
      state._sizeWaitCount++;
      if (state._sizeWaitCount === WAIT_FOR_SIZE_MAX_FRAMES && !state._sizeWarned) {
        state._sizeWarned = true;
        console.warn(
          '[hero-globe] canvas still has no size after ' +
          WAIT_FOR_SIZE_MAX_FRAMES + ' frames — check that ' +
          '#vioraHeroGlobeCanvas has explicit width/height in CSS'
        );
      }
      state.rafId = requestAnimationFrame(draw);
      return;
    }
    state._sizeWaitCount = 0;

    const { w, h } = size;
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = (Math.min(w, h) / 2 - 6) * state.zoom;
    const maxRadius = Number(state.maxRadius) > 0 ? Number(state.maxRadius) : 72;
    const radius = Math.max(8, Math.min(baseRadius, maxRadius));
    integrateMotion(ts);

    ctx.clearRect(0, 0, w, h);

    drawStars(ctx, w, h);
    drawAtmosphere(ctx, cx, cy, radius);
    drawSphere(ctx, cx, cy, radius);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.imageSmoothingEnabled = true;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (state.atlas) drawAtlas(ctx, cx, cy, radius);
    drawTerminator(ctx, cx, cy, radius);
    drawMoon(ctx, cx, cy, radius, new Date());
    drawArcs(ctx, cx, cy, radius);
    drawPins(ctx, cx, cy, radius, ts);

    ctx.restore();

    drawRim(ctx, cx, cy, radius);

    if (state._useOffscreen && state._blit) state._blit();

    state.rafId = requestAnimationFrame(draw);
  }

  /* ─────────────────────────────────────────────────────────
     Sphere and atmosphere
     ───────────────────────────────────────────────────────── */

  function sunScreenDirection() {
    const sun = sunVector();
    const m = buildMatrix(state.rotation, state.tilt);
    return applyMatrix(m, sun);
  }

  function drawSphere(ctx, cx, cy, radius) {
    const sv = sunScreenDirection();
    const gx = cx + (sv.x || 0) * radius * 0.4;
    const gy = cy - (sv.y || 0) * radius * 0.4;

    const g = ctx.createRadialGradient(gx, gy, radius * 0.12, cx, cy, radius * 1.05);
    g.addColorStop(0,    state.theme.oceanInner);
    g.addColorStop(0.55, state.theme.oceanMid);
    g.addColorStop(1,    state.theme.oceanOuter);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawAtmosphere(ctx, cx, cy, radius) {
    const sv = sunScreenDirection();
    const facing = Math.max(0, sv.z || 0);
    const alpha = 0.08 + 0.10 * facing;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.12);
    g.addColorStop(0,   'rgba(34, 211, 238, 0)');
    g.addColorStop(0.5, `rgba(34, 211, 238, ${alpha.toFixed(3)})`);
    g.addColorStop(1,   'rgba(34, 211, 238, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRim(ctx, cx, cy, radius) {
    const rim = ctx.createRadialGradient(cx, cy, radius - 3, cx, cy, radius + 4);
    rim.addColorStop(0, state.theme.rim);
    rim.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  /* ─────────────────────────────────────────────────────────
     Moon sprite
     ───────────────────────────────────────────────────────── */
  const MOON_SPRITE_PAD = 1.6;

  function buildMoonSprite(diameterPx, illumination, side) {
    const pad = MOON_SPRITE_PAD;
    const size = Math.max(4, Math.round(diameterPx * pad));
    const dpr = state.dpr || 1;
    const px = Math.round(size * dpr);
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const r  = diameterPx / 2;

    const glowR = r * 2.2;
    const halo = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, glowR);
    halo.addColorStop(0,    'rgba(210, 220, 240, 0.28)');
    halo.addColorStop(0.55, 'rgba(180, 195, 225, 0.10)');
    halo.addColorStop(1,    'rgba(140, 160, 200, 0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, glowR, 0, Math.PI * 2);
    g.fill();

    const disk = g.createRadialGradient(
      cx - r * 0.25, cy - r * 0.25, r * 0.1,
      cx, cy, r
    );
    disk.addColorStop(0,   '#f2f3ec');
    disk.addColorStop(0.75,'#e2e5dd');
    disk.addColorStop(1,   '#c9cdc4');
    g.fillStyle = disk;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();

    const illum = Math.max(0, Math.min(1, illumination));
    if (illum < 0.999) {
      const k = 1 - illum * 2;
      const ex = cx + side * k * r * 0.5;
      const erx = Math.max(0.5, Math.abs(k) * r);
      g.save();
      g.beginPath();
      g.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = 'rgba(20, 24, 36, 0.98)';
      g.beginPath();
      g.ellipse(ex, cy, erx, r + 1, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();

    return { canvas: c, half: size / 2 };
  }

  function getMoonSprite(diameterPx, illumination, side) {
    const qSize = Math.max(4, Math.round(diameterPx));
    const qIllum = Math.round(illumination * MOON_SPRITE_QUANT) / MOON_SPRITE_QUANT;
    const qSide = side >= 0 ? 1 : -1;
    const key = qSize + '|' + qIllum + '|' + qSide;

    if (state.moonSpriteKey === key && state.moonSprite) {
      return state.moonSprite;
    }
    state.moonSprite = buildMoonSprite(qSize, qIllum, qSide);
    state.moonSpriteKey = key;
    return state.moonSprite;
  }

  function drawMoon(ctx, cx, cy, radius, date) {
    const m = state.moon;
    if (!m || !Number.isFinite(m.ra) || !Number.isFinite(m.dec)) return;

    const matrix = buildMatrix(state.rotation, state.tilt);
    const cosDec = Math.cos(m.dec);
    const eq = {
      x: cosDec * Math.cos(m.ra),
      y: Math.sin(m.dec),
      z: cosDec * Math.sin(m.ra)
    };
    const p = applyMatrix(matrix, eq);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return;
    }

    if (p.z <= 0) return;

    const screen = project(p, cx, cy, radius);

    const limbFade = Math.pow(Math.max(0, p.z), 0.5);
    if (limbFade < 0.02) return;

    const globeDiameterPx = radius * 2;
    const realDiameterPx = (0.52 / 180) * globeDiameterPx;
    let moonDiameterPx = realDiameterPx * MOON_MAGNIFICATION;
    moonDiameterPx = Math.max(MOON_MIN_PX, Math.min(MOON_MAX_PX, moonDiameterPx));
    moonDiameterPx *= limbFade;

    if (moonDiameterPx < 1.5) return;

    const illum = Math.max(0, Math.min(1, Number(m.illumination) || 0));
    const phase = Math.max(0, Math.min(1, Number(m.phase) || 0));
    const side = phase < 0.5 ? 1 : -1;

    const sprite = getMoonSprite(moonDiameterPx, illum, side);
    if (!sprite) return;

    let rot = 0;
    try {
      const sun = sunVector();
      const sunP = applyMatrix(matrix, sun);
      const dx = sunP.x - p.x;
      const dy = -(sunP.y - p.y);
      if (Number.isFinite(dx) && Number.isFinite(dy) && (dx !== 0 || dy !== 0)) {
        rot = Math.atan2(dy, dx) + Math.PI / 2;
      }
    } catch (_) {}

    ctx.save();
    ctx.globalAlpha = limbFade;
    ctx.translate(screen.x, screen.y);
    if (rot) ctx.rotate(rot);
    const s = sprite.half * 2;
    ctx.drawImage(sprite.canvas, -sprite.half, -sprite.half, s, s);
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────
     Stars
     ───────────────────────────────────────────────────────── */

  function buildStarProjection(w, h, date) {
    const stars = state.stars;
    if (!Array.isArray(stars) || !stars.length) return null;
    const out = new Array(stars.length);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const v = precessJ2000ToDate(raDecToVec(s.ra, s.dec), date);
      const bright = Math.max(0.15, Math.min(1, Math.pow(2.512, -s.mag / 2.5)));
      out[i] = {
        v,
        r: 0.4 + bright * 1.1,
        a: 0.35 + bright * 0.55,
        tw: (s.ra * 137.508) % (Math.PI * 2),
        ts: 0.0006 + bright * 0.0018
      };
    }
    return { w, h, at: date.getTime(), stars: out, rot: state.rotation, tilt: state.tilt };
  }

  function drawStars(ctx, w, h) {
    const now = (typeof global.__vioraNowMs === 'function') ? global.__vioraNowMs() : Date.now();
    const sp = state._starProjection;
    const needsRebuild =
      !sp ||
      sp.w !== w ||
      sp.h !== h ||
      now - sp.at > 60 * 60 * 1000 ||
      Math.abs(state.rotation - sp.rot) > STAR_DRIFT_THRESHOLD ||
      Math.abs(state.tilt - sp.tilt) > STAR_DRIFT_THRESHOLD;

    if (needsRebuild) {
      state._starProjection = buildStarProjection(w, h, new Date(now));
    }
    if (!state._starProjection) return;

    const m = buildMatrix(state.rotation, state.tilt);
    const cxs = w / 2, cys = h / 2;
    const r = Math.min(w, h) / 2;
    const t = performance.now();
    const reduce = state.reducedMotion;

    const projectionFresh =
      Math.abs(state.rotation - state._starProjection.rot) <= STAR_DRIFT_THRESHOLD &&
      Math.abs(state.tilt - state._starProjection.tilt) <= STAR_DRIFT_THRESHOLD;

    ctx.save();
    ctx.fillStyle = state.theme.star;
    for (let i = 0; i < state._starProjection.stars.length; i++) {
      const s = state._starProjection.stars[i];
      let p;
      if (projectionFresh && s._px !== undefined) {
        p = { x: s._px, y: s._py, z: s._pz };
      } else {
        p = applyMatrix(m, s.v);
        s._px = p.x; s._py = p.y; s._pz = p.z;
      }
      if (p.z < 0) continue;
      const sx = cxs + p.x * r * 1.35;
      const sy = cys - p.y * r * 1.35;
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
      const twinkle = reduce ? 1 : (0.82 + 0.18 * Math.sin(t * s.ts + s.tw));
      ctx.globalAlpha = s.a * twinkle;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────
     Terminator
     ───────────────────────────────────────────────────────── */
  function drawTerminator(ctx, cx, cy, radius) {
    const sun = sunVector();
    const m = buildMatrix(state.rotation, state.tilt);
    const sunView = applyMatrix(m, sun);
    const azimuth = Math.atan2(-sunView.x, sunView.y);
    const sunZ = Math.max(0, Math.min(1, sunView.z));

    const antiX = cx - sunView.x * radius * (1 - sunZ);
    const antiY = cy + sunView.y * radius * (1 - sunZ);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

       const darkness = clamp((-state.sunElev) / 18, 0, 1);
    const nightCoreAlpha = 0.55 + darkness * 0.42;
    const nightMidAlpha  = 0.30 + darkness * 0.40;

    const nightGrad = ctx.createRadialGradient(
      antiX, antiY, Math.max(1, radius * 0.15),
      antiX, antiY, radius * 1.35
    );
    nightGrad.addColorStop(0,    `rgba(2, 6, 22, ${nightCoreAlpha.toFixed(3)})`);
    nightGrad.addColorStop(0.55, `rgba(8, 16, 36, ${nightMidAlpha.toFixed(3)})`);
    nightGrad.addColorStop(1,    'rgba(8, 16, 36, 0)');
    ctx.fillStyle = nightGrad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.globalCompositeOperation = 'screen';

    const termCx = cx + sunView.x * radius * sunZ;
    const termCy = cy - sunView.y * radius * sunZ;
    const ellipseAngle = -azimuth;

    ctx.save();
    ctx.translate(termCx, termCy);
    ctx.rotate(ellipseAngle);

    const major = radius * 1.02;
    const minor = Math.max(2, radius * (0.06 + 0.94 * sunZ));
    const dayGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, major);
    dayGrad.addColorStop(0,    'rgba(255, 245, 220, 0.50)');
    dayGrad.addColorStop(0.55, 'rgba(230, 240, 250, 0.28)');
    dayGrad.addColorStop(0.85, 'rgba(180, 210, 235, 0.10)');
    dayGrad.addColorStop(1,    'rgba(150, 190, 230, 0)');

    ctx.beginPath();
    ctx.ellipse(0, 0, major, minor, 0, 0, Math.PI * 2);
    ctx.fillStyle = dayGrad;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /* ─────────────────────────────────────────────────────────
     Atlas rendering
     ───────────────────────────────────────────────────────── */
  function drawAtlas(ctx, cx, cy, radius) {
    const { countryRings, borderSegments } = state.atlas;
    const m = buildMatrix(state.rotation, state.tilt);
    const globeRadiusSq = radius * radius;

    const dpr = state.dpr;
    const strokeWidthCoast = Math.max(1 / dpr, 0.8);

    ctx.fillStyle   = state.theme.land;
    ctx.strokeStyle = state.theme.coastline;
    ctx.lineWidth   = strokeWidthCoast;

    for (let ci = 0; ci < countryRings.length; ci++) {
      const country = countryRings[ci];

      const sph = country.sphere;
      if (sph) {
        const cz = m[6] * sph.center.x + m[7] * sph.center.y + m[8] * sph.center.z;
        if (cz < -sph.cosAngularRadius) continue;
      }

      const rings = country.rings;
      for (let ri = 0; ri < rings.length; ri++) {
        const ring = rings[ri];

        let anyVisible = false;
        for (let i = 0; i < ring.length; i++) {
          const v = ring[i];
          const z = m[6] * v.x + m[7] * v.y + m[8] * v.z;
          if (z > 0) { anyVisible = true; break; }
        }
        if (!anyVisible) continue;

        const runs = visibleRun(ring, m, cx, cy, radius);
        for (let k = 0; k < runs.length; k++) {
          const run = runs[k];
          if (run.length < 3) continue;

          let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
          for (let p = 0; p < run.length; p++) {
            const pt = run[p];
            if (pt.x < minx) minx = pt.x;
            if (pt.x > maxx) maxx = pt.x;
            if (pt.y < miny) miny = pt.y;
            if (pt.y > maxy) maxy = pt.y;
          }
          const dx = Math.max(cx - maxx, minx - cx, 0);
          const dy = Math.max(cy - maxy, miny - cy, 0);
          if (dx * dx + dy * dy > globeRadiusSq) continue;

          fillRun(ctx, run);
        }
      }
    }

    if (borderSegments.length) {
      ctx.strokeStyle = state.theme.border;
      ctx.lineWidth   = Math.max(1 / dpr, 0.5);
      for (let i = 0; i < borderSegments.length; i++) {
        const runs = visibleRun(borderSegments[i], m, cx, cy, radius);
        for (let k = 0; k < runs.length; k++) strokeRun(ctx, runs[k]);
      }
    }
  }

  /* ─────────────────────────────────────────────────────────
     Arcs
     ───────────────────────────────────────────────────────── */
  function slerp(a, b, t) {
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const omega = Math.acos(dot);
    const sinOmega = Math.sin(omega);
    if (sinOmega < 1e-6) return { x: a.x, y: a.y, z: a.z };
    const ka = Math.sin((1 - t) * omega) / sinOmega;
    const kb = Math.sin(t * omega) / sinOmega;
    return {
      x: a.x * ka + b.x * kb,
      y: a.y * ka + b.y * kb,
      z: a.z * ka + b.z * kb
    };
  }

  function drawArcs(ctx, cx, cy, radius) {
    if (!state.arcs.length) return;
    const m = buildMatrix(state.rotation, state.tilt);
    ctx.strokeStyle = state.theme.arc;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);

    for (let a = 0; a < state.arcs.length; a++) {
      const arc = state.arcs[a];
      const va = lonLatToVec(arc.from.lon, arc.from.lat);
      const vb = lonLatToVec(arc.to.lon, arc.to.lat);
      const steps = 64;
      let run = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const v = slerp(va, vb, t);
        const lift = 1 + 0.09 * Math.sin(t * Math.PI);
        const p = applyMatrix(m, { x: v.x * lift, y: v.y * lift, z: v.z * lift });
        if (p.z > 0) run.push(project(p, cx, cy, radius));
        else if (run.length) { strokeRun(ctx, run); run = []; }
      }
      if (run.length) strokeRun(ctx, run);
    }
    ctx.setLineDash([]);
  }

  /* ─────────────────────────────────────────────────────────
     Pins
     ───────────────────────────────────────────────────────── */
  function drawPins(ctx, cx, cy, radius, ts) {
    if (!state.pins.length) return;
    const m = buildMatrix(state.rotation, state.tilt);
    const now = ts || performance.now();

    for (let i = 0; i < state.pins.length; i++) {
      const pin = state.pins[i];
      const v = applyMatrix(m, lonLatToVec(pin.lon, pin.lat));
      const near = v.z > 0;
      const p = project(v, cx, cy, radius);
      const fade = near ? 1 : Math.max(0, 1 - Math.abs(v.z) * 6);
      if (fade <= 0) continue;

      ctx.save();
      ctx.globalAlpha = fade;

      ctx.strokeStyle = pin.color || state.theme.pinCore;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 10);
      ctx.stroke();

      ctx.shadowColor = pin.color || state.theme.pinCore;
      ctx.shadowBlur  = 16;
      ctx.fillStyle   = pin.color || state.theme.pinCore;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 12, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle  = state.theme.pinDot;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 12, 1.8, 0, Math.PI * 2);
      ctx.fill();

      if (!state.reducedMotion) {
        const t = (now / 1400) % 1;
        ctx.globalAlpha = fade * (1 - t) * 0.55;
        ctx.strokeStyle = pin.color || state.theme.pinCore;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 12, 5 + t * 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = fade;
      }

      if (pin.label && radius > 140 && near) {
        let w = state._cachedLabelWidths.get(pin.label);
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        if (w == null) {
          w = ctx.measureText(pin.label).width;
          state._cachedLabelWidths.set(pin.label, w);
        }
        const lx = p.x + 18;
        const ly = p.y - 22;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 12);
        ctx.lineTo(lx, ly);
        ctx.lineTo(lx + w + 10, ly);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(pin.label, p.x + 24, p.y - 25);
      }

      ctx.restore();
    }
  }

  /* ─────────────────────────────────────────────────────────
     Picker trigger
     ───────────────────────────────────────────────────────── */
  function triggerHeroPicker(source) {
    const candidates = [
      () => global.VioraHero && global.VioraHero.openPicker,
      () => global.VioraHeroBanner && global.VioraHeroBanner.openPicker,
      () => global.openVioraHeroLocationPicker
    ];
    for (const get of candidates) {
      let fn;
      try { fn = get(); } catch (_) { fn = null; }
      if (typeof fn === 'function') {
        try { fn(); }
        catch (e) { console.warn('[hero-globe] picker threw (' + source + '):', e); }
        return true;
      }
    }
    console.warn('[hero-globe] picker not found for ' + source);
    return false;
  }

  /* ─────────────────────────────────────────────────────────
     Event binding
     ───────────────────────────────────────────────────────── */
  function bindEvents(canvas) {
    if (state.bound) return;
    state.bound = true;

    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('tabindex', '0');
    updateAriaLabel();

    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('focus', () => {
      ensureLiveRegion().textContent =
        'Globe focused. Arrow keys rotate. Enter opens location picker.';
    });

    let dragStartX = 0, dragStartY = 0, dragStartRot = 0, dragStartTilt = 0;
    let lastX = 0, lastT = 0;

    function beginDrag(x, y) {
      state.isDragging = true;
      dragStartX = x; dragStartY = y;
      dragStartRot = state.rotation;
      dragStartTilt = state.tilt;
      lastX = x; lastT = performance.now();
      state.velocity = 0;
      state.targetRotation = null;
      state.targetTilt = null;
      canvas.style.cursor = 'grabbing';
      restartRaf();
    }
    function moveDrag(x, y) {
      if (!state.isDragging) return;
      const now = performance.now();
      const dx = x - lastX;
      const dt = Math.max(1, now - lastT);
      state.velocity = (dx * 0.012) / dt;
      lastX = x;
      lastT = now;
      state.rotation = dragStartRot + (x - dragStartX) * 0.012;
      state.tilt = clamp(dragStartTilt + (y - dragStartY) * 0.008, -1.2, 1.2);
    }
    function endDrag() {
      state.isDragging = false;
      canvas.style.cursor = 'grab';
    }

    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      beginDrag(e.clientX, e.clientY);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (!state.isDragging) return;
      moveDrag(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0012);
      state.zoom = clamp(state.zoom * factor, 0.6, 1.8);
      restartRaf();
    }, { passive: false });

    canvas.addEventListener('dblclick', e => {
      e.preventDefault();
      e.stopPropagation();
      triggerHeroPicker('dblclick');
    });

    let lastTap = 0, fired = false;
    canvas.addEventListener('pointerup', e => {
      if (e.pointerType !== 'touch') return;
      const now = Date.now();
      if (now - lastTap < 320) {
        if (!fired) {
          fired = true;
          triggerHeroPicker('dbltap');
          setTimeout(() => { fired = false; }, 400);
        }
      } else fired = false;
      lastTap = now;
    });

    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;
      const radius = (Math.min(rect.width, rect.height) / 2 - 6) * state.zoom;
      const hit = hitTestPins(e.clientX - rect.left, e.clientY - rect.top, cx, cy, radius);
      emit('click', { x: e.clientX, y: e.clientY, pin: hit });
      if (hit) emit('pinClick', hit);
    });

    let resizeRaf = null;
    const onResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        invalidateSize();
        state._starProjection = null;
        state.moonSprite = null;
        state.moonSpriteKey = '';
        maybeSwapLod();
        restartRaf();
      });
    };
    window.addEventListener('resize', onResize);

    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      try {
        const ro = new ResizeObserver(onResize);
        ro.observe(canvas.parentElement);
        state._resizeObserver = ro;
      } catch (_) {}
    }

    if (typeof IntersectionObserver !== 'undefined') {
      try {
        const io = new IntersectionObserver((entries) => {
          for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.target !== canvas) continue;
            const nowVisible = e.isIntersecting;
            const wasVisible = state._heroVisible;
            state._heroVisible = nowVisible;
            if (nowVisible && !wasVisible) {
              state._starProjection = null;
              restartRaf();
            }
          }
        }, { threshold: 0.02 });
        io.observe(canvas);
        state._visObserver = io;
      } catch (_) {}
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function onKeyDown(e) {
    const step = e.shiftKey ? 0.15 : 0.05;
    switch (e.key) {
      case 'ArrowLeft':  state.rotation -= step; break;
      case 'ArrowRight': state.rotation += step; break;
      case 'ArrowUp':    state.tilt = clamp(state.tilt - step * 0.6, -1.2, 1.2); break;
      case 'ArrowDown':  state.tilt = clamp(state.tilt + step * 0.6, -1.2, 1.2); break;
      case '+': case '=': state.zoom = clamp(state.zoom + 0.1, 0.6, 1.8); break;
      case '-': case '_': state.zoom = clamp(state.zoom - 0.1, 0.6, 1.8); break;
      case 'Enter': case ' ': triggerHeroPicker('keyboard'); break;
      default: return;
    }
    e.preventDefault();
    restartRaf();
  }

  function ensureLiveRegion() {
    if (state.liveRegion && document.body.contains(state.liveRegion)) return state.liveRegion;
    const el = document.createElement('div');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
    document.body.appendChild(el);
    state.liveRegion = el;
    return el;
  }

  function updateAriaLabel() {
    if (!state.canvas) return;
    const pin = state.pins[0];
    const label = pin
      ? `Interactive globe. Current location pin: ${pin.label || `${pin.lat.toFixed(1)}, ${pin.lon.toFixed(1)}`}.`
      : 'Interactive globe showing world continents.';
    state.canvas.setAttribute('aria-label', label + ' Use arrow keys to rotate, Enter to pick a location.');
  }

  function restartRaf() {
    if (!state.canvas || !state.ctx) return;
    if (state.rafId == null) state.rafId = requestAnimationFrame(draw);
  }

  function hitTestPins(x, y, cx, cy, radius) {
    const m = buildMatrix(state.rotation, state.tilt);
    for (let i = 0; i < state.pins.length; i++) {
      const pin = state.pins[i];
      const v = applyMatrix(m, lonLatToVec(pin.lon, pin.lat));
      if (v.z <= 0) continue;
      const p = project(v, cx, cy, radius);
      const dx = p.x - x, dy = p.y - y - 12;
      if (dx * dx + dy * dy <= 14 * 14) return pin;
    }
    return null;
  }

  let _lodSwapTimer = null;
  let _lodSwapPending = null;

  function maybeSwapLod() {
    if (!state.canvas || state._bundled) return;

    const rect = state.canvas.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const want = radius > 420 ? ATLAS_URL_50M : ATLAS_URL_110M;

    if (!state.atlasUrl || state.atlasUrl === want) return;
    if (state.loading && _lodSwapPending === want) return;

    _lodSwapPending = want;

    if (_lodSwapTimer) clearTimeout(_lodSwapTimer);
    _lodSwapTimer = setTimeout(() => {
      _lodSwapTimer = null;
      const target = _lodSwapPending;
      _lodSwapPending = null;
      if (!target) return;
      if (state.loading) {
        _pendingAtlasUrl = target;
        return;
      }
      loadAtlas({ atlasUrl: target });
    }, 500);
  }

  /* ─────────────────────────────────────────────────────────
     Visibility
     ───────────────────────────────────────────────────────── */
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (state.rafId != null) cancelAnimationFrame(state.rafId);
        state.rafId = null;
      } else {
        state._starProjection = null;
        restartRaf();
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     v6.1 — Location-follows-banner
     ─────────────────────────────────────────────────────────
     Two paths announce a location change:

       1. VioraHeroGlobe.setLocation(lon, lat, opts)
          — called directly by hero-banner.js _applyLocation
            and by dashboard-weather.js saveWeatherLocation

       2. window event 'viora:hero-location-change'
          — dispatched by hero-banner.js _applyLocation and
            by dashboard-weather.js saveWeatherLocation

     Both are deduped through state._lastAppliedLocation.
     ───────────────────────────────────────────────────────── */

  /* Round a location to a comparable key. 4 decimals ≈ 11 m. */
  function _locationKey(loc) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
    return [
      String(loc.id || ''),
      Number(loc.lat).toFixed(4),
      Number(loc.lon).toFixed(4),
      String(loc.tz || '')
    ].join('|');
  }

  /* Called by init() and by the event listener. Returns true if
     the location was actually applied (not a duplicate). */
  function _applyLocationLocally(loc, opts) {
    opts = opts || {};
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return false;
    const key = _locationKey(loc);
    if (!key) return false;
    if (state._lastAppliedLocation === key && !opts.force) {
      /* Not a duplicate — but if the banner moved and we didn't,
         force a repaint anyway so a stale camera self-heals. */
      if (opts.force) {
        state._lastAppliedLocation = null;
      } else {
        return false;
      }
    }
    state._lastAppliedLocation = key;

    state.pins = [{
      lon: loc.lon,
      lat: loc.lat,
      label: loc.name || loc.label || loc.id || 'Location',
      id: loc.id || 'primary'
    }];

    if (opts.animate !== false) {
      _flyToInternal(loc.lon, loc.lat, opts.duration || 1100);
    } else {
      const cam = rotationFor(loc.lon, loc.lat);
      state.rotation = cam.rotation;
      state.tilt = cam.tilt;
      state.targetRotation = null;
      state.targetTilt = null;
    }

    updateAriaLabel();
    ensureLiveRegion().textContent =
      'Globe moved to ' + (loc.name || loc.label || `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`);

    try {
      window.dispatchEvent(new CustomEvent('viora:globe-location-changed', {
        detail: {
          lon: loc.lon,
          lat: loc.lat,
          label: loc.name || loc.label,
          id: loc.id
        }
      }));
    } catch (_) {}

    restartRaf();
    return true;
  }

  /* Shared by api.setLocation and the event listener. */
  function _flyToInternal(lon, lat, ms) {
    const cam = rotationFor(lon, lat);

    if (state.targetRotation != null &&
        Math.abs(shortestDelta(state.targetRotation, cam.rotation)) < 0.01 &&
        (performance.now() - state.flyStart) < FLYTO_DEDUPE_MS) {
      return;
    }

    state.flyStartRotation = state.rotation;
    state.flyStartTilt = state.tilt;
    state.targetRotation = state.rotation + shortestDelta(state.rotation, cam.rotation);
    state.targetTilt = cam.tilt;
    state.flyStart = performance.now();
    state.flyDuration = Math.max(200, ms || 900);
    restartRaf();
  }

  /* v6.1 — listener installed on init, removed on destroy. */
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
      _applyLocationLocally(loc, { animate: true, duration: 1100 });
    };

    window.addEventListener('viora:hero-location-change', state._heroLocationListener);
  }

  function _unbindHeroLocationListener() {
    if (!state._heroLocationListener) return;
    if (typeof window === 'undefined' || typeof window.removeEventListener !== 'function') return;
    window.removeEventListener('viora:hero-location-change', state._heroLocationListener);
    state._heroLocationListener = null;
  }

  /* v6.1 — re-read the banner's location. Called on init and on
     any location-adjacent event, so a globe that mounted before
     hero-banner.js finished booting still snaps to the correct
     city. */
  function _syncFromBannerLocation(opts) {
    opts = opts || {};
    const loc = resolveHomeLocation();
    if (!loc) return false;
    return _applyLocationLocally(loc, opts);
  }

  /* ─────────────────────────────────────────────────────────
     Public API
     ───────────────────────────────────────────────────────── */
  const api = {
    _inited: false,
    supported: state.supported,
    ready: readyPromise,
    HOME_LOCATION,

    preload(opts) {
      opts = opts || {};
      if (!state.supported) return Promise.resolve(null);
      const url = opts.atlasUrl || (window.innerWidth < 720 ? ATLAS_URL_110M : ATLAS_URL_50M);
      return Promise.all([
        loadStars(),
        loadAtlas({ atlasUrl: url, bundledAtlas: opts.bundledAtlas })
      ]);
    },

    init(opts) {
      opts = opts || {};
      if (!state.supported) return api;
      if (opts.theme) Object.assign(state.theme, opts.theme);
      if (Number.isFinite(opts.maxRadius)) state.maxRadius = Number(opts.maxRadius);
      if (opts.metrics) state.metrics = opts.metrics;
      if (opts.bundledAtlas) { state._bundled = true; opts.atlasUrl = null; }
      if (typeof opts.spin === 'number') state.autoSpin = opts.spin;
      if (opts.spin === false || opts.spin === 0) {
        state.spinEnabled = false;
        state.userSpinDisabled = true;
      }
      if (opts.useOffscreen && hasOffscreen) state._useOffscreen = true;

      checkReducedMotion();

      const canvas = document.getElementById(opts.canvasId || 'vioraHeroGlobeCanvas');
      if (!canvas) { this._inited = false; return api; }
      if (this._inited && state.canvas === canvas) return api;

      if (state.canvas && state.canvas !== canvas) {
        state.canvas.style.cursor = '';
        state.bound = false;
      }

      state.canvas = canvas;
      state.ctx = canvas.getContext('2d', { alpha: true });
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state._lastDpr = state.dpr;

      if (state._useOffscreen) {
        let offCtx = null;
        try {
          const rect = canvas.getBoundingClientRect();
          state._offscreen = new OffscreenCanvas(
            Math.max(1, Math.round(rect.width * state.dpr)),
            Math.max(1, Math.round(rect.height * state.dpr))
          );
          offCtx = state._offscreen.getContext('2d');
        } catch (e) {
          console.warn('[hero-globe] OffscreenCanvas construction threw, using onscreen 2D', e);
          offCtx = null;
        }

        if (!offCtx) {
          state._useOffscreen = false;
          state._offscreen = null;
          state._blit = null;
          state.ctx = canvas.getContext('2d', { alpha: true });
        } else {
          state.ctx = offCtx;
          state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
          const off = state._offscreen;
          const onCanvas = state.canvas;
          state._blit = () => {
            const onscreen = onCanvas.getContext('2d');
            onscreen.setTransform(1, 0, 0, 1, 0, 0);
            onscreen.clearRect(0, 0, onCanvas.width, onCanvas.height);
            onscreen.drawImage(off, 0, 0, onCanvas.width, onCanvas.height);
          };
        }
      }

      /* v6.1 — Prefer the banner's current location, then opts,
         then home. This means a globe that mounts late lands on
         the correct city immediately. */
      const bannerLoc = (global.state && global.state._heroLocation) || null;
      const preferred = (bannerLoc && Number.isFinite(bannerLoc.lon))
        ? bannerLoc
        : ((opts.location && Number.isFinite(opts.location.lon)) ? opts.location : null);

      const homeLoc = preferred
        ? {
            id:   preferred.id   || 'primary',
            name: preferred.name || preferred.label || 'Home',
            lat:  preferred.lat,
            lon:  preferred.lon,
            tz:   preferred.tz   || 'UTC'
          }
        : resolveHomeLocation();

      seedPinFromLocation(homeLoc, { force: true });
      const cam = rotationFor(homeLoc.lon, homeLoc.lat);
      state.rotation = cam.rotation;
      state.tilt = cam.tilt;

      if (global.Solar && typeof global.Solar.prewarm === 'function') {
        try { global.Solar.prewarm(homeLoc.lat, homeLoc.lon); } catch (_) {}
      }

      bindEvents(canvas);

      /* v6.1 — install the hero-location-change listener. */
      _bindHeroLocationListener();

      loadStars().catch(() => {});
      const initialUrl = opts.atlasUrl ||
        (window.innerWidth < 720 ? ATLAS_URL_110M : ATLAS_URL_50M);
      loadAtlas({ atlasUrl: initialUrl, bundledAtlas: opts.bundledAtlas });

      invalidateSize();
      if (state.rafId == null) state.rafId = requestAnimationFrame(draw);
      this._inited = true;
      emit('init', { canvas, location: homeLoc });

      /* v6.1 — one deferred sync so a late hero-banner.js
         _applyLocation() picks up immediately. */
      setTimeout(() => { try { _syncFromBannerLocation({ animate: true }); } catch (_) {} }, 200);
      setTimeout(() => { try { _syncFromBannerLocation({ animate: true }); } catch (_) {} }, 1200);

      return api;
    },

    destroy() {
      if (state.rafId != null) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      _unbindHeroLocationListener();
      if (state._resizeObserver) {
        try { state._resizeObserver.disconnect(); } catch (_) {}
        state._resizeObserver = null;
      }
      if (state._visObserver) {
        try { state._visObserver.disconnect(); } catch (_) {}
        state._visObserver = null;
      }
      if (_lodSwapTimer) {
        clearTimeout(_lodSwapTimer);
        _lodSwapTimer = null;
        _lodSwapPending = null;
      }
      if (state.canvas) state.canvas.style.cursor = '';
      state.canvas = null;
      state.ctx = null;
      state._offscreen = null;
      state._blit = null;
      state.moon = null;
      state.moonSprite = null;
      state.moonSpriteKey = '';
      state._starProjection = null;
      state._lastAppliedLocation = null;
      state.bound = false;
      this._inited = false;
      emit('destroy');
    },

     setSkyState(sky) {
      if (!sky) return api;
      state.sunElev = Number(sky.sun && sky.sun.elevation);
      if (!Number.isFinite(state.sunElev)) state.sunElev = 0;

      if (!sky.moon) {
        state.moon = null;
        restartRaf();
        return api;
      }
      const m = sky.moon;
      state.moon = {
        ra: Number(m.ra),
        dec: Number(m.dec),
        illumination: Number(m.illumination) || 0,
        phase: Number(m.phase) || 0,
        azimuth: Number(m.azimuth) || 0,
        elevation: Number(m.elevation) || 0,
        visible: !!m.visible
      };
      restartRaf();
      return api;
    },

    /* v6.1 — canonical entry point for "move the globe". Called
       by hero-banner.js _applyLocation, by dashboard-weather.js
       saveWeatherLocation, and by the hero picker. Dedupes
       internally so calling it twice for one pick is a no-op. */
    setLocation(lon, lat, opts) {
      opts = opts || {};
      const loc = {
        id: opts.id || 'primary',
        name: opts.label || opts.name || 'Location',
        lat: Number(lat),
        lon: Number(lon),
        tz: opts.tz || ''
      };
      const applied = _applyLocationLocally(loc, opts);
      return applied ? api : api;
    },

    focusQuickCity(id) {
      const list = [
        ...(global.VIORA_HERO_QUICK_CITIES || []),
        ...(global.VIORA_HERO_LOCATIONS || [])
      ];
      const city = list.find(c => c.id === id) ||
                   list.find(c => (c.name || '').toLowerCase() === String(id).toLowerCase());
      if (!city) return api;
      return api.setLocation(city.lon, city.lat, {
        label: city.label || city.name,
        animate: true,
        duration: 1100,
        id: city.id,
        tz: city.tz
      });
    },

    addPin(lon, lat, opts) {
      opts = opts || {};
      state.pins.push({
        lon, lat,
        label: opts.label,
        color: opts.color,
        id: opts.id || ('pin-' + state.pins.length)
      });
      restartRaf();
      return api;
    },

    clearPins() { state.pins = []; restartRaf(); return api; },
    addArc(from, to) { state.arcs.push({ from, to }); restartRaf(); return api; },
    clearArcs() { state.arcs = []; restartRaf(); return api; },

    flyTo(lon, lat, ms) {
      _flyToInternal(lon, lat, ms);
      return api;
    },

    setSpin(speed) {
      if (speed === false || speed === 0) {
        state.spinEnabled = false;
        state.userSpinDisabled = true;
      } else {
        state.spinEnabled = !state.reducedMotion;
        state.userSpinDisabled = false;
        if (typeof speed === 'number') state.autoSpin = speed;
      }
      restartRaf();
      return api;
    },

    setTheme(theme) { Object.assign(state.theme, theme || {}); restartRaf(); return api; },
    setZoom(z) { state.zoom = clamp(z, 0.6, 1.8); restartRaf(); return api; },

    pause() {
      if (state.rafId != null) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      return api;
    },
    resume() { restartRaf(); return api; },

    on, off,

    toDataURL(type, quality) {
      if (!state.canvas) return null;
      return state.canvas.toDataURL(type || 'image/png', quality);
    },
    toBlob(cb, type, quality) {
      if (!state.canvas) { cb(null); return; }
      state.canvas.toBlob(cb, type || 'image/png', quality);
    },

    _state: state,
    _subsolarPoint: subsolarPoint,
    _sunVector: sunVector,
    _hasOffscreen: hasOffscreen,
    _rotationFor: rotationFor,
    _lonLatToVec: lonLatToVec,
    _atlasSource: () => state.atlasSource,
    _coastlineRuns: () => (state.atlas && state.atlas.countryRings[0]
      ? state.atlas.countryRings[0].rings.length : 0),
    _starCount: () => (state.stars ? state.stars.length : 0),
    _lastAppliedLocation: () => state._lastAppliedLocation,

    _starCatalog: () => state.stars,
    _precess: (vec, date) => precessJ2000ToDate(vec, date || new Date()),
    _precessMatrix: (date) => _precessMatrix(date),

    _starProjectionAge: () => (state._starProjection ? Date.now() - state._starProjection.at : -1),
    _countrySphereCount: () => {
      if (!state.atlas) return 0;
      let n = 0;
      for (const c of state.atlas.countryRings) if (c.sphere) n++;
      return n;
    }
  };

  Object.defineProperty(global, 'VioraHeroGlobe', {
    value: api,
    writable: false,
    configurable: true
  });

  if (typeof document !== 'undefined') {
    const kick = () => {
      if (document.getElementById('vioraHeroGlobeCanvas') && !api._inited) api.init();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', kick, { once: true });
    } else {
      kick();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
