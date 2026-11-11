/* App-like mobile navigation and contextual Font Awesome icons for VIORA industry pages. */
(() => {
  'use strict';
  const body=document.body;
  if(!body.classList.contains('viora-industry-page'))return;
  const items=[
    {href:'/',label:'Home',icon:'fa-house'},
    {href:'/industries',label:'Industries',icon:'fa-layer-group'},
    {href:'/market',label:'Market',icon:'fa-store'},
    {href:'/contact_us',label:'Contact',icon:'fa-comments'}
  ];
  const nav=document.createElement('nav');
  nav.className='industry-mobile-nav';
  nav.setAttribute('aria-label','Quick navigation');
  nav.innerHTML=items.map(item=>{
    const current=location.pathname===item.href||location.pathname===item.href+'/';
    return '<a href="'+item.href+'"'+(current?' aria-current="page"':'')+'><i class="fa-solid '+item.icon+'" aria-hidden="true"></i><span>'+item.label+'</span></a>';
  }).join('');
  body.appendChild(nav);

  const iconMap={
    retail:'fa-store',healthcare:'fa-heart-pulse',education:'fa-graduation-cap',
    hospitality:'fa-hotel',logistics:'fa-truck-fast',agriculture:'fa-seedling',
    'professional-services':'fa-briefcase',directory:'fa-city'
  };
  const key=body.dataset.industry||'';
  const eyebrow=document.querySelector('main .hero .eyebrow');
  if(eyebrow&&iconMap[key]){
    const icon=document.createElement('i');
    icon.className='fa-solid '+iconMap[key];
    icon.setAttribute('aria-hidden','true');
    eyebrow.prepend(icon);
  }

  document.querySelectorAll('main .list li').forEach(item=>{
    const words=item.textContent.toLowerCase();
    let icon='fa-circle-check';
    if(/patient|medical|appointment|clinic|health/.test(words))icon='fa-heart-pulse';
    else if(/learner|course|trainer|class|assessment|certificate/.test(words))icon='fa-graduation-cap';
    else if(/stock|inventory|purchas|supplier|warehouse/.test(words))icon='fa-boxes-stacked';
    else if(/payment|billing|finance|receipt/.test(words))icon='fa-credit-card';
    else if(/sales|point of sale|cashier|order/.test(words))icon='fa-cash-register';
    else if(/fleet|dispatch|transport|consignment/.test(words))icon='fa-truck-fast';
    else if(/farm|crop|production|harvest/.test(words))icon='fa-seedling';
    else if(/guest|reservation|hospitality|service/.test(words))icon='fa-bell-concierge';
    const node=document.createElement('i');
    node.className='fa-solid '+icon;
    node.setAttribute('aria-hidden','true');
    item.prepend(node);
  });

  if(key==='directory'){
    const map=[['retail','fa-store'],['healthcare','fa-heart-pulse'],['education','fa-graduation-cap'],['hospitality','fa-hotel'],['logistics','fa-truck-fast'],['agriculture','fa-seedling'],['professional-services','fa-briefcase']];
    document.querySelectorAll('main .grid .card').forEach(card=>{
      const href=card.querySelector('a[href]')?.getAttribute('href')||'';
      const match=map.find(([part])=>href.includes(part));
      if(!match)return;
      const icon=document.createElement('i');
      icon.className='fa-solid '+match[1];
      icon.setAttribute('aria-hidden','true');
      icon.style.cssText='display:inline-grid;place-items:center;width:38px;height:38px;margin-bottom:10px;border-radius:12px;background:rgba(70,145,231,.14);color:#8fc2ff;font-size:17px';
      card.insertBefore(icon,card.firstChild);
    });
  }
})();