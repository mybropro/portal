import { create } from "zustand";
import type { Attachment } from "@/hooks/use-attachments";
import type { BackendProvider } from "@/lib/backend-url";

const OUTBOX_KEY = "portal-outbox-v1";

export interface QueuedMessage {
  /** Client-generated message id, used for optimistic rendering. */
  id: string;
  sessionId: string;
  text: string;
  files: Attachment[];
  /** Session-agent override to apply when flushed. */
  agent?: string;
  createdAt: number;
}

function readOutbox(): QueuedMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedMessage[]) : [];
  } catch {
    return [];
  }
}

interface OutboxState {
  messages: QueuedMessage[];
  /** True while a flush is in flight so we don't double-send. */
  flushing: boolean;
  enqueue: (message: QueuedMessage) => void;
  remove: (id: string) => void;
  clearForSession: (sessionId: string) => void;
  setFlushing: (value: boolean) => void;
}

function persist(messages: QueuedMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(messages));
  } catch {
    // ignore quota / privacy-mode failures
  }
}

export const useOutboxStore = create<OutboxState>()((set, get) => ({
  messages: readOutbox(),
  flushing: false,
  enqueue: (message) => {
    const messages = [...get().messages, message];
    persist(messages);
    set({ messages });
  },
  remove: (id) => {
    const messages = get().messages.filter((message) => message.id !== id);
    persist(messages);
    set({ messages });
  },
  clearForSession: (sessionId) => {
    const messages = get().messages.filter(
      (message) => message.sessionId !== sessionId,
    );
    persist(messages);
    set({ messages });
  },
  setFlushing: (value) => set({ flushing: value }),
}));
