import { describe, expect, test } from "vitest";
import { caltransUrl, loadCaltrans, normalizeCaltrans } from "../src/adapters/caltrans.ts";
import type { FetchLike } from "../src/types.ts";

const NOW = 1_762_000_000_000;

/** One row shaped like the live D8 feed (coordinates and elevation are strings). */
function row(overrides: Record<string, unknown> = {}): unknown {
  return {
    cctv: {
      index: "1",
      inService: "true",
      recordTimestamp: { recordDate: "2025-07-03", recordTime: "13:46:32", recordEpoch: "1751575592" },
      location: {
        district: "8",
        locationName: "I-10 : (01) LA County Line",
        nearbyPlace: "Montclair",
        longitude: "-117.704026",
        latitude: "34.081538",
        elevation: "1062",
        direction: "East",
        county: "San Bernardino",
        route: "I-10",
      },
      imageData: {
        streamingVideoURL: "https://wzmedia.dot.ca.gov/D8/LB-8_10_1.stream/playlist.m3u8",
        static: {
          currentImageURL: "https://cwwp2.dot.ca.gov/data/d8/cctv/image/i1001lacountyline/i1001lacountyline.jpg",
        },
      },
      ...overrides,
    },
  };
}

function payload(rows: unknown[]): unknown {
  return { data: rows };
}

describe("caltransUrl", () => {
  test("pads the district in the file name and goes through the proxy", () => {
    expect(caltransUrl(8)).toBe("/proxy/caltrans/data/d8/cctvStatusD08.json");
    expect(caltransUrl(12)).toBe("/proxy/caltrans/data/d12/cctvStatusD12.json");
  });
});

describe("normalizeCaltrans", () => {
  test("normalizes a live-shaped row", () => {
    const [event] = normalizeCaltrans(payload([row()]), 8, NOW);
    expect(event!.id).toBe("ca-d8-i1001lacountyline");
    expect(event!.type).toBe("camera");
    expect(event!.label).toBe("I-10 : (01) LA County Line");
    expect(event!.lat).toBeCloseTo(34.081538);
    expect(event!.lon).toBeCloseTo(-117.704026);
    expect(event!.alt).toBeCloseTo(1062 * 0.3048);
    expect(event!.time).toBe(1751575592 * 1000);
    expect(event!.source).toBe("caltrans");
    expect(event!.meta?.route).toBe("I-10");
    expect(event!.meta?.nearbyPlace).toBe("Montclair");
    expect(event!.meta?.direction).toBe("East");
    expect(event!.meta?.district).toBe(8);
    expect(event!.meta?.imageUrl).toContain("cwwp2.dot.ca.gov");
    expect(event!.meta?.streamUrl).toContain("playlist.m3u8");
  });

  test("drops out-of-service cameras, bad coordinates, and foreign image hosts", () => {
    const outOfService = row({ inService: "false" });
    const badCoords = row({
      location: { locationName: "X", latitude: "north", longitude: "-117.7" },
    });
    const foreignImage = row({
      imageData: { static: { currentImageURL: "https://example.com/cam.jpg" } },
    });
    expect(normalizeCaltrans(payload([outOfService, badCoords, foreignImage]), 8, NOW)).toEqual([]);
  });

  test("strips a leading camera-code prefix from the label and falls back to the index for the id", () => {
    const coded = row({
      index: "77",
      location: {
        locationName: "TV410 -- I-580 : AT GRANT LINE RD",
        latitude: "37.7",
        longitude: "-121.5",
        elevation: "300",
      },
      imageData: { static: { currentImageURL: "https://cwwp2.dot.ca.gov/vmdata/d4/still.jpg" } },
    });
    const [event] = normalizeCaltrans(payload([coded]), 4, NOW);
    expect(event!.label).toBe("I-580 : AT GRANT LINE RD");
    expect(event!.id).toBe("ca-d4-77");
  });

  test("dedupes repeated cameras and clamps wild elevations", () => {
    const skyHigh = row({
      location: {
        locationName: "I-10 : (01) LA County Line",
        latitude: "34.08",
        longitude: "-117.7",
        elevation: "20000",
      },
    });
    const events = normalizeCaltrans(payload([row(), skyHigh]), 8, NOW);
    expect(events).toHaveLength(1);
    expect(events[0]!.alt).toBeCloseTo(1062 * 0.3048);
    const [clamped] = normalizeCaltrans(payload([skyHigh]), 8, NOW);
    expect(clamped!.alt).toBe(4000);
  });

  test("a malformed payload yields no cameras", () => {
    expect(normalizeCaltrans(null, 8, NOW)).toEqual([]);
    expect(normalizeCaltrans({ data: "nope" }, 8, NOW)).toEqual([]);
  });
});

describe("loadCaltrans", () => {
  function stubFetch(byDistrict: Record<number, unknown>, failing: Set<number> = new Set()): FetchLike {
    return (async (input: string) => {
      const district = Number(/\/d(\d+)\//.exec(input)?.[1] ?? "0");
      if (failing.has(district)) throw new Error("district down");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(byDistrict[district] ?? payload([])),
      } as Response;
    }) as FetchLike;
  }

  test("merges districts, sorted by id", async () => {
    const fetchImpl = stubFetch({
      7: payload([row()]),
      8: payload([row()]),
      12: payload([row()]),
    });
    const events = await loadCaltrans(fetchImpl, NOW);
    expect(events.map((event) => event.id)).toEqual([
      "ca-d12-i1001lacountyline",
      "ca-d7-i1001lacountyline",
      "ca-d8-i1001lacountyline",
    ]);
  });

  test("one district down still loads the others", async () => {
    const fetchImpl = stubFetch({ 7: payload([row()]), 12: payload([row()]) }, new Set([8]));
    const events = await loadCaltrans(fetchImpl, NOW);
    expect(events).toHaveLength(2);
  });

  test("throws when every district is unreachable", async () => {
    const fetchImpl = stubFetch({}, new Set([7, 8, 12]));
    await expect(loadCaltrans(fetchImpl, NOW)).rejects.toThrow(/Caltrans did not respond/);
  });
});
