import { describe, it, expect } from "vitest";
import { decideAction, isLowConfidence } from "../src/extraction/decision";
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
  it("skips non-bill emails so they never reach the review queue", () => {
    expect(decideAction(baseExtraction({ isBill: false })).kind).toBe("skip");
  });

  it("sends bills to review regardless of confidence", () => {
    expect(decideAction(baseExtraction()).kind).toBe("review");
    expect(decideAction(baseExtraction({ confidence: 0.1 })).kind).toBe("review");
  });
});

describe("isLowConfidence", () => {
  it("is false for a confident, complete extraction", () => {
    expect(isLowConfidence(baseExtraction(), 0.75)).toBe(false);
  });

  it("is true when confidence is below the threshold", () => {
    expect(isLowConfidence(baseExtraction({ confidence: 0.4 }), 0.75)).toBe(true);
  });

  it("is true when the vendor name is missing", () => {
    expect(isLowConfidence(baseExtraction({ vendorName: null }), 0.75)).toBe(true);
  });

  it("is true when the amount is missing or non-positive", () => {
    expect(isLowConfidence(baseExtraction({ amount: null }), 0.75)).toBe(true);
    expect(isLowConfidence(baseExtraction({ amount: 0 }), 0.75)).toBe(true);
  });
});
