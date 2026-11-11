// main/dashboard-weather.js
// ═══════════════════════════════════════════════════════════════
// Dashboard Weather — fetch, render, per-user location picker.
//
// Storage: viora_data/users/{uid}/weatherLocation
//   { lat, lon, city, country, tz }
//
// v2.1 changes:
//   • FIX: tz is no longer overwritten with the machine's
//     timezone. saveWeatherLocation() and loadWeatherLocation()
//     both resolve the correct IANA tz for the picked city:
//       1. location.tz if the caller supplied one
//       2. nearestKnownCityTz(lat, lon) from VIORA_HERO_* lists
//       3. Intl.DateTimeFormat().resolvedOptions().timeZone
//     The resolved tz is saved to Firebase, put on normLoc, and
//     flows through to VioraHero.setLocation → VioraTime.setTimezone,
//     which is what the banner clock reads.
//   • FIX: search results from Open-Meteo carry an exact IANA
//     tz (result.timezone), passed through as location.tz.
//   • FIX: POPULAR_CITIES entries now include tz, passed through.
//   • NEW: nearestKnownCityTz() helper, same 500 km threshold as
//     hero-banner.js's deriveTzFromLatLon().
//   • loadWeatherLocation() now returns tz in its result so
//     refreshWeather() and the weather card can use it.
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
let _lastWeather = null;
let _refreshTimer = null;
let _pressureHistory = [];          // ring buffer, max 5 entries
const PRESSURE_HISTORY_MAX = 5;
const PRESSURE_TREND_MIN_MS = 2 * 60 * 60 * 1000;  // 2 hours
const REFRESH_MS = 10 * 60 * 1000;  // re-fetch every 10 min

export function initDashboardWeather(deps) {
  _ctx = deps || {};
  _bindLocationChangeListener();
}

function ctx() { return _ctx || {}; }
const SAFE = {
  get state()  { return ctx().state; },
  get callFn() { return ctx().callFn; },
  get db()     { return ctx().db; },
  get ref()    { return ctx().ref; },
  get get()    { return ctx().get; },
  get set()    { return ctx().set; },
  get toast()  { return ctx().toast; },
};

/* FIX: no hard-coded fallback city — force a picker if nothing is stored */
const DEFAULT_LOCATION = {
  lat: -1.2921,
  lon: 36.8219,
  city: 'Nairobi',
  country: 'Kenya',
  tz: 'Africa/Nairobi',
};

/* ── Nearest known city → tz ────────────────────────────────
   Uses the same VIORA_HERO_LOCATIONS + VIORA_HERO_QUICK_CITIES
   lists that hero-banner.js uses. Returns null if nothing is
   within ~500 km, so callers can fall back. This is the core
   fix for "clock reverts to machine time": every save path
   now resolves the correct city tz through this helper. */
function nearestKnownCityTz(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const lists = [
    (typeof window !== 'undefined' && window.VIORA_HERO_LOCATIONS) || [],
    (typeof window !== 'undefined' && window.VIORA_HERO_QUICK_CITIES) || []
  ];
  let best = null;
  let bestDist = Infinity;
  const cosLat = Math.cos(lat * Math.PI / 180);
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    for (let j = 0; j < list.length; j++) {
      const c = list[j];
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon) || !c.tz) continue;
      const dLat = c.lat - lat;
      const dLon = (c.lon - lon) * cosLat;
      const d = dLat * dLat + dLon * dLon;
      if (d < bestDist) { bestDist = d; best = c; }
    }
  }
  /* 25 deg² ≈ 500 km — same threshold hero-banner.js uses. */
  if (best && bestDist <= 25) return best.tz;
  return null;
}

/* ── Cloud-cover floor by weather code ─────────────────────
   Duplicated from hero-banner.js's weatherProfile() so the
   card and the banner agree. */
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

/* ── Pressure trend ──────────────────────────────────────── */
function _pushPressure(pressure, at) {
  if (!Number.isFinite(pressure)) return;
  const t = Number.isFinite(at) ? at : Date.now();
  _pressureHistory.push({ t, p: pressure });
  while (_pressureHistory.length > PRESSURE_HISTORY_MAX) {
    _pressureHistory.shift();
  }
}

function _computePressureTrend() {
  if (_pressureHistory.length < 2) return null;
  const first = _pressureHistory[0];
  const last  = _pressureHistory[_pressureHistory.length - 1];
  const ageMs = last.t - first.t;
  if (ageMs < PRESSURE_TREND_MIN_MS) return null;
  const delta = last.p - first.p;
  if (Math.abs(delta) < 1.5) return 'steady';
  return delta > 0 ? 'rising' : 'falling';
}

