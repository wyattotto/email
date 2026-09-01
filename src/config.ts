import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function optionalList(name: string): string[] {
  const value = process.env[name];
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export const config = {
  gmail: {
    clientId: required("GMAIL_CLIENT_ID"),
    clientSecret: required("GMAIL_CLIENT_SECRET"),
    refreshToken: required("GMAIL_REFRESH_TOKEN"),
    query: optional("GMAIL_QUERY", "in:inbox -label:bill-scanned newer_than:30d"),
    // If set, ONLY these senders (email addresses or domains) are scanned — everything else is ignored.
    senderAllowlist: optionalList("GMAIL_SENDER_ALLOWLIST"),
    // These senders (email addresses or domains) are always skipped, even if they'd otherwise match.
    senderBlocklist: optionalList("GMAIL_SENDER_BLOCKLIST"),
    // Applied to every scanned email so it's never re-scanned, regardless of outcome.
    scannedLabel: optional("GMAIL_SCANNED_LABEL", "bill-scanned"),
    // Applied to bills waiting for your approval in the review UI.
    pendingLabel: optional("GMAIL_PENDING_LABEL", "bill-pending-review"),
    // Applied once you approve a bill and it's created in QuickBooks.
    approvedLabel: optional("GMAIL_APPROVED_LABEL", "bill-approved"),
    // Applied if you reject a bill in the review UI.
    rejectedLabel: optional("GMAIL_REJECTED_LABEL", "bill-rejected"),
  },
  qbo: {
    clientId: required("QBO_CLIENT_ID"),
    clientSecret: required("QBO_CLIENT_SECRET"),
    environment: optional("QBO_ENVIRONMENT", "sandbox") as "sandbox" | "production",
    redirectUri: optional("QBO_REDIRECT_URI", "http://localhost:3000/oauth2callback"),
    defaultExpenseAccount: optional("QBO_DEFAULT_EXPENSE_ACCOUNT", "Utilities"),
    tokenStorePath: optional(
      "QBO_TOKEN_STORE_PATH",
      path.join(process.cwd(), ".secrets", "qbo-tokens.json")
    ),
  },
  claude: {
    apiKey: required("ANTHROPIC_API_KEY"),
    model: optional("CLAUDE_MODEL", "claude-sonnet-5"),
  },
  confidenceThreshold: parseFloat(optional("CONFIDENCE_THRESHOLD", "0.75")),
  dbPath: optional("DB_PATH", path.join(process.cwd(), "data", "state.sqlite3")),
  server: {
    port: parseInt(optional("SERVER_PORT", "4000"), 10),
    host: optional("SERVER_HOST", "127.0.0.1"),
  },
};
