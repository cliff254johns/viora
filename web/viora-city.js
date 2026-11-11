/* VIORA Tokyo city banner — one fixed real photograph with a separately simulated local sky. */
(() => {
  'use strict';
  const root = document.getElementById('viora-city');
  const stage = document.getElementById('viora-city-stage');
  const canvas = document.getElementById('viora-city-canvas');
  if (!root || !stage || !canvas) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const photo = new Image();
  photo.crossOrigin = 'anonymous';
  photo.src = 'https://images.unsplash.com/photo-1596332996407-d8d5d3b60e8e?auto=format&fit=crop&w=2400&q=90';

  const cityLayer = document.createElement('canvas');
  const cityCtx = cityLayer.getContext('2d');
  let cityReady = false;
  let width = 0, height = 0, dpr = 1;
  let latitude = null, longitude = null;
  let locationLabel = 'Visitor local sky';
  let lastClock = 0;
  const timeLabel = root.querySelector('[data-city-time]');
  const weatherLabel = root.querySelector('[data-city-weather]');
  if (weatherLabel) weatherLabel.textContent = 'Tokyo · fixed city view';

  function visitorTime() {
    return new Date();
  }

  function localClock(date) {
    return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  }

  function solarAltitude(date, hour) {
    if (latitude === null || longitude === null) return null;
    const start = new Date(date.getFullYear(), 0, 0);
    const day = Math.floor((date - start) / 86400000);
    const declination = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + day) / 365);
    const lat = latitude * Math.PI / 180;
    const hourAngle = (hour - 12) * 15 * Math.PI / 180;
    return Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
  }

  function phaseFor(hour, altitude) {
    if (altitude !== null) {
      const degrees = altitude * 180 / Math.PI;
      if (degrees > 8) return 'day';
      if (degrees > -4) return hour < 12 ? 'dawn' : 'golden-hour';
      if (degrees > -8) return 'blue-hour';
      return 'night';
    }
    if (hour >= 5 && hour < 6.5) return 'dawn';
    if (hour >= 6.5 && hour < 16.5) return 'day';
    if (hour >= 16.5 && hour < 18.5) return 'golden-hour';
    if (hour >= 18.5 && hour < 20) return 'blue-hour';
    return 'night';
  }

  function preparePhoto() {
    if (!photo.naturalWidth || !photo.naturalHeight) return;
    const maxW = 1800;
    const scale = Math.min(1, maxW / photo.naturalWidth);
    const iw = Math.round(photo.naturalWidth * scale);
    const ih = Math.round(photo.naturalHeight * scale);
    cityLayer.width = iw;
    cityLayer.height = ih;
    cityCtx.clearRect(0, 0, iw, ih);
    cityCtx.drawImage(photo, 0, 0, iw, ih);

    // Remove only sky connected to the top edge. The skyline itself remains the
    // same photograph at every hour; a soft alpha edge lets the simulated sky sit behind it.
    try {
      const frame = cityCtx.getImageData(0, 0, iw, ih);
      const pixels = frame.data;
      const count = iw * ih;
      const seen = new Uint8Array(count);
      const queue = new Int32Array(count);
      let head = 0, tail = 0;
      const skyLike = (i, y) => {
        if (y > ih * 0.72) return false;
        const p = i * 4, r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        const blueSky = b > r * 1.06 && g > r * 0.91 && b > 90;
        const brightCloud = Math.min(r, g, b) > 150 && Math.max(r, g, b) - Math.min(r, g, b) < 58;
        return blueSky || brightCloud;
      };
      for (let x = 0; x < iw; x++) {
        const i = x;
        if (skyLike(i, 0)) { seen[i] = 1; queue[tail++] = i; }
      }
      while (head < tail) {
        const i = queue[head++], x = i % iw, y = (i / iw) | 0;
        const neighbours = [x > 0 ? i - 1 : -1, x < iw - 1 ? i + 1 : -1, y > 0 ? i - iw : -1, y < ih - 1 ? i + iw : -1];
        for (const n of neighbours) {
          if (n < 0 || seen[n]) continue;
          const ny = (n / iw) | 0;
          if (skyLike(n, ny)) { seen[n] = 1; queue[tail++] = n; }
        }
      }
      for (let i = 0; i < count; i++) {
        if (seen[i]) pixels[i * 4 + 3] = 0;
        else if (i % iw < 2 || i % iw > iw - 3) pixels[i * 4 + 3] = 255;
      }
      cityCtx.putImageData(frame, 0, 0);
      // A tiny blur on the alpha edge softens the skyline cut without changing the source photo.
      const softened = document.createElement('canvas');
      softened.width = iw; softened.height = ih;
      const sctx = softened.getContext('2d');
      sctx.filter = 'blur(1.2px)';
      sctx.drawImage(cityLayer, 0, 0);
      cityCtx.clearRect(0, 0, iw, ih);
      cityCtx.drawImage(softened, 0, 0);
    } catch (_) {
      // If the image host blocks pixel access, keep the same fixed photograph as a clean fallback.
      cityCtx.clearRect(0, 0, iw, ih);
      cityCtx.drawImage(photo, 0, 0, iw, ih);
    }
    cityReady = true;
    resize();
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    width = Math.round(rect.width);
    height = Math.round(rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(visitorTime());
  }

  function mix(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function rgb(a, b, t) { return 'rgb(' + Math.round(mix(a[0], b[0], t)) + ',' + Math.round(mix(a[1], b[1], t)) + ',' + Math.round(mix(a[2], b[2], t)) + ')'; }

  function drawSky(date) {
    const hour = localClock(date);
    const altitude = solarAltitude(date, hour);
    const phase = phaseFor(hour, altitude);
    root.dataset.phase = phase;
    const sunUp = altitude === null ? Math.max(0, Math.sin((hour - 6) / 12 * Math.PI)) : Math.max(0, Math.sin(altitude));
    const dawn = phase === 'dawn' ? 1 : 0;
    const dusk = phase === 'golden-hour' ? 1 : 0;
    const night = phase === 'night' || phase === 'blue-hour';
    const topDay = [67, 151, 211], horizonDay = [193, 220, 236];
    const topNight = [5, 13, 34], horizonNight = [26, 43, 68];
    const twilight = Math.max(dawn, dusk);
    const top = night ? topNight : (twilight ? [45, 83, 129] : topDay);
    const horizon = night ? horizonNight : (twilight ? [232, 133, 99] : horizonDay);
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, rgb(top, [8, 18, 42], night ? 0 : 0.06));
    g.addColorStop(0.56, rgb(horizon, [247, 164, 117], twilight * 0.75));
    g.addColorStop(1, night ? '#26394f' : '#9eb5c3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    // Warm atmospheric glow close to the horizon at dawn and sunset.
    if (twilight > 0.01) {
      const glow = ctx.createRadialGradient(width * 0.69, height * 0.57, 2, width * 0.69, height * 0.57, width * 0.65);
      glow.addColorStop(0, 'rgba(255,177,126,' + (twilight * 0.48) + ')');
      glow.addColorStop(1, 'rgba(255,177,126,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    }

    // Soft, layered cloud forms; movement is intentionally slow and restrained.
    const t = reducedMotion ? 0 : date.getTime() / 100000;
    for (let i = 0; i < 7; i++) {
      const x = ((i * 0.21 + t * (i % 2 ? -0.002 : 0.0015)) % 1.35) * width - width * 0.12;
      const y = height * (0.12 + (i % 3) * 0.095);
      const cloud = ctx.createRadialGradient(x, y, 2, x, y, width * 0.19);
      const alpha = night ? 0.035 : 0.075;
      cloud.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
      cloud.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cloud; ctx.fillRect(x - width * .2, y - height * .1, width * .4, height * .2);
    }

    const sunX = width * (0.08 + (hour / 24) * 0.84);
    const sunY = height * (0.43 - sunUp * 0.34);
    if (!night && sunUp > 0.015) {
      const halo = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, width * 0.13);
      halo.addColorStop(0, 'rgba(255,239,194,.78)');
      halo.addColorStop(.22, 'rgba(255,208,151,.24)');
      halo.addColorStop(1, 'rgba(255,208,151,0)');
      ctx.fillStyle = halo; ctx.fillRect(sunX - width * .14, sunY - width * .14, width * .28, width * .28);
      ctx.beginPath(); ctx.arc(sunX, sunY, Math.max(5, width * .009), 0, Math.PI * 2);
      ctx.fillStyle = '#fff0cf'; ctx.fill();
    }

    if (night) {
      // Stars fade naturally toward twilight and remain behind the fixed Tokyo skyline.
      for (let i = 0; i < 74; i++) {
        const x = ((i * 97.13) % 997) / 997 * width;
        const y = ((i * 53.71) % 401) / 401 * height * .58;
        ctx.globalAlpha = 0.22 + ((i * 17) % 60) / 100;
        ctx.fillStyle = '#f2f5ff';
        ctx.beginPath(); ctx.arc(x, y, i % 9 === 0 ? 1.25 : .65, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const moonX = width * 0.78, moonY = height * 0.18;
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 1, moonX, moonY, width * .055);
      moonGlow.addColorStop(0, 'rgba(224,237,255,.34)');
      moonGlow.addColorStop(1, 'rgba(224,237,255,0)');
      ctx.fillStyle = moonGlow; ctx.fillRect(moonX - width * .06, moonY - width * .06, width * .12, width * .12);
      ctx.beginPath(); ctx.arc(moonX, moonY, Math.max(5, width * .008), 0, Math.PI * 2);
      ctx.fillStyle = '#e5edf6'; ctx.fill();
      ctx.beginPath(); ctx.arc(moonX + width * .004, moonY - width * .002, Math.max(5, width * .008), 0, Math.PI * 2);
      ctx.fillStyle = '#14233c'; ctx.fill();
    }
    return { phase, sunUp, twilight };
  }

  function drawCity(info) {
    if (!cityReady) return;
    const iw = cityLayer.width, ih = cityLayer.height;
    const scale = Math.max(width / iw, height / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(cityLayer, dx, dy, dw, dh);
    // Natural ambient exposure shifts while preserving the same image and composition.
    if (info.phase === 'night') {
      ctx.fillStyle = 'rgba(5,13,31,.43)';
      ctx.fillRect(0, 0, width, height);
      const glow = ctx.createLinearGradient(0, height * .48, 0, height);
      glow.addColorStop(0, 'rgba(9,24,45,0)');
      glow.addColorStop(1, 'rgba(5,12,25,.3)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    } else if (info.phase === 'blue-hour') {
      ctx.fillStyle = 'rgba(24,43,72,.2)'; ctx.fillRect(0, 0, width, height);
    } else if (info.phase === 'golden-hour' || info.phase === 'dawn') {
      ctx.fillStyle = 'rgba(255,151,91,.12)'; ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function draw(date) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const info = drawSky(date);
    drawCity(info);
    const shade = ctx.createLinearGradient(0, height * .55, 0, height);
    shade.addColorStop(0, 'rgba(4,10,18,0)');
    shade.addColorStop(1, 'rgba(3,9,17,.55)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
    if (timeLabel) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
      timeLabel.textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date) + ' · ' + tz;
    }
  }

  function tick() {
    const now = Date.now();
    if (!lastClock || now - lastClock > 15000) {
      draw(new Date());
      lastClock = now;
    } else if (!reducedMotion) {
      draw(new Date());
    }
    requestAnimationFrame(tick);
  }

  photo.addEventListener('load', preparePhoto, { once: true });
  photo.addEventListener('error', () => {
    stage.classList.add('city-photo-fallback');
    if (weatherLabel) weatherLabel.textContent = 'Tokyo skyline photo unavailable';
  }, { once: true });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
      locationLabel = 'Visitor location';
      root.dataset.skyLocation = 'visitor';
      if (weatherLabel) weatherLabel.textContent = 'Sky for your location · Tokyo city view';
      draw(new Date());
    }, () => {
      root.dataset.skyLocation = 'local-clock';
      if (weatherLabel) weatherLabel.textContent = 'Simulated from your device clock';
    }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 900000 });
  } else {
    root.dataset.skyLocation = 'local-clock';
  }

  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);
  if (photo.complete && photo.naturalWidth) preparePhoto();
  resize();
  tick();
})();