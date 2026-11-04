'use strict';

/* ============================================================
   VIORA ECOSYSTEMS — script.js (COMPLETE)
   ============================================================ */

const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ============================================================
   GLOBAL NETWORK CANVAS
   ============================================================ */
const canvas = $('#globalNetwork');
const ctx = canvas ? canvas.getContext('2d') : null;
let W = 0, H = 0;
const particles = [];
const MAX_PARTICLES = window.innerWidth < 768 ? 60 : 140;
const CONNECT_DIST = window.innerWidth < 768 ? 120 : 175;

function resizeCanvas() {
  if (!canvas) return;
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas, { passive: true });
resizeCanvas();

for (let i = 0; i < MAX_PARTICLES; i++) {
  particles.push({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - .5) * .35,
    vy: (Math.random() - .5) * .35,
    r: Math.random() * 1.8 + 0.6
  });
}

function drawGlobalNetwork() {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const dotColor = isDark ? 'rgba(200,225,255,0.55)' : 'rgba(10,25,47,0.45)';
  const lineColor = isDark ? 'rgba(120,180,255,0.28)' : 'rgba(34,103,238,0.22)';
  const glowColor = isDark ? 'rgba(120,180,255,0.14)' : 'rgba(34,103,238,0.10)';

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!prefersReduce) { p.x += p.vx; p.y += p.vy; }
    if (p.x < 0 || p.x > W) p.vx *= -1;
    if (p.y < 0 || p.y > H) p.vy *= -1;

    ctx.beginPath();
    ctx.fillStyle = dotColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j];
      const dx = p.x - p2.x, dy = p.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECT_DIST) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 0.7 + (1 - dist / CONNECT_DIST) * 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }
  if (!prefersReduce) requestAnimationFrame(drawGlobalNetwork);
}
drawGlobalNetwork();

/* ============================================================
   THEME TOGGLE
   ============================================================ */
const themeToggle = $('#themeToggle');
const currentTheme = localStorage.getItem('theme');
if (currentTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
  });
}

/* ============================================================
   NAV & DRAWER
   ============================================================ */
const nav = $('#nav');
if (nav) {
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20), { passive: true });
}

const burger = $('#burger');
const drawer = $('#drawer');
if (burger && drawer) {
  burger.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(isOpen));
    drawer.setAttribute('aria-hidden', String(!isOpen));
    document.body.classList.toggle('drawer-open', isOpen);
  });
}

$$('[data-dropdown]').forEach((li) => {
  const btn = li.querySelector('button');
  const mega = li.querySelector('.mega');
  if (!btn || !mega) return;
  let hoverTimer = null;
  const open = () => { clearTimeout(hoverTimer); li.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { li.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const delayedClose = () => { hoverTimer = setTimeout(close, 150); };
  li.addEventListener('mouseenter', open);
  li.addEventListener('mouseleave', delayedClose);
  btn.addEventListener('click', (e) => { e.preventDefault(); li.classList.contains('open') ? close() : open(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { e.preventDefault(); open(); const f = mega.querySelector('a'); if (f) f.focus(); }
  });
  mega.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); btn.focus(); } });
  document.addEventListener('click', (e) => { if (!li.contains(e.target)) close(); });
});

/* ============================================================
   HERO — h1 word animation
   ============================================================ */
const h1 = $('#heroH1');
if (h1) {
  $$('.line', h1).forEach((line, li) => {
    const words = line.textContent.trim().split(' ');
    line.textContent = '';
    words.forEach((word, wi) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word + (wi < words.length - 1 ? '\u00A0' : '');
      span.style.animationDelay = (li * 0.15 + wi * 0.08) + 's';
      line.appendChild(span);
    });
  });
  requestAnimationFrame(() => $('#hero').classList.add('ready'));
}

/* ============================================================
   REAL EARTH GLOBE — with all submarine cables + landlocked trunks
   ============================================================ */
const globeContainer = $('#globe-canvas-container');

