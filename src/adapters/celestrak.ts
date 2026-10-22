import { twoline2satrec, type SatRec } from "satellite.js";
import { cachedText } from "../cache.ts";
import { SAMPLE_TLE } from "../data/tle-sample.ts";
import { TTL } from "../places.ts";
import type { FetchLike, GeoEvent } from "../types.ts";
import { propagateState } from "../math/orbit.ts";

export type SatGroup = "stations" | "visual";

export interface CatalogSat {
  id: string;
  name: string;
  noradId: number;
  group: SatGroup;
  line1: string;
  line2: string;
  satrec: SatRec;
  sample: boolean;
}

export function celestrakUrl(group: SatGroup, viaProxy: boolean): string {
  const path = `/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
  return viaProxy ? `/proxy/celestrak${path}` : `https://celestrak.org${path}`;
}

export function parseTle(text: string, group: SatGroup, sample = false): CatalogSat[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("<"));
  const sats: CatalogSat[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    let name = "UNKNOWN";
    let line1 = "";
    let line2 = "";
    if (line.startsWith("1 ") && (lines[i + 1] ?? "").startsWith("2 ")) {
      line1 = line;
      line2 = lines[i + 1] ?? "";
      i += 1;
    } else if ((lines[i + 1] ?? "").startsWith("1 ") && (lines[i + 2] ?? "").startsWith("2 ")) {
      name = line;
      line1 = lines[i + 1] ?? "";
      line2 = lines[i + 2] ?? "";
      i += 2;
    } else {
      continue;
    }
    const noradId = Number(line2.slice(2, 7));
    if (!Number.isFinite(noradId)) continue;
    try {
      const satrec = twoline2satrec(line1, line2);
      sats.push({
        id: `sat:${noradId}`,
        name,
        noradId,
        group,
        line1,
        line2,
        satrec,
        sample,
      });
    } catch {
      // Skip a damaged element set and keep the rest of the group.
    }
  }
  return sats;
}

export function mergeCatalog(groups: CatalogSat[][]): CatalogSat[] {
  const byId = new Map<string, CatalogSat>();
  for (const group of groups) {
    for (const sat of group) {
      const existing = byId.get(sat.id);
      if (!existing || (existing.group === "visual" && sat.group === "stations")) byId.set(sat.id, sat);
    }
  }
  return [...byId.values()];
}

async function fetchGroup(group: SatGroup, fetchImpl: FetchLike): Promise<string> {
  const direct = celestrakUrl(group, false);
  const proxied = celestrakUrl(group, true);
  const attempt = async (url: string) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`CelesTrak responded ${res.status}`);
    const text = await res.text();
    if (!/\n1 |\n2 |^1 /.test(text)) throw new Error("CelesTrak did not return TLEs");
    return text;
  };
  try {
    return await attempt(direct);
  } catch {
    return attempt(proxied);
  }
}

export async function loadCelestrak(fetchImpl: FetchLike = fetch): Promise<CatalogSat[]> {
  const loadPair = async () => {
    const [stations, visual] = await Promise.all([
      fetchGroup("stations", fetchImpl),
      fetchGroup("visual", fetchImpl),
    ]);
    return JSON.stringify({ stations, visual });
  };
  const raw =
    fetchImpl === fetch ? await cachedText("celestrak:stations+visual", TTL.celestrak, loadPair) : await loadPair();
  const parsed = JSON.parse(raw) as { stations: string; visual: string };
  return mergeCatalog([parseTle(parsed.stations, "stations"), parseTle(parsed.visual, "visual")]);
}

export function sampleCatalog(): CatalogSat[] {
  return parseTle(SAMPLE_TLE, "stations", true);
}

export function catalogToEvents(sats: CatalogSat[], when: Date): GeoEvent[] {
  const events: GeoEvent[] = [];
  for (const sat of sats) {
    const state = propagateState(sat.satrec, when);
    if (!state) continue;
    events.push({
      id: sat.id,
      type: "satellite",
      time: when.getTime(),
      lat: state.lat,
      lon: state.lon,
      alt: state.altM,
      value: state.speedMps,
      source: sat.sample ? "celestrak-sample" : "celestrak",
      label: sat.name,
      meta: {
        noradId: sat.noradId,
        periodMin: state.periodMin,
        group: sat.group,
        iss: sat.noradId === 25544,
        sample: sat.sample,
      },
    });
  }
  return events;
}
