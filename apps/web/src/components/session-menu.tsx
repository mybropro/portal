import { Popover, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ModelSelect } from "@/components/model-select";
import { AgentSelect } from "@/components/agent-select";
import { EllipsisHorizontalIcon } from "@/components/icons/lucide";

// Model + agent controls for the active session, tucked into a top 3-dot menu
// (moved out of the bottom input bar).
export function SessionMenu({ sessionId }: { sessionId: string }) {
  return (
    <Popover>
      <Button intent="plain" size="sq-sm" isCircle aria-label="Session settings">
        <EllipsisHorizontalIcon className="size-5" />
      </Button>
      <PopoverContent className="w-64">
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              Model
            </p>
            <ModelSelect />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">
              Agent
            </p>
            <AgentSelect sessionId={sessionId} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
