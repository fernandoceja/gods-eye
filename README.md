# God's Eye

A personal 3D Earth for Fernando Ceja in Upland, California. Public, aggregate data only: earthquakes, active fires, storms and volcanoes, a daily NASA true-color base map, satellite orbits, and flights over Southern California. One clock drives every layer.

It is inspired by Matt Wolfe's open-source God's Eye View demo, and it is a smaller instrument: no CCTV, no webcams, and no tracking of individual people.

## Why Three.js

The stack is Vite, TypeScript, and Three.js on purpose.

- CesiumJS is a full geospatial runtime. It is excellent at terrain and GIS, and it is the wrong weight for a fast personal view with a custom clock, instanced aircraft, and a kinematics readout.
- globe.gl wraps Three.js in its own layer model. Orbit trails, `InstancedMesh` flights, and one simulation clock are easier to own directly than to fight that abstraction.
- Three.js keeps the renderer small and leaves the physics visible: SGP4 propagation, circular-orbit speed, and dead reckoning all sit in plain TypeScript next to the drawing code.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5827](http://127.0.0.1:5827).

```bash
npm test
npm run build
```

No accounts, tokens, or paid services are required to start. Earthquakes, natural events, imagery, and (when the network allows) satellites load on their own. Fires wait for a free key. Flights use the OpenSky anonymous API.

## Home

The home button flies the camera to Upland, California: **34.0975° N, 117.6484° W**. Satellite passes are computed for that point, above a 5° elevation mask. Double-click the globe to fly somewhere else. Press `H` for home, space to play or pause, and Escape to close the details card.

## Layers

Each feed is normalized to one schema: `id`, `type`, `time`, `lat`, `lon`, `alt`, `value`, `source`. Optional `label` and `meta` fields are only for the details card.

| Layer | Source | What `value` means |
| --- | --- | --- |
| Earthquakes | [USGS GeoJSON](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php), past day and past week | Magnitude. `alt` is depth, negative meters. Marker size follows magnitude. |
| Active fires | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) VIIRS SNPP NRT, world, 1 day | Fire radiative power (MW). |
| Natural events | [NASA EONET](https://eonet.gsfc.nasa.gov/docs/v3) open storms, volcanoes, and wildfires | Reported magnitude when EONET has one. Tracks replay along the clock. |
| True color | [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) VIIRS SNPP Corrected Reflectance True Color | The base map for that UTC day. This is the NASA cameras layer. |
| Satellites | [CelesTrak](https://celestrak.org/NORAD/elements/) GP elements, `stations` and `visual` groups | Propagated speed (m/s) from satellite.js. Altitude is meters. |
| Flights | [OpenSky Network](https://openskynetwork.github.io/opensky-api/) anonymous states | Ground speed (m/s). Heading is in `meta`. |

The time slider covers the past week through a few hours ahead. Playback runs from 1× to 1000×. Satellites are propagated to the clock. Quakes, fires, and events appear when the clock reaches them. Flights are a live sample: they dead-reckon for three minutes of sim time, then drop off until the next poll. High speeds outrun that sample; use Live to watch them move.

Imagery follows the clock's UTC date. Today usually has no finished VIIRS composite yet, so the globe asks for yesterday and steps back if that day is missing. The date picker seeks the clock.

### Satellites

CelesTrak TLEs are propagated with satellite.js (SGP4). Each satellite draws a 90-minute trail. The ISS (NORAD 25544) is drawn larger and in gold. Click one for altitude, speed, orbital period, and the next pass over Upland.

If CelesTrak cannot be reached, the app shows a bundled sample from 11 Oct 2026 (ISS and Tiangong's Tianhe module) and says so. Passes and speeds then belong to that sample, not to today's elements.

### Flights

OpenSky is polled about every 30 seconds, and more slowly after a rate limit, over a box around Southern California (`32.4°–35.6° N`, `120.8°–114.4° W`). Aircraft are an `InstancedMesh`. Between polls the position is dead-reckoned with constant ground speed, heading, and vertical rate. Aircraft on the ground are left out.

## Lab

Open Lab and select a satellite or a flight.

- Satellites show circular-orbit speed `v = √(GM / r)` beside the SGP4 speed. `GM` is `3.986004418×10¹⁴ m³/s²`. `r` is the WGS-84 equatorial radius plus altitude. A small gap is eccentricity, oblateness, and drag.
- Flights show the dead-reckoning error: the distance between the prediction from the previous OpenSky fix and the next fix. It stays blank until a second sample arrives.

## FIRMS MAP_KEY

Active fires need a free NASA FIRMS key. Nothing in this repo contains one.

1. Open [FIRMS area API](https://firms.modaps.eosdis.nasa.gov/api/area/) and request a MAP_KEY. NASA emails it.
2. In the app, open Settings and paste the key.
3. It is stored in `localStorage` under `godseye:firmsMapKey` and sent only to FIRMS.
4. Turn on Active fires. Without a key, the layer explains how to add one.

Clear cached feeds in Settings if you want the next visit to refetch. JSON feeds are cached in memory and, when it fits, in `localStorage`, with a TTL of a few minutes (USGS, EONET) up to two hours (TLEs) or 30 minutes (FIRMS). Imagery is cached in memory for the session.

## Local proxy

The browser calls USGS, EONET, and GIBS directly. Those servers send `Access-Control-Allow-Origin: *`.

Two feeds do not:

- **OpenSky** is requested through `/proxy/opensky`. The anonymous API is not usable from a browser page.
- **FIRMS** is requested through `/proxy/firms`. Error responses omit CORS headers, which would hide a bad key from the page.

CelesTrak is requested directly. If that fails (CORS or a network block), the app retries `/proxy/celestrak`. The proxy is the Vite dev server in `vite.config.ts`. It exists only so `npm run dev` can reach those hosts. It is not a hosted service.

## Scope

Public infrastructure and aggregate data only. There are no CCTV or webcam feeds, and no attempt to identify or follow a person. Flight callsigns and countries are whatever OpenSky already publishes for aircraft.
