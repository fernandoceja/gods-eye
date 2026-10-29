import { cachedText } from "../cache.ts";
import { TTL } from "../places.ts";
import { proxyUrl } from "../proxy.ts";
import type { FetchLike, GeoEvent } from "../types.ts";

/** Southern California first: Los Angeles/Ventura (7), the Inland Empire (8), Orange County (12). */
export const CALTRANS_DISTRICTS = [7, 8, 12] as const;

const IMAGE_HOST = "https://cwwp2.dot.ca.gov/";

export function caltransUrl(district: number): string {
  const padded = String(district).padStart(2, "0");
return proxyUrl(`/proxy/caltrans/data/d${district}/cctvStatusD${padded}.json`);
}

interface CaltransLocation {
  locationName?: unknown;
  nearbyPlace?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  elevation?: unknown;
  direction?: unknown;
  county?: unknown;
  route?: unknown;
}

interface CaltransCctv {
  index?: unknown;
  inService?: unknown;
  recordTimestamp?: { recordEpoch?: unknown };
  location?: CaltransLocation;
  imageData?: {
    streamingVideoURL?: unknown;
    static?: { currentImageURL?: unknown };
  };
}

/**
 * One district's catalog → GeoEvents. Caltrans reports coordinates and
 * elevation as strings (elevation in feet). Only in-service cameras with
 * finite coordinates and a still image on the official cwwp2 host are kept.
 */
export function normalizeCaltrans(payload: unknown, district: number, fallbackTime: number): GeoEvent[] {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const events: GeoEvent[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const cctv = (row as { cctv?: CaltransCctv } | null)?.cctv;
    if (!cctv) continue;
    if (String(cctv.inService).toLowerCase() !== "true") continue;
    const loc = cctv.location ?? {};
    const lat = Number(loc.latitude);
    const lon = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const imageUrl = typeof cctv.imageData?.static?.currentImageURL === "string" ? cctv.imageData.static.currentImageURL : "";
    if (!imageUrl.startsWith(IMAGE_HOST)) continue;
    const slug = imageSlug(imageUrl) ?? String(cctv.index ?? events.length);
    const id = `ca-d${district}-${slug}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = String(loc.locationName ?? "").replace(/^([A-Za-z0-9_-]+)\s*--\s*/, "").trim();
    const epoch = Number(cctv.recordTimestamp?.recordEpoch);
    events.push({
      id,
      type: "camera",
      time: Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : fallbackTime,
      lat,
      lon,
      alt: elevationMeters(loc.elevation),
      value: 1,
      source: "caltrans",
      label: name || `Caltrans D${district} camera ${slug}`,
      meta: {
        district,
        nearbyPlace: String(loc.nearbyPlace ?? ""),
        direction: String(loc.direction ?? ""),
        route: String(loc.route ?? ""),
        county: String(loc.county ?? ""),
        imageUrl,
        streamUrl: typeof cctv.imageData?.streamingVideoURL === "string" ? cctv.imageData.streamingVideoURL : "",
      },
    });
  }
  return events;
}

/**
 * All configured districts, fetched in parallel. One district's outage never
 * darkens the others; the layer only fails when every district fails.
 */
export async function loadCaltrans(fetchImpl: FetchLike = fetch, now: number = Date.now()): Promise<GeoEvent[]> {
  const settled = await Promise.allSettled(CALTRANS_DISTRICTS.map((district) => loadDistrict(district, fetchImpl, now)));
  const events: GeoEvent[] = [];
  let failures = 0;
  for (const result of settled) {
    if (result.status === "fulfilled") events.push(...result.value);
    else failures += 1;
  }
  if (failures === CALTRANS_DISTRICTS.length) {
    throw new Error("Caltrans did not respond. Districts 7, 8, and 12 were unreachable.");
  }
  events.sort((a, b) => a.id.localeCompare(b.id));
  return events;
}

async function loadDistrict(district: number, fetchImpl: FetchLike, now: number): Promise<GeoEvent[]> {
  const load = async () => {
    const res = await fetchImpl(caltransUrl(district));
    if (!res.ok) throw new Error(`Caltrans D${district} responded ${res.status}`);
    return res.text();
  };
  const text = fetchImpl === fetch ? await cachedText(`caltrans:d${district}`, TTL.caltrans, load) : await load();
  return normalizeCaltrans(JSON.parse(text) as unknown, district, now);
}

function imageSlug(url: string): string | null {
  const match = /\/image\/([^/]+)\//.exec(url);
  return match ? match[1]! : null;
}

/** Caltrans elevation is feet; the schema's alt is metres. Clamped like the source data deserves. */
function elevationMeters(raw: unknown): number {
  const feet = Number(raw);
  if (!Number.isFinite(feet)) return 0;
  return Math.max(-100, Math.min(4000, feet * 0.3048));
}