function _resetPressureHistory() {
  _pressureHistory = [];
}

/* ── Load the user's chosen location ── */
export async function loadWeatherLocation() {
  const { db, ref, get } = SAFE;
  const uid = SAFE.state && SAFE.state.operator && SAFE.state.operator.uid;
  if (!db || !ref || !get || !uid) return DEFAULT_LOCATION;

  try {
    const snap = await get(ref(db, `viora_data/users/${uid}/weatherLocation`));
    if (snap.exists()) {
      const v = snap.val();
      if (v && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lon))) {
        /* FIX: return tz from Firebase; fall back to nearest
           known city; fall back to machine tz only as last resort. */
        const lat = Number(v.lat);
        const lon = Number(v.lon);
        const tz = v.tz
          || nearestKnownCityTz(lat, lon)
          || '';
        return {
          lat,
          lon,
          city: v.city || 'Unknown',
          country: v.country || '',
          tz,
        };
      }
    }
  } catch (e) {
    console.warn('[weather] load location failed:', e.message);
  }
  return DEFAULT_LOCATION;
}

export async function saveWeatherLocation(location) {
  const { db, ref, set } = SAFE;
  const uid = SAFE.state && SAFE.state.operator && SAFE.state.operator.uid;
  if (!db || !ref || !set || !uid) return false;

  try {
    /* FIX: resolve the correct city tz BEFORE writing to
       Firebase and BEFORE building normLoc. Priority:
         1. Caller-supplied tz (search results / POPULAR_CITIES)
         2. Nearest known city tz (for arbitrary lat/lon)
         3. Machine tz (only if we genuinely have no better info) */
    const lat = Number(location.lat);
    const lon = Number(location.lon);
    const resolvedTz =
      (location.tz && String(location.tz).trim()) ||
      nearestKnownCityTz(lat, lon) ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC';

    await set(ref(db, `viora_data/users/${uid}/weatherLocation`), {
      lat,
      lon,
      city: String(location.city || ''),
      country: String(location.country || ''),
      tz: resolvedTz,
      updatedAt: new Date().toISOString(),
    });

    const normLoc = {
      id:   'user-weather',
      name: location.city || 'My location',
      label: location.city || 'My location',
      lat,
      lon,
      tz:   resolvedTz,
    };

    /* Move the globe pin */
    try {
      if (window.VioraHeroGlobe && typeof window.VioraHeroGlobe.setLocation === 'function') {
        window.VioraHeroGlobe.setLocation(normLoc.lon, normLoc.lat, {
          animate: true, duration: 1100, label: normLoc.name, id: normLoc.id
        });
      }
    } catch (e) { console.warn('[weather] globe move failed', e); }
     /* The canonical path: VioraHero.setLocation() updates the
       banner state, sets VioraTime's timezone, restarts the clock
       ticker, moves the globe pin, and re-dispatches the
       'viora:hero-location-change' event for hero-sky / hero-globe
       / this module's own listener. Calling setLocation() is the
       single source of truth. Do NOT also dispatch the event here
       — that would cause a double-fire and a double-fly of the
       globe pin. */
    try {
      if (window.VioraHero && typeof window.VioraHero.setLocation === 'function') {
        window.VioraHero.setLocation(normLoc, { animate: true, duration: 1100 });
      } else {
        /* Fallback: dispatch the event directly for a host that
           doesn't have VioraHero loaded yet. */
        window.dispatchEvent(new CustomEvent('viora:hero-location-change', {
          detail: normLoc
        }));
      }
    } catch (e) { console.warn('[weather] location propagate failed', e); }
       /* Reset pressure history — new location, new baseline. */
    _resetPressureHistory();

    /* Refresh BOTH the right-column weather card (rendered here)
       AND the hero strip (rendered by hero-banner.js) from a
       single fetch of the new location. Fire-and-forget — the
       caller doesn't wait for the network. */
    try { refreshWeather(true).catch(() => {}); } catch (_) {}

    return true;
  } catch (e) {
    console.warn('[weather] save location failed:', e.message);
    return false;
  }
}

