export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [value.message, value.details, value.hint].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
    if (parts.length) return [...new Set(parts)].join(" · ");
  }
  return fallback;
}
