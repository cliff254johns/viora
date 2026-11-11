/* VIORA World — independent animated 3D city scene.
   Uses the site's existing Three.js r128 global; leaves the hero globe untouched. */
(() => {
  'use strict';
  const root = document.getElementById('viora-city');
  const stage = document.getElementById('viora-city-stage');
  const canvas = document.getElementById('viora-city-canvas');
  if (!root || !stage || !canvas || !window.THREE) {
    if (stage) stage.classList.add('city-fallback');
    return;
  }

  const THREE = window.THREE;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071426);
  scene.fog = new THREE.FogExp2(0x0a1a2c, 0.014);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 420);
  camera.position.set(0, 27, 78);
  camera.lookAt(0, 8, -35);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0x9fc9ed, 0x17202c, 0.82);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffd6a0, 2.2);
  sunLight.position.set(-35, 55, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.left = -75;
  sunLight.shadow.camera.right = 75;
  sunLight.shadow.camera.top = 75;
  sunLight.shadow.camera.bottom = -75;
  scene.add(sunLight);
  const moonLight = new THREE.DirectionalLight(0x8ab8ef, 0.1);
  scene.add(moonLight);

  const city = new THREE.Group();
  scene.add(city);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x172432, roughness: 0.92, metalness: 0.12 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(250, 240), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.3, -55);
  ground.receiveShadow = true;
  city.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x101923, roughness: 0.85 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(250, 13), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -0.18, 13);
  city.add(road);
  const laneMat = new THREE.MeshBasicMaterial({ color: 0x9ab0bf, transparent: true, opacity: 0.26 });
  for (let x = -115; x < 115; x += 12) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(5, 0.035, 0.12), laneMat);
    dash.position.set(x, -0.08, 13);
    city.add(dash);
  }

  const palettes = [0x26394b, 0x344354, 0x1d3041, 0x485665, 0x253b4c, 0x3b4857, 0x1b2a3a];
  const glassMats = [0x9fc6d9, 0x5e91aa, 0xd7b98c, 0x7ca8b9].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: 0x172b3b, emissiveIntensity: 0.12, metalness: 0.38, roughness: 0.28 }));
  const windowGlow = new THREE.MeshBasicMaterial({ color: 0xffd99b });
  let seed = 82471;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function makeBuilding(x, z, w, d, h, index) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const baseMat = new THREE.MeshStandardMaterial({ color: palettes[index % palettes.length], roughness: 0.66, metalness: 0.32 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), baseMat);
    base.position.y = h / 2;
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    // Varied stepped crowns, setbacks and roof forms break up the skyline.
    if (index % 4 !== 0) {
      const crownH = h * (0.08 + rand() * 0.13);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * (0.72 + rand() * 0.2), crownH, d * (0.72 + rand() * 0.2)), baseMat);
      crown.position.y = h + crownH / 2;
      crown.castShadow = true;
      group.add(crown);
    }
    if (index % 7 === 0) {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.35, h * 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x8b9aa7, metalness: 0.8, roughness: 0.3 }));
      spire.position.y = h + h * 0.13;
      group.add(spire);
    }

    const rows = Math.max(3, Math.floor(h / 2.7));
    const cols = Math.max(2, Math.floor(w / 1.65));
    const winW = Math.min(0.72, w / (cols + 1) * 0.55);
    const winH = 0.82;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rand() < 0.2) continue;
        const mat = rand() > 0.82 ? windowGlow : glassMats[Math.floor(rand() * glassMats.length)];
        const win = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.045), mat);
        win.position.set(-w / 2 + (c + 1) * w / (cols + 1), 1.8 + r * (h - 3) / rows, d / 2 + 0.035);
        group.add(win);
      }
    }
    // Side facade rhythm.
    const sideCols = Math.max(2, Math.floor(d / 1.8));
    for (let r = 0; r < rows; r++) for (let c = 0; c < sideCols; c++) {
      if (rand() < 0.34) continue;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.72, Math.min(0.65, d / (sideCols + 1) * 0.5)), rand() > 0.9 ? windowGlow : glassMats[index % glassMats.length]);
      win.position.set(w / 2 + 0.03, 1.8 + r * (h - 3) / rows, -d / 2 + (c + 1) * d / (sideCols + 1));
      group.add(win);
    }
    city.add(group);
  }

  let buildingIndex = 0;
  for (let z = -118; z < 20; z += 12) {
    for (let x = -108; x <= 108; x += 13.5) {
      if (Math.abs(x) < 11 && z > -22) continue;
      const distance = Math.sqrt(x * x + (z + 38) * (z + 38));
      const height = 11 + rand() * 30 + Math.max(0, 22 - distance * 0.23);
      const width = 6.5 + rand() * 4.8;
      const depth = 6.5 + rand() * 4.5;
      makeBuilding(x + (rand() - 0.5) * 3, z + (rand() - 0.5) * 3, width, depth, height, buildingIndex++);
    }
  }

  // Signature central towers and a suspended skybridge give the skyline a distinct silhouette.
  const signatureMat = new THREE.MeshStandardMaterial({ color: 0x263d50, metalness: 0.72, roughness: 0.28 });
  function tower(x, z, w, d, h, taper) {
    const geometry = new THREE.CylinderGeometry(w * taper, w, h, 4, 1, false);
    const mesh = new THREE.Mesh(geometry, signatureMat);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = Math.PI / 4;
    mesh.castShadow = true;
    city.add(mesh);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.65, d * 1.5), new THREE.MeshStandardMaterial({ color: 0x8abbd0, emissive: 0x16384c, metalness: 0.8 }));
    crown.position.set(x, h + 0.2, z);
    city.add(crown);
  }
  tower(-8, -62, 8, 8, 58, 0.55);
  tower(12, -70, 6, 6, 43, 0.72);
  tower(34, -52, 7, 7, 49, 0.62);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(39, 1.15, 2.2), new THREE.MeshStandardMaterial({ color: 0x40596a, metalness: 0.82, roughness: 0.24, emissive: 0x0a2332 }));
  bridge.position.set(8, 22, -52);
  city.add(bridge);

  // A subtle moving traffic layer creates scale and a sense of life.
  const vehicles = [];
  for (let i = 0; i < 22; i++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 0.92), new THREE.MeshStandardMaterial({ color: [0x9eb3c1, 0x243c50, 0x8b9da8, 0xc3a67a][i % 4], metalness: 0.7, roughness: 0.3 }));
    body.position.y = 0.52;
    car.add(body);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffedc6 });
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), headMat);
      lamp.position.set(1.06, 0.55, side * 0.28);
      car.add(lamp);
    }
    car.position.set(-112 + i * 10.2, 0, 13 + (i % 2 ? 2.6 : -2.6));
    city.add(car);
    vehicles.push(car);
  }

  // Atmospheric cloud banks and high-altitude stars.
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0x9cb6c9, transparent: true, opacity: 0.12, depthWrite: false });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 9), cloudMat.clone());
    cloud.scale.set(10 + rand() * 13, 1.5 + rand() * 2, 3 + rand() * 4);
    cloud.position.set(-110 + rand() * 220, 37 + rand() * 23, -115 + rand() * 50);
    scene.add(cloud);
    clouds.push(cloud);
  }
  const starPositions = [];
  for (let i = 0; i < 500; i++) starPositions.push((rand() - .5) * 260, 38 + rand() * 90, -135 - rand() * 60);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd7e9ff, size: 0.42, transparent: true, opacity: 0.65 }));
  scene.add(stars);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(3.8, 28, 20), new THREE.MeshBasicMaterial({ color: 0xffd39a }));
  scene.add(sun);
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(5.4, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffb46e, transparent: true, opacity: 0.12, depthWrite: false }));
  scene.add(sunHalo);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.7, 32, 24), new THREE.MeshStandardMaterial({ color: 0xe6edf4, roughness: 0.88, metalness: 0.02 }));
  scene.add(moon);
  const moonHalo = new THREE.Mesh(new THREE.SphereGeometry(4.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x8ab9e8, transparent: true, opacity: 0.1, depthWrite: false }));
  scene.add(moonHalo);

  const timeLabel = root.querySelector('[data-city-time]');
  const weatherLabel = root.querySelector('[data-city-weather]');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi';
  let latitude = -0.286, longitude = 36.817;

  function solarPosition(date) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - 2451545;
    const L = ((280.46 + .9856474 * n) % 360 + 360) % 360;
    const g = ((357.528 + .9856003 * n) % 360 + 360) % 360 * Math.PI / 180;
    const lam = (L + 1.915 * Math.sin(g) + .020 * Math.sin(2 * g)) * Math.PI / 180;
    const ob = (23.439 - .0000004 * n) * Math.PI / 180;
    const dec = Math.asin(Math.sin(ob) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(ob) * Math.sin(lam), Math.cos(lam));
    const T = (jd - 2451545) / 36525;
    const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545) + .000387933 * T * T) * Math.PI / 180;
    const H = ((gmst + longitude * Math.PI / 180 - ra + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const p = latitude * Math.PI / 180;
    const elevation = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H));
    const azimuth = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(p) - Math.sin(p) * Math.cos(H));
    return { elevation, azimuth };
  }

  function updateCelestial(date) {
    const solar = solarPosition(date);
    const altitude = solar.elevation;
    const az = solar.azimuth;
    const horizontal = Math.cos(altitude);
    const sx = Math.sin(az) * horizontal;
    const sy = Math.sin(altitude);
    const sz = -Math.cos(az) * horizontal;
    const sunPos = new THREE.Vector3(sx * 118, 18 + Math.max(-0.8, sy) * 78, sz * 118);
    sun.position.copy(sunPos);
    sunHalo.position.copy(sunPos);
    sunLight.position.set(sx * 90, Math.max(8, sy * 95), sz * 90);
    sunLight.intensity = THREE.MathUtils.clamp((sy + 0.12) * 3.2, 0.08, 2.6);
    moonLight.intensity = THREE.MathUtils.clamp((-sy + 0.18) * 0.42, 0.04, 0.42);

    // Lunar phase and lunar orbital position, based on the synodic month.
    const synodic = 29.530588853;
    const phase = (((date.getTime() / 86400000 + 2440587.5) - 2451550.1) / synodic % 1 + 1) % 1;
    const lunarAngle = phase * Math.PI * 2 + az;
    const moonPos = new THREE.Vector3(Math.cos(lunarAngle) * 105, 22 + Math.sin(lunarAngle) * 52, -92 + Math.sin(lunarAngle * 0.7) * 26);
    moon.position.copy(moonPos);
    moonHalo.position.copy(moonPos);
    // Directional illumination varies with the lunar phase instead of a fixed glowing disc.
    moon.material.emissive = new THREE.Color(0x26384e);
    moon.material.emissiveIntensity = 0.08;
    moonLight.position.copy(sunPos.clone().sub(moonPos).normalize().multiplyScalar(75));
    moon.visible = altitude < 0.28 || phase > 0.48;
    moonHalo.visible = moon.visible;
    sun.visible = altitude > -0.18;
    sunHalo.visible = sun.visible;
    root.dataset.phase = altitude < -0.08 ? 'night' : altitude < 0.12 ? 'sunset' : 'day';
    if (timeLabel) timeLabel.textContent = new Intl.DateTimeFormat('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: timezone, timeZoneName: 'short' }).format(date);
  }

  function resize() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 560 ? 49 : 43;
    camera.position.z = w < 560 ? 91 : 78;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  async function loadWeather(lat, lon) {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,precipitation,weather_code&timezone=auto';
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('weather unavailable');
      const current = (await response.json()).current;
      const code = current.weather_code;
      const condition = current.precipitation > 0 ? 'Rain' : code === 0 ? 'Clear' : code <= 3 ? 'Partly cloudy' : code <= 48 ? 'Fog' : code <= 67 ? 'Rain' : code <= 77 ? 'Snow' : 'Showers';
      if (weatherLabel) weatherLabel.textContent = Math.round(current.temperature_2m) + '°C · ' + condition;
    } catch (_) { if (weatherLabel) weatherLabel.textContent = 'Local conditions unavailable'; }
  }

  let lastSkyUpdate = 0;
  const clock = new THREE.Clock();
  let raf = 0;
  function animate() {
    raf = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(clock.getDelta(), 0.05);
    if (!reducedMotion) {
      vehicles.forEach((car, i) => {
        car.position.x += delta * (i % 2 ? -7.5 : 8.8);
        if (car.position.x > 118) car.position.x = -118;
        if (car.position.x < -118) car.position.x = 118;
      });
      clouds.forEach((cloud, i) => {
        cloud.position.x += delta * (i % 2 ? -0.35 : 0.24);
        if (cloud.position.x > 135) cloud.position.x = -135;
        if (cloud.position.x < -135) cloud.position.x = 135;
      });
      camera.position.x = Math.sin(elapsed * 0.045) * 1.9;
      camera.position.y = 27 + Math.sin(elapsed * 0.07) * 0.42;
      camera.lookAt(0, 8, -35);
      stars.material.opacity = 0.42 + Math.sin(elapsed * 0.32) * 0.12;
    }
    if (elapsed - lastSkyUpdate > 20) {
      updateCelestial(new Date());
      lastSkyUpdate = elapsed;
    }
    renderer.render(scene, camera);
  }
  updateCelestial(new Date());
  animate();
  loadWeather(latitude, longitude);
  if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => {
    latitude = pos.coords.latitude;
    longitude = pos.coords.longitude;
    updateCelestial(new Date());
    loadWeather(latitude, longitude);
  }, () => {}, { timeout: 4500, maximumAge: 900000 });

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    renderer.dispose();
  }, { once: true });
})();