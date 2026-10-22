import { describe, expect, test } from "vitest";
import {
  EARTH_RADIUS_M,
  deadReckon,
  enuBasis,
  haversineMeters,
  latLonToXyz,
  xyzToLatLon,
} from "../src/math/geodesy.ts";
import { UPLAND } from "../src/places.ts";

describe("distance math", () => {
  test("zero separation is zero", () => {
    expect(haversineMeters(UPLAND.lat, UPLAND.lon, UPLAND.lat, UPLAND.lon)).toBe(0);
  });

  test("one degree of latitude is one arc degree of the mean radius", () => {
    const distance = haversineMeters(0, 0, 1, 0);
    const expected = EARTH_RADIUS_M * (Math.PI / 180);
    expect(Math.abs(distance - expected)).toBeLessThan(1);
  });

  test("Upland round-trips through globe coordinates", () => {
    const point = latLonToXyz(UPLAND.lat, UPLAND.lon, 1, 6371);
    const back = xyzToLatLon(point);
    expect(back.lat).toBeCloseTo(UPLAND.lat, 6);
    expect(back.lon).toBeCloseTo(UPLAND.lon, 6);
  });

  test("the local east-north-up frame at lon 0 on the equator", () => {
    const { east, north, up } = enuBasis(0, 0);
    expect(up.x).toBeCloseTo(1, 6);
    expect(north.y).toBeCloseTo(1, 6);
    expect(east.z).toBeCloseTo(-1, 6);
  });

  test("dead reckoning due north for 111.195 km is about one degree", () => {
    const next = deadReckon(0, 0, 1000, 111.195, 0, 0, 1000);
    expect(next.lat).toBeCloseTo(1, 2);
    expect(next.lon).toBeCloseTo(0, 4);
    expect(next.altM).toBe(1000);
  });

  test("dead-reckoning error is the distance from the prediction to the next fix", () => {
    const dt = 30;
    const predicted = deadReckon(34.0975, -117.6484, 10_000, 250, 90, 0, dt);
    const actualLat = predicted.lat + 500 / 111_195;
    const error = haversineMeters(predicted.lat, predicted.lon, actualLat, predicted.lon);
    expect(error).toBeGreaterThan(450);
    expect(error).toBeLessThan(550);
    expect(haversineMeters(predicted.lat, predicted.lon, predicted.lat, predicted.lon)).toBe(0);
  });
});
