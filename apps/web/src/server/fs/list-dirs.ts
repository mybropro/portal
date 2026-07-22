import { defineHandler, getQuery } from "nitro/h3";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/**
 * List immediate subdirectories of a path so the UI can browse the filesystem
 * and pick a working directory for a new session. Read-only; hidden dirs and
 * unreadable entries are skipped.
 */
export default defineHandler(async (event) => {
  const q = getQuery(event);
  const home = homedir();
  const requested = typeof q.directory === "string" ? q.directory : "";
  const base = requested && isAbsolute(requested) ? resolve(requested) : home;

  let dirs: Array<{ name: string; path: string }> = [];
  let error: string | undefined;
  try {
    const entries = await readdir(base, { withFileTypes: true });
    dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: join(base, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to read directory";
  }

  const parent = base === "/" ? null : resolve(base, "..");
  return { path: base, parent, home, dirs, error };
});
