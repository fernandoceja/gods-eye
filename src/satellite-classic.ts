/**
 * Classic JavaScript SGP4 entry.
 * satellite.js's package barrel also re-exports a WASM build that Vite
 * cannot emit (top-level await inside an IIFE worker). Propagation here
 * uses only the pure JS functions.
 */
export { twoline2satrec } from "../node_modules/satellite.js/dist/io.js";
export { gstime, propagate } from "../node_modules/satellite.js/dist/propagation.js";
export type { SatRec } from "../node_modules/satellite.js/dist/propagation/SatRec.js";
export {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  radiansToDegrees,
} from "../node_modules/satellite.js/dist/transforms.js";
