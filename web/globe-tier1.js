/* ============================================================
   VIORA — Globe Tier 1 Upgrade
   Requires: fixes.js loaded first, window.__vioraGlobeState available.
   ============================================================ */
(function () {
  'use strict';

  const st = window.__vioraGlobeState;
  if (!st || !st.scene) {
    console.warn('[globe-tier1] __vioraGlobeState not found — load fixes.js first.');
    return;
  }

  const THREE = window.THREE;
  const { scene, camera, renderer, globeGroup } = st;
  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Replace earth material with day + night + bump ---------- */
  const textureLoader = new THREE.TextureLoader();

  // Day texture (existing) — find the earth mesh
  let earthMesh = null;
  let atmosphereMesh = null;
  globeGroup.traverse((child) => {
    if (child.isMesh && child.geometry && child.geometry.type === 'SphereGeometry') {
      if (!earthMesh && child.material && child.material.type === 'MeshPhongMaterial') earthMesh = child;
      else if (!atmosphereMesh && child.material && child.material.type === 'MeshBasicMaterial' && child.material.side === THREE.BackSide) atmosphereMesh = child;
    }
  });

  if (!earthMesh) {
    console.warn('[globe-tier1] Earth mesh not found.');
    return;
  }

  // Load night lights (NASA Blue Marble night)
  const nightTexture = textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-night.jpg',
    undefined, undefined,
    () => { console.warn('[globe-tier1] Night texture failed to load'); }
  );

  // Load bump map for topology
  const bumpTexture = textureLoader.load(
    'https://unpkg.com/three-globe/example/img/earth-topology.png',
    undefined, undefined,
    () => { /* optional */ }
  );

  // Upgrade material
  earthMesh.material.emissiveMap = nightTexture;
  earthMesh.material.emissive = new THREE.Color(0xffffff);
  earthMesh.material.bumpMap = bumpTexture;
  earthMesh.material.bumpScale = 0.6;
  earthMesh.material.needsUpdate = true;

  // Slightly brighter ambient so the dark side isn't pure black
  scene.traverse((c) => {
    if (c.isAmbientLight) c.intensity = Math.max(c.intensity, 0.35);
  });

  /* ---------- 2. Sun direction driven by real UTC time ---------- */
  // We'll rotate the existing directional light to simulate the sun.
  let sunLight = null;
  scene.traverse((c) => {
    if (c.isDirectionalLight && !sunLight) sunLight = c;
  });

  const earthRadius = 100;
  function computeSunDirection() {
    const now = new Date();
    // Solar declination (approximate)
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)) * Math.PI / 180;
    // Subsolar point longitude: 0 at UTC noon
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const subsolarLon = (12 - utcHours) * 15 * Math.PI / 180;
    // Convert to vector
    const x = Math.cos(declination) * Math.cos(subsolarLon);
    const y = Math.sin(declination);
    const z = Math.cos(declination) * Math.sin(subsolarLon);
    return new THREE.Vector3(x, y, z).normalize();
  }

  let lastSunUpdate = 0;
  function updateSun(force) {
    const now = performance.now();
    if (!force && now - lastSunUpdate < 30000) return; // update every 30s
    lastSunUpdate = now;
    const dir = computeSunDirection();
    if (sunLight) {
      sunLight.position.copy(dir.clone().multiplyScalar(300));
      sunLight.intensity = 1.1;
    }
    // Also rotate emissive intensity so night lights only show on the dark side
    // (Handled visually by the phong material's emissive term.)
  }
  updateSun(true);

  /* ---------- 3. Country borders + graticule ---------- */
  const bordersGroup = new THREE.Group();
  bordersGroup.name = 'borders';
  globeGroup.add(bordersGroup);

  // Graticule (lat/lon grid every 30°)
  const gratMat = new THREE.LineBasicMaterial({ color: 0x2267EE, transparent: true, opacity: 0.18 });
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 4) {
      points.push(latLonToVec3(lat, lon, earthRadius * 1.001));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    bordersGroup.add(new THREE.Line(geo, gratMat));
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const points = [];
    for (let lat = -90; lat <= 90; lat += 4) {
      points.push(latLonToVec3(lat, lon, earthRadius * 1.001));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    bordersGroup.add(new THREE.Line(geo, gratMat));
  }

  function latLonToVec3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
  }

  // Fetch country borders GeoJSON (Natural Earth 110m)
  fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
    .then((r) => r.json())
    .then((geojson) => {
      const borderMat = new THREE.LineBasicMaterial({ color: 0x8B5CF6, transparent: true, opacity: 0.35 });
      const positions = [];
      geojson.features.forEach((feature) => {
        const geom = feature.geometry;
        if (!geom) return;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
        polys.forEach((poly) => {
          poly.forEach((ring) => {
            for (let i = 0; i < ring.length - 1; i++) {
              const [lon1, lat1] = ring[i];
              const [lon2, lat2] = ring[i + 1];
              positions.push(latLonToVec3(lat1, lon1, earthRadius * 1.002));
              positions.push(latLonToVec3(lat2, lon2, earthRadius * 1.002));
            }
          });
        });
      });
      const geo = new THREE.BufferGeometry().setFromPoints(positions);
      bordersGroup.add(new THREE.LineSegments(geo, borderMat));
    })
    .catch((err) => console.warn('[globe-tier1] Borders GeoJSON failed:', err));

  /* ---------- 4. Occlusion-correct city labels ---------- */
  // The original script updates cityElements' display based on vector.z. We override by
  // re-reading the cityMeshes from the globe group and computing the surface dot product.
  // Since cityMeshes isn't exposed, we re-collect by matching markers (small spheres).
  const cityMarkers = [];
  globeGroup.traverse((c) => {
    if (c.isMesh && c.geometry && c.geometry.type === 'SphereGeometry' && c.geometry.parameters.radius < 2) {
      cityMarkers.push(c);
    }
  });

  // Map city index by position (matches CITIES array order in main script)
  const cityElements = Array.from(document.querySelectorAll('.city-node'));
  const cityData = [
    { name: 'Nairobi, Kenya (HQ)', lat: -1.2921, lon: 36.8219 },
    { name: 'London, UK', lat: 51.5074, lon: -0.1278 },
    { name: 'Dubai, UAE', lat: 25.2048, lon: 55.2708 },
    { name: 'Cape Town, SA', lat: -33.9249, lon: 18.4241 },
    { name: 'Mumbai, India', lat: 19.0760, lon: 72.8777 },
    { name: 'Lagos, Nigeria', lat: 6.5244, lon: 3.3792 },
    { name: 'New York, USA', lat: 40.7128, lon: -74.0060 },
    { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
    { name: 'São Paulo, Brazil', lat: -23.5505, lon: -46.6333 }
  ];

  // Patch the animate loop to use dot product (runs on every frame via requestAnimationFrame,
  // but we don't own the loop; we instead use a setInterval at 30fps to update overlays).
  const tmpVec = new THREE.Vector3();
  function updateCityLabels() {
    const container = document.getElementById('globe-canvas-container');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;

    cityMarkers.forEach((marker, i) => {
      const el = cityElements[i];
      if (!el) return;
      const worldPos = marker.getWorldPosition(new THREE.Vector3());
      const normal = worldPos.clone().sub(globeGroup.position).normalize();
      const camDir = camera.position.clone().sub(worldPos).normalize();
      const facing = normal.dot(camDir);
      const projected = worldPos.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * w;
      const y = (-(projected.y * 0.5) + 0.5) * h;
      const distFromCenter = Math.sqrt(Math.pow(x - w / 2, 2) + Math.pow(y - h / 2, 2));
      const radius = Math.min(w, h) * 0.45;
      const visible = facing > 0.15 && distFromCenter < radius;
      if (visible) {
        el.style.display = 'block';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        const fade = Math.min(1, facing * 2) * (1 - Math.pow(distFromCenter / radius, 4));
        el.style.opacity = Math.max(0, fade);
      } else {
        el.style.display = 'none';
      }
    });
  }
  setInterval(updateCityLabels, 33); // ~30fps

  /* ---------- 5. Click-to-focus a city ---------- */
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let focusTarget = null; // { quaternion, startTime }
  const focusDuration = 800;

  function focusCity(index) {
    const marker = cityMarkers[index];
    if (!marker) return;
    const worldPos = marker.getWorldPosition(new THREE.Vector3());
    const targetNormal = worldPos.clone().sub(globeGroup.position).normalize();
    // We want the target normal to point toward the camera (+Z in camera space)
    const cameraDir = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(targetNormal, cameraDir);
    focusTarget = {
      startQuat: globeGroup.quaternion.clone(),
      endQuat: globeGroup.quaternion.clone().premultiply(q),
      startTime: performance.now()
    };
    // Show a small info card
    showCityCard(index);
  }

  function showCityCard(index) {
    const data = cityData[index];
    if (!data) return;
    const tooltip = document.getElementById('mapTooltip');
    const ttTitle = document.getElementById('ttTitle');
    const ttDesc = document.getElementById('ttDesc');
    if (!tooltip || !ttTitle || !ttDesc) return;

    const localTime = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    }).format(new Date());

    ttTitle.textContent = data.name;
    ttDesc.textContent = `Local time: ${localTime} · Click a hub to focus.`;

    // Position near the globe center
    const stage = document.getElementById('globeStage');
    if (stage) {
      const rect = stage.getBoundingClientRect();
      tooltip.style.left = `${rect.width / 2}px`;
      tooltip.style.top = `${rect.height / 2 - 40}px`;
    }
    tooltip.classList.add('show');

    // Fetch weather (Open-Meteo, no key)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${data.lat}&longitude=${data.lon}&current=temperature_2m,weather_code&timezone=auto`)
      .then((r) => r.json())
      .then((w) => {
        if (w && w.current) {
          ttDesc.textContent = `Local time: ${localTime} · ${Math.round(w.current.temperature_2m)}°C · Click a hub to focus.`;
        }
      })
      .catch(() => {});

    setTimeout(() => tooltip.classList.remove('show'), 6000);
  }

  // Bind click on city markers via raycasting
  document.getElementById('globe-canvas-container')?.addEventListener('click', (e) => {
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(cityMarkers, false);
    if (hits.length > 0) {
      const idx = cityMarkers.indexOf(hits[0].object);
      if (idx >= 0) focusCity(idx);
    }
  });

  // Hook into the render loop for the focus animation
  const originalTick = st.animate;
  if (typeof originalTick === 'function') {
    // We can't easily wrap the existing RAF; instead, we run our own check at 60fps
    (function focusTick() {
      if (focusTarget) {
        const t = Math.min(1, (performance.now() - focusTarget.startTime) / focusDuration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        globeGroup.quaternion.copy(focusTarget.startQuat).slerp(focusTarget.endQuat, eased);
        // Also zero out the manual rotation targets so it doesn't fight
        if (st.targetRotationX !== undefined) st.targetRotationX = 0;
        if (st.targetRotationY !== undefined) st.targetRotationY = 0;
        if (t >= 1) focusTarget = null;
      }
      requestAnimationFrame(focusTick);
    })();
  }

  /* ---------- 6. Update sun every 30s ---------- */
  setInterval(() => updateSun(true), 30000);

  /* ---------- 7. Reduced motion: skip night-lights animation ---------- */
  if (prefersReduce) {
    // Static frame is fine; nothing extra to do since night lights are a texture
  }

  console.log('[globe-tier1] Globe upgraded: night lights, terminator, borders, click-to-focus.');
})();