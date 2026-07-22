import { create } from "zustand";
import type { BackendProvider } from "@/lib/backend-url";

export interface Instance {
  id: string;
  name: string;
  port: number;
  provider?: BackendProvider;
}

// Portal connects to a single fixed opencode server; there is no instance
// concept in the UI. Sessions live in different directories, not different
// backends. If the opencode port ever changes, change it here.
export const FIXED_INSTANCE: Instance = {
  id: "opencode",
  name: "opencode",
  port: 4000,
  provider: "opencode",
};

interface InstanceState {
  instance: Instance | null;
  setInstance: (instance: Instance | null) => void;
  clearInstance: () => void;
}

export const useInstanceStore = create<InstanceState>()((set) => ({
  instance: FIXED_INSTANCE,
  setInstance: (instance) => set({ instance }),
  clearInstance: () => set({ instance: FIXED_INSTANCE }),
}));
