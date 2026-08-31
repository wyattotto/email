import { config } from "./config";
import { GmailClient } from "./gmail/client";
import { classifyEmail } from "./extraction/classify";
import { decideAction } from "./extraction/decision";
import { createQboClient, findOrCreateVendor, resolveExpenseAccount, createBill } from "./quickbooks/client";
import { Store } from "./db/store";
import { logger } from "./util/logger";

async function run(): Promise<void> {
  const gmail = new GmailClient();
  const store = new Store();

  const summary = { scanned: 0, skippedAlreadyProcessed: 0, created: 0, needsReview: 0, notBills: 0, errors: 0 };

  try {
    const messageIds = await gmail.listCandidateMessageIds(config.gmail.query);
    logger.info(`Found ${messageIds.length} candidate email(s) matching query: ${config.gmail.query}`);

    for (const messageId of messageIds) {
      summary.scanned++;
      if (store.isProcessed(messageId)) {
        summary.skippedAlreadyProcessed++;
        continue;
      }

      try {
        await processMessage(messageId, gmail, store, summary);
      } catch (err) {
        summary.errors++;
        logger.error(`Failed to process message ${messageId}:`, err);
        store.markProcessed({
          messageId,
          status: "error",
          vendor: null,
          amount: null,
          qboBillId: null,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    store.close();
  }

  logger.info("Run summary:", summary);
}

async function processMessage(
  messageId: string,
  gmail: GmailClient,
  store: Store,
  summary: Record<string, number>
): Promise<void> {
  const email = await gmail.getCandidateEmail(messageId);
  logger.info(`Classifying "${email.subject}" from ${email.from}`);

  const extraction = await classifyEmail(email, gmail);
  const action = decideAction(extraction, config.confidenceThreshold);

  if (action.kind === "skip") {
    summary.notBills++;
    store.markProcessed({
      messageId,
      status: "not_a_bill",
      vendor: null,
      amount: null,
      qboBillId: null,
      detail: null,
    });
    return;
  }

  if (action.kind === "needs_review") {
    summary.needsReview++;
    logger.info(`Needs review (${action.reason}): "${email.subject}"`);
    await gmail.applyLabel(messageId, config.gmail.needsReviewLabel);
    store.markProcessed({
      messageId,
      status: "needs_review",
      vendor: extraction.vendorName,
      amount: extraction.amount,
      qboBillId: null,
      detail: action.reason,
    });
    return;
  }

  // action.kind === "create_bill"
  const qbo = await createQboClient();
  const vendor = await findOrCreateVendor(qbo, extraction.vendorName!);
  const account = await resolveExpenseAccount(qbo, extraction.suggestedExpenseCategory);

  const bill = await createBill(qbo, {
    vendor,
    account,
    amount: extraction.amount!,
    txnDate: extraction.issueDate ?? undefined,
    dueDate: extraction.dueDate ?? undefined,
    docNumber: extraction.invoiceNumber ?? undefined,
    memo: extraction.memo ?? email.subject,
  });

  summary.created++;
  logger.info(
    `Created QuickBooks bill ${bill.Id} for ${vendor.name}: ${extraction.currency ?? "USD"} ${extraction.amount}`
  );
  await gmail.applyLabel(messageId, config.gmail.processedLabel);
  store.markProcessed({
    messageId,
    status: "created",
    vendor: vendor.name,
    amount: extraction.amount,
    qboBillId: bill.Id,
    detail: null,
  });
}

run().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
