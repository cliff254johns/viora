/* ═══════════════════════════════════════════════════════════
   hero-tooltip.js — rich weather tooltip for the hero banner
   ─────────────────────────────────────────────────────────────
   v2.1 — click-only, no hover

   v2.1 changes:
     • CLICK ONLY. Removed mouseenter/mouseleave/focus/blur
       handlers. The panel now opens on click of the weather
       tile (and only the tile — not its child buttons).
       × button, Escape, and outside click still close it.
     • Everything else (fixed right-side panel, mini sun arc,
       twilight bands, moon block, conditions section,
       position flip logic) unchanged from v2.0.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const PANEL_GAP_PX        = 12;
  const VIEWPORT_PAD_PX     = 12;
  const PANEL_WIDTH_PX      = 340;
  const MOBILE_BREAKPOINT   = 900;
  const ARC_SVG_W           = 300;
  const ARC_SVG_H           = 64;
  const ARC_PAD_X           = 20;
  const ARC_HORIZON_Y_FRAC  = 0.88;
  const ARC_TOP_Y_FRAC      = 0.10;

  const state = {
    panel: null,
    anchor: null,
    banner: null,

    location: null,
    sky: null,
    solarFull: null,
    weather: null,

    visible: false,
    rafScheduled: false,
    positioned: false,

    bound: false,
    destroyed: false,
    closedAt: 0,

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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function pad2(n) {
    n = Number(n) || 0;
    return n < 10 ? '0' + n : String(n);
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function formatTime(date, tz) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || 'UTC',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(date);
    } catch (_) {
      return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
    }
  }
  function formatTimeFromIso(iso, tz) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return formatTime(d, tz);
  }
  function formatHours(h) {
    if (!Number.isFinite(h)) return '—';
    const totalMin = Math.round(h * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return hh + 'h ' + pad2(mm) + 'm';
  }
  function formatDelta(h) {
    if (!Number.isFinite(h)) return '';
    const sign = h >= 0 ? '+' : '−';
    const abs = Math.abs(h);
    const totalMin = Math.round(abs * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    if (hh === 0 && mm === 0) return '';
    return sign + hh + 'm ' + pad2(mm) + 's';
  }

  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                   'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(deg) {
    if (!Number.isFinite(deg)) return '—';
    const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
    return COMPASS[idx];
  }

  function prettifyPhase(name) {
    if (!name) return 'Moon';
    return String(name)
      .split('-')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
  }

  function moonGlyphSvg(illum, side) {
    const i = Math.max(0, Math.min(1, Number(illum) || 0));
    const offsetPct = Math.round((1 - i) * 100);
    const sideSign = side === '-1' ? -1 : 1;
    const tx = sideSign * offsetPct;

    return (
      '<svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">' +
        '<defs>' +
          '<clipPath id="vtp-moon-clip">' +
            '<circle cx="16" cy="16" r="14"/>' +
          '</clipPath>' +
        '</defs>' +
        '<circle cx="16" cy="16" r="14" fill="#e8eef8"/>' +
        '<g clip-path="url(#vtp-moon-clip)">' +
          '<circle cx="16" cy="16" r="14" fill="#0a1329" ' +
                  'transform="translate(' + tx + ' 0)"/>' +
        '</g>' +
        '<circle cx="16" cy="16" r="14" fill="none" ' +
                'stroke="rgba(255,255,255,0.35)" stroke-width="1"/>' +
      '</svg>'
    );
  }

  function sunArcSvg(sun, sky) {
    if (!sun || !Number.isFinite(sun.azimuth)) return '';

    const arcFraction = Number.isFinite(sun.arcFraction) ? clamp(sun.arcFraction, 0, 1) : 0.5;
    const peakNorm = Number.isFinite(sun.peakNorm) ? clamp(sun.peakNorm, 0, 1) : 0.85;

    const w = ARC_SVG_W;
    const h = ARC_SVG_H;
    const padX = ARC_PAD_X;
    const horizonY = h * ARC_HORIZON_Y_FRAC;
    const zenithY  = h * ARC_TOP_Y_FRAC;
    const skyH     = horizonY - zenithY;

    const samples = 24;
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = padX + t * (w - 2 * padX);
      const parabola = 1 - (2 * t - 1) * (2 * t - 1);
      const y = horizonY - parabola * skyH * peakNorm;
      d += (i === 0 ? 'M ' : 'L ') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }

    const cx = padX + arcFraction * (w - 2 * padX);
    const parabola = 1 - (2 * arcFraction - 1) * (2 * arcFraction - 1);
    const cy = horizonY - parabola * skyH * peakNorm;

    const horizonLine = `M ${padX} ${horizonY.toFixed(1)} L ${w - padX} ${horizonY.toFixed(1)}`;
    const sunAngle = arcFraction * 180;

    return (
      '<svg viewBox="0 0 ' + w + ' ' + h + '" ' +
           'width="100%" height="' + h + '" ' +
           'preserveAspectRatio="none" class="vtp-arc-svg" aria-hidden="true">' +
        '<path d="' + d + '" ' +
              'fill="none" stroke="rgba(255, 220, 160, 0.35)" ' +
              'stroke-width="1.4" stroke-dasharray="3 3" stroke-linecap="round"/>' +
        '<path d="' + horizonLine + '" ' +
              'fill="none" stroke="rgba(148, 163, 184, 0.4)" ' +
              'stroke-width="1" stroke-dasharray="2 3"/>' +
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5.5" ' +
                'fill="#ffd27a" opacity="0.95"/>' +
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="10" ' +
                'fill="none" stroke="#ffd27a" stroke-width="1.2" opacity="0.35" ' +
                'transform="rotate(' + sunAngle + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')"/>' +
      '</svg>'
    );
  }

  function windArrowSvg(deg) {
    if (!Number.isFinite(deg)) return '';
    const angle = (deg + 180) % 360;
    return (
      '<svg viewBox="0 0 24 24" width="14" height="14" ' +
           'class="vtp-wind-arrow" ' +
           'style="transform: rotate(' + angle + 'deg);" aria-hidden="true">' +
        '<path d="M12 2 L19 13 L12 10 L5 13 Z" fill="currentColor"/>' +
      '</svg>'
    );
  }

  function pressureArrow(weather) {
    const trend = weather && weather.pressureTrend;
    if (trend === 'rising')  return '<i class="fa-solid fa-arrow-trend-up" style="color:var(--accent-green);font-size:0.7em;margin-left:4px;"></i>';
    if (trend === 'falling') return '<i class="fa-solid fa-arrow-trend-down" style="color:var(--accent-red);font-size:0.7em;margin-left:4px;"></i>';
    if (trend === 'steady')  return '<i class="fa-solid fa-minus" style="color:var(--text-muted);font-size:0.7em;margin-left:4px;"></i>';
    return '';
  }

  function ensurePanel() {
    if (state.panel && document.body.contains(state.panel)) return state.panel;

    let panel = document.getElementById('viora-hero-tooltip-panel');
    if (panel) {
      state.panel = panel;
      return panel;
    }

    panel = document.createElement('div');
    panel.id = 'viora-hero-tooltip-panel';
    panel.className = 'viora-hero-tooltip-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Weather and astronomy details');
    panel.setAttribute('aria-hidden', 'true');

    document.body.appendChild(panel);
    state.panel = panel;

    if (!panel._vtpOutsideBound) {
      panel._vtpOutsideBound = true;
      panel.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-vtp-close]');
        if (closeBtn) {
          e.stopPropagation();
          hide();
        }
      });
      document.addEventListener('pointerdown', (e) => {
        if (!state.visible) return;
        if (panel.contains(e.target)) return;
        if (state.anchor && state.anchor.contains(e.target)) return;
        if (Date.now() - state.closedAt < 100) return;
        hide();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.visible) hide();
      });
    }

    return panel;
  }

  function ensureAnchor() {
    if (state.anchor && document.body.contains(state.anchor)) return state.anchor;

    const candidates = [
      'vioraHeroWeatherTile',
      'vioraHeroWeather',
      'vioraHeroWeatherCard'
    ];
    for (let i = 0; i < candidates.length; i++) {
      const el = document.getElementById(candidates[i]);
      if (el) { state.anchor = el; return el; }
    }
    const tempEl = document.getElementById('vioraHeroWeatherTemp');
    if (tempEl) {
      const tile = tempEl.closest('.viora-hero-weather, [class*="weather"]') || tempEl.parentElement;
      if (tile) { state.anchor = tile; return tile; }
    }
    return null;
  }

  function refreshData() {
    try {
      const H = global.VioraHero;
      const W = H && H.debug && H.debug.Weather;
      if (W && typeof W.get === 'function') {
        state.weather = W.get() || {};
      }
    } catch (_) {}

    const loc = state.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
      try {
        const now = (typeof global.__vioraNow === 'function')
          ? global.__vioraNow()
          : new Date();
        const S = global.Solar;
        if (S && typeof S.getSkyState === 'function') {
          state.sky = S.getSkyState(loc.lat, loc.lon, now);
        }
        if (S && typeof S.getFull === 'function') {
          state.solarFull = S.getFull(loc.lat, loc.lon, now);
        }
      } catch (_) {
        state.sky = state.sky || null;
        state.solarFull = state.solarFull || null;
      }
    }
  }

  function buildContent() {
    const w     = state.weather || {};
    const sky   = state.sky || {};
    const full  = state.solarFull || {};
    const loc   = state.location || {};
    const tz    = loc.tz || 'UTC';

    const sun   = sky.sun  || {};
    const moon  = sky.moon || {};

    const tempText  = Number.isFinite(w.tempC)     ? Math.round(w.tempC) + '°C'   : '—';
    const feelsText = Number.isFinite(w.feelsLike) ? Math.round(w.feelsLike) + '°C' : '—';
    const weatherText = w.text || '—';

    const humidity   = Number.isFinite(w.humidity)   ? w.humidity + '%'             : '—';
    const windKph    = Number.isFinite(w.windKph)    ? Math.round(w.windKph) + ' km/h' : '—';
    const windGust   = Number.isFinite(w.windGust)   ? Math.round(w.windGust) + ' km/h' : null;
    const windDir    = compass(w.windDir);
    const uv         = Number.isFinite(w.uvMax)      ? Number(w.uvMax)              : null;
    const pressure   = Number.isFinite(w.pressure)   ? Math.round(w.pressure) + ' hPa' : '—';
    const precipProb = Number.isFinite(w.precipProb) ? w.precipProb + '%'           : '—';

    const sunrise    = formatTime(full.sunrise, tz);
    const sunset     = formatTime(full.sunset, tz);
    const solarNoon  = formatTime(full.solarNoon, tz);
    const peakElev   = Number.isFinite(full.solarNoonElevationDeg)
      ? Math.round(full.solarNoonElevationDeg) + '°'
      : '—';
    const dayLen     = formatHours(full.dayLengthHours);
    const dayDelta   = formatDelta(full.dayLengthDeltaHours);

    const twilightRows = [];
    function pushTwilight(label, rise, set, status) {
      if (status !== 'ok') return;
      if (!rise || !set) return;
      twilightRows.push(
        '<div class="vtp-row">' +
          '<span class="vtp-lbl">' + esc(label) + '</span>' +
          '<span class="vtp-val">' + formatTime(rise, tz) + ' – ' + formatTime(set, tz) + '</span>' +
        '</div>'
      );
    }
    pushTwilight('Golden',  full.goldenHourAM, full.goldenHourPM, full.goldenHourStatus);
    pushTwilight('Blue',    full.blueHourAM,   full.blueHourPM,   full.blueHourStatus);
    pushTwilight('Civil',   full.civilDawn,    full.civilDusk,    full.civilStatus);
    pushTwilight('Nautical',full.nauticalDawn, full.nauticalDusk, full.nauticalStatus);
    pushTwilight('Astronomical', full.astronomicalDawn, full.astronomicalDusk, full.astronomicalStatus);

    let moonBlock = '';
    if (moon && moon.visible) {
      const side = (Number(moon.phase) || 0) < 0.5 ? '1' : '-1';
      const illum = Math.round((Number(moon.illumination) || 0) * 100);

      const riseTime = formatTimeFromIso(moon.riseISO, tz);
      const setTime  = formatTimeFromIso(moon.setISO, tz);
      const nextFull = formatTimeFromIso(moon.nextFullISO, tz);
      const nextNew  = formatTimeFromIso(moon.nextNewISO, tz);

      const riseRow = moon.riseStatus === 'ok' && moon.riseISO
        ? '<div class="vtp-row"><span class="vtp-lbl">Moonrise</span><span class="vtp-val">' + riseTime + '</span></div>'
        : '';
      const setRow = moon.setStatus === 'ok' && moon.setISO
        ? '<div class="vtp-row"><span class="vtp-lbl">Moonset</span><span class="vtp-val">' + setTime + '</span></div>'
        : '';
      const nextFullRow = moon.nextFullISO
        ? '<div class="vtp-row"><span class="vtp-lbl">Next full</span><span class="vtp-val">' + nextFull + '</span></div>'
        : '';
      const nextNewRow = moon.nextNewISO
        ? '<div class="vtp-row"><span class="vtp-lbl">Next new</span><span class="vtp-val">' + nextNew + '</span></div>'
        : '';

      moonBlock =
        '<div class="vtp-section">' +
          '<div class="vtp-section-title"><i class="fa-solid fa-moon"></i> Moon</div>' +
          '<div class="vtp-moon">' +
            moonGlyphSvg(moon.illumination, side) +
            '<div class="vtp-moon-text">' +
              '<div class="vtp-moon-name">' + esc(prettifyPhase(moon.phaseName)) + '</div>' +
              '<div class="vtp-moon-illum">' + illum + '% illuminated</div>' +
            '</div>' +
          '</div>' +
          (riseRow || setRow
            ? '<div style="margin-top:10px;">' + riseRow + setRow + '</div>'
            : '') +
          (nextFullRow || nextNewRow
            ? '<div style="margin-top:6px;">' + nextFullRow + nextNewRow + '</div>'
            : '') +
        '</div>';
    }

    let uvBlock = '';
    if (uv != null) {
      const pct = clamp(uv / 12, 0, 1) * 100;
      uvBlock =
        '<div class="vtp-row" style="flex-direction:column;align-items:stretch;gap:4px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
            '<span class="vtp-lbl">UV index</span>' +
            '<span class="vtp-val">' + uv.toFixed(1) + '</span>' +
          '</div>' +
          '<div class="vtp-uv-bar">' +
            '<div class="vtp-uv-track"><div class="vtp-uv-fill" style="width:' + pct.toFixed(1) + '%;"></div></div>' +
          '</div>' +
        '</div>';
    }

    let windRow = '';
    if (Number.isFinite(w.windKph)) {
      const gustSuffix = windGust
        ? ' <span class="vtp-muted">(gust ' + windGust + ')</span>'
        : '';
      windRow =
        '<div class="vtp-row">' +
          '<span class="vtp-lbl">Wind</span>' +
          '<span class="vtp-val">' +
            '<span class="vtp-wind">' +
              windArrowSvg(w.windDir) +
              windKph + ' ' + windDir +
            '</span>' + gustSuffix +
          '</span>' +
        '</div>';
    }

    let pressureRow = '';
    if (Number.isFinite(w.pressure)) {
      pressureRow =
        '<div class="vtp-row">' +
          '<span class="vtp-lbl">Pressure</span>' +
          '<span class="vtp-val">' + pressure + pressureArrow(w) + '</span>' +
        '</div>';
    }

    const arc = sunArcSvg(sun, sky);

    return (
      '<div class="vtp-head">' +
        '<div class="vtp-head-text">' +
          '<div class="vtp-loc">' + esc(loc.name || 'Location') + '</div>' +
          '<div class="vtp-cond">' + esc(weatherText) + '</div>' +
        '</div>' +
        '<button type="button" class="vtp-close" data-vtp-close aria-label="Close">×</button>' +
      '</div>' +

      '<div class="vtp-temp-row">' +
        '<div class="vtp-temp">' + tempText + '</div>' +
        '<div class="vtp-feels">feels like ' + feelsText + '</div>' +
      '</div>' +

      (arc
        ? '<div class="vtp-arc-wrap">' + arc + '</div>'
        : '') +

      '<div class="vtp-section">' +
        '<div class="vtp-section-title"><i class="fa-solid fa-sun"></i> Sun</div>' +
        '<div class="vtp-row"><span class="vtp-lbl">Sunrise</span>' +
          '<span class="vtp-val">' + sunrise + '</span></div>' +
        '<div class="vtp-row"><span class="vtp-lbl">Solar noon</span>' +
          '<span class="vtp-val">' + solarNoon + '</span></div>' +
        '<div class="vtp-row"><span class="vtp-lbl">Sunset</span>' +
          '<span class="vtp-val">' + sunset + '</span></div>' +
        '<div class="vtp-row"><span class="vtp-lbl">Peak sun</span>' +
          '<span class="vtp-val">' + peakElev + '</span></div>' +
        '<div class="vtp-row"><span class="vtp-lbl">Day length</span>' +
          '<span class="vtp-val">' + dayLen +
            (dayDelta ? ' <span class="vtp-delta">' + dayDelta + '</span>' : '') +
          '</span></div>' +
      '</div>' +

      (twilightRows.length
        ? '<div class="vtp-section">' +
            '<div class="vtp-section-title"><i class="fa-solid fa-cloud-sun"></i> Twilight</div>' +
            twilightRows.join('') +
          '</div>'
        : '') +

      moonBlock +

      '<div class="vtp-section">' +
        '<div class="vtp-section-title"><i class="fa-solid fa-wind"></i> Conditions</div>' +
        '<div class="vtp-row"><span class="vtp-lbl">Humidity</span>' +
          '<span class="vtp-val">' + humidity + '</span></div>' +
        windRow +
        pressureRow +
        '<div class="vtp-row"><span class="vtp-lbl">Precip chance</span>' +
          '<span class="vtp-val">' + precipProb + '</span></div>' +
        uvBlock +
      '</div>' +

      '<div class="vtp-footer">' +
        '<span>Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>' +
        '<button type="button" class="vtp-footer-btn" data-vtp-refresh>Refresh</button>' +
      '</div>'
    );
  }

  function refreshContent() {
    const panel = state.panel;
    if (!panel) return;
    refreshData();
    panel.innerHTML = buildContent();

    const refreshBtn = panel.querySelector('[data-vtp-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          if (global.VioraHero && typeof global.VioraHero.refreshWeather === 'function') {
            global.VioraHero.refreshWeather(true);
          }
        } catch (_) {}
        refreshContent();
      });
    }
  }

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function position() {
    const panel = state.panel;
    const anchor = state.anchor;
    if (!panel || !anchor) return;

    const aRect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (isMobile()) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '';
      panel.style.bottom = '';
      state.positioned = true;
      return;
    }

    const prevVis = panel.style.visibility;
    panel.style.visibility = 'hidden';
    panel.style.left = '-9999px';
    panel.style.top = '-9999px';
    const pRect = panel.getBoundingClientRect();
    const pw = pRect.width  || PANEL_WIDTH_PX;
    const ph = pRect.height || 400;
    panel.style.visibility = prevVis;

    let left = aRect.right + PANEL_GAP_PX;
    let top  = aRect.top;

    if (left + pw + VIEWPORT_PAD_PX > vw) {
      left = aRect.left - pw - PANEL_GAP_PX;
    }

    if (left < VIEWPORT_PAD_PX) left = VIEWPORT_PAD_PX;
    if (left + pw + VIEWPORT_PAD_PX > vw) {
      left = Math.max(VIEWPORT_PAD_PX, vw - pw - VIEWPORT_PAD_PX);
    }

    if (top < VIEWPORT_PAD_PX) top = VIEWPORT_PAD_PX;
    if (top + ph + VIEWPORT_PAD_PX > vh) {
      top = Math.max(VIEWPORT_PAD_PX, vh - ph - VIEWPORT_PAD_PX);
    }

    panel.style.left = Math.round(left) + 'px';
    panel.style.top  = Math.round(top) + 'px';
    panel.style.right = '';
    panel.style.bottom = '';

    state.positioned = true;
  }

  function schedulePosition() {
    if (state.rafScheduled) return;
    state.rafScheduled = true;
    requestAnimationFrame(() => {
      state.rafScheduled = false;
      if (state.visible) position();
    });
  }

  function show() {
    const panel = ensurePanel();
    const anchor = ensureAnchor();
    if (!panel || !anchor) return;

    refreshContent();
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    state.visible = true;

    position();
    schedulePosition();
  }

  function hide() {
    const panel = state.panel;
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    state.visible = false;
    state.closedAt = Date.now();
  }

  function toggle() {
    if (state.visible) hide();
    else show();
  }

  function bind() {
    if (state.bound) return;
    const anchor = ensureAnchor();
    if (!anchor) return;
    state.bound = true;

    /* v2.1 — click only. No hover, no focus, no keyboard. */
    anchor.addEventListener('click', (e) => {
      /* Don't open if the click was on a child button/link. */
      if (e.target.closest('button, a, [role="button"]') &&
          e.target.closest('button, a, [role="button"]') !== anchor) {
        return;
      }
      e.preventDefault();
      toggle();
    });

    window.addEventListener('scroll', () => {
      if (state.visible) schedulePosition();
    }, { passive: true });
    window.addEventListener('resize', () => {
      if (state.visible) schedulePosition();
    });
  }

  const api = {
    version: '2.1',

    init(opts) {
      if (state.destroyed) return api;
      opts = opts || {};
      if (opts.location) api.setLocation(opts.location);

      state.banner = document.getElementById('vioraHeroBanner');
      state.anchor = ensureAnchor();
      if (!state.anchor) {
        requestAnimationFrame(() => {
          state.anchor = ensureAnchor();
          if (state.anchor) bind();
        });
      } else {
        bind();
      }
      ensurePanel();
      return api;
    },

    setLocation(loc) {
      if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return api;
      state.location = {
        lat: loc.lat,
        lon: loc.lon,
        tz: loc.tz || 'UTC',
        name: loc.name || loc.label || ''
      };
      if (state.visible) refreshContent();
      return api;
    },

    show, hide, toggle,

    refresh() {
      if (state.visible) refreshContent();
      return api;
    },

    destroy() {
      state.destroyed = true;
      if (state.panel && state.panel.parentNode) {
        state.panel.parentNode.removeChild(state.panel);
      }
      state.panel = null;
      state.anchor = null;
      state.banner = null;
    },

    debug: {
      state,
      buildContent,
      position,
      refreshData,
      formatTime,
      formatTimeFromIso,
      compass,
      moonGlyphSvg,
      sunArcSvg,
      windArrowSvg,
      pressureArrow,
      prettifyPhase,
      isMobile
    }
  };

  Object.defineProperty(global, 'VioraTooltip', {
    value: api,
    writable: false,
    configurable: true
  });

})(typeof window !== 'undefined' ? window : globalThis);
