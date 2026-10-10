const CACHE='hansol-public-app-v1';
const ASSETS=['/','/admin.js','/hero-character.png','/app-icon.svg','/app.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('hansol-public-app-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  const publicContent=url.pathname==='/.netlify/functions/editor'&&url.searchParams.get('action')==='content';
  if(url.pathname.startsWith('/.netlify/')&&!publicContent)return;
  if(request.mode==='navigate'||publicContent){
    event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}catch{return (await cache.match(request))||(request.mode==='navigate'?await cache.match('/'):new Response(JSON.stringify({values:{},revision:null}),{headers:{'Content-Type':'application/json'}}));}})());
  }else if(ASSETS.includes(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
  }
});
