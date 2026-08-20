import { z } from "zod/v4";
import { defineHandler } from "nitro/h3";
import { getOpencodeClientForDirectory } from "../../../lib/opencode-client";
import { parsePort, parseBody } from "../../../lib/validation";

const archiveSessionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string().min(1),
      directory: z.string().optional(),
    }),
  ),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const body = await parseBody(event, archiveSessionsSchema);
  const archivedAt = Date.now();

  const results = await Promise.all(
    body.sessions.map(async (session) => {
      const client = getOpencodeClientForDirectory(port, session.directory);
      const result = await client.session.update({
        sessionID: session.id,
        time: { archived: archivedAt },
      });
      return { id: session.id, ok: !result.error };
    }),
  );

  return {
    archived: results.filter((item) => item.ok).map((item) => item.id),
    failed: results.filter((item) => !item.ok).map((item) => item.id),
  };
});
