import { useMemo } from "react";
import { SWRConfig } from "swr";
import { swrCache } from "@/lib/swr";

/**
 * Wires the whole app to the persistent SWR cache (lib/swr.ts). The cache is
 * created once at module load and reused here; see that module for why it has
 * to be the real cache rather than a wrapper.
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  const config = useMemo(() => ({ provider: () => swrCache }), []);
  return <SWRConfig value={config}>{children}</SWRConfig>;
}
