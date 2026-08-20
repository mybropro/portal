import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import {
  useSessions,
  useDeleteSession,
  useArchiveSessions,
  useSessionStatuses,
} from "@/hooks/use-opencode";
import { useNewSessionStore } from "@/stores/new-session-store";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import {
  ArchiveIcon,
  PlusIcon,
  EllipsisHorizontalIcon,
  TrashIcon,
  FolderIcon,
  ChatBubbleLeftIcon,
} from "@/components/icons/lucide";
import type { Session, SessionStatus } from "@opencode-ai/sdk/v2";

export const Route = createFileRoute("/_app/")({
  component: SessionsPage,
});

function baseName(p: string) {
  return p.replace(/\/+$/, "").split("/").pop() || p;
}

const DAY = 86_400_000;
const GROUP_ORDER = ["Today", "Yesterday", "Last week", "This month", "Older"];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupOf(ms: number) {
  const t = startOfToday();
  if (ms >= t) return "Today";
  if (ms >= t - DAY) return "Yesterday";
  if (ms >= t - 7 * DAY) return "Last week";
  if (ms >= t - 30 * DAY) return "This month";
  return "Older";
}

function timeLabel(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (ms >= startOfToday()) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isWorking(status?: SessionStatus) {
  return status?.type === "busy" || status?.type === "retry";
}

function SessionCard({
  session,
  working,
  onDelete,
  onOpen,
}: {
  session: Session;
  working: boolean;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="group flex items-stretch gap-0.5 rounded-xl bg-muted/30 transition-colors hover:bg-muted/50">
      <Link
        to="/session/$id"
        params={{ id: session.id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-3.5 pr-1"
      >
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-fg">
          <ChatBubbleLeftIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {session.title || "Untitled session"}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-fg">
            {working ? (
              <>
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
                <span>Working…</span>
              </>
            ) : (
              <>
                <FolderIcon className="size-3 shrink-0" />
                <span className="truncate">{baseName(session.directory)}</span>
              </>
            )}
          </div>
        </div>
        <span className="shrink-0 self-start pt-0.5 text-xs text-muted-fg">
          {timeLabel(session.time?.updated ?? session.time?.created ?? 0)}
        </span>
      </Link>
      <Menu>
        <MenuTrigger
          aria-label="Session options"
          className="rounded-md px-1.5 text-muted-fg opacity-60 transition-colors hover:bg-muted hover:text-fg hover:opacity-100"
        >
          <EllipsisHorizontalIcon className="size-4" />
        </MenuTrigger>
        <MenuContent placement="bottom end">
          <MenuItem onAction={onOpen}>Open</MenuItem>
          <MenuItem intent="danger" onAction={onDelete}>
            <TrashIcon className="size-4" />
            Delete
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

function SessionsPage() {
  const { setPageTitle } = useBreadcrumb();
  const { data, error, isLoading, mutate } = useSessions();
  const { data: statuses } = useSessionStatuses();
  const deleteSession = useDeleteSession();
  const archiveSessions = useArchiveSessions();
  const openPicker = useNewSessionStore((s) => s.openPicker);
  const navigate = useNavigate();
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    setPageTitle(null);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const sessions: Session[] = [...((data as Session[]) ?? [])].sort(
    (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0),
  );

  // Group by recency, preserving order.
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const g = groupOf(s.time?.updated ?? s.time?.created ?? 0);
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(s);
  }

  async function handleDelete(session: Session) {
    try {
      await deleteSession(session.id);
      await mutate();
      toast.success("Session deleted");
    } catch (err) {
      console.error("Failed to delete session:", err);
      toast.error("Failed to delete session");
    }
  }

  const idleSessions = sessions.filter(
    (session) => !isWorking(statuses?.[session.id]),
  );

  async function handleArchiveAll() {
    if (idleSessions.length === 0 || archiving) return;
    setArchiving(true);
    try {
      const result = await archiveSessions(
        idleSessions.map((session) => ({
          id: session.id,
          directory: session.directory,
        })),
      );
      await mutate(
        (current: Session[] | undefined) =>
          (current ?? []).filter(
            (session) => !result.archived.includes(session.id),
          ),
        { revalidate: true },
      );
      if (result.failed.length) {
        toast.error(
          `Archived ${result.archived.length}, ${result.failed.length} failed`,
        );
      } else {
        toast.success(
          result.archived.length === 1
            ? "Archived 1 session"
            : `Archived ${result.archived.length} sessions`,
        );
      }
    } catch (err) {
      console.error("Failed to archive sessions:", err);
      toast.error("Failed to archive sessions");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Failed to load sessions: {error.message}
        </p>
      )}

      {!isLoading && !error && sessions.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <p className="text-muted-fg">No sessions yet.</p>
          <Button intent="outline" onPress={openPicker}>
            <PlusIcon className="size-4" />
            Start your first session
          </Button>
        </div>
      )}

      {!isLoading && !error && idleSessions.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button
            intent="outline"
            size="sm"
            isDisabled={archiving}
            onPress={handleArchiveAll}
          >
            <ArchiveIcon className="size-4" />
            {archiving
              ? "Archiving…"
              : `Archive all${idleSessions.length !== sessions.length ? ` (${idleSessions.length})` : ""}`}
          </Button>
        </div>
      )}

      {!isLoading &&
        !error &&
        GROUP_ORDER.filter((g) => groups.has(g)).map((g) => (
          <section key={g} className="mb-6">
            <h2 className="mb-2 px-1 text-sm font-medium text-muted-fg">{g}</h2>
            <div className="space-y-2">
              {groups.get(g)!.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  working={isWorking(statuses?.[session.id])}
                  onDelete={() => handleDelete(session)}
                  onOpen={() =>
                    navigate({
                      to: "/session/$id",
                      params: { id: session.id },
                    })
                  }
                />
              ))}
            </div>
          </section>
        ))}

      {/* Floating new-session button */}
      <Button
        isCircle
        onPress={openPicker}
        aria-label="New session"
        className="fixed bottom-6 right-6 z-20 size-14 shadow-lg shadow-black/20"
      >
        <PlusIcon className="size-6" />
      </Button>
    </div>
  );
}
