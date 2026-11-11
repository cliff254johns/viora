/* VIORA C2 — cinematic, photo-led city banner with live atmosphere.
   The original hero globe remains powered by index-home.js; this scene never
   creates substitute box buildings or a second globe. */
(() => {
  'use strict';
  const root=document.getElementById('viora-city');
  const canvas=document.getElementById('viora-city-canvas');
  const stage=root?.querySelector('.city-stage');
  if(!root||!canvas||!stage)return;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timeLabel=root.querySelector('[data-city-time]');
  const weatherLabel=root.querySelector('[data-city-weather]');
  const statusLabel=root.querySelector('[data-city-status]');
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  let width=1,height=1,dpr=1,manualPhase=null,paused=false,frame=0,last=0;
  let latitude=-0.286,longitude=36.817,timezone='Africa/Nairobi',weatherLoaded=false;
  const clouds=Array.from({length:9},(_,i)=>({x:(i/9)*1.25-.1,y:.08+(i%4)*.105,scale:.65+(i%3)*.34,speed:.000006+(i%4)*.000002,alpha:.12+(i%3)*.035}));
  const stars=Array.from({length:115},(_,i)=>({x:((i*97)%997)/997,y:.04+((i*53)%390)/1000,r:.45+(i%4)*.22,a:.3+(i%6)*.1}));
  function resize(){const r=stage.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);dpr=Math.min(window.devicePixelRatio||1,1.6);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
  function julian(date){return date.getTime()/86400000+2440587.5;}
  function phaseAge(date){return ((julian(date)-2451550.1)%29.530588853+29.530588853)%29.530588853/29.530588853;}
  function solar(date){const n=julian(date)-2451545,L=((280.46+.9856474*n)%360+360)%360,g=((357.528+.9856003*n)%360+360)%360*Math.PI/180,lam=(L+1.915*Math.sin(g)+.020*Math.sin(2*g))*Math.PI/180,ob=(23.439-.0000004*n)*Math.PI/180,ra=Math.atan2(Math.cos(ob)*Math.sin(lam),Math.cos(lam)),dec=Math.asin(Math.sin(ob)*Math.sin(lam)),jd=julian(date),T=(jd-2451545)/36525,gmst=(280.46061837+360.98564736629*(jd-2451545)+.000387933*T*T)*Math.PI/180,H=((gmst+longitude*Math.PI/180-ra+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI,p=latitude*Math.PI/180,elev=Math.asin(Math.sin(p)*Math.sin(dec)+Math.cos(p)*Math.cos(dec)*Math.cos(H));return {elev,az:Math.atan2(-Math.sin(H),Math.tan(dec)*Math.cos(p)-Math.sin(p)*Math.cos(H))};}
  function currentPhase(now){if(manualPhase)return manualPhase;const e=solar(now).elev;return e<-5?'night':e<5?'sunset':e>18?'day':'morning';}
  function drawCloud(x,y,s,alpha){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(0,0,4,0,0,88);g.addColorStop(0,'rgba(245,250,255,.72)');g.addColorStop(.48,'rgba(220,235,248,.32)');g.addColorStop(1,'rgba(190,214,235,0)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,104,32,0,0,Math.PI*2);ctx.ellipse(-45,-9,48,27,0,0,Math.PI*2);ctx.ellipse(38,-13,58,35,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawMoon(x,y,r,age){ctx.save();ctx.shadowColor='rgba(220,235,255,.55)';ctx.shadowBlur=18;ctx.fillStyle='#e6edf5';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalCompositeOperation='source-atop';ctx.fillStyle='rgba(70,83,103,.22)';[[ -.28,-.24,.18],[.3,-.38,.12],[.2,.25,.22],[-.42,.3,.1]].forEach(([a,b,c])=>{ctx.beginPath();ctx.arc(x+a*r*2,y+b*r*2,r*c*2,0,Math.PI*2);ctx.fill();});ctx.globalCompositeOperation='source-over';ctx.fillStyle='rgba(4,10,23,.96)';const illum=(1-Math.cos(age*2*Math.PI))/2,term=Math.abs(1-2*illum)*r;ctx.beginPath();if(age<.5){ctx.arc(x,y,r,-Math.PI/2,Math.PI/2);ctx.ellipse(x,y,term,r,0,Math.PI/2,-Math.PI/2,true);}else{ctx.arc(x,y,r,Math.PI/2,Math.PI*1.5);ctx.ellipse(x,y,term,r,0,-Math.PI/2,Math.PI/2,true);}ctx.closePath();ctx.fill();ctx.restore();}
  function paint(now,dt){ctx.clearRect(0,0,width,height);const date=new Date(),sun=solar(date),phase=currentPhase(date),night=phase==='night',sunX=width*(.18+(.5+Math.sin((date.getHours()+date.getMinutes()/60)/24*Math.PI*2)*.34)),sunY=height*(.12+clamp((18-sun.elev*180/Math.PI)/110,.02,.38));root.dataset.phase=phase;
    const starAlpha=night?.92:phase==='sunset'?.12:0;if(starAlpha){ctx.fillStyle='#fff';stars.forEach(s=>{ctx.globalAlpha=s.a*starAlpha;ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;}
    if(!night){const radius=Math.max(24,Math.min(46,width*.045)),glow=ctx.createRadialGradient(sunX,sunY,2,sunX,sunY,radius*3.4);glow.addColorStop(0,'rgba(255,242,205,.92)');glow.addColorStop(.22,'rgba(255,210,145,.34)');glow.addColorStop(1,'rgba(255,190,120,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(sunX,sunY,radius*3.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0cb';ctx.beginPath();ctx.arc(sunX,sunY,radius*.48,0,Math.PI*2);ctx.fill();}
    if(night||phase==='sunset'){const age=phaseAge(date);drawMoon(width*.78,height*.19,Math.min(27,width*.032),age);}
    clouds.forEach(c=>{if(!reduced&&!paused)c.x+=c.speed*dt;if(c.x>1.35)c.x=-.25;drawCloud(c.x*width,c.y*height,c.scale,phase==='night'?c.alpha*.36:c.alpha);});
    if(timeLabel)timeLabel.textContent=new Intl.DateTimeFormat('en-KE',{hour:'2-digit',minute:'2-digit',timeZone:timezone,timeZoneName:'short'}).format(date);
  }
  function animate(t){if(paused||document.hidden)return;frame=requestAnimationFrame(animate);const dt=last?Math.min(64,t-last):16;last=t;paint(t,dt);}
  function start(){if(!frame&&!paused){last=0;frame=requestAnimationFrame(animate);}}
  root.querySelectorAll('[data-city-preview]').forEach(b=>b.addEventListener('click',()=>{manualPhase=b.dataset.cityPreview;paint(performance.now(),16);}));
  root.querySelector('[data-city-live]')?.addEventListener('click',()=>{manualPhase=null;paint(performance.now(),16);});
  root.querySelector('[data-city-pause]')?.addEventListener('click',e=>{paused=!paused;e.currentTarget.setAttribute('aria-pressed',String(paused));e.currentTarget.innerHTML=paused?'<i class="fa-solid fa-play"></i> Resume':'<i class="fa-solid fa-pause"></i> Pause';if(paused){cancelAnimationFrame(frame);frame=0;}else start();});
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
  async function weather(lat,lon){try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,precipitation,weather_code&timezone=auto');if(!r.ok)throw Error();const j=await r.json(),c=j.current;weatherLabel.textContent=Math.round(c.temperature_2m)+'°C · '+(c.precipitation>0?'Rain':c.weather_code===0?'Clear':c.weather_code<=3?'Cloudy':'Current conditions');statusLabel.textContent='Local weather · '+(j.timezone||timezone);weatherLoaded=true;}catch(_){weatherLabel.textContent='Weather unavailable';statusLabel.textContent='Live sky · weather unavailable';}}
  if(navigator.geolocation){navigator.geolocation.getCurrentPosition(p=>{latitude=p.coords.latitude;longitude=p.coords.longitude;timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||timezone;weather(latitude,longitude);},()=>weather(latitude,longitude),{timeout:6500,maximumAge:900000});}else weather(latitude,longitude);
  if(!weatherLoaded&&weatherLabel)weatherLabel.textContent='Local sky conditions';
  if(statusLabel)statusLabel.textContent='Astronomical sky · local time';
  paint(performance.now(),16);start();
  const timer=setInterval(()=>{if(!manualPhase)paint(performance.now(),16);},60000);
  window.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();cancelAnimationFrame(frame);},{once:true});
})();