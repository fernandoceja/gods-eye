import { describe, expect, test } from "vitest";
import { firmsUrl, loadFirms, normalizeFirms } from "../src/adapters/firms.ts";
import { expectSchema, recordingFetch, textResponse } from "./helpers.ts";

const csv = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
34.10,-117.60,330.5,0.4,0.4,2026-10-12,0830,N,VIIRS,nominal,2.0,300.1,12.5,D
nope,still,-,-,-,2026-10-12,0900,N,VIIRS,low,2.0,1,1,N
33.20,-116.40,310.0,0.4,0.4,2026-10-12,45,N,VIIRS,high,2.0,290.0,4,N
`;

describe("FIRMS adapter", () => {
  test("normalizes active-fire CSV onto the shared schema", () => {
    const events = normalizeFirms(csv);
    expectSchema(events);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "fire",
      lat: 34.1,
      lon: -117.6,
      alt: 0,
      value: 12.5,
      source: "firms",
      time: Date.parse("2026-10-12T08:30:00Z"),
    });
    expect(events[1]?.time).toBe(Date.parse("2026-10-12T00:45:00Z"));
    expect(events[0]?.meta?.confidence).toBe("nominal");
  });

  test("requests the world VIIRS feed through the local proxy", async () => {
    const { fetchImpl, urls } = recordingFetch((url) => {
      expect(url).toBe(firmsUrl("demo-key"));
      expect(url.startsWith("/proxy/firms/")).toBe(true);
      return textResponse(csv);
    });
    const events = await loadFirms("demo-key", fetchImpl);
    expect(urls).toHaveLength(1);
    expectSchema(events);
  });

  test("refuses to call FIRMS without a key", async () => {
    const { fetchImpl, urls } = recordingFetch(() => textResponse(csv));
    await expect(loadFirms("  ", fetchImpl)).rejects.toThrow(/MAP_KEY/);
    expect(urls).toHaveLength(0);
  });

  test("turns an invalid MAP_KEY response into a clear error", async () => {
    const { fetchImpl } = recordingFetch(() => textResponse("Invalid MAP_KEY.", 400));
    await expect(loadFirms("not-a-real-key", fetchImpl)).rejects.toThrow(/rejected the MAP_KEY/);
  });

  test("returns nothing for a header-only file", () => {
    expect(normalizeFirms("latitude,longitude,acq_date,acq_time\n")).toEqual([]);
  });
});
