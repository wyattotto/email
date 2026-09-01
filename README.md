# Inbox Bill → QuickBooks

Monitors a Gmail inbox for bills, extracts the details with Claude (vendor,
amount, due date — reading email bodies and attached PDF/image invoices),
and lets you preview and approve each one in a local web UI before it's
created as a Bill in QuickBooks Online. **Nothing is ever entered into
QuickBooks without your approval.**

## How it works

There are two separate pieces: a **scan** job and a **review UI**.

### Scan (`npm run scan`, intended to run on a schedule)

1. Searches Gmail with `GMAIL_QUERY` for candidate emails not already
   labeled as scanned.
2. For each candidate, sends the email body and any PDF/PNG/JPEG
   attachments to Claude, which decides whether it's a bill and extracts
   vendor, amount, due date, invoice number, and a suggested expense
   category — with a confidence score.
3. Not a bill → recorded and skipped, no further action.
4. A bill → saved to the local review queue (along with its attachments)
   and labeled `bill-pending-review` in Gmail.

### Review UI (`npm run serve`, a small local web server)

Open `http://localhost:4000` (or your configured `SERVER_PORT`) to see
every pending bill: extracted vendor, amount, due date, etc. next to a
preview of the original PDF/image attachment and the email body. Anything
with a low confidence score or a missing vendor/amount is flagged
**needs a closer look**.

On each one you can:
- **Edit** any extracted field before approving.
- **Approve & send to QuickBooks** — finds or creates the vendor, resolves
  an expense account (Claude's suggested category if it matches an
  existing account, else `QBO_DEFAULT_EXPENSE_ACCOUNT`), creates the Bill,
  attaches the original PDF/image attachment(s) to it in QuickBooks, and
  labels the email `bill-approved`.
- **Reject** — no QuickBooks entry is created; the email is labeled
  `bill-rejected`.

Every scanned email is recorded in a local SQLite database (`DB_PATH`), so
nothing is ever scanned twice, and approved/rejected bills stay visible
under the "History" tab.

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

- `GMAIL_QUERY` — which emails count as candidates each scan.
- `GMAIL_SENDER_BLOCKLIST` — comma-separated senders (email address or
  domain) to always skip, e.g. one Claude keeps misclassifying:
  `GMAIL_SENDER_BLOCKLIST=noreply@confusing-sender.com`.
- `CONFIDENCE_THRESHOLD` — pending bills below this confidence (or missing
  vendor/amount) get a "needs a closer look" badge in the review UI. This
  never blocks anything from reaching QuickBooks by itself — you always
  approve or reject by hand.
- `QBO_DEFAULT_EXPENSE_ACCOUNT` — fallback expense account name used when
  Claude's suggested category doesn't match an existing QuickBooks account.

### 6. Run it

```
npm run build
npm run scan     # find and queue new bills for review
npm run serve    # start the review UI at http://localhost:4000
```

Or during development: `npm run dev:scan` / `npm run dev:serve`.

Run `npm run scan`, then open the review UI and work through the queue.

### 7. Schedule the scan

Only the **scan** step is meant to run periodically — the review UI is a
server you leave running (or start when you want to review bills).
Example crontab entry scanning every 15 minutes:

```
*/15 * * * * cd /path/to/email && npm run scan >> logs/scan.log 2>&1
```

To keep the review UI running in the background, use something like `pm2`,
a systemd user service, or a `screen`/`tmux` session — whatever you'd
normally use to keep a small local server alive. It binds to
`127.0.0.1` by default; don't change `SERVER_HOST` to expose it beyond
your own machine unless you put real authentication in front of it, since
approving a bill there triggers a real QuickBooks write.

## Notes and limitations

- Only `application/pdf`, `image/png`, and `image/jpeg` attachments are
  sent to Claude; attachments over 15MB are skipped.
- Vendors are matched by exact `DisplayName`; if no exact match exists a
  new vendor is created in QuickBooks when you approve. Review your vendor
  list occasionally for near-duplicates (e.g. "Comcast" vs "Comcast Cable").
- This creates real QuickBooks **Bills** (accounts payable), not expense
  transactions or payments — you still record payment separately in
  QuickBooks when you actually pay.
- Attachments are stored in the local SQLite database so the review UI can
  show them without re-fetching from Gmail; the database can grow — prune
  old approved/rejected rows periodically if that matters to you.
- Secrets (`.env`, `.secrets/`, the SQLite database) are git-ignored. Treat
  them as credentials — don't commit or share them.

## Tests

```
npm test
```

Covers the pure what-belongs-in-the-review-queue logic
(`src/extraction/decision.ts`). The Gmail/QuickBooks/Claude clients and the
web UI are thin wrappers around external APIs and aren't unit-tested here —
verify them against the QuickBooks sandbox before pointing this at
production.
