import { useEffect, useRef } from "react";
import { swrCache, swrMutate as mutate } from "@/lib/swr";
import type {
  Event,
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  Session,
  SessionStatus,
  SessionMessage,
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantText,
  SessionMessageAssistantTool,
} from "@opencode-ai/sdk/v2";
import {
  contentItemPartId,
  getMessagesKey,
  type AssistantContentItem,
  legacyMessageToSessionMessage,
  legacyPartToContent,
  sortSessionMessages,
} from "@/hooks/use-session-messages";
import { getErrorMessage } from "@/lib/error-message";
import {
  isAbortNoise,
  isUnrecoverableProviderError,
} from "@/lib/provider-error";
import { backendBasePath, type BackendProvider } from "@/lib/backend-url";
import { dirsQuery, useNewSessionStore } from "@/stores/new-session-store";

type RuntimeEvent =
  | Event
  | {
      id: string;
      type: "server.heartbeat" | "portal.event.error";
      properties: Record<string, unknown>;
    };

// /sessions and /session/status are keyed with the picker's recents, so these
// must reproduce the hooks' keys exactly or the live updates land on a cache
// entry nothing reads.
function currentDirsQuery() {
  return dirsQuery(useNewSessionStore.getState().recents);
}

function sessionsKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/sessions${currentDirsQuery()}`;
}

function permissionsKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/permissions${currentDirsQuery()}`;
}

function questionsKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/questions`;
}

function currentProjectKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/project/current`;
}

function sessionStatusKey(port: number, provider?: BackendProvider) {
  return `${backendBasePath(provider, port)}/session/status${currentDirsQuery()}`;
}

function upsertById<T extends { id: string }>(items: T[] | undefined, item: T) {
  const next = [...(items ?? [])];
  const index = next.findIndex((value) => value.id === item.id);
  if (index >= 0) {
    next[index] = item;
  } else {
    next.push(item);
  }
  return next;
}

function removeById<T extends { id: string }>(
  items: T[] | undefined,
  id: string,
) {
  return (items ?? []).filter((item) => item.id !== id);
}

function sortSessions(sessions: Session[]) {
  return [...sessions].sort(
    (a: Session, b: Session) =>
      (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created),
  );
}