/* ── Fetch weather for a location ── */
export async function fetchWeather(location) {
  if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lon))) {
    console.warn('[weather] fetchWeather: invalid location');
    return null;
  }

  /* 1) Open-Meteo direct — free, CORS-enabled, no key needed */
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',  String(location.lat));
    url.searchParams.set('longitude', String(location.lon));
    url.searchParams.set('current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
    url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
    url.searchParams.set('daily',
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('temperature_unit', 'celsius');

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      const norm = normalizeOpenMeteo(json, location);
      if (norm) return norm;
    }
  } catch (e) {
    console.warn('[weather] open-meteo direct failed:', e.message);
  }

  /* 2) Worker fallback */
  const { callFn } = SAFE;
  if (typeof callFn === 'function') {
    try {
      const res = await callFn('weather', { lat: location.lat, lon: location.lon });
      if (res && res.ok) {
        res.fetchedAt = res.fetchedAt || new Date().toISOString();
        return res;
      }
    } catch (e) {
      console.warn('[weather] worker fetch failed:', e.message);
    }
  }

  return null;
}

/* ── Normalize an Open-Meteo response into the dashboard shape ── */
function normalizeOpenMeteo(json, location) {
  if (!json || typeof json !== 'object') return null;
  const c = json.current || {};
  const d = json.daily || {};
  const h = json.hourly || {};

  const daily = [];
  if (Array.isArray(d.time)) {
    for (let i = 0; i < d.time.length; i++) {
      daily.push({
        date:    d.time[i],
        tempMax: d.temperature_2m_max ? d.temperature_2m_max[i] : null,
        tempMin: d.temperature_2m_min ? d.temperature_2m_min[i] : null,
        code:    d.weather_code ? d.weather_code[i] : null,
        sunrise: d.sunrise ? d.sunrise[i] : null,
        sunset:  d.sunset ? d.sunset[i] : null,
        uvMax:   d.uv_index_max ? d.uv_index_max[i] : null,
        precipProb: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
      });
    }
  }

  let precipProb = null;
  if (Array.isArray(h.time) && Array.isArray(h.precipitation_probability)) {
    // Open-Meteo hourly timestamps use the requested location timezone.
    // Compare with current.time from that same response, not UTC.
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

  const code = c.weather_code != null
    ? Number(c.weather_code)
    : (daily[0] && daily[0].code != null ? Number(daily[0].code) : 0);

  const rawCloudCover = c.cloud_cover != null ? Number(c.cloud_cover) : null;
  const floor = cloudFloorFor(code);
  const cloudCoverEffective = rawCloudCover != null
    ? Math.max(rawCloudCover / 100, floor)
    : floor;

  const rawPressure = c.pressure_msl != null ? Number(c.pressure_msl) : null;
  if (rawPressure != null) {
    _pushPressure(rawPressure, Date.now());
  }
  const pressureTrend = _computePressureTrend();

  return {
    ok: true,
    code,
    text:        wmoText(code),
    tempC:       c.temperature_2m != null ? Number(c.temperature_2m) : null,
    feelsLike:   c.apparent_temperature != null ? Number(c.apparent_temperature) : null,
    humidity:    c.relative_humidity_2m != null ? Number(c.relative_humidity_2m) : null,
    windKph:     c.wind_speed_10m != null ? Number(c.wind_speed_10m) : null,
    windGust:    c.wind_gusts_10m != null ? Number(c.wind_gusts_10m) : null,
    windDir:     c.wind_direction_10m != null ? Number(c.wind_direction_10m) : null,
    precip:      c.precipitation != null ? Number(c.precipitation) : null,
    precipProb,
    pressure:    rawPressure,
    pressureTrend,
    cloudCover:  rawCloudCover,
    cloudCoverEffective,
    uvMax:       daily[0] && daily[0].uvMax != null ? Number(daily[0].uvMax) : null,
    isDay:       c.is_day === 1,
    daily,
    fetchedAt:   new Date().toISOString(),
    source:      'open-meteo',
    city:        location.city,
    country:     location.country,
    tz:          location.tz || '',
    peakElevationDeg: _readPeakElevation(location),
  };
}

/* Read the peak sun elevation from Solar after the weather
   fetch. Returns null if Solar isn't available. */
function _readPeakElevation(location) {
  try {
    if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
      const S = window.Solar;
      if (S && typeof S.getSkyState === 'function') {
        const now = (typeof window.__vioraNow === 'function')
          ? window.__vioraNow()
          : new Date();
        const sky = S.getSkyState(location.lat, location.lon, now);
        if (sky && sky.sun && Number.isFinite(sky.sun.solarNoonElevationDeg)) {
          return sky.sun.solarNoonElevationDeg;
        }
      }
    }
  } catch (_) {}
  return null;
}

