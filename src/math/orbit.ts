import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  propagate,
  radiansToDegrees,
  type SatRec,
} from "satellite.js";

/** Earth's gravitational parameter, m³/s². */
export const MU_M3_S2 = 3.986004418e14;
/** WGS-84 equatorial radius, meters. */
export const EARTH_EQUATORIAL_M = 6_378_137;

export interface OrbitState {
  lat: number;
  lon: number;
  altM: number;
  speedMps: number;
  periodMin: number;
}

export interface Observer {
  lat: number;
  lon: number;
  altKm: number;
}

export interface PassWindow {
  aos: number;
  los: number;
  maxElDeg: number;
  maxTime: number;
}

/** Orbital period from SGP4 mean motion. `satrec.no` is radians per minute. */
export function periodMinutes(satrec: SatRec): number {
  if (!(satrec.no > 0)) return Number.NaN;
  return (2 * Math.PI) / satrec.no;
}

/** Circular-orbit speed v = sqrt(GM / r), with r = equatorial radius + altitude. */
export function circularSpeedMps(altM: number): number {
  const radius = EARTH_EQUATORIAL_M + altM;
  if (!(radius > 0)) return Number.NaN;
  return Math.sqrt(MU_M3_S2 / radius);
}

/** Positions over the trailing `steps` intervals, oldest first. */
export function sampleOrbit(satrec: SatRec, endMs: number, steps = 90, stepMs = 60_000): OrbitState[] {
  const points: OrbitState[] = [];
  for (let i = steps - 1; i >= 0; i -= 1) {
    const state = propagateState(satrec, new Date(endMs - i * stepMs));
    if (state) points.push(state);
  }
  return points;
}

export function propagateState(satrec: SatRec, date: Date): OrbitState | null {
  const pv = propagate(satrec, date);
  if (!pv) return null;
  const geo = eciToGeodetic(pv.position, gstime(date));
  const lat = degreesLat(geo.latitude);
  const lon = degreesLong(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(geo.height)) return null;
  return {
    lat,
    lon,
    altM: geo.height * 1000,
    speedMps: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) * 1000,
    periodMin: periodMinutes(satrec),
  };
}

/**
 * Next pass above `minElDeg` as seen from an observer.
 * If the satellite is already up, the window starts at the rise that is in progress.
 */
export function nextPass(
  satrec: SatRec,
  startMs: number,
  observer: Observer,
  windowHours = 24,
  stepSec = 15,
  minElDeg = 5,
): PassWindow | null {
  const stepMs = stepSec * 1000;
  const end = startMs + windowHours * 3_600_000;
  const startEl = elevationDeg(satrec, new Date(startMs), observer);
  if (startEl == null) return null;

  let aos = Number.NaN;
  let prevEl = startEl;
  let prevT = startMs;

  if (startEl >= minElDeg) {
    aos = startMs;
    for (let t = startMs - stepMs; t >= startMs - 45 * 60_000; t -= stepMs) {
      const el = elevationDeg(satrec, new Date(t), observer);
      if (el == null) break;
      if (el < minElDeg) {
        aos = interpolate(t, el, t + stepMs, prevEl, minElDeg);
        break;
      }
      prevEl = el;
    }
    prevEl = startEl;
    prevT = startMs;
  }

  let maxEl = startEl >= minElDeg ? startEl : -90;
  let maxTime = startMs;

  for (let t = startMs + stepMs; t <= end; t += stepMs) {
    const el = elevationDeg(satrec, new Date(t), observer);
    if (el == null) return null;
    if (!Number.isFinite(aos)) {
      if (prevEl < minElDeg && el >= minElDeg) {
        aos = interpolate(prevT, prevEl, t, el, minElDeg);
        maxEl = el;
        maxTime = t;
      }
    } else if (el >= minElDeg) {
      if (el > maxEl) {
        maxEl = el;
        maxTime = t;
      }
    } else {
      return {
        aos,
        los: interpolate(prevT, prevEl, t, el, minElDeg),
        maxElDeg: maxEl,
        maxTime,
      };
    }
    prevEl = el;
    prevT = t;
  }

  if (!Number.isFinite(aos)) return null;
  return { aos, los: end, maxElDeg: maxEl, maxTime };
}

function elevationDeg(satrec: SatRec, date: Date, observer: Observer): number | null {
  const pv = propagate(satrec, date);
  if (!pv) return null;
  const look = ecfToLookAngles(
    {
      longitude: degreesToRadians(observer.lon),
      latitude: degreesToRadians(observer.lat),
      height: observer.altKm,
    },
    eciToEcf(pv.position, gstime(date)),
  );
  return radiansToDegrees(look.elevation);
}

function interpolate(t0: number, y0: number, t1: number, y1: number, target: number): number {
  const span = y1 - y0;
  const frac = span === 0 ? 0 : (target - y0) / span;
  return t0 + (t1 - t0) * Math.min(1, Math.max(0, frac));
}
