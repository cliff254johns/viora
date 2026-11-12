/* VIORA global visitor currency service.
   Country is inferred from public IP geolocation (not device GPS).
   FX rates are indicative daily reference rates; order/payment records retain their base KES amounts. */
(function(){
  'use strict';
  const GEO_KEY='viora_geo_currency_v1',FX_KEY='viora_fx_kes_v1',TTL=6*60*60*1000,GEO_TTL=24*60*60*1000;
  const state={country:'KE',currency:'KES',locale:(navigator.language||'en-KE'),rates:{KES:1},ready:false,source:'fallback',updatedAt:null};
  const read=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const cachedGeo=read(GEO_KEY),cachedFx=read(FX_KEY);
  if(cachedGeo&&Date.now()-cachedGeo.savedAt<GEO_TTL&&cachedGeo.currency){state.country=cachedGeo.country||'KE';state.currency=cachedGeo.currency;state.locale=cachedGeo.locale||state.locale;state.source='cached';}
  if(cachedFx&&Date.now()-cachedFx.savedAt<TTL&&cachedFx.rates){state.rates=cachedFx.rates;state.updatedAt=cachedFx.updatedAt||null;state.source=state.source==='cached'?'cached':'cached-fx';}
  function validCode(code){return /^[A-Z]{3}$/.test(String(code||''));}
  function fmt(amount,from){
    from=validCode(from)?from:'KES';
    const value=Number(amount)||0,fromRate=Number(state.rates[from]),toRate=Number(state.rates[state.currency]);
    if(!Number.isFinite(fromRate)||fromRate<=0||!Number.isFinite(toRate)||toRate<=0)return fallbackFormat(value,from);
    const converted=value*toRate/fromRate;
    try{return new Intl.NumberFormat(state.locale||navigator.language||'en',{style:'currency',currency:state.currency,maximumFractionDigits:2}).format(converted);}
    catch(_){return state.currency+' '+converted.toLocaleString(undefined,{maximumFractionDigits:2});}
  }
  function fallbackFormat(value,from){
    try{return new Intl.NumberFormat(state.locale||'en-KE',{style:'currency',currency:from,maximumFractionDigits:2}).format(value);}
    catch(_){return from+' '+value.toLocaleString();}
  }
  function convert(amount,from,to){
    from=validCode(from)?from:'KES';to=validCode(to)?to:'KES';
    const a=Number(state.rates[from]),b=Number(state.rates[to]);
    return a>0&&b>0?(Number(amount)||0)*b/a:null;
  }
  async function getJson(url,ms){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms||4500);
    try{const r=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
    finally{clearTimeout(timer);}
  }
  async function locate(){
    try{
      const d=await getJson('https://ipapi.co/json/',4200);
      const code=String(d.currency||'').toUpperCase(),country=String(d.country_code||'').toUpperCase();
      if(validCode(code)){state.country=country||state.country;state.currency=code;state.locale=(navigator.language&&navigator.language.includes('-'+country))?navigator.language:(country?'en-'+country:state.locale);state.source='live';write(GEO_KEY,{country:state.country,currency:code,locale:state.locale,savedAt:Date.now()});return;}
    }catch(_){}
    try{
      const d=await getJson('https://ipwho.is/',4200),code=String(d.currency&&d.currency.code||'').toUpperCase(),country=String(d.country_code||'').toUpperCase();
      if(d.success!==false&&validCode(code)){state.country=country||state.country;state.currency=code;state.locale=country?'en-'+country:state.locale;state.source='live';write(GEO_KEY,{country:state.country,currency:code,locale:state.locale,savedAt:Date.now()});}
    }catch(_){}
  }
  async function rates(){
    try{
      const d=await getJson('https://open.er-api.com/v6/latest/KES',5500);
      if(d&&d.result==='success'&&d.rates&&Number(d.rates[state.currency])>0){
        state.rates=Object.assign({KES:1},d.rates);state.updatedAt=d.time_last_update_utc||new Date().toISOString();state.source='live';
        write(FX_KEY,{rates:state.rates,updatedAt:state.updatedAt,savedAt:Date.now()});return;
      }
    }catch(_){}
    if(!Number(state.rates[state.currency])){state.currency='KES';state.rates={KES:1};}
  }
  function publish(){
    state.ready=true;
    window.dispatchEvent(new CustomEvent('viora:currency-ready',{detail:api.getState()}));
    document.documentElement.setAttribute('data-viora-currency',state.currency);
  }
  const api={
    format:fmt,convert,rate:(from,to)=>convert(1,from||'KES',to||state.currency),
    getState:()=>({country:state.country,currency:state.currency,locale:state.locale,ready:state.ready,source:state.source,updatedAt:state.updatedAt}),
    refresh:async()=>{await Promise.all([locate(),rates()]);publish();return api.getState();}
  };
  window.VioraCurrency=api;
  // Cached state is immediately usable; fresh country/rates replace it after loading.
  if(state.currency!=='KES'&&Number(state.rates[state.currency])>0)publish();
  api.refresh().catch(()=>publish());
})();