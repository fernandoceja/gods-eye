import { cachedText } from "../cache.ts";
import { TTL } from "../places.ts";
import type { FetchLike, GeoEvent } from "../types.ts";

export function firmsUrl(mapKey: string): string {
  return `/proxy/firms/api/area/csv/${encodeURIComponent(mapKey)}/VIIRS_SNPP_NRT/world/1`;
}

export function normalizeFirms(csv: string): GeoEvent[] {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((cell) => cell.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const latI = col("latitude");
  const lonI = col("longitude");
  const dateI = col("acq_date");
  const timeI = col("acq_time");
  if (latI < 0 || lonI < 0 || dateI < 0 || timeI < 0) return [];
  const frpI = col("frp");
  const brightI = col("bright_ti4");
  const confI = col("confidence");
  const satI = col("satellite");
  const dayI = col("daynight");
  const events: GeoEvent[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i]!.split(",");
    const lat = Number(cells[latI]);
    const lon = Number(cells[lonI]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const date = cells[dateI]?.trim() ?? "";
    const hhmm = (cells[timeI] ?? "").trim().padStart(4, "0");
    const time = Date.parse(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`);
    if (!Number.isFinite(time)) continue;
    const frp = frpI >= 0 ? Number(cells[frpI]) : Number.NaN;
    const bright = brightI >= 0 ? Number(cells[brightI]) : Number.NaN;
    const value = Number.isFinite(frp) && frp > 0 ? frp : Number.isFinite(bright) ? bright : 0;
    const satellite = satI >= 0 ? (cells[satI] ?? "").trim() : "";
    events.push({
      id: `${lat.toFixed(3)}:${lon.toFixed(3)}:${date}:${hhmm}:${satellite}`,
      type: "fire",
      time,
      lat,
      lon,
      alt: 0,
      value,
      source: "firms",
      label: "Active fire",
      meta: {
        frp: Number.isFinite(frp) ? frp : null,
        brightness: Number.isFinite(bright) ? bright : null,
        confidence: confI >= 0 ? (cells[confI] ?? "").trim() : "",
        satellite,
        daynight: dayI >= 0 ? (cells[dayI] ?? "").trim() : "",
      },
    });
  }
  return events;
}

export async function loadFirms(mapKey: string, fetchImpl: FetchLike = fetch): Promise<GeoEvent[]> {
  const key = mapKey.trim();
  if (!key) throw new Error("NASA FIRMS needs a MAP_KEY");
  const url = firmsUrl(key);
  const load = async () => {
    const res = await fetchImpl(url);
    const text = await res.text();
    const rejected = /invalid|not found|map_key/i.test(text.slice(0, 180)) && !text.includes("latitude");
    if (rejected) throw new Error("FIRMS rejected the MAP_KEY");
    if (!res.ok) throw new Error(`FIRMS responded ${res.status}`);
    return text;
  };
  const text = fetchImpl === fetch ? await cachedText("firms:world:1", TTL.firms, load) : await load();
  return normalizeFirms(text);
}
