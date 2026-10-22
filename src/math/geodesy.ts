const DEG = Math.PI / 180;
const METERS_PER_DEG = 111_195;

/** Mean Earth radius used by the haversine distance. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** Scene radius. Altitudes are added in the same unit the caller passes. */
export const EARTH_RADIUS_KM = 6371;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = lat1 * DEG;
  const phi2 = lat2 * DEG;
  const dPhi = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/**
 * Globe coordinates that match Three.js SphereGeometry.
 * Longitude -180 sits on -X, longitude 0 on +X, north on +Y.
 * `alt` and `radius` must share a unit.
 */
export function latLonToXyz(latDeg: number, lonDeg: number, alt: number, radius: number): Vec3 {
  const r = radius + alt;
  const phi = (90 - latDeg) * DEG;
  const theta = (lonDeg + 180) * DEG;
  const sinPhi = Math.sin(phi);
  return {
    x: -r * sinPhi * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * sinPhi * Math.sin(theta),
  };
}

export function xyzToLatLon(point: Vec3): { lat: number; lon: number; radius: number } {
  const radius = Math.hypot(point.x, point.y, point.z);
  const lat = 90 - (Math.acos(clamp(point.y / radius, -1, 1)) * 180) / Math.PI;
  const theta = Math.atan2(point.z, -point.x);
  let lon = (theta * 180) / Math.PI - 180;
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon, radius };
}

export function enuBasis(lat: number, lon: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const up = normalize(latLonToXyz(lat, lon, 0, 1));
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  const north = normalize(
    reject(
      {
        x: Math.cos(phi) * Math.cos(theta),
        y: Math.sin(phi),
        z: -Math.cos(phi) * Math.sin(theta),
      },
      up,
    ),
  );
  const east = normalize(cross(north, up));
  return { east, north, up };
}

/**
 * Constant-velocity ground track. Heading is degrees clockwise from north.
 * Accurate enough for the few minutes between OpenSky polls.
 */
export function deadReckon(
  lat: number,
  lon: number,
  altM: number,
  speedMps: number,
  trackDeg: number,
  verticalRateMps: number,
  dtSec: number,
): { lat: number; lon: number; altM: number } {
  const distance = speedMps * dtSec;
  const heading = trackDeg * DEG;
  const north = Math.cos(heading) * distance;
  const east = Math.sin(heading) * distance;
  const dLat = north / METERS_PER_DEG;
  const cosLat = Math.cos(lat * DEG);
  const dLon = east / (METERS_PER_DEG * Math.max(0.15, cosLat));
  let nextLon = lon + dLon;
  nextLon = ((nextLon + 540) % 360) - 180;
  return {
    lat: lat + dLat,
    lon: nextLon,
    altM: altM + verticalRateMps * dtSec,
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

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function reject(a: Vec3, axis: Vec3): Vec3 {
  const along = scale(axis, dot(a, axis));
  return { x: a.x - along.x, y: a.y - along.y, z: a.z - along.z };
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}
