import { z } from "zod/v4";
import { defineHandler } from "nitro/h3";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getOpencodeBaseUrl, getOpencodeClient } from "../../../lib/opencode-client";
import { parsePort, parseBody } from "../../../lib/validation";

const createSessionSchema = z.object({
  title: z.string().optional(),
  parentID: z.string().optional(),
  directory: z.string().optional(),
});

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const body = await parseBody(event, createSessionSchema);

  // When a directory is chosen, bind the session to it via the
  // x-opencode-directory header (set by createOpencodeClient's `directory`).
  // Otherwise reuse the cached client (session inherits the backend cwd).
  const client = body.directory
    ? createOpencodeClient({
        baseUrl: getOpencodeBaseUrl(port),
        directory: body.directory,
      })
    : getOpencodeClient(port);

  const session = await client.session.create({
    title: body.title,
    parentID: body.parentID,
  });

  return session.data;
});
