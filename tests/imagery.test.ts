import { describe, expect, test } from "vitest";
import { gibsTrueColorUrl, imageryEvent, loadImagery } from "../src/adapters/imagery.ts";
import { isGeoEvent } from "../src/types.ts";
import { recordingFetch, textResponse } from "./helpers.ts";

describe("GIBS imagery adapter", () => {
  test("describes a true-color day on the shared schema", () => {
    const event = imageryEvent("2026-10-11");
    expect(isGeoEvent(event)).toBe(true);
    expect(event).toMatchObject({
      id: "gibs:2026-10-11",
      type: "imagery",
      source: "gibs",
      time: Date.parse("2026-10-11T12:00:00Z"),
      lat: 0,
      lon: 0,
      alt: 0,
    });
  });

  test("requests the VIIRS daily true-color WMS layer", async () => {
    const { fetchImpl, urls } = recordingFetch((url) => {
      expect(url).toBe(gibsTrueColorUrl("2026-10-11"));
      expect(url).toContain("VIIRS_SNPP_CorrectedReflectance_TrueColor");
      expect(url).toContain("TIME=2026-10-11");
      expect(url).toContain("BBOX=-90%2C-180%2C90%2C180");
      return textResponse("jpeg-bytes", 200, "image/jpeg");
    });
    const { event, blob } = await loadImagery("2026-10-11", fetchImpl);
    expect(urls).toHaveLength(1);
    expect(isGeoEvent(event)).toBe(true);
    expect(blob.size).toBeGreaterThan(0);
  });
});