if (typeof THREE === 'undefined') {
  console.warn('[VIORA] Three.js not loaded — globe disabled.');
  if (globeContainer) {
    globeContainer.innerHTML =
      '<div style="display:grid;place-items:center;height:100%;color:rgba(255,255,255,.6);font-size:14px;text-align:center;padding:40px">' +
        '<div>' +
          '<p style="margin:0 0 12px;font-weight:600;color:#fff">Our network spans the globe.</p>' +
          '<p style="margin:0;font-size:13px">Africa · Europe · Middle East · Asia · Oceania · Americas — connected in real time.</p>' +
        '</div>' +
      '</div>';
  }
} else if (globeContainer) {

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  camera.position.set(0, 0, 290);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  globeContainer.appendChild(renderer.domElement);

  const globeGroup = new THREE.Group();
  globeGroup.rotation.y = -0.9;
  globeGroup.rotation.x = 0.15;
  scene.add(globeGroup);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
  sunLight.position.set(300, 120, 240);
  scene.add(sunLight);
  const rimLight = new THREE.DirectionalLight(0x2267EE, 0.55);
  rimLight.position.set(-300, -100, -260);
  scene.add(rimLight);

  const earthRadius = 100;
  const textureLoader = new THREE.TextureLoader();
  const prefersReduceG = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const earthMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    specular: new THREE.Color(0x111111),
    shininess: 8
  });

  textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    (tex) => { earthMat.map = tex; earthMat.needsUpdate = true; },
    undefined,
    () => { earthMat.color.set(0x1E3A8A); }
  );
  textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    (tex) => { earthMat.emissiveMap = tex; earthMat.needsUpdate = true; },
    undefined,
    () => {}
  );
  earthMat.emissive = new THREE.Color(0xffffff);
  earthMat.emissiveIntensity = 0.75;
  textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    (tex) => { earthMat.bumpMap = tex; earthMat.bumpScale = 0.55; earthMat.needsUpdate = true; },
    undefined,
    () => {}
  );

  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(earthRadius, 96, 96),
    earthMat
  );
  globeGroup.add(earthMesh);

  const atmMat = new THREE.MeshBasicMaterial({
    color: 0x2267EE, transparent: true, opacity: 0.12, side: THREE.BackSide
  });
  globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(earthRadius * 1.025, 64, 64), atmMat));

  const gratMat = new THREE.LineBasicMaterial({ color: 0x2a4a7a, transparent: true, opacity: 0.35 });
  const gratGroup = new THREE.Group();
  globeGroup.add(gratGroup);
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 3) pts.push(latLonToVec3(lat, lon, earthRadius * 1.001));
    gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(latLonToVec3(lat, lon, earthRadius * 1.001));
    gratGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
  }

  function latLonToVec3(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -(radius * Math.sin(phi) * Math.cos(theta)),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  /* Country borders + filled landmasses */
  const bordersGroup = new THREE.Group();
  globeGroup.add(bordersGroup);
  const landGroup = new THREE.Group();
  globeGroup.add(landGroup);

  const borderMat = new THREE.LineBasicMaterial({
    color: 0x9fd0ff, transparent: true, opacity: 0.85, depthWrite: false
  });
  const landMat = new THREE.MeshBasicMaterial({
    color: 0x2b6cb0, transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false
  });

  function buildLandMesh(geojson, radius) {
    const positions = [];
    geojson.features.forEach(f => {
      const g = f.geometry;
      if (!g) return;
      const polys = g.type === 'Polygon' ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(poly => {
        poly.forEach((ring) => {
          if (ring.length < 4) return;
          const pts2 = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
          const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
          if (!tris.length) return;
          tris.forEach(tri => {
            tri.forEach(idx => {
              const [lon, lat] = ring[idx];
              const v = latLonToVec3(lat, lon, radius);
              positions.push(v.x, v.y, v.z);
            });
          });
        });
      });
    });
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, landMat);
  }

  function buildBorderLines(geojson, radius) {
    const positions = [];
    geojson.features.forEach(f => {
      const g = f.geometry;
      if (!g) return;
      const polys = g.type === 'Polygon' ? [g.coordinates]
        : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(poly => {
        poly.forEach(ring => {
          for (let i = 0; i < ring.length - 1; i++) {
            const [lon1, lat1] = ring[i];
            const [lon2, lat2] = ring[i + 1];
            positions.push(latLonToVec3(lat1, lon1, radius * 1.003));
            positions.push(latLonToVec3(lat2, lon2, radius * 1.003));
          }
        });
      });
    });
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry().setFromPoints(positions);
    return new THREE.LineSegments(geo, borderMat);
  }

  const GEOJSON_MIRRORS = [
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson',
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson',
    'https://unpkg.com/world-atlas@2.0.2/countries-110m.json',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
  ];

  function topoToGeo(topo) {
    if (!topo || !topo.objects || !topo.objects.countries) return null;
    const countries = topo.objects.countries;
    const arcs = topo.arcs;
    const transform = topo.transform;
    const scale = transform ? transform.scale : [1, 1];
    const translate = transform ? transform.translate : [0, 0];

    const decodedArcs = arcs.map(arc => {
      let x = 0, y = 0;
      return arc.map(([dx, dy]) => {
        x += dx; y += dy;
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
      });
    });

    function arcToRing(arcIdx) {
      if (arcIdx >= 0) return decodedArcs[arcIdx].slice();
      return decodedArcs[-arcIdx - 1].slice().reverse();
    }
    function ringFromArcs(arcIdxs) {
      const out = [];
      arcIdxs.forEach(idx => {
        const r = arcToRing(idx);
        if (out.length) r.shift();
        out.push(...r);
      });
      return out;
    }

    const features = countries.geometries.map(g => {
      const coords = g.type === 'Polygon'
        ? g.arcs.map(ringFromArcs)
        : g.type === 'MultiPolygon'
          ? g.arcs.map(poly => poly.map(ringFromArcs))
          : null;
      if (!coords) return null;
      return { type: 'Feature', geometry: { type: g.type, coordinates: coords } };
    }).filter(Boolean);

    return { type: 'FeatureCollection', features };
  }

  function loadBorders() {
    let i = 0;
    function tryNext() {
      if (i >= GEOJSON_MIRRORS.length) {
        console.warn('[VIORA] All border CDNs failed.');
        return;
      }
      const url = GEOJSON_MIRRORS[i++];
      fetch(url, { cache: 'force-cache' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(data => {
          let geojson = data;
          if (data.type === 'Topology') geojson = topoToGeo(data);
          if (!geojson || !geojson.features || !geojson.features.length) throw new Error('empty');
          const landMesh = buildLandMesh(geojson, earthRadius * 1.002);
          if (landMesh) landGroup.add(landMesh);
          const borderLines = buildBorderLines(geojson, earthRadius);
          if (borderLines) bordersGroup.add(borderLines);
          console.log('[VIORA] Borders loaded from', url);
        })
        .catch(err => {
          console.warn('[VIORA] Border source failed:', url, err.message);
          tryNext();
        });
    }
    tryNext();
  }
  loadBorders();

  /* ============================================================
     COASTAL CITIES
     ============================================================ */
  const COASTAL_CITIES = [
    { name: 'Mombasa',        lat: -4.04,  lon: 39.67  },
    { name: 'Djibouti',       lat: 11.59,  lon: 43.15  },
    { name: 'Port Sudan',     lat: 19.62,  lon: 37.22  },
    { name: 'Suez',           lat: 29.97,  lon: 32.55  },
    { name: 'Alexandria',     lat: 31.20,  lon: 29.92  },
    { name: 'Mumbai',         lat: 19.08,  lon: 72.88  },
    { name: 'Chennai',        lat: 13.08,  lon: 80.27  },
    { name: 'Kolkata',        lat: 22.57,  lon: 88.36  },
    { name: 'Marseille',      lat: 43.30,  lon: 5.37   },
    { name: 'Genoa',          lat: 44.41,  lon: 8.93   },
    { name: 'Barcelona',      lat: 41.39,  lon: 2.17   },
    { name: 'Lisbon',         lat: 38.72,  lon: -9.14  },
    { name: 'Bilbao',         lat: 43.26,  lon: -2.93  },
    { name: 'London',         lat: 51.51,  lon: -0.13  },
    { name: 'Bude',           lat: 50.83,  lon: -4.54  },
    { name: 'Amsterdam',      lat: 52.37,  lon: 4.90   },
    { name: 'Hamburg',        lat: 53.55,  lon: 9.99   },
    { name: 'Bergen',         lat: 60.39,  lon: 5.32   },
    { name: 'Reykjavik',      lat: 64.15,  lon: -21.94 },
    { name: 'Halifax',        lat: 44.65,  lon: -63.57 },
    { name: 'New York',       lat: 40.71,  lon: -74.01 },
    { name: 'Virginia Beach', lat: 36.85,  lon: -75.98 },
    { name: 'Miami',          lat: 25.76,  lon: -80.19 },
    { name: 'San Juan',       lat: 18.47,  lon: -66.11 },
    { name: 'Bermuda',        lat: 32.30,  lon: -64.78 },
    { name: 'Fortaleza',      lat: -3.73,  lon: -38.53 },
    { name: 'Rio de Janeiro', lat: -22.91, lon: -43.17 },
    { name: 'São Paulo',      lat: -23.55, lon: -46.63 },
    { name: 'Buenos Aires',   lat: -34.60, lon: -58.38 },
    { name: 'Valparaiso',     lat: -33.05, lon: -71.62 },
    { name: 'Callao',         lat: -12.06, lon: -77.15 },
    { name: 'Panama',         lat: 8.98,   lon: -79.52 },
    { name: 'Los Angeles',    lat: 34.05,  lon: -118.24 },
    { name: 'Seattle',        lat: 47.61,  lon: -122.33 },
    { name: 'Vancouver',      lat: 49.28,  lon: -123.12 },
    { name: 'Anchorage',      lat: 61.22,  lon: -149.90 },
    { name: 'Honolulu',       lat: 21.31,  lon: -157.86 },
    { name: 'Tokyo',          lat: 35.68,  lon: 139.69 },
    { name: 'Osaka',          lat: 34.69,  lon: 135.50 },
    { name: 'Seoul',          lat: 37.57,  lon: 126.98 },
    { name: 'Beijing',        lat: 39.90,  lon: 116.40 },
    { name: 'Shanghai',       lat: 31.23,  lon: 121.47 },
    { name: 'Hong Kong',      lat: 22.32,  lon: 114.17 },
    { name: 'Manila',         lat: 14.60,  lon: 120.98 },
    { name: 'Singapore',      lat: 1.35,   lon: 103.82 },
    { name: 'Jakarta',        lat: -6.20,  lon: 106.85 },
    { name: 'Perth',          lat: -31.95, lon: 115.86 },
    { name: 'Sydney',         lat: -33.87, lon: 151.21 },
    { name: 'Melbourne',      lat: -37.81, lon: 144.96 },
    { name: 'Auckland',       lat: -36.85, lon: 174.76 },
    { name: 'Suva',           lat: -18.14, lon: 178.44 },
    { name: 'Dar es Salaam',  lat: -6.79,  lon: 39.21  },
    { name: 'Maputo',         lat: -25.97, lon: 32.57  },
    { name: 'Mtunzini',       lat: -28.95, lon: 31.75  },
    { name: 'Cape Town',      lat: -33.92, lon: 18.42  },
    { name: 'Luanda',         lat: -8.84,  lon: 13.23  },
    { name: 'Lagos',          lat: 6.52,   lon: 3.38   },
    { name: 'Accra',          lat: 5.60,   lon: -0.19  },
    { name: 'Abidjan',        lat: 5.36,   lon: -4.01  },
    { name: 'Dakar',          lat: 14.72,  lon: -17.47 },
    { name: 'Casablanca',     lat: 33.57,  lon: -7.59  },
    { name: 'Dubai',          lat: 25.20,  lon: 55.27  },
    { name: 'Muscat',         lat: 23.59,  lon: 58.41  },
    { name: 'Karachi',        lat: 24.86,  lon: 67.01  },
    { name: 'Colombo',        lat: 6.93,   lon: 79.86  },
    { name: 'Bangkok',        lat: 13.76,  lon: 100.50 },
    { name: 'Ho Chi Minh',    lat: 10.82,  lon: 106.63 }
  ];

  /* ============================================================
     INLAND CITIES — landlocked-adjacent + interior (with extra gaps)
     ============================================================ */
  const INLAND_CITIES = [
    { name: 'Nairobi',      lat: -1.29,  lon: 36.82,  nearest: 'Mombasa' },
    { name: 'Kampala',      lat: 0.32,   lon: 32.58,  nearest: 'Mombasa' },
    { name: 'Kigali',       lat: -1.94,  lon: 30.06,  nearest: 'Dar es Salaam' },
    { name: 'Addis Ababa',  lat: 9.03,   lon: 38.74,  nearest: 'Djibouti' },
    { name: 'Khartoum',     lat: 15.50,  lon: 32.56,  nearest: 'Port Sudan' },
    { name: 'Cairo',        lat: 30.04,  lon: 31.24,  nearest: 'Alexandria' },
    { name: 'Abuja',        lat: 9.06,   lon: 7.49,   nearest: 'Lagos' },
    { name: 'Kinshasa',     lat: -4.44,  lon: 15.27,  nearest: 'Luanda' },
    { name: 'Johannesburg', lat: -26.20, lon: 28.04,  nearest: 'Maputo' },
    { name: 'Harare',       lat: -17.83, lon: 31.05,  nearest: 'Maputo' },
    { name: 'Delhi',        lat: 28.61,  lon: 77.21,  nearest: 'Mumbai' },
    { name: 'Bangalore',    lat: 12.97,  lon: 77.59,  nearest: 'Chennai' },
    { name: 'Tehran',       lat: 35.69,  lon: 51.39,  nearest: 'Dubai' },
    { name: 'Riyadh',       lat: 24.71,  lon: 46.68,  nearest: 'Dubai' },
    { name: 'Istanbul',     lat: 41.01,  lon: 28.98,  nearest: 'Alexandria' },
    { name: 'Moscow',       lat: 55.75,  lon: 37.62,  nearest: 'Hamburg' },
    { name: 'Berlin',       lat: 52.52,  lon: 13.40,  nearest: 'Hamburg' },
    { name: 'Paris',        lat: 48.85,  lon: 2.35,   nearest: 'Barcelona' },
    { name: 'Madrid',       lat: 40.42,  lon: -3.70,  nearest: 'Lisbon' },
    { name: 'Rome',         lat: 41.90,  lon: 12.50,  nearest: 'Genoa' },
    { name: 'Vienna',       lat: 48.21,  lon: 16.37,  nearest: 'Hamburg' },
    { name: 'Stockholm',    lat: 59.33,  lon: 18.07,  nearest: 'Bergen' },
    { name: 'Chicago',      lat: 41.88,  lon: -87.63, nearest: 'New York' },
    { name: 'Toronto',      lat: 43.65,  lon: -79.38, nearest: 'New York' },
    { name: 'Denver',       lat: 39.74,  lon: -104.99,nearest: 'Los Angeles' },
    { name: 'Mexico City',  lat: 19.43,  lon: -99.13, nearest: 'Los Angeles' },
    { name: 'Bogotá',       lat: 4.71,   lon: -74.07, nearest: 'Panama' },
    { name: 'Lima',         lat: -12.05, lon: -77.04, nearest: 'Callao' },
    { name: 'Santiago',     lat: -33.45, lon: -70.67, nearest: 'Valparaiso' },
    { name: 'Brasília',     lat: -15.79, lon: -47.88, nearest: 'Rio de Janeiro' },
    { name: 'Xian',         lat: 34.34,  lon: 108.94, nearest: 'Shanghai' },
    { name: 'Chongqing',    lat: 29.43,  lon: 106.91, nearest: 'Hong Kong' },
    { name: 'Hanoi',        lat: 21.03,  lon: 105.85, nearest: 'Bangkok' },
    { name: 'Kuala Lumpur', lat: 3.14,   lon: 101.69, nearest: 'Singapore' },
    { name: 'Canberra',     lat: -35.28, lon: 149.13, nearest: 'Sydney' },
    { name: 'Alice Springs',lat: -23.70, lon: 133.88, nearest: 'Perth' },
    { name: 'Murmansk',     lat: 68.97,  lon: 33.08,  nearest: 'Bergen' },
    { name: 'Novosibirsk',  lat: 55.01,  lon: 82.93,  nearest: 'Anchorage' },
    { name: 'Yakutsk',      lat: 62.03,  lon: 129.73, nearest: 'Anchorage' },
    { name: 'Vladivostok',  lat: 43.12,  lon: 131.89, nearest: 'Tokyo' },
    { name: 'Nuuk',         lat: 64.18,  lon: -51.72, nearest: 'Reykjavik' },
    { name: 'Yellowknife',  lat: 62.45,  lon: -114.37,nearest: 'Anchorage' },
    { name: 'Edmonton',     lat: 53.55,  lon: -113.49,nearest: 'Vancouver' },
    { name: 'Winnipeg',     lat: 49.90,  lon: -97.14, nearest: 'New York' },
    { name: 'Tripoli',      lat: 32.89,  lon: 13.19,  nearest: 'Genoa' },
    { name: 'Tunis',        lat: 36.80,  lon: 10.18,  nearest: 'Genoa' }
  ];

  /* ============================================================
     LANDLOCKED COUNTRIES — every landlocked country gets a trunk
     ============================================================ */
  const LANDLOCKED_CITIES = [
    /* Africa */
    { name: 'Bamako',       lat: 12.64,  lon: -8.00,  nearest: 'Dakar' },
    { name: 'Ouagadougou',  lat: 12.37,  lon: -1.53,  nearest: 'Accra' },
    { name: 'Niamey',       lat: 13.51,  lon: 2.11,   nearest: 'Lagos' },
    { name: 'NDjamena',     lat: 12.11,  lon: 15.05,  nearest: 'Lagos' },
    { name: 'Bangui',       lat: 4.36,   lon: 18.56,  nearest: 'Luanda' },
    { name: 'Malabo',       lat: 3.75,   lon: 8.78,   nearest: 'Lagos' },
    { name: 'Bujumbura',    lat: -3.38,  lon: 29.36,  nearest: 'Dar es Salaam' },
    { name: 'Juba',         lat: 4.85,   lon: 31.60,  nearest: 'Mombasa' },
    { name: 'Lilongwe',     lat: -13.96, lon: 33.79,  nearest: 'Dar es Salaam' },
    { name: 'Lusaka',       lat: -15.42, lon: 28.28,  nearest: 'Dar es Salaam' },
    { name: 'Gaborone',     lat: -24.65, lon: 25.91,  nearest: 'Cape Town' },
    { name: 'Windhoek',     lat: -22.56, lon: 17.08,  nearest: 'Cape Town' },
    { name: 'Maseru',       lat: -29.31, lon: 27.48,  nearest: 'Cape Town' },
    { name: 'Mbabane',      lat: -26.31, lon: 31.14,  nearest: 'Maputo' },
    { name: 'Asmara',       lat: 15.34,  lon: 38.93,  nearest: 'Port Sudan' },
    { name: 'Kigali-2',     lat: -1.94,  lon: 30.06,  nearest: 'Mombasa' },
    /* Caucasus & Central Asia */
    { name: 'Yerevan',      lat: 40.18,  lon: 44.51,  nearest: 'Marseille' },
    { name: 'Tbilisi',      lat: 41.72,  lon: 44.79,  nearest: 'Marseille' },
    { name: 'Baku',         lat: 40.41,  lon: 49.87,  nearest: 'Marseille' },
    { name: 'Astana',       lat: 51.17,  lon: 71.45,  nearest: 'Karachi' },
    { name: 'Bishkek',      lat: 42.87,  lon: 74.59,  nearest: 'Karachi' },
    { name: 'Dushanbe',     lat: 38.56,  lon: 68.77,  nearest: 'Karachi' },
    { name: 'Tashkent',     lat: 41.30,  lon: 69.24,  nearest: 'Karachi' },
    { name: 'Ashgabat',     lat: 37.95,  lon: 58.38,  nearest: 'Muscat' },
    /* South & East Asia */
    { name: 'Kabul',        lat: 34.55,  lon: 69.17,  nearest: 'Karachi' },
    { name: 'Ulaanbaatar',  lat: 47.88,  lon: 106.88, nearest: 'Beijing' },
    { name: 'Kathmandu',    lat: 27.72,  lon: 85.32,  nearest: 'Kolkata' },
    { name: 'Thimphu',      lat: 27.47,  lon: 89.64,  nearest: 'Kolkata' },
    { name: 'Vientiane',    lat: 17.97,  lon: 102.63, nearest: 'Bangkok' },
    { name: 'Phnom Penh',   lat: 11.55,  lon: 104.93, nearest: 'Ho Chi Minh' },
    { name: 'Naypyidaw',    lat: 19.76,  lon: 96.08,  nearest: 'Bangkok' },
    /* Europe */
    { name: 'Podgorica',    lat: 42.44,  lon: 19.26,  nearest: 'Genoa' },
    { name: 'Sarajevo',     lat: 43.86,  lon: 18.41,  nearest: 'Genoa' },
    { name: 'Belgrade',     lat: 44.79,  lon: 20.45,  nearest: 'Genoa' },
    { name: 'Skopje',       lat: 41.99,  lon: 21.43,  nearest: 'Genoa' },
    { name: 'Pristina',     lat: 42.66,  lon: 21.17,  nearest: 'Genoa' },
    { name: 'Tirana',       lat: 41.33,  lon: 19.83,  nearest: 'Genoa' },
    { name: 'Sofia',        lat: 42.70,  lon: 23.32,  nearest: 'Genoa' },
    { name: 'Bucharest',    lat: 44.43,  lon: 26.10,  nearest: 'Genoa' },
    { name: 'Chisinau',     lat: 47.01,  lon: 28.86,  nearest: 'Genoa' },
    { name: 'Budapest',     lat: 47.50,  lon: 19.04,  nearest: 'Genoa' },
    { name: 'Bratislava',   lat: 48.15,  lon: 17.11,  nearest: 'Hamburg' },
    { name: 'Ljubljana',    lat: 46.06,  lon: 14.51,  nearest: 'Genoa' },
    { name: 'Zagreb',       lat: 45.81,  lon: 15.98,  nearest: 'Genoa' },
    { name: 'Prague',       lat: 50.08,  lon: 14.44,  nearest: 'Hamburg' },
    { name: 'Warsaw',       lat: 52.23,  lon: 21.01,  nearest: 'Hamburg' },
    { name: 'Vilnius',      lat: 54.69,  lon: 25.28,  nearest: 'Hamburg' },
    { name: 'Riga',         lat: 56.95,  lon: 24.11,  nearest: 'Hamburg' },
    { name: 'Tallinn',      lat: 59.44,  lon: 24.75,  nearest: 'Hamburg' },
    { name: 'Minsk',        lat: 53.90,  lon: 27.57,  nearest: 'Hamburg' },
    { name: 'Kyiv',         lat: 50.45,  lon: 30.52,  nearest: 'Hamburg' },
    { name: 'Luxembourg',   lat: 49.61,  lon: 6.13,   nearest: 'Amsterdam' },
    { name: 'Bern',         lat: 46.95,  lon: 7.45,   nearest: 'Genoa' },
    /* South America */
    { name: 'La Paz',       lat: -16.50, lon: -68.15, nearest: 'Callao' },
    { name: 'Asuncion',     lat: -25.26, lon: -57.58, nearest: 'Buenos Aires' },
    { name: 'Brasilia-2',   lat: -15.79, lon: -47.88, nearest: 'Rio de Janeiro' },
    { name: 'Quito',        lat: -0.18,  lon: -78.47, nearest: 'Callao' },
    { name: 'Bogota-2',     lat: 4.71,   lon: -74.07, nearest: 'Panama' }
  ];

  const ALL_CITIES = [...COASTAL_CITIES, ...INLAND_CITIES, ...LANDLOCKED_CITIES];
  const CITY_BY_NAME = {};
  ALL_CITIES.forEach(c => { CITY_BY_NAME[c.name] = c; });

  /* ============================================================
     SUBMARINE CABLES — 66 real routes
     ============================================================ */
  const SUBMARINE_CABLES = [
    /* Africa & Indian Ocean */
    { name: 'SEACOM', color: 0xF59E0B, path: ['Mombasa', 'Djibouti', 'Suez', 'Marseille', 'London'] },
    { name: 'EASSy', color: 0x10B981, path: ['Mtunzini', 'Maputo', 'Dar es Salaam', 'Mombasa', 'Djibouti', 'Port Sudan'] },
    { name: '2Africa-E', color: 0xEC4899, path: ['Mombasa', 'Djibouti', 'Suez', 'Alexandria', 'Barcelona', 'Marseille'] },
    { name: '2Africa-W', color: 0xEC4899, path: ['Cape Town', 'Luanda', 'Lagos', 'Accra', 'Abidjan', 'Dakar', 'Casablanca', 'Marseille'] },
    { name: 'WACS', color: 0x0EA5E9, path: ['London', 'Lisbon', 'Dakar', 'Accra', 'Lagos', 'Luanda', 'Cape Town'] },
    { name: 'SAT-3', color: 0x14B8A6, path: ['Lisbon', 'Dakar', 'Accra', 'Lagos', 'Luanda', 'Cape Town'] },
    { name: 'SAFE', color: 0x8B5CF6, path: ['Mumbai', 'Colombo', 'Maputo', 'Mtunzini', 'Cape Town'] },
    { name: 'MARS', color: 0x6366F1, path: ['Mombasa', 'Dar es Salaam', 'Maputo', 'Mtunzini'] },
    { name: 'LION2', color: 0xEF4444, path: ['Mombasa', 'Dar es Salaam', 'Maputo', 'Mtunzini'] },
    { name: 'METISS', color: 0x23C7D9, path: ['Mombasa', 'Dar es Salaam', 'Maputo', 'Mtunzini'] },
    /* Middle East & Asia */
    { name: 'Aden-Djibouti', color: 0x2267EE, path: ['Djibouti', 'Muscat', 'Karachi', 'Mumbai'] },
    { name: 'FALCON', color: 0x8B5CF6, path: ['Dubai', 'Muscat', 'Karachi', 'Mumbai', 'Chennai'] },
    { name: 'SEA-ME-WE-5', color: 0xEC4899, path: ['Marseille', 'Alexandria', 'Suez', 'Djibouti', 'Muscat', 'Karachi', 'Mumbai', 'Colombo', 'Singapore'] },
    { name: 'SEA-ME-WE-4', color: 0xF59E0B, path: ['Marseille', 'Suez', 'Karachi', 'Mumbai', 'Colombo', 'Singapore'] },
    { name: 'IME-WE', color: 0x10B981, path: ['Mumbai', 'Muscat', 'Dubai', 'Suez', 'Alexandria', 'Marseille'] },
    { name: 'APG', color: 0x0EA5E9, path: ['Singapore', 'Bangkok', 'Hong Kong', 'Shanghai', 'Seoul', 'Tokyo'] },
    { name: 'SJC', color: 0x6366F1, path: ['Singapore', 'Hong Kong', 'Tokyo', 'Los Angeles'] },
    { name: 'JGA', color: 0x14B8A6, path: ['Tokyo', 'Osaka', 'Honolulu', 'Los Angeles'] },
    { name: 'AAG', color: 0xEF4444, path: ['Singapore', 'Bangkok', 'Ho Chi Minh', 'Hong Kong', 'Manila', 'Honolulu', 'Los Angeles'] },
    { name: 'APCN-2', color: 0x23C7D9, path: ['Singapore', 'Hong Kong', 'Shanghai', 'Seoul', 'Tokyo'] },
    { name: 'SJC2', color: 0x8B5CF6, path: ['Singapore', 'Hong Kong', 'Tokyo', 'Los Angeles'] },
    /* Pacific */
    { name: 'Hawaiki', color: 0xEC4899, path: ['Sydney', 'Auckland', 'Suva', 'Honolulu', 'Los Angeles'] },
    { name: 'Southern Cross', color: 0xF59E0B, path: ['Sydney', 'Auckland', 'Suva', 'Honolulu', 'Los Angeles'] },
    { name: 'TGA', color: 0x10B981, path: ['Sydney', 'Auckland'] },
    { name: 'INDIGO-W', color: 0x0EA5E9, path: ['Singapore', 'Jakarta', 'Perth', 'Sydney'] },
    { name: 'INDIGO-C', color: 0x0EA5E9, path: ['Singapore', 'Jakarta', 'Perth'] },
    /* Transatlantic */
    { name: 'MAREA', color: 0x8B5CF6, path: ['Virginia Beach', 'Bilbao'] },
    { name: 'Dunant', color: 0xEC4899, path: ['Virginia Beach', 'Bilbao'] },
    { name: 'TAT-14', color: 0xF59E0B, path: ['New York', 'Bude', 'Amsterdam', 'Hamburg'] },
    { name: 'AC-1', color: 0x10B981, path: ['New York', 'Halifax', 'Bude'] },
    { name: 'AC-2', color: 0x10B981, path: ['New York', 'Halifax', 'Bude'] },
    { name: 'Apollo', color: 0x0EA5E9, path: ['New York', 'Bude'] },
    { name: 'GTT Express', color: 0x6366F1, path: ['New York', 'Bude'] },
    { name: 'Yellow', color: 0xEF4444, path: ['New York', 'Bermuda', 'San Juan'] },
    { name: 'Atlantic Crossing-1', color: 0x23C7D9, path: ['Miami', 'Bermuda', 'Lisbon'] },
    /* Americas */
    { name: 'SAm-1', color: 0x8B5CF6, path: ['Miami', 'San Juan', 'Fortaleza', 'Rio de Janeiro', 'São Paulo', 'Buenos Aires'] },
    { name: 'Seabras-1', color: 0xEC4899, path: ['New York', 'São Paulo'] },
    { name: 'Monet', color: 0xF59E0B, path: ['Miami', 'Fortaleza'] },
    { name: 'SAC', color: 0x10B981, path: ['Miami', 'Panama', 'Callao', 'Valparaiso'] },
    { name: 'Maya-1', color: 0x0EA5E9, path: ['Miami', 'Panama'] },
    { name: 'Arctic Fibre', color: 0x6366F1, path: ['London', 'Reykjavik', 'Anchorage', 'Seattle', 'Vancouver'] },
    /* Additional real cables — Africa */
    { name: 'MainOne', color: 0x10B981, path: ['Lisbon', 'Accra', 'Lagos'] },
    { name: 'GLO-1', color: 0x14B8A6, path: ['London', 'Accra', 'Lagos'] },
    { name: 'ACE', color: 0xF59E0B, path: ['Lisbon', 'Dakar', 'Abidjan', 'Accra', 'Lagos', 'Luanda', 'Cape Town'] },
    { name: 'Equiano', color: 0x6366F1, path: ['Lisbon', 'Accra', 'Lagos', 'Cape Town'] },
    { name: 'SACS', color: 0xEF4444, path: ['Lisbon', 'Luanda'] },
    { name: 'SAIL', color: 0x23C7D9, path: ['Lisbon', 'Dakar', 'Abidjan', 'Accra'] },
    { name: 'Uhuru', color: 0x8B5CF6, path: ['Mombasa', 'Dar es Salaam'] },
    { name: 'DARE', color: 0x2267EE, path: ['Mombasa', 'Dar es Salaam', 'Maputo', 'Mtunzini'] },
    /* Additional real cables — Europe–Asia */
    { name: 'AAE-1', color: 0xEC4899, path: ['Marseille', 'Suez', 'Muscat', 'Mumbai', 'Chennai', 'Colombo', 'Singapore', 'Bangkok', 'Ho Chi Minh', 'Hong Kong'] },
    { name: 'AAC', color: 0x14B8A6, path: ['Marseille', 'Alexandria', 'Suez', 'Muscat', 'Karachi', 'Mumbai', 'Chennai', 'Colombo', 'Singapore'] },
    { name: 'BBG', color: 0xF59E0B, path: ['Mumbai', 'Chennai', 'Colombo', 'Singapore'] },
    { name: 'EIG', color: 0x10B981, path: ['Marseille', 'Alexandria', 'Suez', 'Muscat', 'Mumbai'] },
    /* Additional real cables — Asia–Pacific */
    { name: 'APCN', color: 0x6366F1, path: ['Singapore', 'Hong Kong', 'Tokyo', 'Seoul'] },
    { name: 'EAC-C2C', color: 0x23C7D9, path: ['Singapore', 'Hong Kong', 'Shanghai', 'Seoul', 'Tokyo', 'Osaka'] },
    { name: 'Unity', color: 0xEF4444, path: ['Los Angeles', 'Honolulu', 'Tokyo'] },
    { name: 'FASTER', color: 0x2267EE, path: ['Los Angeles', 'Seattle', 'Tokyo'] },
    { name: 'NCP', color: 0x8B5CF6, path: ['Los Angeles', 'Seattle', 'Tokyo'] },
    { name: 'JUPITER', color: 0xEC4899, path: ['Los Angeles', 'Honolulu', 'Tokyo', 'Osaka'] },
    /* Additional real cables — Atlantic */
    { name: 'Grace Hopper', color: 0x14B8A6, path: ['New York', 'Bude'] },
    { name: 'Amitie', color: 0xF59E0B, path: ['New York', 'Bude'] },
    { name: 'FLAG Atlantic', color: 0x10B981, path: ['New York', 'Bude'] },
    /* Additional real cables — Americas */
    { name: 'GlobeNet', color: 0x6366F1, path: ['New York', 'Bermuda', 'Fortaleza', 'Rio de Janeiro'] },
    { name: 'SAm-1b', color: 0x23C7D9, path: ['San Juan', 'Fortaleza', 'Rio de Janeiro'] },
    { name: 'SAex-1', color: 0xEF4444, path: ['Cape Town', 'Fortaleza'] },
    { name: 'SACS-2', color: 0x8B5CF6, path: ['Lisbon', 'Luanda'] }
  ];

  /* ============================================================
     OVERLAND TRUNKS — inland (cyan) + landlocked (violet)
     ============================================================ */
  const OVERLAND_TRUNKS = [
    ...INLAND_CITIES.map(c => ({ from: c.name, to: c.nearest, color: 0x23C7D9 })),
    ...LANDLOCKED_CITIES.map(c => ({ from: c.name, to: c.nearest, color: 0x7C3AED }))
  ];

  /* ============================================================
     ARC SYSTEM
     ============================================================ */
  const arcGroup = new THREE.Group();
  globeGroup.add(arcGroup);
  const arcs = [];

  function buildWaypointChain(waypointNames) {
    const segments = [];
    for (let i = 0; i < waypointNames.length - 1; i++) {
      const from = CITY_BY_NAME[waypointNames[i]];
      const to = CITY_BY_NAME[waypointNames[i + 1]];
      if (!from || !to) continue;
      const start = latLonToVec3(from.lat, from.lon, earthRadius * 1.005);
      const end = latLonToVec3(to.lat, to.lon, earthRadius * 1.005);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const dist = start.distanceTo(end);
      const lift = 0.18 + Math.min(0.35, dist * 0.0008);
      mid.normalize().multiplyScalar(earthRadius + dist * lift);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      segments.push(curve);
    }
    return segments;
  }

  function makeMultiSegmentArc(waypointNames, color, opts) {
    opts = opts || {};
    const segments = buildWaypointChain(waypointNames);
    if (!segments.length) return null;

    const allPoints = [];
    segments.forEach(seg => {
      const pts = seg.getPoints(30);
      if (allPoints.length) pts.shift();
      allPoints.push(...pts);
    });

    const baseColor = new THREE.Color(color);
    const altColor = new THREE.Color(0xffffff);

    const baseGeo = new THREE.BufferGeometry().setFromPoints(allPoints);
    const baseColors = [];
    for (let i = 0; i < allPoints.length; i++) {
      const t = i / (allPoints.length - 1);
      const c = baseColor.clone().lerp(altColor, Math.sin(t * Math.PI) * 0.35);
      baseColors.push(c.r, c.g, c.b);
    }
    baseGeo.setAttribute('color', new THREE.Float32BufferAttribute(baseColors, 3));
    const baseMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true,
      opacity: opts.mesh ? 0.18 : 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    arcGroup.add(new THREE.Line(baseGeo, baseMat));

    const pulseGeo = new THREE.BufferGeometry();
    const pulsePositions = new Float32Array(allPoints.length * 3);
    const pulseColors = new Float32Array(allPoints.length * 3);
    for (let i = 0; i < allPoints.length; i++) {
      pulsePositions[i*3]   = allPoints[i].x;
      pulsePositions[i*3+1] = allPoints[i].y;
      pulsePositions[i*3+2] = allPoints[i].z;
      pulseColors[i*3]   = baseColor.r;
      pulseColors[i*3+1] = baseColor.g;
      pulseColors[i*3+2] = baseColor.b;
    }
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
    pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseColors, 3));
    const pulseMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true,
      opacity: opts.mesh ? 0.35 : 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pulseLine = new THREE.Line(pulseGeo, pulseMat);
    arcGroup.add(pulseLine);

    const packetCount = opts.mesh ? 1 : 3;
    const packetGeo = new THREE.SphereGeometry(opts.mesh ? 0.8 : 1.4, 8, 8);
    const packets = [];
    for (let p = 0; p < packetCount; p++) {
      const mesh = new THREE.Mesh(packetGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      arcGroup.add(mesh);
      packets.push(mesh);
    }

    const pointCount = allPoints.length;

    return {
      points: allPoints,
      pointCount,
      pulseGeo,
      pulseLine,
      baseColor: baseColor.clone(),
      highlight: altColor.clone(),
      packets,
      speed: (opts.mesh ? 0.015 : 0.03) + Math.random() * 0.02,
      phase: Math.random(),
      packetOffsets: packets.map((_, i) => i / packets.length + Math.random() * 0.2),
      packetSpeed: 0.02 + Math.random() * 0.02,
      isMesh: !!opts.mesh
    };
  }

  /* Build submarine cables */
  SUBMARINE_CABLES.forEach(cable => {
    const arc = makeMultiSegmentArc(cable.path, cable.color, { mesh: false });
    if (arc) arcs.push(arc);
  });

  /* Build overland trunks */
  OVERLAND_TRUNKS.forEach(trunk => {
    const arc = makeMultiSegmentArc([trunk.from, trunk.to], trunk.color, { mesh: false });
    if (arc) arcs.push(arc);
  });

  /* Background mesh — 2 nearest coastal neighbours per coastal city */
  const MESH_CONNECTIONS = (function () {
    const n = COASTAL_CITIES.length;
    const toRad = Math.PI / 180;
    function dist(a, b) {
      const p1 = a.lat * toRad, p2 = b.lat * toRad;
      const dp = (b.lat - a.lat) * toRad;
      const dl = (b.lon - a.lon) * toRad;
      const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
      return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    }
    const edges = [];
    const seen = new Set();
    COASTAL_CITIES.forEach((a, i) => {
      const near = COASTAL_CITIES
        .map((b, j) => ({ j, d: i === j ? Infinity : dist(a, b) }))
        .sort((x, y) => x.d - y.d)
        .slice(0, 2);
      near.forEach(({ j }) => {
        const key = i < j ? i + '-' + j : j + '-' + i;
        if (seen.has(key)) return;
        seen.add(key);
        edges.push([COASTAL_CITIES[i], COASTAL_CITIES[j]]);
      });
    });
    return edges;
  })();

  const meshColors = [0x2267EE, 0x23C7D9, 0x8B5CF6];
  MESH_CONNECTIONS.forEach((pair, i) => {
    const arc = makeMultiSegmentArc(
      [pair[0].name, pair[1].name],
      meshColors[i % meshColors.length],
      { mesh: true }
    );
    if (arc) arcs.push(arc);
  });

  console.log('[VIORA] Loaded',
    SUBMARINE_CABLES.length, 'submarine cables,',
    INLAND_CITIES.length + LANDLOCKED_CITIES.length, 'overland trunks,',
    MESH_CONNECTIONS.length, 'mesh connections,',
    ALL_CITIES.length, 'cities total');

  /* City dots */
  const cityGroup = new THREE.Group();
  globeGroup.add(cityGroup);

  const cityDots = ALL_CITIES.map(city => {
    const pos = latLonToVec3(city.lat, city.lon, earthRadius * 1.008);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0 })
    );
    dot.position.copy(pos);
    cityGroup.add(dot);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x23C7D9, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.position.copy(pos);
    cityGroup.add(halo);

    return { dot, halo };
  });

  function computeSunDirection() {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 86400000);
    const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)) * Math.PI / 180;
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const subsolarLon = (12 - utcHours) * 15 * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(declination) * Math.cos(subsolarLon),
      Math.sin(declination),
      Math.cos(declination) * Math.sin(subsolarLon)
    ).normalize();
  }
  function updateSun() {
    sunLight.position.copy(computeSunDirection().multiplyScalar(320));
  }
  updateSun();
  setInterval(updateSun, 60000);

  /* Interaction */
  let isDragging = false;
  let prevPointer = { x: 0, y: 0 };
  let targetRotX = globeGroup.rotation.x;
  let targetRotY = globeGroup.rotation.y;
  let currentRotX = targetRotX;
  let currentRotY = targetRotY;
  let targetZoom = camera.position.z;
  let currentZoom = targetZoom;

  globeContainer.addEventListener('pointerdown', (e) => {
    isDragging = true;
    prevPointer = { x: e.clientX, y: e.clientY };
    try { globeContainer.setPointerCapture(e.pointerId); } catch (_) {}
    globeContainer.style.cursor = 'grabbing';
  });
  globeContainer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevPointer.x;
    const dy = e.clientY - prevPointer.y;
    targetRotY += dx * 0.005;
    targetRotX += dy * 0.005;
    targetRotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotX));
    prevPointer = { x: e.clientX, y: e.clientY };
  });
  globeContainer.addEventListener('pointerup', () => {
    isDragging = false;
    globeContainer.style.cursor = 'grab';
  });
  globeContainer.addEventListener('pointercancel', () => {
    isDragging = false;
    globeContainer.style.cursor = 'grab';
  });

  globeContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    targetZoom = Math.max(140, Math.min(480, targetZoom + e.deltaY * 0.4));
  }, { passive: false });

  globeContainer.setAttribute('tabindex', '0');
  globeContainer.setAttribute('role', 'img');
  globeContainer.setAttribute('aria-label', 'Interactive 3D globe with submarine cable routes and animated connection arcs.');
  globeContainer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { targetRotY += 0.12; e.preventDefault(); }
    if (e.key === 'ArrowRight') { targetRotY -= 0.12; e.preventDefault(); }
    if (e.key === 'ArrowUp')    { targetRotX = Math.max(-Math.PI/2.2, targetRotX - 0.12); e.preventDefault(); }
    if (e.key === 'ArrowDown')  { targetRotX = Math.min( Math.PI/2.2, targetRotX + 0.12); e.preventDefault(); }
    if (e.key === '+' || e.key === '=') { targetZoom = Math.max(140, targetZoom - 20); e.preventDefault(); }
    if (e.key === '-' || e.key === '_') { targetZoom = Math.min(480, targetZoom + 20); e.preventDefault(); }
  });

  function resizeRenderer() {
    const w = globeContainer.clientWidth;
    const h = globeContainer.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(resizeRenderer).observe(globeContainer);
  } else {
    window.addEventListener('resize', resizeRenderer);
  }
  resizeRenderer();

  const clock = new THREE.Clock();
  let rafId = 0;
  let autoRotate = !prefersReduceG;
  const _pulseColor = new THREE.Color();

  function animate() {
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    if (autoRotate && !isDragging) targetRotY += 0.0012;
    currentRotX += (targetRotX - currentRotX) * 0.08;
    currentRotY += (targetRotY - currentRotY) * 0.08;
    globeGroup.rotation.x = currentRotX;
    globeGroup.rotation.y = currentRotY;
    currentZoom += (targetZoom - currentZoom) * 0.08;
    camera.position.z = currentZoom;

    const zoomProgress = 1 - Math.min(1, Math.max(0, (currentZoom - 140) / 340));
    const cityOpacity = Math.max(0, zoomProgress - 0.25) / 0.75;
    cityDots.forEach((c) => {
      c.dot.material.opacity = cityOpacity * 0.9;
      c.halo.material.opacity = cityOpacity * 0.45;
    });

    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      const phase = (t * a.speed + a.phase) % 1;
      const windowWidth = a.isMesh ? 0.25 : 0.14;
      const colorAttr = a.pulseGeo.attributes.color;
      const n = colorAttr.count;
      for (let k = 0; k < n; k++) {
        const local = k / (n - 1);
        let d = Math.abs(local - phase);
        if (d > 0.5) d = 1 - d;
        const intensity = Math.max(0, 1 - d / windowWidth);
        _pulseColor.copy(a.baseColor).lerp(a.highlight, intensity);
        colorAttr.array[k*3]   = _pulseColor.r;
        colorAttr.array[k*3+1] = _pulseColor.g;
        colorAttr.array[k*3+2] = _pulseColor.b;
      }
      colorAttr.needsUpdate = true;
      a.pulseLine.material.opacity = a.isMesh
        ? (0.25 + 0.15 * Math.sin(phase * Math.PI))
        : (0.55 + 0.45 * Math.sin(phase * Math.PI));

      for (let p = 0; p < a.packets.length; p++) {
        const packet = a.packets[p];
        const local = (t * a.packetSpeed + a.packetOffsets[p]) % 1;
        const ptIdx = Math.min(a.pointCount - 1, Math.floor(local * (a.pointCount - 1)));
        const pt = a.points[ptIdx];
        packet.position.set(pt.x, pt.y, pt.z);
        const fade = Math.sin(local * Math.PI);
        packet.material.opacity = (a.isMesh ? 0.35 : 0.9) * fade + 0.1;
        packet.scale.setScalar(0.5 + fade * 0.9);
        if (!a.isMesh) {
          packet.material.color.setHSL((t * 0.05 + p * 0.33) % 1, 0.85, 0.6);
        }
      }
    }

    renderer.render(scene, camera);
  }

  window.__vioraGlobeState = {
    renderer, camera, scene, globeGroup,
    get autoRotate() { return autoRotate; },
    set autoRotate(v) { autoRotate = !!v; },
    start: function () { if (!rafId) animate(); },
    stop: function () { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
  };

  animate();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.__vioraGlobeState.stop();
    else window.__vioraGlobeState.start();
  });
}

