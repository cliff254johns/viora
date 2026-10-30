// main/dashboard-hero.js
// ═══════════════════════════════════════════════════════════════
// Dashboard Hero — real animated weather background
//
// Renders a live weather scene driven by the actual Open-Meteo
// conditions at the user's chosen location:
//   • Clear day → warm gradient + sun rays + light particles
//   • Cloudy → cool gradient + drifting cloud shapes
//   • Rain → dark gradient + animated rain streaks + flash
//   • Snow → white/blue + drifting snowflakes
//   • Thunderstorm → very dark + rain + lightning flashes
//   • Fog → soft grey + slow mist drift
//   • Night → dark blue + stars (real positions preserved by hero-globe)
//
// The existing hero-*.js files (globe, terminator, orb, clock, tooltip)
// continue to run on their own canvases. This module only paints the
// background canvas (#vioraHeroSkyCanvas).
// ═══════════════════════════════════════════════════════════════

let _ctx = null;
let _canvas = null;
let _ctx2d = null;
let _width = 0;
let _height = 0;
let _dpr = 1;
let _rafId = null;
let _running = false;
let _state = {
  code: 0,          // WMO weather code
  isDay: true,
  tempC: null,
  intensity: 1,     // derived from precipProb
  condition: 'clear',
};
let _particles = [];
let _clouds = [];
let _flash = { active: false, until: 0, next: 0 };
let _lastFrame = 0;

export function initDashboardHero(deps) {
  _ctx = deps || {};
}

function ctx() { return _ctx || {}; }

/* ── WMO weather code → scene type ── */
function classifyScene(code, isDay) {
  const c = Number(code) || 0;
  if (!isDay) return 'night';
  if (c === 0) return 'clear';
  if (c === 1 || c === 2) return 'partly';
  if (c === 3) return 'cloudy';
  if (c >= 45 && c <= 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if (c >= 61 && c <= 67) return 'rain';
  if (c >= 71 && c <= 77) return 'snow';
  if (c >= 80 && c <= 82) return 'rain';
  if (c >= 85 && c <= 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'clear';
}

/* ── Gradient palettes per scene ── */
const PALETTES = {
  clear:     ['#1e3a5f', '#4a7aad', '#e8b65a', '#f7d794'],
  partly:    ['#2c3e50', '#4a6b8a', '#8fa3b8', '#d4c5a0'],
  cloudy:    ['#2a3138', '#4a525c', '#6d7884', '#9ba3ad'],
  rain:      ['#1a2332', '#2d3e52', '#4a5c70', '#6b7d90'],
  drizzle:   ['#2c3e50', '#3d5064', '#55697d', '#7a8a9a'],
  snow:      ['#4a5568', '#7a8ba0', '#b8c5d6', '#e8eef5'],
  fog:       ['#4a5568', '#6b7885', '#8d9aa8', '#b5c0cc'],
  storm:     ['#0a0f1a', '#1a2332', '#2d3a4d', '#4a5c70'],
  night:     ['#03060f', '#0a1120', '#141d33', '#1e2a45'],
};

function buildGradient(g2d, scene) {
  const stops = PALETTES[scene] || PALETTES.clear;
  const grad = g2d.createLinearGradient(0, 0, 0, _height);
  const n = stops.length;
  for (let i = 0; i < n; i++) {
    grad.addColorStop(i / (n - 1), stops[i]);
  }
  return grad;
}

/* ── Sun rays for clear day ── */
function drawSunRays(g2d, t) {
  const cx = _width * 0.15;
  const cy = _height * 0.25;
  const baseRadius = Math.min(_width, _height) * 0.15;
  const pulse = 1 + Math.sin(t * 0.0008) * 0.05;

  const glow = g2d.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 4 * pulse);
  glow.addColorStop(0, 'rgba(255,220,150,0.55)');
  glow.addColorStop(0.3, 'rgba(255,200,120,0.18)');
  glow.addColorStop(1, 'rgba(255,200,120,0)');
  g2d.fillStyle = glow;
  g2d.fillRect(0, 0, _width, _height);

  const sunGrad = g2d.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * pulse);
  sunGrad.addColorStop(0, 'rgba(255,245,210,0.98)');
  sunGrad.addColorStop(0.6, 'rgba(255,215,120,0.85)');
  sunGrad.addColorStop(1, 'rgba(255,180,80,0)');
  g2d.fillStyle = sunGrad;
  g2d.beginPath();
  g2d.arc(cx, cy, baseRadius * pulse, 0, Math.PI * 2);
  g2d.fill();

  const rayCount = 12;
  g2d.strokeStyle = 'rgba(255,235,180,0.22)';
  g2d.lineWidth = 2;
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 + t * 0.0001;
    const len = baseRadius * (2.4 + Math.sin(t * 0.0005 + i) * 0.3);
    const x1 = cx + Math.cos(angle) * baseRadius * 0.9;
    const y1 = cy + Math.sin(angle) * baseRadius * 0.9;
    const x2 = cx + Math.cos(angle) * len;
    const y2 = cy + Math.sin(angle) * len;
    g2d.beginPath();
    g2d.moveTo(x1, y1);
    g2d.lineTo(x2, y2);
    g2d.stroke();
  }
}

