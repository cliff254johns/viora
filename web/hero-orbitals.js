/* VIORA live orbital layer — positions propagated from current CelesTrak GP/TLE data.
   Earth projection deliberately shares VioraHeroGlobe's camera rotation and tilt. */
(() => {
  'use strict';
  const CATALOG_URLS = [
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=STATIONS&FORMAT=3LE',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=VISUAL&FORMAT=3LE'
  ];
  const CACHE_KEY='viora.orbital.tle.v1';
  const CACHE_TTL=6*60*60*1000;
  const MAX_VISUAL=18;
  let objects=[], canvas,ctx,container,raf=0,lastDraw=0,active=null,resizeObserver,lastPositions=[];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function parse3LE(text){
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];
    for(let i=0;i<lines.length-2;i++){
      if(lines[i+1].startsWith('1 ')&&lines[i+2].startsWith('2 ')){
        out.push({name:lines[i].replace(/^0\s*/,''),l1:lines[i+1],l2:lines[i+2]});i+=2;
      }
    } return out;
  }
  async function loadCatalog(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(cached&&Date.now()-cached.at<CACHE_TTL&&Array.isArray(cached.rows))return cached.rows;
    }catch(_){}
    const groups=await Promise.all(CATALOG_URLS.map(async url=>{
      const response=await fetch(url,{mode:'cors',cache:'no-store'});
      if(!response.ok)throw new Error('Orbital catalogue unavailable');
      return parse3LE(await response.text());
    }));
    const all=[...groups[0],...groups[1]];
    const unique=new Map(all.map(x=>[x.l1.slice(2,7),x]));
    const rows=[...unique.values()];
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),rows}));}catch(_){}
    return rows;
  }
  function makeCanvas(){
    container=document.getElementById('globe-container');
    if(!container)return false;
    canvas=document.createElement('canvas');
    canvas.className='viora-orbital-overlay';
    canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'4'});
    container.appendChild(canvas);ctx=canvas.getContext('2d');
    const legend=document.createElement('div');legend.className='viora-orbit-legend';
    legend.innerHTML='<span><i class="viora-orbit-dot iss"></i> ISS · live</span><span><i class="viora-orbit-dot sat"></i> Satellites · live</span>';
    const visual=container.closest('.hero-visual');
    if(visual)visual.appendChild(legend);
    const hint=visual&&visual.querySelector('.hero-globe-hint');
    if(hint){hint.textContent='Drag to explore · orbital positions update live';}
    if(window.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);}
    window.addEventListener('resize',resize,{passive:true});resize();
    return true;
  }
  function resize(){
    if(!canvas||!container)return;
    const r=container.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function project(lat,lon,altKm,state,w,h){
    const phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;
    const v={x:-Math.sin(phi)*Math.cos(theta),y:Math.cos(phi),z:Math.sin(phi)*Math.sin(theta)};
    const ry=state.rotation||0,tx=state.tilt||0,cy=Math.cos(ry),sy=Math.sin(ry),cx=Math.cos(tx),sx=Math.sin(tx);
    const p={x:cy*v.x-sy*v.z,y:sx*sy*v.x+cx*v.y+sx*cy*v.z,z:cx*sy*v.x-sx*v.y+cx*cy*v.z};
    const base=(Math.min(w,h)/2-6)*(state.zoom||1);
    const radius=Math.max(8,Math.min(base,Number(state.maxRadius)>0?Number(state.maxRadius):72));
    const altitudeScale=1+clamp(altKm/6371,0,.12);
    return {x:w/2+p.x*radius*altitudeScale,y:h/2-p.y*radius*altitudeScale,z:p.z,radius};
  }
  function satellitePosition(satrec,now){
    const pv=window.satellite.propagate(satrec,now);
    if(!pv||!pv.position)return null;
    const gmst=window.satellite.gstime(now);
    const geo=window.satellite.eciToGeodetic(pv.position,gmst);
    return {lat:window.satellite.degreesLat(geo.latitude),lon:window.satellite.degreesLong(geo.longitude),alt:geo.height};
  }
  function draw(ts){
    raf=requestAnimationFrame(draw);
    if(!ctx||!window.VioraHeroGlobe||!window.VioraHeroGlobe._state)return;
    if(ts-lastDraw<33)return;lastDraw=ts;
    const state=window.VioraHeroGlobe._state,r=container.getBoundingClientRect(),w=r.width,h=r.height;
    if(!w||!h)return;
    ctx.clearRect(0,0,w,h);
    const now=new Date(),positions=[];
    for(const obj of objects){
      const geo=satellitePosition(obj.satrec,now);if(!geo)continue;
      const p=project(geo.lat,geo.lon,geo.alt,state,w,h);
      if(p.z<=0.02)continue;
      positions.push({...p,obj,geo});
    }
    // Satellites behind Earth are intentionally occluded; draw spacecraft silhouettes.
    lastPositions=positions;
    for(const item of positions){
      const isISS=item.obj.name.toUpperCase().includes('ISS');
      const color=isISS?'#ffb547':'#67e8f9',size=isISS?6:3.6;
      ctx.save();ctx.translate(item.x,item.y);ctx.rotate(-.42);
      ctx.globalAlpha=clamp(.48+item.z*.52,.4,1);ctx.shadowBlur=isISS?18:10;ctx.shadowColor=color;
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=isISS?1.5:1.1;
      if(isISS){
        ctx.fillRect(-3,-3,6,6);ctx.strokeRect(-3,-3,6,6);
        ctx.fillRect(-15,-2,10,4);ctx.fillRect(5,-2,10,4);
        ctx.beginPath();ctx.moveTo(-15,-5);ctx.lineTo(-15,5);ctx.moveTo(15,-5);ctx.lineTo(15,5);ctx.stroke();
        ctx.beginPath();ctx.arc(0,0,13+Math.sin(ts/260)*2,0,Math.PI*2);ctx.stroke();
      }else{
        ctx.fillRect(-2,-2,4,4);ctx.fillRect(-size*2,-1,size*1.4,2);ctx.fillRect(size*.6,-1,size*1.4,2);
        ctx.beginPath();ctx.moveTo(-size*2,-3);ctx.lineTo(-size*2,3);ctx.moveTo(size*2,-3);ctx.lineTo(size*2,3);ctx.stroke();
      }
      ctx.restore();
      if(active===item.obj.name){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(item.x,item.y,isISS?19:12,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
    // Keep selected satellite details in the accessible live status card.
    if(active){
      const found=positions.find(x=>x.obj.name===active);
      if(found){const panel=document.getElementById('viora-orbit-detail');if(panel)panel.textContent=active+' · '+found.geo.lat.toFixed(1)+'°, '+found.geo.lon.toFixed(1)+'° · '+Math.round(found.geo.alt)+' km altitude';}
    }
  }
  async function init(){
    if(!makeCanvas())return;
    try{
      if(!window.satellite){
        await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/satellite.js@6.0.1/dist/satellite.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
      }
      const rows=await loadCatalog();
      const iss=rows.filter(x=>/ISS \(ZARYA\)/i.test(x.name)||/ISS/i.test(x.name)).slice(0,1);
      const others=rows.filter(x=>!iss.includes(x)).slice(0,MAX_VISUAL);
      objects=[...iss,...others].map(x=>({...x,satrec:window.satellite.twoline2satrec(x.l1,x.l2)}));
      if(!objects.length)throw new Error('No current orbital elements returned');
      container.addEventListener('click',e=>{const rect=container.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let nearest=null,best=18;for(const p of lastPositions){const d=Math.hypot(p.x-x,p.y-y);if(d<best){best=d;nearest=p;}}if(nearest){active=nearest.obj.name;const panel=document.getElementById('viora-orbit-detail');if(panel)panel.textContent=(active.toUpperCase().includes('ISS')?'NASA INTERNATIONAL SPACE STATION':'ORBITAL SATELLITE')+' · '+active+' · '+nearest.geo.lat.toFixed(2)+'°, '+nearest.geo.lon.toFixed(2)+'° · '+Math.round(nearest.geo.alt)+' km altitude';}});
      const detail=document.createElement('div');detail.id='viora-orbit-detail';detail.className='viora-orbit-detail';
      detail.setAttribute('aria-live','polite');detail.textContent='Live orbital data loaded · '+objects.length+' tracked objects';
      const visual=container.closest('.hero-visual');if(visual)visual.appendChild(detail);
      if(!iss.length){detail.textContent='Live satellite positions loaded · ISS data is temporarily unavailable';}
      if(!raf)raf=requestAnimationFrame(draw);
    }catch(error){console.warn('[VIORA orbital layer]',error);const d=document.getElementById('viora-orbit-detail');if(d)d.textContent='Live orbital data temporarily unavailable';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
