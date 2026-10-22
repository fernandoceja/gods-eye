import { cachedText } from "../cache.ts";
import { TTL } from "../places.ts";
import type { FetchLike, GeoEvent, QuakeSpan } from "../types.ts";

interface UsgsFeed {
  features?: UsgsFeature[];
}

interface UsgsFeature {
  id?: string | number;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
    title?: string | null;
    type?: string | null;
    magType?: string | null;
    url?: string | null;
  };
  geometry?: { coordinates?: number[] };
}

const URLS: Record<QuakeSpan, string> = {
  day: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  week: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
};

export function usgsUrl(span: QuakeSpan): string {
  return URLS[span];
}

export function normalizeUsgs(payload: unknown): GeoEvent[] {
  const features = (payload as UsgsFeed | null)?.features;
  if (!Array.isArray(features)) return [];
  const events: GeoEvent[] = [];
  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!coords || coords.length < 2 || !props) continue;
    const lon = coords[0];
    const lat = coords[1];
    const depthKm = coords[2] ?? 0;
    if (props.mag == null || !Number.isFinite(props.mag)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const kind = props.type || "earthquake";
    if (kind !== "earthquake") continue;
    events.push({
      id: String(feature.id ?? `${lat},${lon},${props.time ?? 0}`),
      type: "earthquake",
      time: typeof props.time === "number" ? props.time : 0,
      lat,
      lon,
      alt: -depthKm * 1000,
      value: props.mag,
      source: "usgs",
      label: props.title ?? props.place ?? "Earthquake",
      meta: {
        place: props.place ?? "",
        depthKm,
        magType: props.magType ?? "",
        url: props.url ?? "",
      },
    });
  }
  return events;
}

export async function loadUsgs(span: QuakeSpan, fetchImpl: FetchLike = fetch): Promise<GeoEvent[]> {
  const url = usgsUrl(span);
  const load = async () => {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`USGS responded ${res.status}`);
    return res.text();
  };
  const text = fetchImpl === fetch ? await cachedText(`usgs:${span}`, span === "day" ? TTL.usgsDay : TTL.usgsWeek, load) : await load();
  return normalizeUsgs(JSON.parse(text) as unknown);
}
