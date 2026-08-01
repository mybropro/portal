import {
  ChevronUpDownIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
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
import { useLocation, useNavigate, useMatch } from "@tanstack/react-router";
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
  const { setOpen, setIsOpenOnMobile, isMobile } = useSidebar();
  const location = useLocation();
  const lastPath = useRef(location.pathname);

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
            {sessions.map((session) => (
              <SidebarItem key={session.id} tooltip={session.title}>
                {({ isCollapsed, isFocused }) => (
                  <>
                    <SidebarLink href={`/session/${session.id}`}>
                      <SidebarLabel>
                        {truncateTitle(session.title)}
                      </SidebarLabel>
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
                          <MenuItem
                            intent="danger"
                            onAction={() => handleDeleteSession(session.id)}
                          >
                            <TrashIcon />
                            Delete Session
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    )}
                  </>
                )}
              </SidebarItem>
            ))}
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