function mutateSessions(
  port: number,
  provider: BackendProvider | undefined,
  updater: (items: Session[]) => Session[],
) {
  void mutate<Session[]>(
    sessionsKey(port, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function mutatePermissions(
  port: number,
  provider: BackendProvider | undefined,
  updater: (items: PermissionRequest[]) => PermissionRequest[],
) {
  void mutate<PermissionRequest[]>(
    permissionsKey(port, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function mutateQuestions(
  port: number,
  provider: BackendProvider | undefined,
  updater: (items: QuestionRequest[]) => QuestionRequest[],
) {
  void mutate<QuestionRequest[]>(
    questionsKey(port, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

function mutateSessionStatuses(
  port: number,
  provider: BackendProvider | undefined,
  updater: (
    items: Record<string, SessionStatus>,
  ) => Record<string, SessionStatus>,
) {
  void mutate<Record<string, SessionStatus>>(
    sessionStatusKey(port, provider),
    (current) => updater(current ?? {}),
    { revalidate: false },
  );
}

function mutateMessages(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
  updater: (items: SessionMessage[]) => SessionMessage[],
) {
  void mutate<SessionMessage[]>(
    getMessagesKey(port, sessionID, provider),
    (current) => updater(current ?? []),
    { revalidate: false },
  );
}

const rememberedTaskErrors = new Map<string, string>();

function rememberTaskError(childID: string, message: string) {
  if (!message || isAbortNoise(message)) return;
  rememberedTaskErrors.set(childID, message);
}

function restoreRememberedTaskErrors(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  for (const [childID, message] of rememberedTaskErrors) {
    failParentTask(port, provider, sessionID, childID, message);
  }
}

function revalidateMessages(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  void mutate(getMessagesKey(port, sessionID, provider)).then(() => {
    restoreRememberedTaskErrors(port, provider, sessionID);
  });
}

function cachedSessions(
  port: number,
  provider: BackendProvider | undefined,
): Session[] {
  return (
    (swrCache.get(sessionsKey(port, provider))?.data as Session[] | undefined) ??
    []
  );
}

function parentSessionID(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  return cachedSessions(port, provider).find((session) => session.id === sessionID)
    ?.parentID;
}

function taskChildId(tool: SessionMessageAssistantTool): string | undefined {
  const structured =
    "structured" in tool.state
      ? (tool.state.structured as Record<string, unknown> | undefined)
      : undefined;
  const raw =
    structured?.sessionId ??
    structured?.sessionID ??
    structured?.jobId;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function failParentTask(
  port: number,
  provider: BackendProvider | undefined,
  parentID: string,
  childID: string,
  errorMessage: string,
) {
  rememberTaskError(childID, errorMessage);
  mutateMessages(port, provider, parentID, (items) =>
    items.map((item) => {
      if (item.type !== "assistant") return item;
      let changed = false;
      const content = item.content.map((part) => {
        if (part.type !== "tool") return part;
        if (part.state.status === "completed") return part;
        if (taskChildId(part) !== childID) return part;
        const existing =
          part.state.status === "error"
            ? getErrorMessage(part.state.error)
            : null;
        if (existing && !isAbortNoise(existing)) return part;
        if (isAbortNoise(errorMessage)) return part;
        changed = true;
        return {
          ...part,
          state: {
            status: "error" as const,
            input:
              typeof part.state.input === "object" && part.state.input
                ? part.state.input
                : {},
            structured:
              "structured" in part.state ? (part.state.structured ?? {}) : {},
            content: [],
            error: { type: "unknown" as const, message: errorMessage },
          },
          time: {
            ...part.time,
            completed: Date.now(),
          },
        };
      });
      if (!changed) return item;
      return { ...item, content };
    }),
  );
}

const messageRevalidationTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();

/**
 * Sessions with a turn in flight. opencode does not persist a message's parts
 * until the turn ends — refetching mid-turn returns the message frozen at
 * whatever it looked like when the turn started, which would wipe out the text
 * assembled from deltas. So while a session is busy the event stream is the
 * only source of truth, and `session.idle` reconciles against the server.
 */
const streamingSessions = new Set<string>();

function setStreaming(sessionID: string, streaming: boolean) {
  if (streaming) streamingSessions.add(sessionID);
  else streamingSessions.delete(sessionID);
}

function messageRevalidationKey(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  return `${provider ?? "opencode"}:${port}:${sessionID}`;
}

function revalidateMessagesSoon(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  if (streamingSessions.has(sessionID)) return;

  const key = messageRevalidationKey(port, provider, sessionID);
  if (messageRevalidationTimers.has(key)) return;

  const timer = setTimeout(() => {
    messageRevalidationTimers.delete(key);
    revalidateMessages(port, provider, sessionID);
  }, 300);

  messageRevalidationTimers.set(key, timer);
}

function revalidateMessagesNow(
  port: number,
  provider: BackendProvider | undefined,
  sessionID: string,
) {
  const key = messageRevalidationKey(port, provider, sessionID);
  const timer = messageRevalidationTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    messageRevalidationTimers.delete(key);
  }

  if (streamingSessions.has(sessionID)) return;
  revalidateMessages(port, provider, sessionID);
}

function upsertMessage(messages: SessionMessage[], message: SessionMessage) {
  const next = [...messages];
  const index = next.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    next[index] = message;
  } else {
    next.push(message);
  }
  return sortSessionMessages(next);
}

function replaceMessageAt(
  messages: SessionMessage[],
  index: number,
  message: SessionMessage,
) {
  const next = [...messages];
  next[index] = message;
  return next;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function activeAssistantIndex(messages: SessionMessage[]) {
  return findLastIndex(
    messages,
    (message) => message.type === "assistant" && !message.time.completed,
  );
}

function latestToolIndex(assistant: SessionMessageAssistant, callID?: string) {
  return findLastIndex(
    assistant.content,
    (item) =>
      item.type === "tool" && (callID === undefined || item.id === callID),
  );
}

function latestTextIndex(assistant: SessionMessageAssistant, textID?: string) {
  return findLastIndex(
    assistant.content,
    (item) => item.type === "text" && (textID === undefined || item.id === textID),
  );
}

function latestReasoningIndex(
  assistant: SessionMessageAssistant,
  reasoningID: string,
) {
  return findLastIndex(
    assistant.content,
    (item) => item.type === "reasoning" && item.id === reasoningID,
  );
}

function updateActiveAssistant(
  messages: SessionMessage[],
  updater: (assistant: SessionMessageAssistant) => SessionMessageAssistant,
) {
  const index = activeAssistantIndex(messages);
  if (index < 0) return messages;

  const assistant = messages[index];
  if (assistant.type !== "assistant") return messages;
  return replaceMessageAt(messages, index, updater(assistant));
}

function updateLatestTool(
  assistant: SessionMessageAssistant,
  callID: string,
  updater: (tool: SessionMessageAssistantTool) => SessionMessageAssistantTool,
) {
  const toolIndex = latestToolIndex(assistant, callID);
  if (toolIndex < 0) return assistant;

  const tool = assistant.content[toolIndex];
  if (tool.type !== "tool") return assistant;

  const content = [...assistant.content];
  content[toolIndex] = updater(tool);
  return { ...assistant, content };
}

function closeActiveAssistant(messages: SessionMessage[], timestamp: number) {
  return updateActiveAssistant(messages, (assistant) => ({
    ...assistant,
    time: {
      ...assistant.time,
      completed: timestamp,
    },
  }));
}

function appendAssistantContent(
  messages: SessionMessage[],
  item: SessionMessageAssistant["content"][number],
) {
  return updateActiveAssistant(messages, (assistant) => ({
    ...assistant,
    content: [...assistant.content, item],
  }));
}

function findAssistantIndex(messages: SessionMessage[], messageID: string) {
  return messages.findIndex(
    (message) => message.id === messageID && message.type === "assistant",
  );
}

/**
 * Apply a `message.updated` info blob. It carries no parts, so an existing
 * message keeps whatever content the stream has already accumulated.
 */
function upsertAssistantInfo(messages: SessionMessage[], info: Message) {
  const next = legacyMessageToSessionMessage({ info, parts: [] });
  if (next.type !== "assistant") return messages;

  const index = findAssistantIndex(messages, info.id);
  if (index < 0) return sortSessionMessages([...messages, next]);

  const existing = messages[index];
  if (existing.type !== "assistant") return messages;
  return replaceMessageAt(messages, index, {
    ...next,
    content: existing.content,
  });
}

function upsertAssistantPart(
  messages: SessionMessage[],
  part: Part,
  onMiss: () => void,
) {
  const index = findAssistantIndex(messages, part.messageID);
  if (index < 0) {
    onMiss();
    return messages;
  }

  const assistant = messages[index];
  if (assistant.type !== "assistant") {
    onMiss();
    return messages;
  }

  const item = legacyPartToContent(part, assistant.time.created);
  if (!item) return messages;

  const partID = contentItemPartId(item);
  const contentIndex = findLastIndex(
    assistant.content,
    (existing) => contentItemPartId(existing) === partID,
  );

  const content = [...assistant.content];
  if (contentIndex >= 0) {
    content[contentIndex] = mergeStreamedText(
      assistant.content[contentIndex],
      item,
    );
  } else {
    content.push(item);
  }

  return replaceMessageAt(messages, index, { ...assistant, content });
}

/**
 * `message.part.updated` snapshots a part's text, and that snapshot can lag the
 * deltas already applied — replacing outright makes the message visibly shrink
 * and then regrow. Streamed text only ever grows, so keep whichever is longer.
 */
function mergeStreamedText(
  existing: AssistantContentItem,
  incoming: AssistantContentItem,
): AssistantContentItem {
  if (existing.type !== incoming.type) return incoming;
  if (incoming.type !== "text" && incoming.type !== "reasoning")
    return incoming;

  const previous = existing as typeof incoming;
  return previous.text.length > incoming.text.length
    ? { ...incoming, text: previous.text }
    : incoming;
}

/**
 * Append a streamed token to the part it belongs to. Anything we cannot place
 * (message or part not in cache yet, e.g. the tab opened mid-turn) falls back
 * to a refetch via `onMiss` rather than guessing.
 */
function appendPartDelta(
  messages: SessionMessage[],
  messageID: string,
  partID: string,
  delta: string,
  onMiss: () => void,
) {
  const index = findAssistantIndex(messages, messageID);
  if (index < 0) {
    onMiss();
    return messages;
  }

  const assistant = messages[index];
  if (assistant.type !== "assistant") {
    onMiss();
    return messages;
  }

  const contentIndex = findLastIndex(
    assistant.content,
    (item) => contentItemPartId(item) === partID,
  );
  if (contentIndex < 0) {
    onMiss();
    return messages;
  }

  const item = assistant.content[contentIndex];
  if (item.type !== "text" && item.type !== "reasoning") return messages;

  const content = [...assistant.content];
  content[contentIndex] = { ...item, text: `${item.text}${delta}` };
  return replaceMessageAt(messages, index, { ...assistant, content });
}

function removeMatchingOptimisticUser(
  messages: SessionMessage[],
  text: string,
) {
  return messages.filter(
    (message) =>
      !(
        message.type === "user" &&
        message.text === text &&
        message.metadata?.portalOptimistic === true
      ),
  );
}

function revalidateInstance(port: number, provider?: BackendProvider) {
  void mutate(sessionsKey(port, provider));
  void mutate(sessionStatusKey(port, provider));
  void mutate(permissionsKey(port, provider));
  void mutate(questionsKey(port, provider));
  const basePath = backendBasePath(provider, port);
  void mutate(
    (key) =>
      typeof key === "string" &&
      key.startsWith(`${basePath}/session/`) &&
      key.endsWith("/messages"),
  );
}

function applyEvent(
  port: number,
  provider: BackendProvider | undefined,
  event: RuntimeEvent,
) {
  switch (event.type) {
    case "server.connected":
      revalidateInstance(port, provider);
      break;

    case "server.heartbeat":
    case "portal.event.error":
      break;

    case "session.created":
    case "session.updated": {
      const info = event.properties.info;
      if (info.time?.archived) {
        mutateSessions(port, provider, (items) => removeById(items, info.id));
        break;
      }
      mutateSessions(port, provider, (items) =>
        sortSessions(upsertById(items, info)),
      );
      break;
    }

    case "session.deleted":
      mutateSessions(port, provider, (items) =>
        removeById(items, event.properties.sessionID),
      );
      mutateSessionStatuses(port, provider, (items) => {
        const next = { ...items };
        delete next[event.properties.sessionID];
        return next;
      });
      break;

    case "session.status": {
      const status = event.properties.status;
      const retryMessage =
        status.type === "retry" ? status.message : undefined;
      setStreaming(
        event.properties.sessionID,
        status.type !== "idle" && !isUnrecoverableProviderError(retryMessage),
      );
      mutateSessionStatuses(port, provider, (items) => ({
        ...items,
        [event.properties.sessionID]: status,
      }));
      if (isUnrecoverableProviderError(retryMessage)) {
        const parentID = parentSessionID(
          port,
          provider,
          event.properties.sessionID,
        );
        if (parentID && retryMessage) {
          failParentTask(
            port,
            provider,
            parentID,
            event.properties.sessionID,
            retryMessage,
          );
        }
        void fetch(
          `${backendBasePath(provider, port)}/session/${event.properties.sessionID}/abort`,
          { method: "POST" },
        ).catch(() => undefined);
      }
      break;
    }

    case "session.idle":
      // Clear the streaming flag first so the reconcile below is allowed
      // through — this is the one refetch per turn that the server can answer.
      setStreaming(event.properties.sessionID, false);
      mutateSessionStatuses(port, provider, (items) => ({
        ...items,
        [event.properties.sessionID]: { type: "idle" },
      }));
      revalidateMessagesNow(port, provider, event.properties.sessionID);
      {
        const parentID = parentSessionID(
          port,
          provider,
          event.properties.sessionID,
        );
        if (parentID) {
          restoreRememberedTaskErrors(port, provider, parentID);
        }
      }
      break;

    case "session.next.agent.switched":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "agent-switched",
          agent: event.properties.agent,
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.model.switched":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "model-switched",
          model: event.properties.model,
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.prompted":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(
          removeMatchingOptimisticUser(items, event.properties.prompt.text),
          {
            id: event.id,
            type: "user",
            text: event.properties.prompt.text,
            files: event.properties.prompt.files,
            agents: event.properties.prompt.agents,
            time: {
              created: event.properties.timestamp,
            },
          },
        ),
      );
      break;

    case "session.next.synthetic":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "synthetic",
          sessionID: event.properties.sessionID,
          text: event.properties.text,
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.shell.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "shell",
          callID: event.properties.callID,
          command: event.properties.command,
          output: "",
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.shell.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const index = findLastIndex(
          items,
          (item) =>
            item.type === "shell" && item.callID === event.properties.callID,
        );
        if (index < 0) return items;

        const shell = items[index];
        if (shell.type !== "shell") return items;
        return replaceMessageAt(items, index, {
          ...shell,
          output: event.properties.output,
          time: {
            ...shell.time,
            completed: event.properties.timestamp,
          },
        });
      });
      break;

    case "session.next.step.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(closeActiveAssistant(items, event.properties.timestamp), {
          id: event.id,
          type: "assistant",
          agent: event.properties.agent,
          model: event.properties.model,
          content: [],
          time: {
            created: event.properties.timestamp,
          },
          ...(event.properties.snapshot
            ? { snapshot: { start: event.properties.snapshot } }
            : {}),
        }),
      );
      break;

    case "session.next.step.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) => ({
          ...assistant,
          finish: event.properties.finish,
          cost: event.properties.cost,
          tokens: event.properties.tokens,
          time: {
            ...assistant.time,
            completed: event.properties.timestamp,
          },
          ...(event.properties.snapshot
            ? {
                snapshot: {
                  ...(assistant.snapshot ?? {}),
                  end: event.properties.snapshot,
                },
              }
            : {}),
        })),
      );
      break;

    case "session.next.step.failed":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) => ({
          ...assistant,
          finish: "error",
          error: event.properties.error,
          time: {
            ...assistant.time,
            completed: event.properties.timestamp,
          },
        })),
      );
      break;

    case "session.next.text.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        appendAssistantContent(items, {
          type: "text",
          id: event.properties.textID,
          text: "",
        }),
      );
      break;

    case "session.next.text.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) => {
          const textIndex = latestTextIndex(assistant, event.properties.textID);
          if (textIndex < 0) return assistant;

          const text = assistant.content[textIndex];
          if (text.type !== "text") return assistant;

          const content = [...assistant.content];
          content[textIndex] = {
            ...text,
            text: `${text.text}${event.properties.delta}`,
          } satisfies SessionMessageAssistantText;
          return { ...assistant, content };
        }),
      );
      break;

    case "session.next.text.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) => {
          const textIndex = latestTextIndex(assistant, event.properties.textID);
          if (textIndex < 0) return assistant;

          const text = assistant.content[textIndex];
          if (text.type !== "text") return assistant;

          const content = [...assistant.content];
          content[textIndex] = {
            ...text,
            text: event.properties.text,
          } satisfies SessionMessageAssistantText;
          return { ...assistant, content };
        }),
      );
      break;

    case "session.next.reasoning.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        appendAssistantContent(items, {
          type: "reasoning",
          id: event.properties.reasoningID,
          text: "",
        }),
      );
      break;

    case "session.next.reasoning.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) => {
          const reasoningIndex = latestReasoningIndex(
            assistant,
            event.properties.reasoningID,
          );
          if (reasoningIndex < 0) return assistant;

          const reasoning = assistant.content[reasoningIndex];
          if (reasoning.type !== "reasoning") return assistant;

          const content = [...assistant.content];
          content[reasoningIndex] = {
            ...reasoning,
            text: `${reasoning.text}${event.properties.delta}`,
          } satisfies SessionMessageAssistantReasoning;
          return { ...assistant, content };
        }),
      );
      break;

    case "session.next.reasoning.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) => {
          const reasoningIndex = latestReasoningIndex(
            assistant,
            event.properties.reasoningID,
          );
          if (reasoningIndex < 0) return assistant;

          const reasoning = assistant.content[reasoningIndex];
          if (reasoning.type !== "reasoning") return assistant;

          const content = [...assistant.content];
          content[reasoningIndex] = {
            ...reasoning,
            text: event.properties.text,
          } satisfies SessionMessageAssistantReasoning;
          return { ...assistant, content };
        }),
      );
      break;

    case "session.next.tool.input.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        appendAssistantContent(items, {
          type: "tool",
          id: event.properties.callID,
          name: event.properties.name,
          time: {
            created: event.properties.timestamp,
          },
          state: {
            status: "pending",
            input: "",
          },
        }),
      );
      break;

    case "session.next.tool.input.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) =>
          updateLatestTool(assistant, event.properties.callID, (tool) => {
            if (tool.state.status !== "pending") return tool;
            return {
              ...tool,
              state: {
                ...tool.state,
                input: `${tool.state.input}${event.properties.delta}`,
              },
            };
          }),
        ),
      );
      break;

    case "session.next.tool.input.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) =>
          updateLatestTool(assistant, event.properties.callID, (tool) => {
            if (tool.state.status !== "pending") return tool;
            return {
              ...tool,
              state: {
                ...tool.state,
                input: event.properties.text,
              },
            };
          }),
        ),
      );
      break;

    case "session.next.tool.called":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) =>
          updateLatestTool(assistant, event.properties.callID, (tool) => ({
            ...tool,
            name: event.properties.tool,
            provider: event.properties.provider,
            time: {
              ...tool.time,
              ran: event.properties.timestamp,
            },
            state: {
              status: "running",
              input: event.properties.input,
              structured: {},
              content: [],
            },
          })),
        ),
      );
      break;

    case "session.next.tool.progress":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) =>
          updateLatestTool(assistant, event.properties.callID, (tool) => {
            if (tool.state.status !== "running") return tool;
            return {
              ...tool,
              state: {
                ...tool.state,
                structured: event.properties.structured,
                content: [...event.properties.content],
              },
            };
          }),
        ),
      );
      break;

    case "session.next.tool.success":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) =>
          updateLatestTool(assistant, event.properties.callID, (tool) => {
            const input =
              tool.state.status === "running" ||
              tool.state.status === "completed"
                ? tool.state.input
                : {};
            return {
              ...tool,
              provider: event.properties.provider,
              time: {
                ...tool.time,
                completed: event.properties.timestamp,
              },
              state: {
                status: "completed",
                input,
                structured: event.properties.structured,
                content: [...event.properties.content],
              },
            };
          }),
        ),
      );
      break;

    case "session.next.tool.failed":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        updateActiveAssistant(items, (assistant) =>
          updateLatestTool(assistant, event.properties.callID, (tool) => {
            const incoming = getErrorMessage(event.properties.error);
            const existing =
              tool.state.status === "error"
                ? getErrorMessage(tool.state.error)
                : null;
            if (existing && !isAbortNoise(existing) && isAbortNoise(incoming)) {
              return tool;
            }
            const input =
              tool.state.status === "running" ||
              tool.state.status === "completed" ||
              tool.state.status === "error"
                ? tool.state.input
                : {};
            const structured =
              tool.state.status === "running" ||
              tool.state.status === "completed" ||
              tool.state.status === "error"
                ? tool.state.structured
                : {};
            const content =
              tool.state.status === "running" ||
              tool.state.status === "completed" ||
              tool.state.status === "error"
                ? tool.state.content
                : [];
            return {
              ...tool,
              provider: event.properties.provider,
              time: {
                ...tool.time,
                completed: event.properties.timestamp,
              },
              state: {
                status: "error",
                input,
                structured,
                content,
                error: event.properties.error,
              },
            };
          }),
        ),
      );
      break;

    case "session.next.retried":
      revalidateMessages(port, provider, event.properties.sessionID);
      break;

    case "session.next.compaction.started":
      mutateMessages(port, provider, event.properties.sessionID, (items) =>
        upsertMessage(items, {
          id: event.id,
          type: "compaction",
          reason: event.properties.reason,
          summary: "",
          recent: "",
          time: {
            created: event.properties.timestamp,
          },
        }),
      );
      break;

    case "session.next.compaction.delta":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const index = findLastIndex(
          items,
          (item) => item.type === "compaction",
        );
        if (index < 0) return items;

        const compaction = items[index];
        if (compaction.type !== "compaction") return items;
        return replaceMessageAt(items, index, {
          ...compaction,
          summary: `${compaction.summary}${event.properties.text}`,
        });
      });
      break;

    case "session.next.compaction.ended":
      mutateMessages(port, provider, event.properties.sessionID, (items) => {
        const index = findLastIndex(
          items,
          (item) => item.type === "compaction",
        );
        if (index < 0) return items;

        const compaction = items[index];
        if (compaction.type !== "compaction") return items;
        return replaceMessageAt(items, index, {
          ...compaction,
          summary: event.properties.text,
          recent: event.properties.recent,
        });
      });
      break;

    case "message.updated": {
      const { sessionID, info } = event.properties;
      // User messages are rewritten from their parts, which this event does not
      // carry, so let a refetch own them. It fires ~3x per turn (opencode keeps
      // amending the prompt's summary), so it has to be the debounced path.
      if (info.role !== "assistant") {
        revalidateMessagesSoon(port, provider, sessionID);
        break;
      }
      mutateMessages(port, provider, sessionID, (items) =>
        upsertAssistantInfo(items, info),
      );
      break;
    }

    case "message.part.updated": {
      const { sessionID, part } = event.properties;
      const onMiss = () => revalidateMessagesSoon(port, provider, sessionID);
      mutateMessages(port, provider, sessionID, (items) =>
        upsertAssistantPart(items, part, onMiss),
      );
      break;
    }

    case "message.part.delta": {
      const { sessionID, messageID, partID, delta } = event.properties;
      const onMiss = () => revalidateMessagesSoon(port, provider, sessionID);
      if (typeof delta !== "string") {
        onMiss();
        break;
      }
      mutateMessages(port, provider, sessionID, (items) =>
        appendPartDelta(items, messageID, partID, delta, onMiss),
      );
      break;
    }

    case "message.removed":
    case "message.part.removed":
      revalidateMessagesNow(port, provider, event.properties.sessionID);
      break;

    case "session.compacted":
      revalidateMessages(port, provider, event.properties.sessionID);
      break;

    case "session.error": {
      const sessionID = event.properties.sessionID;
      if (!sessionID) break;

      // Errors end the turn. Clear the streaming gate first so the refetch
      // below is allowed through; otherwise the UI can drop the retry banner
      // and never paint the final failure.
      setStreaming(sessionID, false);
      mutateSessionStatuses(port, provider, (items) => ({
        ...items,
        [sessionID]: { type: "idle" },
      }));

      const errorName =
        event.properties.error &&
        typeof event.properties.error === "object" &&
        "name" in event.properties.error
          ? String((event.properties.error as { name?: unknown }).name ?? "")
          : "";
      const errorMessage = getErrorMessage(event.properties.error);

      if (errorMessage && errorName !== "MessageAbortedError") {
        mutateMessages(port, provider, sessionID, (items) => {
          const index = findLastIndex(
            items,
            (item) => item.type === "assistant",
          );
          if (index < 0) {
            return upsertMessage(items, {
              id: event.id,
              type: "assistant",
              agent: "build",
              model: {
                id: "",
                providerID: "",
                variant: "default",
              },
              content: [],
              finish: "error",
              error: { type: "unknown", message: errorMessage },
              time: {
                created: Date.now(),
                completed: Date.now(),
              },
            });
          }

          const assistant = items[index];
          if (assistant.type !== "assistant") return items;
          if (assistant.error) return items;
          return replaceMessageAt(items, index, {
            ...assistant,
            finish: assistant.finish ?? "error",
            error: { type: "unknown", message: errorMessage },
            time: {
              ...assistant.time,
              completed: assistant.time.completed ?? Date.now(),
            },
          });
        });
      }

      revalidateMessages(port, provider, sessionID);

      const parentID = parentSessionID(port, provider, sessionID);
      if (
        parentID &&
        errorMessage &&
        errorName !== "MessageAbortedError" &&
        !isAbortNoise(errorMessage)
      ) {
        failParentTask(port, provider, parentID, sessionID, errorMessage);
      }
      break;
    }

    case "permission.asked":
      mutatePermissions(port, provider, (items) =>
        upsertById(items, event.properties),
      );
      break;

    case "permission.replied":
      mutatePermissions(port, provider, (items) =>
        removeById(items, event.properties.requestID),
      );
      break;

    case "question.asked":
      mutateQuestions(port, provider, (items) =>
        upsertById(items, event.properties),
      );
      break;

    case "question.replied":
    case "question.rejected":
      mutateQuestions(port, provider, (items) =>
        removeById(items, event.properties.requestID),
      );
      break;

    case "project.updated":
      void mutate(currentProjectKey(port, provider));
      break;
  }
}

function parseEvent(data: string): RuntimeEvent | null {
  try {
    return JSON.parse(data) as RuntimeEvent;
  } catch {
    return null;
  }
}

export function useOpencodeEvents(
  port: number | null | undefined,
  provider?: BackendProvider,
) {
  const queueRef = useRef<RuntimeEvent[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!port) return;

    const flush = () => {
      timerRef.current = null;
      const events = queueRef.current;
      queueRef.current = [];
      for (const event of events) {
        applyEvent(port, provider, event);
      }
    };

    const enqueue = (event: RuntimeEvent) => {
      queueRef.current.push(event);
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(flush, 16);
    };

    const source = new EventSource(`${backendBasePath(provider, port)}/events`);

    source.onmessage = (message) => {
      const event = parseEvent(message.data);
      if (event) enqueue(event);
    };

    return () => {
      source.close();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      queueRef.current = [];
    };
  }, [port, provider]);
}
