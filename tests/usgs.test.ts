import { describe, expect, test } from "vitest";
import { loadUsgs, normalizeUsgs, usgsUrl } from "../src/adapters/usgs.ts";
import { expectSchema, jsonResponse, recordingFetch } from "./helpers.ts";

const feed = {
  features: [
    {
      id: "ci123",
      properties: {
        mag: 4.2,
        place: "8 km NE of Upland, CA",
        time: 1_791_700_000_000,
        title: "M 4.2 - 8 km NE of Upland, CA",
        type: "earthquake",
        magType: "ml",
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/ci123",
      },
      geometry: { type: "Point", coordinates: [-117.6, 34.15, 8.2] },
    },
    {
      id: "blast",
      properties: { mag: 1.4, time: 1_791_700_000_000, type: "quarry blast", title: "Quarry" },
      geometry: { type: "Point", coordinates: [-117.5, 34.1, 0] },
    },
    {
      id: "nomag",
      properties: { mag: null, time: 1, type: "earthquake" },
      geometry: { type: "Point", coordinates: [-118, 34, 5] },
    },
  ],
};

describe("USGS adapter", () => {
  test("normalizes earthquakes onto the shared schema", () => {
    const events = normalizeUsgs(feed);
    expectSchema(events);
    expect(events).toHaveLength(1);
    const quake = events[0]!;
    expect(quake).toMatchObject({
      id: "ci123",
      type: "earthquake",
      time: 1_791_700_000_000,
      lat: 34.15,
      lon: -117.6,
      alt: -8200,
      value: 4.2,
      source: "usgs",
    });
    expect(quake.meta?.depthKm).toBe(8.2);
  });

  test("requests the past-day and past-week feeds", async () => {
    const day = recordingFetch(() => jsonResponse(feed));
    await loadUsgs("day", day.fetchImpl);
    expect(day.urls[0]).toBe(usgsUrl("day"));
    expect(day.urls[0]).toContain("all_day.geojson");

    const week = recordingFetch(() => jsonResponse(feed));
    await loadUsgs("week", week.fetchImpl);
    expect(week.urls[0]).toContain("all_week.geojson");
  });

  test("surfaces an HTTP failure", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 503));
    await expect(loadUsgs("day", fetchImpl)).rejects.toThrow(/503/);
  });

  test("returns an empty list for a feed with no features", () => {
    expect(normalizeUsgs({ features: [] })).toEqual([]);
    expect(normalizeUsgs(null)).toEqual([]);
  });
});