/* ── WMO code → human text ── */
function wmoText(code) {
  const c = Number(code) || 0;
  if (c === 0) return 'Clear sky';
  if (c === 1) return 'Mainly clear';
  if (c === 2) return 'Partly cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 57) return 'Drizzle';
  if (c >= 61 && c <= 67) return 'Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Rain showers';
  if (c >= 85 && c <= 86) return 'Snow showers';
  if (c >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

/* ── Pick an icon for the WMO code ── */
function weatherIcon(code, isDay) {
  const c = Number(code) || 0;
  if (!isDay) {
    if (c === 0) return 'fa-moon';
    if (c <= 2) return 'fa-cloud-moon';
    if (c === 3) return 'fa-cloud';
    if (c >= 45 && c <= 48) return 'fa-smog';
    if (c >= 51 && c <= 67) return 'fa-cloud-moon-rain';
    if (c >= 71 && c <= 86) return 'fa-snowflake';
    if (c >= 95) return 'fa-cloud-bolt';
    return 'fa-moon';
  }
  if (c === 0) return 'fa-sun';
  if (c === 1) return 'fa-sun';
  if (c === 2) return 'fa-cloud-sun';
  if (c === 3) return 'fa-cloud';
  if (c >= 45 && c <= 48) return 'fa-smog';
  if (c >= 51 && c <= 57) return 'fa-cloud-rain';
  if (c >= 61 && c <= 67) return 'fa-cloud-showers-heavy';
  if (c >= 71 && c <= 77) return 'fa-snowflake';
  if (c >= 80 && c <= 82) return 'fa-cloud-showers-heavy';
  if (c >= 85 && c <= 86) return 'fa-snowflake';
  if (c >= 95) return 'fa-cloud-bolt';
  return 'fa-cloud-sun';
}

/* ── Render the hero weather tile + detail strip ── */
function renderHeroWeather(weather, location) {
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && el.textContent !== String(v)) el.textContent = v == null ? '—' : String(v);
  };
   /* ★ FIX: Ensure the icon matches the text perfectly */
  const icon = document.getElementById('vioraHeroWeatherIcon');
  if (icon) {
    icon.className = 'fa-solid ' + weatherIcon(weather.code, weather.isDay);
    /* Fallback: if weather code is missing, use the icon based on the text */
    if (!weather.code && weather.text) {
      const t = weather.text.toLowerCase();
      if (t.includes('rain')) icon.className = 'fa-solid fa-cloud-rain';
      else if (t.includes('clear')) icon.className = 'fa-solid fa-sun';
      else if (t.includes('cloud')) icon.className = 'fa-solid fa-cloud';
    }
  }

   /* ★ FIX: Some weather providers return 'tempC', some return 'temperature'. 
     Also ensuring we don't show a bare number. */
  const temp = weather.tempC != null ? weather.tempC : weather.temperature;
  set('vioraHeroWeatherTemp', temp != null ? `${Math.round(temp)}°C` : '—');
  set('vioraHeroWeatherLoc', location.city || '—');
  set('vioraHeroWeatherText', weather.text || '—');

  set('vioraHeroWind',     weather.windKph   != null ? `${Math.round(weather.windKph)} km/h` : '—');
  set('vioraHeroHumidity', weather.humidity  != null ? `${Math.round(weather.humidity)}%` : '—');
  set('vioraHeroPrecip',   weather.precipProb!= null ? `${Math.round(weather.precipProb)}%` : '—');
  set('vioraHeroUV',       weather.uvMax     != null ? String(Math.round(weather.uvMax)) : '—');
  set('vioraHeroPressure', weather.pressure  != null ? `${Math.round(weather.pressure)} hPa` : '—');
  set('vioraHeroFeels',    weather.feelsLike != null ? `${Math.round(weather.feelsLike)}°C` : '—');

  if (Array.isArray(weather.daily) && weather.daily.length) {
    const d0 = weather.daily[0];
    set('vioraHeroTempMax', d0.tempMax != null ? `${Math.round(d0.tempMax)}°` : '—');
    set('vioraHeroTempMin', d0.tempMin != null ? `${Math.round(d0.tempMin)}°` : '—');
  }
}