/* ── Moon glow for night ── */
function drawMoonGlow(g2d, t) {
  const cx = _width * 0.85;
  const cy = _height * 0.2;
  const baseRadius = Math.min(_width, _height) * 0.08;
  const pulse = 1 + Math.sin(t * 0.001) * 0.04;

  const glow = g2d.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 5);
  glow.addColorStop(0, 'rgba(200,220,255,0.25)');
  glow.addColorStop(0.4, 'rgba(180,200,240,0.08)');
  glow.addColorStop(1, 'rgba(180,200,240,0)');
  g2d.fillStyle = glow;
  g2d.fillRect(0, 0, _width, _height);

  const moonGrad = g2d.createRadialGradient(cx - baseRadius * 0.3, cy - baseRadius * 0.3, 0, cx, cy, baseRadius * pulse);
  moonGrad.addColorStop(0, 'rgba(245,248,255,0.95)');
  moonGrad.addColorStop(0.8, 'rgba(210,220,240,0.85)');
  moonGrad.addColorStop(1, 'rgba(180,195,225,0)');
  g2d.fillStyle = moonGrad;
  g2d.beginPath();
  g2d.arc(cx, cy, baseRadius * pulse, 0, Math.PI * 2);
  g2d.fill();
}

/* ── Cloud shapes ── */
function initClouds(count) {
  _clouds = [];
  for (let i = 0; i < count; i++) {
    _clouds.push({
      x: Math.random() * _width,
      y: _height * 0.15 + Math.random() * _height * 0.4,
      w: 120 + Math.random() * 180,
      h: 30 + Math.random() * 40,
      speed: 4 + Math.random() * 8,
      opacity: 0.25 + Math.random() * 0.35,
    });
  }
}

function drawClouds(g2d, t, colorBase) {
  for (const c of _clouds) {
    c.x += c.speed * 0.016;
    if (c.x > _width + c.w) c.x = -c.w;
    const grad = g2d.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.w * 0.5);
    grad.addColorStop(0, `rgba(${colorBase},${c.opacity})`);
    grad.addColorStop(1, `rgba(${colorBase},0)`);
    g2d.fillStyle = grad;
    g2d.beginPath();
    g2d.ellipse(c.x, c.y, c.w * 0.5, c.h * 0.5, 0, 0, Math.PI * 2);
    g2d.fill();
    g2d.beginPath();
    g2d.ellipse(c.x + c.w * 0.25, c.y + 6, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
    g2d.fill();
    g2d.beginPath();
    g2d.ellipse(c.x - c.w * 0.2, c.y + 4, c.w * 0.3, c.h * 0.35, 0, 0, Math.PI * 2);
    g2d.fill();
  }
}

/* ── Rain ── */
function initRain(count) {
  _particles = [];
  for (let i = 0; i < count; i++) {
    _particles.push({
      x: Math.random() * _width,
      y: Math.random() * _height,
      len: 10 + Math.random() * 20,
      speed: 400 + Math.random() * 400,
      opacity: 0.3 + Math.random() * 0.4,
    });
  }
}

function drawRain(g2d, dt) {
  g2d.strokeStyle = 'rgba(180,200,220,0.5)';
  g2d.lineWidth = 1.2;
  for (const p of _particles) {
    p.y += p.speed * dt;
    if (p.y > _height) { p.y = -p.len; p.x = Math.random() * _width; }
    g2d.strokeStyle = `rgba(180,200,220,${p.opacity})`;
    g2d.beginPath();
    g2d.moveTo(p.x, p.y);
    g2d.lineTo(p.x - 2, p.y + p.len);
    g2d.stroke();
  }
}

