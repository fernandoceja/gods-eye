const FIRMS_KEY = "godseye:firmsMapKey";

export function readFirmsKey(): string {
  try {
    return localStorage.getItem(FIRMS_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeFirmsKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (!trimmed) localStorage.removeItem(FIRMS_KEY);
    else localStorage.setItem(FIRMS_KEY, trimmed);
  } catch {
    // Storage can be blocked; the in-memory session still holds the key.
  }
}
