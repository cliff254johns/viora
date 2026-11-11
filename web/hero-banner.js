/* ═══════════════════════════════════════════════════════════
   main/hero-banner.js — VIORA dashboard hero banner
   v4.8 — effect visibility on bright sky, clock-follows-location

   Layer order (owned by HTML/CSS):
     #vioraHeroSkyCanvas        (z0)  hero-sky.js    — stars, moon, MW
     #vioraHeroTerminatorCanvas (z1)  hero-terminator.js — sky gradient
     #vioraHeroArcSvg           (z2)  hero-orb.js    — sun/moon arc
     #vioraHeroCanvas           (z3)  THIS FILE      — particles & clouds
     .viora-hero-globe-wrap     (z4)  hero-globe.js  — globe
     .viora-hero-scrim          (z6)  CSS
     #vioraHeroOrb              (z11) hero-orb.js    — sun/moon disc
     .viora-hero-content        (z10) HTML

   v4.8 changes:
     • Weather effects retuned for bright sky:
       - Rain: dark blue-grey core + light highlight
       - Snow: shadow ring + white core
       - Clouds: soft drop shadow + bright top
       - cloudSettings() alphas raised 30–50%
     • Clock follows location:
       - _applyLocation() calls startTicker() after reset
       - VioraTime.on('synced') forces renderChrome()
       - renderChrome() also restarts the ticker defensively
     • getSky() fallback peakNorm = 0.85 (was 0.5)
     • No other changes to orb ownership, cloud floor,
       data-sky-phase, or terminator opacity from v4.7.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function nowDate() {
    try {
      if (typeof global.__vioraNow === 'function') return global.__vioraNow();
      if (global.VioraTime && typeof global.VioraTime.now === 'function') return global.VioraTime.now();
    } catch (_) {}
    return new Date();
  }
  function nowMs() {
    try {
      if (typeof global.__vioraNowMs === 'function') return global.__vioraNowMs();
      if (global.VioraTime && typeof global.VioraTime.nowMs === 'function') return global.VioraTime.nowMs();
    } catch (_) {}
    return Date.now();
  }
  global.__vioraHeroNowDate = nowDate;
  global.__vioraHeroNowMs   = nowMs;

  function localParts(date, tz) {
    try {
      if (global.VioraTime && typeof global.VioraTime.localParts === 'function') {
        return global.VioraTime.localParts(date, tz);
      }
    } catch (_) {}
    return _localPartsFallback(date, tz);
  }

  function reportError(scope, err, extra) {
    const payload = {
      scope,
      msg: String((err && err.message) || err || 'unknown'),
      stack: err && err.stack ? String(err.stack).slice(0, 400) : null,
      ...(extra || {})
    };
    try { console.warn('[hero-banner]', scope, payload.msg); } catch (_) {}
    try {
      if (typeof global.__vioraMetrics === 'function') {
        global.__vioraMetrics('hero-banner.error', payload);
      }
    } catch (_) {}
  }

  const flags = (global.__vioraFlags = Object.assign({
    weatherWorker: true,
    weatherOpenMeteo: true,
    hourlyForecast: false,
    reducedMotionHeavy: false,
    circuitBreaker: true
  }, global.__vioraFlags || {}));

  /* ── Shared RAF ── */
  const RAF = (function () {
    const callbacks = new Set();
    let rafId = null;
    let running = false;

    function loop(ts) {
      if (!running) return;
      const hidden = (typeof document !== 'undefined') && document.hidden;
      if (!hidden) {
        for (const cb of callbacks) {
          try { cb(ts); } catch (e) { reportError('raf.tick', e); }
        }
      }
      rafId = requestAnimationFrame(loop);
    }

    return {
      register(cb) {
        callbacks.add(cb);
        if (!running) { running = true; rafId = requestAnimationFrame(loop); }
        return () => {
          callbacks.delete(cb);
          if (callbacks.size === 0 && running) {
            running = false;
            if (rafId != null) cancelAnimationFrame(rafId);
            rafId = null;
          }
        };
      },
      start() {
        if (running) return;
        running = true;
        rafId = requestAnimationFrame(loop);
      },
      stop() {
        running = false;
        if (rafId != null) cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  })();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) RAF.stop();
    else RAF.start();
  });

  let _heroVisible = true;

  /* ── State proxy ── */
  function getState() {
    const s = global.state;
    if (!s || typeof s !== 'object') return (global.state = { data: {} });
    if (!s.data || typeof s.data !== 'object') s.data = {};
    return s;
  }
  const state = new Proxy({}, {
    get(_, prop) { const s = getState(); const v = s[prop]; return typeof v === 'function' ? v.bind(s) : v; },
    set(_, prop, value) { getState()[prop] = value; return true; },
    has(_, prop) { return prop in getState(); },
    ownKeys() { return Reflect.ownKeys(getState()); },
    getOwnPropertyDescriptor(_, prop) { return Reflect.getOwnPropertyDescriptor(getState(), prop); }
  });

  /* ── Locations ── */
  global.VIORA_HERO_QUICK_CITIES = [
    { id: 'meru',      name: 'Meru',      label: 'Meru, Kenya',    lat: -0.04626, lon: 37.65587,  tz: 'Africa/Nairobi', flag: '🇰🇪' },
    { id: 'newyork',   name: 'New York',  label: 'New York, USA',  lat: 40.71278, lon: -74.00594, tz: 'America/New_York', flag: '🇺🇸' },
    { id: 'singapore', name: 'Singapore', label: 'Singapore',      lat: 1.35208,  lon: 103.81984, tz: 'Asia/Singapore',  flag: '🇸🇬' },
    { id: 'china',     name: 'China',     label: 'Beijing, China', lat: 39.90420, lon: 116.40740, tz: 'Asia/Shanghai',   flag: '🇨🇳' },
    { id: 'england',   name: 'England',   label: 'London, England',lat: 51.50722, lon: -0.12750,  tz: 'Europe/London',   flag: '🇬🇧' }
  ];

  global.VIORA_HERO_LOCATIONS = [
    { id: 'meru',    name: 'Meru, Kenya',     lat: -0.04626, lon: 37.65587, tz: 'Africa/Nairobi' },
    { id: 'nairobi', name: 'Nairobi, Kenya',  lat: -1.28639, lon: 36.81722, tz: 'Africa/Nairobi' },
    { id: 'mombasa', name: 'Mombasa, Kenya',  lat: -4.04374, lon: 39.66821, tz: 'Africa/Nairobi' },
    { id: 'kampala', name: 'Kampala, Uganda', lat:  0.34760, lon: 32.58252, tz: 'Africa/Nairobi' },
    { id: 'london',  name: 'London, UK',      lat: 51.50722, lon: -0.12750, tz: 'Europe/London' },
    { id: 'newyork', name: 'New York, USA',   lat: 40.71278, lon: -74.00594,tz: 'America/New_York' },
    { id: 'singapore', name: 'Singapore',     lat: 1.35208,  lon: 103.81984,tz: 'Asia/Singapore' },
    { id: 'china',   name: 'Beijing, China',  lat: 39.90420, lon: 116.40740,tz: 'Asia/Shanghai' }
  ];

  function allLocations() {
    const seen = new Set();
    const out = [];
    for (const list of [global.VIORA_HERO_LOCATIONS, global.VIORA_HERO_QUICK_CITIES]) {
      for (const l of list) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        out.push(l);
      }
    }
    return out;
  }
  function findLocationById(id) {
    return allLocations().find(l => l.id === id) || null;
  }
  
  /* ── deriveTzFromLatLon ──
   Given a lat/lon, look up the nearest known city in
   VIORA_HERO_LOCATIONS or VIORA_HERO_QUICK_CITIES and
   return its tz. Used when a saved weather location was
   written by an older version of dashboard-weather.js
   that didn't save the tz.
   Falls back to null so callers can use a further fallback. */
function deriveTzFromLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  var all = allLocations();
  var best = null;
  var bestDist = Infinity;
  for (var i = 0; i < all.length; i++) {
    var l = all[i];
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon) || !l.tz) continue;
    var dLat = l.lat - lat;
    var dLon = l.lon - lon;
    /* Rough great-circle in degrees²: fine for the scale
       we're working at. */
    var d = dLat * dLat + dLon * dLon * Math.cos(lat * Math.PI / 180);
    if (d < bestDist) {
      bestDist = d;
      best = l;
    }
  }
  /* Only return if the nearest known city is within ~5°
     (roughly 500 km). Beyond that, don't guess. */
  if (best && bestDist <= 25) return best.tz;
  return null;
}

  const DEFAULT_LOCATION = Object.freeze(global.VIORA_HERO_LOCATIONS[0]);
  state._heroLocation = DEFAULT_LOCATION;

  (function adoptSavedWeatherLocationWhenReady() {
    let attempts = 0;
    const tryAdopt = () => {
      attempts++;
      const uid = state.operator?.uid;
      if (!uid) {
        if (attempts < 60) setTimeout(tryAdopt, 500);
        return;
      }
      const db = global.VioraDb;
      const refFn = global.ref;
      const getFn = global.get;
      if (!db || typeof refFn !== 'function' || typeof getFn !== 'function') {
        if (attempts < 60) setTimeout(tryAdopt, 500);
        return;
      }
      const path = `viora_data/users/${uid}/weatherLocation`;
      getFn(refFn(db, path)).then(snap => {
        if (!snap.exists()) return;
        const v = snap.val() || {};
        const lat = Number(v.lat), lon = Number(v.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const newLoc = {
  id: 'user-weather',
  name: v.city || 'My location',
  label: v.city || 'My location',
  lat, lon,
  tz: v.tz || deriveTzFromLatLon(lat, lon) || (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC',
};

             state._heroLocation = newLoc;

        try { invalidateSky(); } catch (_) {}
        try { if (typeof prewarmSolar === 'function') prewarmSolar(newLoc); } catch (_) {}

        /* Sync VioraTime to the saved location's timezone, force
           its cache to recompute, and reset _lastClock so the next
           paint shows the new time. Without this, the clock keeps
           the machine's timezone until the user opens the picker. */
        try {
          if (global.VioraTime && typeof global.VioraTime.setTimezone === 'function') {
            global.VioraTime.setTimezone(newLoc.tz);
          }
          if (global.VioraTime && typeof global.VioraTime.forceRefresh === 'function') {
            global.VioraTime.forceRefresh();
          }
        } catch (_) {}
        _lastClock = '';
        try { startTicker(); } catch (_) {}

        try { renderChrome(); } catch (_) {}
        try { renderWeather(); } catch (_) {}

        try {
          if (global.VioraHeroGlobe && typeof global.VioraHeroGlobe.setLocation === 'function') {
            global.VioraHeroGlobe.setLocation(newLoc.lon, newLoc.lat, {
              animate: true, duration: 1100, label: newLoc.name, id: newLoc.id
            });
          }
        } catch (e) { console.warn('[hero] globe pin move failed', e); }

        try {
          if (global.Viora && global.Viora.refreshWeather) {
            global.Viora.refreshWeather(true);
          }
        } catch (_) {}
      }).catch(() => {});
    };
    setTimeout(tryAdopt, 400);
  })();

  /* ── Local time ── */
  const _tzOffsets = new Map();
  const TZ_OFFSET_TTL_MS = 60 * 60 * 1000;

  const _tzOffsetFmtCache = new Map();
  function _getTzOffsetFormatter(tz) {
    let f = _tzOffsetFmtCache.get(tz);
    if (f) return f;
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
    } catch (_) {
      f = new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
    }
    _tzOffsetFmtCache.set(tz, f);
    return f;
  }

  const _weekdayLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const _monthLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function _computeTzOffsetMs(tz, now) {
    try {
      const fmt = _getTzOffsetFormatter(tz);
      const parts = fmt.formatToParts(now);
      let year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0;
      for (let i = 0; i < parts.length; i++) {
        const t = parts[i].type;
        const v = parts[i].value;
        if (t === 'year') year = Number(v);
        else if (t === 'month') month = Number(v);
        else if (t === 'day') day = Number(v);
        else if (t === 'hour') hour = Number(v);
        else if (t === 'minute') minute = Number(v);
        else if (t === 'second') second = Number(v);
      }
      const utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
      return utcMs - now.getTime();
    } catch (_) {
      return 0;
    }
  }

  function _getTzOffsetMs(tz) {
    /* Single source of truth: hero-time.js owns the tz cache.
       Only fall back to our local cache if VioraTime is missing. */
    try {
      if (global.VioraTime && typeof global.VioraTime.tzOffsetMs === 'function') {
        return global.VioraTime.tzOffsetMs(tz);
      }
    } catch (_) {}
    const now = Date.now();
    const entry = _tzOffsets.get(tz);
    if (entry && (now - entry.at) < TZ_OFFSET_TTL_MS) return entry.offsetMs;
    const offsetMs = _computeTzOffsetMs(tz, new Date(now));
    _tzOffsets.set(tz, { offsetMs, at: now });
    return offsetMs;
  }

  function _localPartsFallback(date, tz) {
    let offsetMs;
    try { offsetMs = _getTzOffsetMs(tz); }
    catch (_) { offsetMs = 0; }
    const local = new Date(date.getTime() + offsetMs);
    const hour = local.getUTCHours();
    const minute = local.getUTCMinutes();
    const second = local.getUTCSeconds();
    const weekday = _weekdayLong[local.getUTCDay()];
    const day = local.getUTCDate();
    const month = _monthLong[local.getUTCMonth()];
    const year = local.getUTCFullYear();
    const hh = hour < 10 ? '0' + hour : '' + hour;
    const mm = minute < 10 ? '0' + minute : '' + minute;
    const ss = second < 10 ? '0' + second : '' + second;
    return { hour, minute, second, hh, mm, ss, weekday, day, month, year };
  }

  /* ── Solar prewarm ── */
  let _prewarmedKey = '';
  function prewarmSolar(loc) {
    if (!loc) return;
    const key = loc.lat.toFixed(3) + '|' + loc.lon.toFixed(3);
    if (key === _prewarmedKey) return;
    if (!(global.Solar && typeof global.Solar.prewarm === 'function')) return;
    _prewarmedKey = key;
    try { global.Solar.prewarm(loc.lat, loc.lon); } catch (_) {}
  }
  function prewarmSolarIfStale(loc) {
    if (!loc) return;
    if (global.Solar && typeof global.Solar.prewarmIfStale === 'function') {
      try { global.Solar.prewarmIfStale(loc.lat, loc.lon); } catch (_) {}
      return;
    }
    prewarmSolar(loc);
  }

  /* ── Sky state cache ── */
  const skyState = { current: null, lastAt: 0 };
  let _tickSkyCache = null;
  let _tickSkyCacheAt = 0;

  function _beginTickSky() { _tickSkyCache = null; _tickSkyCacheAt = 0; }
  function _endTickSky()   { _tickSkyCache = null; _tickSkyCacheAt = 0; }

  function getSky() {
    const now = nowMs();
    if (_tickSkyCache && (now - _tickSkyCacheAt) < 500) return _tickSkyCache;
    const loc = state._heroLocation;
    if (!loc) return null;
    if (skyState.current && (now - skyState.lastAt) < 5000) {
      _tickSkyCache = skyState.current;
      _tickSkyCacheAt = now;
      return skyState.current;
    }
    try {
      if (global.Solar && typeof global.Solar.getSkyState === 'function') {
        const computed = global.Solar.getSkyState(loc.lat, loc.lon, new Date(nowMs()));
        if (computed && computed.sun && Number.isFinite(computed.sun.elevation)) {
          skyState.current = computed;
          skyState.lastAt = now;
          _tickSkyCache = computed;
          _tickSkyCacheAt = now;
          return computed;
        }
      }
      if (global.Solar && typeof global.Solar.getFull === 'function') {
        const f = global.Solar.getFull(loc.lat, loc.lon, new Date(nowMs()));
        skyState.current = {
          phase: f.skyPhase || (f.isDay ? 'day' : 'night'),
          isDay: !!f.isDay,
          isNight: !f.isDay,
          sun: {
            elevation: f.elevation,
            apparentElevation: f.apparentElevation ?? f.elevation,
            azimuth: f.azimuth,
            arcFraction: f.arcFraction ?? 0.5,
            dayFraction: f.dayFraction ?? 0.5,
            nightFraction: f.nightFraction ?? 0.5,
            sunrise: f.sunrise,
            sunset: f.sunset,
            polarDay: !!f.polarDay,
            polarNight: !!f.polarNight,
            peakNorm: 0.85
          },
          moon: { visible: false, phase: 0, illumination: 0, phaseName: 'unknown' },
          stars: { opacity: f.isDay ? 0 : 0.85 },
          orb: { mode: f.isDay ? 'sun' : 'moon', arcFraction: f.arcFraction ?? 0.5 }
        };
        _tickSkyCache = skyState.current;
        _tickSkyCacheAt = now;
        return skyState.current;
      }
    } catch (e) { reportError('getSky', e); }
    return null;
  }
  function invalidateSky() {
    skyState.current = null;
    skyState.lastAt = 0;
    _tickSkyCache = null;
    _tickSkyCacheAt = 0;
  }

  /* ── Hour + temp classes ── */
  const HOUR_CLASSES = [
    'viora-hero--dawn','viora-hero--morning','viora-hero--noon',
    'viora-hero--afternoon','viora-hero--dusk','viora-hero--evening',
    'viora-hero--night'
  ];
  const TEMP_CLASSES = [
    'viora-hero--weather-cold','viora-hero--weather-cool',
    'viora-hero--weather-mild','viora-hero--weather-warm',
    'viora-hero--weather-hot','viora-hero--weather-scorching',
    'viora-hero--weather-unknown'
  ];
  function heroHourClass(hour) {
    if (hour >= 5  && hour < 7)  return 'viora-hero--dawn';
    if (hour >= 7  && hour < 11) return 'viora-hero--morning';
    if (hour >= 11 && hour < 14) return 'viora-hero--noon';
    if (hour >= 14 && hour < 17) return 'viora-hero--afternoon';
    if (hour >= 17 && hour < 19) return 'viora-hero--dusk';
    if (hour >= 19 && hour < 22) return 'viora-hero--evening';
    return 'viora-hero--night';
  }
  function heroGreeting(hour) {
    if (hour < 5)  return 'Good night,';
    if (hour < 12) return 'Good morning,';
    if (hour < 17) return 'Good afternoon,';
    if (hour < 22) return 'Good evening,';
    return 'Good night,';
  }
  function tempClass(t) {
    if (t == null) return 'viora-hero--weather-unknown';
    if (t < 12) return 'viora-hero--weather-cold';
    if (t < 17) return 'viora-hero--weather-cool';
    if (t < 21) return 'viora-hero--weather-mild';
    if (t < 25) return 'viora-hero--weather-warm';
    if (t < 29) return 'viora-hero--weather-hot';
    return 'viora-hero--weather-scorching';
  }
  function weatherIcon(code) {
    if (code == null) return 'fa-cloud';
    if (code === 0)   return 'fa-sun';
    if (code <= 2)    return 'fa-cloud-sun';
    if (code === 3)   return 'fa-cloud';
    if (code <= 48)   return 'fa-smog';
    if (code <= 57)   return 'fa-cloud-rain';
    if (code <= 67)   return 'fa-cloud-showers-heavy';
    if (code <= 77)   return 'fa-snowflake';
    if (code <= 82)   return 'fa-cloud-showers-water';
    if (code <= 86)   return 'fa-cloud-meatball';
    return 'fa-cloud-bolt';
  }
  function wmoText(code) {
    if (code == null) return '—';
    if (code === 0)   return 'Clear sky';
    if (code === 1)   return 'Mainly clear';
    if (code === 2)   return 'Partly cloudy';
    if (code === 3)   return 'Overcast';
    if (code === 45)  return 'Fog';
    if (code === 48)  return 'Depositing rime fog';
    if (code === 51)  return 'Light drizzle';
    if (code === 53)  return 'Moderate drizzle';
    if (code === 55)  return 'Dense drizzle';
    if (code === 56)  return 'Light freezing drizzle';
    if (code === 57)  return 'Dense freezing drizzle';
    if (code === 61)  return 'Slight rain';
    if (code === 63)  return 'Moderate rain';
    if (code === 65)  return 'Heavy rain';
    if (code === 66)  return 'Light freezing rain';
    if (code === 67)  return 'Heavy freezing rain';
    if (code === 71)  return 'Slight snow';
    if (code === 73)  return 'Moderate snow';
    if (code === 75)  return 'Heavy snow';
    if (code === 77)  return 'Snow grains';
    if (code === 80)  return 'Slight rain showers';
    if (code === 81)  return 'Moderate rain showers';
    if (code === 82)  return 'Violent rain showers';
    if (code === 85)  return 'Slight snow showers';
    if (code === 86)  return 'Heavy snow showers';
    if (code === 95)  return 'Thunderstorm';
    if (code === 96)  return 'Thunderstorm with slight hail';
    if (code === 99)  return 'Thunderstorm with heavy hail';
    return 'Code ' + code;
  }

  const _cloudCache = new Map();
  function cloudSettings(code) {
    const key = code == null ? 'null' : code;
    let s = _cloudCache.get(key);
    if (s) return s;
    /* v4.8 — alphas raised ~30–50% so cloud puffs read on
       a bright Preetham sky. */
    if (code == null)  s = { count: 3, alpha: 0.45, tint: '240,245,255' };
    else if (code === 0) s = { count: 2, alpha: 0.38, tint: '255,255,255' };
    else if (code === 1) s = { count: 3, alpha: 0.46, tint: '255,255,255' };
    else if (code === 2) s = { count: 4, alpha: 0.62, tint: '255,255,255' };
        /* ★ FIX: Overcast clouds need a bright, thick grey to look realistic 
       during the day, not transparent dark shapes. */
    else if (code === 3) s = { count: 8, alpha: 0.85, tint: '200,210,225' };
    else if (code <= 48) s = { count: 3, alpha: 0.45, tint: '220,225,235' };
    else if (code <= 57) s = { count: 5, alpha: 0.65, tint: '215,220,230' };
    else if (code <= 67) s = { count: 6, alpha: 0.72, tint: '200,210,225' };
    else if (code <= 77) s = { count: 6, alpha: 0.68, tint: '245,248,255' };
    else if (code <= 82) s = { count: 5, alpha: 0.68, tint: '200,210,225' };
    else if (code <= 86) s = { count: 6, alpha: 0.72, tint: '240,245,255' };
    else                 s = { count: 6, alpha: 0.80, tint: '150,160,180' };
    _cloudCache.set(key, s);
    return s;
  }

  const CLOUD_FLOOR_BY_CODE = {
    0: 0.05, 1: 0.10, 2: 0.35, 3: 0.70,
    45: 0.60, 48: 0.65,
    51: 0.75, 53: 0.80, 55: 0.85, 56: 0.85, 57: 0.85,
    61: 0.85, 63: 0.90, 65: 0.95, 66: 0.90, 67: 0.95,
    71: 0.85, 73: 0.90, 75: 0.95, 77: 0.90,
    80: 0.80, 81: 0.88, 82: 0.95,
    85: 0.85, 86: 0.92,
    95: 0.95, 96: 0.97, 99: 0.98
  };
  function cloudFloorFor(code) {
    if (code == null) return 0.10;
    const c = Number(code);
    if (Number.isFinite(c) && CLOUD_FLOOR_BY_CODE[c] != null) {
      return CLOUD_FLOOR_BY_CODE[c];
    }
    return 0.10;
  }

  const _wpCache = new Map();
  function weatherProfile(code, isDay, opts) {
    opts = opts || {};
    const c = Number(code);
    code = Number.isFinite(c) ? c : 0;
    const tempC      = Number.isFinite(opts.tempC) ? opts.tempC : null;
    const precipProb = Number.isFinite(opts.precipProb) ? opts.precipProb : null;
    const precip     = Number.isFinite(opts.precip) ? opts.precip : null;
    const cloudPct   = Number.isFinite(opts.cloudCover) ? opts.cloudCover : null;
    const windDir    = Number.isFinite(opts.windDir) ? opts.windDir : null;

    const key = code + ':' +
                (isDay ? 'd' : 'n') + ':' +
                (tempC == null ? 'x' : Math.round(tempC)) + ':' +
                (precipProb == null ? 'x' : Math.round(precipProb / 10)) + ':' +
                (precip == null ? 'x' : Math.round(precip * 2)) + ':' +
                (cloudPct == null ? 'x' : Math.round(cloudPct / 5)) + ':' +
                (windDir == null ? 'x' : Math.round(windDir / 15));

    let p = _wpCache.get(key);
    if (p) return p;

    p = {
      code,
      isDay: isDay !== false,
      rain: 0, snow: 0, fog: 0, sunRays: 0,
      lightning: 0, wind: 0, cloudCover: 0.3,
      tint: [255, 255, 255],
      windDir: windDir
    };

    if (code === 0)                      { p.cloudCover = 0.05; p.sunRays = p.isDay ? 1 : 0;   p.tint = [255, 250, 235]; }
    else if (code === 1)                 { p.cloudCover = 0.15; p.sunRays = p.isDay ? 0.7 : 0; p.tint = [255, 250, 240]; }
    else if (code === 2)                 { p.cloudCover = 0.35; p.sunRays = p.isDay ? 0.4 : 0; p.tint = [230, 235, 245]; }
    else if (code === 3)                 { p.cloudCover = 0.65;                                  p.tint = [215, 220, 230]; }
    else if (code === 45 || code === 48) { p.cloudCover = 0.55; p.fog = 0.7;                     p.tint = [220, 225, 235]; }
    else if (code >= 51 && code <= 57)   { p.cloudCover = 0.70; p.rain = 0.35; p.wind = 0.3;     p.tint = [200, 210, 225]; }
    else if (code >= 61 && code <= 67)   { p.cloudCover = 0.85; p.rain = 0.75; p.wind = 0.5;     p.tint = [180, 195, 215]; }
    else if (code >= 71 && code <= 77)   { p.cloudCover = 0.80; p.snow = 0.80; p.wind = 0.4;     p.tint = [245, 248, 255]; }
    else if (code >= 80 && code <= 82)   { p.cloudCover = 0.80; p.rain = 0.85; p.wind = 0.6;     p.tint = [180, 195, 215]; }
    else if (code >= 85 && code <= 86)   { p.cloudCover = 0.85; p.snow = 0.85; p.wind = 0.5;     p.tint = [240, 245, 255]; }
    else if (code >= 95)                 { p.cloudCover = 0.90; p.rain = 0.90; p.lightning = 1;  p.wind = 0.7; p.tint = [150, 160, 180]; }
    else                                 { p.cloudCover = 0.40;                                  p.tint = [230, 235, 245]; }

    const isWetCode = (code >= 51 && code <= 67) ||
                      (code >= 80 && code <= 82) ||
                      (code >= 95 && code <= 99);
    const isSnowCode = (code >= 71 && code <= 77) ||
                       (code >= 85 && code <= 86);
    if (!isWetCode) p.rain = 0;
    if (!isSnowCode) p.snow = 0;

    if (tempC != null) {
      if (p.snow > 0 && tempC > 3) {
        const melt = Math.min(1, (tempC - 3) / 5);
        p.rain = Math.max(p.rain, p.snow * melt);
        p.snow = p.snow * (1 - melt);
      } else if (p.rain > 0 && tempC < 0) {
        const freeze = Math.min(1, Math.abs(tempC) / 3);
        p.snow = Math.max(p.snow, p.rain * freeze);
        p.rain = p.rain * (1 - freeze);
      }
    }

    if (precipProb != null || precip != null) {
      let scale = 1;
      if (precipProb != null) scale *= (0.35 + 0.65 * (precipProb / 100));
      if (precip != null)     scale *= (0.5 + 0.5 * Math.min(1, precip / 5));
      p.rain *= scale;
      p.snow *= scale;
      p.wind *= (0.85 + 0.3 * scale);
    }

    const floor = cloudFloorFor(code);
    if (cloudPct != null) {
      const actual = Math.max(0, Math.min(1, cloudPct / 100));
      p.cloudCover = Math.max(actual, floor);
    } else {
      p.cloudCover = Math.max(p.cloudCover, floor);
    }

    if (_wpCache.size > 120) _wpCache.clear();
    _wpCache.set(key, p);
    return p;
  }

  const WEATHER_TTL_MS = 10 * 60 * 1000;
  const WEATHER_TIMEOUT_MS = 8000;
  const BREAKER_FAILS = 3;
  const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
  const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

  const breaker = { fails: 0, openUntil: 0 };
  let weatherAbort = null;
  let _provider = null;

  const Weather = {
    cache() {
      if (!state._heroWeatherCache || typeof state._heroWeatherCache !== 'object') {
        state._heroWeatherCache = {};
      }
      return state._heroWeatherCache;
    },
    get(locId = state._heroLocation?.id) {
      return locId ? this.cache()[locId] || null : null;
    },
    set(locId, entry) { this.cache()[locId] = entry; },
    clear() { state._heroWeatherCache = {}; },
    get code() { return this.get()?.code ?? null; },
    get hasData() { return this.get() != null; },
    isFresh(locId = state._heroLocation?.id) {
      const e = this.get(locId);
      if (!e) return false;
      return (nowMs() - (e._fetchedAt || 0)) < WEATHER_TTL_MS;
    }
  };

  function setWeatherProvider(fn) { _provider = typeof fn === 'function' ? fn : null; }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => {
        const err = new Error('weather timeout after ' + ms + 'ms');
        err.code = 'ETIMEDOUT';
        rej(err);
      }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function openMeteoUrl(loc) {
    const params = new URLSearchParams({
      latitude:  String(loc.lat),
      longitude: String(loc.lon),
      current:   'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly:    'temperature_2m,weather_code,precipitation_probability',
      daily:     'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
      timezone:  'auto',
      forecast_days: '7',
      wind_speed_unit: 'kmh',
      temperature_unit: 'celsius'
    });
    return OPEN_METEO_URL + '?' + params.toString();
  }

  function normalizeOpenMeteo(json, loc) {
    if (!json || typeof json !== 'object') return null;
    const c = json.current || {};
    const d = json.daily || {};
    const h = json.hourly || {};

    const daily = [];
    if (Array.isArray(d.time)) {
      for (let i = 0; i < d.time.length; i++) {
        daily.push({
          date:        d.time[i],
          tempMax:     d.temperature_2m_max ? d.temperature_2m_max[i] : null,
          tempMin:     d.temperature_2m_min ? d.temperature_2m_min[i] : null,
          code:        d.weather_code ? d.weather_code[i] : null,
          sunrise:     d.sunrise ? d.sunrise[i] : null,
          sunset:      d.sunset ? d.sunset[i] : null,
          uvMax:       d.uv_index_max ? d.uv_index_max[i] : null,
          precipProb:  d.precipitation_probability_max ? d.precipitation_probability_max[i] : null
        });
      }
    }

    let precipProb = null;
    if (Array.isArray(h.time) && Array.isArray(h.precipitation_probability)) {
      // Both current.time and hourly.time are in Open-Meteo's requested
      // location timezone. UTC comparison mislabels the current hour.
      const currentHour = typeof c.time === 'string'
        ? c.time.slice(0, 13)
        : new Date().toISOString().slice(0, 13);
      for (let i = h.time.length - 1; i >= 0; i--) {
        if (String(h.time[i]).slice(0, 13) <= currentHour) {
          precipProb = h.precipitation_probability[i];
          break;
        }
      }
    }

    const code = c.weather_code != null ? c.weather_code : (daily[0] && daily[0].code);

    return {
      code,
      text:        wmoText(code),
      tempC:       c.temperature_2m != null ? c.temperature_2m : null,
      feelsLike:   c.apparent_temperature != null ? c.apparent_temperature : null,
      humidity:    c.relative_humidity_2m != null ? c.relative_humidity_2m : null,
      windKph:     c.wind_speed_10m != null ? c.wind_speed_10m : null,
      windDir:     c.wind_direction_10m != null ? c.wind_direction_10m : null,
      precip:      c.precipitation != null ? c.precipitation : null,
      precipProb:  precipProb,
      pressure:    c.pressure_msl != null ? c.pressure_msl : null,
      cloudCover:  c.cloud_cover != null ? c.cloud_cover : null,
      uvMax:       daily[0] && daily[0].uvMax != null ? daily[0].uvMax : null,
      isDay:       c.is_day === 1,
      daily:       daily,
      _fetchedAt:  Date.now(),
      _source:     'open-meteo',
      _locId:      loc.id
    };
  }

  async function fetchWeather(forceRefresh = false, opts = {}) {
    const loc = state._heroLocation;
    if (!loc) return null;

    const entry = Weather.get(loc.id);
    const fresh = entry && (nowMs() - (entry._fetchedAt || 0)) < WEATHER_TTL_MS;

    if (!forceRefresh && fresh) return entry;

    if (!forceRefresh && entry) {
      _refreshInBackground(loc, opts);
      return entry;
    }

    if (flags.circuitBreaker && breaker.openUntil > nowMs()) {
      return entry || null;
    }

    if (_provider) {
      try {
        const res = await withTimeout(Promise.resolve(_provider({ ...loc })), WEATHER_TIMEOUT_MS);
        if (res && typeof res === 'object') {
          res._fetchedAt = Date.now();
          res._source = res._source || 'provider';
          Weather.set(loc.id, res);
          breaker.fails = 0; breaker.openUntil = 0;
          return res;
        }
      } catch (e) {
        reportError('weather.provider', e, { locId: loc.id });
        breaker.fails++;
        if (breaker.fails >= BREAKER_FAILS) breaker.openUntil = nowMs() + BREAKER_COOLDOWN_MS;
      }
      return entry || null;
    }

    if (flags.weatherOpenMeteo && typeof fetch === 'function') {
      if (weatherAbort) try { weatherAbort.abort(); } catch (_) {}
      weatherAbort = new AbortController();
      const signal = weatherAbort.signal;
      const requestedLocId = loc.id;
      try {
        const res = await withTimeout(
          fetch(openMeteoUrl(loc), { signal, mode: 'cors', cache: 'no-store' })
            .then(r => {
              if (!r.ok) throw new Error('open-meteo http ' + r.status);
              return r.json();
            }),
          WEATHER_TIMEOUT_MS
        );
        const norm = normalizeOpenMeteo(res, loc);
        if (norm) {
          Weather.set(requestedLocId, norm);
          breaker.fails = 0; breaker.openUntil = 0;
          return norm;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return entry || null;
        reportError('weather.openmeteo', e, { locId: loc.id });
        breaker.fails++;
        if (breaker.fails >= BREAKER_FAILS) breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      }
    }

    if (flags.weatherWorker && typeof global.callFn === 'function') {
      if (weatherAbort) try { weatherAbort.abort(); } catch (_) {}
      weatherAbort = new AbortController();
      const signal = weatherAbort.signal;
      const requestedLocId = loc.id;
      try {
        const call = global.callFn('weather', { lat: loc.lat, lon: loc.lon, tz: loc.tz, signal });
        const res = await withTimeout(Promise.resolve(call), WEATHER_TIMEOUT_MS);
        if (res && typeof res === 'object') {
          res._fetchedAt = Date.now();
          res._source = res._source || 'callFn';
          Weather.set(requestedLocId, res);
          breaker.fails = 0; breaker.openUntil = 0;
          return res;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return entry || null;
        reportError('weather.worker', e, { locId: loc.id });
        breaker.fails++;
        if (breaker.fails >= BREAKER_FAILS) breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      }
    }

    return entry || null;
  }

  let _bgRefreshInFlight = null;
  function _refreshInBackground(loc, opts) {
    if (_bgRefreshInFlight) return _bgRefreshInFlight;
    const requestedLocId = loc.id;
    _bgRefreshInFlight = (async () => {
      try {
        const fresh = await fetchWeather(true, opts);
        if (fresh && state._heroLocation && state._heroLocation.id === requestedLocId) {
          try { renderWeather(); } catch (_) {}
        }
      } catch (_) {}
      finally { _bgRefreshInFlight = null; }
    })();
    return _bgRefreshInFlight;
  }

  /* ── Cloud DOM cache ── */
  let _cloudNodes = null;
  function _queryCloudNodes(banner) {
    if (_cloudNodes && _cloudNodes.banner === banner) return _cloudNodes;
    _cloudNodes = {
      banner,
      front: banner.querySelectorAll('.viora-hero-clouds-front .cloud'),
      back:  banner.querySelectorAll('.viora-hero-clouds-back .cloud-back')
    };
    return _cloudNodes;
  }

  let _lastCloudKey = '';
  function applyCloudSettings(settings) {
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner || !settings) return;

    const w = Weather.get();
    const cloudPct = w && Number.isFinite(w.cloudCover)
      ? Math.max(0, Math.min(100, w.cloudCover))
      : null;

    let effectiveCount = settings.count;
    let opacityScale   = 1;

    if (cloudPct != null) {
      const coverFrac = cloudPct / 100;
      effectiveCount = Math.max(
        cloudPct < 5 ? 0 : 1,
        Math.round(settings.count * coverFrac)
      );
      opacityScale = 0.35 + 0.65 * coverFrac;
    }

    const effectiveAlpha = Math.round(settings.alpha * opacityScale * 100) / 100;
    const key = effectiveCount + '|' + effectiveAlpha + '|' + settings.tint;
    if (key === _lastCloudKey) return;
    _lastCloudKey = key;

    banner.style.setProperty('--hero-cloud-alpha', String(effectiveAlpha));
    banner.style.setProperty('--hero-cloud-tint', settings.tint);
    banner.style.setProperty('--hero-cloud-alpha-2',
      String(Math.round(effectiveAlpha * 0.6 * 100) / 100));

    const { front, back } = _queryCloudNodes(banner);
    for (let i = 0; i < front.length; i++) {
      front[i].classList.toggle('cloud-hidden', i >= effectiveCount);
    }
    const backCount = Math.max(0, effectiveCount - 2);
    for (let i = 0; i < back.length; i++) {
      back[i].style.opacity = i >= backCount ? '0' : '1';
    }

    if (w && typeof w.windKph === 'number') {
      const base = Math.max(30, 240 - w.windKph * 6);
      const damp = cloudPct != null ? 0.7 + 0.3 * (cloudPct / 100) : 1;
      const dur = Math.round(base * damp);
      banner.style.setProperty('--hero-cloud-drift', dur + 's');
    }
  }

  /* ── Forecast curve ── */
  const _weekdayFmt = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' });
  const _weekdayLongFmt = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' });
  const _dayCache = new Map();
  function dayShort(dateStr) {
    let v = _dayCache.get(dateStr);
    if (v) return v;
    v = _weekdayFmt.format(new Date(dateStr + 'T12:00:00Z'));
    _dayCache.set(dateStr, v);
    if (_dayCache.size > 400) _dayCache.clear();
    return v;
  }
  function dayLong(dateStr) {
    return _weekdayLongFmt.format(new Date(dateStr + 'T12:00:00Z'));
  }

  function forecastSlice() {
    const w = Weather.get();
    const daily = w && Array.isArray(w.daily) ? w.daily : [];
    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    return isMobile ? daily.slice(0, 5) : daily.slice(0, 7);
  }

  const curveState = {
    points: [], w: 0, h: 0,
    hoverIndex: -1, focusIndex: -1, bound: false,
    canvasW: 0, canvasH: 0, dpr: 1,
    rectLeft: 0, rectTop: 0,
    lastDaily: null, lastPeakIdx: -1,
    _lastKey: ''
  };

  function tempBand(t) {
    if (t == null) return [56, 189, 248];
    if (t < 15)   return [96, 165, 250];
    if (t < 25)   return [45, 212, 191];
    return [250, 204, 21];
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function renderForecastCurve() {
    const canvas = document.getElementById('vioraHeroForecastCanvas');
    const strip  = document.getElementById('vioraHeroForecastStrip');
    const peakEl = document.getElementById('vioraHeroForecastPeak');
    if (!canvas || !strip) return;

    const daily = forecastSlice();

    const dailyKey = daily.length
      ? daily.map(d => d.date + ':' + d.tempMax + ':' + d.tempMin + ':' + d.code).join('|')
      : 'empty';
    const interactKey = curveState.hoverIndex + ':' + curveState.focusIndex;
    const fullKey = dailyKey + '|' + interactKey;
    if (fullKey === curveState._lastKey) return;
    curveState._lastKey = fullKey;

    if (!daily.length) {
      if (canvas.width !== 0) { canvas.width = 0; canvas.height = 0; }
      if (strip._lastKey !== 'empty') { strip.innerHTML = ''; strip._lastKey = 'empty'; }
      if (peakEl) peakEl.textContent = 'Forecast unavailable';
      curveState.points = [];
      curveState.lastDaily = null;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const w = rect.width  || canvas.clientWidth  || 320;
    const h = rect.height || canvas.clientHeight || 72;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const newW = Math.round(w * dpr);
    const newH = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
      curveState.canvasW = newW;
      curveState.canvasH = newH;
      curveState.dpr = dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    curveState.w = w;
    curveState.h = h;
    curveState.rectLeft = rect.left;
    curveState.rectTop = rect.top;

    let maxT = -Infinity, minT = Infinity;
    for (let i = 0; i < daily.length; i++) {
      const mx = Number(daily[i].tempMax ?? 0);
      const mn = Number(daily[i].tempMin ?? 99);
      if (mx > maxT) maxT = mx;
      if (mn < minT) minT = mn;
    }
    const range = Math.max(1, maxT - minT);
    const step = daily.length > 1 ? w / (daily.length - 1) : 0;

    const points = new Array(daily.length);
    let peakIdx = 0, peakT = -Infinity;
    for (let i = 0; i < daily.length; i++) {
      const d = daily[i];
      const tMax = Number(d.tempMax ?? 0);
      const x = i * step;
      const norm = (tMax - minT) / range;
      const y = h - 8 - norm * (h - 22);
      points[i] = { x, y, tMax, tempMin: d.tempMin, code: d.code, isPeak: false, index: i };
      if (tMax > peakT) { peakT = tMax; peakIdx = i; }
    }
    points[peakIdx].isPeak = true;
    curveState.points = points;

    if (points.length > 1) {
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      const stepT = 1 / Math.max(1, points.length - 1);
      for (let i = 0; i < points.length; i++) {
        const band = tempBand(points[i].tMax);
        grad.addColorStop(i * stepT, `rgba(${band[0]},${band[1]},${band[2]},0.42)`);
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, h);
      for (let i = 0; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.lineTo(points[points.length - 1].x, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const isHover = i === curveState.hoverIndex || i === curveState.focusIndex;
      if (p.isPeak || isHover) {
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(p.x, p.y, isHover ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tipIdx = curveState.hoverIndex >= 0 ? curveState.hoverIndex : curveState.focusIndex;
    if (tipIdx >= 0 && points[tipIdx]) {
      const p = points[tipIdx];
      const d = daily[tipIdx];
      const dayName = dayShort(d.date);
      const line1 = `${dayName}  ${Math.round(d.tempMax)}°`;
      const line2 = `Low ${Math.round(d.tempMin ?? 0)}°`;

      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      const tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 16;
      const th = 32;
      const tx = Math.min(w - tw - 4, Math.max(4, p.x - tw / 2));
      const ty = Math.max(4, p.y - th - 10);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      roundRect(ctx, tx, ty, tw, th, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(line1, tx + 8, ty + 13);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(line2, tx + 8, ty + 26);
    }

    const stripKey = daily.map(d => d.date + ':' + d.tempMax + ':' + d.code).join('|');
    if (strip._lastKey !== stripKey) {
      strip._lastKey = stripKey;
      let html = '';
      for (let i = 0; i < daily.length; i++) {
        const d = daily[i];
        const isPeak = i === peakIdx;
        html +=
          '<div class="fx-day' + (isPeak ? ' is-peak' : '') + '" data-idx="' + i + '">' +
            '<div class="fx-day-label">' + dayShort(d.date) + '</div>' +
            '<div class="fx-day-icon"><i class="fa-solid ' + weatherIcon(d.code) + '"></i></div>' +
            '<div class="fx-day-temp">' + Math.round(d.tempMax ?? 0) + '°</div>' +
          '</div>';
      }
      strip.innerHTML = html;
    }

    if (peakEl && curveState.lastPeakIdx !== peakIdx) {
      curveState.lastPeakIdx = peakIdx;
      const peak = daily[peakIdx];
      peakEl.textContent = `Peak ${dayLong(peak.date)}: ${Math.round(peak.tempMax)}°C`;
    }
  }

  function bindForecastInteractions() {
    if (curveState.bound) return;
    const canvas = document.getElementById('vioraHeroForecastCanvas');
    if (!canvas) return;
    curveState.bound = true;
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Weekly forecast curve. Use arrow keys to explore days.');

    function indexFromX(x) {
      const pts = curveState.points;
      if (!pts.length) return -1;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = Math.abs(pts[i].x - x);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const idx = indexFromX(e.clientX - rect.left);
      if (idx !== curveState.hoverIndex) {
        curveState.hoverIndex = idx;
        renderForecastCurve();
      }
    });
    canvas.addEventListener('mouseleave', () => {
      if (curveState.hoverIndex !== -1) {
        curveState.hoverIndex = -1;
        renderForecastCurve();
      }
    });
    canvas.addEventListener('keydown', e => {
      const n = curveState.points.length;
      if (!n) return;
      let i = curveState.focusIndex < 0 ? 0 : curveState.focusIndex;
      if (e.key === 'ArrowRight') i = Math.min(n - 1, i + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else return;
      curveState.focusIndex = i;
      e.preventDefault();
      renderForecastCurve();
    });
    canvas.addEventListener('blur', () => {
      if (curveState.focusIndex !== -1) {
        curveState.focusIndex = -1;
        renderForecastCurve();
      }
    });
  }

  /* ── Particles ── */
  const PARTICLE_IDLE_THRESHOLD = 0.02;

  const particles = {
    canvas: null, ctx: null,
    w: 0, h: 0, dpr: 1,
    bound: false, reducedMotion: false,
    unregister: null,
    running: false,
    baseRain: 220,
    baseSnow: 180,
    baseClouds: 20,
    rain: [], splashes: [], snow: [], fog: [], wind: [], rays: [],
    clouds: [],
    stars: [],
    starTotal: 140,
    starCount: 0,
    lightningTimer: 0, flashUntil: 0,
    cur: {
      rain: 0, snow: 0, fog: 0, sunRays: 0, wind: 0,
      cloudCover: 0.3, cloudAlpha: 0, cloudTint: [255, 255, 255], windKph: 0,
      lightning: 0, starAlpha: 0
    },
    tint: [255, 255, 255],
    lastProfile: null,
    _fogGradients: new Map(),
    _activeRainCount: 0,
    _activeSnowCount: 0,
    _activeStarCount: 0,
    _starSkyKey: ''
  };

  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    particles.reducedMotion = mq.matches;
    if (mq.addEventListener) mq.addEventListener('change', () => { particles.reducedMotion = mq.matches; });
    else if (mq.addListener) mq.addListener(() => { particles.reducedMotion = mq.matches; });
  } catch (_) {}

  function _seedParticles() {
    particles.rain = new Array(particles.baseRain);
    for (let i = 0; i < particles.baseRain; i++) particles.rain[i] = {
      x: Math.random(), y: Math.random(),
      len: Math.random() * 22 + 12,
      speed: Math.random() * 0.012 + 0.010,
      drift: Math.random() * 0.3 + 0.15,
      depth: Math.random() * 0.7 + 0.3
    };
    particles.splashes = new Array(24);
    for (let i = 0; i < 24; i++) particles.splashes[i] = {
      x: Math.random(), y: 0.9 + Math.random() * 0.15,
      r: 0, maxR: Math.random() * 6 + 4,
      life: Math.random(), speed: Math.random() * 0.02 + 0.02
    };
    particles.snow = new Array(particles.baseSnow);
    for (let i = 0; i < particles.baseSnow; i++) particles.snow[i] = {
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.8 + 0.8,
      speed: Math.random() * 0.004 + 0.002,
      drift: Math.random() * 0.3 - 0.15,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: Math.random() * 0.03 + 0.01
    };
    particles.fog = new Array(8);
    for (let i = 0; i < 8; i++) particles.fog[i] = {
      x: Math.random(), y: 0.3 + Math.random() * 0.5,
      r: 0.18 + Math.random() * 0.22,
      speed: (Math.random() * 0.0006 + 0.0002) * (i % 2 ? 1 : -1),
      a: 0.04 + Math.random() * 0.06
    };
    particles.wind = new Array(60);
    for (let i = 0; i < 60; i++) particles.wind[i] = {
      x: Math.random(), y: Math.random(),
      len: Math.random() * 40 + 20,
      speed: Math.random() * 0.008 + 0.004,
      a: Math.random() * 0.3 + 0.1
    };
    particles.rays = new Array(14);
    for (let i = 0; i < 14; i++) particles.rays[i] = {
      angle: Math.random() * Math.PI * 2,
      length: 0.5 + Math.random() * 0.5,
      width: 0.01 + Math.random() * 0.02,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0008
    };
    const starTotal = particles.starTotal;
    particles.stars = new Array(starTotal);
    for (let i = 0; i < starTotal; i++) {
      particles.stars[i] = {
        x: Math.random(),
        y: Math.random() * 0.85,
        r: Math.random() * 1.4 + 0.4,
        a: Math.random() * 0.6 + 0.4,
        tw: Math.random() * Math.PI * 2,
        ts: Math.random() * 0.002 + 0.001
      };
    }

    particles.clouds = new Array(particles.baseClouds);
    for (let i = 0; i < particles.baseClouds; i++) {
      const depth = Math.floor(Math.random() * 3);
      const baseSize = depth === 0 ? 0.12 : depth === 1 ? 0.20 : 0.30;
      const puffCount = depth === 0 ? 3 : depth === 1 ? 5 : 7;
      const puffs = [];
      for (let p = 0; p < puffCount; p++) {
        puffs.push({
          ox: (Math.random() - 0.5) * baseSize * 1.8,
          oy: (Math.random() - 0.5) * baseSize * 0.5,
          r: baseSize * (0.5 + Math.random() * 0.6),
          a: 0.68 + Math.random() * 0.32
        });
      }
      particles.clouds[i] = {
        x: Math.random(),
        y: 0.10 + Math.random() * 0.55,
        size: baseSize,
        speed: (depth === 0 ? 0.00020 : depth === 1 ? 0.00035 : 0.00055) *
               (0.6 + Math.random() * 0.8),
        depth,
        puffs
      };
    }
  }

  function initParticles() {
    const canvas = document.getElementById('vioraHeroCanvas');
    if (!canvas) return;

    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '3';
    canvas.style.pointerEvents = 'none';

    if (particles.bound && particles.canvas && particles.canvas !== canvas) {
      if (particles.unregister) { try { particles.unregister(); } catch (_) {} }
      particles.unregister = null;
      particles.bound = false;
      particles.running = false;
    }

    if (particles.bound && particles.canvas === canvas) {
      resizeParticles();
      return;
    }

    particles.canvas = canvas;
    particles.ctx = canvas.getContext('2d');
    particles.dpr = Math.min(window.devicePixelRatio || 1, 2);
    particles.bound = true;
    resizeParticles();
    _seedParticles();
    ensureParticlesRunning();
  }

  function _recomputeActiveCounts() {
    const area = Math.max(1, particles.w * particles.h);
    const scale = Math.max(0.25, Math.min(1, area / 512000));
    particles._activeRainCount = Math.round(particles.baseRain * scale);
    particles._activeSnowCount = Math.round(particles.baseSnow * scale);
    particles._activeStarCount = Math.round(particles.starTotal * scale);
  }

  function resizeParticles() {
    const c = particles.canvas;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = particles.dpr;
    const newW = Math.round(rect.width  * dpr);
    const newH = Math.round(rect.height * dpr);
    particles.w = rect.width;
    particles.h = rect.height;
    if (c.width !== newW)  c.width  = newW;
    if (c.height !== newH) c.height = newH;
    particles.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _recomputeActiveCounts();
    particles._fogGradients.clear();
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function _hasVisibleParticles() {
    const c = particles.cur;
    if (c.rain > PARTICLE_IDLE_THRESHOLD) return true;
    if (c.snow > PARTICLE_IDLE_THRESHOLD) return true;
    if (c.fog > PARTICLE_IDLE_THRESHOLD) return true;
    if (c.cloudAlpha > PARTICLE_IDLE_THRESHOLD) return true;
    if (c.starAlpha > PARTICLE_IDLE_THRESHOLD) return true;
    if (c.wind > PARTICLE_IDLE_THRESHOLD && !particles.reducedMotion) return true;
    if (c.sunRays > PARTICLE_IDLE_THRESHOLD && !particles.reducedMotion) return true;
    if (c.lightning > PARTICLE_IDLE_THRESHOLD && !particles.reducedMotion) return true;
    if (particles.flashUntil > Date.now()) return true;
    return false;
  }

  function _profileWantsLoop() {
    const p = particles.lastProfile;
    if (!p) return true;
    if (p.rain > PARTICLE_IDLE_THRESHOLD) return true;
    if (p.snow > PARTICLE_IDLE_THRESHOLD) return true;
    if (p.fog > PARTICLE_IDLE_THRESHOLD) return true;
    if (p.cloudCover > 0.05) return true;
    if (p.starAlpha > PARTICLE_IDLE_THRESHOLD) return true;
    if (p.wind > PARTICLE_IDLE_THRESHOLD && !particles.reducedMotion) return true;
    if (p.sunRays > PARTICLE_IDLE_THRESHOLD && !particles.reducedMotion) return true;
    if (p.lightning > PARTICLE_IDLE_THRESHOLD && !particles.reducedMotion) return true;
    return false;
  }

  function ensureParticlesRunning() {
    if (!particles.bound || !particles.canvas || !particles.ctx) return;
    if (particles.running) return;
    if (!_profileWantsLoop() && !_hasVisibleParticles()) return;
    particles.running = true;
    particles.unregister = RAF.register((ts) => {
      if (!_heroVisible) return;
      try { tickParticles(ts); }
      catch (e) { reportError('particles.tick', e); }
    });
  }

  function _stopParticles() {
    if (!particles.running) return;
    particles.running = false;
    if (particles.unregister) {
      try { particles.unregister(); } catch (_) {}
      particles.unregister = null;
    }
  }

  function _getFogGradient(ctx, r, alpha) {
    const rBucket = Math.round(r / 8) * 8;
    const aBucket = Math.round(alpha * 100) / 100;
    const key = rBucket + '|' + aBucket;
    let g = particles._fogGradients.get(key);
    if (g) return g;
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, rBucket);
    g.addColorStop(0, `rgba(230,235,245,${aBucket})`);
    g.addColorStop(1, 'rgba(230,235,245,0)');
    particles._fogGradients.set(key, g);
    if (particles._fogGradients.size > 64) {
      particles._fogGradients.delete(particles._fogGradients.keys().next().value);
    }
    return g;
  }

  function tickParticles(ts) {
    const { ctx, w, h } = particles;
    if (!ctx || !w || !h) { _stopParticles(); return; }

    const sky = getSky();
    const isDay = sky ? sky.isDay : true;
    const weatherNow = Weather.get();
    const profile = weatherProfile(Weather.code, isDay, {
      tempC:      weatherNow ? weatherNow.tempC : null,
      precipProb: weatherNow ? weatherNow.precipProb : null,
      precip:     weatherNow ? weatherNow.precip : null,
      cloudCover: weatherNow ? weatherNow.cloudCover : null,
      windDir:    weatherNow ? weatherNow.windDir : null
    });

    const t = 0.04;
    const cur = particles.cur;
    cur.rain      = lerp(cur.rain,      profile.rain,       t);
    cur.snow      = lerp(cur.snow,      profile.snow,       t);
    cur.fog       = lerp(cur.fog,       profile.fog,        t);
    cur.sunRays   = lerp(cur.sunRays,   profile.sunRays,    t);
    cur.wind      = lerp(cur.wind,      profile.wind,       t);
    cur.cloudCover= lerp(cur.cloudCover,profile.cloudCover, t);
    cur.lightning = lerp(cur.lightning, profile.lightning,  t);

    cur.cloudAlpha = lerp(cur.cloudAlpha,
      Math.max(0, Math.min(1, profile.cloudCover * 1.22)),
      t);

     const cc = profile.cloudCover;
    let tintR, tintG, tintB;
    if (cc < 0.30)      { tintR = 255; tintG = 255; tintB = 255; }
    else if (cc < 0.65) { tintR = 245; tintG = 248; tintB = 255; }
    else if (cc < 0.85) { tintR = 220; tintG = 225; tintB = 235; }
    /* ★ FIX: Overcast (0.85+) should be bright grey, not dark */
    else                { tintR = 200; tintG = 205; tintB = 215; }
    if (profile.rain > 0.3) {
      tintR = Math.max(150, tintR - 30);
      tintG = Math.max(160, tintG - 20);
      tintB = Math.max(175, tintB - 10);
    }
    cur.cloudTint = [tintR, tintG, tintB];

    cur.windKph = weatherNow && Number.isFinite(weatherNow.windKph) ? weatherNow.windKph : 0;

    const isNight = sky ? !sky.isDay : null;
    let starTarget;
    if (isNight === null) {
      starTarget = cur.starAlpha;
    } else {
      starTarget = isNight
        ? Math.max(0, 1 - cur.cloudCover * 1.2)
        : 0;
    }
    cur.starAlpha = lerp(cur.starAlpha, starTarget, t * 0.5);

    particles.tint = profile.tint;
    particles.lastProfile = profile;

    if (!_hasVisibleParticles() && !_profileWantsLoop()) {
      _stopParticles();
      return;
    }
    ctx.clearRect(0, 0, w, h);

    const reduce = particles.reducedMotion;
    const time = (typeof ts === 'number' ? ts : performance.now()) / 1000;

    /* ── Stars (fallback layer) ── */
    if (cur.starAlpha > PARTICLE_IDLE_THRESHOLD) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const active = particles._activeStarCount;
      for (let i = 0; i < active; i++) {
        const s = particles.stars[i];
        const sx = s.x * w;
        const sy = s.y * h;
        const twinkle = reduce
          ? 1
          : (0.75 + 0.25 * Math.sin(time * s.ts * 1000 + s.tw));
        ctx.globalAlpha = s.a * cur.starAlpha * twinkle;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* ── Single soft sun glow ── */
    if (cur.sunRays > PARTICLE_IDLE_THRESHOLD && !reduce) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cx = w * 0.5;
      const cy = -h * 0.05;
      const glowRadius = Math.max(w, h) * 0.55;

      const baseAlpha = profile.code === 0 || profile.code === 1
        ? 0.22
        : profile.code === 2
          ? 0.14
          : 0.08;
      const glowAlpha = baseAlpha * cur.sunRays;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      g.addColorStop(0,    `rgba(255, 245, 210, ${glowAlpha.toFixed(3)})`);
      g.addColorStop(0.4,  `rgba(255, 235, 190, ${(glowAlpha * 0.55).toFixed(3)})`);
      g.addColorStop(1,    'rgba(255, 235, 190, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    /* ── Procedural clouds — v4.8: shadow + bright top ── */
    if (cur.cloudAlpha > 0.01 && particles.clouds.length) {
      ctx.save();
      const nearTint = cur.cloudTint;
      const midTint  = [nearTint[0] * 0.85, nearTint[1] * 0.85, nearTint[2] * 0.90];
      const farTint  = [nearTint[0] * 0.72, nearTint[1] * 0.72, nearTint[2] * 0.80];

      const cover = Math.max(0, Math.min(1, cur.cloudCover));
      const activeCount = Math.round(cover * particles.clouds.length);

      for (let i = 0; i < activeCount; i++) {
        const c = particles.clouds[i];
        c.x += c.speed * (1 + cur.windKph * 0.005) * (reduce ? 0.3 : 1);
        if (c.x > 1.3) c.x = -0.3;
        if (c.x < -0.3) c.x = 1.3;

        const cx = c.x * w;
        const cy = c.y * h;
        const scale = Math.min(w, h) * c.size * (0.85 + cur.windKph * 0.003);
        const tint = c.depth === 0 ? farTint : c.depth === 1 ? midTint : nearTint;
        const baseAlpha = cur.cloudAlpha * (c.depth === 0 ? 0.55 : c.depth === 1 ? 0.75 : 1.0);

        for (let p = 0; p < c.puffs.length; p++) {
          const puff = c.puffs[p];
          const px = cx + puff.ox * scale * 2.2;
          const py = cy + puff.oy * scale * 2.2;
          const pr = puff.r * scale * 1.8;
          if (pr < 0.5) continue;
          const alpha = baseAlpha * puff.a;

          /* Shadow layer — reads on light sky. */
          const shadowG = ctx.createRadialGradient(px, py + pr * 0.15, 0, px, py + pr * 0.15, pr);
          shadowG.addColorStop(0,    `rgba(80, 100, 130, ${(alpha * 0.35).toFixed(3)})`);
          shadowG.addColorStop(0.6,  `rgba(80, 100, 130, ${(alpha * 0.12).toFixed(3)})`);
          shadowG.addColorStop(1,    'rgba(80, 100, 130, 0)');
          ctx.fillStyle = shadowG;
          ctx.beginPath();
          ctx.arc(px, py + pr * 0.15, pr, 0, Math.PI * 2);
          ctx.fill();

                  /* Main puff — bright top, dimmer bottom. Warm the
             top during golden hour so sunset clouds glow. */
          const sunElev = (typeof sky !== 'undefined' && sky && sky.sun && Number.isFinite(sky.sun.elevation))
            ? sky.sun.elevation
            : 90;
          const goldenK = (sunElev > -6 && sunElev < 12)
            ? (1 - Math.abs(sunElev - 3) / 9)
            : 0;
          const topR = 255;
          const topG = Math.round(255 - 60 * goldenK);
          const topB = Math.round(255 - 110 * goldenK);
          const g = ctx.createRadialGradient(px, py - pr * 0.2, 0, px, py, pr);
          g.addColorStop(0,    `rgba(${topR}, ${topG}, ${topB}, ${(alpha * 0.95).toFixed(3)})`);
          g.addColorStop(0.45, `rgba(${tint[0] | 0}, ${tint[1] | 0}, ${tint[2] | 0}, ${(alpha * 0.65).toFixed(3)})`);
          g.addColorStop(1,    `rgba(${tint[0] | 0}, ${tint[1] | 0}, ${tint[2] | 0}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    /* ── Fog ── */
    if (cur.fog > PARTICLE_IDLE_THRESHOLD) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < particles.fog.length; i++) {
        const f = particles.fog[i];
        f.x += f.speed;
        if (f.x > 1.3) f.x = -0.3;
        else if (f.x < -0.3) f.x = 1.3;
        const cx = f.x * w;
        const cy = f.y * h;
        const r = f.r * Math.max(w, h);
        const a = f.a * cur.fog;
        const g = _getFogGradient(ctx, r, a);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, Math.round(r / 8) * 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    /* ── Rain — v4.8: dark core + light highlight ── */
    if (cur.rain > PARTICLE_IDLE_THRESHOLD) {
      ctx.save();
      ctx.lineCap = 'round';
      const active = Math.floor(particles._activeRainCount * cur.rain * (reduce ? 0.5 : 1));
      const speedScale = reduce ? 0.5 : 1;

      let windVecX = 0, windVecY = 0;
      if (Number.isFinite(profile.windDir)) {
        const rad = (profile.windDir - 90) * Math.PI / 180;
        windVecX = Math.cos(rad);
        windVecY = Math.sin(rad);
      }

           const windStrength = Math.min(1, (weatherNow && weatherNow.windKph || 0) / 60);

      for (let i = 0; i < active; i++) {
        const d = particles.rain[i];
        const x = d.x * w;
        const y = d.y * h;
        const gravityY = d.len * d.depth;
        const windX    = windVecX * cur.wind * 40 * windStrength * d.depth;
        const windY    = windVecY * cur.wind * 6  * windStrength * d.depth;
        const dx = -d.drift * 6 * d.depth + windX;
        const dy = gravityY + windY;

        ctx.lineWidth = d.depth * 1.6;
        ctx.strokeStyle = `rgba(90, 130, 175, ${(0.55 * d.depth).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();

        ctx.lineWidth = d.depth * 0.6;
        ctx.strokeStyle = `rgba(220, 235, 255, ${(0.45 * d.depth).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx * 0.7, y + dy * 0.7);
        ctx.stroke();

        d.y += d.speed * speedScale * (1 + Math.abs(windY) * 0.05);
        d.x += d.speed * d.drift * 0.15 * speedScale + windVecX * cur.wind * 0.002 * speedScale;

        if (d.y > 1.05) {
          d.y = -0.05;
          d.x = Math.random();
          const s = particles.splashes[(i * 7) % particles.splashes.length];
          s.x = d.x; s.y = 0.92 + Math.random() * 0.06;
          s.r = 0; s.life = 1;
        }
        if (d.x > 1.05) d.x = -0.05;
        else if (d.x < -0.05) d.x = 1.05;
      }

      for (let i = 0; i < particles.splashes.length; i++) {
        const s = particles.splashes[i];
        if (s.life <= 0) continue;
        s.life -= s.speed;
        if (s.life < 0) s.life = 0;
        s.r = s.maxR * (1 - s.life);
        const a = 0.45 * s.life;
        ctx.strokeStyle = `rgba(120, 160, 200, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(s.x * w, s.y * h, s.r * 1.6, s.r * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* ── Snow — v4.8: shadow + white core ── */
    if (cur.snow > PARTICLE_IDLE_THRESHOLD) {
      ctx.save();
      const active = Math.floor(particles._activeSnowCount * cur.snow * (reduce ? 0.5 : 1));
      const speedScale = reduce ? 0.5 : 1;

      let windVecX = 0;
      if (Number.isFinite(profile.windDir)) {
        const rad = (profile.windDir - 90) * Math.PI / 180;
        windVecX = Math.cos(rad);
      }

      for (let i = 0; i < active; i++) {
        const d = particles.snow[i];
        d.wobble += d.wobbleSpeed * speedScale;
        const wx = d.x * w + Math.sin(d.wobble) * 8;
        const wy = d.y * h;

        ctx.fillStyle = 'rgba(120, 150, 190, 0.35)';
        ctx.beginPath();
        ctx.arc(wx, wy, d.r + 1.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(250, 252, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(wx, wy, d.r, 0, Math.PI * 2);
        ctx.fill();

        d.y += d.speed * speedScale;
        d.x += d.drift * 0.001 * speedScale + windVecX * cur.wind * 0.0012 * speedScale;
        if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
        if (d.x > 1.05) d.x = -0.05;
        else if (d.x < -0.05) d.x = 1.05;
      }
      ctx.restore();
    }

    /* ── Wind streaks ── */
    if (cur.wind > PARTICLE_IDLE_THRESHOLD && !reduce) {
      ctx.save();
      const active = Math.floor(particles.wind.length * cur.wind);

      let streakX = 1, streakY = 0;
      if (Number.isFinite(profile.windDir)) {
        const rad = (profile.windDir - 90) * Math.PI / 180;
        streakX = Math.cos(rad);
        streakY = Math.sin(rad);
      }

      for (let i = 0; i < active; i++) {
        const d = particles.wind[i];
        ctx.strokeStyle = `rgba(255, 255, 255, ${(d.a * cur.wind).toFixed(3)})`;
        ctx.lineWidth = 1;
        const sx = d.x * w;
        const sy = d.y * h;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + streakX * d.len, sy + streakY * d.len);
        ctx.stroke();
        d.x += d.speed * streakX;
        d.y += d.speed * streakY;
        if (d.x > 1.05) { d.x = -0.05; d.y = Math.random(); }
        else if (d.x < -0.05) { d.x = 1.05; d.y = Math.random(); }
        if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
        else if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
      }
      ctx.restore();
    }

    /* ── Lightning flash ── */
    if (cur.lightning > PARTICLE_IDLE_THRESHOLD && !reduce) {
      particles.lightningTimer++;
      if (particles.lightningTimer > 200 && Math.random() < 0.03) {
        particles.flashUntil = nowMs() + 140;
        particles.lightningTimer = 0;
      }
    }
    if (particles.flashUntil > nowMs()) {
      const remaining = (particles.flashUntil - nowMs()) / 140;
      ctx.fillStyle = `rgba(220, 235, 255, ${0.35 * remaining})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* ── Text ── */
  function safeSetText(id, v) {
    const e = document.getElementById(id);
    if (!e) return;
    if (e.textContent !== String(v)) e.textContent = v;
  }

  /* ── Client totals cache ── */
  let _clientTotalsCache = null;
  let _clientTotalsCacheKey = '';

  function _clientTotalsKey() {
    const s = getState();
    const d = s.data || {};
    const projects = (d.projects || []);
    const payments = (d.payments || []);
    let paySum = 0;
    for (let i = 0; i < payments.length; i++) {
      paySum += Number((payments[i] && payments[i].amount) || 0);
    }
    return [
      projects.length,
      payments.length,
      paySum,
      (typeof global.getClients === 'function') ? 'H' : 'N'
    ].join('|');
  }

  function buildClientTotalsMap() {
    const key = _clientTotalsKey();
    if (_clientTotalsCache && _clientTotalsCacheKey === key) return _clientTotalsCache;

    const s = getState();
    const projects = (s.data && s.data.projects) || [];
    const payments = (s.data && s.data.payments) || [];
    const map = new Map();

    const hasAgreedHelper = typeof global.getClientAgreedTotal === 'function';
    const hasPaidHelper   = typeof global.getClientPaidTotal === 'function';

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (!p || !p.clientId) continue;
      if (p.status === 'cancelled') continue;
      let agreed = 0;
      if (hasAgreedHelper) {
        try { agreed = Number(global.getClientAgreedTotal(p.clientId) || 0) || 0; }
        catch (_) { agreed = 0; }
        map.set(p.clientId, { agreed, paid: 0 });
        continue;
      }
      let explicit = Number(p.agreedTotal || 0);
      if (!(explicit > 0) && Array.isArray(p.installments)) {
        for (let k = 0; k < p.installments.length; k++) {
          explicit += Number((p.installments[k] && p.installments[k].amount) || 0);
        }
      }
      const cur = map.get(p.clientId) || { agreed: 0, paid: 0 };
      cur.agreed += explicit;
      map.set(p.clientId, cur);
    }

    for (let i = 0; i < payments.length; i++) {
      const pay = payments[i];
      if (!pay || !pay.clientId) continue;
      if (hasPaidHelper) {
        try {
          const paid = Number(global.getClientPaidTotal(pay.clientId) || 0) || 0;
          const cur = map.get(pay.clientId) || { agreed: 0, paid: 0 };
          cur.paid = paid;
          map.set(pay.clientId, cur);
        } catch (_) {}
        continue;
      }
      const cur = map.get(pay.clientId) || { agreed: 0, paid: 0 };
      cur.paid += Number(pay.amount || 0);
      map.set(pay.clientId, cur);
    }

    _clientTotalsCache = map;
    _clientTotalsCacheKey = key;
    return map;
  }

  function readClients() {
    if (typeof global.getClients === 'function') {
      try { const list = global.getClients(); if (Array.isArray(list)) return list; }
      catch (_) {}
    }
    const s = getState();
    const entities = (s.data && s.data.entities) || [];
    const out = [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e && e.type === 'client') out.push(e);
    }
    return out;
  }

  const _idHashCache = new WeakMap();
  function _hashIds(arr, field) {
    if (!Array.isArray(arr)) return '0';
    const cached = _idHashCache.get(arr);
    if (cached !== undefined) return cached;
    let h = arr.length * 2654435761;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i] && arr[i][field];
      if (typeof v === 'string') {
        for (let c = 0; c < v.length; c++) {
          h = ((h << 5) - h + v.charCodeAt(c)) | 0;
        }
      }
    }
    const result = (h >>> 0).toString(36);
    try { _idHashCache.set(arr, result); } catch (_) {}
    return result;
  }

  function _taskStatusHash(tasks) {
    if (!Array.isArray(tasks)) return '0';
    let pending = 0, done = 0, other = 0;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t) continue;
      if (t.status === 'pending') pending++;
      else if (t.status === 'done' || t.status === 'completed') done++;
      else other++;
    }
    return pending + ':' + done + ':' + other;
  }

  let _lastFingerprint = '';
  function statsFingerprint(s) {
    const d = (s && s.data) || {};
    return [
      (d.entities && d.entities.length || 0),
      _hashIds(d.entities, 'id'),
      (d.projects && d.projects.length || 0),
      _hashIds(d.projects, 'id'),
      (d.payments && d.payments.length || 0),
      (d.tasks && d.tasks.length || 0),
      _taskStatusHash(d.tasks),
      (s._lastMutationAt || 0)
    ].join('|');
  }

  function computeStats() {
    const s = getState();
    const todayKey = (typeof global.todayStr === 'function')
      ? global.todayStr()
      : new Date().toISOString().slice(0, 10);

    const tasks = (s.data && s.data.tasks) || [];
    let tasksToday = 0;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t && t.status === 'pending' && t.dueDate === todayKey) tasksToday++;
    }

    const projects = (s.data && s.data.projects) || [];
    let activeProjects = 0;
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (p && p.status === 'active') activeProjects++;
    }

    let pendingFees = 0;
    try {
      const clients = readClients();
      const totals = buildClientTotalsMap();
      for (let i = 0; i < clients.length; i++) {
        const c = clients[i];
        if (!c || !c.id) continue;
        const t = totals.get(c.id);
        if (!t) continue;
        pendingFees += Math.max(0, t.agreed - t.paid);
      }
    } catch (e) {
      reportError('computeStats.fees', e);
    }

    return { tasksToday, pendingFees, activeProjects };
  }

  /* ── Quick city bar ── */
  function ensureQuickCityBar() {
    let bar = document.getElementById('vioraQuickCityBar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'vioraQuickCityBar';
    bar.className = 'viora-quick-city-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Quick location switcher');
    bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 10px;position:relative;z-index:5';

    document.body.appendChild(bar);

    const anchors = ['vioraHeroQuickCityMount', 'vioraHeroBanner', 'vioraHeroGlobeWrap'];
    for (let i = 0; i < anchors.length; i++) {
      const el = document.getElementById(anchors[i]);
      if (el) {
        if (el.id === 'vioraHeroBanner') el.insertBefore(bar, el.firstChild);
        else el.appendChild(bar);
        break;
      }
    }
    return bar;
  }

  function renderQuickCityBar() {
    const bar = ensureQuickCityBar();
    const cities = global.VIORA_HERO_QUICK_CITIES;
    const active = state._heroLocation?.id;

    if (!bar._vioraBuilt) {
      bar._vioraBuilt = true;
      let html = '';
      for (let i = 0; i < cities.length; i++) {
        const c = cities[i];
        html +=
          '<button type="button" class="viora-quick-city-btn" data-city-id="' + c.id + '"' +
            ' title="Show weather and time in ' + c.label + '"' +
            ' style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;cursor:pointer;font:500 13px/1 ui-sans-serif,system-ui,sans-serif;transition:all .2s ease;">' +
            '<span style="font-size:15px;line-height:1;">' + c.flag + '</span>' +
            '<span>' + c.name + '</span>' +
          '</button>';
      }
      bar.innerHTML = html;
      bar.addEventListener('click', onQuickCityClick);
    }

    const btns = bar.querySelectorAll('[data-city-id]');
    for (let i = 0; i < btns.length; i++) {
      const btn = btns[i];
      const isActive = btn.dataset.cityId === active;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.style.background = isActive ? 'rgba(34,211,238,0.18)' : 'rgba(15,23,42,0.55)';
      btn.style.border = '1px solid ' + (isActive ? 'rgba(34,211,238,0.75)' : 'rgba(148,163,184,0.35)');
      btn.style.color = isActive ? '#67e8f9' : '#e2e8f0';
      btn.style.boxShadow = isActive ? '0 0 14px rgba(34,211,238,0.35)' : 'none';
    }
  }

  function onQuickCityClick(e) {
    const btn = e.target.closest('[data-city-id]');
    if (!btn) return;
    const id = btn.dataset.cityId;
    const city = global.VIORA_HERO_QUICK_CITIES.find(c => c.id === id);
    if (!city) return;
    switchToCity(city);
  }

  function _applyLocation(loc) {
    state._heroLocation = {
      id:   loc.id,
      name: loc.name || loc.label || loc.id,
      label: loc.label || loc.name || loc.id,
      lat:  loc.lat,
      lon:  loc.lon,
      tz:   loc.tz || 'UTC'
    };

    /* v4.8 — Tell VioraTime about the new tz, force its cache
       to recompute, then clear our own _lastClock so the
       next paint of renderChrome() shows the new time. */
    try {
      if (global.VioraTime && typeof global.VioraTime.setTimezone === 'function') {
        global.VioraTime.setTimezone(state._heroLocation.tz);
      }
      if (global.VioraTime && typeof global.VioraTime.forceRefresh === 'function') {
        global.VioraTime.forceRefresh();
      }
    } catch (e) { reportError('_applyLocation.vioratime', e); }
    _lastClock = '';

    /* v4.8 — Force the ticker to be running so the clock
       actually repaints on the next second, even if the
       banner was offscreen and the ticker was paused. */
    try { startTicker(); } catch (_) {}

    invalidateSky();
    try {
      if (state._heroWeatherCache) delete state._heroWeatherCache[state._heroLocation.id];
    } catch (_) {}
    prewarmSolar(state._heroLocation);

    renderChrome();
    renderWeather();
    renderStats(true);
    renderQuickCityBar();

    try {
      if (global.VioraSky && typeof global.VioraSky.setLocation === 'function') {
        global.VioraSky.setLocation(state._heroLocation);
      }
    } catch (e) { reportError('_applyLocation.sky', e); }

    try {
      if (global.VioraOrb && typeof global.VioraOrb.setLocation === 'function') {
        global.VioraOrb.setLocation(state._heroLocation);
      }
    } catch (e) { reportError('_applyLocation.orb', e); }

    try {
      if (global.VioraTerminator && typeof global.VioraTerminator.setLocation === 'function') {
        global.VioraTerminator.setLocation(state._heroLocation);
      }
    } catch (e) { reportError('_applyLocation.terminator', e); }

    try {
      if (global.VioraTooltip && typeof global.VioraTooltip.setLocation === 'function') {
        global.VioraTooltip.setLocation(state._heroLocation);
      }
    } catch (e) { reportError('_applyLocation.tooltip', e); }

    try {
      window.dispatchEvent(new CustomEvent('viora:hero-location-change', {
        detail: { ...state._heroLocation }
      }));
    } catch (_) {}

    const requestedId = state._heroLocation.id;
    fetchWeather(true)
      .then(w => {
        if (w && state._heroLocation && state._heroLocation.id === requestedId) {
          renderWeather();
          try {
            if (global.VioraOrb && typeof global.VioraOrb.setWeather === 'function') {
              global.VioraOrb.setWeather(w);
            }
          } catch (_) {}
        }
      })
      .catch(err => reportError('_applyLocation.fetch', err));

    emit('cityChange', { location: { ...state._heroLocation } });
  }

  function switchToCity(city) { _applyLocation(city); }
  function setLocation(loc, opts) {
    opts = opts || {};
    if (!loc) return;
    try { closePickerModal(); } catch (_) {}
    try {
      const heroPicker = document.querySelector('.viora-hero-location-overlay.active');
      if (heroPicker) heroPicker.classList.remove('active');
    } catch (_) {}
    _applyLocation(loc);
  }

  /* ── Event bus ── */
  const listeners = new Map();
  function on(name, cb) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(cb);
    return () => off(name, cb);
  }
  function off(name, cb) { const s = listeners.get(name); if (s) s.delete(cb); }
  function emit(name, payload) {
    const s = listeners.get(name);
    if (!s) return;
    for (const cb of s) {
      try { cb(payload); } catch (e) { reportError('listener.' + name, e); }
    }
  }

  /* ── Greeting ── */
  const EXEC_FALLBACK_NAME = 'Cliff Johns';
  const GENERIC_NAMES = new Set([
    'admin', 'administrator', 'user', 'operator', 'root',
    'exec', 'executive', 'owner', 'founder', 'ceo', 'cto',
    'coo', 'director', 'staff', 'guest', 'system', 'login'
  ]);

  function _firstWord(s) {
    const trimmed = String(s || '').trim();
    if (!trimmed) return '';
    const first = trimmed.split(/\s+/)[0];
    return first.replace(/^./, c => c.toUpperCase());
  }
  function _isExecRole(role) {
    const r = String(role || '').trim().toLowerCase();
    if (!r) return false;
    if (r === 'exec' || r === 'admin' || r === 'owner' || r === 'founder' ||
        r === 'ceo' || r === 'cto' || r === 'coo' || r === 'director') return true;
    return r.startsWith('exec') || r.startsWith('admin') || r.startsWith('owner') ||
           r.startsWith('founder') || r.startsWith('director');
  }
  function _isGenericName(name, role) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return true;
    if (GENERIC_NAMES.has(n)) return true;
    const r = String(role || '').trim().toLowerCase();
    if (r && n === r) return true;
    return false;
  }
  function _collectOperatorSources() {
    const out = [];
    const push = s => { if (s && typeof s === 'object') out.push(s); };
    try { push(state.operator); } catch (_) {}
    try { push(state.user); } catch (_) {}
    try { push(state.profile); } catch (_) {}
    try { push(state.session && state.session.operator); } catch (_) {}
    try { push(state.account); } catch (_) {}
    try { push(state.auth && state.auth.user); } catch (_) {}
    try { push(state.currentUser); } catch (_) {}
    return out;
  }
  function resolveOperatorName() {
    const sources = _collectOperatorSources();
    let bestName = '';
    let bestRole = '';
    for (const s of sources) {
      const rawName = s.name || s.displayName || s.firstName || s.fullName || '';
      const rawRole = s.role || s.userRole || s.type || s.tier || '';
      if (rawName && !bestName) bestName = String(rawName);
      if (rawRole && !bestRole) bestRole = String(rawRole);
    }
    if (!bestRole) {
      try { bestRole = String(state.userRole || state.role || ''); } catch (_) {}
    }
    const isExec = _isExecRole(bestRole);
    const nameIsGeneric = _isGenericName(bestName, bestRole);
    if (isExec && nameIsGeneric) return EXEC_FALLBACK_NAME;
    if (bestName && !nameIsGeneric) return _firstWord(bestName);
    if (isExec) return EXEC_FALLBACK_NAME;
    return 'Operator';
  }

  /* ── Chrome paint ── */
  let _lastGreeting = '', _lastDate = '', _lastClock = '', _lastName = '';

  function renderChrome() {
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return;
    if (!state._heroLocation || !state._heroLocation.tz) {
      state._heroLocation = DEFAULT_LOCATION;
    }

    const now = nowDate();
    const loc = state._heroLocation;
    let np;
    try { np = localParts(now, loc.tz); }
    catch (_) { np = localParts(now, 'UTC'); }

    try {
      const greeting = heroGreeting(np.hour);
      const name = resolveOperatorName();
      if (greeting !== _lastGreeting) { _lastGreeting = greeting; safeSetText('vioraHeroGreeting', greeting); }
      if (name !== _lastName) { _lastName = name; safeSetText('vioraHeroName', name); }

      const desigEl = document.getElementById('vioraHeroDesignation');
      if (desigEl) { desigEl.textContent = ''; desigEl.style.display = 'none'; }

      const statusEl = document.getElementById('vioraHeroStatusLine');
      if (statusEl) {
        let attentionCount = 0;
        try {
          if (typeof global.buildNotifications === 'function') {
            attentionCount = (global.buildNotifications() || []).length;
          }
        } catch (_) {}
        if (!attentionCount && Array.isArray(state.data?.tasks)) {
          const today = (typeof global.todayStr === 'function') ? global.todayStr() : new Date().toISOString().slice(0, 10);
          attentionCount = state.data.tasks.filter(t =>
            t && t.status === 'pending' && t.dueDate && t.dueDate < today
          ).length;
        }
        const text = attentionCount > 0
          ? `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention today`
          : 'All clear — nothing urgent';
        if (statusEl.textContent !== text) statusEl.textContent = text;
        statusEl.style.color = attentionCount > 0 ? '#ffd27a' : '#8be28b';
      }

      const nextApptEl    = document.getElementById('vioraHeroNextAppt');
      const nextApptSubEl = document.getElementById('vioraHeroNextApptSub');
      if (nextApptEl && nextApptSubEl) {
        const appts = Array.isArray(state.data?.appointments) ? state.data.appointments : [];
        const todayStr = (typeof global.todayStr === 'function') ? global.todayStr() : new Date().toISOString().slice(0, 10);
        const upcoming = appts
          .filter(a => a && a.status === 'scheduled' && a.date && a.date >= todayStr)
          .sort((a, b) => (a.date + 'T' + (a.startTime || '00:00')).localeCompare(b.date + 'T' + (b.startTime || '00:00')));
        const next = upcoming[0];
        if (next) {
          const label = next.startTime ? `${next.startTime} · ${next.date === todayStr ? 'Today' : next.date}` : next.date;
          if (nextApptEl.textContent !== label) nextApptEl.textContent = label;
          const title = next.title || next.clientName || next.type || 'Appointment';
          if (nextApptSubEl.textContent !== title) nextApptSubEl.textContent = title;
        } else {
          if (nextApptEl.textContent !== '—') nextApptEl.textContent = '—';
          if (nextApptSubEl.textContent !== 'No upcoming') nextApptSubEl.textContent = 'No upcoming';
        }
      }

      const apptSumEl = document.getElementById('vioraHeroAppointmentsSummary');
      if (apptSumEl) {
        const todayStr = (typeof global.todayStr === 'function') ? global.todayStr() : new Date().toISOString().slice(0, 10);
        const todayCount = (state.data?.appointments || []).filter(a => a && a.date === todayStr && a.status === 'scheduled').length;
        const label = `${todayCount} appointment${todayCount === 1 ? '' : 's'}`;
        if (apptSumEl.textContent !== label) apptSumEl.textContent = label;
      }

      const healthEl    = document.getElementById('vioraHeroHealth');
      const healthSubEl = document.getElementById('vioraHeroHealthSub');
      if (healthEl) {
        let health = 'OK';
        let sub = 'System health';
        let color = 'var(--accent-green)';
        try {
          const notifFn = (typeof global.buildNotificationsRef === 'function')
            ? global.buildNotificationsRef
            : (typeof global.buildNotifications === 'function' ? global.buildNotifications : null);
          if (notifFn) {
            const list = notifFn() || [];
            const urgent = list.filter(n => n.type === 'danger').length;
            if (urgent > 0) { health = 'Attention'; sub = `${urgent} urgent`; color = 'var(--accent-red)'; }
            else if (list.length > 0) { health = 'Watch'; sub = `${list.length} to review`; color = 'var(--accent-gold)'; }
          }
          if (!navigator.onLine) { health = 'Offline'; sub = 'Network'; color = 'var(--accent-red)'; }
        } catch (_) {}
        if (healthEl.textContent !== health) healthEl.textContent = health;
        if (healthSubEl && healthSubEl.textContent !== sub) healthSubEl.textContent = sub;
        healthEl.style.color = color;
      }
    } catch (e) { reportError('renderChrome.greeting', e); }

    try {
      const dstr = np.weekday + ', ' + np.day + ' ' + np.month + ' ' + np.year;
      if (dstr !== _lastDate) { _lastDate = dstr; safeSetText('vioraHeroDate', dstr); }
    } catch (e) { reportError('renderChrome.date', e); }

    try {
      const hourClass = heroHourClass(np.hour);
      if (!banner.classList.contains(hourClass)) {
        banner.classList.remove(...HOUR_CLASSES);
        banner.classList.add(hourClass);
      }
    } catch (e) { reportError('renderChrome.hourClass', e); }

    try {
      const sky = getSky();
      if (sky) {
        // Keep the banner on a supported CSS phase. Raw Solar phases such as
        // "day" or "sunrise" have no matching gradient and reveal the near-black fallback.
        applySkyPhase(skyPhaseFor(Weather.get(), sky));
        banner.classList.toggle('viora-hero--is-day', !!sky.isDay);
        banner.classList.toggle('viora-hero--is-night', !!sky.isNight);
      }

      if (global.VioraOrb && typeof global.VioraOrb.setSkyState === 'function') {
        if (sky) global.VioraOrb.setSkyState(sky);
      }
    } catch (e) { reportError('renderChrome.orb', e); }

    try {
      const clockStr = np.hh + ':' + np.mm + ':' + np.ss;
      if (clockStr !== _lastClock) { _lastClock = clockStr; safeSetText('heroClock', clockStr); }
    } catch (e) { reportError('renderChrome.clock', e); }

    /* v4.8 — belt and suspenders: if the ticker is somehow
       stopped, restart it now. This ensures the clock will
       update on the next second regardless of the caller. */
    try { startTicker(); } catch (_) {}
  }

  const _numFmt = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 });

  function skyPhaseFor(weather, sky) {
    if (sky && sky.sun && Number.isFinite(sky.sun.elevation)) {
      if (sky.sun.elevation <= -18) return 'night';
      if (sky.sun.elevation <= -6) {
        if (weather && (weather.code >= 95)) return 'storm';
        if (weather && (weather.code >= 61 && weather.code <= 67)) return 'rain';
        if (sky.phase === 'nautical') return 'nautical';
        if (sky.phase === 'astronomical') return 'astronomical';
        return 'night';
      }
    }

    if (weather && weather.code != null) {
      const c = Number(weather.code);
      if (c === 0 || c === 1) return 'clear';
      if (c === 2)            return 'partly';
      if (c === 3)            return 'overcast';
      if (c === 45 || c === 48) return 'overcast';
      if (c >= 51 && c <= 57) return 'drizzle';
      if (c >= 61 && c <= 67) return 'rain';
      if (c >= 71 && c <= 77) return 'snow';
      if (c >= 80 && c <= 82) return 'rain';
      if (c >= 85 && c <= 86) return 'snow';
      if (c >= 95)            return 'storm';
    }

    if (sky && sky.phase) {
      if (sky.phase === 'golden') return 'golden';
      if (sky.phase === 'blue') return 'blue';
      if (sky.phase === 'civil') return 'civil';
      if (sky.phase === 'nautical') return 'nautical';
      if (sky.phase === 'astronomical') return 'astronomical';
    }
    return 'clear';
  }

  function applySkyPhase(phase) {
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return;
    if (banner.dataset.skyPhase === phase) return;
    banner.dataset.skyPhase = phase;

    try {
      const cover = banner.closest('.viora-hero-cover');
      if (cover && cover !== banner) {
        cover.dataset.skyPhase = phase;
      }
    } catch (_) {}
  }

  let _lastWeatherKey = '';
  function renderWeather() {
    const banner = document.getElementById('vioraHeroBanner');
    const w = Weather.get();
    if (!banner) return;

    if (!w) {
      const key = 'loading:' + (state._heroLocation && state._heroLocation.id);
      if (key === _lastWeatherKey) return;
      _lastWeatherKey = key;
      banner.classList.add('viora-hero--weather-loading');
      banner.classList.remove(...TEMP_CLASSES);
      banner.classList.add('viora-hero--weather-unknown');
      safeSetText('vioraHeroWeatherTemp', '—');
      safeSetText('vioraHeroWeatherText', 'Loading…');
      safeSetText('vioraHeroWeatherLoc', state._heroLocation?.name || '—');
      return;
    }

    const key = [
      w.code, w.tempC, w.text, w.windKph, w.humidity, w.precipProb,
      w.uvMax, w.pressure, w.feelsLike, w._fetchedAt,
      state._heroLocation && state._heroLocation.id
    ].join('|');
    if (key === _lastWeatherKey) return;
    _lastWeatherKey = key;

    banner.classList.remove('viora-hero--weather-loading');

    try {
      const code = w.code == null ? null : Number(w.code);

      const tClass = tempClass(w.tempC);
      if (!banner.classList.contains(tClass)) {
        banner.classList.remove(...TEMP_CLASSES);
        banner.classList.add(tClass);
      }
      const iconEl = document.getElementById('vioraHeroWeatherIcon');
      if (iconEl) iconEl.className = 'fa-solid ' + weatherIcon(code);

      safeSetText('vioraHeroWeatherTemp', w.tempC != null ? Math.round(w.tempC) : '—');
      safeSetText('vioraHeroWeatherText', w.text || '—');
      safeSetText('vioraHeroWeatherLoc',  state._heroLocation?.name || '—');
      safeSetText('vioraHeroWind',       w.windKph   != null ? Math.round(w.windKph) + ' km/h' : '—');
      safeSetText('vioraHeroHumidity',   w.humidity  != null ? w.humidity + '%' : '—');
      safeSetText('vioraHeroPrecip',     w.precipProb!= null ? w.precipProb + '%' : '—');
      safeSetText('vioraHeroUV',         w.uvMax     != null ? Number(w.uvMax).toFixed(1) : '—');
      safeSetText('vioraHeroPressure',   w.pressure  != null ? Math.round(w.pressure) + ' hPa' : '—');
      safeSetText('vioraHeroFeels',      w.feelsLike != null ? Math.round(w.feelsLike) + '°C' : '—');

      const today = w.daily && w.daily[0];
      safeSetText('vioraHeroTempMax', today && today.tempMax != null ? Math.round(today.tempMax) + '°' : '—');
      safeSetText('vioraHeroTempMin', today && today.tempMin != null ? Math.round(today.tempMin) + '°' : '—');

      banner.dataset.weatherCode = String(code != null ? code : '');

      try {
        const sky = getSky();
        const phase = skyPhaseFor(w, sky);
        applySkyPhase(phase);
      } catch (e) { reportError('renderWeather.skyPhase', e); }

      applyCloudSettings(cloudSettings(code));
      renderForecastCurve();
      ensureParticlesRunning();

      try {
        if (global.VioraOrb && typeof global.VioraOrb.setWeather === 'function') {
          global.VioraOrb.setWeather(w);
        }
      } catch (_) {}

      if (global.VioraTooltip && typeof global.VioraTooltip.refresh === 'function') {
        global.VioraTooltip.refresh();
      }
    } catch (e) { reportError('renderWeather.paint', e); }
  }

  let _statsWarnedOnce = false;
  function renderStats(force = false) {
    try {
      const s = getState();
      const fp = statsFingerprint(s);
      if (!force && fp === _lastFingerprint) return;
      _lastFingerprint = fp;

      const { tasksToday, pendingFees, activeProjects } = computeStats();
      safeSetText('vioraHeroToday', tasksToday);
      safeSetText('vioraHeroFees',
        pendingFees > 0 ? 'KES ' + _numFmt.format(Math.round(pendingFees)) : 'KES 0');
      safeSetText('vioraHeroProjects', activeProjects);

      if (!_statsWarnedOnce && tasksToday === 0 && pendingFees === 0 && activeProjects === 0) {
        const hasHelpers = {
          getClients:           typeof global.getClients === 'function',
          getClientAgreedTotal: typeof global.getClientAgreedTotal === 'function',
          getClientPaidTotal:   typeof global.getClientPaidTotal === 'function'
        };
        if (!hasHelpers.getClients && !hasHelpers.getClientAgreedTotal && !hasHelpers.getClientPaidTotal) {
          const entitiesLen = (s.data && s.data.entities && s.data.entities.length) || 0;
          const projectsLen = (s.data && s.data.projects && s.data.projects.length) || 0;
          if (entitiesLen || projectsLen) {
            _statsWarnedOnce = true;
            console.info('[hero-banner] stat tiles are zero despite data present — helpers not injected yet');
          }
        }
      }
    } catch (e) { reportError('renderStats', e); }
  }

  function warm() {
    try { _lastFingerprint = ''; renderStats(true); }
    catch (e) { reportError('warm', e); }
  }

  let _lastRenderKey = '';
  function _renderKey() {
    const s = getState();
    const d = s.data || {};
    const locId = state._heroLocation && state._heroLocation.id;
    const hasWeather = Weather.hasData ? (Weather.get()?._fetchedAt || 'w') : 'n';
    return [
      locId,
      (d.entities && d.entities.length || 0),
      (d.projects && d.projects.length || 0),
      (d.payments && d.payments.length || 0),
      (d.tasks    && d.tasks.length    || 0),
      _taskStatusHash(d.tasks),
      hasWeather
    ].join('|');
  }

  async function renderVioraHero(force = false) {
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return;

    const currentTab = (getState() && getState().currentTab) || '';
if (currentTab !== 'dashboard') {
  banner.style.display = 'none';
  /* ★ FIX: hide the sun orb too when leaving dashboard, otherwise
     it floats over the tab content on other tabs. */
  try {
    const orb = document.getElementById('vioraHeroOrb');
    if (orb) orb.style.opacity = '0';
  } catch (_) {}
  return;
}
banner.style.display = '';

if (!state._heroLocation || !state._heroLocation.tz) state._heroLocation = DEFAULT_LOCATION;
if (!state._heroWeatherCache || typeof state._heroWeatherCache !== 'object') state._heroWeatherCache = {};

const key = _renderKey();
if (!force && key === _lastRenderKey) {
  startTicker();
  return;
}
_lastRenderKey = key;

invalidateSky();
prewarmSolar(state._heroLocation);

renderChrome();
renderQuickCityBar();
renderStats(true);
renderWeather();

/* ★ FIX: the sun is positioned by hero-orb.js, which needs the
   banner to have a real bounding rect. On the very first dashboard
   render, the banner may still be in display: none mode for a
   frame, giving refreshRect() a 0×0 rect and skipping the sun.
   Force a second sun render on the next animation frame after
   layout settles. */
requestAnimationFrame(() => {
  try {
    const sky = getSky();
    if (sky && global.VioraOrb && typeof global.VioraOrb.setSkyState === 'function') {
      global.VioraOrb.setSkyState(sky);
    }
  } catch (_) {}
  try {
    if (global.VioraTerminator && typeof global.VioraTerminator.renderNow === 'function') {
      global.VioraTerminator.renderNow();
    }
  } catch (_) {}
});

    try { initParticles(); } catch (e) { reportError('initParticles', e); }

    try {
      if (global.VioraSky && typeof global.VioraSky.init === 'function') {
        global.VioraSky.init({ location: state._heroLocation });
        if (typeof global.VioraSky.renderNow === 'function') {
          global.VioraSky.renderNow();
        }
      }
    } catch (e) { reportError('renderVioraHero.sky', e); }

    try {
      if (global.VioraTerminator && typeof global.VioraTerminator.init === 'function') {
        global.VioraTerminator.init({ location: state._heroLocation });
        if (typeof global.VioraTerminator.renderNow === 'function') {
          global.VioraTerminator.renderNow();
        }
      }
    } catch (e) { reportError('renderVioraHero.terminator', e); }

    try {
      if (global.VioraHeroGlobe && !global.VioraHeroGlobe._inited) {
        global.VioraHeroGlobe.init({
          location: {
            lat: state._heroLocation.lat,
            lon: state._heroLocation.lon,
            name: state._heroLocation.name,
            id: state._heroLocation.id
          }
        });
      }
    } catch (e) { reportError('globe.init', e); }

    try { resizeParticles(); } catch (e) { reportError('resizeParticles', e); }
    try { bindForecastInteractions(); } catch (e) { reportError('bindForecast', e); }

    const requestedId = state._heroLocation.id;
    if (!Weather.isFresh(requestedId)) {
      fetchWeather(false)
        .then(w => {
          if (w && state._heroLocation && state._heroLocation.id === requestedId) {
            renderWeather();
          }
        })
        .catch(e => reportError('renderVioraHero.fetch', e));
    }

    emit('render');
  }

  /* ── Picker ── */
  function ensurePickerModal() {
    const banner = document.getElementById('vioraHeroBanner');

    /* The active picker is mounted at document.body level to escape hero clipping. */
    let overlay = document.querySelector('.viora-hero-location-overlay');
    if (overlay) return overlay;

    if (!banner) {
      let legacy = document.getElementById('vioraHeroLocationModal');
      if (legacy) return legacy;
      legacy = document.createElement('div');
      legacy.id = 'vioraHeroLocationModal';
      legacy.className = 'viora-hero-location-modal';
      legacy.innerHTML =
        '<div class="viora-hero-location-sheet">' +
          '<div class="viora-hero-location-head">' +
            '<strong>Choose a location</strong>' +
            '<button type="button" class="viora-hero-location-close" data-picker-close aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="viora-hero-location-list" id="vioraHeroLocationList"></div>' +
        '</div>';
      document.body.appendChild(legacy);
      legacy.addEventListener('click', (e) => {
        if (e.target === legacy || e.target.closest('[data-picker-close]')) {
          legacy.classList.remove('active');
          legacy.style.display = 'none';
        }
      });
      return legacy;
    }

    overlay = document.createElement('div');
    overlay.className = 'viora-hero-location-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose a location');
    overlay.innerHTML =
      '<div class="viora-hero-location-sheet">' +
        '<div class="viora-hero-location-head">' +
          '<strong>Choose a location</strong>' +
          '<button type="button" class="viora-hero-location-close" data-picker-close aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="viora-hero-location-list" id="vioraHeroLocationList"></div>' +
      '</div>';

    /* Keep the picker outside the hero's overflow-hidden stacking context. */
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-picker-close]')) {
        closePickerModal();
      }
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePickerModal();
    });

    return overlay;
  }

  function openPickerModal() {
    const overlay = ensurePickerModal();
    if (!overlay) return;
    overlay.classList.add('active');
    if (!overlay.classList.contains('viora-hero-location-overlay')) {
      overlay.style.display = 'flex';
    }
    const sheet = overlay.querySelector('.viora-hero-location-sheet');
    if (sheet && typeof sheet.focus === 'function') {
      sheet.setAttribute('tabindex', '-1');
      sheet.focus({ preventScroll: true });
    }
  }

  function closePickerModal() {
    const overlay = ensurePickerModal();
    if (!overlay) return;
    overlay.classList.remove('active');
    if (!overlay.classList.contains('viora-hero-location-overlay')) {
      overlay.style.display = 'none';
    }
  }

  function openVioraHeroLocationPicker() {
    try {
      if (typeof global.Viora !== 'undefined' && typeof global.Viora.openLocationPicker === 'function') {
        global.Viora.openLocationPicker();
        return;
      }
    } catch (e) {
      console.warn('[hero-banner] delegating to weather picker failed:', e);
    }

    const modal = ensurePickerModal();
    if (!modal) return;
    const list  = modal.querySelector('#vioraHeroLocationList');
    if (!list) return;

    const current = state._heroLocation?.id;
    const all = allLocations();

    let html = '';
    for (let i = 0; i < all.length; i++) {
      const l = all[i];
      const active = l.id === current;
      html +=
        '<button type="button" class="btn btn-outline" data-loc-id="' + l.id + '"' +
          ' style="justify-content:space-between;text-align:left;width:100%;' +
          'background:' + (active ? 'rgba(34,211,238,0.12)' : 'transparent') + ';' +
          'border:1px solid ' + (active ? 'rgba(34,211,238,0.6)' : 'rgba(148,163,184,0.25)') + ';' +
          'color:#e2e8f0;padding:10px 12px;border-radius:10px;cursor:pointer;">' +
          '<span><strong>' + l.name + '</strong><br>' +
            '<small style="opacity:.65;">' + l.lat.toFixed(3) + ', ' + l.lon.toFixed(3) + '</small></span>' +
          '<i class="fa-solid fa-satellite-dish"></i>' +
        '</button>';
    }
    list.innerHTML = html;

    if (!list._vioraPickerBound) {
      list._vioraPickerBound = true;
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-loc-id]');
        if (!btn) return;
        const loc = findLocationById(btn.dataset.locId);
        if (!loc) return;
        closePickerModal();
        setLocation(loc, { animate: true });
      });
    }

    openPickerModal();
  }

  global.openVioraHeroLocationPicker = openVioraHeroLocationPicker;

  /* ── Ticker ── */
  let _tickerTimer = null;
  let _lastSkyPushSig = '';
  let _secondsSinceWeather = 0;
  let _lastStatRefresh = 0;

  function tick() {
    if (document.hidden) return;
    if (!_heroVisible) return;
    const loc = state._heroLocation;
    if (!loc || !loc.tz) return;

    _beginTickSky();

    let np;
    try { np = localParts(nowDate(), loc.tz); }
    catch (_) { _endTickSky(); return; }

    const clockStr = np.hh + ':' + np.mm + ':' + np.ss;
    if (clockStr !== _lastClock) {
      _lastClock = clockStr;
      if (!document.hidden) {
        const clockEl = document.getElementById('heroClock');
        if (clockEl && clockEl.textContent !== clockStr) {
          clockEl.textContent = clockStr;
        }
      }
    }

    const banner = document.getElementById('vioraHeroBanner');
    if (banner) {
      const wanted = heroHourClass(np.hour);
      if (!banner.classList.contains(wanted)) {
        banner.classList.remove(...HOUR_CLASSES);
        banner.classList.add(wanted);
      }
      const dstr = np.weekday + ', ' + np.day + ' ' + np.month + ' ' + np.year;
      if (dstr !== _lastDate) { _lastDate = dstr; safeSetText('vioraHeroDate', dstr); }
    }

    if (nowMs() - _lastStatRefresh > 3000) {
      _lastStatRefresh = nowMs();
      try { renderStats(); } catch (e) { reportError('tick.stats', e); }
      try { renderChrome(); } catch (e) { reportError('tick.chrome', e); }
    }

    try {
      const sky = getSky();
      if (sky && banner) {
        // Keep the banner on a supported CSS phase. Raw Solar phases such as
        // "day" or "sunrise" have no matching gradient and reveal the near-black fallback.
        applySkyPhase(skyPhaseFor(Weather.get(), sky));
        banner.classList.toggle('viora-hero--is-day', !!sky.isDay);
        banner.classList.toggle('viora-hero--is-night', !!sky.isNight);
      }

      if (global.VioraOrb && typeof global.VioraOrb.setSkyState === 'function') {
        if (sky) global.VioraOrb.setSkyState(sky);
      }
    } catch (e) { reportError('tick.orb', e); }

    try { prewarmSolarIfStale(loc); } catch (_) {}

    try {
      const skyForLayers = getSky();
      if (skyForLayers) {
        const elevBucket = Math.round(Number(skyForLayers.sun && skyForLayers.sun.elevation) || 0);
        const azBucket   = Math.round((Number(skyForLayers.sun && skyForLayers.sun.azimuth) || 0) / 5) * 5;
        const moonBucket = Math.round((Number(skyForLayers.moon && skyForLayers.moon.elevation) || 0) / 3) * 3;
        const minBucket  = Math.floor(nowMs() / 360000);
        const sig = [
          elevBucket,
          azBucket,
          moonBucket,
          minBucket,
          skyForLayers.phase || '',
          skyForLayers.isDay ? '1' : '0',
          skyForLayers.isNight ? '1' : '0'
        ].join('|');

        if (sig !== _lastSkyPushSig) {
          _lastSkyPushSig = sig;
          if (global.VioraSky && typeof global.VioraSky.setSkyState === 'function') {
            global.VioraSky.setSkyState(skyForLayers);
          }
          if (global.VioraTerminator && typeof global.VioraTerminator.setSkyState === 'function') {
            global.VioraTerminator.setSkyState(skyForLayers);
          }
          if (global.VioraHeroGlobe && typeof global.VioraHeroGlobe.setSkyState === 'function') {
            global.VioraHeroGlobe.setSkyState(skyForLayers);
          }
        }
      }
    } catch (_) {}

    if (++_secondsSinceWeather >= (WEATHER_TTL_MS / 1000)) {
      _secondsSinceWeather = 0;
      const requestedId = loc.id;
      fetchWeather(true)
        .then(w => {
          if (w && state._heroLocation && state._heroLocation.id === requestedId) renderWeather();
        })
        .catch(e => reportError('tick.refresh', e));
    }

    _endTickSky();
  }

  function _scheduleNextTick() {
    if (_tickerTimer != null) return;
    const nowMsVal = nowMs();
    const nextSecond = Math.ceil(nowMsVal / 1000) * 1000;
    const delay = Math.max(16, nextSecond - nowMsVal);
    _tickerTimer = setTimeout(() => {
      _tickerTimer = null;
      try { tick(); } catch (e) { reportError('tick', e); }
      _scheduleNextTick();
    }, delay);
  }

  function startTicker() {
    if (_tickerTimer != null) return;
    tick();
    _scheduleNextTick();
  }
  function stopTicker() {
    if (_tickerTimer != null) {
      clearTimeout(_tickerTimer);
      _tickerTimer = null;
    }
  }

  let _tabHiddenAt = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _tabHiddenAt = Date.now();
      stopTicker();
      RAF.stop();
      return;
    }

    const awayMs = _tabHiddenAt ? (Date.now() - _tabHiddenAt) : 0;
    _tabHiddenAt = 0;

    startTicker();
    RAF.start();

    if (awayMs >= WEATHER_TTL_MS) {
      _secondsSinceWeather = WEATHER_TTL_MS / 1000;
    } else {
      _secondsSinceWeather += Math.floor(awayMs / 1000);
    }

    if (awayMs >= 5000) {
      invalidateSky();
      try { renderForecastCurve(); } catch (_) {}
    }

    tick();
    ensureParticlesRunning();
  });

  let _resizeObserver = null;
  let _resizeTimer = null;
  let _lastSizeHash = '';
  function _doResizeWork() {
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner) return;
    const r = banner.getBoundingClientRect();
    const hash = Math.round(r.width) + 'x' + Math.round(r.height);
    if (hash === _lastSizeHash) return;
    _lastSizeHash = hash;

    try { resizeParticles(); } catch (_) {}
    try { renderForecastCurve(); } catch (_) {}
    try { ensureParticlesRunning(); } catch (_) {}
  }

  function attachResizeObserver() {
    if (_resizeObserver) return;
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner || typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', _onResizeDebounced);
      return;
    }
    _resizeObserver = new ResizeObserver(() => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(_doResizeWork, 100);
    });
    _resizeObserver.observe(banner);
  }

  function attachHeroVisibilityObserver() {
    if (window.__vioraHeroVisBound) return;
    window.__vioraHeroVisBound = true;
    const banner = document.getElementById('vioraHeroBanner');
    if (!banner || typeof IntersectionObserver !== 'function') return;

    let _wasVisible = true;

    const io = new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.target !== banner) continue;

        const nowVisible = e.isIntersecting;
        _heroVisible = nowVisible;
        banner.classList.toggle('viora-hero--offscreen', !nowVisible);

        if (nowVisible === _wasVisible) continue;
        _wasVisible = nowVisible;

        if (nowVisible) {
          startTicker();
          RAF.start();
          ensureParticlesRunning();
        } else {
          stopTicker();
          RAF.stop();
        }
      }
    }, { threshold: 0.02 });

    io.observe(banner);
  }

  function _onResizeDebounced() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(_doResizeWork, 120);
  }

  /* ── Snapshot ── */
  async function snapshot(opts) {
    opts = opts || {};
    const W = 1200, H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b1220');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    try {
      if (global.VioraHeroGlobe && typeof global.VioraHeroGlobe.toDataURL === 'function') {
        const dataUrl = global.VioraHeroGlobe.toDataURL('image/png');
        if (dataUrl) {
          const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = dataUrl;
          });
          const size = 480;
          ctx.drawImage(img, W - size - 60, (H - size) / 2, size, size);
        }
      }
    } catch (e) { reportError('snapshot.globe', e); }

    const w = Weather.get();
    const loc = state._heroLocation || DEFAULT_LOCATION;
    const sky = getSky();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 46px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(loc.name, 60, 180);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(new Date().toLocaleString('en-GB', { timeZone: loc.tz }), 60, 220);

    if (sky) {
      ctx.fillStyle = '#22d3ee';
      ctx.font = '500 20px ui-sans-serif, system-ui, sans-serif';
      const phaseLabel = sky.phase.charAt(0).toUpperCase() + sky.phase.slice(1);
      ctx.fillText(`${phaseLabel} · Sun ${Math.round(sky.sun.elevation)}°`, 60, 260);
      if (sky.moon.visible) {
        ctx.fillText(`Moon ${Math.round(sky.moon.illumination * 100)}% (${sky.moon.phaseName})`, 60, 288);
      }
    }

    if (w) {
      ctx.fillStyle = '#22d3ee';
      ctx.font = '700 96px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${Math.round(w.tempC)}°`, 60, 400);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '500 32px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(w.text || '', 60, 450);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 20px ui-sans-serif, system-ui, sans-serif';
      const lines = [
        `Feels like ${Math.round(w.feelsLike ?? w.tempC)}°`,
        `Humidity ${w.humidity ?? '—'}%`,
        `Wind ${Math.round(w.windKph ?? 0)} km/h`,
        `UV ${w.uvMax != null ? Number(w.uvMax).toFixed(1) : '—'}`
      ];
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 60, 500 + i * 28);
    }

    ctx.fillStyle = '#22d3ee';
    ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('VIORA', 60, H - 40);

    return new Promise(resolve => canvas.toBlob(resolve, opts.type || 'image/png'));
  }

  /* ── Bridge ── */
  function __vioraHeroWeatherUpdate(weather) {
    if (!weather) return;
    const locId = (state._heroLocation && state._heroLocation.id) || 'primary';
    try {
      Weather.set(locId, {
        ...weather,
        _fetchedAt: Date.now(),
        _source: weather.source || 'bridge',
      });
    } catch (e) {}
    try { renderWeather(); } catch (e) {}
    try { ensureParticlesRunning(); } catch (e) {}
  }
  if (typeof global !== 'undefined') {
    global.__vioraHeroWeatherUpdate = __vioraHeroWeatherUpdate;
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */
  global.__vioraOrbDisabled = false;

  startTicker();
  attachResizeObserver();

  (function bindChangeLocationBtn() {
    const tryBind = () => {
      const btn = document.getElementById('vioraHeroChangeLocationBtn');
      if (!btn || btn._vioraBound) return !!btn;
      btn._vioraBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (typeof global.__vioraOpenHeroLocationPicker === 'function') {
            global.__vioraOpenHeroLocationPicker(e);
          } else if (typeof openVioraHeroLocationPicker === 'function') {
            openVioraHeroLocationPicker();
          } else if (global.Viora && typeof global.Viora.openLocationPicker === 'function') {
            global.Viora.openLocationPicker();
          }
        } catch (err) {
          console.warn('[hero-banner] change location failed', err);
        }
      });
      return true;
    };
    if (!tryBind()) {
      let n = 0;
      const t = setInterval(() => { n++; if (tryBind() || n > 300) clearInterval(t); }, 100);
    }
  })();

  if (typeof global !== 'undefined' && !global.__vioraOpenHeroLocationPicker) {
    global.__vioraOpenHeroLocationPicker = function (event) {
      if (event) { event.preventDefault(); event.stopPropagation(); }
      try { openVioraHeroLocationPicker(); }
      catch (e) { console.warn('[picker] failed', e); }
    };
  }

  const _dataHasContent = (function () {
    const s = getState();
    const d = s.data || {};
    return (
      (d.entities && d.entities.length) ||
      (d.projects && d.projects.length) ||
      (d.payments && d.payments.length) ||
      (d.tasks    && d.tasks.length)
    ) > 0;
  })();

  try {
    prewarmSolar(state._heroLocation);
    renderChrome();
    renderQuickCityBar();
    renderWeather();
    renderStats(true);
  } catch (e) { reportError('boot.paint', e); }

  /* v4.8 — When VioraTime first syncs, force the banner clock
     to repaint immediately. This is the fix for "the clock is
     showing machine time" — if the initial paint happened
     before sync (common — sync takes ~500 ms), this makes
     the clock snap to the correct time as soon as the network
     responds. */
  try {
    if (global.VioraTime && typeof global.VioraTime.on === 'function') {
      global.VioraTime.on('synced', () => {
        try {
          _lastClock = '';
          startTicker();
          tick();
        } catch (_) {}
      });
    }
  } catch (_) {}

  try {
    if (global.VioraSky && typeof global.VioraSky.init === 'function') {
      global.VioraSky.init({
        location: state._heroLocation,
        features: {
          constellations: true,
          starLabels: true,
          deepSky: true,
          twinkle: true,
          meteors: true,
          zodiacal: true,
          moonlight: true,
          horizonGlow: true,
          diffractionSpikes: true
        }
      });
    }
  } catch (e) { reportError('boot.sky', e); }

  try {
    if (global.VioraOrb && typeof global.VioraOrb.init === 'function') {
      global.VioraOrb.init({
        location: state._heroLocation,
        sky: getSky(),
        weather: Weather.get()
      });
    }
  } catch (e) { reportError('boot.orb', e); }

  try {
    if (global.VioraTerminator && typeof global.VioraTerminator.init === 'function') {
      global.VioraTerminator.init({
        location: state._heroLocation
      });
    }
  } catch (e) { reportError('boot.terminator', e); }

  try {
    if (global.VioraTooltip && typeof global.VioraTooltip.init === 'function') {
      global.VioraTooltip.init({
        location: state._heroLocation
      });
    }
  } catch (e) { reportError('boot.tooltip', e); }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      try { initParticles(); } catch (e) { reportError('boot.particles', e); }
    }, { timeout: 2000 });
  } else {
    setTimeout(() => {
      try { initParticles(); } catch (e) { reportError('boot.particles', e); }
    }, 300);
  }

  (function _bootFetch() {
    const requestedId = state._heroLocation && state._heroLocation.id;
    if (Weather.isFresh(requestedId)) return;
    fetchWeather(false)
      .then(w => {
        if (w && state._heroLocation && state._heroLocation.id === requestedId) {
          try { renderWeather(); } catch (_) {}
        }
      })
      .catch(e => reportError('boot.fetch', e));
  })();

  let _dataReadyDebounce = null;
  function _repaintSoon() {
    if (_dataReadyDebounce) return;
    _dataReadyDebounce = setTimeout(() => {
      _dataReadyDebounce = null;
      try {
        renderStats(true);
        const name = resolveOperatorName();
        if (name !== _lastName) {
          _lastName = name;
          safeSetText('vioraHeroName', name);
        }
        _lastRenderKey = '';
        renderVioraHero(true);
      } catch (e) { reportError('repaintSoon', e); }
    }, 150);
  }

  window.addEventListener('viora:data-ready', () => {
    try { invalidateSky(); } catch (_) {}
    _repaintSoon();
  });

  window.addEventListener('viora:operator-change', _repaintSoon);

  (function _waitForData() {
    if (_dataHasContent) return;
    const started = Date.now();
    const iv = setInterval(() => {
      const s = getState();
      const d = s.data || {};
      const hasData = (
        (d.entities && d.entities.length) ||
        (d.projects && d.projects.length) ||
        (d.payments && d.payments.length) ||
        (d.tasks    && d.tasks.length) ||
        s.firebaseReady
      );
      if (hasData || Date.now() - started > 30000) {
        clearInterval(iv);
        _repaintSoon();
      }
    }, 400);
  })();

  /* ── Public API ── */
  const VioraHero = {
    render: renderVioraHero,
    renderChrome,
    renderWeather,
    renderStats,
    warm,
    renderQuickCityBar,
    setLocation,
    switchToCity,
    getLocation() { return state._heroLocation; },
    locations: global.VIORA_HERO_LOCATIONS,
    quickCities: global.VIORA_HERO_QUICK_CITIES,
    openPicker: openVioraHeroLocationPicker,
    setWeatherProvider,
    refreshWeather(force) {
      return fetchWeather(force !== false).then(w => { if (w) renderWeather(); return w; });
    },
    clearWeatherCache: () => Weather.clear(),
    snapshot,
    on, off,
    flags,
    getSky,
    invalidateSky,
    resolveOperatorName,
    ensureParticlesRunning,
    debug: {
      heroHourClass, heroGreeting, tempClass, weatherIcon,
      wmoText, cloudSettings, weatherProfile, localParts, forecastSlice,
      Weather, state, particles, curveState, RAF, reportError, skyState,
      computeStats, buildClientTotalsMap, readClients,
      statsFingerprint, _renderKey,
      resolveOperatorName, _isExecRole, _isGenericName,
      _collectOperatorSources,
      _hasVisibleParticles, _profileWantsLoop, ensureParticlesRunning,
      _getTzOffsetMs, _tzOffsets, _idHashCache,
      _clientTotalsCache: () => _clientTotalsCache,
      _clientTotalsCacheKey: () => _clientTotalsCacheKey,
      cloudFloorFor,
      skyPhaseFor,
      applySkyPhase
    }
  };

  global.VioraHero = VioraHero;
  global.renderVioraHero = renderVioraHero;
  global.VioraHeroBanner = VioraHero;
  global.VioraHeroDebug = VioraHero.debug;

})(window);
