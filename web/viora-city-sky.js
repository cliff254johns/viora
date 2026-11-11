/* VIORA homepage sky adapter.
   The dashboard hero engine is the single source of truth for location,
   solar time, weather, stars, atmospheric effects, sun/moon and particles.
   This adapter adds only the public homepage's compact time/weather readout. */
(() => {
  'use strict';
  if (window.__vioraCitySkyAdapterBooted) return;
  window.__vioraCitySkyAdapterBooted = true;

  const stage = document.getElementById('vioraHeroBanner');
  if (!stage) return;

  const browserTz = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch (_) { return 'UTC'; }
  };
  let activeLocation = null;
  let weatherRequest = 0;

  function updateClock() {
    const target = stage.querySelector('[data-city-time]');
    if (!target || !activeLocation) return;
    const now = window.VioraTime?.now ? window.VioraTime.now() : new Date();
    try {
      target.textContent = new Intl.DateTimeFormat(undefined, {
        timeZone: activeLocation.tz || browserTz(),
        weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      }).format(now);
    } catch (_) {
      target.textContent = new Date().toLocaleTimeString();
    }
  }

  function paintWeather(weather) {
    const target = stage.querySelector('[data-city-weather]');
    const icon = stage.querySelector('[data-city-weather-icon]');
    if (!target) return;
    if (!weather || weather.tempC == null) {
      target.textContent = 'Live weather unavailable';
      if (icon) icon.className = 'fa-solid fa-cloud-question';
      stage.dataset.weatherStatus = 'unavailable';
      return;
    }
    const temp = Math.round(Number(weather.tempC));
    const text = weather.text || 'Current conditions';
    const humidity = Number.isFinite(Number(weather.humidity)) ? Math.round(Number(weather.humidity)) : null;
    const wind = Number.isFinite(Number(weather.windKph)) ? Math.round(Number(weather.windKph)) : null;
    target.textContent = `${temp}°C · ${text}${humidity == null ? '' : ` · ${humidity}% humidity`}${wind == null ? '' : ` · ${wind} km/h wind`}`;
    try {
      const iconName = window.VioraHero?.debug?.weatherIcon?.(weather.code);
      if (icon && iconName) icon.className = 'fa-solid ' + iconName;
    } catch (_) {}
    stage.dataset.weatherStatus = 'ready';
    stage.dataset.weatherCode = String(weather.code ?? '');
  }

  async function refreshWeather(force = false) {
    const requestId = ++weatherRequest;
    const api = window.VioraHero;
    if (!api || typeof api.refreshWeather !== 'function') {
      paintWeather(null);
      return;
    }
    try {
      const weather = await api.refreshWeather(force);
      if (requestId !== weatherRequest) return;
      paintWeather(weather);
    } catch (error) {
      console.warn('[VIORA homepage sky] Weather refresh failed', error);
      if (requestId === weatherRequest) paintWeather(null);
    }
  }

  async function loadStarCatalogue() {
    try {
      const response = await fetch('/main/stars.bin', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Star catalogue HTTP ' + response.status);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 2) throw new Error('Empty star catalogue');
      const view = new DataView(buffer);
      const count = view.getUint16(0, true), stars = [];
      if (!count || count > 10000 || buffer.byteLength < 2 + count * 6) {
        throw new Error('Invalid or truncated star catalogue');
      }
      let offset = 2;
      for (let i = 0; i < count; i++, offset += 6) {
        stars.push({
          ra: view.getInt16(offset, true) / 100,
          dec: view.getInt16(offset + 2, true) / 10,
          mag: view.getInt16(offset + 4, true) / 10
        });
      }
      const globe = window.VioraHeroGlobe || {};
      globe._starCatalog = () => stars;
      if (!window.VioraHeroGlobe) window.VioraHeroGlobe = globe;
      window.VioraSky?.refreshCatalog?.();
      stage.dataset.starCatalogue = 'loaded';
    } catch (error) {
      stage.dataset.starCatalogue = 'fallback';
      console.warn('[VIORA homepage sky] Star catalogue fallback active', error);
    }
  }

  function applyLocation(location) {
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lon))) return;
    activeLocation = {
      ...location,
      lat: Number(location.lat),
      lon: Number(location.lon),
      tz: location.tz || browserTz()
    };
    window.VioraCityLocation = activeLocation;
    try { window.VioraTime?.setTimezone?.(activeLocation.tz); } catch (_) {}
    updateClock();
    stage.dataset.locationAccuracy = location.name === 'Approximate visitor location' ? 'approximate' : 'device';
  }

  function onHeroLocationChange(event) {
    const location = event?.detail || window.VioraHero?.getLocation?.();
    if (!location) return;
    applyLocation(location);
    // The shared hero engine starts the weather request itself on location
    // changes; this reads its cache after that request has had time to settle.
    window.setTimeout(() => refreshWeather(false), 900);
  }

  function mount(location) {
    if (!location) return;
    const normalized = { ...location, tz: location.tz || browserTz() };
    if (window.VioraHero?.setLocation) {
      // This updates the exact same location state used by main.html,
      // including the dashboard's weather provider and all sky renderers.
      window.VioraHero.setLocation(normalized);
      applyLocation(window.VioraHero.getLocation?.() || normalized);
    } else {
      applyLocation(normalized);
      try { window.VioraSky?.init?.({ location: activeLocation }); } catch (e) { console.warn('[city sky] stars', e); }
      try { window.VioraTerminator?.init?.({ location: activeLocation }); } catch (e) { console.warn('[city sky] atmosphere', e); }
      try { window.VioraOrb?.init?.({ location: activeLocation }); } catch (e) { console.warn('[city sky] sun/moon', e); }
      const refresh = () => {
        const sky = window.Solar?.getSkyState?.(activeLocation.lat, activeLocation.lon,
          window.VioraTime?.now ? window.VioraTime.now() : new Date());
        if (!sky) return;
        window.VioraCitySkyState = sky;
        window.VioraSky?.setSkyState?.(sky);
        window.VioraTerminator?.setSkyState?.(sky);
        window.VioraOrb?.setSkyState?.(sky);
      };
      refresh();
      window.setInterval(refresh, 30000);
    }
    updateClock();
    refreshWeather(false);
    loadStarCatalogue();
  }

  function browserLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, tz: browserTz(), name: 'Visitor location', id: 'visitor-location' }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 6500, maximumAge: 900000 }
      );
    });
  }

  async function ipLocation() {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch('https://ipapi.co/json/', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('IP location HTTP ' + response.status);
      const data = await response.json();
      if (Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) {
        return {
          lat: Number(data.latitude), lon: Number(data.longitude),
          tz: data.timezone || browserTz(),
          name: data.city ? `${data.city}, ${data.country_name || ''}`.replace(/, $/, '') : 'Approximate visitor location',
          id: 'visitor-location'
        };
      }
    } catch (error) {
      console.warn('[VIORA homepage sky] Approximate location unavailable', error);
    } finally {
      window.clearTimeout(timer);
    }
    return null;
  }

  async function boot() {
    window.addEventListener('viora:hero-location-change', onHeroLocationChange);
    const location = await browserLocation() || await ipLocation();
    if (location) {
      mount(location);
    } else {
      stage.dataset.skyFallback = 'device-clock';
      const fallback = { lat: 0, lon: 0, tz: browserTz(), name: 'Timezone fallback', id: 'timezone-fallback' };
      mount(fallback);
      stage.dataset.skyFallback = 'timezone-fallback';
    }
    updateClock();
    window.setInterval(updateClock, 1000);
    // Dashboard weather is cached for ten minutes; refresh the public readout
    // on the same cadence without creating a second independent weather feed.
    window.setInterval(() => refreshWeather(true), 10 * 60 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();