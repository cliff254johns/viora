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
  let frameTime = 0;
  const nightLights = Array.from({length:190}, (_,i) => {
    const seed = (Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
    const rnd = Math.abs(seed);
    return { x:.08 + ((i * .61803398875) % 1) * .84, y:.34 + rnd * .49,
      w:.0012 + rnd * .0015, h:.0022 + rnd * .004,
      phase:rnd * Math.PI * 2, speed:.45 + rnd * 1.4,
      warm:i % 5 !== 0 };
  });
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
    const sunFactor = altitude === null ? sunUp : Math.max(0, Math.min(1, (altitude * 180 / Math.PI + 12) / 28));
    const nightFactor = 1 - sunFactor;
    const top = [
      mix(topNight[0], topDay[0], sunFactor),
      mix(topNight[1], topDay[1], sunFactor),
      mix(topNight[2], topDay[2], sunFactor)
    ];
    const horizon = [
      mix(horizonNight[0], horizonDay[0], sunFactor),
      mix(horizonNight[1], horizonDay[1], sunFactor),
      mix(horizonNight[2], horizonDay[2], sunFactor)
    ];
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, rgb(top, [8, 18, 42], 0.03));
    g.addColorStop(0.56, rgb(horizon, [247, 164, 117], Math.max(twilight, (1 - sunFactor) * sunFactor) * 0.72));
    g.addColorStop(1, rgb(night ? [19,31,49] : [158,181,195], [38,57,79], nightFactor * .45));
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
    return { phase, sunUp, twilight, nightFactor, sunFactor, hour };
  }

  function drawCity(info) {
    if (!cityReady) return;
    const iw = cityLayer.width, ih = cityLayer.height;
    const scale = Math.max(width / iw, height / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    const elapsed = reducedMotion ? 0 : performance.now() / 1000;
    const cinematicZoom = 1.018 + (reducedMotion ? 0 : .012 * (0.5 + 0.5 * Math.sin(elapsed * .035)));
    const drawW = dw * cinematicZoom, drawH = dh * cinematicZoom;
    const panX = Math.sin(elapsed * .018) * width * .006;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(cityLayer, (width - drawW) / 2 + panX, (height - drawH) / 2, drawW, drawH);

    // Continuous cinematic exposure and color temperature. The underlying city image never changes.
    const night = Math.max(0, Math.min(1, info.nightFactor));
    ctx.fillStyle = 'rgba(5,13,31,' + (night * .47) + ')';
    ctx.fillRect(0, 0, width, height);
    const warmth = Math.max(info.twilight, Math.pow(info.sunFactor, 2) * .18);
    if (warmth > .01) {
      const warmWash = ctx.createLinearGradient(0, 0, width * .7, height);
      warmWash.addColorStop(0, 'rgba(255,165,104,' + (warmth * .17) + ')');
      warmWash.addColorStop(.55, 'rgba(255,188,139,' + (warmth * .09) + ')');
      warmWash.addColorStop(1, 'rgba(255,188,139,0)');
      ctx.fillStyle = warmWash; ctx.fillRect(0, 0, width, height);
    }
    const cityScaleX = drawW / iw, cityScaleY = drawH / ih;
    const originX = (width - drawW) / 2 + panX, originY = (height - drawH) / 2;
    const lightOpacity = Math.pow(night, 1.35);
    if (lightOpacity > .025) {
      for (let i = 0; i < nightLights.length; i++) {
        const p = nightLights[i];
        const flicker = .48 + .52 * Math.sin(elapsed * p.speed + p.phase);
        const alpha = lightOpacity * (.26 + flicker * .58);
        const x = originX + p.x * iw * cityScaleX;
        const y = originY + p.y * ih * cityScaleY;
        const w = Math.max(1.1, p.w * iw * cityScaleX);
        const h = Math.max(1.8, p.h * ih * cityScaleY);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.warm ? '#ffd69a' : '#a8dfff';
        ctx.shadowColor = p.warm ? 'rgba(255,176,87,.8)' : 'rgba(100,184,255,.75)';
        ctx.shadowBlur = Math.min(7, w * 2.8);
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Distant vehicle light trails: slow, low-contrast motion along the street horizon.
    if (lightOpacity > .08 && !reducedMotion) {
      for (let i = 0; i < 5; i++) {
        const travel = (elapsed * (.018 + i * .002) + i * .23) % 1;
        const y = height * (.82 + i * .018);
        const x = (travel * 1.3 - .15) * width;
        ctx.globalAlpha = lightOpacity * .42;
        ctx.strokeStyle = i % 2 ? '#ffb66f' : '#d8eaff';
        ctx.lineWidth = i % 2 ? 1.4 : 1;
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width * .055, y); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
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
    if (!lastClock || now - lastClock > 1000 || (!reducedMotion && cityReady)) {
      draw(new Date());
      lastClock = now;
    }
    if (!reducedMotion) requestAnimationFrame(tick);
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