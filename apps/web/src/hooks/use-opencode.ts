import useSWR from "swr";
import { useCallback, useEffect, useState } from "react";
import { dirsQuery, useNewSessionStore } from "@/stores/new-session-store";
import { OPENCODE_BASE_PATH, OPENCODE_PORT } from "@/lib/backend-url";
import type { SessionStatus } from "@opencode-ai/sdk/v2";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};

function useBackend() {
  return { port: OPENCODE_PORT, basePath: OPENCODE_BASE_PATH };
}

export function useSessions() {
  const backend = useBackend();
  const dirs = dirsQuery(useNewSessionStore((s) => s.recents));

  return useSWR(
    backend ? `${backend.basePath}/sessions${dirs}` : null,
    fetcher,
  );
}

export function useSessionMessages(id: string | null) {
  const backend = useBackend();

  return useSWR(
    backend && id ? `${backend.basePath}/session/${id}/messages` : null,
    fetcher,
  );
}

export function useSessionStatuses() {
  const backend = useBackend();
  const dirs = dirsQuery(useNewSessionStore((s) => s.recents));

  return useSWR<Record<string, SessionStatus>>(
    backend ? `${backend.basePath}/session/status${dirs}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: (statuses) =>
        Object.values(statuses ?? {}).some((status) => status.type !== "idle")
          ? 1000
          : 0,
    },
  );
}

export function useConfig() {
  const backend = useBackend();

  return useSWR(`${backend.basePath}/config`, fetcher, {
    revalidateOnFocus: false,
  });
}

export function useProviders() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/providers` : null, fetcher);
}

export function useAgents() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/agents` : null, fetcher);
}

export function useHostname() {
  return useSWR("/api/system/hostname", fetcher);
}

export function useCreateSession() {
  const backend = useBackend();

  return async (opts?: { title?: string; directory?: string }) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: opts?.title,
        directory: opts?.directory,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.status}`);
    }

    return res.json();
  };
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface ListDirsResult {
  path: string;
  parent: string | null;
  home: string;
  dirs: DirEntry[];
  error?: string;
}

export function useListDirs(directory: string | null) {
  return useSWR<ListDirsResult>(
    directory === null
      ? null
      : `/api/fs/list-dirs?directory=${encodeURIComponent(directory)}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
}

export function useDeleteSession() {
  const backend = useBackend();

  return async (sessionId: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/${sessionId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error(`Failed to delete session: ${res.status}`);
    }

    return res.json();
  };
}

export function useArchiveSessions() {
  const backend = useBackend();

  return async (sessions: { id: string; directory?: string }[]) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/sessions/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions }),
    });

    if (!res.ok) {
      throw new Error(`Failed to archive sessions: ${res.status}`);
    }

    return res.json() as Promise<{ archived: string[]; failed: string[] }>;
  };
}

/**
 * Whether the browser believes it has network connectivity. localStorage-backed
 * SWR caching makes the UI usable while offline, so a thin offline banner
 * (rather than per-request error states) is the right signal to surface.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [backendReachable, setBackendReachable] = useState(true);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // navigator.onLine is about the device's link, not whether THIS server is
  // reachable. Probe the backend periodically while we think we're online.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const probe = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`${OPENCODE_BASE_PATH}/health`, {
          method: "GET",
          cache: "no-store",
        });
        if (!cancelled) setBackendReachable(res.ok);
      } catch {
        if (!cancelled) setBackendReachable(false);
      }
    };

    if (online) {
      probe();
      timer = setInterval(probe, 15000);
    } else {
      setBackendReachable(false);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [online]);

  return { online: online && backendReachable, rawOnline: online };
}

export function usePermissions() {
  const backend = useBackend();
  const dirs = dirsQuery(useNewSessionStore((s) => s.recents));

  return useSWR(backend ? `${backend.basePath}/permissions${dirs}` : null, fetcher);
}

export function useQuestions() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/questions` : null, fetcher);
}

export function useAbortSession() {
  const backend = useBackend();

  return async (sessionId: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/session/${sessionId}/abort`, {
      method: "POST",
    });

    if (!res.ok) {
      throw new Error(`Failed to abort session: ${res.status}`);
    }

    return res.json();
  };
}
