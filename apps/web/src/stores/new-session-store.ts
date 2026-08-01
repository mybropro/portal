import { create } from "zustand";

const LAST_DIR_KEY = "portal-new-session-last-dir";
const RECENTS_KEY = "portal-new-session-recents";
const MAX_RECENTS = 6;

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readLastDir(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_DIR_KEY);
}

/**
 * `?dirs=` suffix for the endpoints that have to look beyond the backend's own
 * working directory (/sessions, /session/status). Shared so the SWR keys the
 * hooks read and the keys the event stream mutates cannot drift apart.
 */
export function dirsQuery(recents: string[]) {
  return recents.length
    ? `?dirs=${recents.map(encodeURIComponent).join(",")}`
    : "";
}

interface NewSessionState {
  open: boolean;
  lastDir: string | null;
  recents: string[];
  openPicker: () => void;
  closePicker: () => void;
  rememberDir: (dir: string) => void;
  clearRecents: () => void;
}

export const useNewSessionStore = create<NewSessionState>()((set, get) => ({
  open: false,
  lastDir: readLastDir(),
  recents: readRecents(),
  openPicker: () => set({ open: true }),
  closePicker: () => set({ open: false }),
  rememberDir: (dir) => {
    const recents = [dir, ...get().recents.filter((d) => d !== dir)].slice(
      0,
      MAX_RECENTS,
    );
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LAST_DIR_KEY, dir);
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
      } catch {
        // ignore quota / privacy-mode failures
      }
    }
    set({ lastDir: dir, recents });
  },
  clearRecents: () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(RECENTS_KEY);
        window.localStorage.removeItem(LAST_DIR_KEY);
      } catch {
        // ignore
      }
    }
    set({ recents: [], lastDir: null });
  },
}));
