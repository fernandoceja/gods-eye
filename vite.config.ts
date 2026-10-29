import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const proxy = {
  "/proxy/firms": {
    target: "https://firms.modaps.eosdis.nasa.gov",
    changeOrigin: true,
    timeout: 60_000,
    proxyTimeout: 60_000,
    rewrite: (path: string) => path.replace(/^\/proxy\/firms/, ""),
    headers: { "User-Agent": "GodsEye/1.0 (educational; local)", Accept: "*/*" },
  },
  "/proxy/opensky": {
    target: "https://opensky-network.org",
    changeOrigin: true,
    timeout: 20_000,
    proxyTimeout: 20_000,
    rewrite: (path: string) => path.replace(/^\/proxy\/opensky/, ""),
    headers: { "User-Agent": "GodsEye/1.0 (educational; local)", Accept: "application/json" },
  },
  "/proxy/celestrak": {
    target: "https://celestrak.org",
    changeOrigin: true,
    timeout: 20_000,
    proxyTimeout: 20_000,
    rewrite: (path: string) => path.replace(/^\/proxy\/celestrak/, ""),
    headers: { "User-Agent": "GodsEye/1.0 (educational; local)", Accept: "text/plain" },
  },
  "/proxy/caltrans": {
    target: "https://cwwp2.dot.ca.gov",
    changeOrigin: true,
    timeout: 30_000,
    proxyTimeout: 30_000,
    rewrite: (path: string) => path.replace(/^\/proxy\/caltrans/, ""),
    headers: { "User-Agent": "GodsEye/1.0 (educational; local)", Accept: "application/json" },
  },
};

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app from /gods-eye/; local dev stays at the root.
  base: command === "build" ? "/gods-eye/" : "/",
  resolve: {
    alias: {
      "satellite.js": fileURLToPath(new URL("./src/satellite-classic.ts", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5827,
    strictPort: true,
    proxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 5827,
    strictPort: true,
    proxy,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
}));