/* ============================================================
   ECOSYSTEM MAP
   ============================================================ */
const ECO_NODES = [
  { name: 'Business', desc: 'Business management modules — ERP, POS, accounting, inventory and sales feeding the core.', color: '#2267EE' },
  { name: 'Marketplace', desc: 'Digital marketplace where products, templates and services are discovered and transacted.', color: '#23C7D9' },
  { name: 'Clients', desc: 'Businesses and organisations that run on VIORA software and stream operational data to core.', color: '#8B5CF6' },
  { name: 'Partners', desc: 'Channel and delivery partners who implement and support VIORA systems worldwide.', color: '#F59E0B' },
  { name: 'Products', desc: 'Products and services offered across the VIORA ecosystem, synced in real time.', color: '#10B981' },
  { name: 'Training', desc: 'VIORA Academy learning, onboarding and user training resources powering adoption.', color: '#EF4444' },
  { name: 'Finance', desc: 'Financial operations — accounting, invoicing and reporting — feeding the core ledger.', color: '#EC4899' },
  { name: 'Analytics', desc: 'Reporting, dashboards and business insight continuously flowing across connected modules.', color: '#6366F1' },
  { name: 'Integrations', desc: 'APIs and connectors linking VIORA systems with external tools and data sources.', color: '#14B8A6' },
  { name: 'Security', desc: 'Identity, access control and compliance data protecting every connection in the ecosystem.', color: '#F97316' }
];

