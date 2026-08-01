import { defineHandler } from "nitro/h3";
import { getOpencodeBaseUrl } from "../../lib/opencode-client";
import { parsePort } from "../../lib/validation";

const encoder = new TextEncoder();

// Bun.serve closes a request after 10s of socket idle. opencode only heartbeats
// every 10s, so the stream loses that race and reconnects every ~10-30s. A
// comment frame on a shorter interval keeps the socket warm.
const PING_INTERVAL_MS = 5000;

function encodeEvent(data: unknown) {
  return encoder.encode(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
}

function errorEvent(error: unknown) {
  return {
    id: `portal-event-error-${Date.now()}`,
    type: "portal.event.error",
    properties: {
      message:
        error instanceof Error ? error.message : "OpenCode event stream failed",
    },
  };
}

export default defineHandler((event) => {
  const port = parsePort(event);
  const abort = new AbortController();

  event.res.headers.set("Content-Type", "text/event-stream");
  event.res.headers.set("Cache-Control", "no-cache, no-transform");
  event.res.headers.set("Connection", "keep-alive");
  event.res.headers.set("X-Accel-Buffering", "no");
  event.res.headers.set("X-Content-Type-Options", "nosniff");

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const ping = setInterval(() => {
        if (abort.signal.aborted) return;
        emit(encoder.encode(": ping\n\n"));
      }, PING_INTERVAL_MS);

      try {
        // /global/event, not the SDK's client.event.subscribe(): the per-instance
        // /event stream is scoped to one working directory (the backend's cwd),
        // so sessions started elsewhere via the directory picker emit nothing the
        // UI ever sees. The global stream carries every directory and wraps each
        // event as { directory, project, payload }.
        const response = await fetch(`${getOpencodeBaseUrl(port)}/global/event`, {
          signal: abort.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!response.ok || !response.body) {
          throw new Error(`Event stream responded ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; keep any partial tail.
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("");
            if (!data) continue;

            let payload: unknown;
            try {
              payload = JSON.parse(data)?.payload;
            } catch {
              continue;
            }

            // Every event also arrives as a "sync" envelope carrying the same
            // change in event-sourcing form. Forwarding both would double-apply.
            if (
              !payload ||
              typeof payload !== "object" ||
              (payload as { type?: string }).type === "sync"
            ) {
              continue;
            }

            emit(encodeEvent(payload));
          }
        }
      } catch (error) {
        if (!abort.signal.aborted) emit(encodeEvent(errorEvent(error)));
      } finally {
        clearInterval(ping);
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may have already closed the stream.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
});
