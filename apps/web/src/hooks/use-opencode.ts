import useSWR from "swr";
import { useInstanceStore } from "@/stores/instance-store";
import { useNewSessionStore } from "@/stores/new-session-store";
import { backendBasePath } from "@/lib/backend-url";
import type { SessionStatus } from "@opencode-ai/sdk/v2";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};

function useBackend() {
  const instance = useInstanceStore((s) => s.instance);
  return instance
    ? {
        port: instance.port,
        basePath: backendBasePath(instance.provider, instance.port),
      }
    : null;
}

export function useInstances() {
  return useSWR("/api/instances", fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
  });
}

export function useSessions() {
  const backend = useBackend();
  const recents = useNewSessionStore((s) => s.recents);
  const dirs = recents.length
    ? `?dirs=${recents.map(encodeURIComponent).join(",")}`
    : "";

  return useSWR(
    backend ? `${backend.basePath}/sessions${dirs}` : null,
    fetcher,
  );
}

export function useSession(id: string | null) {
  const backend = useBackend();

  return useSWR(
    backend && id ? `${backend.basePath}/session/${id}` : null,
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

  return useSWR<Record<string, SessionStatus>>(
    backend ? `${backend.basePath}/session/status` : null,
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

  return useSWR(backend ? `${backend.basePath}/config` : null, fetcher);
}

export function useProviders() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/providers` : null, fetcher);
}

export function useAgents() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/agents` : null, fetcher);
}

export function useHealth() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/health` : null, fetcher);
}

export function useCurrentProject() {
  const backend = useBackend();

  return useSWR(
    backend ? `${backend.basePath}/project/current` : null,
    fetcher,
  );
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

export function usePermissions() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/permissions` : null, fetcher);
}

export function useReplyPermission() {
  const backend = useBackend();

  return async (
    requestId: string,
    reply: "once" | "always" | "reject",
    message?: string,
  ) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(
      `${backend.basePath}/permission/${requestId}/reply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply, message }),
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to reply to permission: ${res.status}`);
    }

    return res.json();
  };
}

export function useQuestions() {
  const backend = useBackend();

  return useSWR(backend ? `${backend.basePath}/questions` : null, fetcher);
}

export function useReplyQuestion() {
  const backend = useBackend();

  return async (requestId: string, answers: string[][]) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(`${backend.basePath}/question/${requestId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });

    if (!res.ok) {
      throw new Error(`Failed to reply to question: ${res.status}`);
    }

    return res.json();
  };
}

export function useRejectQuestion() {
  const backend = useBackend();

  return async (requestId: string) => {
    if (!backend) throw new Error("No instance selected");

    const res = await fetch(
      `${backend.basePath}/question/${requestId}/reject`,
      {
        method: "POST",
      },
    );

    if (!res.ok) {
      throw new Error(`Failed to reject question: ${res.status}`);
    }

    return res.json();
  };
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
