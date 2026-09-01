import { config } from "./config";
import { GmailClient, CandidateEmail } from "./gmail/client";
import { buildSearchQuery } from "./gmail/query";
import { classifyEmail } from "./extraction/classify";
import { decideAction } from "./extraction/decision";
import { Store } from "./db/store";
import { logger } from "./util/logger";
import { BillExtraction } from "./extraction/types";

async function run(): Promise<void> {
  const gmail = new GmailClient();
  const store = new Store();

  const summary = { scanned: 0, alreadySeen: 0, notBills: 0, pendingApproval: 0, errors: 0 };

  try {
    const query = buildSearchQuery(config.gmail.query, config.gmail.senderAllowlist, config.gmail.senderBlocklist);
    const messageIds = await gmail.listCandidateMessageIds(query);
    logger.info(`Found ${messageIds.length} candidate email(s) matching query: ${query}`);

    for (const messageId of messageIds) {
      summary.scanned++;
      if (store.isProcessed(messageId)) {
        summary.alreadySeen++;
        continue;
      }

      let email: CandidateEmail | undefined;
      let extraction: BillExtraction | undefined;
      try {
        email = await gmail.getCandidateEmail(messageId);
        logger.info(`Classifying "${email.subject}" from ${email.from}`);

        const attachments = await gmail.fetchAttachments(email);
        extraction = await classifyEmail(email, attachments);
        const action = decideAction(extraction);

        if (action.kind === "skip") {
          store.insertScanResult(email, extraction, "not_a_bill", []);
          summary.notBills++;
        } else {
          store.insertScanResult(email, extraction, "pending_approval", attachments);
          await gmail.applyLabel(messageId, config.gmail.pendingLabel);
          summary.pendingApproval++;
          logger.info(`Queued for review: "${email.subject}" (confidence ${extraction.confidence})`);
        }
        await gmail.applyLabel(messageId, config.gmail.scannedLabel);
      } catch (err) {
        summary.errors++;
        const detail = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to process message ${messageId}:`, err);
        if (email) store.markError(email, extraction ?? null, detail);
      }
    }
  } finally {
    store.close();
  }

  logger.info("Scan summary:", summary);
  if (summary.pendingApproval > 0) {
    logger.info(`${summary.pendingApproval} bill(s) waiting for approval — run "npm run serve" to review them.`);
  }
}

run().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
