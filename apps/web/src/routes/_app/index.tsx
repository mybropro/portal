import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import { useSessions, useDeleteSession } from "@/hooks/use-opencode";
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
  IconGridPlus,
  EllipsisHorizontalIcon,
  TrashIcon,
  FolderIcon,
} from "@/components/icons/lucide";
import type { Session } from "@opencode-ai/sdk/v2";

export const Route = createFileRoute("/_app/")({
  component: SessionsPage,
});

function baseName(p: string) {
  return p.replace(/\/+$/, "").split("/").pop() || p;
}

function relativeTime(ms?: number) {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

function SessionsPage() {
  const { setPageTitle } = useBreadcrumb();
  const { data, error, isLoading, mutate } = useSessions();
  const deleteSession = useDeleteSession();
  const openPicker = useNewSessionStore((s) => s.openPicker);
  const navigate = useNavigate();

  const sessions: Session[] = [...((data as Session[]) ?? [])].sort(
    (a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0),
  );

  useEffect(() => {
    setPageTitle(null);
    return () => setPageTitle(null);
  }, [setPageTitle]);

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-20">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          {sessions.length > 0 && (
            <p className="text-sm text-muted-fg">
              {sessions.length} session{sessions.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button onPress={openPicker}>
          <IconGridPlus className="size-4" />
          New Session
        </Button>
      </header>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Failed to load sessions: {error.message}
        </p>
      )}

      {!isLoading && !error && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <p className="text-muted-fg">No sessions yet.</p>
          <Button intent="outline" onPress={openPicker}>
            <IconGridPlus className="size-4" />
            Start your first session
          </Button>
        </div>
      )}

      {!isLoading && !error && sessions.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center gap-2 pr-2 transition-colors hover:bg-muted/40"
            >
              <Link
                to="/session/$id"
                params={{ id: session.id }}
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3"
              >
                <span className="truncate font-medium">
                  {session.title || "Untitled session"}
                </span>
                <span className="flex items-center gap-1.5 truncate text-xs text-muted-fg">
                  <FolderIcon className="size-3 shrink-0" />
                  <span className="truncate">{baseName(session.directory)}</span>
                  {session.time?.updated ? (
                    <span className="shrink-0">
                      · {relativeTime(session.time.updated)}
                    </span>
                  ) : null}
                </span>
              </Link>
              <Menu>
                <MenuTrigger
                  aria-label="Session options"
                  className="rounded-md p-2 text-muted-fg hover:bg-muted hover:text-fg"
                >
                  <EllipsisHorizontalIcon className="size-4" />
                </MenuTrigger>
                <MenuContent placement="bottom end">
                  <MenuItem
                    onAction={() =>
                      navigate({
                        to: "/session/$id",
                        params: { id: session.id },
                      })
                    }
                  >
                    Open
                  </MenuItem>
                  <MenuItem
                    intent="danger"
                    onAction={() => handleDelete(session)}
                  >
                    <TrashIcon className="size-4" />
                    Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