const ecoNodes = $('#ecoNodes');
const ecoLines = $('#ecoLines');
const ecoParticles = $('#ecoParticles');
const ecoInfo = $('#ecoInfo');
const cx = 200, cy = 200, R = 150;
const NUM_NODES = 10;
const positions = ECO_NODES.map((_, i) => {
  const angle = (Math.PI * 2 * i) / NUM_NODES - Math.PI / 2;
  return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
});

if (ecoLines) {
  ecoLines.innerHTML = positions.map((p, i) =>
    `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="eco-line" id="line${i}"/>`
  ).join('');
}

if (ecoParticles) {
  ecoParticles.innerHTML = positions.map((_, i) =>
    `<circle r="3.2" class="eco-particle" id="pt${i}" style="fill:${ECO_NODES[i].color}"/>`
  ).join('');
}

if (ecoNodes) {
  ecoNodes.innerHTML = ECO_NODES.map((n, i) => {
    const p = positions[i];
    return `<g class="eco-node" data-idx="${i}" tabindex="0" role="button" aria-label="${n.name}" style="color:${n.color}">
      <circle cx="${p.x}" cy="${p.y}" r="11" fill="${n.color}" filter="url(#nodeGlow)" opacity="0.95"/>
      <circle cx="${p.x - 3}" cy="${p.y - 4}" r="3.4" fill="rgba(255,255,255,0.7)" filter="url(#nodeGlow)"/>
      <circle cx="${p.x}" cy="${p.y}" r="18" fill="transparent"/>
      <text x="${p.x}" y="${p.y + (p.y < cy ? -22 : 30)}">${n.name}</text>
    </g>`;
  }).join('');
}

function selectEcoNode(i) {
  if (!ecoNodes || !ecoLines || !ecoInfo) return;
  $$('.eco-node', ecoNodes).forEach((el, idx) => el.classList.toggle('active', idx === i));
  $$('.eco-line', ecoLines).forEach((el, idx) => el.classList.toggle('active', idx === i));
  ecoInfo.innerHTML = `<h3 style="color:${ECO_NODES[i].color}">${ECO_NODES[i].name}</h3><p>${ECO_NODES[i].desc}</p>`;
}

if (ecoNodes) {
  $$('.eco-node', ecoNodes).forEach(el => {
    el.addEventListener('click', () => selectEcoNode(Number(el.dataset.idx)));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectEcoNode(Number(el.dataset.idx)); }
    });
  });
}

if (!prefersReduce && ecoParticles && ecoLines) {
  const particleEls = $$('.eco-particle', ecoParticles);
  const speeds = ECO_NODES.map(() => 0.0035 + Math.random() * 0.0035);
  const offsets = ECO_NODES.map(() => Math.random());
  const particleElsOutbound = [];
  positions.forEach((_, i) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '2.8');
    circle.setAttribute('class', 'eco-particle');
    circle.style.fill = ECO_NODES[i].color;
    ecoParticles.appendChild(circle);
    particleElsOutbound.push(circle);
  });
  let t = 0;
  (function tick() {
    t += 1;
    particleEls.forEach((el, i) => {
      const p = positions[i];
      const local = (t * speeds[i] + offsets[i]) % 1;
      const x = p.x + (cx - p.x) * local;
      const y = p.y + (cy - p.y) * local;
      el.setAttribute('cx', x);
      el.setAttribute('cy', y);
      const fade = Math.sin(local * Math.PI);
      el.setAttribute('opacity', String(fade * 0.9 + 0.1));
      el.setAttribute('r', String(2.4 + fade * 1.2));
    });
    particleElsOutbound.forEach((el, i) => {
      const p = positions[i];
      const local = (t * speeds[i] + offsets[i] + 0.5) % 1;
      const x = cx + (p.x - cx) * local;
      const y = cy + (p.y - cy) * local;
      el.setAttribute('cx', x);
      el.setAttribute('cy', y);
      const fade = Math.sin(local * Math.PI);
      el.setAttribute('opacity', String(fade * 0.8 + 0.1));
      el.setAttribute('r', String(2.0 + fade * 1.0));
    });
    requestAnimationFrame(tick);
  })();
}

/* ============================================================
   APP TILE WALL — Modules tab
   ============================================================ */
const APPS = [
  { name: 'Business ERP', cat: 'business', desc: 'Unified operations across sales, stock, finance and people in one connected system.', features: ['Single source of truth', 'Role-based access', 'Cross-module reporting'] },
  { name: 'Point of Sale', cat: 'business', desc: 'Fast in-person selling with real-time stock and till management.', features: ['Multi-till', 'Receipt printing', 'Offline mode'] },
  { name: 'Accounting', cat: 'business', desc: 'Invoicing, expenses, reconciliation and financial reporting.', features: ['Chart of accounts', 'VAT handling', 'Bank reconciliation'] },
  { name: 'Inventory', cat: 'business', desc: 'Track stock across warehouses and locations in real time.', features: ['Multi-location', 'Low-stock alerts', 'Batch tracking'] },
  { name: 'Procurement', cat: 'business', desc: 'Purchase orders, supplier management and receiving.', features: ['Supplier records', 'Purchase orders', 'Goods received'] },
  { name: 'Sales Management', cat: 'business', desc: 'Quotations, orders, deliveries and customer follow-ups.', features: ['Quotations', 'Order tracking', 'Delivery notes'] },
  { name: 'Customer Management', cat: 'business', desc: 'Customer records, interactions and follow-up tasks.', features: ['Contact records', 'Activity log', 'Pipeline'] },
  { name: 'Reporting & Analytics', cat: 'business', desc: 'Dashboards and reports across every module.', features: ['Live dashboards', 'Export', 'Scheduled reports'] },
  { name: 'HR Management', cat: 'people', desc: 'Employee records, contracts and organisational structure.', features: ['Employee profiles', 'Contracts', 'Org chart'] },
  { name: 'Payroll', cat: 'people', desc: 'Salary processing, deductions and payslips.', features: ['Payroll runs', 'Payslips', 'Statutory deductions'] },
  { name: 'Employee Records', cat: 'people', desc: 'Centralised, searchable employee information.', features: ['Documents', 'History', 'Self-service'] },
  { name: 'Attendance', cat: 'people', desc: 'Clock-in, timesheets and attendance tracking.', features: ['Clock-in', 'Timesheets', 'Overtime'] },
  { name: 'Leave Management', cat: 'people', desc: 'Leave requests, approvals and balances.', features: ['Request workflow', 'Balances', 'Calendar'] },
  { name: 'Performance', cat: 'people', desc: 'Goals, reviews and performance tracking.', features: ['Goals', 'Reviews', 'Feedback'] },
  { name: 'E-commerce', cat: 'commerce', desc: 'Sell online with a storefront connected to your stock and orders.', features: ['Product catalogue', 'Checkout', 'Order sync'] },
  { name: 'Online Stores', cat: 'commerce', desc: 'Branded online stores for your products.', features: ['Templates', 'Payments', 'Shipping'] },
  { name: 'Product Management', cat: 'commerce', desc: 'Product info, variants, pricing and imagery.', features: ['Variants', 'Pricing rules', 'Media'] },
  { name: 'Orders', cat: 'commerce', desc: 'Order processing from cart to delivery.', features: ['Order workflow', 'Fulfilment', 'Returns'] },
  { name: 'Delivery Management', cat: 'commerce', desc: 'Dispatch, tracking and delivery confirmation.', features: ['Dispatch', 'Tracking', 'Proof of delivery'] },
  { name: 'Customer Portals', cat: 'commerce', desc: 'Self-service portals for your customers.', features: ['Login', 'Order history', 'Support tickets'] },
  { name: 'Website Development', cat: 'digital', desc: 'Professional, fast websites that work on every device.', features: ['Responsive design', 'CMS', 'SEO-ready'] },
  { name: 'Mobile Applications', cat: 'digital', desc: 'Native and cross-platform mobile apps.', features: ['iOS & Android', 'Push notifications', 'Offline'] },
  { name: 'Custom Software', cat: 'digital', desc: 'Tailored systems built around your exact processes.', features: ['Discovery', 'Design', 'Delivery'] },
  { name: 'API Integrations', cat: 'digital', desc: 'Connect VIORA to the tools you already use.', features: ['REST APIs', 'Webhooks', 'Third-party sync'] },
  { name: 'Automation', cat: 'digital', desc: 'Reduce manual work with automated workflows.', features: ['Triggers', 'Rules', 'Notifications'] },
  { name: 'Branding & Graphics', cat: 'digital', desc: 'Identity, visual systems and marketing assets.', features: ['Brand kit', 'Visual identity', 'Assets'] }
];

const CAT_LABEL = { business: 'Business', people: 'People', commerce: 'Commerce', digital: 'Digital' };
const tileGrid = $('#tileGrid');
let currentFilter = 'all';
let currentSearch = '';

function renderTiles() {
  if (!tileGrid) return;
  const filtered = APPS.filter(a =>
    (currentFilter === 'all' || a.cat === currentFilter) &&
    a.name.toLowerCase().includes(currentSearch.toLowerCase())
  );
  tileGrid.innerHTML = filtered.map(a => `
    <button class="tile" data-idx="${APPS.indexOf(a)}">
      <span class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></span>
      <span class="name">${a.name}</span>
      <span class="cat">${CAT_LABEL[a.cat]}</span>
    </button>
  `).join('') || `<p style="grid-column:1/-1;color:var(--muted);padding:24px 0">No applications match your search.</p>`;

  if (prefersReduce) return;
  $$('.tile', tileGrid).forEach((el, i) => {
    el.style.opacity = 0;
    el.style.transform = 'translateY(8px)';
    el.style.transition = `opacity .35s ${i * 0.025}s, transform .35s ${i * 0.025}s`;
    requestAnimationFrame(() => { el.style.opacity = 1; el.style.transform = 'translateY(0)'; });
  });
}

const panel = $('#detailPanel');
const overlay = $('#overlay');
const detailClose = $('#detailClose');
let panelTrigger = null;

function openPanel() {
  if (!panel || !overlay) return;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  overlay.classList.add('open');
  document.body.classList.add('drawer-open');
  if (detailClose) detailClose.focus();
}
function closePanel() {
  if (!panel || !overlay) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('open');
  document.body.classList.remove('drawer-open');
  if (panelTrigger) panelTrigger.focus();
}
window.__vioraOpenDetail = openPanel;

