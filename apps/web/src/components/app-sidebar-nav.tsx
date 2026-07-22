import { Breadcrumbs, BreadcrumbsItem } from "@/components/ui/breadcrumbs";
import { SidebarNav, SidebarTrigger } from "@/components/ui/sidebar";
import { useInstanceStore } from "@/stores/instance-store";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";

export function AppSidebarNav() {
  const instance = useInstanceStore((s) => s.instance);
  const { pageTitle } = useBreadcrumb();

  return (
    <SidebarNav isSticky>
      <span className="flex items-center gap-x-4">
        <SidebarTrigger className="-ml-2" />
        <Breadcrumbs className="hidden md:flex">
          <BreadcrumbsItem href="/">
            {instance?.name ?? "Instance"}
          </BreadcrumbsItem>
          {pageTitle && <BreadcrumbsItem>{pageTitle}</BreadcrumbsItem>}
        </Breadcrumbs>
      </span>
    </SidebarNav>
  );
}
