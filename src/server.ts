import express, { Request, Response, NextFunction } from "express";
import { config } from "./config";
import { Store, ApprovedFields } from "./db/store";
import { GmailClient } from "./gmail/client";
import { createQboClient, findOrCreateVendor, resolveExpenseAccount, createBill } from "./quickbooks/client";
import { renderPendingList, renderHistoryList, renderBillDetail } from "./server/views";
import { logger } from "./util/logger";

const store = new Store();
const gmail = new GmailClient();
const app = express();
app.use(express.urlencoded({ extended: false }));

// Keeps the review server alive if a request handler rejects — otherwise an
// uncaught async error (e.g. a flaky Gmail/QuickBooks call) would crash the
// whole process and take down the review queue with it.
function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

// Gmail labeling is a nice-to-have mirror of state that already lives in the
// local DB. A label API hiccup should never block or fail an approve/reject
// that already succeeded, so it's logged rather than surfaced to the user.
async function syncGmailLabels(messageId: string, addLabel: string, removeLabel: string): Promise<void> {
  try {
    await gmail.removeLabel(messageId, removeLabel);
    await gmail.applyLabel(messageId, addLabel);
  } catch (err) {
    logger.warn(`Failed to update Gmail labels for ${messageId} (state was still saved locally):`, err);
  }
}

app.get("/", (_req, res) => {
  res.send(renderPendingList(store.listByStatus("pending_approval")));
});

app.get("/history", (_req, res) => {
  res.send(renderHistoryList(store.listByStatus(["approved", "rejected"])));
});

app.get("/bills/:id", (req, res) => {
  const bill = store.getBill(Number(req.params.id));
  if (!bill) return res.status(404).send("Not found");
  res.send(renderBillDetail(bill, store.getAttachments(bill.id)));
});

app.get("/attachments/:id", (req, res) => {
  const attachment = store.getAttachment(Number(req.params.id));
  if (!attachment) return res.status(404).send("Not found");
  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${attachment.filename.replace(/"/g, "")}"`);
  res.send(attachment.data);
});

app.post(
  "/bills/:id/approve",
  asyncRoute(async (req, res) => {
    const bill = store.getBill(Number(req.params.id));
    if (!bill) return void res.status(404).send("Not found");
    if (bill.status !== "pending_approval") return void res.redirect(`/bills/${bill.id}`);

    const fields: ApprovedFields = {
      vendorName: String(req.body.vendorName ?? "").trim(),
      amount: parseFloat(req.body.amount),
      currency: (req.body.currency || "USD").trim() || null,
      dueDate: req.body.dueDate || null,
      issueDate: req.body.issueDate || null,
      invoiceNumber: req.body.invoiceNumber || null,
      suggestedExpenseCategory: req.body.suggestedExpenseCategory || null,
      memo: req.body.memo || null,
    };

    if (!fields.vendorName || !Number.isFinite(fields.amount) || fields.amount <= 0) {
      res
        .status(400)
        .send(renderBillDetail(bill, store.getAttachments(bill.id), "Vendor and a positive amount are required."));
      return;
    }

    try {
      const qbo = await createQboClient();
      const vendor = await findOrCreateVendor(qbo, fields.vendorName);
      const account = await resolveExpenseAccount(qbo, fields.suggestedExpenseCategory);
      const created = await createBill(qbo, {
        vendor,
        account,
        amount: fields.amount,
        txnDate: fields.issueDate ?? undefined,
        dueDate: fields.dueDate ?? undefined,
        docNumber: fields.invoiceNumber ?? undefined,
        memo: fields.memo ?? bill.subject,
      });

      store.markApproved(bill.id, fields, created.Id);
      logger.info(`Approved bill ${bill.id} -> QuickBooks bill ${created.Id}`);
      await syncGmailLabels(bill.messageId, config.gmail.approvedLabel, config.gmail.pendingLabel);
      res.redirect("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to create QuickBooks bill for ${bill.id}:`, err);
      res.status(502).send(renderBillDetail(bill, store.getAttachments(bill.id), `QuickBooks error: ${message}`));
    }
  })
);

app.post(
  "/bills/:id/reject",
  asyncRoute(async (req, res) => {
    const bill = store.getBill(Number(req.params.id));
    if (!bill) return void res.status(404).send("Not found");
    if (bill.status !== "pending_approval") return void res.redirect(`/bills/${bill.id}`);

    store.markRejected(bill.id);
    logger.info(`Rejected bill ${bill.id}`);
    await syncGmailLabels(bill.messageId, config.gmail.rejectedLabel, config.gmail.pendingLabel);
    res.redirect("/");
  })
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled request error:", err);
  res.status(500).send("Something went wrong. Check the server log.");
});

app.listen(config.server.port, config.server.host, () => {
  logger.info(`Bill review UI listening on http://${config.server.host}:${config.server.port}`);
});
