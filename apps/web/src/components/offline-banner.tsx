import { WifiOffIcon } from "@/components/icons/lucide";
import { useOnlineStatus } from "@/hooks/use-opencode";

/**
 * Thin, non-blocking banner shown when the backend is unreachable. The SWR
 * cache keeps the session list and transcripts on screen, so this tells you
 * why they're stale instead of letting revalidation errors flash.
 */
export function OfflineBanner() {
  const { online, rawOnline } = useOnlineStatus();

  const offline = !online;
  const degraded = online && !rawOnline;

  if (!offline && !degraded) return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/20 bg-warning/10 px-4 py-1.5 text-xs text-warning">
      <WifiOffIcon className="size-3.5 shrink-0" />
      <span>
        {offline
          ? "Offline — showing cached data. Messages you send are queued and will go out when you reconnect."
          : "Connection unstable — retrying…"}
      </span>
    </div>
  );
}
