import { describe, expect, test } from "vitest";
import { loadOpensky, normalizeOpensky, openskyUrl } from "../src/adapters/opensky.ts";
import { SOCAL_BOX } from "../src/places.ts";
import { expectSchema, jsonResponse, recordingFetch } from "./helpers.ts";

const payload = {
  time: 1_791_760_000,
  states: [
    ["abc123", "SWA100  ", "United States", 1_791_760_000, 1_791_760_010, -117.65, 34.1, 3200, false, 120, 275, -1.5, null, 3400],
    ["ground1", "DAL9", "United States", 1_791_760_000, 1_791_760_000, -118.4, 33.94, 0, true, 0, 90, 0, null, 0],
    ["noloc", "UAL1", "United States", 1_791_760_000, 1_791_760_000, null, null, 10000, false, 200, 10, 0, null, 10000],
  ],
};

describe("OpenSky adapter", () => {
  test("normalizes airborne state vectors onto the shared schema", () => {
    const events = normalizeOpensky(payload);
    expectSchema(events);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "abc123",
      type: "flight",
      time: 1_791_760_000_000,
      lat: 34.1,
      lon: -117.65,
      alt: 3400,
      value: 120,
      source: "opensky",
      label: "SWA100",
    });
    expect(events[0]?.meta).toMatchObject({ heading: 275, verticalRate: -1.5, country: "United States" });
  });

  test("queries the Southern California box through the local proxy", async () => {
    const { fetchImpl, urls } = recordingFetch((url) => {
      expect(url).toBe(openskyUrl());
      expect(url.startsWith("/proxy/opensky/api/states/all")).toBe(true);
      expect(url).toContain(`lamin=${SOCAL_BOX.lamin}`);
      expect(url).toContain(`lomax=${SOCAL_BOX.lomax}`);
      return jsonResponse(payload);
    });
    const events = await loadOpensky(fetchImpl);
    expect(urls).toHaveLength(1);
    expectSchema(events);
  });

  test("treats a null state list as no flights", () => {
    expect(normalizeOpensky({ time: 1, states: null })).toEqual([]);
  });

  test("names a rate limit when OpenSky says 429", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 429));
    await expect(loadOpensky(fetchImpl)).rejects.toThrow(/rate limit/i);
  });
});
