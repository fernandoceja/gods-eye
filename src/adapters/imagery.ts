import type { FetchLike, GeoEvent } from "../types.ts";

export function gibsTrueColorUrl(date: string): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    STYLES: "",
    FORMAT: "image/jpeg",
    TRANSPARENT: "FALSE",
    WIDTH: "2048",
    HEIGHT: "1024",
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    TIME: date,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params.toString()}`;
}

export function imageryEvent(date: string): GeoEvent {
  return {
    id: `gibs:${date}`,
    type: "imagery",
    time: Date.parse(`${date}T12:00:00Z`),
    lat: 0,
    lon: 0,
    alt: 0,
    value: 0,
    source: "gibs",
    label: "VIIRS SNPP corrected reflectance true color",
    meta: {
      date,
      layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    },
  };
}

export async function loadImagery(date: string, fetchImpl: FetchLike = fetch): Promise<{ event: GeoEvent; blob: Blob }> {
  const res = await fetchImpl(gibsTrueColorUrl(date));
  if (!res.ok) throw new Error(`GIBS responded ${res.status}`);
  const blob = await res.blob();
  return { event: imageryEvent(date), blob };
}
