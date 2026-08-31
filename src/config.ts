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

export const config = {
  gmail: {
    clientId: required("GMAIL_CLIENT_ID"),
    clientSecret: required("GMAIL_CLIENT_SECRET"),
    refreshToken: required("GMAIL_REFRESH_TOKEN"),
    query: optional(
      "GMAIL_QUERY",
      "in:inbox -label:bill-processed -label:bill-needs-review newer_than:30d"
    ),
    processedLabel: optional("GMAIL_PROCESSED_LABEL", "bill-processed"),
    needsReviewLabel: optional("GMAIL_NEEDS_REVIEW_LABEL", "bill-needs-review"),
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
};
