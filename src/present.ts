import type { TrackPath } from "./render/globe.ts";
import type { MarkerItem } from "./render/batch.ts";
import { deadReckon, haversineMeters } from "./math/geodesy.ts";
import { circularSpeedMps, EARTH_EQUATORIAL_M } from "./math/orbit.ts";
import type { DetailModel, GeoEvent, LabModel, QuakeSpan } from "./types.ts";
import { DAY_MS } from "./places.ts";
import { formatWhen, km, speedKmh, speedKms } from "./format.ts";

const EVENT_COLOR: Record<string, number> = {
  severeStorms: 0x7ec8ff,
  volcanoes: 0xff5d73,
  wildfires: 0xff9a3c,
};

export function visibleQuakes(events: GeoEvent[], simTime: number, span: QuakeSpan): GeoEvent[] {
  const windowMs = span === "day" ? DAY_MS : 7 * DAY_MS;
  return events.filter((event) => event.time <= simTime && simTime - event.time <= windowMs);
}

export function visibleFires(events: GeoEvent[], simTime: number): GeoEvent[] {
  return events.filter((event) => event.time <= simTime);
}

export function currentEvents(events: GeoEvent[], simTime: number): GeoEvent[] {
  const best = new Map<string, GeoEvent>();
  for (const event of events) {
    if (event.time > simTime) continue;
    const id = String(event.meta?.eventId || event.id.split(":")[0]);
    const existing = best.get(id);
    if (!existing || event.time >= existing.time) best.set(id, event);
  }
  return [...best.values()];
}

export function eventTracks(events: GeoEvent[], simTime: number): TrackPath[] {
  const groups = new Map<string, GeoEvent[]>();
  for (const event of events) {
    if (event.time > simTime) continue;
    const id = String(event.meta?.eventId || event.id.split(":")[0]);
    const list = groups.get(id) ?? [];
    list.push(event);
    groups.set(id, list);
  }
  const tracks: TrackPath[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.time - b.time);
    tracks.push({
      color: EVENT_COLOR[list[list.length - 1]!.type] ?? 0x9ecbff,
      points: list.map((event) => ({ lat: event.lat, lon: event.lon })),
    });
  }
  return tracks;
}

export function quakeMarkers(events: GeoEvent[]): MarkerItem[] {
  return events.map((event) => ({
    id: event.id,
    lat: event.lat,
    lon: event.lon,
    altKm: 28,
    color: quakeColor(event.value),
    sizeKm: 30 + Math.max(0, event.value) ** 2 * 2.5,
  }));
}

export function fireMarkers(events: GeoEvent[]): MarkerItem[] {
  return events.map((event) => ({
    id: event.id,
    lat: event.lat,
    lon: event.lon,
    altKm: 22,
    color: 0xff6a2c,
    sizeKm: 16 + Math.min(34, Math.sqrt(Math.max(0, event.value)) * 1.5),
  }));
}

export function naturalMarkers(events: GeoEvent[]): MarkerItem[] {
  return events.map((event) => ({
    id: event.id,
    lat: event.lat,
    lon: event.lon,
    altKm: 40,
    color: EVENT_COLOR[event.type] ?? 0xd7e4ff,
    sizeKm: 48,
  }));
}

export function satelliteMarkers(events: GeoEvent[]): MarkerItem[] {
  return events.map((event) => {
    const iss = event.meta?.iss === true;
    return {
      id: event.id,
      lat: event.lat,
      lon: event.lon,
      altKm: event.alt / 1000,
      color: iss ? 0xffd27a : 0xc9d7f5,
      sizeKm: iss ? 78 : 30,
    };
  });
}

export function cameraMarkers(events: GeoEvent[]): MarkerItem[] {
  return events.map((event) => ({
    id: event.id,
    lat: event.lat,
    lon: event.lon,
    altKm: 26,
    color: 0xcfd8ff,
    sizeKm: 15,
  }));
}

export interface FlightNow {
  event: GeoEvent;
  marker: MarkerItem;
}

