/* Loads the cookie-preferences fragment on public pages and safely executes its controller. */
(function(){
  'use strict';
  if(document.getElementById('vioraCookieBanner'))return;
  fetch('/cookie-banner.html',{credentials:'same-origin',cache:'no-cache'})
    .then(function(r){if(!r.ok)throw new Error('Cookie preferences unavailable');return r.text();})
    .then(function(markup){
      var parsed=new DOMParser().parseFromString(markup,'text/html');
      Array.from(parsed.body.children).forEach(function(node){
        if(node.tagName==='SCRIPT'){
          var script=document.createElement('script');
          if(node.src)script.src=node.src;else script.textContent=node.textContent;
          document.body.appendChild(script);
        }else document.body.appendChild(document.importNode(node,true));
      });
    })
    .catch(function(err){console.warn('[VIORA] Cookie preferences could not load:',err.message);});
})();
