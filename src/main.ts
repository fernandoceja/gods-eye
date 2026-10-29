import "./style.css";
import { loadCaltrans } from "./adapters/caltrans.ts";
import { loadCelestrak, sampleCatalog, catalogToEvents, type CatalogSat } from "./adapters/celestrak.ts";
import { loadEonet } from "./adapters/eonet.ts";
import { loadFirms } from "./adapters/firms.ts";
import { loadImagery } from "./adapters/imagery.ts";
import { loadOpensky } from "./adapters/opensky.ts";
import { loadUsgs } from "./adapters/usgs.ts";
import { clearCache } from "./cache.ts";
import { SimClock } from "./clock.ts";
import { formatPt, shiftDate, utcDateString } from "./format.ts";
import { EARTH_RADIUS_KM } from "./math/geodesy.ts";
import { nextPass, sampleOrbit } from "./math/orbit.ts";
import { UPLAND } from "./places.ts";
import {
  cameraMarkers,
  currentEvents,
  detailModel,
  eventTracks,
  fireMarkers,
  labModel,
  naturalMarkers,
  quakeMarkers,
  reckonFlights,
  satelliteMarkers,
  visibleFires,
  visibleQuakes,
  withDeadReckonError,
} from "./present.ts";
import { GlobeView } from "./render/globe.ts";
import { readFirmsKey, writeFirmsKey } from "./settings.ts";
import { TrailBuffer, trackDistanceKm, trailColor } from "./track.ts";
import type { GeoEvent, LayerName, QuakeSpan } from "./types.ts";
import { mountUi } from "./ui.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#globe");
const uiRoot = document.querySelector<HTMLElement>("#ui");
if (!canvas || !uiRoot) throw new Error("Missing app shell");

const globe = new GlobeView(canvas);
const clock = new SimClock();
const flightHistory = new Map<string, GeoEvent>();

const enabled: Record<LayerName, boolean> = {
  quakes: true,
  fires: false,
  events: true,
  satellites: true,
  flights: true,
  cameras: false,
  imagery: true,
};

let quakeSpan: QuakeSpan = "day";
const quakeCache: Record<QuakeSpan, GeoEvent[]> = { day: [], week: [] };
let quakeLoading = false;
let quakeError: string | null = null;

let fires: GeoEvent[] = [];
let fireTruncated = false;
let fireLoading = false;
let fireError: string | null = null;

let natural: GeoEvent[] = [];
let eventLoading = false;
let eventError: string | null = null;

let flights: GeoEvent[] = [];
let flightError: string | null = null;
let flightGeneration = 0;
let flightTimer = 0;

let cameras: GeoEvent[] = [];
let camLoading = false;
let camError: string | null = null;

let catalog: CatalogSat[] = [];
let satLoading = false;
let satNote = "Stations and bright visual satellites";
let showStations = true;
let showVisual = true;

let selected: { layer: string; id: string } | null = null;
let tracking: { layer: string; id: string } | null = null;
let trackFlyPending = false;
let lastSelectedEvent: GeoEvent | null = null;
const trail = new TrailBuffer();
let passCache: { key: string; text: string } | null = null;
let trailsArmed = false;
let lastTrail = 0;
let lastUi = 0;

let pendingDate = "";
let shownDate = "";
let imageTimer = 0;
let imageToken = 0;
let imageLoading = false;
let imageError: string | null = null;
let imageNote = "NASA GIBS VIIRS true color";

