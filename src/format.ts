export function utcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function shiftDate(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function formatUtc(ms: number): string {
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${day} ${time} UTC`;
}

export function formatPt(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(ms));
}

export function formatWhen(ms: number): string {
  return `${formatUtc(ms)} · ${formatPt(ms)}`;
}

export function km(meters: number, digits = 1): string {
  const value = meters / 1000;
  return `${value.toFixed(digits)} km`;
}

export function speedKms(mps: number): string {
  return `${(mps / 1000).toFixed(2)} km/s`;
}

export function speedKmh(mps: number): string {
  return `${Math.round(mps * 3.6)} km/h`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
