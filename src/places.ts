/** Fernando Ceja's home. Pass predictions and the home button use this point. */
export const UPLAND = {
  name: "Upland",
  region: "California",
  lat: 34.0975,
  lon: -117.6484,
  altKm: 0.384,
} as const;

/** OpenSky query box: coast, basins, and the desert around Southern California. */
export const SOCAL_BOX = {
  lamin: 32.4,
  lamax: 35.6,
  lomin: -120.8,
  lomax: -114.4,
} as const;

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export const TTL = {
  usgsDay: 5 * 60_000,
  usgsWeek: 15 * 60_000,
  eonet: 10 * 60_000,
  celestrak: 2 * HOUR_MS,
  firms: 30 * 60_000,
} as const;
