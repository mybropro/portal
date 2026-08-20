import { defineHandler, getQuery } from "nitro/h3";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getOpencodeBaseUrl, getOpencodeClient } from "../../lib/opencode-client";
import { parsePort } from "../../lib/validation";

type PermissionRow = { id: string };

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const q = getQuery(event);

  const raw = typeof q.dirs === "string" ? q.dirs : "";
  const extraDirs = raw
    .split(",")
    .map((d) => decodeURIComponent(d).trim())
    .filter(Boolean);

  const baseUrl = getOpencodeBaseUrl(port);
  const safeList = (p: Promise<{ data?: PermissionRow[]; error?: unknown }>) =>
    p.then((r) => (r.error ? [] : (r.data ?? []))).catch(() => [] as PermissionRow[]);

  const lists = await Promise.all([
    safeList(getOpencodeClient(port).permission.list()),
    ...extraDirs.map((directory) =>
      safeList(createOpencodeClient({ baseUrl, directory }).permission.list()),
    ),
  ]);

  const byId = new Map<string, PermissionRow>();
  for (const list of lists) {
    for (const item of list) byId.set(item.id, item);
  }
  return Array.from(byId.values());
});
