import { create } from "zustand";

const GROUP_BY_DIR_KEY = "portal-group-by-directory";

function readGroupByDirectory(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GROUP_BY_DIR_KEY) === "1";
}

interface PreferencesState {
  groupByDirectory: boolean;
  setGroupByDirectory: (value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()((set) => ({
  groupByDirectory: readGroupByDirectory(),
  setGroupByDirectory: (value) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GROUP_BY_DIR_KEY, value ? "1" : "0");
      } catch {
        // ignore quota / privacy-mode failures
      }
    }
    set({ groupByDirectory: value });
  },
}));
