# Inbox Bill → QuickBooks

Monitors a Gmail inbox for bills, extracts the details with Claude (vendor,
amount, due date — reading email bodies and attached PDF/image invoices),
and automatically creates a matching Bill in QuickBooks Online. Anything
Claude isn't confident about is left alone and labeled for manual review
instead of being auto-entered.

## How it works

Each run (intended to be triggered by cron):

1. Searches Gmail with `GMAIL_QUERY` for candidate emails not already
   labeled as processed.
2. For each candidate, sends the email body and any PDF/PNG/JPEG
   attachments to Claude, which decides whether it's a bill and extracts
   vendor, amount, due date, invoice number, and a suggested expense
   category — with a confidence score.
3. Not a bill → labeled processed, skipped.
4. A bill, but confidence is below `CONFIDENCE_THRESHOLD` (or vendor/amount
   is missing) → labeled `bill-needs-review`, **not** entered into
   QuickBooks.
5. A bill with sufficient confidence → finds or creates the vendor in
   QuickBooks, resolves an expense account (Claude's suggested category if
   it matches an existing account, else `QBO_DEFAULT_EXPENSE_ACCOUNT`),
   creates the Bill, and labels the email `bill-processed`.

Every processed message is recorded in a local SQLite ledger
(`DB_PATH`) so it's never processed twice, even across runs.

## Setup

### 1. Install

```
npm install
```

### 2. Gmail API access

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project, enable the **Gmail API**, and configure the OAuth consent
   screen (choose "External" + add yourself as a test user, or "Internal"
   if using Workspace — either is fine for personal use).
2. Create OAuth credentials of type **Desktop app**. Copy the Client ID
   and Client Secret.
3. `cp .env.example .env` and fill in `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`.
4. Run the one-time authorization flow:
   ```
   npm run gmail:auth
   ```
   Open the printed URL, approve access, then copy the printed
   `GMAIL_REFRESH_TOKEN` value into `.env`.

### 3. QuickBooks Online access

1. In the [Intuit Developer portal](https://developer.intuit.com/), create
   an app with the **Accounting** scope. Copy the Client ID and Client
   Secret (use the sandbox keys first).
2. Add `http://localhost:3000/oauth2callback` as an allowed redirect URI
   in the app's settings.
3. Fill in `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` / `QBO_ENVIRONMENT=sandbox`
   in `.env`.
4. Run the one-time authorization flow:
   ```
   npm run qbo:auth
   ```
   Open the printed URL, sign in, and pick the QuickBooks company (a
   sandbox company for testing) to connect. Tokens — including the
   company's realm ID — are saved to `.secrets/qbo-tokens.json`
   (git-ignored) and refreshed automatically on future runs.
5. Once you've verified everything against the sandbox, switch
   `QBO_ENVIRONMENT=production`, re-run `npm run qbo:auth` against your
   real company, and update `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` to your
   app's production keys.

### 4. Claude API access

Get an API key from [console.anthropic.com](https://console.anthropic.com/)
and set `ANTHROPIC_API_KEY` in `.env`.

### 5. Tune behavior

In `.env`:

- `GMAIL_QUERY` — which emails count as candidates each run.
- `CONFIDENCE_THRESHOLD` — bills below this confidence are flagged for
  manual review instead of auto-entered. Start high (e.g. `0.85`) and
  loosen it once you trust the extraction on your real bills.
- `QBO_DEFAULT_EXPENSE_ACCOUNT` — fallback expense account name used when
  Claude's suggested category doesn't match an existing QuickBooks account.

### 6. Run it

```
npm run build
npm start
```

Or during development:

```
npm run dev
```

Check the run summary in the log output, and check your Gmail inbox for
the `bill-needs-review` label — anything there needs a human look.

### 7. Schedule it

This is designed to run as a periodic job, not a long-lived process.
Example crontab entry running every 15 minutes:

```
*/15 * * * * cd /path/to/email && npm start >> logs/run.log 2>&1
```

## Notes and limitations

- Only `application/pdf`, `image/png`, and `image/jpeg` attachments are
  sent to Claude; attachments over 15MB are skipped.
- Vendors are matched by exact `DisplayName`; if no exact match exists a
  new vendor is created in QuickBooks. Review your vendor list
  occasionally for near-duplicates (e.g. "Comcast" vs "Comcast Cable").
- This creates real QuickBooks **Bills** (accounts payable), not expense
  transactions or payments — you still record payment separately in
  QuickBooks when you actually pay.
- Secrets (`.env`, `.secrets/`, the SQLite ledger) are git-ignored. Treat
  them as credentials — don't commit or share them.

## Tests

```
npm test
```

Covers the pure decide-what-to-do-with-an-extraction logic
(`src/extraction/decision.ts`). The Gmail/QuickBooks/Claude clients are
thin wrappers around external APIs and aren't unit-tested here — verify
them against the QuickBooks sandbox before pointing this at production.
