/* VIORA immersive ecosystem city — time-aware sky, solar lighting and lunar phases */
(() => {
  'use strict';
  const root=document.getElementById('viora-city'), canvas=document.getElementById('viora-city-canvas');
  if(!root||!canvas||!window.THREE)return;
  const T=window.THREE, reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(48,1,.1,1000);
  camera.position.set(48,42,88);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
  if(T.SRGBColorSpace)renderer.outputColorSpace=T.SRGBColorSpace; else if(T.sRGBEncoding)renderer.outputEncoding=T.sRGBEncoding;
  scene.fog=new T.FogExp2(0x8ebbd8,.0025);
  const hemi=new T.HemisphereLight(0xd9efff,0x34465a,1);scene.add(hemi);
  const sun=new T.DirectionalLight(0xffe6bd,2);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-130;sun.shadow.camera.right=130;sun.shadow.camera.top=130;sun.shadow.camera.bottom=-130;scene.add(sun);
  const city=new T.Group();scene.add(city);
  const ground=new T.Mesh(new T.PlaneGeometry(260,220),new T.MeshStandardMaterial({color:0x718b83,roughness:.94}));ground.rotation.x=-Math.PI/2;ground.position.y=-.3;ground.receiveShadow=true;city.add(ground);
  const roadMat=new T.MeshStandardMaterial({color:0x303b48,roughness:.9});
  for(let z=-75;z<=75;z+=42){const road=new T.Mesh(new T.BoxGeometry(240,.12,8),roadMat);road.position.set(0,.02,z);city.add(road);}
  for(let x=-100;x<=100;x+=48){const road=new T.Mesh(new T.BoxGeometry(8,.12,190),roadMat);road.position.set(x,.03,0);city.add(road);}
  const palette=[0x3e7f9e,0x6c91a3,0x8a9da6,0x496b7c,0x9aabaf,0x587d89];
  const windowMats=[];
  function building(x,z,w,h,d,color,accent){
    const g=new T.Group(),body=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.48,metalness:.2}));
    body.position.y=h/2;body.castShadow=true;body.receiveShadow=true;g.add(body);
    const roof=new T.Mesh(new T.BoxGeometry(w+.5,.45,d+.5),new T.MeshStandardMaterial({color:accent,metalness:.35,roughness:.4}));roof.position.y=h+.2;g.add(roof);
    const cols=Math.max(2,Math.floor(w/2.2)),rows=Math.max(2,Math.floor((h-3)/2.5));
    for(let side=0;side<4;side++)for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const lit=Math.random()<.36,mat=new T.MeshStandardMaterial({color:lit?0xffdca0:0x9fd8f0,emissive:lit?0xffa83b:0x17364a,emissiveIntensity:lit?.05:.06,roughness:.3});
      windowMats.push({mat,lit});
      const win=new T.Mesh(new T.BoxGeometry(.82,.92,.07),mat);
      const px=-w/2+1.1+c*((w-2.2)/Math.max(1,cols-1)),py=2+r*2.5,pz=-d/2-.045;
      if(side===0)win.position.set(px,py,d/2+.045);
      if(side===1)win.position.set(-px,py,-d/2-.045);
      if(side===2){win.rotation.y=Math.PI/2;win.position.set(w/2+.045,py,px*d/w);}
      if(side===3){win.rotation.y=Math.PI/2;win.position.set(-w/2-.045,py,-px*d/w);}
      g.add(win);
    }
    g.position.set(x,0,z);city.add(g);
  }
  const lots=[[-53,-34,13,24,12],[-25,-42,15,34,13],[18,-43,14,28,12],[51,-30,16,22,14],[-57,18,15,30,13],[-25,37,14,25,12],[26,34,16,31,14],[58,18,13,19,12],[-5,-65,11,18,10],[4,63,12,22,11]];
  lots.forEach((a,i)=>building(...a,palette[i%palette.length],0x9bc5d2));
  // Central shared-data landmark.
  const tower=new T.Group(),plinth=new T.Mesh(new T.CylinderGeometry(10,13,2,8),new T.MeshStandardMaterial({color:0x233b50,metalness:.65,roughness:.3}));
  plinth.position.y=1;tower.add(plinth);
  const shaft=new T.Mesh(new T.CylinderGeometry(4.2,6,29,8),new T.MeshStandardMaterial({color:0xb7d4df,metalness:.72,roughness:.24,emissive:0x102d42}));shaft.position.y=16;tower.add(shaft);
  const orb=new T.Mesh(new T.SphereGeometry(7,32,24),new T.MeshStandardMaterial({color:0x6fc8e8,metalness:.4,roughness:.18,emissive:0x14628b,emissiveIntensity:.8}));orb.position.y=34;tower.add(orb);
  const ring=new T.Mesh(new T.TorusGeometry(10,.28,8,64),new T.MeshBasicMaterial({color:0x8ee7ff}));ring.position.y=34;ring.rotation.x=Math.PI/2.8;tower.add(ring);city.add(tower);
  // Tree-lined parks and warm street lamps.
  for(let i=0;i<34;i++){const x=((i*37)%150)-75,z=((i*53)%130)-65;if(Math.abs(x)<15&&Math.abs(z)<15)continue;
    const trunk=new T.Mesh(new T.CylinderGeometry(.22,.32,2,6),new T.MeshStandardMaterial({color:0x72553b}));trunk.position.set(x,1,z);city.add(trunk);
    const crown=new T.Mesh(new T.SphereGeometry(1.6,8,7),new T.MeshStandardMaterial({color:i%2?0x477d58:0x638c5c,roughness:1}));crown.position.set(x,2.8,z);crown.scale.y=1.15;city.add(crown);
  }
  const lamps=[];
  for(let i=0;i<18;i++){const x=(i%6-2.5)*32,z=(Math.floor(i/6)-1)*52;
    const pole=new T.Mesh(new T.CylinderGeometry(.12,.18,5,6),new T.MeshStandardMaterial({color:0x344554,metalness:.6}));pole.position.set(x,2.5,z);city.add(pole);
    const bulb=new T.Mesh(new T.SphereGeometry(.42,8,8),new T.MeshBasicMaterial({color:0xffd18a}));bulb.position.set(x,5.1,z);city.add(bulb);
    const light=new T.PointLight(0xffc77d,0,17,2);light.position.set(x,4.8,z);city.add(light);lamps.push(light);
  }
  // Sky dome and star field.
  const sky=new T.Mesh(new T.SphereGeometry(480,32,20),new T.MeshBasicMaterial({color:0x8ebbd8,side:T.BackSide}));scene.add(sky);
  const starGeo=new T.BufferGeometry(),starPos=[];for(let i=0;i<900;i++)starPos.push((Math.random()-.5)*500,Math.random()*180+35,(Math.random()-.5)*420);
  starGeo.setAttribute('position',new T.Float32BufferAttribute(starPos,3));
  const stars=new T.Points(starGeo,new T.PointsMaterial({color:0xffffff,size:1.05,transparent:true,opacity:0}));scene.add(stars);
  // Moon surface uses a generated texture with a physically meaningful illuminated fraction.
  const moonCanvas=document.createElement('canvas');moonCanvas.width=256;moonCanvas.height=256;
  const mc=moonCanvas.getContext('2d');const moonTexture=new T.CanvasTexture(moonCanvas);
  const moon=new T.Mesh(new T.SphereGeometry(5,48,40),new T.MeshStandardMaterial({map:moonTexture,color:0xffffff,roughness:1,emissive:0x343b48,emissiveIntensity:.18}));
  moon.position.set(-75,90,-100);scene.add(moon);
  const moonLight=new T.DirectionalLight(0xc5d9ff,0);moonLight.position.copy(moon.position).multiplyScalar(-1);scene.add(moonLight);
  const rainGeo=new T.BufferGeometry(),rainPos=[];for(let i=0;i<700;i++)rainPos.push((Math.random()-.5)*180,Math.random()*90,(Math.random()-.5)*150);
  rainGeo.setAttribute('position',new T.Float32BufferAttribute(rainPos,3));const rain=new T.Points(rainGeo,new T.PointsMaterial({color:0xcdeeff,size:.35,transparent:true,opacity:0}));scene.add(rain);
  const weatherLabel=root.querySelector('[data-city-weather]'),timeLabel=root.querySelector('[data-city-time]'),statusLabel=root.querySelector('[data-city-status]');
  let isRaining=false,paused=false,dragging=false,prevX=0,prevY=0,targetX=-.12,targetY=.35,lat=-.286,lon=36.817,tz='Africa/Nairobi',manualPhase=null,raf=0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function julianDay(d){return d.getTime()/86400000+2440587.5;}
  function moonPhase(date){const synodic=29.530588853,age=((julianDay(date)-2451550.1)%synodic+synodic)%synodic;return age/synodic;}
  function drawMoon(phase){const r=112,c=128;mc.clearRect(0,0,256,256);mc.save();mc.beginPath();mc.arc(c,c,r,0,Math.PI*2);mc.clip();
    const base=mc.createRadialGradient(90,80,8,c,c,r);base.addColorStop(0,'#f5f2e9');base.addColorStop(1,'#9299a6');mc.fillStyle=base;mc.fillRect(0,0,256,256);
    // Subtle lunar maria and craters.
    [[83,85,23],[151,62,15],[151,154,28],[75,169,13],[111,125,9],[188,115,8]].forEach(([x,y,rr])=>{mc.fillStyle='rgba(65,73,86,.15)';mc.beginPath();mc.arc(x,y,rr,0,Math.PI*2);mc.fill();});
    const waxing=phase<.5,illum=(1-Math.cos(phase*2*Math.PI))/2,term=Math.abs(1-2*illum)*r;
    mc.globalCompositeOperation='source-over';mc.fillStyle='rgba(15,20,34,.96)';
    if(waxing){mc.beginPath();mc.arc(c,c,r, -Math.PI/2,Math.PI/2);mc.ellipse(c,c,term,r,0,Math.PI/2,-Math.PI/2,true);mc.closePath();mc.fill();}
    else{mc.beginPath();mc.arc(c,c,r,Math.PI/2,Math.PI*1.5);mc.ellipse(c,c,term,r,0,-Math.PI/2,Math.PI/2,true);mc.closePath();mc.fill();}
    mc.restore();moonTexture.needsUpdate=true;
  }
  function solarPosition(date,latitude,longitude){
    const n=julianDay(date)-2451545, L=((280.46+.9856474*n)%360+360)%360, g=((357.528+.9856003*n)%360+360)%360*Math.PI/180;
    const lambda=(L+1.915*Math.sin(g)+.020*Math.sin(2*g))*Math.PI/180, ob=(23.439-.0000004*n)*Math.PI/180;
    const ra=Math.atan2(Math.cos(ob)*Math.sin(lambda),Math.cos(lambda)),dec=Math.asin(Math.sin(ob)*Math.sin(lambda));
    const jd=julianDay(date),T=(jd-2451545)/36525,gmst=(280.46061837+360.98564736629*(jd-2451545)+.000387933*T*T)*Math.PI/180;
    let H=gmst+longitude*Math.PI/180-ra;H=((H+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    const p=latitude*Math.PI/180,elev=Math.asin(Math.sin(p)*Math.sin(dec)+Math.cos(p)*Math.cos(dec)*Math.cos(H));
    const az=Math.atan2(-Math.sin(H),Math.tan(dec)*Math.cos(p)-Math.sin(p)*Math.cos(H));
    return {elev,az};
  }
  function applyTime(){
    const now=new Date(),pos=solarPosition(now,lat,lon),alt=pos.elev,day=clamp((alt+6)/18,0,1),night=clamp((-alt-2)/12,0,1);
    const twilight=Math.exp(-Math.pow((alt+2)/8,2)),phase=manualPhase;
    const skyColor=alt>12?new T.Color(0x78b7e0):alt>-6?new T.Color(0xe99b75).lerp(new T.Color(0x506d91),clamp((alt+6)/18,0,1)):new T.Color(0x07152b);
    if(phase){const colors={morning:0xd58f76,day:0x78b7e0,sunset:0xe99b75,night:0x07152b};skyColor.setHex(colors[phase]);}
    scene.background=skyColor;sky.material.color.copy(skyColor);scene.fog.color.copy(skyColor);
    const sunDir=new T.Vector3(Math.cos(alt)*Math.sin(pos.az),Math.sin(alt),Math.cos(alt)*Math.cos(pos.az)).normalize();
    sun.position.copy(sunDir).multiplyScalar(150);sun.intensity=phase?(phase==='night'?.04:phase==='sunset'?.65:1.7):.04+day*2.05+twilight*.35;
    sun.color.set(alt<8?0xffb27e:0xfff0d6);hemi.intensity=.18+day*.95;
    stars.material.opacity=phase?(phase==='night'?.92:0):night*.92;
    const age=moonPhase(now),illum=(1-Math.cos(age*2*Math.PI))/2;drawMoon(age);
    moon.visible=phase?phase==='night':(alt<8);
    moon.position.set(-75+Math.cos(age*2*Math.PI)*13,65+Math.sin(age*2*Math.PI)*20,-100);
    moonLight.position.copy(moon.position).multiplyScalar(-1);moonLight.intensity=moon.visible?.12+illum*.16:0;
    windowMats.forEach(({mat,lit})=>{mat.emissive.setHex(lit?0xffad4d:0x17364a);mat.emissiveIntensity=lit?(phase==='night'||(!phase&&night>.25)?1.15:.025):.035;});
    lamps.forEach(l=>{l.intensity=phase==='night'||(!phase&&night>.25)?1.25:0;});
    root.dataset.phase=phase|| (alt<-6?'night':alt<5?'sunset':alt>18?'day':'golden');
    timeLabel.textContent=new Intl.DateTimeFormat('en-KE',{hour:'2-digit',minute:'2-digit',timeZone:tz,timeZoneName:'short'}).format(now);
  }
  async function loadWeather(a,b){
    try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+a+'&longitude='+b+'&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto');if(!r.ok)throw Error('weather unavailable');const j=await r.json(),c=j.current;
      isRaining=[51,53,55,61,63,65,66,67,80,81,82,95,96,99].includes(c.weather_code);rain.material.opacity=isRaining?.62:0;
      weatherLabel.textContent=Math.round(c.temperature_2m)+'°C · '+(isRaining?'Rain':c.weather_code===0?'Clear':c.weather_code<=3?'Cloudy':c.weather_code>=95?'Storm':'Current conditions');statusLabel.textContent='Live local weather';
    }catch(_){weatherLabel.textContent='Weather unavailable';statusLabel.textContent='Solar clock active · weather unavailable';}
  }
  function initWeather(){if(!navigator.geolocation){statusLabel.textContent='Using East Africa reference · weather unavailable';loadWeather(lat,lon);return;}
    navigator.geolocation.getCurrentPosition(p=>{lat=p.coords.latitude;lon=p.coords.longitude;tz=Intl.DateTimeFormat().resolvedOptions().timeZone||tz;statusLabel.textContent='Location-based sky and weather';loadWeather(lat,lon);applyTime();},()=>{statusLabel.textContent='Using East Africa reference · location not shared';loadWeather(lat,lon);},{timeout:7000,maximumAge:900000});}
  root.querySelectorAll('[data-city-preview]').forEach(b=>b.addEventListener('click',()=>{manualPhase=b.dataset.cityPreview;applyTime();}));
  root.querySelector('[data-city-live]')?.addEventListener('click',()=>{manualPhase=null;applyTime();});
  root.querySelector('[data-city-pause]')?.addEventListener('click',e=>{paused=!paused;e.currentTarget.setAttribute('aria-pressed',String(paused));e.currentTarget.innerHTML=paused?'<i class="fa-solid fa-play"></i> Resume':'<i class="fa-solid fa-pause"></i> Pause';if(!paused)animate();else{cancelAnimationFrame(raf);raf=0;}});
  canvas.addEventListener('pointerdown',e=>{dragging=true;prevX=e.clientX;prevY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;targetY+=(e.clientX-prevX)*.004;targetX=clamp(targetX+(e.clientY-prevY)*.003,-.5,.5);prevX=e.clientX;prevY=e.clientY;});
  ['pointerup','pointercancel','lostpointercapture'].forEach(n=>canvas.addEventListener(n,()=>dragging=false));
  const stage=root.querySelector('.city-stage');
  function resize(){const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function animate(){if(paused||document.hidden)return;raf=requestAnimationFrame(animate);if(!reduced&&!dragging){city.rotation.y+=(targetY-city.rotation.y)*.025;city.rotation.x+=(targetX-city.rotation.x)*.025;orb.rotation.y+=.003;ring.rotation.z+=.002;}
    if(isRaining){const a=rainGeo.attributes.position;for(let i=0;i<a.count;i++){let y=a.getY(i)-1.3;if(y<0)y=90;a.setY(i,y);}a.needsUpdate=true;}renderer.render(scene,camera);}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else animate();});
  applyTime();initWeather();animate();const clock=setInterval(applyTime,60000);
  window.addEventListener('pagehide',()=>{clearInterval(clock);observer.disconnect();cancelAnimationFrame(raf);},{once:true});
})();