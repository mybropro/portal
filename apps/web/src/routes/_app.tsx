import { createFileRoute, Outlet } from "@tanstack/react-router";
import AppSidebar from "@/components/app-sidebar";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { OfflineBanner } from "@/components/offline-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BreadcrumbProvider } from "@/contexts/breadcrumb-context";
import DirectoryPicker from "@/components/directory-picker";
import { OPENCODE_PORT, OPENCODE_PROVIDER } from "@/lib/backend-url";
import { useOpencodeEvents } from "@/hooks/use-opencode-events";
import { useOutboxFlusher } from "@/hooks/use-outbox";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  useOpencodeEvents(OPENCODE_PORT, OPENCODE_PROVIDER);
  useOutboxFlusher(OPENCODE_PORT, OPENCODE_PROVIDER);

  return (
    <BreadcrumbProvider>
      <SidebarProvider className="h-dvh overflow-hidden">
        <AppSidebar intent="inset" collapsible="dock" />
        <SidebarInset className="overflow-hidden">
          <OfflineBanner />
          <AppSidebarNav />
          {/* No padding here: the session view wants the full pane, and the
              other routes already center themselves with their own gutters. */}
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
        <DirectoryPicker />
      </SidebarProvider>
    </BreadcrumbProvider>
  );
}
