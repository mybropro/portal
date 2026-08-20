import { defineHandler, getQuery } from "nitro/h3";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getOpencodeBaseUrl, getOpencodeClient } from "../../../lib/opencode-client";
import { parsePort } from "../../../lib/validation";

type SessionRow = { id: string; time?: { updated?: number; archived?: number } };

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const q = getQuery(event);

  // Extra working directories the UI knows about (the picker's recents).
  // opencode scopes session.list() to one directory, so without these the
  // sidebar only shows sessions from the backend's default (home) dir.
  const raw = typeof q.dirs === "string" ? q.dirs : "";
  const extraDirs = raw
    .split(",")
    .map((d) => decodeURIComponent(d).trim())
    .filter(Boolean);

  const baseUrl = getOpencodeBaseUrl(port);
  const safeList = (p: Promise<{ data?: SessionRow[] }>) =>
    p.then((r) => r.data ?? []).catch(() => [] as SessionRow[]);

  const lists = await Promise.all([
    safeList(getOpencodeClient(port).session.list()),
    ...extraDirs.map((directory) =>
      safeList(createOpencodeClient({ baseUrl, directory }).session.list()),
    ),
  ]);

  // Merge + dedupe by id, newest first. Archived sessions stay out of the UI.
  const byId = new Map<string, SessionRow>();
  for (const list of lists) {
    for (const s of list) byId.set(s.id, s);
  }
  return Array.from(byId.values())
    .filter((s) => !s.time?.archived)
    .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
});