if (tileGrid) {
  tileGrid.addEventListener('click', e => {
    const btn = e.target.closest('.tile');
    if (!btn) return;
    panelTrigger = btn;
    const app = APPS[Number(btn.dataset.idx)];
    const dt = $('#detailTitle'), dc = $('#detailCat'), dd = $('#detailDesc'), dl = $('#detailList');
    if (dt) dt.textContent = app.name;
    if (dc) dc.textContent = CAT_LABEL[app.cat];
    if (dd) dd.textContent = app.desc;
    if (dl) dl.innerHTML = app.features.map(f => `<li>${f}</li>`).join('');
    openPanel();
  });
}

$$('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    currentFilter = btn.dataset.filter;
    renderTiles();
  });
});

const appSearch = $('#appSearch');
if (appSearch) appSearch.addEventListener('input', e => { currentSearch = e.target.value; renderTiles(); });
const dimSwitch = $('#dimSwitch');
if (dimSwitch) dimSwitch.addEventListener('change', e => { $('#appsWall').classList.toggle('dimmed', e.target.checked); });

window.__vioraRenderTiles = renderTiles;
renderTiles();

if (detailClose) detailClose.addEventListener('click', closePanel);
if (overlay) overlay.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (!panel || !panel.classList.contains('open')) return;
  if (e.key === 'Escape') { closePanel(); return; }
  if (e.key !== 'Tab') return;
  const focusables = panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ============================================================
   INDUSTRIES CAROUSEL
   ============================================================ */
