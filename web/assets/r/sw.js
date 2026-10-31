const CACHE='bodabiz-shell-v2';
const RUNTIME='bodabiz-runtime-v2';
const SHELL=['/bodabiz.html','/riders.html','/admin.html','/shared/firebase.js','/manifest.json'];
const REMOTE_ASSETS=[
 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js',
 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.allSettled(SHELL.map(async url=>{const r=await fetch(url,{cache:'reload'});if(r.ok)await cache.put(url,r)}));
 await Promise.allSettled(REMOTE_ASSETS.map(async url=>{const r=await fetch(url,{mode:'cors',cache:'reload'});if(r.ok&&r.type!=='opaque')await cache.put(url,r)}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>![CACHE,RUNTIME].includes(k)).map(k=>caches.delete(k)));await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;const u=new URL(req.url);
 if(u.protocol!=='https:'&&u.origin!==location.origin)return;
 if(u.origin!==location.origin&&!/(gstatic\.com|unpkg\.com)/.test(u.hostname))return;
 event.respondWith((async()=>{
  const cached=await caches.match(req);const cache=await caches.open(u.origin===location.origin?CACHE:RUNTIME);
  const network=fetch(req).then(res=>{if(res&&res.ok&&res.type!=='opaque')cache.put(req,res.clone()).catch(()=>{});return res}).catch(()=>null);
  if(cached){event.waitUntil(network);return cached}
  const fresh=await network;if(fresh)return fresh;
  if(u.origin===location.origin){return (await caches.match('/riders.html'))||(await caches.match('/bodabiz.html'))||Response.error()}
  return Response.error();
 })());
});
