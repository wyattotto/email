import { BillRow, AttachmentRow } from "../db/store";
import { isLowConfidence } from "../extraction/decision";
import { config } from "../config";

export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #f7f7f5; --card: #ffffff; --border: #e4e4e0; --text: #1c1c1a; --muted: #6b6b66;
    --accent: #2f6f4f; --accent-contrast: #ffffff; --danger: #b3441f; --warn: #b8860b;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { padding: 18px 24px; border-bottom: 1px solid var(--border); background: var(--card); display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 18px; margin: 0; }
  header nav a { margin-left: 16px; color: var(--muted); text-decoration: none; font-size: 14px; }
  header nav a.active { color: var(--text); font-weight: 600; }
  main { max-width: 960px; margin: 0 auto; padding: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; }
  .card-list a { text-decoration: none; color: inherit; display: block; }
  .card-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .vendor { font-weight: 600; font-size: 16px; }
  .amount { font-weight: 600; font-size: 16px; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 13px; margin-top: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-left: 8px; }
  .badge.low { background: #fdf1da; color: var(--warn); }
  .badge.status-approved { background: #e4f2e9; color: var(--accent); }
  .badge.status-rejected { background: #f7e6e0; color: var(--danger); }
  .empty { color: var(--muted); text-align: center; padding: 48px 0; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  @media (max-width: 720px) { .detail-grid { grid-template-columns: 1fr; } }
  .preview { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #fff; min-height: 200px; }
  .preview iframe, .preview img { width: 100%; display: block; border: none; }
  .preview img { max-height: 640px; object-fit: contain; }
  .body-text { white-space: pre-wrap; font-size: 13px; color: var(--muted); max-height: 260px; overflow-y: auto; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
  form.edit label { display: block; font-size: 13px; color: var(--muted); margin-top: 12px; margin-bottom: 4px; }
  form.edit input, form.edit textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; font-family: inherit; background: #fff; color: var(--text); }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .actions { display: flex; gap: 10px; margin-top: 20px; }
  button { font: inherit; font-weight: 600; padding: 10px 18px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
  button.approve { background: var(--accent); color: var(--accent-contrast); }
  button.reject { background: transparent; color: var(--danger); border-color: var(--danger); }
  .back-link { display: inline-block; margin-bottom: 16px; color: var(--muted); text-decoration: none; font-size: 14px; }
  .subject { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  .from { color: var(--muted); font-size: 13px; }
  .attachments-list { margin-top: 10px; font-size: 13px; }
  .attachments-list a { color: var(--accent); }
`;

function layout(title: string, activeTab: "pending" | "history", body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head><body>
<header>
  <h1>Bill review</h1>
  <nav>
    <a href="/" class="${activeTab === "pending" ? "active" : ""}">Pending</a>
    <a href="/history" class="${activeTab === "history" ? "active" : ""}">History</a>
  </nav>
</header>
<main>${body}</main>
</body></html>`;
}

function money(bill: BillRow): string {
  const amount = bill.amount !== null ? bill.amount.toFixed(2) : "?";
  return `${escapeHtml(bill.currency ?? "USD")} ${amount}`;
}

export function renderPendingList(bills: BillRow[]): string {
  if (bills.length === 0) {
    return layout("Pending bills", "pending", `<div class="empty">No bills waiting for review. Run a scan to check for new ones.</div>`);
  }
  const items = bills
    .map((b) => {
      const low = isLowConfidence(b, config.confidenceThreshold);
      return `<div class="card card-list"><a href="/bills/${b.id}">
        <div class="card-row">
          <span class="vendor">${escapeHtml(b.vendorName ?? "(unknown vendor)")}${low ? '<span class="badge low">needs a closer look</span>' : ""}</span>
          <span class="amount">${money(b)}</span>
        </div>
        <div class="meta">${escapeHtml(b.subject)} — ${escapeHtml(b.fromAddress)}</div>
        <div class="meta">${b.dueDate ? `due ${escapeHtml(b.dueDate)} · ` : ""}confidence ${Math.round(b.confidence * 100)}%</div>
      </a></div>`;
    })
    .join("\n");
  return layout("Pending bills", "pending", items);
}

export function renderHistoryList(bills: BillRow[]): string {
  if (bills.length === 0) {
    return layout("History", "history", `<div class="empty">No approved or rejected bills yet.</div>`);
  }
  const items = bills
    .map((b) => {
      const badge =
        b.status === "approved"
          ? '<span class="badge status-approved">approved</span>'
          : '<span class="badge status-rejected">rejected</span>';
      return `<div class="card card-list"><a href="/bills/${b.id}">
        <div class="card-row">
          <span class="vendor">${escapeHtml(b.vendorName ?? "(unknown vendor)")}${badge}</span>
          <span class="amount">${money(b)}</span>
        </div>
        <div class="meta">${escapeHtml(b.subject)}${b.qboBillId ? ` — QuickBooks bill #${escapeHtml(b.qboBillId)}` : ""}</div>
      </a></div>`;
    })
    .join("\n");
  return layout("History", "history", items);
}

export function renderBillDetail(bill: BillRow, attachments: AttachmentRow[], error?: string): string {
  const low = isLowConfidence(bill, config.confidenceThreshold);
  const readOnly = bill.status !== "pending_approval";

  const previewBlocks = attachments
    .map((a) => {
      if (a.mimeType === "application/pdf") {
        return `<div class="preview"><iframe src="/attachments/${a.id}" style="height:640px"></iframe></div>`;
      }
      return `<div class="preview"><img src="/attachments/${a.id}" alt="${escapeHtml(a.filename)}"></div>`;
    })
    .join("\n");

  const attachmentLinks = attachments.length
    ? `<div class="attachments-list">Attachments: ${attachments
        .map((a) => `<a href="/attachments/${a.id}" target="_blank">${escapeHtml(a.filename)}</a>`)
        .join(", ")}</div>`
    : "";

  const field = (name: string, label: string, value: string | number | null, type = "text") =>
    `<label for="${name}">${label}</label>
     <input type="${type}" id="${name}" name="${name}" value="${escapeHtml(value)}" ${readOnly ? "disabled" : ""}>`;

  const form = `
    <form class="edit" method="post" action="/bills/${bill.id}/approve">
      ${field("vendorName", "Vendor", bill.vendorName)}
      <div class="row2">
        ${field("amount", "Amount", bill.amount, "number")}
        ${field("currency", "Currency", bill.currency ?? "USD")}
      </div>
      <div class="row2">
        ${field("issueDate", "Issue date", bill.issueDate, "date")}
        ${field("dueDate", "Due date", bill.dueDate, "date")}
      </div>
      <div class="row2">
        ${field("invoiceNumber", "Invoice #", bill.invoiceNumber)}
        ${field("suggestedExpenseCategory", "Expense category", bill.suggestedExpenseCategory)}
      </div>
      ${field("memo", "Memo", bill.memo)}
      ${
        readOnly
          ? bill.status === "approved"
            ? `<p class="meta" style="margin-top:16px;">Approved and created in QuickBooks as bill #${escapeHtml(bill.qboBillId)}.</p>`
            : `<p class="meta" style="margin-top:16px;">Rejected — no QuickBooks entry was created.</p>`
          : `<div class="actions">
              <button type="submit" class="approve">Approve &amp; send to QuickBooks</button>
              <button type="submit" formaction="/bills/${bill.id}/reject" formnovalidate class="reject">Reject</button>
            </div>`
      }
    </form>
  `;

  const body = `
    <a class="back-link" href="/">&larr; Back</a>
    ${error ? `<div class="card" style="border-color:var(--danger);color:var(--danger);">${escapeHtml(error)}</div>` : ""}
    <p class="subject">${escapeHtml(bill.subject)}${low && !readOnly ? '<span class="badge low">low confidence</span>' : ""}</p>
    <p class="from">From ${escapeHtml(bill.fromAddress)} · ${escapeHtml(bill.emailDate)}</p>
    <div class="detail-grid">
      <div>
        <div class="card">${form}</div>
      </div>
      <div>
        ${previewBlocks || '<div class="preview" style="display:flex;align-items:center;justify-content:center;color:var(--muted);">No attachment</div>'}
        ${attachmentLinks}
        <p class="meta" style="margin-top:14px;">Email body</p>
        <div class="body-text">${escapeHtml(bill.bodyText || "(no plain text body)")}</div>
      </div>
    </div>
  `;

  return layout(bill.subject, bill.status === "pending_approval" ? "pending" : "history", body);
}
