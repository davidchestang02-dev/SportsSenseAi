const PROD_API = "https://sportssenseai-api.david-chestang02.workers.dev";

/**
 * Pages Functions are JavaScript/TypeScript. When available, we use a service
 * binding to the production/staging backend Worker to keep the public site on
 * the same Cloudflare network. The env var fallback keeps direct-upload and
 * local preview simple.
 */
export async function onRequest(context) {
  const incomingUrl = new URL(context.request.url);
  const backendPath = incomingUrl.pathname.replace(/^\/api/, "") || "/";
  const targetBase = context.env.SSA_API_BASE || PROD_API;
  const targetUrl = new URL(backendPath, targetBase);
  targetUrl.search = incomingUrl.search;

  const proxiedRequest = new Request(targetUrl.toString(), context.request);

  if (context.env.SSA_API && typeof context.env.SSA_API.fetch === "function") {
    return context.env.SSA_API.fetch(proxiedRequest);
  }

  return fetch(proxiedRequest);
}
