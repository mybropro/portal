import { z } from "zod/v4";
import { defineHandler, HTTPError } from "nitro/h3";
import { getOpencodeClientForDirectory } from "../../../../lib/opencode-client";
import { parsePort, parseRouteParam, parseBody } from "../../../../lib/validation";

const archiveSessionSchema = z.object({
  directory: z.string().optional(),
  archived: z.boolean().default(true),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, archiveSessionSchema);
  const client = getOpencodeClientForDirectory(port, body.directory);

  const result = await client.session.update({
    sessionID: id,
    time: body.archived ? { archived: Date.now() } : undefined,
  });
  if (result.error) {
    throw new HTTPError("Failed to archive session", { status: 502 });
  }

  return result.data;
});
