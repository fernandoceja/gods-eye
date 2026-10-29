// Where the /proxy/* feed paths live.
//
// In dev, the Vite server proxies those paths itself (see vite.config.ts),
// so callers use same-origin relative URLs. A static production build
// (GitHub Pages) has no dev server, so the same paths are served by the
// hosted Cloudflare Worker in proxy/worker.js instead.
const PROXY_ORIGIN = "https://gods-eye-proxy.nando0589.workers.dev";

export function proxyUrl(path: string): string {
  return import.meta.env.DEV ? path : `${PROXY_ORIGIN}${path}`;
}