const INDUSTRIES = [
  { name: 'Retail & Wholesale', img: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=70&auto=format&fit=crop' },
  { name: 'Healthcare & Medical', img: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&q=70&auto=format&fit=crop' },
  { name: 'Hospitality & Restaurants', img: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=70&auto=format&fit=crop' },
  { name: 'Manufacturing', img: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=600&q=70&auto=format&fit=crop' },
  { name: 'Agriculture', img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&q=70&auto=format&fit=crop' },
  { name: 'Fashion & Apparel', img: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&q=70&auto=format&fit=crop' },
  { name: 'Transport & Logistics', img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&q=70&auto=format&fit=crop' },
  { name: 'Professional Services', img: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=600&q=70&auto=format&fit=crop' },
  { name: 'Education & Training', img: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&q=70&auto=format&fit=crop' },
  { name: 'Construction & Real Estate', img: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=600&q=70&auto=format&fit=crop' },
  { name: 'Beauty & Wellness', img: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&q=70&auto=format&fit=crop' },
  { name: 'Creative & Media', img: 'https://images.unsplash.com/photo-1522542550221-31fd19575a2d?w=600&q=70&auto=format&fit=crop' },
  { name: 'Law Firms', img: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&q=70&auto=format&fit=crop' },
  { name: 'Jua Kali & Artisans', img: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&q=70&auto=format&fit=crop' },
  { name: 'Banking & Finance', img: 'https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=600&q=70&auto=format&fit=crop' },
  { name: 'Telecommunications', img: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&q=70&auto=format&fit=crop' },
  { name: 'Energy & Utilities', img: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&q=70&auto=format&fit=crop' },
  { name: 'Media & Entertainment', img: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&q=70&auto=format&fit=crop' },
  { name: 'Fitness & Sports', img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=70&auto=format&fit=crop' },
  { name: 'Travel & Tourism', img: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&q=70&auto=format&fit=crop' },
  { name: 'Pharmaceutical', img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=70&auto=format&fit=crop' },
  { name: 'Fisheries & Aquaculture', img: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=70&auto=format&fit=crop' },
  { name: 'Automotive', img: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&q=70&auto=format&fit=crop' },
  { name: 'Mining & Quarrying', img: 'https://images.unsplash.com/photo-1523848309072-c199db53f137?w=600&q=70&auto=format&fit=crop' },
  { name: 'Textiles & Apparel', img: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&q=70&auto=format&fit=crop' },
  { name: 'Food & Beverage', img: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=70&auto=format&fit=crop' },
  { name: 'NGOs & Non-profit', img: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=600&q=70&auto=format&fit=crop' },
  { name: 'Security Services', img: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&q=70&auto=format&fit=crop' },
  { name: 'E-Learning & EdTech', img: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=600&q=70&auto=format&fit=crop' },
  { name: 'Government & Public Sector', img: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&q=70&auto=format&fit=crop' },
  { name: 'Insurance', img: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&q=70&auto=format&fit=crop' },
  { name: 'Architecture & Design', img: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=600&q=70&auto=format&fit=crop' },
  { name: 'Sports & Recreation', img: 'https://images.unsplash.com/photo-1461896836934-bd45ba3d3a5c?w=600&q=70&auto=format&fit=crop' },
  { name: 'Veterinary Services', img: 'https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?w=600&q=70&auto=format&fit=crop' },
  { name: 'Waste Management', img: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&q=70&auto=format&fit=crop' },
  { name: 'Aviation & Aerospace', img: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=600&q=70&auto=format&fit=crop' }
];

const PRODUCTS_CAROUSEL = [
  { name: 'Business Starter Suite', tag: 'Business Software', glyph: 'B', desc: 'Core ERP, sales and accounting modules in one package.' },
  { name: 'Retail Operations Pack', tag: 'Industry System', glyph: 'R', desc: 'POS, inventory and customer records for retail.' },
  { name: 'Company Website Template', tag: 'Template', glyph: 'W', desc: 'A polished, responsive website template for any business.' },
  { name: 'Inventory Automation', tag: 'Digital Tool', glyph: 'I', desc: 'Rules and alerts that keep stock where it needs to be.' },
  { name: 'Payroll Setup Service', tag: 'Business Service', glyph: 'P', desc: 'Guided payroll configuration and first-run support.' },
  { name: 'API Connector Kit', tag: 'Extension', glyph: 'A', desc: 'Extend VIORA systems with connectors to external tools.' }
];

const indTrack = $('#indTrack');
if (indTrack) {
  const indHTML = INDUSTRIES.map(i => `
    <article class="ind-card">
      <img src="${i.img}" alt="${i.name}" loading="lazy" width="300" height="375">
      <div class="overlay-text">
        <h4>${i.name}</h4>
        <p>Purpose-built systems for ${i.name.toLowerCase()} operations.</p>
        <span class="cta">Explore Solution →</span>
      </div>
    </article>
  `).join('');
  indTrack.innerHTML = indHTML + indHTML;
}

const mkTrack = $('#mkTrack');
if (mkTrack) {
  const mkHTML = PRODUCTS_CAROUSEL.map(p => `
    <article class="mk-card">
      <div class="mk-img"><span class="glyph">${p.glyph}</span></div>
      <div class="mk-body">
        <div class="mk-tag">${p.tag}</div>
        <h4>${p.name}</h4>
        <p>${p.desc}</p>
        <a href="market.html" class="mk-cta">View Product →</a>
      </div>
    </article>
  `).join('');
  mkTrack.innerHTML = mkHTML + mkHTML;
}

$$('.carousel-wrap').forEach((wrap) => {
  const track = wrap.querySelector('.carousel-track');
  if (!track) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'carousel-pause';
  btn.setAttribute('aria-label', 'Pause carousel animation');
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  let paused = false;
  btn.addEventListener('click', () => {
    paused = !paused;
    track.style.animationPlayState = paused ? 'paused' : 'running';
    btn.setAttribute('aria-label', paused ? 'Resume carousel animation' : 'Pause carousel animation');
    btn.innerHTML = paused
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  });
  wrap.appendChild(btn);
});

/* ============================================================
   ACADEMY / WHY / HOW
   ============================================================ */
const ACAD = [
  { name: 'Software Onboarding', pct: 72, desc: 'Get your team comfortable from day one.' },
  { name: 'Business System Training', pct: 64, desc: 'Deep dives into each VIORA module.' },
  { name: 'User & Admin Training', pct: 58, desc: 'Roles, permissions and administration.' },
  { name: 'Digital Skills', pct: 44, desc: 'Everyday technology confidence for any team.' }
];
const acadGrid = $('#acadGrid');
if (acadGrid) acadGrid.innerHTML = ACAD.map(a => `
  <div class="acad-card reveal">
    <h4>${a.name}</h4>
    <p>${a.desc}</p>
    <div class="acad-prog"><div data-w="${a.pct}%"></div></div>
  </div>
`).join('');

const WHY = [
  { t: 'Connected solutions', d: 'Systems designed to work with each other.' },
  { t: 'Flexible technology', d: 'Adapt to how your business actually operates.' },
  { t: 'Industry-specific', d: 'Purpose-built for your sector.' },
  { t: 'Scalable', d: 'Start small and grow without rebuilding.' },
  { t: 'Practical implementation', d: 'Real delivery, not theory.' },
  { t: 'Training & support', d: 'Ongoing help after go-live.' },
  { t: 'Custom development', d: 'When off-the-shelf is not enough.' },
  { t: 'Customer-focused', d: 'Every decision starts with your operations.' }
];
const whyGrid = $('#whyGrid');
if (whyGrid) whyGrid.innerHTML = WHY.map(w => `
  <div class="why-card reveal">
    <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg></div>
    <h4>${w.t}</h4>
    <p>${w.d}</p>
  </div>
`).join('');

const HOW = [
  { n: '01', t: 'Discover', d: 'Understand your needs.' },
  { n: '02', t: 'Select', d: 'Choose the right solutions.' },
  { n: '03', t: 'Configure', d: 'Set up to fit your business.' },
  { n: '04', t: 'Implement', d: 'Deploy and onboard.' },
  { n: '05', t: 'Train', d: 'Bring your team up to speed.' },
  { n: '06', t: 'Grow', d: 'Ongoing support and expansion.' }
];
const howGrid = $('#howGrid');
if (howGrid) howGrid.innerHTML = HOW.map(h => `
  <div class="how-step">
    <div class="num">${h.n}</div>
    <h4>${h.t}</h4>
    <p>${h.d}</p>
  </div>
`).join('');

/* ============================================================
   FAQ
   ============================================================ */
const FAQ = [
  { q: 'What is VIORA Ecosystems?', a: 'VIORA Ecosystems is an integrated technology ecosystem that brings together business management software, digital services, commerce and expert support. It is designed so that the systems you use can work together rather than in isolation.' },
  { q: 'What business systems does VIORA provide?', a: 'VIORA provides business management (ERP), point of sale (POS), accounting, inventory, procurement, sales management, customer management, HR and payroll, reporting and analytics — plus digital services such as websites, mobile applications and custom software. See the application catalogue above for detail.' },
  { q: 'Can VIORA develop custom software?', a: 'Yes. When an off-the-shelf system doesn\'t fit your processes, VIORA can design and build custom business systems, websites, web apps, mobile apps, customer portals and API integrations. The process follows a clear discovery → design → build → launch → support timeline.' },
  { q: 'Does VIORA offer monthly subscriptions?', a: 'Yes. Selected VIORA systems are available through monthly and annual subscription arrangements, with the ability to upgrade as your needs change. Visit the <a href="client.html">Subscriptions page</a> for the current details.' },
  { q: 'Can VIORA customise software for my industry?', a: 'Yes. VIORA builds and configures solutions for 35 sectors — from retail, healthcare and hospitality to law firms, Jua Kali artisans, logistics, agriculture, education and more. Each solution is tailored to how that industry actually operates.' },
  { q: 'Does VIORA provide implementation and training?', a: 'Yes. Implementation, onboarding and training are part of the VIORA offering. The VIORA Academy provides software onboarding, user training, administrator training and digital skills development.' },
  { q: 'Can existing systems be integrated?', a: 'In many cases, yes. VIORA provides API integrations and connectors that let its systems work with other tools you already use. The ecosystem map above is a conceptual overview, not a claim that every module is technically integrated today.' },
  { q: 'How can I request a consultation?', a: 'Use the contact form below, email <a href="mailto:support@viora.co.ke">support@viora.co.ke</a>, or <a href="https://wa.me/254713428774" target="_blank" rel="noopener">chat with us on WhatsApp</a> with a short description of your business and what you need.' }
];
const faqList = $('#faqList');
if (faqList) {
  faqList.innerHTML = FAQ.map((f, i) => `
    <div class="faq-item" data-idx="${i}">
      <button class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}">
        <span>${f.q}</span>
        <span class="plus" aria-hidden="true"></span>
      </button>
      <div class="faq-a" id="faq-a-${i}" role="region" aria-hidden="true">
        <div class="faq-a-inner">${f.a}</div>
      </div>
    </div>
  `).join('');
}

$$('.faq-item').forEach(item => {
  const btn = item.querySelector('.faq-q');
  const panelEl = item.querySelector('.faq-a');
  if (!btn || !panelEl) return;
  btn.addEventListener('click', () => {
    const open = item.classList.contains('open');
    $$('.faq-item').forEach(i => {
      i.classList.remove('open');
      const q = i.querySelector('.faq-q');
      const a = i.querySelector('.faq-a');
      if (q) q.setAttribute('aria-expanded', 'false');
      if (a) { a.style.maxHeight = null; a.setAttribute('aria-hidden', 'true'); }
    });
    if (!open) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      panelEl.style.maxHeight = panelEl.scrollHeight + 'px';
      panelEl.setAttribute('aria-hidden', 'false');
    }
  });
});

/* ============================================================
   REVEAL / COUNTERS / TIMELINE
   ============================================================ */
const io = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal, .how-step').forEach(el => io.observe(el));

const fillIO = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    if (el.dataset.w) el.style.width = el.dataset.w;
    if (el.dataset.count) animateCount(el);
    fillIO.unobserve(el);
  });
}, { threshold: 0.4 });
$$('.progress-fill, .acad-prog div, [data-count]').forEach(el => fillIO.observe(el));

function animateCount(el) {
  const end = Number(el.dataset.count);
  const prefix = el.dataset.prefix || '';
  const dur = prefersReduce ? 0 : 1400;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur || 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(end * eased).toLocaleString('en-KE');
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const timeline = $('#timeline');
const timelineFill = $('#timelineFill');
const tlSteps = timeline ? $$('.tl-step', timeline) : [];
let tlStarted = false;
if (timeline && tlSteps.length) {
  const tlIO = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !tlStarted) {
        tlStarted = true;
        if (!prefersReduce) {
          tlSteps.forEach((s, i) => setTimeout(() => {
            s.classList.add('done');
            timelineFill.style.width = `${(i / (tlSteps.length - 1)) * 100}%`;
          }, i * 250));
        } else {
          tlSteps.forEach(s => s.classList.add('done'));
          timelineFill.style.width = '100%';
        }
        tlIO.disconnect();
      }
    });
  }, { threshold: 0.3 });
  tlIO.observe(timeline);
}

/* ============================================================
   BACK TO TOP / FORM / SMOOTH SCROLL
   ============================================================ */
const backToTop = $('#backToTop');
if (backToTop) {
  window.addEventListener('scroll', () => {
    backToTop.classList.toggle('show', window.scrollY > 500);
  }, { passive: true });
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReduce ? 'auto' : 'smooth' });
  });
}

const form = $('#contactForm');
const status = $('#formStatus');
const FIELD_RULES = {
  'f-name': v => v.trim().length >= 2,
  'f-email': v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  'f-solution': v => v.trim() !== '',
  'f-desc': v => v.trim().length >= 10
};
function setStatus(kind, msg) {
  if (!status) return;
  status.className = 'form-status show ' + kind;
  status.innerHTML = msg;
}
function validateField(id) {
  const el = document.getElementById(id);
  if (!el || !FIELD_RULES[id]) return true;
  const ok = FIELD_RULES[id](el.value);
  const field = el.closest('.field');
  if (field) field.classList.toggle('invalid', !ok);
  el.setAttribute('aria-invalid', String(!ok));
  return ok;
}
['f-name', 'f-email', 'f-solution', 'f-desc'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', () => validateField(id));
  el.addEventListener('input', () => {
    const field = el.closest('.field');
    if (field && field.classList.contains('invalid')) validateField(id);
  });
});
if (form) {
  form.addEventListener('submit', e => {
    e.preventDefault();
    $$('.field', form).forEach(f => {
      f.classList.remove('invalid');
      const input = f.querySelector('input, select, textarea');
      if (input) input.setAttribute('aria-invalid', 'false');
    });
    let allOk = true;
    Object.keys(FIELD_RULES).forEach(id => { if (!validateField(id)) allOk = false; });
    if (!allOk) {
      setStatus('err', 'Please correct the highlighted fields and try again.');
      const firstInvalid = $('.field.invalid input, .field.invalid select, .field.invalid textarea', form);
      if (firstInvalid) firstInvalid.focus();
      return;
    }
    setStatus('warn', 'Your details look good — but this form is not yet connected to a mailbox, so nothing has been sent. Please email <a href="mailto:support@viora.co.ke">support@viora.co.ke</a> or <a href="https://wa.me/254713428774" target="_blank" rel="noopener">chat on WhatsApp</a>.');
    if (status) status.scrollIntoView({ behavior: prefersReduce ? 'auto' : 'smooth', block: 'center' });
  });
}

$$('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top, behavior: prefersReduce ? 'auto' : 'smooth' });
  });
});

const yrEl = $('#yr');
if (yrEl) yrEl.textContent = new Date().getFullYear();

/* ============================================================
   COOKIE BANNER
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'viora_cookie_consent_v1';
  var banner = document.getElementById('vioraCookieBanner');
  var settings = document.getElementById('vioraCookieSettings');
  var settingsLink = document.getElementById('vioraCookieSettingsLink');
  var formEl = document.getElementById('vcsForm');
  if (!banner || !settings || !formEl) return;

  function loadConsent() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function saveConsent(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function applyConsent(c) {
    if (c && c.analytics === true && !window.__vioraGaLoaded) {
      window.__vioraGaLoaded = true;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX';
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', 'G-XXXXXXXXXX', { anonymize_ip: true });
    }
    window.dispatchEvent(new CustomEvent('viora:consent', { detail: c }));
  }
  function showBanner() { banner.hidden = false; }
  function hideBanner() { banner.hidden = true; if (settingsLink) settingsLink.hidden = false; }
  function openSettings() {
    var c = loadConsent() || {};
    formEl.querySelector('[name="analytics"]').checked = !!c.analytics;
    formEl.querySelector('[name="functional"]').checked = !!c.functional;
    settings.hidden = false;
    settings.querySelector('input[name="analytics"]').focus();
  }
  function closeSettings() { settings.hidden = true; }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-vcb]');
    if (t) {
      var action = t.getAttribute('data-vcb');
      if (action === 'accept') {
        var c = { essential: true, analytics: true, functional: true, ts: Date.now() };
        saveConsent(c); applyConsent(c); hideBanner();
      } else if (action === 'reject') {
        var c2 = { essential: true, analytics: false, functional: false, ts: Date.now() };
        saveConsent(c2); applyConsent(c2); hideBanner();
      } else if (action === 'settings') {
        openSettings();
      }
    }
    if (e.target.closest('[data-vcs-close]') || e.target === settings) closeSettings();
    if (e.target === settingsLink) { e.preventDefault(); openSettings(); }
  });

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    var c = {
      essential: true,
      analytics: formEl.querySelector('[name="analytics"]').checked,
      functional: formEl.querySelector('[name="functional"]').checked,
      ts: Date.now()
    };
    saveConsent(c); applyConsent(c); closeSettings(); hideBanner();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !settings.hidden) closeSettings();
  });

  var existing = loadConsent();
  if (!existing) showBanner();
  else { applyConsent(existing); if (settingsLink) settingsLink.hidden = false; }
})();

/* ============================================================
   AI ASSISTANT
   ============================================================ */
(function () {
  const fab = document.getElementById('aiFab');
  const aiPanel = document.getElementById('aiPanel');
  const closeBtn = document.getElementById('aiClose');
  const body = document.getElementById('aiBody');
  const aiForm = document.getElementById('aiForm');
  const input = document.getElementById('aiInput');
  const chips = document.getElementById('aiChips');
  if (!fab || !aiPanel || !body || !aiForm || !input) return;

  const KB = [
    { keys: ['what', 'viora', 'about', 'who', 'do'], answer: 'VIORA Ecosystems is an integrated technology ecosystem that brings together <strong>business software</strong> (ERP, POS, accounting, inventory), <strong>digital services</strong> (websites, apps, custom software), <strong>commerce</strong> and <strong>expert support</strong> — so your systems work together instead of in isolation.' },
    { keys: ['price', 'pricing', 'cost', 'how much', 'plan'], answer: 'We have three plans: <strong>Starter</strong> (blue — for small teams), <strong>Growth</strong> (teal — most popular, for growing businesses) and <strong>Enterprise</strong> (purple — custom, multi-location). Final pricing is scoped per deployment. <a href="#pricing">See pricing →</a> or <a href="contact_us.html">book a demo</a>.' },
    { keys: ['industry', 'industries', 'sector', 'sectors'], answer: 'We serve <strong>35 industries</strong> — from retail, healthcare, hospitality and logistics to law firms, Jua Kali artisans, agriculture, education, insurance, architecture and more. <a href="#industries">Explore industries →</a>' },
    { keys: ['demo', 'book', 'consult', 'talk', 'contact', 'call'], answer: 'Happy to help you get started. You can <a href="contact_us.html">book a demo</a>, email <a href="mailto:support@viora.co.ke">support@viora.co.ke</a>, or <a href="https://wa.me/254713428774" target="_blank" rel="noopener">chat on WhatsApp</a>.' },
    { keys: ['app', 'apps', 'software', 'module', 'modules', 'erp', 'pos'], answer: 'The VIORA ecosystem includes Business ERP, Point of Sale, Accounting, Inventory, Procurement, Sales, CRM, Reporting, HR, Payroll, Attendance, E-commerce, Customer Portals, Websites, Mobile Apps, Custom Software, API integrations and Automation. <a href="#apps">See the full catalogue →</a>' },
    { keys: ['subscription', 'subscribe', 'monthly', 'annual'], answer: 'Selected VIORA systems are available on <strong>monthly</strong> or <strong>annual</strong> subscriptions, and you can upgrade anytime as you grow. <a href="#subscriptions">Learn about subscriptions →</a>' },
    { keys: ['custom', 'build', 'develop', 'development', 'bespoke'], answer: 'Yes — when off-the-shelf isn\'t the right fit, we build custom business systems, websites, web apps, mobile apps, customer portals and API integrations. <a href="#development">See our process →</a>' },
    { keys: ['training', 'academy', 'learn', 'onboard'], answer: 'VIORA Academy provides software onboarding, business system training, user & admin training and digital skills. <a href="#academy">Explore the Academy →</a>' },
    { keys: ['support', 'help', 'issue', 'problem'], answer: 'For support, email <a href="mailto:support@viora.co.ke">support@viora.co.ke</a> or <a href="https://wa.me/254713428774" target="_blank" rel="noopener">chat on WhatsApp</a>. We\'re available Mon–Fri, 8:00–18:00 EAT, online worldwide.' },
    { keys: ['where', 'location', 'global', 'country', 'nairobi', 'kenya'], answer: 'We\'re founded in Kenya (2022) and serve clients <strong>online worldwide</strong> — with active connections across Africa, Europe, the Middle East, Asia, Oceania and the Americas. <a href="#hero">See our global reach →</a>' },
    { keys: ['integrate', 'integration', 'api', 'connect'], answer: 'Yes — VIORA provides API integrations and connectors so its systems work with the tools you already use. <a href="#apps">See integration modules →</a>' },
    { keys: ['payment', 'pay', 'mpesa', 'm-pesa'], answer: 'Plans are billed in KES (or USD equivalent), excluding VAT. For payment options, <a href="contact_us.html">talk to our team</a>.' },
    { keys: ['bundle', 'bundles', 'package', 'packages', 'combo'], answer: 'We offer <strong>6 ready-made bundles</strong> — Retail Starter, Clinic Suite, Logistics Kit, Jua Kali Starter, Farm Suite, Professional Kit. Each is a curated set of modules. You can customise any bundle or build your own. <a href="#apps">See bundles →</a>' }
  ];

  function findAnswer(text) {
    const q = text.toLowerCase();
    let best = null, bestScore = 0;
    KB.forEach(entry => {
      let score = 0;
      entry.keys.forEach(k => { if (q.includes(k)) score += k.length; });
      if (score > bestScore) { bestScore = score; best = entry; }
    });
    if (best) return best.answer;
    return 'I\'m not sure I caught that one. Try asking about <strong>pricing</strong>, <strong>apps</strong>, <strong>industries</strong>, <strong>subscriptions</strong>, <strong>custom development</strong> or <strong>training</strong> — or <a href="contact_us.html">talk to our team</a>.';
  }

  function addMsg(html, who) {
    const el = document.createElement('div');
    el.className = 'ai-msg ' + who;
    el.innerHTML = html;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }
  function showTyping() {
    const el = document.createElement('div');
    el.className = 'ai-msg bot';
    el.innerHTML = '<span class="ai-typing"><span></span><span></span><span></span></span>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }
  function respond(text) {
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    addMsg(safe, 'user');
    const typing = showTyping();
    const delay = 500 + Math.min(900, text.length * 8);
    setTimeout(() => { typing.remove(); addMsg(findAnswer(text), 'bot'); }, delay);
  }
  function openPanel() {
    aiPanel.classList.add('open');
    aiPanel.setAttribute('aria-hidden', 'false');
    fab.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 250);
  }
  function closePanel() {
    aiPanel.classList.remove('open');
    aiPanel.setAttribute('aria-hidden', 'true');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', () => { aiPanel.classList.contains('open') ? closePanel() : openPanel(); });
  closeBtn.addEventListener('click', closePanel);
  aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    respond(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiForm.requestSubmit(); }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-chip');
    if (!chip) return;
    respond(chip.textContent);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aiPanel.classList.contains('open')) closePanel();
  });
})();

/* ============================================================
   APPLICATIONS TAB CONTROLLER
   ============================================================ */
(function () {
  const tabs = document.querySelectorAll('.app-tab');
  const panels = document.querySelectorAll('.app-panel');
  if (!tabs.length || !panels.length) return;

  function activate(tabEl) {
    tabs.forEach(t => {
      const isActive = t === tabEl;
      t.setAttribute('aria-selected', String(isActive));
      t.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    panels.forEach(p => {
      p.hidden = p.id !== tabEl.getAttribute('aria-controls');
    });
    if (tabEl.id === 'tabModules') {
      const grid = document.getElementById('tileGrid');
      if (grid && grid.children.length === 0 && typeof window.__vioraRenderTiles === 'function') {
        window.__vioraRenderTiles();
      }
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (e) => {
      const idx = [...tabs].indexOf(tab);
      let next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        tabs[next].focus();
        activate(tabs[next]);
      }
    });
  });

  const hash = window.location.hash;
  if (hash === '#applications-products') activate(document.getElementById('tabProducts'));
  else if (hash === '#applications-bundles') activate(document.getElementById('tabBundles'));
  else if (hash === '#applications-custom') activate(document.getElementById('tabCustom'));
})();

/* ============================================================
   PRODUCTS TAB
   ============================================================ */
const PRODUCT_CATEGORIES = [
  'Industry Specific Production Systems', 'Business Management Systems', 'Professional Practice Systems',
  'Retail & Wholesale Systems', '3D Websites', 'Hardware Systems', 'Digital Commerce Systems', 'Games',
  'Clubs & Entertainment Systems', 'Membership & NGO Operations Systems', 'Fashion & Apparel Systems',
  'Salon, Spa & Beauty Systems', 'Clinic Systems', 'Security Company Systems', 'Travel Agency & Tour Systems',
  'Funeral Home Systems', 'Pharmacy Systems', 'Hospital Systems', 'Farm Systems', 'Entertainment Websites',
  'Cleaning Operations Systems', 'Greenhouse Systems', 'Hotel & Guest House Systems',
  'Restaurant & Catering Systems', 'Photography Studio Systems', 'Event Planning Systems', 'School Systems',
  'Recruitment Agency Systems', 'Real Estate Agency Systems', 'Retail Property Systems',
  'Construction Project Systems', 'Garage & Automotive Service Systems', 'Transport & Fleet Systems',
  'Gym & Fitness Center Systems', 'Laundry & Dry Cleaning Systems', 'Veterinary Practice Systems',
  'Printing & Graphics Production Systems', 'Android Applications', 'A.I Assistant', 'Personal Profile',
  'Video Advertisements', 'Graphics Design', 'AI & Automation', 'General Websites', 'Ecommerce Website'
];

const FEATURED_PRODUCTS = [
  { id: 'ai-assistant', name: 'AI Business Assistant', category: 'A.I Assistant', glyph: 'AI', tagline: 'Answers customer questions 24/7, routes leads, and learns your business.', desc: 'A conversational assistant trained on your products, policies and pricing — deployable on your website, WhatsApp or in-app. Handles enquiries, books appointments, and hands off to a human when needed.', meta: { deploy: '2–3 weeks', delivered: '12 deployments' }, badge: 'Popular' },
  { id: '3d-website', name: '3D Interactive Website', category: '3D Websites', glyph: '3D', tagline: 'An immersive, WebGL-powered site that turns your product into an experience.', desc: 'Real-time 3D product viewers, interactive showrooms and scroll-driven scenes. Runs fast on mobile, works offline-first, and integrates with your existing checkout.', meta: { deploy: '3–5 weeks', delivered: '6 live sites' }, badge: 'New' },
  { id: 'ecommerce', name: 'E-commerce Website', category: 'Ecommerce Website', glyph: 'EC', tagline: 'A complete online store connected to your inventory and payments.', desc: 'Product catalogue, cart, checkout, order tracking, delivery integration and stock sync with your back-office — built on your existing modules so there is one source of truth.', meta: { deploy: '2–4 weeks', delivered: '20+ stores' }, badge: 'Featured' },
  { id: 'hospital-system', name: 'Hospital System', category: 'Hospital Systems', glyph: 'HS', tagline: 'Patient records, appointments, billing and pharmacy in one hospital-grade system.', desc: 'Full patient journey from reception to discharge — records, appointments, lab orders, pharmacy stock, insurance billing and clinical reporting. Role-based access and audit trails built in.', meta: { deploy: '6–10 weeks', delivered: '3 hospitals' }, badge: 'Industry' },
  { id: 'school-system', name: 'School System', category: 'School Systems', glyph: 'SC', tagline: 'Admissions, fees, attendance, exams and parent portals — for schools of any size.', desc: 'Manage students, staff, fees, timetables and results from one place. Parents get a self-service portal, staff get role-based dashboards, and management gets real-time reporting.', meta: { deploy: '4–6 weeks', delivered: '8 schools' }, badge: 'Industry' },
  { id: 'salon-system', name: 'Salon, Spa & Beauty System', category: 'Salon, Spa & Beauty Systems', glyph: 'SB', tagline: 'Bookings, staff rota, client history and retail in a system built for the chair.', desc: 'Appointment booking with reminders, staff commission tracking, service history per client, product retail and a simple till — all in one screen your team can learn in a morning.', meta: { deploy: '2 weeks', delivered: '15 salons' }, badge: 'Industry' }
];

function buildPlaceholderForCategory(category) {
  return {
    id: 'ph-' + category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: category.replace(/ Systems?$/, ''),
    category,
    glyph: category.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(),
    tagline: 'A purpose-built system for this category.',
    desc: 'Delivered as a standalone product or built on top of VIORA modules. Contact us for a scoped quote and a live demo.',
    meta: { deploy: 'Scoped', delivered: 'In catalogue' },
    badge: null,
    placeholder: true
  };
}

(function initProductsTab() {
  const filtersEl = document.getElementById('prodFilters');
  const featuredEl = document.getElementById('prodFeatured');
  const allEl = document.getElementById('prodAll');
  const seeAllBtn = document.getElementById('prodSeeAll');
  const emptyEl = document.getElementById('prodEmpty');
  const resetBtn = document.getElementById('prodResetFilter');
  if (!filtersEl || !featuredEl) return;

  let activeCategory = 'All';
  let showAll = false;

  filtersEl.innerHTML = ['All', ...PRODUCT_CATEGORIES].map(cat =>
    `<button class="prod-chip" type="button" data-cat="${cat.replace(/"/g, '&quot;')}" aria-pressed="${cat === 'All' ? 'true' : 'false'}">${cat}</button>`
  ).join('');

  const PLACEHOLDER_PRODUCTS = PRODUCT_CATEGORIES
    .filter(cat => !FEATURED_PRODUCTS.some(p => p.category === cat))
    .map(buildPlaceholderForCategory);

  const ALL_PRODUCTS = [...FEATURED_PRODUCTS, ...PLACEHOLDER_PRODUCTS];

  function cardTemplate(p, featured) {
    const badge = p.badge ? `<span class="prod-thumb-badge">${p.badge}</span>` : '';
    const desc = p.desc || p.tagline;
    const meta = p.meta || {};
    return `
      <article class="prod-card ${featured ? 'prod-card--feature' : ''}" data-cat="${p.category.replace(/"/g, '&quot;')}">
        <div class="prod-thumb">
          ${badge}
          <span class="prod-thumb-glyph">${p.glyph}</span>
        </div>
        <div class="prod-body">
          <span class="prod-cat">${p.category}</span>
          <h4 class="prod-name">${p.name}</h4>
          <p class="prod-desc">${desc}</p>
          <div class="prod-meta">
            <span><strong>Deploy:</strong> ${meta.deploy || '—'}</span>
            <span><strong>Track record:</strong> ${meta.delivered || '—'}</span>
          </div>
          <div class="prod-actions">
            <a href="contact_us.html" class="btn btn-primary">Book a demo</a>
            <a href="market.html" class="btn btn-ghost">Learn more</a>
          </div>
        </div>
      </article>
    `;
  }

  function render() {
    const featured = activeCategory === 'All'
      ? FEATURED_PRODUCTS
      : FEATURED_PRODUCTS.filter(p => p.category === activeCategory);

    const all = activeCategory === 'All'
      ? ALL_PRODUCTS
      : ALL_PRODUCTS.filter(p => p.category === activeCategory);

    featuredEl.innerHTML = featured.length
      ? featured.map(p => cardTemplate(p, true)).join('')
      : '';

    const shouldShowAll = showAll || activeCategory !== 'All';
    allEl.hidden = !shouldShowAll;
    if (shouldShowAll) {
      const featuredIds = new Set(featured.map(p => p.id));
      const remaining = (showAll && activeCategory === 'All')
        ? all.filter(p => !featuredIds.has(p.id))
        : all;
      allEl.innerHTML = remaining.length
        ? remaining.map(p => cardTemplate(p, false)).join('')
        : '';
    }

    const totalShown = featured.length + (shouldShowAll ? allEl.querySelectorAll('.prod-card').length : 0);
    emptyEl.hidden = totalShown > 0;

    seeAllBtn.parentElement.hidden = activeCategory !== 'All' || showAll;
    seeAllBtn.textContent = showAll ? 'Show featured only →' : 'View all 46 categories →';

    filtersEl.querySelectorAll('.prod-chip').forEach(chip => {
      chip.setAttribute('aria-pressed', String(chip.dataset.cat === activeCategory));
    });
  }

  filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.prod-chip');
    if (!chip) return;
    activeCategory = chip.dataset.cat;
    showAll = false;
    render();
  });

  seeAllBtn.addEventListener('click', () => {
    showAll = !showAll;
    render();
    if (!showAll) {
      filtersEl.scrollIntoView({ behavior: prefersReduce ? 'auto' : 'smooth', block: 'start' });
    }
  });

  resetBtn.addEventListener('click', () => {
    activeCategory = 'All';
    showAll = false;
    render();
  });

  render();
})();

/* ============================================================
   BUNDLES
   ============================================================ */
const BUNDLES = [
  { id: 'retail-starter', name: 'Retail Starter', glyph: 'RS', who: 'For shops that sell in person and online — a complete retail stack from till to stock to books.', industry: 'Retail', modules: ['Point of Sale', 'Inventory', 'Accounting', 'E-commerce'], deploy: '2–3 weeks', priceNote: 'KSh —/mo' },
  { id: 'clinic-suite', name: 'Clinic Suite', glyph: 'CS', who: 'For clinics that manage patients and staff — patient records, payroll, attendance and billing in one.', industry: 'Healthcare', modules: ['HR Management', 'Payroll', 'Attendance', 'Customer Management', 'Reporting & Analytics'], deploy: '3–4 weeks', priceNote: 'KSh —/mo' },
  { id: 'logistics-kit', name: 'Logistics Kit', glyph: 'LK', who: 'For delivery teams that manage orders, dispatch and customer updates across locations.', industry: 'Logistics', modules: ['Orders', 'Delivery Management', 'Customer Portals', 'Reporting & Analytics'], deploy: '2–3 weeks', priceNote: 'KSh —/mo' },
  { id: 'jua-kali-starter', name: 'Jua Kali Starter', glyph: 'JK', who: 'For artisan workshops and small manufacturers — simple till, orders and books that grow with you.', industry: 'Jua Kali', modules: ['Point of Sale', 'Orders', 'Customer Management', 'Accounting'], deploy: '1–2 weeks', priceNote: 'KSh —/mo' },
  { id: 'farm-suite', name: 'Farm Suite', glyph: 'FS', who: 'For farms and co-ops — track stock, customers, sales and produce reports that keep operations honest.', industry: 'Agriculture', modules: ['Inventory', 'Customer Management', 'Sales Management', 'Reporting & Analytics'], deploy: '2–3 weeks', priceNote: 'KSh —/mo' },
  { id: 'professional-kit', name: 'Professional Kit', glyph: 'PK', who: 'For service firms and consultancies — clients, sales, invoicing and reports, joined up.', industry: 'Professional Services', modules: ['Customer Management', 'Sales Management', 'Accounting', 'Reporting & Analytics'], deploy: '2 weeks', priceNote: 'KSh —/mo' }
];

const BUNDLE_INDUSTRIES = ['All', ...new Set(BUNDLES.map(b => b.industry))];

const MODULE_BASE_PRICE = {
  'Business ERP': 3500, 'Point of Sale': 1500, 'Accounting': 1800, 'Inventory': 1800, 'Procurement': 1500,
  'Sales Management': 1500, 'Customer Management': 1200, 'Reporting & Analytics': 1500, 'HR Management': 1800,
  'Payroll': 2000, 'Employee Records': 900, 'Attendance': 900, 'Leave Management': 900, 'Performance': 900,
  'E-commerce': 2000, 'Online Stores': 1800, 'Product Management': 1200, 'Orders': 1500,
  'Delivery Management': 1500, 'Customer Portals': 1500, 'Website Development': 2200, 'Mobile Applications': 3200,
  'Custom Software': 5000, 'API Integrations': 1800, 'Automation': 1500, 'Branding & Graphics': 900
};

(function initBundlesTab() {
  const filtersEl = document.getElementById('bundleFilters');
  const gridEl = document.getElementById('bundleGrid');
  const wizardOpen = document.getElementById('bundleWizardOpen');
  if (!filtersEl || !gridEl) return;

  let activeIndustry = 'All';

  filtersEl.innerHTML = BUNDLE_INDUSTRIES.map(ind =>
    `<button class="bundle-chip" type="button" data-ind="${ind}" aria-pressed="${ind === 'All' ? 'true' : 'false'}">${ind}</button>`
  ).join('');

  function render() {
    const filtered = activeIndustry === 'All'
      ? BUNDLES
      : BUNDLES.filter(b => b.industry === activeIndustry);

    gridEl.innerHTML = filtered.length ? filtered.map(b => {
      const modChips = b.modules.map(m => `<span class="bundle-mod-chip">${m}</span>`).join('');
      return `
        <article class="bundle-card" data-bundle-id="${b.id}">
          <div class="bundle-thumb"><span class="bundle-thumb-glyph">${b.glyph}</span></div>
          <div class="bundle-body">
            <h4 class="bundle-name">${b.name}</h4>
            <p class="bundle-who">${b.who}</p>
            <div class="bundle-includes">${modChips}</div>
            <div class="bundle-meta">
              <div class="bundle-meta-row"><span>Modules included</span><strong>${b.modules.length}</strong></div>
              <div class="bundle-meta-row"><span>Deploy</span><strong>${b.deploy}</strong></div>
              <div class="bundle-meta-row"><span>Starting from</span><strong>${b.priceNote}</strong></div>
            </div>
            <div class="bundle-actions">
              <button type="button" class="btn btn-ghost" data-bundle-explore="${b.id}">Explore</button>
              <button type="button" class="btn btn-primary" data-bundle-customise="${b.id}">+ Customise</button>
            </div>
          </div>
        </article>
      `;
    }).join('') : '<p style="grid-column:1/-1;color:var(--muted);padding:32px 0;text-align:center">No bundles match that industry yet.</p>';

    filtersEl.querySelectorAll('.bundle-chip').forEach(chip => {
      chip.setAttribute('aria-pressed', String(chip.dataset.ind === activeIndustry));
    });
  }

  filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.bundle-chip');
    if (!chip) return;
    activeIndustry = chip.dataset.ind;
    render();
  });

  gridEl.addEventListener('click', (e) => {
    const custBtn = e.target.closest('[data-bundle-customise]');
    if (custBtn) {
      const id = custBtn.getAttribute('data-bundle-customise');
      if (window.__vioraOpenCustomise) window.__vioraOpenCustomise(id);
      return;
    }
    const exploreBtn = e.target.closest('[data-bundle-explore]');
    if (exploreBtn) {
      const id = exploreBtn.getAttribute('data-bundle-explore');
      const b = BUNDLES.find(x => x.id === id);
      if (!b) return;
      const detailTitle = document.getElementById('detailTitle');
      const detailCat = document.getElementById('detailCat');
      const detailDesc = document.getElementById('detailDesc');
      const detailList = document.getElementById('detailList');
      if (!detailTitle) return;
      detailCat.textContent = 'Bundle · ' + b.industry;
      detailTitle.textContent = b.name;
      detailDesc.textContent = b.who;
      detailList.innerHTML = b.modules.map(m => `<li>${m}</li>`).join('');
      if (window.__vioraOpenDetail) window.__vioraOpenDetail();
    }
  });

  if (wizardOpen) {
    wizardOpen.addEventListener('click', () => {
      if (window.__vioraOpenWizard) window.__vioraOpenWizard();
    });
  }

  render();
})();

/* ============================================================
   CUSTOMISE DRAWER
   ============================================================ */
(function initCustomiseDrawer() {
  const overlay = document.getElementById('customiseOverlay');
  const drawer = document.getElementById('customiseDrawer');
  const titleEl = document.getElementById('customiseTitle');
  const descEl = document.getElementById('customiseDesc');
  const modulesEl = document.getElementById('customiseModules');
  const countEl = document.getElementById('customiseCount');
  const deployEl = document.getElementById('customiseDeploy');
  const priceEl = document.getElementById('customisePrice');
  const closeBtn = document.getElementById('customiseClose');
  const cancelBtn = document.getElementById('customiseCancel');
  const sendBtn = document.getElementById('customiseSend');
  if (!overlay || !drawer || !modulesEl) return;

  let currentModules = [];

  function updateSummary() {
    const count = currentModules.length;
    countEl.textContent = String(count);
    const weeks = count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
    deployEl.textContent = count === 0 ? '—' : `${weeks}–${weeks + 1} weeks`;
    const total = currentModules.reduce((sum, m) => sum + (MODULE_BASE_PRICE[m] || 1500), 0);
    priceEl.textContent = count === 0 ? 'KSh —/mo' : `From KSh ${total.toLocaleString('en-KE')}/mo`;
  }

  function renderModules(allModules, selectedSet) {
    modulesEl.innerHTML = allModules.map(m => {
      const on = selectedSet.has(m);
      return `
        <label class="customise-mod ${on ? 'on' : ''}" data-mod="${m.replace(/"/g, '&quot;')}">
          <input type="checkbox" ${on ? 'checked' : ''}>
          <span class="customise-mod-name">${m}</span>
        </label>
      `;
    }).join('');

    modulesEl.querySelectorAll('.customise-mod').forEach(label => {
      const input = label.querySelector('input');
      const mod = label.dataset.mod;
      input.addEventListener('change', () => {
        if (input.checked) {
          if (!currentModules.includes(mod)) currentModules.push(mod);
          label.classList.add('on');
        } else {
          currentModules = currentModules.filter(m => m !== mod);
          label.classList.remove('on');
        }
        updateSummary();
      });
    });
  }

  window.__vioraOpenCustomise = function (bundleId, preselectedModules) {
    const bundle = BUNDLES.find(b => b.id === bundleId);

    const allModuleNames = ['Business ERP', 'Point of Sale', 'Accounting', 'Inventory', 'Procurement',
      'Sales Management', 'Customer Management', 'Reporting & Analytics', 'HR Management', 'Payroll',
      'Employee Records', 'Attendance', 'Leave Management', 'Performance', 'E-commerce', 'Online Stores',
      'Product Management', 'Orders', 'Delivery Management', 'Customer Portals', 'Website Development',
      'Mobile Applications', 'Custom Software', 'API Integrations', 'Automation', 'Branding & Graphics'];

    const initial = preselectedModules
      ? preselectedModules
      : (bundle ? bundle.modules : []);

    if (bundle) {
      titleEl.textContent = bundle.name;
      descEl.textContent = bundle.who;
    } else {
      titleEl.textContent = 'Custom bundle';
      descEl.textContent = 'A bundle built around your choices.';
    }

    currentModules = [...initial];
    renderModules(allModuleNames, new Set(initial));
    updateSummary();

    overlay.hidden = false;
    drawer.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add('show');
      drawer.classList.add('show');
    });
  };

  function close() {
    overlay.classList.remove('show');
    drawer.classList.remove('show');
    setTimeout(() => {
      overlay.hidden = true;
      drawer.hidden = true;
    }, 350);
  }

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);
  if (overlay) overlay.addEventListener('click', close);

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (currentModules.length === 0) {
        alert('Please select at least one module.');
        return;
      }
      const bundleName = titleEl.textContent;
      const summary = `Bundle: ${bundleName}\nModules (${currentModules.length}): ${currentModules.join(', ')}`;
      close();

      setTimeout(() => {
        const descField = document.getElementById('f-desc');
        const solutionField = document.getElementById('f-solution');
        const contactSection = document.getElementById('contact');
        if (descField) descField.value = summary + '\n\n';
        if (solutionField) solutionField.value = 'Business Management / ERP';
        if (contactSection) {
          const top = contactSection.getBoundingClientRect().top + window.scrollY - 76;
          window.scrollTo({ top, behavior: prefersReduce ? 'auto' : 'smooth' });
        }
        if (descField) setTimeout(() => descField.focus(), 500);
      }, 400);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('show')) close();
  });
})();

/* ============================================================
   WIZARD
   ============================================================ */
(function initWizard() {
  const overlay = document.getElementById('wizardOverlay');
  const modal = document.getElementById('wizardModal');
  const closeBtn = document.getElementById('wizardClose');
  const industryEl = document.getElementById('wizardIndustry');
  const needsEl = document.getElementById('wizardNeeds');
  const resultEl = document.getElementById('wizardResult');
  const resultSub = document.getElementById('wizardResultSub');
  const backBtn = document.getElementById('wizardBack');
  const nextBtn = document.getElementById('wizardNext');
  const restartBtn = document.getElementById('wizardRestart');
  const customiseBtn = document.getElementById('wizardCustomise');
  const foot = document.getElementById('wizardFoot');
  if (!overlay || !industryEl || !needsEl) return;

  const INDUSTRY_OPTIONS = [
    { emoji: '🛒', label: 'Retail' },
    { emoji: '🏥', label: 'Healthcare' },
    { emoji: '🍽️', label: 'Hospitality' },
    { emoji: '🚚', label: 'Logistics' },
    { emoji: '🌾', label: 'Agriculture' },
    { emoji: '💼', label: 'Professional Services' },
    { emoji: '🏭', label: 'Manufacturing' },
    { emoji: '🎓', label: 'Education' },
    { emoji: '🔧', label: 'Jua Kali' },
    { emoji: '⚙️', label: 'Other' }
  ];

  const NEED_OPTIONS = [
    { key: 'stock', label: 'Track stock', modules: ['Inventory'] },
    { key: 'payments', label: 'Take payments', modules: ['Point of Sale'] },
    { key: 'payroll', label: 'Pay staff', modules: ['Payroll', 'HR Management'] },
    { key: 'online', label: 'Sell online', modules: ['E-commerce'] },
    { key: 'customers', label: 'Manage customers', modules: ['Customer Management'] },
    { key: 'reports', label: 'See reports', modules: ['Reporting & Analytics'] },
    { key: 'integrate', label: 'Integrate tools', modules: ['API Integrations'] },
    { key: 'custom', label: 'Build custom', modules: ['Custom Software'] }
  ];

  let state = { step: 1, industry: null, needs: [] };

  function renderIndustryOptions() {
    industryEl.innerHTML = INDUSTRY_OPTIONS.map(opt => `
      <button type="button" class="wizard-opt ${state.industry === opt.label ? 'on' : ''}" data-industry="${opt.label}">
        <span class="wizard-opt-emoji" aria-hidden="true">${opt.emoji}</span>
        <span>${opt.label}</span>
      </button>
    `).join('');
    industryEl.querySelectorAll('.wizard-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        state.industry = btn.dataset.industry;
        renderIndustryOptions();
        updateFootState();
      });
    });
  }

  function renderNeedOptions() {
    needsEl.innerHTML = NEED_OPTIONS.map(opt => `
      <button type="button" class="wizard-opt ${state.needs.includes(opt.key) ? 'on' : ''}" data-need="${opt.key}">
        <span>${opt.label}</span>
      </button>
    `).join('');
    needsEl.querySelectorAll('.wizard-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.need;
        if (state.needs.includes(key)) {
          state.needs = state.needs.filter(k => k !== key);
        } else {
          if (state.needs.length >= 3) return;
          state.needs.push(key);
        }
        renderNeedOptions();
        updateFootState();
      });
    });
  }

  function updateFootState() {
    if (state.step === 1) {
      nextBtn.disabled = !state.industry;
      nextBtn.textContent = 'Next →';
      backBtn.style.visibility = 'hidden';
    } else if (state.step === 2) {
      nextBtn.disabled = state.needs.length === 0;
      nextBtn.textContent = 'See recommendations →';
      backBtn.style.visibility = 'visible';
    } else {
      foot.hidden = true;
    }
  }

  function showStep(n) {
    state.step = n;
    modal.querySelectorAll('.wizard-step').forEach(el => {
      el.hidden = Number(el.dataset.step) !== n;
    });
    foot.hidden = n === 3;
    updateFootState();
  }

  function buildResult() {
    const moduleSet = new Set();
    state.needs.forEach(key => {
      const opt = NEED_OPTIONS.find(o => o.key === key);
      if (opt) opt.modules.forEach(m => moduleSet.add(m));
    });

    if (moduleSet.size >= 3) moduleSet.add('Business ERP');

    const modules = [...moduleSet];

    const scored = BUNDLES.map(b => {
      const overlap = b.modules.filter(m => moduleSet.has(m)).length;
      return { bundle: b, score: overlap / Math.max(b.modules.length, modules.length) };
    }).sort((a, b) => b.score - a.score);

    const closest = scored[0];
    const resultName = closest && closest.score >= 0.5
      ? closest.bundle.name + ' (customised)'
      : 'Custom Bundle';

    const weeks = modules.length <= 2 ? '1–2' : modules.length <= 4 ? '2–3' : modules.length <= 6 ? '3–4' : '4–6';
    const total = modules.reduce((sum, m) => sum + (MODULE_BASE_PRICE[m] || 1500), 0);

    resultSub.textContent = `Based on your answers — ${state.industry} + ${state.needs.length} focus ${state.needs.length === 1 ? 'area' : 'areas'}.`;
    resultEl.innerHTML = `
      <h5>${resultName}</h5>
      <p>These ${modules.length} modules cover what you need to start — you can add more as you grow.</p>
      <div class="wizard-result-mods">
        ${modules.map(m => `<span class="wizard-result-mod">${m}</span>`).join('')}
      </div>
      <div class="wizard-result-meta">
        <span><strong>Est. deploy:</strong> ${weeks} weeks</span>
        <span><strong>Starting from:</strong> KSh ${total.toLocaleString('en-KE')}/mo</span>
      </div>
    `;

    window.__vioraWizardResult = { modules, name: resultName };
  }

  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (state.step === 1 && state.industry) showStep(2);
    else if (state.step === 2 && state.needs.length > 0) { buildResult(); showStep(3); }
  });
  if (backBtn) backBtn.addEventListener('click', () => {
    if (state.step === 2) showStep(1);
    else if (state.step === 3) showStep(2);
  });
  if (restartBtn) restartBtn.addEventListener('click', () => {
    state = { step: 1, industry: null, needs: [] };
    renderIndustryOptions();
    renderNeedOptions();
    showStep(1);
  });
  if (customiseBtn) customiseBtn.addEventListener('click', () => {
    const res = window.__vioraWizardResult;
    if (!res) return;
    closeWizard();
    setTimeout(() => {
      if (window.__vioraOpenCustomise) window.__vioraOpenCustomise(null, res.modules);
    }, 200);
  });

  function openWizard() {
    state = { step: 1, industry: null, needs: [] };
    renderIndustryOptions();
    renderNeedOptions();
    showStep(1);
    overlay.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => overlay.classList.add('show'));
  }
  function closeWizard() {
    overlay.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => { overlay.hidden = true; }, 300);
  }

  window.__vioraOpenWizard = openWizard;
  if (closeBtn) closeBtn.addEventListener('click', closeWizard);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWizard(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('show')) closeWizard();
  });
})();

