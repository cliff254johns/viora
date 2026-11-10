const MODEL = "@cf/meta/m2m100-1.2b";
const LANGUAGES = new Set(["en","sw","fr","es","de","pt","it","zh","ja","ar","hi","ru","nl","tr","ko"]);
const ALLOWED_ORIGINS = new Set(["https://viora.co.ke","https://www.viora.co.ke"]);
const rate = new Map();
function headers(origin) {
  const h = new Headers({
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin",
    "X-Content-Type-Options":"nosniff"
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods","POST, OPTIONS");
    h.set("Access-Control-Allow-Headers","Content-Type");
  }
  return h;
}
function json(data,status,origin) {
  return new Response(JSON.stringify(data),{status,headers:headers(origin)});
}
async function digest(value) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function translate(request,env,ctx) {
  const origin=request.headers.get("Origin")||"";
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,origin);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(request.method!=="POST")return json({error:"Method not allowed"},405,origin);
  if(!env.AI)return json({error:"Workers AI binding is not configured"},503,origin);
  let body;
  try{body=await request.json();}catch(_){return json({error:"Invalid JSON body"},400,origin);}
  const text=typeof body.text==="string"?body.text.trim():"";
  const source=String(body.sourceLang||"en").toLowerCase();
  const target=String(body.targetLang||"").toLowerCase();
  if(!text||text.length>1600)return json({error:"Text must contain 1–1600 characters"},400,origin);
  if(!LANGUAGES.has(source)||!LANGUAGES.has(target))return json({error:"Unsupported language"},400,origin);
  if(source===target)return json({translatedText:text,sourceLang:source,targetLang:target},200,origin);
  const cacheKey=new Request("https://viora-translation-cache.invalid/"+await digest(source+"|"+target+"|"+text));
  const cache=caches.default;
  const cached=await cache.match(cacheKey);
  if(cached){const payload=await cached.json();return json(payload,200,origin);}
  const ip=request.headers.get("CF-Connecting-IP")||"unknown";
  const now=Date.now();
  if(rate.size>1000)for(const [key,value] of rate)if(now-value.start>60000)rate.delete(key);
  const slot=rate.get(ip)||{start:now,count:0};
  if(now-slot.start>60000){slot.start=now;slot.count=0;}
  slot.count++;rate.set(ip,slot);
  if(slot.count>300)return json({error:"Translation rate limit reached. Please wait a minute."},429,origin);
  try{
    const result=await env.AI.run(MODEL,{text,source_lang:source,target_lang:target});
    const translatedText=String(result&&result.translated_text||"").trim();
    if(!translatedText)return json({error:"Translation model returned no text"},502,origin);
    const payload={translatedText,sourceLang:source,targetLang:target};
    const response=new Response(JSON.stringify(payload),{headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=86400"}});
    ctx.waitUntil(cache.put(cacheKey,response.clone()));
    return json(payload,200,origin);
  }catch(error){
    return json({error:"Translation service temporarily unavailable"},503,origin);
  }
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.pathname==="/api/translate")return translate(request,env,ctx);
    if(url.pathname==="/api/translation-health")return json({ok:true,service:"VIORA multilingual translation",model:MODEL,aiBinding:!!env.AI},200,request.headers.get("Origin")||"");
    return env.ASSETS.fetch(request);
  }
};