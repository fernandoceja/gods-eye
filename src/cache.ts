interface Entry {
  exp: number;
  value: string;
}

const memory = new Map<string, Entry>();
const PREFIX = "godseye:cache:";

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export async function cachedText(
  key: string,
  ttlMs: number,
  loader: () => Promise<string>,
): Promise<string> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.exp > now) return hit.value;

  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as Entry;
        if (parsed && typeof parsed.value === "string" && parsed.exp > now) {
          memory.set(key, parsed);
          return parsed.value;
        }
      }
    } catch {
      // Ignore a corrupt entry and refetch.
    }
  }

  const value = await loader();
  const entry = { exp: now + ttlMs, value };
  memory.set(key, entry);
  if (store) {
    try {
      store.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
      // Quota is best-effort. Memory still holds this session.
    }
  }
  return value;
}

export function clearCache(): void {
  memory.clear();
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
}
