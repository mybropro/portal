import { z } from "zod/v4";
import { defineHandler, HTTPError } from "nitro/h3";
import { getOpencodeClientForDirectory } from "../../../../lib/opencode-client";
import { parsePort, parseRouteParam, parseBody } from "../../../../lib/validation";

const permissionReplySchema = z.object({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().optional(),
  directory: z.string().optional(),
});

type PermissionRow = {
  id: string;
  permission?: string;
  patterns?: string[];
};

function sameAsk(a: PermissionRow, b: PermissionRow) {
  if (a.permission !== b.permission) return false;
  const left = [...(a.patterns ?? [])].sort();
  const right = [...(b.patterns ?? [])].sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

export default defineHandler(async (event) => {
  const port = parsePort(event);
  const requestId = parseRouteParam(event, "requestId");
  const body = await parseBody(event, permissionReplySchema);
  const client = getOpencodeClientForDirectory(port, body.directory);

  const listed = await client.permission.list();
  if (listed.error) {
    throw new HTTPError("Failed to list permission requests", { status: 502 });
  }
  const pending = (listed.data ?? []) as PermissionRow[];
  const target = pending.find((item) => item.id === requestId);
  if (!target) {
    throw new HTTPError("Permission request not found", { status: 404 });
  }

  const siblings =
    body.reply === "reject"
      ? []
      : pending.filter((item) => item.id !== requestId && sameAsk(item, target));

  const result = await client.permission.reply({
    requestID: requestId,
    reply: body.reply,
    message: body.message,
    directory: body.directory,
  });
  if (result.error) {
    throw new HTTPError("Failed to reply to permission request", { status: 502 });
  }

  const cleared = [requestId];
  for (const sibling of siblings) {
    const extra = await client.permission.reply({
      requestID: sibling.id,
      reply: body.reply,
      directory: body.directory,
    });
    if (!extra.error) cleared.push(sibling.id);
  }

  return { ok: true, cleared };
});
