import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { config } from "../config";

export type ProcessedStatus = "not_a_bill" | "created" | "needs_review" | "error";

export interface ProcessedRecord {
  messageId: string;
  processedAt: string;
  status: ProcessedStatus;
  vendor: string | null;
  amount: number | null;
  qboBillId: string | null;
  detail: string | null;
}

export class Store {
  private db: Database.Database;

  constructor(dbPath: string = config.dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_emails (
        message_id   TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL,
        status       TEXT NOT NULL,
        vendor       TEXT,
        amount       REAL,
        qbo_bill_id  TEXT,
        detail       TEXT
      );
    `);
  }

  isProcessed(messageId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM processed_emails WHERE message_id = ?")
      .get(messageId);
    return !!row;
  }

  markProcessed(record: Omit<ProcessedRecord, "processedAt">): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO processed_emails
         (message_id, processed_at, status, vendor, amount, qbo_bill_id, detail)
         VALUES (@messageId, @processedAt, @status, @vendor, @amount, @qboBillId, @detail)`
      )
      .run({ ...record, processedAt: new Date().toISOString() });
  }

  close(): void {
    this.db.close();
  }
}
