/** One schema for every point layer. `label` and `meta` are display-only. */
export interface GeoEvent {
  id: string;
  type: string;
  time: number;
  lat: number;
  lon: number;
  alt: number;
  value: number;
  source: string;
  label?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type QuakeSpan = "day" | "week";

export type LayerName = "quakes" | "fires" | "events" | "satellites" | "flights" | "imagery";

export interface LayerView {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  count: number;
  detail: string;
  promptKey?: boolean;
}

export interface DetailModel {
  kicker: string;
  title: string;
  source: string;
  rows: { label: string; value: string }[];
  note?: string;
}

export interface LabModel {
  heading: string;
  rows: { label: string; value: string }[];
  formula: string;
  note: string;
}

export interface ClockView {
  time: number;
  min: number;
  max: number;
  rate: number;
  playing: boolean;
  live: boolean;
}

export const SCHEMA_KEYS = ["id", "type", "time", "lat", "lon", "alt", "value", "source"] as const;

export function isGeoEvent(value: unknown): value is GeoEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.type === "string" &&
    typeof row.time === "number" &&
    Number.isFinite(row.time) &&
    typeof row.lat === "number" &&
    Number.isFinite(row.lat) &&
    typeof row.lon === "number" &&
    Number.isFinite(row.lon) &&
    typeof row.alt === "number" &&
    Number.isFinite(row.alt) &&
    typeof row.value === "number" &&
    Number.isFinite(row.value) &&
    typeof row.source === "string"
  );
}
