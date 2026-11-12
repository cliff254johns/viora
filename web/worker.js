import { DurableObject } from "cloudflare:workers";

const MODEL = "@cf/meta/m2m100-1.2b";
const LANGUAGES = new Set(["en","sw","fr","es","de","pt","it","zh","ja","ar","hi","ru","nl","tr","ko"]);
const ALLOWED_ORIGINS = new Set(["https://viora.co.ke","https://www.viora.co.ke"]);
const RATE_LIMIT = 300;
const RATE_WINDOW_MS = 60_000;

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
function json(data,status,origin,requestId) {
  const h=headers(origin);
  if(requestId)h.set("X-Request-ID",requestId);
  return new Response(JSON.stringify(data),{status,headers:h});
}
async function digest(value) {
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/**
 * One SQLite-backed Durable Object per hashed client IP.
 * The counter is persisted and coordinated by the object; it is not
 * isolate-local memory. Never log or persist the raw IP address.
 */
export class TranslationRateLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rate_window (
        slot INTEGER PRIMARY KEY CHECK (slot = 1),
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL
      )
    `);
  }

  check(limit, windowMs) {
    const now = Date.now();
    const rows = this.ctx.storage.sql.exec(
      "SELECT window_start, request_count FROM rate_window WHERE slot = 1"
    ).toArray();
    const row = rows[0];

    if (!row || now - row.window_start >= windowMs) {
      this.ctx.storage.sql.exec(
        "INSERT INTO rate_window (slot, window_start, request_count) VALUES (1, ?, 1) ON CONFLICT(slot) DO UPDATE SET window_start = excluded.window_start, request_count = 1",
        now
      );
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
    }

    const count = row.request_count + 1;
    this.ctx.storage.sql.exec(
      "UPDATE rate_window SET request_count = ? WHERE slot = 1",
      count
    );
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: row.window_start + windowMs
    };
  }
}

async function translate(request,env) {
  const requestId=crypto.randomUUID();
  const origin=request.headers.get("Origin")||"";
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:"Origin not allowed"},403,origin,requestId);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:headers(origin)});
  if(request.method!=="POST")return json({error:"Method not allowed"},405,origin,requestId);
  if(!env.AI)return json({error:"Workers AI binding is not configured"},503,origin,requestId);
  if(!env.TRANSLATION_RATE_LIMITER)return json({error:"Rate limiting service is not configured"},503,origin,requestId);

  let body;
  try{body=await request.json();}catch(_){return json({error:"Invalid JSON body"},400,origin,requestId);}
  const text=typeof body.text==="string"?body.text.trim():"";
  const source=String(body.sourceLang||"en").toLowerCase();
  const target=String(body.targetLang||"").toLowerCase();
  if(!text||text.length>1600)return json({error:"Text must contain 1–1600 characters"},400,origin,requestId);
  if(!LANGUAGES.has(source)||!LANGUAGES.has(target))return json({error:"Unsupported language"},400,origin,requestId);
  if(source===target)return json({translatedText:text,sourceLang:source,targetLang:target},200,origin,requestId);

  try {
    const ip=request.headers.get("CF-Connecting-IP")||"unknown";
    const limiter=env.TRANSLATION_RATE_LIMITER.getByName(await digest(ip));
    const quota=await limiter.check(RATE_LIMIT,RATE_WINDOW_MS);
    if(!quota.allowed){
      console.warn(JSON.stringify({event:"translation_rate_limited",requestId,remaining:quota.remaining}));
      return json({error:"Translation rate limit reached. Please wait a minute."},429,origin,requestId);
    }

    const result=await env.AI.run(MODEL,{text,source_lang:source,target_lang:target});
    const translatedText=String(result&&result.translated_text||"").trim();
    if(!translatedText)return json({error:"Translation model returned no text"},502,origin,requestId);

    // Translation input may contain personal data. Do not put user-supplied
    // text or its derived translation into a shared public edge cache.
    console.info(JSON.stringify({event:"translation_succeeded",requestId,source,target,inputLength:text.length}));
    return json({translatedText,sourceLang:source,targetLang:target},200,origin,requestId);
  } catch(error) {
    console.error(JSON.stringify({
      event:"translation_failed",
      requestId,
      error:error instanceof Error?error.message:String(error)
    }));
    return json({error:"Translation service temporarily unavailable",requestId},503,origin,requestId);
  }
}

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.pathname==="/api/translate")return translate(request,env);
    if(url.pathname==="/api/translation-health"||url.pathname==="/api/health") {
      return json({
        ok:true,
        service:"VIORA edge API",
        timestamp:new Date().toISOString(),
        aiBinding:!!env.AI,
        rateLimitBinding:!!env.TRANSLATION_RATE_LIMITER
      },200,request.headers.get("Origin")||"",crypto.randomUUID());
    }
    return env.ASSETS.fetch(request);
  }
};
