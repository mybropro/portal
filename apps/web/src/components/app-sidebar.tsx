import {
  ChevronUpDownIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  FolderIcon,
  ListIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons/lucide";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Link as UILink } from "@/components/ui/link";
import { toast } from "@/components/ui/toast";
import {
  Menu,
  MenuContent,
  MenuHeader,
  MenuItem,
  MenuSection,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  Sidebar,
  SidebarContent,
  SidebarDisclosure,
  SidebarDisclosureGroup,
  SidebarDisclosurePanel,
  SidebarDisclosureTrigger,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarLink,
  SidebarMenuTrigger,
  SidebarRail,
  SidebarSection,
  SidebarSectionGroup,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  useSessions,
  useDeleteSession,
  useHostname,
} from "@/hooks/use-opencode";
import { useNewSessionStore } from "@/stores/new-session-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { useLocation, useNavigate, useMatch } from "@tanstack/react-router";
import type { Key } from "react-aria-components";
import type { Session } from "@opencode-ai/sdk/v2";

function formatDirectoryPath(directory: string): string {
  const normalized = directory.replace(/\\+/g, "/").replace(/\/+$/g, "");
  const homePath =
    normalized.match(/^\/Users\/[^/]+\/(.+)$/) ??
    normalized.match(/^\/home\/[^/]+\/(.+)$/) ??
    normalized.match(/^[A-Za-z]:\/Users\/[^/]+\/(.+)$/);

  if (homePath?.[1]) return homePath[1];
  if (normalized.startsWith("~/")) return normalized.slice(2);
  if (normalized.startsWith("/")) return normalized.slice(1) || "/";

  return normalized || directory;
}

function truncateTitle(title: string, maxLength = 40): string {
  if (title.length <= maxLength) return title;
  const halfLength = Math.floor((maxLength - 3) / 2);
  return `${title.slice(0, halfLength)}...${title.slice(-halfLength)}`;
}

function sessionDirectory(session: Session): string {
  const dir = session.directory || "";
  return formatDirectoryPath(dir) || dir || "Default";
}

/**
 * Group sessions by their working directory, preserving newest-first order
 * within each group. Directory groups themselves sort by most recently used.
 */
function groupSessionsByDirectory(
  sessions: Session[],
): { directory: string; sessions: Session[] }[] {
  const groups = new Map<string, Session[]>();
  for (const session of sessions) {
    const key = session.directory || "";
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([directory, items]) => ({
      directory,
      sessions: items,
    }))
    .sort((a, b) => {
      const aUpdated = a.sessions[0]?.time?.updated ?? 0;
      const bUpdated = b.sessions[0]?.time?.updated ?? 0;
      return bUpdated - aUpdated;
    });
}

function SessionItem({
  session,
  onDelete,
}: {
  session: Session;
  onDelete: () => void;
}) {
  return (
    <SidebarItem key={session.id} tooltip={session.title}>
      {({ isCollapsed, isFocused }) => (
        <>
          <SidebarLink href={`/session/${session.id}`}>
            <SidebarLabel>{truncateTitle(session.title)}</SidebarLabel>
          </SidebarLink>
          {(!isCollapsed || isFocused) && (
            <Menu>
              <SidebarMenuTrigger aria-label="Session options">
                <EllipsisHorizontalIcon />
              </SidebarMenuTrigger>
              <MenuContent
                popover={{
                  offset: 0,
                  placement: "right top",
                }}
              >
                <MenuItem intent="danger" onAction={onDelete}>
                  <TrashIcon />
                  Delete Session
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        </>
      )}
    </SidebarItem>
  );
}

export default function AppSidebar(
  props: React.ComponentProps<typeof Sidebar>,
) {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { data: hostnameData } = useHostname();
  const hostname = hostnameData?.hostname ?? "Loading...";
  const { data: sessionsData, mutate: mutateSessions } = useSessions();
  const openPicker = useNewSessionStore((s) => s.openPicker);
  const deleteSession = useDeleteSession();
  const sessions: Session[] = sessionsData ?? [];
  const groupByDirectory = usePreferencesStore((s) => s.groupByDirectory);
  const setGroupByDirectory = usePreferencesStore((s) => s.setGroupByDirectory);
  const { setOpen, setIsOpenOnMobile, isMobile, state } = useSidebar();
  const sidebarCollapsed = state === "collapsed" && !isMobile;
  const location = useLocation();
  const lastPath = useRef(location.pathname);
  const directoryGroups = useMemo(
    () => groupSessionsByDirectory(sessions),
    [sessions],
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<Key>>(
    () => new Set(directoryGroups.map((group) => group.directory)),
  );

  // New directory groups (e.g. sessions loading in for the first time) default
  // to expanded so the sidebar doesn't open as a wall of collapsed headers.
  useEffect(() => {
    setExpandedDirs((prev) => {
      const known = new Set(prev);
      let changed = false;
      for (const group of directoryGroups) {
        if (!known.has(group.directory)) {
          known.add(group.directory);
          changed = true;
        }
      }
      return changed ? known : prev;
    });
  }, [directoryGroups]);

  // Opening a session gets the sidebar out of the way, the same as creating one
  // does. Keyed off the route rather than the link's onPress: SidebarItem wraps
  // the link in its own pressable, which swallows the press before it lands.
  // This also covers reaching a session from the command menu.
  useEffect(() => {
    const previous = lastPath.current;
    lastPath.current = location.pathname;
    // Only on an actual navigation — landing on a session URL directly should
    // leave the sidebar however the user had it.
    if (previous === location.pathname) return;
    if (!location.pathname.startsWith("/session/")) return;
    if (isMobile) setIsOpenOnMobile(false);
    else setOpen(false);
  }, [location.pathname, isMobile, setOpen, setIsOpenOnMobile]);

  function handleNewSession() {
    openPicker();
  }

  const currentSessionMatch = useMatch({
    from: "/_app/session/$id",
    shouldThrow: false,
  });
  const currentSessionId = currentSessionMatch?.params?.id;

  async function handleDeleteSession(sessionId: string) {
    try {
      await deleteSession(sessionId);
      await mutateSessions();
      toast.success("Session deleted");
      // If we deleted the current session, navigate to home
      if (currentSessionId === sessionId) {
        navigate({ to: "/" });
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
      toast.error("Failed to delete session");
    }
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <UILink href="/" className="flex items-center gap-x-2">
          <img src="/logo.svg" alt="OpenCode Portal" className="size-6" />
          <SidebarLabel className="font-medium">
            OpenCode <span className="text-muted-fg">Portal</span>
          </SidebarLabel>
        </UILink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarSectionGroup>
          <SidebarSection>
            <SidebarItem
              tooltip="New Session"
              onPress={handleNewSession}
              className="cursor-pointer gap-x-2"
            >
              <PlusIcon className="size-4 shrink-0" data-slot="icon" />
              <SidebarLabel>
                {creating ? "Creating..." : "New Session"}
              </SidebarLabel>
            </SidebarItem>
          </SidebarSection>

          <SidebarSection label="Sessions">
            {!sidebarCollapsed && (
              <div
                data-slot="sidebar-section-actions"
                className="mb-1 flex items-center justify-between"
              >
                <span />
                <Menu>
                  <MenuTrigger
                    aria-label="Session list options"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-fg opacity-70 transition-opacity hover:bg-sidebar-accent hover:opacity-100"
                  >
                    {groupByDirectory ? (
                      <FolderIcon className="size-4" />
                    ) : (
                      <ListIcon className="size-4" />
                    )}
                  </MenuTrigger>
                  <MenuContent
                    placement="bottom right"
                    selectionMode="single"
                    selectedKeys={[groupByDirectory ? "group" : "flat"]}
                    onSelectionChange={(keys) => {
                      const key =
                        typeof keys === "string"
                          ? keys
                          : (keys.values().next().value as string | undefined);
                      setGroupByDirectory(key === "group");
                    }}
                  >
                    <MenuSection label="Session list">
                      <MenuItem
                        id="group"
                        onAction={() => setGroupByDirectory(true)}
                      >
                        <FolderIcon className="size-4" />
                        Group by directory
                      </MenuItem>
                      <MenuItem
                        id="flat"
                        onAction={() => setGroupByDirectory(false)}
                      >
                        <ListIcon className="size-4" />
                        Flat list
                      </MenuItem>
                    </MenuSection>
                  </MenuContent>
                </Menu>
              </div>
            )}

            {groupByDirectory ? (
              <SidebarDisclosureGroup
                expandedKeys={expandedDirs}
                onExpandedChange={(keys) => setExpandedDirs(new Set(keys))}
              >
                {directoryGroups.map((group) => (
                  <SidebarDisclosure key={group.directory} id={group.directory}>
                    <SidebarDisclosureTrigger className="gap-2">
                      <FolderIcon
                        className="size-4 shrink-0"
                        data-slot="icon"
                      />
                      <SidebarLabel>
                        <span className="truncate">
                          {sessionDirectory(group.sessions[0])}
                        </span>
                        <span className="ml-1.5 text-xs font-normal text-muted-fg">
                          {group.sessions.length}
                        </span>
                      </SidebarLabel>
                    </SidebarDisclosureTrigger>
                    <SidebarDisclosurePanel>
                      {group.sessions.map((session) => (
                        <SessionItem
                          key={session.id}
                          session={session}
                          onDelete={() => handleDeleteSession(session.id)}
                        />
                      ))}
                    </SidebarDisclosurePanel>
                  </SidebarDisclosure>
                ))}
              </SidebarDisclosureGroup>
            ) : (
              sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  onDelete={() => handleDeleteSession(session.id)}
                />
              ))
            )}
          </SidebarSection>
        </SidebarSectionGroup>
      </SidebarContent>

      <SidebarFooter className="flex flex-row justify-between gap-4 group-data-[state=collapsed]:flex-col">
        <Menu>
          <MenuTrigger
            className="flex w-full items-center justify-between"
            aria-label="Profile"
          >
            <div className="flex items-center gap-x-2">
              <Avatar
                className="size-8 *:size-8 group-data-[state=collapsed]:size-6 group-data-[state=collapsed]:*:size-6"
                isSquare
                initials={hostname.slice(0, 2).toUpperCase()}
              />
              <div className="in-data-[collapsible=dock]:hidden text-sm">
                <SidebarLabel>{hostname}</SidebarLabel>
              </div>
            </div>
            <ChevronUpDownIcon data-slot="chevron" />
          </MenuTrigger>
          <MenuContent
            className="in-data-[sidebar-collapsible=collapsed]:min-w-56 min-w-(--trigger-width)"
            placement="bottom right"
          >
            <MenuSection>
              <MenuHeader separator>
                <span className="block">{hostname}</span>
              </MenuHeader>
            </MenuSection>

            <MenuItem href="/settings">
              <Cog6ToothIcon />
              Settings
            </MenuItem>
          </MenuContent>
        </Menu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
