import { describe, it, expect } from "vitest";
import { buildSearchQuery } from "../src/gmail/query";

describe("buildSearchQuery", () => {
  const base = "in:inbox -label:bill-scanned newer_than:30d";

  it("returns the base query unchanged when no blocklist is set", () => {
    expect(buildSearchQuery(base, [])).toBe(base);
  });

  it("appends -from: terms for each blocked sender", () => {
    const query = buildSearchQuery(base, ["noisy@example.com", "spammy.com"]);
    expect(query).toBe(`${base} -from:noisy@example.com -from:spammy.com`);
  });
});
