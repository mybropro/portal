import { defineHandler, getQuery } from "nitro/h3";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import {
  getOpencodeBaseUrl,
  getOpencodeClient,
} from "../../../lib/opencode-client";
import { parsePort } from "../../../lib/validation";

type Statuses = Record<string, unknown>;

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const q = getQuery(event);

  // Same directory scoping as /sessions: session.status() only reports on one
  // working directory, so a session started elsewhere via the picker always
  // reads as idle. This endpoint polls once a second while anything is working,
  // so leaving it unscoped also kept overwriting the live status from events.
  const raw = typeof q.dirs === "string" ? q.dirs : "";
  const extraDirs = raw
    .split(",")
    .map((d) => decodeURIComponent(d).trim())
    .filter(Boolean);

  const baseUrl = getOpencodeBaseUrl(port);
  const safeStatus = (p: Promise<{ data?: Statuses }>) =>
    p.then((r) => r.data ?? {}).catch(() => ({}) as Statuses);

  const results = await Promise.all([
    safeStatus(getOpencodeClient(port).session.status()),
    ...extraDirs.map((directory) =>
      safeStatus(createOpencodeClient({ baseUrl, directory }).session.status()),
    ),
  ]);

  return Object.assign({}, ...results) as Statuses;
});
