/* VIORA consent-aware measurement. No tracking runs without a real GA4 ID and explicit analytics consent. */
(function(){
  'use strict';
  var cfg=window.VIORA_ANALYTICS_CONFIG||{};
  var gaId=String(cfg.ga4MeasurementId||'').trim();
  var loaded=false,allowed=false;
  function validId(v){return /^G-[A-Z0-9]{6,}$/i.test(v);}
  function start(){
    if(!allowed||!validId(gaId)||loaded)return;
    loaded=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    var s=document.createElement('script');s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(gaId);
    s.onload=function(){
      window.gtag('js',new Date());
      window.gtag('config',gaId,{anonymize_ip:true,send_page_view:false});
      window.gtag('event','page_view',{page_title:document.title,page_location:location.href,page_path:location.pathname});
    };
    document.head.appendChild(s);
  }
  function setConsent(c){
    allowed=!!(c&&c.analytics===true);
    if(allowed)start();
    else if(window.gtag)window.gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  }
  window.addEventListener('viora:consent',function(e){setConsent(e.detail||{});});
  try{var saved=JSON.parse(localStorage.getItem('viora_cookie_consent_v1')||'null');if(saved)setConsent(saved);}catch(_){}
  document.addEventListener('click',function(e){
    if(!allowed||!window.gtag)return;
    var a=e.target.closest('a,button');if(!a)return;
    var href=a.getAttribute('href')||'';
    if(!/contact|industries|market|training/.test(href))return;
    window.gtag('event','select_content',{content_type:'navigation_or_cta',item_id:href.slice(0,120),item_name:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,100)});
  },{passive:true});
  window.VIORAAnalytics={track:function(name,params){
    if(!allowed||!window.gtag||!/^[a-zA-Z0-9_]{1,40}$/.test(name))return false;
    window.gtag('event',name,params||{});return true;
  }};
})();
