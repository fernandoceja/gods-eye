import { cachedText } from "../cache.ts";
import { TTL } from "../places.ts";
import type { FetchLike, GeoEvent } from "../types.ts";

const KEEP = new Set(["severeStorms", "volcanoes", "wildfires"]);

export const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=400";

interface EonetGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}

interface EonetEvent {
  id?: string;
  title?: string;
  closed?: string | null;
  categories?: { id?: string; title?: string }[];
  geometry?: EonetGeometry[];
  geometries?: EonetGeometry[];
}

export function normalizeEonet(payload: unknown): GeoEvent[] {
  const eventsIn = (payload as { events?: EonetEvent[] } | null)?.events;
  if (!Array.isArray(eventsIn)) return [];
  const events: GeoEvent[] = [];
  for (const event of eventsIn) {
    if (event.closed) continue;
    const category = event.categories?.[0];
    const categoryId = category?.id ?? "";
    if (!KEEP.has(categoryId)) continue;
    const geometries = event.geometry ?? event.geometries ?? [];
    geometries.forEach((geometry, index) => {
      if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) return;
      const lon = geometry.coordinates[0];
      const lat = geometry.coordinates[1];
      if (typeof lat !== "number" || typeof lon !== "number") return;
      const time = geometry.date ? Date.parse(geometry.date) : Number.NaN;
      if (!Number.isFinite(time)) return;
      events.push({
        id: `${event.id ?? "event"}:${index}`,
        type: categoryId,
        time,
        lat,
        lon,
        alt: 0,
        value: typeof geometry.magnitudeValue === "number" ? geometry.magnitudeValue : 0,
        source: "eonet",
        label: event.title ?? category?.title ?? "Natural event",
        meta: {
          category: category?.title ?? categoryId,
          magnitudeUnit: geometry.magnitudeUnit ?? "",
          eventId: event.id ?? "",
        },
      });
    });
  }
  return events;
}

export async function loadEonet(fetchImpl: FetchLike = fetch): Promise<GeoEvent[]> {
  const load = async () => {
    const res = await fetchImpl(EONET_URL);
    if (!res.ok) throw new Error(`EONET responded ${res.status}`);
    return res.text();
  };
  const text = fetchImpl === fetch ? await cachedText("eonet:open", TTL.eonet, load) : await load();
  return normalizeEonet(JSON.parse(text) as unknown);
}
