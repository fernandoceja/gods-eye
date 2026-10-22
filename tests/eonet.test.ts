import { describe, expect, test } from "vitest";
import { EONET_URL, loadEonet, normalizeEonet } from "../src/adapters/eonet.ts";
import { expectSchema, jsonResponse, recordingFetch } from "./helpers.ts";

const payload = {
  events: [
    {
      id: "EONET_1",
      title: "Hurricane Simon",
      closed: null,
      categories: [{ id: "severeStorms", title: "Severe Storms" }],
      geometry: [
        { date: "2026-10-07T18:00:00Z", type: "Point", coordinates: [-101.3, 15.2], magnitudeValue: 35, magnitudeUnit: "kts" },
        { date: "2026-10-08T00:00:00Z", type: "Point", coordinates: [-102.1, 16.4], magnitudeValue: 50, magnitudeUnit: "kts" },
      ],
    },
    {
      id: "EONET_2",
      title: "Kilauea",
      categories: [{ id: "volcanoes", title: "Volcanoes" }],
      geometry: [{ date: "2026-10-11T12:00:00Z", type: "Point", coordinates: [-155.29, 19.42] }],
    },
    {
      id: "EONET_3",
      title: "Iceberg",
      categories: [{ id: "seaLakeIce", title: "Sea and Lake Ice" }],
      geometry: [{ date: "2026-10-01T00:00:00Z", type: "Point", coordinates: [0, -70] }],
    },
  ],
};

describe("EONET adapter", () => {
  test("keeps storms, volcanoes, and wildfires as point events", () => {
    const events = normalizeEonet(payload);
    expectSchema(events);
    expect(events.map((event) => event.type)).toEqual(["severeStorms", "severeStorms", "volcanoes"]);
    expect(events[1]).toMatchObject({
      id: "EONET_1:1",
      lat: 16.4,
      lon: -102.1,
      alt: 0,
      value: 50,
      source: "eonet",
    });
    expect(events[2]?.label).toBe("Kilauea");
  });

  test("requests the open-events feed", async () => {
    const { fetchImpl, urls } = recordingFetch(() => jsonResponse(payload));
    const events = await loadEonet(fetchImpl);
    expect(urls[0]).toBe(EONET_URL);
    expectSchema(events);
  });

  test("returns an empty list when the payload has no events", () => {
    expect(normalizeEonet({ events: [] })).toEqual([]);
  });
});
