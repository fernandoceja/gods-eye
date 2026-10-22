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

const WELCOME_KEY = "godseye:welcomeDismissed";

export function readWelcomeDismissed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWelcomeDismissed(): void {
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // Storage can be blocked; the card simply shows again next visit.
  }
}