const ui = mountUi(uiRoot, {
  onToggle: (layer, on) => {
    if (layer === "fires" && on && !readFirmsKey()) {
      enabled.fires = false;
      ui.openSettings();
      return;
    }
    enabled[layer] = on;
    if (layer === "imagery") globe.setImageryVisible(on);
    if (layer === "flights") {
      if (on) startFlights();
      else stopFlights();
    }
    if (layer === "fires" && on) void refreshFires();
    if (layer === "cameras" && on) void refreshCameras();
    if (layer === "satellites" && !on) {
      globe.setTrails([]);
      trailsArmed = false;
    }
  },
  onQuakeSpan: (span) => {
    quakeSpan = span;
    if (quakeCache[span].length === 0) void refreshQuakes(span);
  },
  onSatGroup: (group, on) => {
    if (group === "stations") showStations = on;
    else showVisual = on;
    trailsArmed = false;
  },
  onPlay: () => {
    clock.playing = !clock.playing;
  },
  onLive: () => clock.goLive(),
  onScrubStart: () => {
    clock.playing = false;
    clock.live = false;
  },
  onScrub: (time) => clock.setTime(time),
  onRate: (rate) => clock.setRate(rate),
  onHome: () => globe.flyHome(),
  onDate: (iso) => {
    const timeOfDay = new Date(clock.simTime).toISOString().slice(11, 19);
    const next = Date.parse(`${iso}T${timeOfDay}Z`);
    if (Number.isFinite(next)) {
      clock.setTime(next);
      clock.playing = false;
    }
  },
  onSaveKey: (key) => {
    writeFirmsKey(key);
    ui.setKey(readFirmsKey());
    if (readFirmsKey()) {
      enabled.fires = true;
      void refreshFires();
      ui.toast("FIRMS key saved in this browser");
    } else {
      enabled.fires = false;
      fires = [];
      fireError = null;
    }
  },
  onClearCache: () => {
    clearCache();
    pendingDate = "";
    shownDate = "";
    void refreshQuakes(quakeSpan);
    void refreshEonet();
    void refreshSats();
    if (enabled.fires) void refreshFires();
    ui.toast("Cleared cached feeds");
  },
  onRetry: (layer) => {
    if (layer === "quakes") void refreshQuakes(quakeSpan);
    if (layer === "fires") void refreshFires();
    if (layer === "events") void refreshEonet();
    if (layer === "satellites") void refreshSats();
    if (layer === "flights") startFlights();
    if (layer === "cameras") void refreshCameras();
    if (layer === "imagery") {
      pendingDate = "";
      shownDate = "";
    }
  },
  onCloseDetails: () => {
    selected = null;
    stopTracking();
  },
  onTrack: () => toggleTracking(),
});

globe.onFollowInterrupt = () => {
  if (!tracking) return;
  tracking = null;
  trackFlyPending = false;
  trail.clear();
  globe.setFollowTrail([], 0);
  ui.setTracking(false);
};

new ResizeObserver(() => globe.resize()).observe(canvas);

canvas.addEventListener("pointerdown", (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", (event) => {
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  if (dx * dx + dy * dy > 16) return;
  selected = globe.pick(event.clientX, event.clientY);
  passCache = null;
  if (tracking) {
    if (selected && (selected.layer !== tracking.layer || selected.id !== tracking.id)) {
      tracking = { ...selected };
      trail.clear();
      globe.setFollowTrail([], 0);
      trackFlyPending = true;
    } else if (!selected) stopTracking();
  }
});
canvas.addEventListener("dblclick", (event) => {
  const ground = globe.groundAt(event.clientX, event.clientY);
  if (ground) globe.flyTo(ground.lat, ground.lon, EARTH_RADIUS_KM * 2.15);
});

window.addEventListener("keydown", (event) => {
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.code === "Space") {
    event.preventDefault();
    clock.playing = !clock.playing;
  } else if (event.key === "h" || event.key === "H") globe.flyHome();
  else if (event.key === "Escape") {
    if (tracking) stopTracking();
    else selected = null;
  } else if (event.key === "t" || event.key === "T") toggleTracking();
});

let pointerStart = { x: 0, y: 0 };

void boot();
requestAnimationFrame(frame);

function flightFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : "OpenSky request failed";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "OpenSky did not respond. The local proxy will try again.";
  }
  return message;
}

async function boot(): Promise<void> {
  const key = readFirmsKey();
  ui.setKey(key);
  if (key) enabled.fires = true;
  globe.setImageryVisible(true);
  void refreshQuakes("day");
  void refreshEonet();
  void refreshSats();
  if (enabled.fires) void refreshFires();
  if (enabled.flights) startFlights();
  const initial = shiftDate(utcDateString(Date.now()), -1);
  pendingDate = initial;
  void loadEarth(initial);
}

