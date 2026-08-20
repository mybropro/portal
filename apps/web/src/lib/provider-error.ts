export function isUnrecoverableProviderError(message: string | null | undefined) {
  if (!message) return false;
  return (
    message.includes("No available provider for model") ||
    message.includes("Model not found:")
  );
}

export function isAbortNoise(message: string | null | undefined) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower === "task cancelled" ||
    lower.includes("task cancelled") ||
    lower.includes("messageaborted") ||
    lower === "aborted"
  );
}
