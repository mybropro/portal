import { useMatch } from "@tanstack/react-router";
import { Breadcrumbs, BreadcrumbsItem } from "@/components/ui/breadcrumbs";
import { SidebarNav, SidebarTrigger } from "@/components/ui/sidebar";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import { SessionMenu } from "@/components/session-menu";

export function AppSidebarNav() {
  const { pageTitle } = useBreadcrumb();
  const sessionMatch = useMatch({
    from: "/_app/session/$id",
    shouldThrow: false,
  });
  const sessionId = sessionMatch?.params?.id;

  return (
    <SidebarNav isSticky>
      <span className="flex items-center gap-x-4">
        <SidebarTrigger className="-ml-2" />
        <Breadcrumbs className="hidden md:flex">
          <BreadcrumbsItem href="/">opencode</BreadcrumbsItem>
          {pageTitle && <BreadcrumbsItem>{pageTitle}</BreadcrumbsItem>}
        </Breadcrumbs>
      </span>
      {sessionId && (
        <span className="ml-auto">
          <SessionMenu sessionId={sessionId} />
        </span>
      )}
    </SidebarNav>
  );
}
