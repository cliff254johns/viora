/* VIORA shared industry-page branding, full-colour icons and mobile navigation. */
(() => {
  'use strict';
  const body=document.body;
  if(!body.classList.contains('viora-industry-page'))return;

  // Use the same VIORA logo artwork and wordmark treatment on every industry route.
  const brand=document.querySelector('.top .brand');
  if(brand){
    brand.classList.add('viora-industry-brand');
    brand.setAttribute('aria-label','VIORA Ecosystems home');
    brand.innerHTML='<img src="/viora.png" alt="VIORA Ecosystems" width="52" height="52" fetchpriority="high"><span class="viora-industry-wordmark"><strong>VIORA</strong><small>ECOSYSTEMS</small></span>';
  }
  const footer=document.querySelector('.foot');
  if(footer&&!footer.querySelector('.viora-footer-brand')){
    const old=footer.querySelector(':scope > strong');
    const mark=document.createElement('a');
    mark.className='viora-footer-brand';
    mark.href='/';
    mark.innerHTML='<img src="/viora.png" alt="" width="40" height="40" loading="lazy"><span>VIORA <small>ECOSYSTEMS</small></span>';
    if(old)old.replaceWith(mark);else footer.prepend(mark);
  }

  // Keep the same six destinations and order as VIORA's primary mobile navigation.
  const items=[
    {href:'/',label:'Home',icon:'fa-house',tone:'blue'},
    {href:'/market',label:'Market',icon:'fa-store',tone:'orange'},
    {href:'/training',label:'Academy',icon:'fa-graduation-cap',tone:'green'},
    {href:'/client',label:'Client Portal',icon:'fa-user-group',tone:'purple'},
    {href:'/industries',label:'Industries',icon:'fa-city',tone:'amber'},
    {href:'/contact_us',label:'Contact',icon:'fa-envelope',tone:'teal'}
  ];
  const nav=document.createElement('nav');
  nav.className='industry-mobile-nav';
  nav.setAttribute('aria-label','VIORA mobile navigation');
  nav.innerHTML=items.map(item=>{
    const currentPath=location.pathname!=='/'&&location.pathname.endsWith('/')?location.pathname.slice(0,-1):location.pathname;
    const targetPath=item.href!=='/'&&item.href.endsWith('/')?item.href.slice(0,-1):item.href;
    const current=currentPath===targetPath;
    return '<a href="'+item.href+'" class="mnav-item tone-'+item.tone+'"'+(current?' aria-current="page"':'')+'><i class="fa-solid '+item.icon+'" aria-hidden="true"></i><span>'+item.label+'</span></a>';
  }).join('');
  body.appendChild(nav);

  const iconMap={
    retail:['fa-store','orange'],healthcare:['fa-heart-pulse','red'],education:['fa-graduation-cap','green'],
    hospitality:['fa-hotel','violet'],logistics:['fa-truck-fast','blue'],agriculture:['fa-seedling','lime'],
    'professional-services':['fa-briefcase','amber'],directory:['fa-city','cyan']
  };
  const key=body.dataset.industry||'';
  const heroIcon=iconMap[key];
  const eyebrow=document.querySelector('main .hero .eyebrow');
  if(eyebrow&&heroIcon){
    const icon=document.createElement('i');
    icon.className='fa-solid '+heroIcon[0]+' industry-icon tone-'+heroIcon[1];
    icon.setAttribute('aria-hidden','true');
    eyebrow.prepend(icon);
  }

  const patterns=[
    [/patient|medical|appointment|clinic|health/,'fa-heart-pulse','red'],
    [/learner|course|trainer|class|assessment|certificate/,'fa-graduation-cap','green'],
    [/stock|inventory|purchas|supplier|warehouse/,'fa-boxes-stacked','orange'],
    [/payment|billing|finance|receipt/,'fa-credit-card','purple'],
    [/sales|point of sale|cashier|order/,'fa-cash-register','blue'],
    [/fleet|dispatch|transport|consignment/,'fa-truck-fast','cyan'],
    [/farm|crop|production|harvest/,'fa-seedling','lime'],
    [/guest|reservation|hospitality|service/,'fa-bell-concierge','violet'],
    [/client|project|team|document|consult/,'fa-briefcase','amber']
  ];
  document.querySelectorAll('main .list li').forEach(item=>{
    if(item.querySelector('.industry-list-icon'))return;
    const words=item.textContent.toLowerCase();
    const match=patterns.find(([pattern])=>pattern.test(words));
    const icon=document.createElement('i');
    icon.className='fa-solid '+(match?match[1]:'fa-circle-check')+' industry-list-icon tone-'+(match?match[2]:'teal');
    icon.setAttribute('aria-hidden','true');
    item.prepend(icon);
  });

  if(key==='directory'){
    const map=[
      ['retail','fa-store','orange'],['healthcare','fa-heart-pulse','red'],['education','fa-graduation-cap','green'],
      ['hospitality','fa-hotel','violet'],['logistics','fa-truck-fast','blue'],['agriculture','fa-seedling','lime'],
      ['professional-services','fa-briefcase','amber']
    ];
    document.querySelectorAll('main .grid .card').forEach(card=>{
      const href=card.querySelector('a[href]')?.getAttribute('href')||'';
      const match=map.find(([part])=>href.includes(part));
      if(!match||card.querySelector('.industry-card-icon'))return;
      const icon=document.createElement('i');
      icon.className='fa-solid '+match[1]+' industry-card-icon tone-'+match[2];
      icon.setAttribute('aria-hidden','true');
      card.insertBefore(icon,card.firstChild);
    });
  }
})();