/* ============================================================
   CUSTOM BUILDS CASE STUDIES
   ============================================================ */
const CASE_STUDIES = [
  { id: 'retail-chain', tag: 'Retail', title: 'Retail chain, 6 branches', featured: true, glyph: 'RC', problem: 'Stock tracked in three spreadsheets per branch. End-of-month reconciliation took a full day and still had errors.', deployed: 'VIORA Business ERP + POS + Inventory across all branches.', modules: ['Business ERP', 'Point of Sale', 'Inventory'], metrics: [{ value: '−85%', label: 'reconciliation time' }, { value: '+22%', label: 'stock accuracy' }, { value: '3 days', label: 'to first live sale' }] },
  { id: 'clinic-network', tag: 'Healthcare', title: 'Clinic network, 3 locations', featured: false, problem: 'Payroll ran on paper. Payslips were delayed and statutory deductions were frequently wrong.', deployed: 'VIORA HR + Payroll + Attendance.', modules: ['HR Management', 'Payroll', 'Attendance'], metrics: [{ value: '4d→1m', label: 'payroll cycle' }, { value: '100%', label: 'payslip accuracy' }, { value: '0', label: 'missed deadlines' }] },
  { id: 'logistics-sme', tag: 'Logistics', title: 'Logistics SME, custom portal', featured: false, problem: 'Clients called support daily for delivery status. Support team overwhelmed.', deployed: 'Custom customer portal + delivery management + API integration with existing TMS.', modules: ['Delivery Management', 'Customer Portals', 'API Integrations'], metrics: [{ value: '−60%', label: 'status calls' }, { value: '5 weeks', label: 'to launch' }, { value: '+34%', label: 'retention' }] },
  { id: 'school-system', tag: 'Education', title: 'School network, fee automation', featured: false, problem: 'Fee reminders sent by SMS manually. Reconciliation with banks took weeks.', deployed: 'School fee module + automated reminders + bank feed integration.', modules: ['Customer Management', 'Accounting', 'Automation', 'API Integrations'], metrics: [{ value: '−70%', label: 'admin hours' }, { value: '3×', label: 'on-time fees' }, { value: '1 wk', label: 'to deploy' }] },
  { id: 'salon-chain', tag: 'Beauty', title: 'Salon chain, appointment system', featured: false, problem: 'Bookings managed in a notebook. Double-bookings and no-shows cost real revenue.', deployed: 'Custom booking system + staff rota + SMS reminders + POS.', modules: ['Point of Sale', 'Customer Management', 'Automation'], metrics: [{ value: '−45%', label: 'no-shows' }, { value: '+18%', label: 'revenue' }, { value: '2 wk', label: 'to launch' }] },
  { id: 'farm-coop', tag: 'Agriculture', title: 'Coffee co-op, traceability', featured: false, problem: 'Farmer contributions tracked on paper. No traceability from farm to buyer.', deployed: 'Custom traceability system + farmer records + inventory + reporting.', modules: ['Inventory', 'Customer Management', 'Reporting & Analytics', 'Custom Software'], metrics: [{ value: '4×', label: 'traceability' }, { value: '−90%', label: 'errors' }, { value: '6 wk', label: 'to deploy' }] },
  { id: 'ngo-portal', tag: 'NGOs', title: 'NGO donor portal', featured: false, problem: 'Donor reports compiled manually. Every quarterly report took two weeks of staff time.', deployed: 'Custom donor portal + auto-generated reports + CRM.', modules: ['Customer Management', 'Reporting & Analytics', 'Custom Software'], metrics: [{ value: '−80%', label: 'report time' }, { value: '+25%', label: 'donor retention' }, { value: '4 wk', label: 'to build' }] },
  { id: 'hotel-suite', tag: 'Hospitality', title: 'Boutique hotel, full stack', featured: false, problem: 'Separate systems for bookings, restaurant till and housekeeping. No single view of the guest.', deployed: 'Booking module + restaurant POS + HR + reporting.', modules: ['Business ERP', 'Point of Sale', 'HR Management', 'Reporting & Analytics'], metrics: [{ value: '1', label: 'unified system' }, { value: '+32%', label: 'repeat guests' }, { value: '5 wk', label: 'to launch' }] },
  { id: 'manufacturing-floor', tag: 'Manufacturing', title: 'Factory floor, production tracking', featured: false, problem: 'Production logs on clipboards. Real cost per unit was unknown.', deployed: 'Custom production tracker + inventory + accounting + reports.', modules: ['Inventory', 'Accounting', 'Reporting & Analytics', 'Custom Software'], metrics: [{ value: '−30%', label: 'wastage' }, { value: '+15%', label: 'throughput' }, { value: '8 wk', label: 'to deploy' }] }
];

