import { describe, expect, test } from "vitest";
import { catalogToEvents, loadCelestrak, parseTle } from "../src/adapters/celestrak.ts";
import { isGeoEvent } from "../src/types.ts";
import { ISS_EPOCH, ISS_TLE, VISUAL_TLE } from "./fixtures.ts";
import { recordingFetch, textResponse } from "./helpers.ts";

describe("CelesTrak adapter", () => {
  test("parses three-line elements into catalog records", () => {
    const sats = parseTle(`${ISS_TLE}${VISUAL_TLE}`, "stations");
    expect(sats.map((sat) => sat.noradId)).toEqual([25544, 48274]);
    expect(sats[0]?.name).toBe("ISS (ZARYA)");
  });

  test("fetches stations and visual groups, then normalizes a propagated fix", async () => {
    const { fetchImpl, urls } = recordingFetch((url) => {
      if (url.includes("GROUP=stations")) return textResponse(ISS_TLE);
      if (url.includes("GROUP=visual")) return textResponse(VISUAL_TLE);
      return textResponse("nope", 404);
    });
    const catalog = await loadCelestrak(fetchImpl);
    expect(urls.every((url) => url.startsWith("https://celestrak.org/NORAD/elements/gp.php"))).toBe(true);
    expect(urls.some((url) => url.includes("GROUP=stations"))).toBe(true);
    expect(urls.some((url) => url.includes("GROUP=visual"))).toBe(true);
    const events = catalogToEvents(catalog, ISS_EPOCH);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(isGeoEvent(event)).toBe(true);
    const iss = events.find((event) => event.meta?.iss === true);
    expect(iss).toMatchObject({ type: "satellite", source: "celestrak" });
    expect(iss?.alt).toBeGreaterThan(350_000);
    expect(iss?.alt).toBeLessThan(500_000);
    expect(iss?.meta?.periodMin).toBeGreaterThanOrEqual(92);
    expect(iss?.meta?.periodMin).toBeLessThanOrEqual(93);
  });
});
