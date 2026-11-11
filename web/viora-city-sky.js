/* VIORA city sky adapter: mounts the main dashboard's solar, star, atmospheric, sun and moon engines only inside the homepage Tokyo banner. */
(() => {
  'use strict';
  const stage = document.getElementById('vioraHeroBanner');
  if (!stage) return;
  const clock = () => window.VioraTime?.now ? VioraTime.now() : new Date();
  const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; } };

  async function loadStarCatalogue() {
    try {
      const response = await fetch('/main/stars.bin', { cache: 'force-cache' });
      if (!response.ok) throw new Error('Star catalogue HTTP ' + response.status);
      const view = new DataView(await response.arrayBuffer());
      const count = view.getUint16(0, true), stars = [];
      if (!count || count > 10000) throw new Error('Invalid star catalogue');
      let offset = 2;
      for (let i = 0; i < count; i++) {
        if (offset + 6 > view.byteLength) throw new Error('Truncated star catalogue');
        stars.push({
          ra: view.getInt16(offset, true) / 100,
          dec: view.getInt16(offset + 2, true) / 10,
          mag: view.getInt16(offset + 4, true) / 10
        });
        offset += 6;
      }
      const globe = window.VioraHeroGlobe || {};
      globe._starCatalog = () => stars;
      if (!window.VioraHeroGlobe) window.VioraHeroGlobe = globe;
      window.VioraSky?.refreshCatalog?.();
    } catch (error) {
      console.warn('[VIORA city sky] Real star catalogue unavailable; renderer fallback remains active.', error);
    }
  }

  function mount(location) {
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return;
    location.tz = location.tz || browserTz();
    window.VioraCityLocation = location;
    try { window.VioraTime?.setTimezone?.(location.tz); } catch (_) {}
    try { window.VioraSky?.init?.({ location }); } catch (e) { console.warn('[city sky] stars', e); }
    try { window.VioraTerminator?.init?.({ location }); } catch (e) { console.warn('[city sky] atmosphere', e); }
    try { window.VioraOrb?.init?.({ location }); } catch (e) { console.warn('[city sky] sun/moon', e); }

    const refresh = () => {
      try {
        const sky = window.Solar?.getSkyState?.(location.lat, location.lon, clock());
        if (!sky) return;
        window.VioraCitySkyState = sky;
        window.VioraSky?.setSkyState?.(sky);
        window.VioraTerminator?.setSkyState?.(sky);
        window.VioraOrb?.setSkyState?.(sky);
      } catch (e) { console.warn('[city sky] solar refresh', e); }
    };
    refresh();
    setInterval(refresh, 30000);
    window.dispatchEvent(new CustomEvent('viora:city-sky-ready', { detail: { location } }));
    loadStarCatalogue();
  }

  function browserLocation() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, tz: browserTz(), name: 'Visitor location' }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 6500, maximumAge: 900000 }
      );
    });
  }

  async function ipLocation() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const response = await fetch('https://ipapi.co/json/', { cache: 'no-store', signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error('IP location HTTP ' + response.status);
      const data = await response.json();
      if (Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) {
        return { lat: Number(data.latitude), lon: Number(data.longitude), tz: data.timezone || browserTz(), name: 'Approximate visitor location' };
      }
    } catch (e) { console.warn('[VIORA city sky] IP location unavailable', e); }
    return null;
  }

  async function boot() {
    const location = await browserLocation() || await ipLocation();
    if (location) {
      mount(location);
      if (location.name === 'Approximate visitor location') stage.dataset.locationAccuracy = 'approximate';
      return;
    }
    // No coordinates available: keep the network-synchronised local clock visible,
    // but do not pretend that an astronomical location was resolved.
    stage.dataset.skyFallback = 'device-clock';
    const fallback = { lat: 0, lon: 0, tz: browserTz(), name: 'Timezone fallback' };
    mount(fallback);
    stage.dataset.skyFallback = 'timezone-fallback';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();