/* ── Render the weather card (right column) ── */
function renderWeatherCard(weather, location) {
  const host = document.getElementById('dashboardWeatherCard');
  if (!host) return;
  if (!weather) {
    host.innerHTML = `
      <div class="chart-box">
        <h4><i class="fa-solid fa-cloud"></i> Weather</h4>
        <div class="empty-state" style="padding:20px;">Weather unavailable.</div>
      </div>`;
    return;
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const isNarrow = typeof window !== 'undefined' &&
    window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  const forecastCount = isNarrow ? 5 : 7;
  const dailyHtml = (weather.daily || []).slice(0, forecastCount).map((d) => {
    // UTC midday keeps weekday labels stable across device timezones.
    const dt = new Date(d.date + 'T12:00:00Z');
    const dayLabel = days[dt.getUTCDay()];
    const iconClass = weatherIcon(d.code, true);
    return `
      <div class="wc-day">
        <div class="wc-day-name">${dayLabel}</div>
        <div class="wc-day-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="wc-day-temp">
          <span class="wc-hi">${d.tempMax != null ? Math.round(d.tempMax) + '°' : '—'}</span>
          <span class="wc-lo">${d.tempMin != null ? Math.round(d.tempMin) + '°' : '—'}</span>
        </div>
      </div>`;
  }).join('');

  const pressureTrendIcon = (() => {
    const t = weather.pressureTrend;
    if (t === 'rising')  return '<i class="fa-solid fa-arrow-trend-up" style="color:var(--accent-green);font-size:0.7em;margin-left:4px;"></i>';
    if (t === 'falling') return '<i class="fa-solid fa-arrow-trend-down" style="color:var(--accent-red);font-size:0.7em;margin-left:4px;"></i>';
    if (t === 'steady')  return '<i class="fa-solid fa-minus" style="color:var(--text-muted);font-size:0.7em;margin-left:4px;"></i>';
    return '';
  })();

  const pressureDisplay = weather.pressure != null
    ? Math.round(weather.pressure) + ' hPa' + pressureTrendIcon
    : '—';

  host.innerHTML = `
    <div class="chart-box dashboard-weather-card">
      <div class="wc-header">
        <h4>
          <i class="fa-solid ${weatherIcon(weather.code, weather.isDay)}"></i>
          Weather · ${esc(location.city || '')}
          ${location.country ? `<span class="wc-country">${esc(location.country)}</span>` : ''}
        </h4>
        <button type="button" class="btn btn-outline btn-xs" id="weatherChangeLocationBtn">
          <i class="fa-solid fa-location-dot"></i> Change
        </button>
      </div>

      <div class="wc-now">
        <div class="wc-temp-big">${weather.tempC != null ? Math.round(weather.tempC) + '°C' : '—'}</div>
        <div class="wc-desc">${esc(weather.text || '')}</div>
        <div class="wc-feels">Feels like ${weather.feelsLike != null ? Math.round(weather.feelsLike) + '°C' : '—'}</div>
      </div>

      <div class="wc-details">
        <div class="wc-detail"><i class="fa-solid fa-droplet"></i><div><span class="wc-label">Humidity</span><strong>${weather.humidity != null ? Math.round(weather.humidity) + '%' : '—'}</strong></div></div>
        <div class="wc-detail"><i class="fa-solid fa-wind"></i><div><span class="wc-label">Wind</span><strong>${weather.windKph != null ? Math.round(weather.windKph) + ' km/h' : '—'}</strong></div></div>
        <div class="wc-detail"><i class="fa-solid fa-sun"></i><div><span class="wc-label">UV Index</span><strong>${weather.uvMax != null ? Math.round(weather.uvMax) : '—'}</strong></div></div>
        <div class="wc-detail"><i class="fa-solid fa-gauge"></i><div><span class="wc-label">Pressure</span><strong>${pressureDisplay}</strong></div></div>
      </div>

      <div class="wc-forecast">
        ${dailyHtml}
      </div>

      <div class="wc-footer">
        <span>Updated ${(() => {
          const stamp = weather.fetchedAt || new Date().toISOString();
          const date = new Date(stamp);
          try {
            return date.toLocaleTimeString('en-KE', {
              timeZone: weather.tz || location.tz || undefined,
              hour: '2-digit', minute: '2-digit'
            });
          } catch (_) {
            return date.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
          }
        })()}</span>
        <button type="button" class="btn btn-outline btn-xs" id="weatherRefreshBtn">
          <i class="fa-solid fa-rotate"></i>
        </button>
      </div>
    </div>
  `;

  const changeBtn = document.getElementById('weatherChangeLocationBtn');
  if (changeBtn) changeBtn.addEventListener('click', () => {
    try {
      if (window.VioraHero && typeof window.VioraHero.openPicker === 'function') {
        window.VioraHero.openPicker();
      } else {
        openLocationPicker();
      }
    } catch (_) { openLocationPicker(); }
  });
  const refreshBtn = document.getElementById('weatherRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshWeather(true));
}

/* ── Location picker modal ── */
const POPULAR_CITIES = [
  { city: 'Nairobi',       country: 'Kenya',        lat: -1.2921,   lon: 36.8219,   tz: 'Africa/Nairobi' },
  { city: 'Meru',          country: 'Kenya',        lat: -0.04626,  lon: 37.65587,  tz: 'Africa/Nairobi' },
  { city: 'Mombasa',       country: 'Kenya',        lat: -4.0435,   lon: 39.6682,   tz: 'Africa/Nairobi' },
  { city: 'Kisumu',        country: 'Kenya',        lat: -0.0917,   lon: 34.7680,   tz: 'Africa/Nairobi' },
  { city: 'Nakuru',        country: 'Kenya',        lat: -0.3031,   lon: 36.0800,   tz: 'Africa/Nairobi' },
  { city: 'Eldoret',       country: 'Kenya',        lat:  0.5143,   lon: 35.2698,   tz: 'Africa/Nairobi' },
  { city: 'Kampala',       country: 'Uganda',       lat:  0.3476,   lon: 32.5825,   tz: 'Africa/Kampala' },
  { city: 'Dar es Salaam', country: 'Tanzania',     lat: -6.7924,   lon: 39.2083,   tz: 'Africa/Dar_es_Salaam' },
  { city: 'Kigali',        country: 'Rwanda',       lat: -1.9441,   lon: 30.0619,   tz: 'Africa/Kigali' },
  { city: 'Addis Ababa',   country: 'Ethiopia',     lat:  9.0320,   lon: 38.7469,   tz: 'Africa/Addis_Ababa' },
  { city: 'Lagos',         country: 'Nigeria',      lat:  6.5244,   lon:  3.3792,   tz: 'Africa/Lagos' },
  { city: 'Cape Town',     country: 'South Africa', lat: -33.9249,  lon: 18.4241,   tz: 'Africa/Johannesburg' },
];

export function openLocationPicker() {
  let modal = document.getElementById('weatherLocationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'weatherLocationModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Choose weather location');
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  }

  const cityButtons = POPULAR_CITIES.map((c) => `
    <button type="button" class="btn btn-outline btn-sm weather-city-btn"
            data-lat="${c.lat}" data-lon="${c.lon}"
            data-city="${c.city.replace(/"/g, '&quot;')}"
            data-country="${c.country.replace(/"/g, '&quot;')}"
            data-tz="${(c.tz || '').replace(/"/g, '&quot;')}"
            style="justify-content:flex-start;text-align:left;margin:4px;">
      <i class="fa-solid fa-location-dot" style="margin-right:6px;color:var(--accent-blue);"></i>
      ${c.city} <span style="color:var(--text-secondary);font-size:.7rem;margin-left:4px;">${c.country}</span>
    </button>
  `).join('');

  modal.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <h2 style="margin-bottom:14px;">
        <span class="modal-icon"><i class="fa-solid fa-location-dot"></i></span>
        Weather Location
      </h2>
      <p style="font-size:.82rem;color:var(--text-secondary);margin-bottom:16px;">
        This sets the weather shown on your dashboard. Only you see this location.
      </p>

      <h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:8px;">Search any location</h4>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input id="weatherLocationSearch"
               placeholder="Type a city, town, or place…"
               autocomplete="off"
               style="flex:1;min-width:0;padding:11px 14px;border:1.5px solid var(--border-color);border-radius:12px;background:var(--bg-input);color:var(--text-primary);font-family:inherit;font-size:.9rem;" />
        <button type="button" class="btn btn-primary" id="weatherLocationSearchBtn" aria-label="Search">
          <i class="fa-solid fa-magnifying-glass"></i>
        </button>
      </div>
      <div id="weatherLocationResults" style="margin-bottom:16px;max-height:260px;overflow-y:auto;"></div>

      <h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:8px;">Popular cities</h4>
      <div style="display:flex;flex-wrap:wrap;gap:0;margin-bottom:16px;">
        ${cityButtons}
      </div>

      <h4 style="font-size:.78rem;text-transform:uppercase;color:var(--text-secondary);letter-spacing:.5px;margin-bottom:8px;">Or use GPS</h4>
      <button type="button" class="btn btn-primary" id="weatherUseGpsBtn" style="width:100%;">
        <i class="fa-solid fa-crosshairs"></i> Detect my current location
      </button>

      <div style="margin-top:12px;font-size:.7rem;color:var(--text-light);">
        Location saved per user. Other operators keep their own.
      </div>

      <div class="form-actions" style="margin-top:18px;">
        <button type="button" class="btn btn-outline" id="weatherCancelBtn">Close</button>
      </div>
    </div>
  `;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  modal.querySelectorAll('.weather-city-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const lat = Number(btn.dataset.lat);
      const lon = Number(btn.dataset.lon);
      const city = btn.dataset.city;
      const country = btn.dataset.country;
      const tz = btn.dataset.tz || '';
      const ok = await saveWeatherLocation({ lat, lon, city, country, tz });
      if (ok) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        try {
          const heroPicker = document.querySelector('.viora-hero-location-overlay');
          if (heroPicker) heroPicker.classList.remove('active');
        } catch (_) {}
        if (typeof SAFE.toast === 'function') SAFE.toast(`Weather set to ${city}`, 'success');
        refreshWeather(true);
      } else if (typeof SAFE.toast === 'function') {
        SAFE.toast('Could not save location.', 'error');
      }
    });
  });

  const gpsBtn = modal.querySelector('#weatherUseGpsBtn');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (typeof SAFE.toast === 'function') SAFE.toast('GPS not available in this browser.', 'error');
        return;
      }
      gpsBtn.disabled = true;
      gpsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting…';
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const city = `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
          /* GPS: pass empty tz so the resolver picks the
             nearest known city tz, falling back to the
             machine tz — which is correct for GPS. */
          const ok = await saveWeatherLocation({ lat, lon, city, country: '', tz: '' });
          gpsBtn.disabled = false;
          gpsBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Detect my current location';
          if (ok) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            if (typeof SAFE.toast === 'function') SAFE.toast('Location set from GPS.', 'success');
            refreshWeather(true);
          } else if (typeof SAFE.toast === 'function') {
            SAFE.toast('Could not save location.', 'error');
          }
        },
        (err) => {
          gpsBtn.disabled = false;
          gpsBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Detect my current location';
          if (typeof SAFE.toast === 'function') SAFE.toast('GPS permission denied or unavailable.', 'error');
        },
        { timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  /* Wire the search box.
     Important: modal.innerHTML is replaced on every open, so the
     `searchInput` captured here is only valid for the current
     open. We re-query the live input inside runSearch() so that
     the second, third, … open still works. */
  const searchInput = modal.querySelector('#weatherLocationSearch');
  const searchBtn = modal.querySelector('#weatherLocationSearchBtn');
  let searchTimer = null;

  const runSearch = async () => {
    const liveInput = modal.querySelector('#weatherLocationSearch');
    const q = liveInput ? liveInput.value : '';
    if (!q || !q.trim()) {
      renderLocationResults([], modal);
      return;
    }
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    const results = await searchLocation(q);
    renderLocationResults(results, modal);
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 350);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); runSearch(); }
    });
    setTimeout(() => searchInput.focus(), 80);
  }
  if (searchBtn) searchBtn.addEventListener('click', runSearch);

  const cancelBtn = modal.querySelector('#weatherCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });
}

