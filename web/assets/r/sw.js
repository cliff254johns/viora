const VERSION='bodabiz-shell-v3';
const SHELL=[
 './ride.html','./riders.html','./bodabiz.html','./rider.html','./admin.html',
 './manifest-public.json','./manifest-rider.json','./manifest-admin.json',
 './icons/icon.svg'
];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('bodabiz-shell-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.includes('/shared/firebase.js')){event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}return res}).catch(()=>caches.match(req)));return}
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(res=>{
   if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}
   return res;
  }).catch(()=>caches.match(req).then(hit=>hit||caches.match('./riders.html'))));
  return;
 }
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
  if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(req,copy));}
  return res;
 })));
});
