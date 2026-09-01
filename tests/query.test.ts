import { describe, it, expect } from "vitest";
import { buildSearchQuery } from "../src/gmail/query";

describe("buildSearchQuery", () => {
  const base = "in:inbox -label:bill-scanned newer_than:30d";

  it("returns the base query unchanged when no allow/block list is set", () => {
    expect(buildSearchQuery(base, [], [])).toBe(base);
  });

  it("appends -from: terms for each blocked sender", () => {
    const query = buildSearchQuery(base, [], ["noisy@example.com", "spammy.com"]);
    expect(query).toBe(`${base} -from:noisy@example.com -from:spammy.com`);
  });

  it("restricts to an OR'd from: group when an allowlist is set", () => {
    const query = buildSearchQuery(base, ["billing@vendor.com", "invoices@other.com"], []);
    expect(query).toBe(`${base} (from:billing@vendor.com OR from:invoices@other.com)`);
  });

  it("combines an allowlist and a blocklist", () => {
    const query = buildSearchQuery(base, ["billing@vendor.com"], ["noisy@example.com"]);
    expect(query).toBe(`${base} (from:billing@vendor.com) -from:noisy@example.com`);
  });
});
