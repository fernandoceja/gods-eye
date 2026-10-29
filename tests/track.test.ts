import { describe, expect, test } from "vitest";
import { EARTH_RADIUS_KM, latLonToXyz } from "../src/math/geodesy.ts";
import { TrailBuffer, directionFor, rotateWithDirection, trackDistanceKm, trailColor } from "../src/track.ts";
import type { GeoEvent } from "../src/types.ts";

function event(partial: Partial<GeoEvent>): GeoEvent {
  return {
    id: "x",
    type: "flight",
    time: 0,
    lat: 34,
    lon: -117,
    alt: 10_000,
    value: 250,
    source: "test",
    ...partial,
  };
}

describe("TrailBuffer", () => {
  test("keeps the first point and drops copies that barely moved", () => {
    const trail = new TrailBuffer(10, 600_000, 1_500);
    trail.push({ lat: 0, lon: 0, altKm: 10, t: 0 });
    trail.push({ lat: 0, lon: 0.001, altKm: 10, t: 5_000 });
    expect(trail.size).toBe(1);
    trail.push({ lat: 0, lon: 0.02, altKm: 10, t: 10_000 });
    expect(trail.size).toBe(2);
    expect(trail.points().map((point) => point.lon)).toEqual([0, 0.02]);
  });

  test("a stationary target still extends its trail on the time rule", () => {
    const trail = new TrailBuffer(10, 600_000, 1_500);
    trail.push({ lat: 10, lon: 20, altKm: 0, t: 0 });
    trail.push({ lat: 10, lon: 20, altKm: 0, t: 31_000 });
    expect(trail.size).toBe(2);
  });

  test("points older than the age limit fall off", () => {
    const trail = new TrailBuffer(10, 60_000, 1);
    trail.push({ lat: 0, lon: 0, altKm: 0, t: 0 });
    trail.push({ lat: 0, lon: 0.01, altKm: 0, t: 30_000 });
    trail.push({ lat: 0, lon: 0.02, altKm: 0, t: 61_000 });
    expect(trail.points().map((point) => point.t)).toEqual([30_000, 61_000]);
  });

  test("capacity caps the buffer, keeping the newest points", () => {
    const trail = new TrailBuffer(3, 600_000, 1);
    for (let i = 0; i < 6; i += 1) trail.push({ lat: 0, lon: i * 0.01, altKm: 0, t: i * 1_000 });
    expect(trail.size).toBe(3);
    expect(trail.points()[0]!.lon).toBeCloseTo(0.03);
  });

  test("clear empties the buffer", () => {
    const trail = new TrailBuffer();
    trail.push({ lat: 0, lon: 0, altKm: 0, t: 0 });
    trail.clear();
    expect(trail.size).toBe(0);
    expect(trail.points()).toEqual([]);
  });
});

describe("rotateWithDirection", () => {
  test("no direction change leaves the position untouched", () => {
    const dir = directionFor(34, -117);
    const position = latLonToXyz(34, -117, 4_000, EARTH_RADIUS_KM);
    const out = rotateWithDirection(position, dir, dir);
    expect(out.x).toBeCloseTo(position.x);
    expect(out.y).toBeCloseTo(position.y);
    expect(out.z).toBeCloseTo(position.z);
  });

  test("rotating the camera by the target's move lands it on the new direction", () => {
    const from = directionFor(34, -117);
    const to = directionFor(40, -100);
    const position = latLonToXyz(34, -117, 4_000, EARTH_RADIUS_KM);
    const out = rotateWithDirection(position, from, to);
    const length = Math.hypot(out.x, out.y, out.z);
    expect(length).toBeCloseTo(Math.hypot(position.x, position.y, position.z), 4);
    const dot =
      (out.x * to.x + out.y * to.y + out.z * to.z) / length;
    expect(dot).toBeCloseTo(1, 6);
  });

  test("antipodal directions still rotate half a turn", () => {
    const position = { x: EARTH_RADIUS_KM * 2, y: 0, z: 0 };
    const out = rotateWithDirection(position, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 });
    expect(out.x).toBeCloseTo(-EARTH_RADIUS_KM * 2, 4);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(EARTH_RADIUS_KM * 2, 4);
  });
});

describe("track framing", () => {
  test("flights frame closest, then satellites, then surface targets", () => {
    expect(trackDistanceKm("flight")).toBeLessThan(trackDistanceKm("satellite"));
    expect(trackDistanceKm("satellite")).toBeLessThan(trackDistanceKm("fire"));
    expect(trackDistanceKm("flight")).toBeGreaterThan(EARTH_RADIUS_KM * 1.06);
    expect(trackDistanceKm("earthquake")).toBeLessThan(EARTH_RADIUS_KM * 14);
  });

  test("trail colours follow the layer colours", () => {
    expect(trailColor(event({ type: "flight" }))).toBe(0x9be7c4);
    expect(trailColor(event({ type: "satellite", meta: { iss: true } }))).toBe(0xffd27a);
    expect(trailColor(event({ type: "satellite", meta: { iss: false } }))).toBe(0xc9d7f5);
    expect(trailColor(event({ type: "fire" }))).toBe(0xff6a2c);
    expect(trailColor(event({ type: "severeStorms" }))).toBe(0x7ec8ff);
  });
});
