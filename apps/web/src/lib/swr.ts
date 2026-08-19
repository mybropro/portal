import { initCache } from "swr/_internal";
import type { Cache, State } from "swr/_internal";
import type { SessionMessage } from "@opencode-ai/sdk/v2";

/**
 * localStorage-backed SWR cache.
 *
 * Portal is a phone-first UI that gets used on the subway. SWR already keeps
 * the last-known data in memory across a network drop, but a tab reload (mobile
 * browsers recycle tabs aggressively) wipes it. This provider mirrors the cache
 * into localStorage so the session list, statuses and message transcripts
 * survive a reload, and SWR revalidates on top of them when the network is back.
 *
 * It has to BE the SWR cache (via SWRConfig `provider`) — not a layer on top —
 * because use-opencode-events.ts and use-session-messages.ts call SWR's global
 * `mutate`, which is bound to the cache SWR initialized at module load. Both
 * the hooks and those manual mutations have to hit the same cache object or the
 * live event stream lands on a cache entry nothing reads.
 *
 * The cache object is initialized here and exported so SWRConfig (in __root.tsx)
 * and the global mutate below share one instance.
 */

const STORAGE_KEY = "portal-swr-cache-v1";
const MAX_ENTRY_BYTES = 120 * 1024;
const MAX_TOTAL_BYTES = 2.5 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 800;

const isBrowser = typeof window !== "undefined";

/** In-progress assistant turns shouldn't be snapshotted as if they completed. */
function hasStreamingAssistant(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.some(
    (message) =>
      typeof message === "object" &&
      message !== null &&
      (message as Partial<SessionMessage>).type === "assistant" &&
      (
        (message as Partial<SessionMessage>).time as
          | { completed?: number }
          | undefined
      )?.completed === undefined,
  );
}

function createPersistentCache(): Cache {
  const map = new Map<string, State & { _k?: unknown }>();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === "object" && "data" in value) {
          map.set(key, value as State);
        }
      }
    }
  } catch {
    // Corrupt or quota-blocked storage; start empty and let fetches repopulate.
  }

  let writeTimer: ReturnType<typeof setTimeout> | null = null;

  const persist = () => {
    writeTimer = null;
    if (!isBrowser) return;

    const out: Record<string, unknown> = {};
    let total = 0;
    for (const [key, value] of map) {
      if (value.data === undefined) continue;
      if (
        key.endsWith("/messages") &&
        hasStreamingAssistant((value as State).data)
      ) {
        continue;
      }
      // Persist only the data and the original key (_k, which key-filter
      // mutations read back); dropping error so a reload while offline shows
      // the cached transcript without a stale failure banner.
      const entry = { _k: value._k, data: value.data };
      let size: number;
      try {
        size = JSON.stringify(entry).length;
      } catch {
        continue;
      }
      if (size > MAX_ENTRY_BYTES) continue;
      if (total + size > MAX_TOTAL_BYTES) continue;
      out[key] = entry;
      total += size;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch {
      // Quota exceeded (unlikely after the size caps) or privacy mode. Drop the
      // biggest entries and try once more so the small-but-important keys
      // (session list, statuses) still survive.
      const entries = Object.entries(out).sort((a, b) => {
        const sizeA = JSON.stringify(a[1]).length;
        const sizeB = JSON.stringify(b[1]).length;
        return sizeB - sizeA;
      });
      const trimmed: Record<string, unknown> = {};
      let trimmedTotal = 0;
      for (const [key, value] of entries) {
        const size = JSON.stringify(value).length;
        if (trimmedTotal + size > MAX_TOTAL_BYTES / 4) continue;
        trimmed[key] = value;
        trimmedTotal += size;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // Give up; the in-memory cache still works for this session.
      }
    }
  };

  const schedulePersist = () => {
    if (writeTimer !== null) return;
    writeTimer = setTimeout(persist, PERSIST_DEBOUNCE_MS);
  };

  return {
    keys: () => map.keys(),
    get: (key) => map.get(key) as (State & { _k?: unknown }) | undefined,
    set: (key, value) => {
      map.set(key, value as State & { _k?: unknown });
      schedulePersist();
    },
    delete: (key) => {
      map.delete(key);
      schedulePersist();
    },
  };
}

export const swrCache = createPersistentCache();

// Bind SWR's global mutate (the one use-opencode-events.ts and
// use-session-messages.ts call) to the persistent cache. swrCache is a brand
// new object, so initCache always returns the full tuple (never undefined).
const swrState = initCache(swrCache);
export const swrMutate = (swrState ? swrState[1] : undefined)!;