export function reckonFlights(samples: GeoEvent[], simTime: number): FlightNow[] {
  const flights: FlightNow[] = [];
  for (const sample of samples) {
    const dt = (simTime - sample.time) / 1000;
    if (Math.abs(dt) > 180) continue;
    const heading = typeof sample.meta?.heading === "number" ? sample.meta.heading : null;
    const vertical = typeof sample.meta?.verticalRate === "number" ? sample.meta.verticalRate : 0;
    const posed = deadReckon(
      sample.lat,
      sample.lon,
      sample.alt,
      heading == null ? 0 : sample.value,
      heading ?? 0,
      vertical,
      dt,
    );
    const event: GeoEvent = { ...sample, lat: posed.lat, lon: posed.lon, alt: posed.altM };
    flights.push({
      event,
      marker: {
        id: sample.id,
        lat: posed.lat,
        lon: posed.lon,
        altKm: Math.max(4, posed.altM / 1000) + 8,
        color: 0x9be7c4,
        sizeKm: 72,
        headingDeg: heading ?? 0,
      },
    });
  }
  return flights;
}

export function withDeadReckonError(history: Map<string, GeoEvent>, events: GeoEvent[]): GeoEvent[] {
  return events.map((event) => {
    const prior = history.get(event.id);
    let drErrorM: number | null = null;
    const heading = prior?.meta?.heading;
    if (prior && typeof heading === "number") {
      const dt = (event.time - prior.time) / 1000;
      const vertical = typeof prior.meta?.verticalRate === "number" ? prior.meta.verticalRate : 0;
      if (dt > 1 && dt < 600) {
        const predicted = deadReckon(prior.lat, prior.lon, prior.alt, prior.value, heading, vertical, dt);
        drErrorM = haversineMeters(predicted.lat, predicted.lon, event.lat, event.lon);
      }
    }
    history.set(event.id, event);
    return { ...event, meta: { ...event.meta, drErrorM } };
  });
}

export function detailModel(event: GeoEvent, pass?: string): DetailModel {
  if (event.type === "earthquake") {
    const depth = Math.abs(event.alt);
    return {
      kicker: "Earthquake",
      title: event.label || "Earthquake",
      source: "USGS",
      rows: [
        { label: "Magnitude", value: event.value.toFixed(1) },
        { label: "Depth", value: km(depth) },
        { label: "When", value: formatWhen(event.time) },
        { label: "Location", value: `${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}°` },
      ],
    };
  }
  if (event.type === "fire") {
    return {
      kicker: "Active fire",
      title: "VIIRS detection",
      source: "NASA FIRMS",
      rows: [
        { label: "FRP", value: typeof event.meta?.frp === "number" ? `${event.meta.frp.toFixed(1)} MW` : "—" },
        { label: "Brightness", value: typeof event.meta?.brightness === "number" ? `${event.meta.brightness.toFixed(1)} K` : "—" },
        { label: "Confidence", value: String(event.meta?.confidence || "—") },
        { label: "Satellite", value: String(event.meta?.satellite || "—") },
        { label: "When", value: formatWhen(event.time) },
      ],
    };
  }
  if (event.type === "flight") {
    const error = event.meta?.drErrorM;
    return {
      kicker: "Flight",
      title: event.label || event.id.toUpperCase(),
      source: "OpenSky",
      rows: [
        { label: "Altitude", value: km(event.alt) },
        { label: "Ground speed", value: `${speedKmh(event.value)} · ${Math.round(event.value)} m/s` },
        { label: "Track", value: typeof event.meta?.heading === "number" ? `${Math.round(event.meta.heading)}°` : "—" },
        { label: "Country", value: String(event.meta?.country || "—") },
        { label: "Reckoning error", value: typeof error === "number" ? formatError(error) : "Waiting for the next poll" },
      ],
      note: "Position is dead-reckoned from the last OpenSky fix while the clock runs.",
    };
  }
  if (event.type === "camera") {
    const imageUrl = typeof event.meta?.imageUrl === "string" ? event.meta.imageUrl : "";
    return {
      kicker: "Traffic camera",
      title: event.label || "Caltrans camera",
      source: "Caltrans",
      rows: [
        { label: "Route", value: String(event.meta?.route || "—") },
        { label: "Near", value: String(event.meta?.nearbyPlace || "—") },
        { label: "Direction", value: String(event.meta?.direction || "—") },
        { label: "District", value: typeof event.meta?.district === "number" ? `D${event.meta.district}` : "—" },
        { label: "Elevation", value: event.alt ? km(event.alt) : "—" },
        { label: "Location", value: `${event.lat.toFixed(3)}°, ${event.lon.toFixed(3)}°` },
      ],
      ...(imageUrl ? { image: { src: imageUrl, alt: event.label || "Caltrans camera" } } : {}),
      note: "Live still from Caltrans. The card reloads it about once a minute while this camera stays selected.",
    };
  }
  if (event.type === "satellite") {
    const period = typeof event.meta?.periodMin === "number" ? event.meta.periodMin : Number.NaN;
    return {
      kicker: event.meta?.iss === true ? "ISS" : "Satellite",
      title: event.label || "Satellite",
      source: event.source === "celestrak-sample" ? "CelesTrak sample" : "CelesTrak",
      rows: [
        { label: "NORAD", value: String(event.meta?.noradId ?? "—") },
        { label: "Altitude", value: km(event.alt) },
        { label: "Speed", value: speedKms(event.value) },
        { label: "Period", value: Number.isFinite(period) ? `${period.toFixed(1)} min` : "—" },
        { label: "Group", value: String(event.meta?.group ?? "—") },
        { label: "Next pass over Upland", value: pass || "Computing…" },
      ],
      note:
        event.source === "celestrak-sample"
          ? "These elements are a saved sample from 11 Oct 2026. Live CelesTrak did not respond."
          : "Pass times use a 5° elevation mask at Upland, California.",
    };
  }
  return {
    kicker: String(event.meta?.category || "Natural event"),
    title: event.label || "Event",
    source: "NASA EONET",
    rows: [
      { label: "Category", value: String(event.meta?.category || event.type) },
      { label: "Value", value: event.value ? `${event.value} ${event.meta?.magnitudeUnit ?? ""}`.trim() : "—" },
      { label: "When", value: formatWhen(event.time) },
      { label: "Location", value: `${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}°` },
    ],
    note: "Replay moves the marker along the reported track.",
  };
}

