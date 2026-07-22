export type BackendProvider = "opencode" | "codex" | "claude";

// Portal talks to a single opencode server. Configure its port here (or via the
// VITE_OPENCODE_PORT build env). There is no instance/provider selection.
export const OPENCODE_PORT = Number(import.meta.env.VITE_OPENCODE_PORT) || 4000;
export const OPENCODE_PROVIDER: BackendProvider = "opencode";
export const OPENCODE_BASE_PATH = `/api/opencode/${OPENCODE_PORT}`;

export function normalizeProvider(provider: unknown): BackendProvider {
  if (provider === "claude") return "claude";
  return provider === "codex" ? "codex" : "opencode";
}

export function backendBasePath(
  provider: BackendProvider | undefined,
  port: number,
) {
  return `/api/${normalizeProvider(provider)}/${port}`;
}
