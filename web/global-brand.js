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
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    const active=path==='market.html'?'market':path==='client.html'?'portal':path==='training.html'?'academy':path==='contact_us.html'?'contact':'home';
    const nav=document.querySelector('.mobile-bottom-nav[aria-label="Mobile navigation"]');
    if(nav && path!=='market.html'){
      const items=[['home','index.html','Home','🏠'],['market','market.html','Market','🛍️'],['portal','client.html','Portal','🧩'],['academy','training.html','Academy','🎓'],['contact','contact_us.html','Contact','✉️']];
      nav.innerHTML=items.map(([id,url,label,icon])=>'<a class="mnav-item '+(id===active?'active':'')+'" href="'+url+'" aria-label="'+label+'"><span aria-hidden="true">'+icon+'</span><span>'+label+'</span></a>').join('');
      nav.setAttribute('aria-label','VIORA navigation');
    }
    document.querySelectorAll('.nav-links a').forEach(a=>{
      const href=(a.getAttribute('href')||'').split('/').pop();
      a.classList.toggle('active',href===path);
    });
  });
})();
