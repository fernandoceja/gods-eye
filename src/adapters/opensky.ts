import { SOCAL_BOX } from "../places.ts";
import { proxyUrl } from "../proxy.ts";
import type { FetchLike, GeoEvent } from "../types.ts";

export function openskyUrl(
  box: { lamin: number; lomin: number; lamax: number; lomax: number } = SOCAL_BOX,
): string {
  const params = new URLSearchParams({
    lamin: String(box.lamin),
    lomin: String(box.lomin),
    lamax: String(box.lamax),
    lomax: String(box.lomax),
  });
return proxyUrl(`/proxy/opensky/api/states/all?${params.toString()}`);
}

type StateRow = [
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  boolean | null,
  number | null,
  number | null,
  number | null,
  unknown,
  number | null,
];

interface OpenSkyPayload {
  time?: number;
  states?: StateRow[] | null;
}

export function normalizeOpensky(payload: unknown): GeoEvent[] {
  const body = payload as OpenSkyPayload | null;
  const states = body?.states;
  if (!Array.isArray(states)) return [];
  const fallbackTime = typeof body?.time === "number" ? body.time * 1000 : Date.now();
  const events: GeoEvent[] = [];
  for (const row of states) {
    if (!Array.isArray(row)) continue;
    const icao = row[0];
    if (!icao) continue;
    if (row[8] === true) continue;
    const lon = row[5];
    const lat = row[6];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const geoAlt = row[13];
    const baroAlt = row[7];
    const alt = typeof geoAlt === "number" ? geoAlt : typeof baroAlt === "number" ? baroAlt : 0;
    const velocity = typeof row[9] === "number" ? row[9] : 0;
    const track = typeof row[10] === "number" ? row[10] : null;
    const vertical = typeof row[11] === "number" ? row[11] : 0;
    const stamp = typeof row[3] === "number" ? row[3] * 1000 : typeof row[4] === "number" ? row[4] * 1000 : fallbackTime;
    const callsign = (row[1] ?? "").trim();
    events.push({
      id: icao,
      type: "flight",
      time: stamp,
      lat,
      lon,
      alt,
      value: velocity,
      source: "opensky",
      label: callsign || icao.toUpperCase(),
      meta: {
        callsign,
        country: row[2] ?? "",
        heading: track,
        verticalRate: vertical,
        onGround: false,
      },
    });
  }
  return events;
}

export async function loadOpensky(fetchImpl: FetchLike = fetch): Promise<GeoEvent[]> {
  const res = await fetchImpl(openskyUrl());
  if (res.status === 429) throw new Error("OpenSky rate limit. Waiting before the next poll.");
  if (!res.ok) throw new Error(`OpenSky responded ${res.status}`);
  return normalizeOpensky((await res.json()) as unknown);
}
