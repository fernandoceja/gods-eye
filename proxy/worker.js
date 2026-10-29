// God's Eye hosted feed proxy — Cloudflare Worker.
//
// Mirrors the Vite dev-server proxies in vite.config.ts so the static
// GitHub Pages build can reach the feeds that send no CORS headers
// (NASA FIRMS, OpenSky, CelesTrak, Caltrans). Only the four paths below
// are forwarded, and only to the listed origins — this is not an open
// proxy.
//
// Deploy: Cloudflare dashboard → Workers & Pages → this worker →
// Edit code → paste this file → Deploy. (Or `wrangler deploy`.)

const ROUTES = [
  { prefix: "/proxy/firms", target: "https://firms.modaps.eosdis.nasa.gov", accept: "*/*" },
  { prefix: "/proxy/opensky", target: "https://opensky-network.org", accept: "application/json" },
  { prefix: "/proxy/celestrak", target: "https://celestrak.org", accept: "text/plain" },
  { prefix: "/proxy/caltrans", target: "https://cwwp2.dot.ca.gov", accept: "application/json" },
];

const USER_AGENT = "GodsEye/1.0 (educational; local)";

const ALLOWED_ORIGINS = [
  "https://fernandoceja.github.io",
  "http://127.0.0.1:5827",
  "http://localhost:5827",
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") ?? "";
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response("Forbidden origin", { status: 403 });
    }
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }
    const url = new URL(request.url);
    const route = ROUTES.find((r) => url.pathname === r.prefix || url.pathname.startsWith(`${r.prefix}/`));
    if (!route) {
      return new Response("Not found", { status: 404, headers: cors });
    }
    const upstream = route.target + url.pathname.slice(route.prefix.length) + url.search;
    const res = await fetch(upstream, {
      headers: { "User-Agent": USER_AGENT, Accept: route.accept },
    });
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