function frame(now: number): void {
  clock.tick(now);
  const simTime = clock.simTime;
  globe.setSunTime(simTime);

  const quakeList = enabled.quakes ? visibleQuakes(quakeCache[quakeSpan], simTime, quakeSpan) : [];
  const fireList = enabled.fires ? visibleFires(fires, simTime) : [];
  const eventList = enabled.events ? currentEvents(natural, simTime) : [];
  const sats = enabled.satellites ? filteredCatalog() : [];
  const satList = sats.length ? catalogToEvents(sats, new Date(simTime)) : [];
  const flightList = enabled.flights ? reckonFlights(flights, simTime) : [];

  globe.setMarkers("quakes", enabled.quakes ? quakeMarkers(quakeList) : []);
  globe.setMarkers("fires", enabled.fires ? fireMarkers(fireList) : []);
  globe.setMarkers("events", enabled.events ? naturalMarkers(eventList) : []);
  globe.setMarkers("satellites", satelliteMarkers(satList));
  globe.setMarkers("flights", flightList.map((flight) => flight.marker));
  globe.setMarkers("cameras", enabled.cameras ? cameraMarkers(cameras) : []);
  globe.setBoxVisible(enabled.flights);
  globe.setTracks(enabled.events ? eventTracks(natural, simTime) : []);

  if (enabled.satellites && sats.length && now - lastTrail > 450) {
    globe.setTrails(
      sats.map((sat) => ({
        iss: sat.noradId === 25544,
        points: sampleOrbit(sat.satrec, simTime, 60, 90_000).map((state) => ({
          lat: state.lat,
          lon: state.lon,
          altKm: state.altM / 1000,
        })),
      })),
    );
    lastTrail = now;
    trailsArmed = true;
  } else if (!enabled.satellites && trailsArmed) {
    globe.setTrails([]);
    trailsArmed = false;
  }

  const selectedEvent = resolveSelection(quakeList, fireList, eventList, satList, flightList);
  const marker = markerFor(selectedEvent);
  globe.setSelection(marker);
  lastSelectedEvent = selectedEvent;
  if (tracking) {
    if (selectedEvent && marker) {
      if (trackFlyPending) {
        globe.flyTo(marker.lat, marker.lon, trackDistanceKm(selectedEvent.type));
        trackFlyPending = false;
      }
      globe.followTo(marker.lat, marker.lon);
      trail.push({ lat: marker.lat, lon: marker.lon, altKm: marker.altKm, t: simTime });
      globe.setFollowTrail(trail.points(), trailColor(selectedEvent));
    } else {
      stopTracking();
      ui.toast("Tracking ended — the target left the current view");
    }
  }
  globe.frame(now);
  ui.placeUpland(globe.project(UPLAND.lat, UPLAND.lon, 40));
  ui.setClock({
    time: simTime,
    min: clock.spanStart,
    max: clock.spanEnd,
    rate: clock.rate,
    playing: clock.playing,
    live: clock.live,
  });
  ui.setImageryDate(utcDateString(simTime));
  scheduleImagery(simTime);

  if (now - lastUi > 350) {
    ui.setDetails(selectedEvent ? detailModel(selectedEvent, selectedEvent.type === "satellite" ? passFor(selectedEvent, simTime) : undefined) : null);
    ui.setLab(labModel(selectedEvent));
    publish(quakeList, fireList, eventList, satList, flightList);
    lastUi = now;
  }
  requestAnimationFrame(frame);
}

function resolveSelection(
  quakeList: GeoEvent[],
  fireList: GeoEvent[],
  eventList: GeoEvent[],
  satList: GeoEvent[],
  flightList: { event: GeoEvent }[],
): GeoEvent | null {
  if (!selected) return null;
  const pool =
    selected.layer === "quakes"
      ? quakeList
      : selected.layer === "fires"
        ? fireList
        : selected.layer === "events"
          ? eventList
          : selected.layer === "satellites"
            ? satList
            : selected.layer === "flights"
              ? flightList.map((flight) => flight.event)
              : selected.layer === "cameras"
                ? cameras
                : [];
  return pool.find((event) => event.id === selected?.id) ?? null;
}

