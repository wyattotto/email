/**
 * Composes the Gmail search query used by the scan job from the configured
 * base query plus optional sender allow/block lists. Kept pure and separate
 * from GmailClient so it's cheaply unit-testable.
 */
export function buildSearchQuery(baseQuery: string, allowlist: string[], blocklist: string[]): string {
  const parts = [baseQuery.trim()].filter(Boolean);

  if (allowlist.length > 0) {
    parts.push("(" + allowlist.map((sender) => `from:${sender}`).join(" OR ") + ")");
  }
  for (const sender of blocklist) {
    parts.push(`-from:${sender}`);
  }

  return parts.join(" ");
}
