import { defineHandler, getQuery, setResponseHeader, HTTPError } from "nitro/h3";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, resolve } from "node:path";

// Serve a file from disk so the chat can show artifacts the agent produced
// (generated images, PDFs, etc.). Read-only, scoped to the user's home tree,
// symlinks resolved before the boundary check. 25 MB cap.
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
const MAX_BYTES = 25 * 1024 * 1024;

export default defineHandler(async (event) => {
  const q = getQuery(event);
  const requested = typeof q.path === "string" ? q.path : "";
  if (!requested || !isAbsolute(requested)) {
    throw new HTTPError("Absolute file path required", { status: 400 });
  }

  const home = await realpath(homedir());
  const real = await realpath(resolve(requested)).catch(() => null);
  if (!real || (real !== home && !real.startsWith(home + "/"))) {
    throw new HTTPError("Path outside allowed root", { status: 403 });
  }

  const info = await stat(real).catch(() => null);
  if (!info || !info.isFile()) {
    throw new HTTPError("Not a file", { status: 404 });
  }
  if (info.size > MAX_BYTES) {
    throw new HTTPError("File too large to preview", { status: 413 });
  }

  const buf = await readFile(real);
  const mime = MIME[extname(real).toLowerCase()] ?? "application/octet-stream";
  setResponseHeader(event, "Content-Type", mime);
  setResponseHeader(event, "Cache-Control", "private, max-age=60");
  if (q.download) {
    setResponseHeader(
      event,
      "Content-Disposition",
      `attachment; filename="${basename(real).replace(/"/g, "")}"`,
    );
  }
  return buf;
});
