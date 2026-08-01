import { z } from "zod/v4";
import { HTTPError, defineHandler } from "nitro/h3";
import { formatErrorMessage } from "@/lib/error-message";
import { getOpencodeClient } from "../../../../lib/opencode-client";
import {
  parsePort,
  parseRouteParam,
  parseBody,
} from "../../../../lib/validation";

const PROMPT_DEDUPE_TTL_MS = 2 * 60 * 1000;
const recentPromptRequests = new Map<string, number>();

// opencode takes attachments as file parts whose url carries the payload: a
// data: URL holds the bytes inline (images go to the model, text/plain is
// decoded and inlined), and a file: URL is read off disk. No upload endpoint
// is involved either way.
const attachmentSchema = z.object({
  mime: z.string().min(1),
  filename: z.string().optional(),
  url: z.string().min(1),
});

const promptBodySchema = z
  .object({
    messageID: z.string().optional(),
    text: z.string(),
    files: z.array(attachmentSchema).optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
        variant: z.string().optional(),
      })
      .optional(),
    agent: z.string().optional(),
  })
  // An attachment on its own is a legitimate message; empty everything is not.
  .refine((body) => body.text.trim().length > 0 || body.files?.length, {
    message: "A message needs text or at least one attachment",
    path: ["text"],
  });

function prunePromptRequests(now: number) {
  for (const [key, expiresAt] of recentPromptRequests) {
    if (expiresAt <= now) {
      recentPromptRequests.delete(key);
    }
  }
}

function claimPromptRequest(key: string) {
  const now = Date.now();
  prunePromptRequests(now);

  const expiresAt = recentPromptRequests.get(key);
  if (expiresAt && expiresAt > now) {
    return false;
  }

  recentPromptRequests.set(key, now + PROMPT_DEDUPE_TTL_MS);
  return true;
}

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const id = parseRouteParam(event, "id");
  const body = await parseBody(event, promptBodySchema);
  const requestKey = body.messageID
    ? `${port}:${id}:${body.messageID}`
    : undefined;

  if (requestKey && !claimPromptRequest(requestKey)) {
    return {
      accepted: true,
      duplicate: true,
      mode: "legacy",
      messageID: body.messageID,
    };
  }

  const client = getOpencodeClient(port);
  try {
    // Attachments lead, matching how opencode's own clients order them: the
    // text reads as a caption on what came before it.
    const fileParts = (body.files ?? []).map((file) => ({
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: file.url,
    }));
    const textParts = body.text.trim()
      ? [{ type: "text" as const, text: body.text }]
      : [];

    const promptInput = {
      sessionID: id,
      messageID: body.messageID,
      parts: [...fileParts, ...textParts],
      model: body.model
        ? {
            providerID: body.model.providerID,
            modelID: body.model.modelID,
          }
        : undefined,
      variant: body.model?.variant,
      agent: body.agent,
    };

    await client.session.promptAsync(promptInput);
  } catch (error) {
    if (requestKey) {
      recentPromptRequests.delete(requestKey);
    }
    throw new HTTPError(formatErrorMessage(error, "Failed to send message"), {
      status: 500,
    });
  }

  return {
    accepted: true,
    mode: "legacy",
    messageID: body.messageID,
  };
});
