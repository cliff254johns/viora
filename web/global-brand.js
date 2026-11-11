/* VIORA shared public navigation, AI translation selector and site assistant bootstrap. */
(()=>{
'use strict';
const root=document.documentElement;
try{const theme=localStorage.getItem('viora-theme')||localStorage.getItem('viora_theme')||'dark';root.setAttribute('data-theme',theme==='light'?'light':'dark');localStorage.setItem('viora-theme',root.getAttribute('data-theme'));}catch(_){root.setAttribute('data-theme','dark');}
function languageControl(){
 if(document.getElementById('viora-global-language'))return;
 const host=document.querySelector('.lang-toggle')||document.createElement('div');
 if(!host.classList.contains('lang-toggle')){host.className='viora-language-control';document.body.appendChild(host);}else host.innerHTML='';
 host.id='viora-language-control';host.setAttribute('aria-label','Choose website language');
 host.innerHTML='<label class="viora-language-label" for="viora-global-language">🌐</label><select id="viora-global-language" aria-label="Choose website language" title="AI-powered translation; machine translations may not be perfect"><option value="en">English</option><option value="sw">Kiswahili</option><option value="fr">Français</option><option value="es">Español</option><option value="de">Deutsch</option><option value="pt">Português</option><option value="it">Italiano</option><option value="zh">简体中文</option><option value="ja">日本語</option><option value="ar">العربية</option><option value="hi">हिन्दी</option><option value="ru">Русский</option><option value="nl">Nederlands</option><option value="tr">Türkçe</option><option value="ko">한국어</option></select><span id="viora-language-status" role="status" aria-live="polite"></span>';
 if(!document.getElementById('viora-language-style')){const st=document.createElement('style');st.id='viora-language-style';st.textContent='#viora-language-control,.lang-toggle{position:fixed;top:14px;right:16px;z-index:2147482000;display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(100,160,220,.3);border-radius:999px;background:rgba(7,17,31,.94);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.18);backdrop-filter:blur(12px);font:600 12px system-ui}#viora-global-language{max-width:150px;border:0;outline:0;background:transparent;color:inherit;font:inherit;cursor:pointer}#viora-global-language option{background:#0d1b2d;color:#fff}#viora-language-status{font-size:10px;font-weight:500;max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:600px){#viora-language-control,.lang-toggle{top:calc(68px + env(safe-area-inset-top));right:10px;left:auto;max-width:calc(100vw - 20px);padding:6px 8px}#viora-global-language{max-width:min(118px,calc(100vw - 72px));font-size:11px}#viora-language-status{max-width:58px}}';
 document.head.appendChild(st);}
 let saved=(document.documentElement.lang||'en').split('-')[0];try{saved=localStorage.getItem('viora_site_language')||saved;}catch(_){}if(saved==='zh-cn')saved='zh';
 const sel=document.getElementById('viora-global-language');if([...sel.options].some(o=>o.value===saved))sel.value=saved;
 const apply=()=>window.VioraLanguage&&window.VioraLanguage.apply(sel.value);
 sel.addEventListener('change',()=>{
  const lang=sel.value;try{localStorage.setItem('viora_site_language',lang);}catch(_){}
  if(location.pathname==='/'&&lang==='fr'){location.href='/fr/';return;}
  if(location.pathname==='/'&&lang==='es'){location.href='/es/';return;}
  if(window.VioraLanguage)apply();else sel.disabled=true;
 });
 const script=document.createElement('script');script.src='/mainIndex/site-language.js';script.defer=true;
 script.onload=()=>{sel.disabled=false;window.vioraApplySelectedLanguage=apply;apply();};
 script.onerror=()=>{sel.disabled=false;const status=document.getElementById('viora-language-status');if(status)status.textContent='Translation unavailable';};
 document.body.appendChild(script);
}
function assistant(){if(document.querySelector('script[data-viora-site-assistant]'))return;const s=document.createElement('script');s.src='/mainIndex/site-assistant-loader.js';s.defer=true;s.dataset.vioraSiteAssistant='true';document.body.appendChild(s);}
function mobilePolish(){if(!document.querySelector('link[data-viora-mobile-app]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/viora-mobile-app.css?v=20261111-99261369';l.dataset.vioraMobileApp='true';document.head.appendChild(l);}if(!document.querySelector('script[src="/shared-pwa.js"]')){const p=document.createElement('script');p.src='/shared-pwa.js';p.defer=true;p.dataset.vioraPwa='true';document.body.appendChild(p);}}
function nav(){
 const path=location.pathname.replace(/\/+$/,'')||'/';const active=path==='/market'?'market':path==='/client'?'portal':path==='/training'?'academy':path==='/contact_us'?'contact':'home';
 const n=document.querySelector('.mobile-bottom-nav[aria-label="Mobile navigation"]');
 if(n&&path!=='/market'){const items=[['home','/','Home','🏠'],['market','/market','Market','🛍️'],['portal','/client','Portal','🧩'],['academy','/training','Academy','🎓'],['contact','/contact_us','Contact','✉️']];n.innerHTML=items.map(([id,url,label,icon])=>'<a class="mnav-item '+(id===active?'active':'')+'" href="'+url+'" aria-label="'+label+'"><span aria-hidden="true">'+icon+'</span><span>'+label+'</span></a>').join('');n.setAttribute('aria-label','VIORA navigation');}
 document.querySelectorAll('.nav-links a').forEach(a=>{const href=new URL(a.getAttribute('href')||'/',location.origin).pathname.replace(/\/+$/,'')||'/';a.classList.toggle('active',href===path);});
}
const start=()=>{mobilePolish();nav();languageControl();assistant();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();