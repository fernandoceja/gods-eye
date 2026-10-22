import { expect } from "vitest";
import { isGeoEvent, type FetchLike, type GeoEvent } from "../src/types.ts";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function textResponse(body: string, status = 200, contentType = "text/plain"): Response {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

export function expectSchema(events: GeoEvent[]): void {
  expect(events.length).toBeGreaterThan(0);
  for (const event of events) expect(isGeoEvent(event)).toBe(true);
}

export function recordingFetch(handler: (url: string) => Response): { fetchImpl: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchLike = async (input) => {
    urls.push(input);
    return handler(input);
  };
  return { fetchImpl, urls };
}
