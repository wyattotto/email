import { describe, it, expect } from "vitest";
import { decideAction } from "../src/extraction/decision";
import { BillExtraction } from "../src/extraction/types";

function baseExtraction(overrides: Partial<BillExtraction> = {}): BillExtraction {
  return {
    isBill: true,
    confidence: 0.9,
    vendorName: "Comcast",
    amount: 120.5,
    currency: "USD",
    dueDate: "2026-09-15",
    issueDate: "2026-08-20",
    invoiceNumber: "INV-1",
    suggestedExpenseCategory: "Utilities",
    memo: "Comcast internet",
    ...overrides,
  };
}

describe("decideAction", () => {
  it("skips non-bill emails", () => {
    const result = decideAction(baseExtraction({ isBill: false }), 0.75);
    expect(result.kind).toBe("skip");
  });

  it("creates a bill when confident and complete", () => {
    const result = decideAction(baseExtraction(), 0.75);
    expect(result.kind).toBe("create_bill");
  });

  it("flags low-confidence bills for review instead of auto-creating", () => {
    const result = decideAction(baseExtraction({ confidence: 0.4 }), 0.75);
    expect(result.kind).toBe("needs_review");
  });

  it("flags bills missing a vendor name for review", () => {
    const result = decideAction(baseExtraction({ vendorName: null }), 0.75);
    expect(result.kind).toBe("needs_review");
  });

  it("flags bills with a zero or missing amount for review", () => {
    expect(decideAction(baseExtraction({ amount: null }), 0.75).kind).toBe("needs_review");
    expect(decideAction(baseExtraction({ amount: 0 }), 0.75).kind).toBe("needs_review");
  });
});