function markerFor(event: GeoEvent | null): { lat: number; lon: number; altKm: number; sizeKm: number } | null {
  if (!event) return null;
  const markers =
    event.type === "earthquake"
      ? quakeMarkers([event])
      : event.type === "fire"
        ? fireMarkers([event])
        : event.type === "satellite"
          ? satelliteMarkers([event])
          : event.type === "camera"
            ? cameraMarkers([event])
            : event.type === "flight"
              ? reckonFlights([event], event.time)
                  .map((flight) => flight.marker)
              : naturalMarkers([event]);
  const marker = markers[0];
  if (!marker) return null;
  return { lat: marker.lat, lon: marker.lon, altKm: marker.altKm, sizeKm: marker.sizeKm };
}

function toggleTracking(): void {
  if (tracking) {
    stopTracking();
    return;
  }
  if (!selected || !lastSelectedEvent) return;
  tracking = { ...selected };
  trail.clear();
  trackFlyPending = true;
  ui.setTracking(true);
  ui.toast(`Tracking ${lastSelectedEvent.label || lastSelectedEvent.id}`);
}

function stopTracking(): void {
  if (!tracking) return;
  tracking = null;
  trackFlyPending = false;
  trail.clear();
  globe.stopFollow();
  globe.setFollowTrail([], 0);
  ui.setTracking(false);
}

async function refreshCameras(): Promise<void> {
  camLoading = true;
  try {
    cameras = await loadCaltrans();
    camError = null;
    ui.toast(`Loaded ${cameras.length} traffic cameras`);
  } catch (error) {
    camError = error instanceof Error ? error.message : "Caltrans request failed";
  } finally {
    camLoading = false;
  }
}

function passFor(event: GeoEvent, simTime: number): string {
  const sat = catalog.find((item) => item.id === event.id);
  if (!sat) return "No element set";
  const key = `${sat.id}:${Math.floor(simTime / 60_000)}`;
  if (passCache?.key === key) return passCache.text;
  const pass = nextPass(sat.satrec, simTime, UPLAND);
  const text = pass
    ? `Rises ${formatPt(pass.aos)}\nMax ${pass.maxElDeg.toFixed(0)}° at ${formatPt(pass.maxTime)}\nSets ${formatPt(pass.los)}`
    : "No pass above 5° in the next 24 hours";
  passCache = { key, text };
  return text;
}

function filteredCatalog(): CatalogSat[] {
  return catalog.filter((sat) => (sat.group === "stations" && showStations) || (sat.group === "visual" && showVisual));
}

function scheduleImagery(simTime: number): void {
  if (!enabled.imagery) return;
  const today = utcDateString(Date.now());
  let date = utcDateString(simTime);
  if (date >= today) date = shiftDate(today, -1);
  if (date === pendingDate || date === shownDate) return;
  pendingDate = date;
  window.clearTimeout(imageTimer);
  imageTimer = window.setTimeout(() => {
    void loadEarth(date);
  }, 700);
}

