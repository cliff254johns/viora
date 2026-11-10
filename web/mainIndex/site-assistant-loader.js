/* Shared site assistant loader: mounts the canonical assistant from inde.html. */
(() => {
'use strict';
if (window.__VIORA_SITE_ASSISTANT_LOADER__) return;
window.__VIORA_SITE_ASSISTANT_LOADER__ = true;
function loadCss(){
 if(document.querySelector('link[data-viora-chatbot-css]')) return;
 const l=document.createElement('link');l.rel='stylesheet';l.href='/mainIndex/chatbot.css';l.dataset.vioraChatbotCss='true';document.head.appendChild(l);
}
function loadEngine(){
 return new Promise((resolve,reject)=>{
  if([...document.scripts].some(s=>/\/mainIndex\/chatbot\.js(?:\?|$)/.test(s.src))){resolve();return;}
  const s=document.createElement('script');s.src='/mainIndex/chatbot.js';s.defer=true;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);
 });
}
async function mount(){
 loadCss();
 const ready=document.getElementById('viora-assistant')&&document.getElementById('panel')&&document.getElementById('userInput');
 if(!ready){
  try{
   const res=await fetch('/inde.html',{credentials:'same-origin',cache:'no-cache'});
   if(!res.ok)throw Error('Assistant template unavailable: '+res.status);
   const doc=new DOMParser().parseFromString(await res.text(),'text/html');
   const walker=doc.createTreeWalker(doc,NodeFilter.SHOW_COMMENT);let start=null,end=null,n;
   while((n=walker.nextNode())){
    if(!start&&/VIORA CHATBOT/.test(n.nodeValue||'')&&!/END/.test(n.nodeValue||''))start=n;
    else if(start&&/END VIORA CHATBOT/.test(n.nodeValue||'')){end=n;break;}
   }
   if(!start||!end)throw Error('Assistant template markers missing');
   const range=doc.createRange();range.setStartAfter(start);range.setEndBefore(end);
   document.body.appendChild(range.cloneContents());
  }catch(e){console.error('[VIORA Assistant] mount failed',e);return;}
 }
 try{await loadEngine();if(window.vioraApplySelectedLanguage)window.vioraApplySelectedLanguage();}catch(e){console.error('[VIORA Assistant] engine failed',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();