const CASE_TAGS = ['All', ...new Set(CASE_STUDIES.map(c => c.tag))];

(function initCustomBuilds() {
  const filtersEl = document.getElementById('caseFilters');
  const featuredEl = document.getElementById('caseFeatured');
  const gridEl = document.getElementById('caseGrid');
  if (!filtersEl || !featuredEl || !gridEl) return;

  let activeTag = 'All';

  filtersEl.innerHTML = CASE_TAGS.map(tag =>
    `<button class="case-chip" type="button" data-tag="${tag}" aria-pressed="${tag === 'All' ? 'true' : 'false'}">${tag}</button>`
  ).join('');

  function render() {
    const filtered = activeTag === 'All' ? CASE_STUDIES : CASE_STUDIES.filter(c => c.tag === activeTag);
    const featuredCase = filtered.find(c => c.featured) || filtered[0];
    const rest = featuredCase ? filtered.filter(c => c.id !== featuredCase.id) : [];

    if (featuredCase) {
      featuredEl.innerHTML = `
        <article class="case-feature">
          <div class="case-feature-thumb">
            <span class="case-feature-glyph">${featuredCase.glyph || '★'}</span>
          </div>
          <div class="case-feature-body">
            <span class="case-feature-tag">${featuredCase.tag}</span>
            <h4 class="case-feature-title">${featuredCase.title}</h4>
            <p class="case-feature-desc">${featuredCase.problem}</p>
            <div class="case-feature-row">
              <span><strong>Deployed:</strong> ${featuredCase.deployed}</span>
            </div>
            <div class="case-feature-row">
              ${featuredCase.metrics.map(m => `<span><strong>${m.value}</strong> ${m.label}</span>`).join('')}
            </div>
            <div class="case-feature-row" style="gap:6px">
              ${featuredCase.modules.map(m => `<span class="bundle-mod-chip">${m}</span>`).join('')}
            </div>
          </div>
        </article>
      `;
    } else {
      featuredEl.innerHTML = '';
    }

    gridEl.innerHTML = rest.map(c => `
      <article class="case-mini">
        <span class="case-mini-tag">${c.tag}</span>
        <h5 class="case-mini-title">${c.title}</h5>
        <p class="case-mini-problem">${c.problem}</p>
        <div class="case-mini-metrics">
          ${c.metrics.map(m => `<span>${m.value}</span><span style="color:var(--muted);font-weight:400">${m.label}</span>`).join('<span style="color:var(--line)">|</span>')}
        </div>
      </article>
    `).join('');

    filtersEl.querySelectorAll('.case-chip').forEach(chip => {
      chip.setAttribute('aria-pressed', String(chip.dataset.tag === activeTag));
    });
  }

  filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.case-chip');
    if (!chip) return;
    activeTag = chip.dataset.tag;
    render();
  });

  render();
})();

/* ============================================================
   MOBILE BOTTOM NAV — active state tracking
   ============================================================ */
(function initMobileNavActive() {
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  if (!mobileNavItems.length) return;

  const homeItem = document.querySelector('[data-mnav="home"]');
  const modulesItem = document.querySelector('[data-mnav="modules"]');
  const appsSection = document.getElementById('apps');

  function setActive(item) {
    mobileNavItems.forEach(i => i.classList.remove('active'));
    if (item) item.classList.add('active');
  }

  function updateActive() {
    const y = window.scrollY;
    const appsTop = appsSection ? appsSection.offsetTop : 9999;
    if (y < appsTop - 100) {
      setActive(homeItem);
    } else {
      setActive(modulesItem);
    }
  }

  window.addEventListener('scroll', updateActive, { passive: true });
  updateActive();

  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.mnav === 'home' || item.dataset.mnav === 'modules') {
        setActive(item);
      }
    });
  });
})();