export function labModel(event: GeoEvent | null): LabModel {
  if (!event || (event.type !== "satellite" && event.type !== "flight")) {
    return {
      heading: "Pick a satellite or a flight",
      rows: [],
      formula: "v = √(GM / r)",
      note: "Satellites compare that circular-orbit speed with the SGP4 velocity. Flights show how far a constant-velocity guess drifted from the next OpenSky fix.",
    };
  }
  if (event.type === "satellite") {
    const circular = circularSpeedMps(event.alt);
    const delta = circular > 0 ? ((event.value - circular) / circular) * 100 : 0;
    const radius = (EARTH_EQUATORIAL_M + event.alt) / 1000;
    return {
      heading: event.label || "Satellite",
      rows: [
        { label: "Circular v", value: speedKms(circular) },
        { label: "SGP4 speed", value: speedKms(event.value) },
        { label: "Difference", value: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%` },
        { label: "Radius r", value: `${radius.toFixed(1)} km` },
      ],
      formula: "v = √(GM / r)",
      note: "GM = 3.986004418×10¹⁴ m³/s². r is the WGS-84 equator plus altitude. The gap is eccentricity, Earth oblateness, and drag.",
    };
  }
  const error = event.meta?.drErrorM;
  return {
    heading: event.label || "Flight",
    rows: [
      { label: "Dead-reckoning error", value: typeof error === "number" ? formatError(error) : "Waiting for the next poll" },
      { label: "Ground speed", value: speedKmh(event.value) },
      { label: "Track", value: typeof event.meta?.heading === "number" ? `${Math.round(event.meta.heading)}°` : "—" },
    ],
    formula: "p(t) = p₀ + v Δt",
    note: "Speed and heading stay constant between OpenSky polls. The error is the distance from that prediction to the next fix.",
  };
}

function quakeColor(magnitude: number): number {
  const t = Math.min(1, Math.max(0, (magnitude - 1) / 6));
  const red = 255;
  const green = Math.round(184 - t * 140);
  const blue = Math.round(64 - t * 40);
  return (red << 16) + (green << 8) + Math.max(0, blue);
}

function formatError(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}