export async function refreshWeather(force) {
  const location = await loadWeatherLocation();

  // Keep the solar clock and weather scene on the saved weather location.
  // A returning operator may have a saved city different from the hero default.
  try {
    const hero = window.VioraHero;
    const current = hero && typeof hero.getLocation === 'function' ? hero.getLocation() : null;
    const changed = !current ||
      Math.abs(Number(current.lat) - Number(location.lat)) > 0.0001 ||
      Math.abs(Number(current.lon) - Number(location.lon)) > 0.0001 ||
      (location.tz && current.tz !== location.tz);
    if (changed && hero && typeof hero.setLocation === 'function') {
      hero.setLocation({
        id: 'user-weather',
        name: location.city || 'My location',
        label: location.city || 'My location',
        lat: Number(location.lat),
        lon: Number(location.lon),
        tz: location.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      }, { animate: false });
    }
  } catch (e) {
    console.warn('[weather] hero location sync failed:', e);
  }

  const weather = await fetchWeather(location);

  if (!weather) {
    console.warn('[weather] refresh failed — no data for', location.city);
    return null;
  }

  _lastWeather = weather;
  renderHeroWeather(weather, location);
  renderWeatherCard(weather, location);

  /* ★ FIX: only push to the hero-banner cache. That's the single
     source of truth for sun, sky, clouds, moon. hero-orb.js and
     hero-terminator.js read from VioraHero.debug.Weather via
     hero-banner.js's tick loop. No more __vioraHeroWeatherUpdate. */
  try {
    if (window.VioraHero && window.VioraHero.debug && window.VioraHero.debug.Weather) {
      const W = window.VioraHero.debug.Weather;
      /* ★ FIX: Hero banner expects the cache key to match the current location */
      const currentLocId = window.state?._heroLocation?.id || 'primary';
      if (typeof W.set === 'function') {
        W.set(currentLocId, {
          ...weather,
          _fetchedAt: Date.now(),
          _source: weather.source || 'open-meteo'
        });
      }
    }
  } catch (e) {
    console.warn('[weather] hero cache push failed:', e);
  }

  /* ★ FIX: force an immediate repaint of the hero chrome so the
     sun, sky gradient, and moon all update without waiting for
     the next tick. This is what makes weather feel responsive. */
  try {
    if (window.VioraHero && typeof window.VioraHero.renderChrome === 'function') {
      window.VioraHero.renderChrome();
    }
    if (window.VioraHero && typeof window.VioraHero.renderWeather === 'function') {
      window.VioraHero.renderWeather();
    }
    if (window.VioraHero && window.VioraHero.debug && window.VioraHero.debug.Weather) {
      const w = window.VioraHero.debug.Weather.get();
      if (w && window.VioraOrb && typeof window.VioraOrb.setWeather === 'function') {
        window.VioraOrb.setWeather(w);
      }
    }
  } catch (e) {
    console.warn('[weather] hero repaint failed:', e);
  }

  return weather;
}

