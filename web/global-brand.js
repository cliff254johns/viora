/* VIORA shared public navigation helpers */
(() => {
  'use strict';
  const root=document.documentElement;
  try {
    const saved=localStorage.getItem('viora-theme')||localStorage.getItem('viora_theme')||'dark';
    root.setAttribute('data-theme',saved==='light'?'light':'dark');
  } catch (_) { root.setAttribute('data-theme','dark'); }
  try { localStorage.setItem('viora-theme',root.getAttribute('data-theme')); } catch (_) {}
  document.addEventListener('DOMContentLoaded',()=>{
    const cleanPath=location.pathname.replace(/\/+$/,'')||'/';
    const active=cleanPath==='/market'?'market':cleanPath==='/portal'?'portal':cleanPath==='/academy'?'academy':cleanPath==='/contact'?'contact':'home';
    const nav=document.querySelector('.mobile-bottom-nav[aria-label="Mobile navigation"]');
    if(nav && cleanPath!=='/market'){
      const items=[['home','/','Home','🏠'],['market','/market','Market','🛍️'],['portal','/portal','Portal','🧩'],['academy','/academy','Academy','🎓'],['contact','/contact','Contact','✉️']];
      nav.innerHTML=items.map(([id,url,label,icon])=>'<a class="mnav-item '+(id===active?'active':'')+'" href="'+url+'" aria-label="'+label+'"><span aria-hidden="true">'+icon+'</span><span>'+label+'</span></a>').join('');
      nav.setAttribute('aria-label','VIORA navigation');
    }
    document.querySelectorAll('.nav-links a').forEach(a=>{
      const href=new URL(a.getAttribute('href')||'/',location.origin).pathname.replace(/\/+$/,'')||'/';
      a.classList.toggle('active',href===cleanPath);
    });
  });
})();
