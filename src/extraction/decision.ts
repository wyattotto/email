import { BillExtraction } from "./types";

export type Action =
  | { kind: "skip" } // not a bill
  | { kind: "needs_review"; reason: string } // a bill, but too uncertain / missing data to auto-enter
  | { kind: "create_bill" };

/**
 * Pure decision function: given an extraction result and the configured
 * confidence threshold, decide what to do. Kept separate from the Claude
 * call and the QuickBooks call so it's cheaply unit-testable.
 */
export function decideAction(extraction: BillExtraction, confidenceThreshold: number): Action {
  if (!extraction.isBill) {
    return { kind: "skip" };
  }
  if (extraction.confidence < confidenceThreshold) {
    return { kind: "needs_review", reason: `confidence ${extraction.confidence} below threshold` };
  }
  if (!extraction.vendorName) {
    return { kind: "needs_review", reason: "missing vendor name" };
  }
  if (extraction.amount === null || extraction.amount === undefined || extraction.amount <= 0) {
    return { kind: "needs_review", reason: "missing or invalid amount" };
  }
  return { kind: "create_bill" };
}