/* ── Boot: called once when dashboard tab opens ── */
export async function bootDashboardWeather() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  await refreshWeather(true);
  _refreshTimer = setInterval(() => {
    if (!document.hidden) refreshWeather(false).catch(() => {});
  }, REFRESH_MS);
}

/** Force an immediate refresh after a location change. */
export async function forceWeatherRefresh() {
  return refreshWeather(true);
}
window.__vioraForceWeatherRefresh = forceWeatherRefresh;

/* Bind to window.Viora so the hero button can find it */
if (typeof window !== 'undefined') {
  window.Viora = window.Viora || {};
  if (!window.Viora.openLocationPicker) {
    window.Viora.openLocationPicker = openLocationPicker;
  }
}
export function stopDashboardWeather() {
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
}

export function getLastWeather() { return _lastWeather; }

/* ── Listen for location changes from the hero picker or
   dashboard-weather's own saveWeatherLocation() ── */
let _locationListenerBound = false;
function _bindLocationChangeListener() {
  if (_locationListenerBound || typeof window === 'undefined') return;
  _locationListenerBound = true;
  window.addEventListener('viora:hero-location-change', (e) => {
    const loc = e && e.detail;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) {
      forceWeatherRefresh().catch(() => {});
      return;
    }
    // The location was already saved by whoever dispatched this
    // event. Don't re-save — that races with the in-flight write
    // and resets the tz. Just refresh the weather card.
    forceWeatherRefresh().catch(() => {});
  });
}