/* ── Snow ── */
function initSnow(count) {
  _particles = [];
  for (let i = 0; i < count; i++) {
    _particles.push({
      x: Math.random() * _width,
      y: Math.random() * _height,
      r: 1.5 + Math.random() * 2.5,
      speed: 30 + Math.random() * 50,
      drift: (Math.random() - 0.5) * 30,
      opacity: 0.5 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function drawSnow(g2d, dt, t) {
  for (const p of _particles) {
    p.y += p.speed * dt;
    p.x += Math.sin(t * 0.001 + p.phase) * p.drift * dt;
    if (p.y > _height) { p.y = -5; p.x = Math.random() * _width; }
    if (p.x < -10) p.x = _width + 10;
    if (p.x > _width + 10) p.x = -10;
    g2d.fillStyle = `rgba(255,255,255,${p.opacity})`;
    g2d.beginPath();
    g2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    g2d.fill();
  }
}

/* ── Fog ── */
function initFog(count) {
  _particles = [];
  for (let i = 0; i < count; i++) {
    _particles.push({
      x: Math.random() * _width,
      y: Math.random() * _height,
      r: 100 + Math.random() * 200,
      speed: 3 + Math.random() * 8,
      opacity: 0.06 + Math.random() * 0.12,
    });
  }
}

function drawFog(g2d, dt) {
  for (const p of _particles) {
    p.x += p.speed * dt;
    if (p.x > _width + p.r) p.x = -p.r;
    const grad = g2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    grad.addColorStop(0, `rgba(220,225,235,${p.opacity})`);
    grad.addColorStop(1, 'rgba(220,225,235,0)');
    g2d.fillStyle = grad;
    g2d.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
}

/* ── Storm lightning ── */
function maybeTriggerFlash(t) {
  if (t > _flash.next) {
    _flash.active = true;
    _flash.until = t + 80 + Math.random() * 60;
    _flash.next = t + 2000 + Math.random() * 4000;
  }
  if (_flash.active && t > _flash.until) _flash.active = false;
}

/* ── Main render loop ── */
function frame(t) {
  if (!_running) return;
  const dt = Math.min(0.05, (t - _lastFrame) / 1000) || 0.016;
  _lastFrame = t;

  if (!_ctx2d) { _rafId = requestAnimationFrame(frame); return; }
  const g = _ctx2d;
  const scene = _state.condition;

  g.setTransform(_dpr, 0, 0, _dpr, 0, 0);

  // ── Night: hero-sky.js owns the star canvas ──
  // Paint only a soft vignette on the weather canvas so the stars
  // drawn by hero-sky.js are never wiped by an opaque fill.
  if (scene === 'night') {
    g.clearRect(0, 0, _width, _height);
    const vig = g.createRadialGradient(
      _width / 2, _height / 2, Math.min(_width, _height) * 0.3,
      _width / 2, _height / 2, Math.max(_width, _height) * 0.75
    );
    vig.addColorStop(0, 'rgba(2, 6, 20, 0)');
    vig.addColorStop(1, 'rgba(2, 6, 20, 0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, _width, _height);
    _rafId = requestAnimationFrame(frame);
    return;
  }

  g.fillStyle = buildGradient(g, scene);
  g.fillRect(0, 0, _width, _height);

    if (scene === 'clear' || scene === 'partly') {
    if (_state.isDay) drawSunRays(g, t);
  }
  if (scene === 'partly' || scene === 'cloudy') {
    drawClouds(g, t, scene === 'cloudy' ? '190,200,215' : '220,225,235');
  }
  if (scene === 'rain' || scene === 'drizzle') {
    drawClouds(g, t, '140,155,175');
    drawRain(g, dt);
  }
  if (scene === 'snow') {
    drawClouds(g, t, '220,230,245');
    drawSnow(g, dt, t);
  }
  if (scene === 'fog') {
    drawFog(g, dt);
  }
  if (scene === 'storm') {
    drawClouds(g, t, '60,70,85');
    drawRain(g, dt);
    maybeTriggerFlash(t);
    if (_flash.active) {
      g.fillStyle = 'rgba(200,220,255,0.35)';
      g.fillRect(0, 0, _width, _height);
    }
  }

  _rafId = requestAnimationFrame(frame);
}

/* ── Sizing ── */
function resize() {
  if (!_canvas) return;
  const rect = _canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  _dpr = window.devicePixelRatio || 1;
  _width = rect.width;
  _height = rect.height;
  _canvas.width = Math.round(_width * _dpr);
  _canvas.height = Math.round(_height * _dpr);
  _canvas.style.width = _width + 'px';
  _canvas.style.height = _height + 'px';
  _ctx2d = _canvas.getContext('2d');
  initClouds(_state.condition === 'storm' ? 8 : 5);
  if (_state.condition === 'rain' || _state.condition === 'storm') initRain(120);
  else if (_state.condition === 'drizzle') initRain(60);
  else if (_state.condition === 'snow') initSnow(80);
  else if (_state.condition === 'fog') initFog(14);
}

export function startHeroWeather(weather) {
  /* DISABLED — hero-banner.js owns particle rendering on
     #vioraHeroCanvas. Keeping this as a no-op so stale imports
     don't throw. */
  return;
  // eslint-disable-next-line no-unreachable
  _canvas = document.getElementById('vioraHeroWeatherCanvas');
  if (!_canvas) {
    console.warn('[dashboard-hero] #vioraHeroWeatherCanvas not found');
    return;
  }

  _state.code = weather && weather.code != null ? Number(weather.code) : 0;
  _state.isDay = weather ? !!weather.isDay : true;
  _state.tempC = weather ? weather.tempC : null;
  _state.condition = classifyScene(_state.code, _state.isDay);

  resize();
  if (!_running) {
    _running = true;
    _lastFrame = performance.now();
    _rafId = requestAnimationFrame(frame);
  }

  if (!resize._bound) {
    resize._bound = true;
    window.addEventListener('resize', resize);
  }
}

export function stopHeroWeather() {
  _running = false;
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
}

export function updateHeroWeather(weather) {
  if (!weather) return;
  const newCode = weather.code != null ? Number(weather.code) : 0;
  const newIsDay = !!weather.isDay;
  const newCondition = classifyScene(newCode, newIsDay);
  if (newCondition !== _state.condition) {
    _state.condition = newCondition;
    resize();
  }
  _state.code = newCode;
  _state.isDay = newIsDay;
  _state.tempC = weather.tempC;
}
