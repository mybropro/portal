import { useCallback, useEffect, useRef } from "react";
import { useOutboxStore, type QueuedMessage } from "@/stores/outbox-store";
import { useSessionStatuses } from "@/hooks/use-opencode";
import { useOnlineStatus } from "@/hooks/use-opencode";
import { useModelStore } from "@/stores/model-store";
import {
  addOptimisticMessage,
  removeOptimisticMessage,
  settleOptimisticMessage,
  reconcileOptimisticMessage,
  mutateSessionMessages,
  type MessageWithParts,
} from "@/hooks/use-session-messages";
import type { BackendProvider } from "@/lib/backend-url";

/**
 * Enqueues a message into the persistent outbox, optimistic-updates the
 * transcript, and returns nothing. The actual send happens on the next flush.
 */
export function useEnqueueMessage(
  port: number,
  provider: BackendProvider | undefined,
  sessionId: string,
) {
  const enqueue = useOutboxStore((s) => s.enqueue);

  return useCallback(
    (message: QueuedMessage) => {
      const optimisticMessage: MessageWithParts = {
        info: {
          id: message.id,
          sessionID: sessionId,
          role: "user",
          time: { created: message.createdAt },
          agent: "user",
          model: { providerID: "", modelID: "" },
        },
        parts: [
          ...message.files.map((file, index) => ({
            id: `${message.id}-file-${index}`,
            sessionID: sessionId,
            messageID: message.id,
            type: "file" as const,
            mime: file.mime,
            filename: file.name,
            url: file.url,
          })),
          ...(message.text
            ? [
                {
                  id: `${message.id}-part`,
                  sessionID: sessionId,
                  messageID: message.id,
                  type: "text" as const,
                  text: message.text,
                },
              ]
            : []),
        ],
        isQueued: true,
      };
      addOptimisticMessage(port, sessionId, optimisticMessage, provider);
      enqueue(message);
    },
    [enqueue, port, provider, sessionId],
  );
}

/**
 * Watch the outbox and flush messages the moment their session is idle AND the
 * backend is reachable. Runs app-wide (mounted in _app.tsx) so queued messages
 * go out even when you're not looking at that session. One message at a time,
 * oldest first.
 */
export function useOutboxFlusher(
  port: number,
  provider: BackendProvider | undefined,
) {
  const messages = useOutboxStore((s) => s.messages);
  const remove = useOutboxStore((s) => s.remove);
  const setFlushing = useOutboxStore((s) => s.setFlushing);
  const { online } = useOnlineStatus();
  const { data: statuses } = useSessionStatuses();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const inFlightRef = useRef(false);

  const flush = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!port) return;
    if (!online) return;

    // Oldest first, skipping any whose session is mid-turn.
    const pending =
      [...messages]
        .sort((a, b) => a.createdAt - b.createdAt)
        .find((message) => {
          const status = statuses?.[message.sessionId];
          return !status || status.type === "idle";
        }) ?? undefined;
    if (!pending) return;

    const { sessionId } = pending;
    inFlightRef.current = true;
    setFlushing(true);
    try {
      const res = await fetch(
        `${`/api/${provider ?? "opencode"}/${port}`}/session/${sessionId}/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageID: pending.id,
            text: pending.text,
            files: pending.files.map((file) => ({
              mime: file.mime,
              filename: file.name,
              url: file.url,
            })),
            model:
              selectedModel.providerID && selectedModel.modelID
                ? selectedModel
                : undefined,
            ...(pending.agent ? { agent: pending.agent } : {}),
          }),
        },
      );

      if (!res.ok) {
        // Keep it queued; retry on next flush tick.
        console.error("Failed to flush queued message", res.status);
        return;
      }

      const result = (await res.json()) as {
        message?: { id: string };
      };
      if (result.message?.id) {
        reconcileOptimisticMessage(
          port,
          sessionId,
          pending.id,
          result.message as Parameters<typeof reconcileOptimisticMessage>[3],
          provider,
        );
      } else {
        settleOptimisticMessage(port, sessionId, pending.id, provider);
      }
      remove(pending.id);
      mutateSessionMessages(port, sessionId, provider);
    } catch (err) {
      console.error("Failed to flush queued message:", err);
    } finally {
      inFlightRef.current = false;
      setFlushing(false);
    }
  }, [
    messages,
    online,
    statuses,
    port,
    provider,
    remove,
    setFlushing,
    selectedModel,
  ]);

  // Re-attempt whenever a condition flips: reconnect, a session goes idle, or
  // a message lands in the outbox. Also poll while messages are waiting, in
  // case the backend comes back without a state flip we noticed (e.g. the
  // health probe hasn't ticked yet).
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      void flush();
    }, 250);
    return () => clearTimeout(timer);
  }, [online, statuses, messages.length, flush]);

  useEffect(() => {
    if (messages.length === 0) return;
    const interval = setInterval(() => {
      void flush();
    }, 5000);
    return () => clearInterval(interval);
  }, [messages.length, flush]);
}

/** Remove an unsent queued message (and its optimistic placeholder). */
export function useDiscardQueuedMessage(
  port: number,
  provider: BackendProvider | undefined,
) {
  const remove = useOutboxStore((s) => s.remove);
  return useCallback(
    (sessionId: string, messageId: string) => {
      removeOptimisticMessage(port, sessionId, messageId, provider);
      remove(messageId);
    },
    [remove, port, provider],
  );
}
