import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { config } from "../config";
import { CandidateEmail, FetchedAttachment } from "../gmail/client";
import { BillExtraction } from "../extraction/types";

export type BillStatus = "pending_approval" | "not_a_bill" | "approved" | "rejected" | "error";

export interface BillRow {
  id: number;
  messageId: string;
  threadId: string;
  subject: string;
  fromAddress: string;
  emailDate: string;
  bodyText: string;
  status: BillStatus;
  isBill: boolean;
  confidence: number;
  vendorName: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  issueDate: string | null;
  invoiceNumber: string | null;
  suggestedExpenseCategory: string | null;
  memo: string | null;
  qboBillId: string | null;
  errorDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentRow {
  id: number;
  billId: number;
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface ApprovedFields {
  vendorName: string;
  amount: number;
  currency: string | null;
  dueDate: string | null;
  issueDate: string | null;
  invoiceNumber: string | null;
  suggestedExpenseCategory: string | null;
  memo: string | null;
}

const columns = `
  id, message_id AS messageId, thread_id AS threadId, subject, from_address AS fromAddress,
  email_date AS emailDate, body_text AS bodyText, status, is_bill AS isBill, confidence,
  vendor_name AS vendorName, amount, currency, due_date AS dueDate, issue_date AS issueDate,
  invoice_number AS invoiceNumber, suggested_expense_category AS suggestedExpenseCategory,
  memo, qbo_bill_id AS qboBillId, error_detail AS errorDetail,
  created_at AS createdAt, updated_at AS updatedAt
`;

export class Store {
  private db: Database.Database;

  constructor(dbPath: string = config.dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bills (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id                  TEXT UNIQUE NOT NULL,
        thread_id                   TEXT,
        subject                     TEXT,
        from_address                TEXT,
        email_date                  TEXT,
        body_text                   TEXT,
        status                      TEXT NOT NULL,
        is_bill                     INTEGER NOT NULL DEFAULT 0,
        confidence                  REAL,
        vendor_name                 TEXT,
        amount                      REAL,
        currency                    TEXT,
        due_date                    TEXT,
        issue_date                  TEXT,
        invoice_number              TEXT,
        suggested_expense_category  TEXT,
        memo                        TEXT,
        qbo_bill_id                 TEXT,
        error_detail                TEXT,
        created_at                  TEXT NOT NULL,
        updated_at                  TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attachments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id     INTEGER NOT NULL REFERENCES bills(id),
        filename    TEXT,
        mime_type   TEXT,
        data        BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_bill_id ON attachments(bill_id);
      CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
    `);
  }

  isProcessed(messageId: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM bills WHERE message_id = ?").get(messageId);
    return !!row;
  }

  /** Records a scanned email (bill or not) and, if it's a bill, its attachments. */
  insertScanResult(
    email: CandidateEmail,
    extraction: BillExtraction,
    status: "pending_approval" | "not_a_bill",
    attachments: FetchedAttachment[]
  ): number {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO bills
         (message_id, thread_id, subject, from_address, email_date, body_text, status, is_bill,
          confidence, vendor_name, amount, currency, due_date, issue_date, invoice_number,
          suggested_expense_category, memo, created_at, updated_at)
         VALUES
         (@messageId, @threadId, @subject, @fromAddress, @emailDate, @bodyText, @status, @isBill,
          @confidence, @vendorName, @amount, @currency, @dueDate, @issueDate, @invoiceNumber,
          @suggestedExpenseCategory, @memo, @createdAt, @updatedAt)`
      )
      .run({
        messageId: email.id,
        threadId: email.threadId,
        subject: email.subject,
        fromAddress: email.from,
        emailDate: email.date,
        bodyText: email.bodyText,
        status,
        isBill: extraction.isBill ? 1 : 0,
        confidence: extraction.confidence,
        vendorName: extraction.vendorName,
        amount: extraction.amount,
        currency: extraction.currency,
        dueDate: extraction.dueDate,
        issueDate: extraction.issueDate,
        invoiceNumber: extraction.invoiceNumber,
        suggestedExpenseCategory: extraction.suggestedExpenseCategory,
        memo: extraction.memo,
        createdAt: now,
        updatedAt: now,
      });
    const billId = Number(info.lastInsertRowid);

    const insertAttachment = this.db.prepare(
      "INSERT INTO attachments (bill_id, filename, mime_type, data) VALUES (?, ?, ?, ?)"
    );
    for (const a of attachments) {
      insertAttachment.run(billId, a.filename, a.mimeType, a.data);
    }
    return billId;
  }

  markError(email: CandidateEmail, extraction: BillExtraction | null, detail: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO bills (message_id, thread_id, subject, from_address, email_date, body_text,
           status, is_bill, confidence, error_detail, created_at, updated_at)
         VALUES (@messageId, @threadId, @subject, @fromAddress, @emailDate, @bodyText,
           'error', @isBill, @confidence, @detail, @createdAt, @updatedAt)`
      )
      .run({
        messageId: email.id,
        threadId: email.threadId,
        subject: email.subject,
        fromAddress: email.from,
        emailDate: email.date,
        bodyText: email.bodyText,
        isBill: extraction?.isBill ? 1 : 0,
        confidence: extraction?.confidence ?? null,
        detail,
        createdAt: now,
        updatedAt: now,
      });
  }

  getBill(id: number): BillRow | undefined {
    const row = this.db.prepare(`SELECT ${columns} FROM bills WHERE id = ?`).get(id) as
      | (Omit<BillRow, "isBill"> & { isBill: number })
      | undefined;
    return row ? { ...row, isBill: !!row.isBill } : undefined;
  }

  listByStatus(status: BillStatus | BillStatus[]): BillRow[] {
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT ${columns} FROM bills WHERE status IN (${placeholders}) ORDER BY email_date DESC`)
      .all(...statuses) as (Omit<BillRow, "isBill"> & { isBill: number })[];
    return rows.map((r) => ({ ...r, isBill: !!r.isBill }));
  }

  getAttachments(billId: number): AttachmentRow[] {
    return this.db
      .prepare("SELECT id, bill_id AS billId, filename, mime_type AS mimeType, data FROM attachments WHERE bill_id = ?")
      .all(billId) as AttachmentRow[];
  }

  getAttachment(attachmentId: number): AttachmentRow | undefined {
    return this.db
      .prepare("SELECT id, bill_id AS billId, filename, mime_type AS mimeType, data FROM attachments WHERE id = ?")
      .get(attachmentId) as AttachmentRow | undefined;
  }

  markApproved(id: number, fields: ApprovedFields, qboBillId: string): void {
    this.db
      .prepare(
        `UPDATE bills SET status = 'approved', vendor_name = @vendorName, amount = @amount,
         currency = @currency, due_date = @dueDate, issue_date = @issueDate,
         invoice_number = @invoiceNumber, suggested_expense_category = @suggestedExpenseCategory,
         memo = @memo, qbo_bill_id = @qboBillId, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({ ...fields, qboBillId, id, updatedAt: new Date().toISOString() });
  }

  markRejected(id: number): void {
    this.db
      .prepare("UPDATE bills SET status = 'rejected', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  close(): void {
    this.db.close();
  }
}
