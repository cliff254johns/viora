import { EMBEDDED_ASSETS_GZIP_BASE64 } from "./assets.generated.js";

let embeddedAssetsPromise;
async function getEmbeddedAssets() {
  if (!embeddedAssetsPromise) {
    embeddedAssetsPromise = (async () => {
      if (!EMBEDDED_ASSETS_GZIP_BASE64) return {};
      const binary = atob(EMBEDDED_ASSETS_GZIP_BASE64);
      const compressed = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    })();
  }
  return embeddedAssetsPromise;
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=(self)"
};

function embeddedResponse(asset, method) {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", asset.mime);
  headers.set("Cache-Control", asset.cache || "no-cache");
  let body = asset.content;
  if (asset.encoding === "base64") {
    const binary = atob(asset.content.replace(/\\s/g, ""));
    body = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }
  return new Response(method === "HEAD" ? null : body, { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const method = request.method.toUpperCase();
    if (env.ASSETS) {
      const localResponse = await env.ASSETS.fetch(request);
      if (localResponse.status !== 404) return localResponse;
    }

    if (method === "GET" || method === "HEAD") {
      const url = new URL(request.url);
      const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const assets = await getEmbeddedAssets();
      const asset = assets[assetPath];
      if (asset) return embeddedResponse(asset, method);
    }

    // Preserve every existing route and any asset not included in the
    // staged bundle. The legacy Worker remains deployed for rollback.
    if (env.LEGACY) return env.LEGACY.fetch(request);
    return new Response("Not Found", { status: 404, headers: SECURITY_HEADERS });
  }
};
