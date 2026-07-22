import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SheetContent } from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import {
  ArrowUpCircleIcon,
  ChevronRightIcon,
  FolderIcon,
  HomeIcon,
  IconGridPlus,
} from "@/components/icons/lucide";
import { useCreateSession, useSessions, useListDirs } from "@/hooks/use-opencode";
import { useNewSessionStore } from "@/stores/new-session-store";
import { toast } from "@/components/ui/toast";

function basename(p: string) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

/**
 * Mounted once inside the app layout. Opened via useNewSessionStore.openPicker()
 * from any "New Session" affordance. Lets the user browse the filesystem and
 * pick a working directory; the chosen dir is bound to the new session so
 * tools run there (instead of the backend's cwd).
 */
export default function DirectoryPicker() {
  const open = useNewSessionStore((s) => s.open);
  const closePicker = useNewSessionStore((s) => s.closePicker);
  const lastDir = useNewSessionStore((s) => s.lastDir);
  const recents = useNewSessionStore((s) => s.recents);
  const rememberDir = useNewSessionStore((s) => s.rememberDir);

  const [browse, setBrowse] = useState<string>(lastDir ?? "");
  const [creating, setCreating] = useState(false);

  const navigate = useNavigate();
  const createSession = useCreateSession();
  const { mutate } = useSessions();
  const { setOpen, setIsOpenOnMobile, isMobile } = useSidebar();
  const { data, isLoading } = useListDirs(open ? browse : null);

  // Reset to the last-used directory each time the sheet opens.
  useEffect(() => {
    if (open) setBrowse(lastDir ?? "");
  }, [open, lastDir]);

  const currentPath = data?.path ?? browse;

  async function startSession(directory: string) {
    if (creating) return;
    setCreating(true);
    try {
      const session = await createSession({ directory });
      rememberDir(directory);
      await mutate();
      closePicker();
      // Collapse the sidebar so the new session gets full focus.
      if (isMobile) setIsOpenOnMobile(false);
      else setOpen(false);
      navigate({ to: "/session/$id", params: { id: session.id } });
    } catch (err) {
      console.error("Failed to create session:", err);
      toast.error("Failed to create session");
    } finally {
      setCreating(false);
    }
  }

  return (
    <SheetContent
      isOpen={open}
      onOpenChange={(v) => (v ? null : closePicker())}
      side="bottom"
      isBlurred
      className="max-h-[85dvh]"
      aria-label="Choose a directory for the new session"
    >
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <h2 className="text-lg font-semibold">New session</h2>
          <p className="text-sm text-muted-fg">
            Pick the working directory this session runs in.
          </p>
        </div>

        {recents.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              Recent
            </span>
            <div className="flex flex-wrap gap-1.5">
              {recents.map((dir) => (
                <Button
                  key={dir}
                  size="sm"
                  intent="outline"
                  isDisabled={creating}
                  onPress={() => startSession(dir)}
                >
                  <FolderIcon className="size-3.5" />
                  {basename(dir)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Current location + up/home nav */}
        <div className="flex items-center gap-2">
          <Button
            size="sq-sm"
            intent="outline"
            aria-label="Home"
            isDisabled={creating}
            onPress={() => setBrowse(data?.home ?? "")}
          >
            <HomeIcon className="size-4" />
          </Button>
          <Button
            size="sq-sm"
            intent="outline"
            aria-label="Up one level"
            isDisabled={creating || !data?.parent}
            onPress={() => data?.parent && setBrowse(data.parent)}
          >
            <ArrowUpCircleIcon className="size-4" />
          </Button>
          <span className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 text-sm font-mono">
            {currentPath || "~"}
          </span>
        </div>

        {/* Subdirectory list */}
        <div className="min-h-40 max-h-[40dvh] overflow-auto rounded-lg border">
          {isLoading && !data ? (
            <div className="flex items-center justify-center py-10">
              <Loader />
            </div>
          ) : data?.error ? (
            <div className="p-4 text-sm text-danger">{data.error}</div>
          ) : data && data.dirs.length === 0 ? (
            <div className="p-4 text-sm text-muted-fg">No subfolders here.</div>
          ) : (
            <ul className="divide-y">
              {data?.dirs.map((d) => (
                <li key={d.path}>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => setBrowse(d.path)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <FolderIcon className="size-4 shrink-0 text-muted-fg" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-fg" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="flex-1"
            isDisabled={creating || !currentPath}
            onPress={() => startSession(currentPath)}
          >
            <IconGridPlus className="size-4" />
            {creating ? "Starting…" : `Start here: ${basename(currentPath) || "~"}`}
          </Button>
          <Button intent="plain" isDisabled={creating} onPress={closePicker}>
            Cancel
          </Button>
        </div>
      </div>
    </SheetContent>
  );
}
