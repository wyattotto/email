/**
 * Composes the Gmail search query used by the scan job from the configured
 * base query plus an optional sender blocklist. Kept pure and separate from
 * GmailClient so it's cheaply unit-testable.
 */
export function buildSearchQuery(baseQuery: string, blocklist: string[]): string {
  const parts = [baseQuery.trim()].filter(Boolean);
  for (const sender of blocklist) {
    parts.push(`-from:${sender}`);
  }
  return parts.join(" ");
}
