/* VIORA public homepage: use the exact dashboard hero lifecycle and state. */
(() => {
'use strict';
if(window.__vioraCitySkyAdapterBooted)return;window.__vioraCitySkyAdapterBooted=true;
const stage=document.getElementById('vioraHeroBanner');if(!stage)return;
const $=s=>stage.querySelector(s);let activeLocation=null,weatherRequest=0;
const browserTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(_){return'UTC'}};
function updateClock(){const out=$('[data-city-time]'),name=$('[data-city-name]');if(!out||!activeLocation)return;
const now=window.VioraTime?.now?window.VioraTime.now():new Date(),tz=activeLocation.tz||browserTz();
try{out.textContent=new Intl.DateTimeFormat(undefined,{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(now)}catch(_){out.textContent=new Date().toLocaleTimeString()}
const userSelected=stage.dataset.cityUserSelected==='true';if(name){name.textContent=userSelected?(activeLocation.name||activeLocation.label||'Selected city'):'';name.hidden=!userSelected;name.setAttribute('aria-hidden',String(!userSelected))}stage.dataset.internetTimeSynced=String(!!window.VioraTime?.isSynced?.());stage.dataset.internetTimeSource=window.VioraTime?.source?.()||'local-clock-fallback'}
function iconFor(code){const n=Number(code);if(n===0)return'fa-sun';if([1,2].includes(n))return'fa-cloud-sun';if([3,45,48].includes(n))return'fa-cloud';if(n>=51&&n<=67)return'fa-cloud-rain';if(n>=71&&n<=86)return'fa-snowflake';if(n>=95)return'fa-cloud-bolt';return'fa-cloud-sun'}
function paintWeather(w){const out=$('[data-city-weather]'),icon=$('[data-city-weather-icon]');if(!out)return;
if(!w||w.tempC==null){out.textContent='Live weather unavailable';if(icon)icon.className='fa-solid fa-cloud';stage.dataset.weatherStatus='unavailable';return}
const h=w.humidity!=null&&Number.isFinite(Number(w.humidity))?Math.round(Number(w.humidity)):null;
const wind=w.windKph!=null&&Number.isFinite(Number(w.windKph))?Math.round(Number(w.windKph)):null;
out.textContent=Math.round(Number(w.tempC))+'°C · '+(w.text||'Current conditions')+(h==null?'':' · '+h+'% humidity')+(wind==null?'':' · '+wind+' km/h wind');
if(icon)icon.className='fa-solid '+iconFor(w.code);stage.dataset.weatherStatus='ready';stage.dataset.weatherCode=String(w.code??'')}
async function refreshWeather(force=true){const id=++weatherRequest,api=window.VioraHero;if(!api?.refreshWeather){paintWeather(null);return}
try{const w=await api.refreshWeather(force);if(id===weatherRequest)paintWeather(w)}catch(e){console.warn('[VIORA homepage] weather refresh failed',e);if(id===weatherRequest)paintWeather(null)}}
function applyLocation(loc){if(!loc||loc.lat==null||loc.lon==null||!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lon)))return;
activeLocation={...loc,lat:Number(loc.lat),lon:Number(loc.lon),tz:loc.tz||browserTz()};window.VioraCityLocation=activeLocation;
try{window.VioraTime?.setTimezone?.(activeLocation.tz)}catch(_){}stage.dataset.locationAccuracy=loc.accuracy||'approximate';stage.dataset.locationName=activeLocation.name||activeLocation.id||'local';updateClock()}
function onCityChange(payload){const loc=payload?.location||window.VioraHero?.getLocation?.();if(!loc)return;if(stage.dataset.homeSkyBoot==='rendered'){stage.dataset.cityUserSelected='true'}applyLocation(loc);
requestAnimationFrame(()=>{try{window.renderVioraHero?.(true)}catch(e){console.warn('[VIORA homepage] render',e)}refreshWeather(true)})}
async function ipLocation(){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),5000);try{
const r=await fetch('https://ipapi.co/json/',{cache:'no-store',signal:ctrl.signal});if(!r.ok)throw Error('IP location HTTP '+r.status);const d=await r.json();
if(d.latitude==null||d.longitude==null||!Number.isFinite(Number(d.latitude))||!Number.isFinite(Number(d.longitude)))throw Error('No IP coordinates');
return{id:'visitor-ip-'+String(d.city||'local').toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:[d.city,d.region].filter(Boolean).join(', ')||'Your local city',lat:Number(d.latitude),lon:Number(d.longitude),tz:d.timezone||browserTz(),accuracy:'internet'};
}finally{clearTimeout(timer)}}
async function loadStarCatalogue(){
try{
const r=await fetch('/main/stars.bin',{cache:'force-cache'});if(!r.ok)throw Error('Star catalogue HTTP '+r.status);
const buf=await r.arrayBuffer();if(buf.byteLength<2)throw Error('Empty star catalogue');
const view=new DataView(buf),recordBytes=16;if(!buf.byteLength||buf.byteLength%recordBytes!==0)throw Error('Invalid Float32 star catalogue length');
const count=buf.byteLength/recordBytes;if(count<2000||count>20000)throw Error('Invalid real star count '+count);
const stars=[];for(let off=0,i=0;i<count;i++,off+=recordBytes){const raRad=view.getFloat32(off,true),decRad=view.getFloat32(off+4,true),mag=view.getFloat32(off+8,true),bv=view.getFloat32(off+12,true);if(!Number.isFinite(raRad)||!Number.isFinite(decRad)||!Number.isFinite(mag)||!Number.isFinite(bv)||raRad<0||raRad>=Math.PI*2||decRad< -Math.PI/2||decRad>Math.PI/2||mag< -2||mag>12||bv< -1||bv>4)throw Error('Invalid astronomical star record '+i);stars.push({ra:raRad*12/Math.PI,dec:decRad*180/Math.PI,mag,bv})}
const globe=window.VioraHeroGlobe||{};globe._starCatalog=()=>stars;if(!window.VioraHeroGlobe)window.VioraHeroGlobe=globe;
window.VioraSky?.refreshCatalog?.();stage.dataset.starCatalogue='loaded';
}catch(e){stage.dataset.starCatalogue='fallback';console.warn('[VIORA homepage] star catalogue fallback',e)}
}
function deviceLocation(){return new Promise(resolve=>{if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(p=>resolve({id:'visitor-device',name:'Your current city',lat:p.coords.latitude,lon:p.coords.longitude,tz:browserTz(),accuracy:'device'}),()=>resolve(null),{enableHighAccuracy:false,timeout:6000,maximumAge:900000})})}
async function boot(){
function removeLegacyLocationControls(){
const selectors='#vioraHeroChangeLocationBtn,.viora-hero-location-trigger,[data-open-location-picker],#vioraHeroLocationBtn,.viora-hero-location-button,[aria-label="Select location" i],[title="Select location" i]';
stage.querySelectorAll(selectors).forEach(el=>el.remove());
stage.querySelectorAll('button,a,[role="button"]').forEach(el=>{
const label=[el.textContent,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
if(/^\s*(select|change)\s+location\s*$/i.test(label))el.remove();
});
}
removeLegacyLocationControls();
const initialCityName=$('[data-city-name]');if(initialCityName){initialCityName.textContent='';initialCityName.hidden=true;initialCityName.setAttribute('aria-hidden','true')}
stage.dataset.cityUserSelected='false';
// Load the real J2000 star catalogue immediately; do not wait for IP lookup or weather.
loadStarCatalogue();
const api=window.VioraHero;if(api?.on)api.on('cityChange',onCityChange);
let loc=null;try{loc=await ipLocation()}catch(e){console.warn('[VIORA homepage] IP city lookup failed',e)}
if(!loc)loc=await deviceLocation();
if(!loc){const cur=api?.getLocation?.();loc=cur&&cur.lat!=null&&cur.lon!=null?{...cur,accuracy:'timezone-fallback'}:{id:'timezone-fallback',name:'Your local time',lat:-0.04626,lon:37.65587,tz:browserTz(),accuracy:'timezone-fallback'}}
applyLocation(loc);if(api?.setLocation)api.setLocation(loc);
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
stage.dataset.homeSkyBoot='rendering';
try{if(typeof window.renderVioraHero==='function'){await window.renderVioraHero(true);stage.dataset.homeSkyBoot='rendered'}else stage.dataset.homeSkyBoot='fallback'}
catch(e){stage.dataset.homeSkyBoot='error';console.error('[VIORA homepage] full hero render failed',e)}
try{window.VioraSky?.init?.({location:loc});window.VioraSky?.renderNow?.();window.VioraTerminator?.init?.({location:loc});window.VioraTerminator?.renderNow?.();window.VioraOrb?.init?.({location:loc,sky:api?.getSky?.()});window.VioraOrb?.setSkyState?.(api?.getSky?.())}catch(e){console.warn('[VIORA homepage] sky layer init',e)}
updateClock();window.VioraTime?.on?.('synced',updateClock);window.VioraTime?.on?.('tzChange',updateClock);setInterval(updateClock,1000);await refreshWeather(true);
window.addEventListener('resize',()=>{try{window.renderVioraHero?.(true)}catch(_){}window.VioraSky?.renderNow?.();window.VioraTerminator?.renderNow?.()},{passive:true})
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();