async function loadEarth(date: string): Promise<void> {
  const mine = ++imageToken;
  imageLoading = true;
  imageError = null;
  for (let back = 0; back < 4; back += 1) {
    const candidate = shiftDate(date, -back);
    try {
      const { blob } = await loadImagery(candidate);
      if (mine !== imageToken) return;
      if (blob.size < 1500) throw new Error("GIBS returned an empty image");
      const url = URL.createObjectURL(blob);
      try {
        await globe.setEarthImage(candidate, url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (mine !== imageToken) return;
      shownDate = candidate;
      imageNote = `VIIRS true color · ${candidate}`;
      imageLoading = false;
      imageError = null;
      return;
    } catch (error) {
      imageError = error instanceof Error ? error.message : "GIBS request failed";
    }
  }
  if (mine === imageToken) imageLoading = false;
}

async function refreshQuakes(span: QuakeSpan): Promise<void> {
  quakeLoading = true;
  try {
    quakeCache[span] = await loadUsgs(span);
    quakeError = null;
  } catch (error) {
    quakeError = error instanceof Error ? error.message : "USGS request failed";
  } finally {
    quakeLoading = false;
  }
}

async function refreshFires(): Promise<void> {
  const key = readFirmsKey();
  if (!key) {
    fires = [];
    fireError = null;
    fireLoading = false;
    return;
  }
  fireLoading = true;
  try {
    const all = await loadFirms(key);
    all.sort((a, b) => b.value - a.value);
    fireTruncated = all.length > 6000;
    fires = all.slice(0, 6000);
    fireError = null;
  } catch (error) {
    fireError = error instanceof Error ? error.message : "FIRMS request failed";
  } finally {
    fireLoading = false;
  }
}

async function refreshEonet(): Promise<void> {
  eventLoading = true;
  try {
    natural = await loadEonet();
    eventError = null;
  } catch (error) {
    eventError = error instanceof Error ? error.message : "EONET request failed";
  } finally {
    eventLoading = false;
  }
}

async function refreshSats(): Promise<void> {
  satLoading = true;
  try {
    catalog = await loadCelestrak();
    satNote = "CelesTrak stations and visual groups";
    ui.toast(`Loaded ${catalog.length} satellites`);
  } catch {
    catalog = sampleCatalog();
    satNote = "Live CelesTrak did not respond. Showing a TLE sample from 11 Oct 2026.";
    ui.toast("CelesTrak unreachable. Using a saved TLE sample.");
  } finally {
    satLoading = false;
    trailsArmed = false;
    lastTrail = 0;
  }
}

function startFlights(): void {
  stopFlights();
  const generation = ++flightGeneration;
  const tick = async () => {
    if (generation !== flightGeneration) return;
    if (document.hidden) {
      flightTimer = window.setTimeout(() => void tick(), 5000);
      return;
    }
    try {
      flights = withDeadReckonError(flightHistory, await loadOpensky());
      flightError = null;
      flightTimer = window.setTimeout(() => void tick(), 30_000);
    } catch (error) {
      flightError = flightFailure(error);
      flightTimer = window.setTimeout(() => void tick(), 60_000);
    }
  };
  void tick();
}

function stopFlights(): void {
  flightGeneration += 1;
  window.clearTimeout(flightTimer);
}

function publish(
  quakeList: GeoEvent[],
  fireList: GeoEvent[],
  eventList: GeoEvent[],
  satList: GeoEvent[],
  flightList: { event: GeoEvent }[],
): void {
  const key = readFirmsKey();
  ui.setLayer("quakes", {
    enabled: enabled.quakes,
    loading: quakeLoading,
    error: quakeError,
    count: quakeList.length,
    detail: quakeSpan === "day" ? "USGS, past day" : "USGS, past week",
  });
  ui.setLayer("fires", {
    enabled: enabled.fires,
    loading: fireLoading,
    error: fireError,
    count: fireList.length,
    detail: key
      ? fireTruncated
        ? "Brightest 6,000 VIIRS detections"
        : "VIIRS SNPP, last day"
      : "Add a free MAP_KEY. It stays in this browser.",
    promptKey: !key,
  });
  ui.setLayer("events", {
    enabled: enabled.events,
    loading: eventLoading,
    error: eventError,
    count: eventList.length,
    detail: "Open storms, volcanoes, and wildfires",
  });
  ui.setLayer("satellites", {
    enabled: enabled.satellites,
    loading: satLoading,
    error: null,
    count: satList.length,
    detail: !showStations && !showVisual ? "Stations and visual are both off" : satNote,
  });
  ui.setLayer("flights", {
    enabled: enabled.flights,
    loading: false,
    error: flightError,
    count: flightList.length,
    detail: "Southern California · about every 30 s",
  });
  ui.setLayer("cameras", {
    enabled: enabled.cameras,
    loading: camLoading,
    error: camError,
    count: cameras.length,
    detail: "Caltrans · districts 7, 8, 12",
  });
  ui.setLayer("imagery", {
    enabled: enabled.imagery,
    loading: imageLoading,
    error: imageError,
    count: enabled.imagery && shownDate ? 1 : 0,
    detail: imageNote,
  });
}
