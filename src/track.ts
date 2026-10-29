import { EARTH_RADIUS_KM, haversineMeters, latLonToXyz, type Vec3 } from "./math/geodesy.ts";
import type { GeoEvent } from "./types.ts";

export interface TrailPoint {
  lat: number;
  lon: number;
  altKm: number;
  t: number;
}

/**
 * Recent positions of the tracked target, oldest first. Distance-sampled, so a
 * paused clock or a stationary target does not fill the buffer with copies,
 * and fast replay still lays down a readable path.
 */
export class TrailBuffer {
  private items: TrailPoint[] = [];
  private readonly capacity: number;
  private readonly maxAgeMs: number;
  private readonly minStepM: number;

  constructor(capacity = 300, maxAgeMs = 1_800_000, minStepM = 1_500) {
    this.capacity = capacity;
    this.maxAgeMs = maxAgeMs;
    this.minStepM = minStepM;
  }

  push(point: TrailPoint): void {
    const last = this.items[this.items.length - 1];
    if (last) {
      const moved = haversineMeters(last.lat, last.lon, point.lat, point.lon);
      if (moved < this.minStepM && point.t - last.t < 30_000) return;
    }
    this.items.push(point);
    const cutoff = point.t - this.maxAgeMs;
    while (this.items.length > 0 && this.items[0]!.t < cutoff) this.items.shift();
    while (this.items.length > this.capacity) this.items.shift();
  }

  clear(): void {
    this.items = [];
  }

  points(): TrailPoint[] {
    return this.items.slice();
  }

  get size(): number {
    return this.items.length;
  }
}

/** Unit direction of a surface point, in the same frame the globe renders. */
export function directionFor(lat: number, lon: number): Vec3 {
  return latLonToXyz(lat, lon, 0, 1);
}

/**
 * Rotate `position` by the rotation that carries direction `from` to direction
 * `to`. Applied to the camera each frame, it keeps a moving target centred
 * while OrbitControls keeps owning distance, zoom, and damping.
 */
export function rotateWithDirection(position: Vec3, from: Vec3, to: Vec3): Vec3 {
  const a = normalize(from);
  const b = normalize(to);
  const cos = clamp(dot(a, b), -1, 1);
  if (cos > 0.999999) return { ...position };
  if (cos < -0.999999) {
    const axis = normalize(Math.abs(a.y) < 0.9 ? cross(a, { x: 0, y: 1, z: 0 }) : cross(a, { x: 1, y: 0, z: 0 }));
    return rodrigues(position, axis, Math.PI);
  }
  const axis = normalize(cross(a, b));
  return rodrigues(position, axis, Math.acos(cos));
}

/** Camera distance from Earth's centre when a target is first locked. */
export function trackDistanceKm(type: string): number {
  const mult = type === "flight" ? 1.5 : type === "satellite" ? 1.65 : 1.9;
  return EARTH_RADIUS_KM * mult;
}

/** Trail colour per target, matching the layer colours in present.ts. */
export function trailColor(event: GeoEvent): number {
  if (event.type === "flight") return 0x9be7c4;
  if (event.type === "satellite") return event.meta?.iss === true ? 0xffd27a : 0xc9d7f5;
  if (event.type === "fire") return 0xff6a2c;
  if (event.type === "earthquake") return 0xffb347;
  if (event.type === "severeStorms") return 0x7ec8ff;
  if (event.type === "volcanoes") return 0xff5d73;
  if (event.type === "wildfires") return 0xff9a3c;
  return 0xd7e4ff;
}

function rodrigues(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const crossTerm = cross(axis, v);
  const along = dot(axis, v) * (1 - cos);
  return {
    x: v.x * cos + crossTerm.x * sin + axis.x * along,
    y: v.y * cos + crossTerm.y * sin + axis.y * along,
    z: v.z * cos + crossTerm.z * sin + axis.z * along,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / length, y: a.y / length, z: a.z / length };
}
