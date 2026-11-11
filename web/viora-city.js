/* VIORA immersive ecosystem city — progressive Three.js experience */
(() => {
  'use strict';
  const root = document.getElementById('viora-city');
  const canvas = document.getElementById('viora-city-canvas');
  if (!root || !canvas || !window.THREE) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9bc9e8, 0.0028);
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 900);
  camera.position.set(48, 42, 88);
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
  const hemi = new THREE.HemisphereLight(0xd9efff, 0x40536b, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.0); sun.position.set(-45,75,35); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
  const city = new THREE.Group(); scene.add(city);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260,220), new THREE.MeshStandardMaterial({color:0x718b83, roughness:.92})); ground.rotation.x=-Math.PI/2; ground.position.y=-.25; ground.receiveShadow=true; city.add(ground);
  const roadMat = new THREE.MeshStandardMaterial({color:0x34414d, roughness:.85});
  for(let z=-75;z<=75;z+=42){const road=new THREE.Mesh(new THREE.BoxGeometry(240,.12,8),roadMat);road.position.set(0,.02,z);city.add(road);}
  for(let x=-100;x<=100;x+=48){const road=new THREE.Mesh(new THREE.BoxGeometry(8,.12,190),roadMat);road.position.set(x,.03,0);city.add(road);}
  const grid = new THREE.GridHelper(220,44,0x9dc3d4,0x91acb7); grid.position.y=.04; grid.material.transparent=true; grid.material.opacity=.2; city.add(grid);
  const palette=[0x3e7f9e,0x6c91a3,0x8a9da6,0x496b7c,0x9aabaf,0x587d89];
  function building(x,z,w,h,d,color,accent){
    const g=new THREE.Group(); const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.28})); body.position.y=h/2; body.castShadow=true;body.receiveShadow=true;g.add(body);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(w+.5,.45,d+.5),new THREE.MeshStandardMaterial({color:accent,metalness:.45,roughness:.35}));roof.position.y=h+.2;g.add(roof);
    const winMat=new THREE.MeshStandardMaterial({color:0x9fd8f0,emissive:0x315b72,emissiveIntensity:.18,roughness:.25});
    for(let y=2.1;y<h-1;y+=2.5) for(let xx=-w/2+1.1;xx<w/2-.5;xx+=2.2){const win=new THREE.Mesh(new THREE.BoxGeometry(.85,.95,.08),winMat);win.position.set(xx,y,d/2+.055);g.add(win);}
    g.position.set(x,0,z);city.add(g);return g;
  }
  const lots=[[-53,-34,13,24,12],[-25,-42,15,34,13],[18,-43,14,28,12],[51,-30,16,22,14],[-57,18,15,30,13],[-25,37,14,25,12],[26,34,16,31,14],[58,18,13,19,12],[-5,-65,11,18,10],[4,63,12,22,11]];
  lots.forEach((a,i)=>building(...a,palette[i%palette.length],0x9bc5d2));
  // Central VIORA landmark: shared data-core tower and illuminated globe.
  const tower=new THREE.Group(); const plinth=new THREE.Mesh(new THREE.CylinderGeometry(10,13,2,8),new THREE.MeshStandardMaterial({color:0x233b50,metalness:.65,roughness:.3}));plinth.position.y=1;tower.add(plinth);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(4.2,6,29,8),new THREE.MeshStandardMaterial({color:0xb7d4df,metalness:.72,roughness:.24,emissive:0x102d42}));shaft.position.y=16;tower.add(shaft);
  const orb=new THREE.Mesh(new THREE.SphereGeometry(7,32,24),new THREE.MeshStandardMaterial({color:0x6fc8e8,metalness:.4,roughness:.18,emissive:0x14628b,emissiveIntensity:.8}));orb.position.y=34;tower.add(orb);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(10,.28,8,64),new THREE.MeshBasicMaterial({color:0x8ee7ff}));ring.position.y=34;ring.rotation.x=Math.PI/2.8;tower.add(ring);tower.position.set(0,0,0);city.add(tower);
  // Parks and trees
  for(let i=0;i<34;i++){const x=((i*37)%150)-75,z=((i*53)%130)-65;if(Math.abs(x)<15&&Math.abs(z)<15)continue;const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.32,2,6),new THREE.MeshStandardMaterial({color:0x72553b}));trunk.position.set(x,1,z);city.add(trunk);const crown=new THREE.Mesh(new THREE.SphereGeometry(1.6,8,7),new THREE.MeshStandardMaterial({color:i%2?0x477d58:0x638c5c,roughness:1}));crown.position.set(x,2.8,z);crown.scale.y=1.15;city.add(crown);}
  // Star field
  const starGeo=new THREE.BufferGeometry(), starPos=[];for(let i=0;i<650;i++){starPos.push((Math.random()-.5)*500,Math.random()*180+35,(Math.random()-.5)*420);}starGeo.setAttribute('position',new THREE.Float32BufferAttribute(starPos,3));const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:1.05,transparent:true,opacity:0}));scene.add(stars);
  // Moon
  const moon=new THREE.Mesh(new THREE.SphereGeometry(5,24,20),new THREE.MeshStandardMaterial({color:0xe7edf1,emissive:0x8c9bac,emissiveIntensity:.5}));moon.position.set(-75,90,-100);scene.add(moon);
  // Rain particles, activated only when live weather reports rain.
  const rainGeo=new THREE.BufferGeometry(), rainPos=[];for(let i=0;i<850;i++)rainPos.push((Math.random()-.5)*180,Math.random()*90,(Math.random()-.5)*150);rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rainPos,3));const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xcdeeff,size:.35,transparent:true,opacity:0}));scene.add(rain);
  const weatherLabel=root.querySelector('[data-city-weather]');
  const timeLabel=root.querySelector('[data-city-time]');
  const statusLabel=root.querySelector('[data-city-status]');
  let weatherCode=null, isRaining=false, paused=false, dragging=false, prevX=0, prevY=0, targetX=-.12,targetY=.35;
  function applyTime(){
    const hour=new Date().getHours()+new Date().getMinutes()/60;
    const daylight=Math.max(0,Math.sin((hour-6)*Math.PI/12));
    const dusk=Math.max(0,1-Math.abs(hour-18.5)/2.5);
    const night=hour<5.5||hour>19.2;
    const sky=night?0x08172e:(dusk?0xe8a17f:0x9bc9e8);
    scene.background=new THREE.Color(sky);scene.fog.color.setHex(sky);
    sun.intensity=.12+daylight*1.9;sun.color.setHex(dusk?0xffad7a:0xfff0d6);
    hemi.intensity=.22+daylight*.95;
    stars.material.opacity=night ? .9 : 0;moon.visible=night;
    city.traverse(o=>{if(o.material&&o.material.emissive&&o.geometry&&o.geometry.type==='BoxGeometry'&&o.geometry.parameters.height===.95){o.material.emissive.setHex(night?0xffbd62:0x315b72);o.material.emissiveIntensity=night?.85:.12;}});
    timeLabel.textContent=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date());
    root.dataset.phase=night?'night':dusk?'sunset':hour<10?'morning':'day';
  }
  async function loadWeather(lat,lon){
    try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto');if(!r.ok)throw Error('weather unavailable');const j=await r.json();const c=j.current;weatherCode=c.weather_code;isRaining=[51,53,55,61,63,65,66,67,80,81,82,95,96,99].includes(weatherCode);rain.material.opacity=isRaining ? .72 : 0;weatherLabel.textContent=Math.round(c.temperature_2m)+'°C · '+(isRaining?'Rain':weatherCode===0?'Clear':weatherCode<=3?'Cloudy':weatherCode>=95?'Storm':'Current conditions');statusLabel.textContent='Live local weather';}catch(_){weatherLabel.textContent='Weather unavailable';statusLabel.textContent='Local time · weather not connected';}
  }
  function initWeather(){if(!navigator.geolocation){statusLabel.textContent='Local time · weather permission unavailable';return;}navigator.geolocation.getCurrentPosition(p=>loadWeather(p.coords.latitude,p.coords.longitude),()=>{statusLabel.textContent='Local time · weather permission declined';},{timeout:9000,maximumAge:900000});}
  root.querySelectorAll('[data-city-preview]').forEach(b=>b.addEventListener('click',()=>{const p=b.dataset.cityPreview;const h=p==='night'?22:p==='sunset'?18:p==='morning'?8:13;const now=new Date();now.setHours(h,0,0,0);const real=Date.prototype.getHours;const phase=p;root.dataset.phase=phase;scene.background=new THREE.Color(phase==='night'?0x08172e:phase==='sunset'?0xe8a17f:0x9bc9e8);scene.fog.color.copy(scene.background);sun.intensity=phase==='night'?.12:phase==='sunset'?.7:1.8;hemi.intensity=phase==='night'?.25:1;stars.material.opacity=phase==='night'?.9:0;moon.visible=phase==='night';}));
  root.querySelector('[data-city-live]')?.addEventListener('click',()=>{applyTime();});
  canvas.addEventListener('pointerdown',e=>{dragging=true;prevX=e.clientX;prevY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;targetY+=(e.clientX-prevX)*.004;targetX=Math.max(-.5,Math.min(.5,targetX+(e.clientY-prevY)*.003));prevX=e.clientX;prevY=e.clientY;});
  ['pointerup','pointercancel'].forEach(n=>canvas.addEventListener(n,()=>dragging=false));
  function resize(){const w=root.clientWidth,h=Math.max(390,root.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(root);resize();
  let raf=0;function animate(){if(paused)return;raf=requestAnimationFrame(animate);if(!reduced&&!dragging){city.rotation.y+=(targetY-city.rotation.y)*.025;city.rotation.x+=(targetX-city.rotation.x)*.025;orb.rotation.y+=.003;ring.rotation.z+=.002;}if(isRaining){const a=rainGeo.attributes.position;for(let i=0;i<a.count;i++){let y=a.getY(i)-1.3;if(y<0)y=90;a.setY(i,y);}a.needsUpdate=true;}renderer.render(scene,camera);}
  document.addEventListener('visibilitychange',()=>{paused=document.hidden;if(!paused&&!raf)animate();if(paused&&raf){cancelAnimationFrame(raf);raf=0;}});
  applyTime();initWeather();animate();setInterval(applyTime,60000);
  root.querySelector('[data-city-pause]')?.addEventListener('click',e=>{paused=!paused;e.currentTarget.setAttribute('aria-pressed',String(paused));e.currentTarget.innerHTML=paused?'<i class="fa-solid fa-play"></i> Resume':'<i class="fa-solid fa-pause"></i> Pause';if(!paused)animate();else{cancelAnimationFrame(raf);raf=0;}});
})();