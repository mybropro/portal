import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTheme } from "@/providers/theme-provider";
import { useBreadcrumb } from "@/contexts/breadcrumb-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelSelect } from "@/components/model-select";
import { useConfig, useHostname } from "@/hooks/use-opencode";
import { useNewSessionStore } from "@/stores/new-session-store";
import { OPENCODE_PORT } from "@/lib/backend-url";
import {
  SwatchIcon,
  CpuChipIcon,
  FolderIcon,
  TrashIcon,
} from "@/components/icons/lucide";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const themes = [
  { id: "light", title: "Light" },
  { id: "dark", title: "Dark" },
  { id: "system", title: "System" },
];

function ThemeSetting() {
  const { theme, setTheme } = useTheme();

  return (
    <Select
      value={theme}
      onChange={(value) =>
        value && setTheme(value as "light" | "dark" | "system")
      }
      placeholder="Select theme"
    >
      <SelectTrigger className="w-full max-w-xs" />
      <SelectContent>
        {themes.map((item) => (
          <SelectItem key={item.id} id={item.id} textValue={item.title}>
            {item.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function baseName(p: string) {
  return p.replace(/\/+$/, "").split("/").pop() || p;
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: (props: { className?: string }) => React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-fg" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-fg">{description}</p>
      <div className="pt-1">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const { setPageTitle } = useBreadcrumb();
  const {
    data: config,
    error: configError,
    isLoading: configLoading,
  } = useConfig() as {
    data?: { model?: string; username?: string; mcp?: Record<string, unknown> };
    error?: unknown;
    isLoading: boolean;
  };
  const { data: hostnameData } = useHostname();
  const recents = useNewSessionStore((s) => s.recents);
  const clearRecents = useNewSessionStore((s) => s.clearRecents);

  useEffect(() => {
    setPageTitle("Settings");
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const connected = !!config && !configError;
  const hostname = hostnameData?.hostname;
  const mcpServers = config?.mcp ? Object.keys(config.mcp) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-8 pb-20">
      <header className="space-y-1">
        <h1 className="bg-gradient-to-r from-fg to-muted-fg bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Settings
        </h1>
        <p className="text-muted-fg">A mobile viewer for your opencode server.</p>
      </header>

      {/* Live connection panel */}
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex items-center gap-2">
          <span
            className={`size-2.5 rounded-full ${
              connected
                ? "bg-green-500"
                : configLoading
                  ? "bg-amber-400"
                  : "bg-red-500"
            }`}
          />
          <span className="font-medium">
            {connected
              ? "Connected"
              : configLoading
                ? "Connecting…"
                : "Disconnected"}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-fg">Backend</dt>
          <dd className="font-mono">opencode&nbsp;:{OPENCODE_PORT}</dd>
          {hostname && (
            <>
              <dt className="text-muted-fg">Host</dt>
              <dd className="truncate">{hostname}</dd>
            </>
          )}
          {config?.username && (
            <>
              <dt className="text-muted-fg">User</dt>
              <dd className="truncate">{config.username}</dd>
            </>
          )}
        </dl>
        {mcpServers.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              MCP servers
            </p>
            <div className="flex flex-wrap gap-1.5">
              {mcpServers.map((name) => (
                <Badge key={name} intent="secondary">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Section
        icon={SwatchIcon}
        title="Appearance"
        description="Light, dark, or match your system."
      >
        <ThemeSetting />
      </Section>

      <Section
        icon={CpuChipIcon}
        title="Default model"
        description="Used for new sessions and the current chat. Pulled live from your opencode providers — nothing is hardcoded."
      >
        <div className="space-y-2">
          <ModelSelect />
          {config?.model && (
            <p className="text-xs text-muted-fg">
              opencode config default:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">
                {config.model}
              </code>
            </p>
          )}
        </div>
      </Section>

      <Section
        icon={FolderIcon}
        title="New session directories"
        description="Folders you've recently started sessions in — these appear as quick picks in the new-session dialog."
      >
        {recents.length === 0 ? (
          <p className="text-sm text-muted-fg">No recent directories yet.</p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y rounded-lg border">
              {recents.map((dir) => (
                <li
                  key={dir}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm"
                >
                  <FolderIcon className="size-4 shrink-0 text-muted-fg" />
                  <span className="shrink-0 font-medium">{baseName(dir)}</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-fg">
                    {dir}
                  </span>
                </li>
              ))}
            </ul>
            <Button size="sm" intent="outline" onPress={clearRecents}>
              <TrashIcon className="size-4" />
              Clear recent directories
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