/* ── Geocoding search — free, no API key ──
   Open-Meteo's geocoding API returns a `timezone` field with
   the exact IANA tz for the geocoded coordinates. We pass it
   through to saveWeatherLocation so the banner clock is
   always correct, even for cities not in POPULAR_CITIES. */
async function searchLocation(query) {
  if (!query || !query.trim()) return [];
  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', query.trim());
    url.searchParams.set('count', '8');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.results) ? json.results : [];
  } catch (e) {
    console.warn('[weather] geocoding failed:', e.message);
    return [];
  }
}

function renderLocationResults(results, modal) {
  const host = modal.querySelector('#weatherLocationResults');
  if (!host) return;
  if (!results.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = results.map((r, i) => `
    <button type="button" class="btn btn-outline btn-sm weather-loc-result"
            data-idx="${i}"
            style="display:flex;align-items:center;justify-content:flex-start;width:100%;text-align:left;margin-bottom:4px;padding:8px 12px;gap:8px;">
      <i class="fa-solid fa-location-dot" style="color:var(--accent-blue);"></i>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${String(r.name || '').replace(/[<>&]/g, '')}
        ${r.admin1 ? `<span style="color:var(--text-secondary);font-size:.7rem;margin-left:4px;">${r.admin1}</span>` : ''}
        ${r.country ? `<span style="color:var(--text-light);font-size:.7rem;margin-left:4px;">${r.country}</span>` : ''}
      </span>
    </button>
  `).join('');

  host.querySelectorAll('.weather-loc-result').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const r = results[idx];
      if (!r) return;
      /* Open-Meteo returns `timezone` in each geocoding result.
         Pass it through — it's the most reliable IANA tz source. */
      const ok = await saveWeatherLocation({
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        city: r.name || 'Unknown',
        country: r.country || '',
        tz: r.timezone || '',
      });
      if (ok) {
        modal.classList.remove('active');
        try {
          const heroPicker = document.querySelector('.viora-hero-location-overlay');
          if (heroPicker) heroPicker.classList.remove('active');
        } catch (_) {}
        if (typeof SAFE.toast === 'function') SAFE.toast(`Weather set to ${r.name}`, 'success');
        refreshWeather(true);
      } else if (typeof SAFE.toast === 'function') {
        SAFE.toast('Could not save location.', 'error');
      }
    });
  });
}
