/* VIORA Tokyo city foreground: phase-specific real photographs, crossfades and restrained city activity.
   The sky itself is rendered by the same astronomical dashboard engines in viora-city-sky.js. */
(() => {
  'use strict';
  const root = document.getElementById('viora-city');
  const stage = root?.querySelector('.city-stage');
  const canvas = document.getElementById('viora-city-canvas');
  if (!root || !stage || !canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const definitions = [
    { key: 'morning', url: 'https://images.unsplash.com/photo-1788370880744-3628bf4c98f1?auto=format&fit=crop&w=2200&q=88' },
    { key: 'day', url: 'https://images.unsplash.com/photo-1567745218763-da8bea60d81c?auto=format&fit=crop&w=2200&q=88' },
    { key: 'sunset', url: 'https://images.unsplash.com/photo-1787395706192-55486ee1c2aa?auto=format&fit=crop&w=2200&q=88' },
    { key: 'night', url: 'https://images.unsplash.com/photo-1788370878768-634700c12acd?auto=format&fit=crop&w=2200&q=88' }
  ];
  const layers = new Map();
  const lights = Array.from({ length: 118 }, (_, i) => {
    const n = Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
    return { x: .08 + ((i * .61803398875) % 1) * .84, y: .39 + n * .43,
      w: .0011 + n * .0017, h: .002 + n * .004, phase: n * Math.PI * 2,
      speed: .55 + n * 1.35, warm: i % 4 !== 0 };
  });
  let width = 0, height = 0, dpr = 1, location = window.VioraCityLocation || null;
  let activeKey = '', previousKey = '', transitionAt = 0, lastFrame = 0;
  const timeLabel = root.querySelector('[data-city-time]');
  const statusLabel = root.querySelector('[data-city-weather]');

  function now() {
    try { return window.VioraTime?.now ? VioraTime.now() : window.__vioraNow ? window.__vioraNow() : new Date(); }
    catch (_) { return new Date(); }
  }
  function hourAt(date) {
    const zone = location?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(date)); }
    catch (_) { return date.getHours(); }
  }
  function skyAt(date) {
    try {
      if (location && window.Solar?.getSkyState) return Solar.getSkyState(location.lat, location.lon, date);
    } catch (_) {}
    return window.VioraCitySkyState || null;
  }
  function phaseAt(date, sky) {
    const hour = hourAt(date);
    const elevation = sky?.sun && Number.isFinite(sky.sun.elevation) ? sky.sun.elevation : null;
    if (elevation !== null) {
      if (elevation < -6) return 'night';
      if (elevation < -.833 || elevation < 7) return hour < 12 ? 'morning' : 'sunset';
    }
    if (hour < 10.5) return 'morning';
    if (hour >= 16) return 'sunset';
    return 'day';
  }

  function removeSky(image) {
    const maxWidth = 1600, scale = Math.min(1, maxWidth / image.naturalWidth);
    const w = Math.max(2, Math.round(image.naturalWidth * scale));
    const h = Math.max(2, Math.round(image.naturalHeight * scale));
    const layer = document.createElement('canvas');
    layer.width = w; layer.height = h;
    const layerCtx = layer.getContext('2d', { willReadFrequently: true });
    layerCtx.drawImage(image, 0, 0, w, h);
    try {
      const frame = layerCtx.getImageData(0, 0, w, h), pixels = frame.data, count = w * h;
      const visited = new Uint8Array(count), queue = new Int32Array(count);
      let head = 0, tail = 0;
      function skyPixel(index, y) {
        if (y > h * .76) return false;
        const p = index * 4, r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max - min;
        return (b > r * 1.035 && g > r * .88 && b > 34) ||
          (r > g * 1.055 && g > b * 1.04 && r > 92) ||
          (min > 142 && sat < 66) ||
          (b > r * 1.12 && g > r * 1.06 && b > 24 && r < 105);
      }
      for (let x = 0; x < w; x++) if (skyPixel(x, 0)) { visited[x] = 1; queue[tail++] = x; }
      while (head < tail) {
        const i = queue[head++], x = i % w, y = (i / w) | 0;
        const neighbours = [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const next of neighbours) {
          if (next < 0 || visited[next]) continue;
          if (skyPixel(next, (next / w) | 0)) { visited[next] = 1; queue[tail++] = next; }
        }
      }
      for (let i = 0; i < count; i++) if (visited[i]) pixels[i * 4 + 3] = 0;
      layerCtx.putImageData(frame, 0, 0);
      const softened = document.createElement('canvas');
      softened.width = w; softened.height = h;
      const softCtx = softened.getContext('2d');
      softCtx.filter = 'blur(1.25px)';
      softCtx.drawImage(layer, 0, 0);
      layerCtx.clearRect(0, 0, w, h);
      layerCtx.drawImage(softened, 0, 0);
    } catch (e) {
      console.warn('[VIORA city] Could not segment this photograph sky; retaining the original image.', e);
    }
    return layer;
  }

  function loadLayer(definition) {
    return new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        try { resolve({ key: definition.key, canvas: removeSky(image) }); }
        catch (_) { resolve(null); }
      };
      image.onerror = () => resolve(null);
      image.src = definition.url;
    });
  }
  function setPhase(key) {
    if (!key || key === activeKey) return;
    previousKey = activeKey;
    activeKey = key;
    transitionAt = performance.now();
    root.dataset.phase = key;
    root.dataset.cityView = key;
    if (statusLabel) statusLabel.textContent = 'Tokyo · ' + ({ morning: 'Morning', day: 'Daylight', sunset: 'Golden hour', night: 'Night' }[key] || 'City view');
  }
  function resize() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    width = rect.width; height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, /Mobi|Android/i.test(navigator.userAgent) ? 1.5 : 1.8);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(now());
  }
  function drawLayer(layer, alpha, elapsed) {
    if (!layer || alpha <= 0) return;
    const iw = layer.canvas.width, ih = layer.canvas.height;
    const scale = Math.max(width / iw, height / ih);
    const zoom = 1.015 + (reducedMotion ? 0 : .009 * (.5 + .5 * Math.sin(elapsed * .035)));
    const dw = iw * scale * zoom, dh = ih * scale * zoom;
    const pan = reducedMotion ? 0 : Math.sin(elapsed * .018) * width * .004;
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer.canvas, (width - dw) / 2 + pan, (height - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }
  function drawCity(sky) {
    if (!activeKey) return;
    const elapsed = performance.now() / 1000;
    const progress = reducedMotion ? 1 : Math.min(1, (performance.now() - transitionAt) / 4200);
    const eased = progress * progress * (3 - 2 * progress);
    const current = layers.get(activeKey), previous = layers.get(previousKey);
    if (previous && previousKey !== activeKey) drawLayer(previous, 1 - eased, elapsed);
    drawLayer(current, previous && previousKey !== activeKey ? eased : 1, elapsed);
    if (progress >= 1) previousKey = '';

    const elevation = sky?.sun && Number.isFinite(sky.sun.elevation) ? sky.sun.elevation : -12;
    const night = Math.max(0, Math.min(1, (5 - elevation) / 15));
    if (night > .035) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const light of lights) {
        const flicker = .48 + .52 * Math.sin(elapsed * light.speed + light.phase);
        ctx.globalAlpha = night * (.10 + flicker * .27);
        ctx.fillStyle = light.warm ? '#ffd69a' : '#a8dfff';
        ctx.shadowColor = light.warm ? 'rgba(255,174,83,.8)' : 'rgba(112,191,255,.7)';
        ctx.shadowBlur = 2.4;
        ctx.fillRect(light.x * width, light.y * height, Math.max(1, light.w * width), Math.max(1.5, light.h * height));
      }
      if (!reducedMotion) {
        for (let i = 0; i < 4; i++) {
          const x = ((elapsed * (.016 + i * .002) + i * .27) % 1.25 - .12) * width;
          const y = height * (.86 + i * .012);
          ctx.globalAlpha = night * .34;
          ctx.strokeStyle = i % 2 ? '#ffb46f' : '#d9edff';
          ctx.lineWidth = 1.1;
          ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width * .065, y); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
    }
  }
  function draw(date) {
    if (width < 2 || height < 2) return;
    const sky = skyAt(date);
    setPhase(phaseAt(date, sky));
    ctx.clearRect(0, 0, width, height);
    drawCity(sky);
    if (timeLabel) {
      const zone = location?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      try { timeLabel.textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: zone, timeZoneName: 'short' }).format(date); }
      catch (_) { timeLabel.textContent = new Intl.DateTimeFormat().format(date); }
    }
  }
  function tick(timestamp) {
    if (reducedMotion) { draw(now()); return; }
    if (!lastFrame || timestamp - lastFrame >= 40) { draw(now()); lastFrame = timestamp; }
    requestAnimationFrame(tick);
  }

  window.addEventListener('viora:city-sky-ready', event => {
    location = event.detail?.location || window.VioraCityLocation || location;
    draw(now());
  });
  window.addEventListener('resize', resize, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  location = window.VioraCityLocation || null;
  resize();
  Promise.all(definitions.map(loadLayer)).then(items => {
    items.forEach(item => { if (item) layers.set(item.key, item); });
    setPhase(phaseAt(now(), skyAt(now())));
    draw(now());
  });
  requestAnimationFrame(tick);
})();