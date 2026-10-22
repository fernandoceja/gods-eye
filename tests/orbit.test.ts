import { twoline2satrec } from "satellite.js";
import { describe, expect, test } from "vitest";
import { haversineMeters } from "../src/math/geodesy.ts";
import { circularSpeedMps, nextPass, periodMinutes, propagateState } from "../src/math/orbit.ts";
import { UPLAND } from "../src/places.ts";
import { ISS_EPOCH, ISS_L1, ISS_L2 } from "./fixtures.ts";

describe("orbit propagation", () => {
  const satrec = twoline2satrec(ISS_L1, ISS_L2);

  test("ISS period is between 92 and 93 minutes", () => {
    const period = periodMinutes(satrec);
    expect(period).toBeGreaterThanOrEqual(92);
    expect(period).toBeLessThanOrEqual(93);
  });

  test("propagated ISS state is a low-Earth orbit near the element epoch", () => {
    const state = propagateState(satrec, ISS_EPOCH);
    expect(state).not.toBeNull();
    expect(state!.altM).toBeGreaterThan(390_000);
    expect(state!.altM).toBeLessThan(460_000);
    const circular = circularSpeedMps(state!.altM);
    const delta = Math.abs(state!.speedMps - circular) / circular;
    expect(delta).toBeLessThan(0.01);
    const later = propagateState(satrec, new Date(ISS_EPOCH.getTime() + 10 * 60_000));
    expect(haversineMeters(state!.lat, state!.lon, later!.lat, later!.lon)).toBeGreaterThan(500_000);
  });

  test("finds a pass over Upland from the element epoch", () => {
    const pass = nextPass(satrec, ISS_EPOCH.getTime(), UPLAND, 24, 30, 5);
    expect(pass).not.toBeNull();
    expect(pass!.maxElDeg).toBeGreaterThanOrEqual(5);
    expect(pass!.los).toBeGreaterThan(pass!.aos);
    expect(pass!.aos).toBeLessThan(ISS_EPOCH.getTime() + 24 * 3_600_000);
  });
});
