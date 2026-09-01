import { BillExtraction } from "./types";

export type Action = { kind: "skip" } | { kind: "review" };

/**
 * Pure decision function: does this email even belong in the review queue?
 * Everything that looks like a bill goes to the human for approval — this
 * only filters out things Claude is confident are *not* bills at all, so
 * the queue isn't flooded with newsletters and receipts.
 */
export function decideAction(extraction: BillExtraction): Action {
  return extraction.isBill ? { kind: "review" } : { kind: "skip" };
}

/** Whether a bill's extraction is uncertain enough to flag for extra scrutiny in the review UI. */
export function isLowConfidence(extraction: BillExtraction, confidenceThreshold: number): boolean {
  return (
    extraction.confidence < confidenceThreshold ||
    !extraction.vendorName ||
    extraction.amount === null ||
    extraction.amount === undefined ||
    extraction.amount <= 0
  );
}
