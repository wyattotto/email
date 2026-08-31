import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { CandidateEmail, EmailAttachment, GmailClient } from "../gmail/client";
import { BillExtraction } from "./types";

const client = new Anthropic({ apiKey: config.claude.apiKey });

type ContentBlock =
  | Anthropic.Beta.BetaTextBlockParam
  | Anthropic.Beta.BetaImageBlockParam
  | Anthropic.Beta.BetaBase64PDFBlock;

const EXTRACTION_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_bill_extraction",
  description:
    "Record whether this email represents a bill/invoice owed by the recipient, and the extracted details.",
  input_schema: {
    type: "object",
    properties: {
      is_bill: {
        type: "boolean",
        description:
          "True only if this is a bill or invoice that the recipient owes money on (e.g. utility bill, " +
          "SaaS invoice, credit card statement due). False for receipts of payments already made, " +
          "marketing, newsletters, shipping notifications, etc.",
      },
      confidence: {
        type: "number",
        description: "Confidence in the is_bill judgement and extracted fields, from 0 to 1.",
      },
      vendor_name: {
        type: ["string", "null"],
        description: "The company/vendor billing the recipient, e.g. 'Comcast', 'AWS'.",
      },
      amount: {
        type: ["number", "null"],
        description: "Total amount due, as a plain number (no currency symbol).",
      },
      currency: {
        type: ["string", "null"],
        description: "ISO 4217 currency code, e.g. USD. Assume USD if unstated but clearly US-billed.",
      },
      due_date: {
        type: ["string", "null"],
        description: "Payment due date in YYYY-MM-DD format, if present.",
      },
      issue_date: {
        type: ["string", "null"],
        description: "Invoice/bill issue date in YYYY-MM-DD format, if present.",
      },
      invoice_number: {
        type: ["string", "null"],
        description: "Invoice or account number, if present.",
      },
      suggested_expense_category: {
        type: ["string", "null"],
        description:
          "A short QuickBooks-style expense account category guess, e.g. 'Utilities', 'Software Subscriptions', 'Rent'.",
      },
      memo: {
        type: ["string", "null"],
        description: "One-line human-readable summary suitable as a bill memo, e.g. 'Comcast internet - August 2026'.",
      },
    },
    required: ["is_bill", "confidence"],
  },
};

const SYSTEM_PROMPT = `You classify emails for a personal bookkeeping automation. Given an email
(subject, sender, body, and any attached invoice/statement documents), determine whether it is a
bill or invoice the recipient owes money on, and if so extract structured details. Be conservative:
if you are not confident this is an actionable bill with a clear amount owed, set is_bill accordingly
and lower confidence rather than guessing. Always respond by calling the record_bill_extraction tool.`;

export async function classifyEmail(
  email: CandidateEmail,
  gmail: GmailClient
): Promise<BillExtraction> {
  const content: ContentBlock[] = [];

  const header =
    `Subject: ${email.subject}\n` +
    `From: ${email.from}\n` +
    `Date: ${email.date}\n\n` +
    `Body:\n${email.bodyText || "(no plain text body)"}`;
  content.push({ type: "text", text: header });

  for (const attachment of email.attachments) {
    const block = await attachmentToContentBlock(email.id, attachment, gmail);
    if (block) content.push(block);
  }

  const response = await client.beta.messages.create({
    model: config.claude.model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_bill_extraction" },
    messages: [{ role: "user", content }],
    betas: ["pdfs-2024-09-25"],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("Claude did not return a record_bill_extraction tool call");
  }

  const input = toolUse.input as Record<string, unknown>;
  return {
    isBill: Boolean(input.is_bill),
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    vendorName: (input.vendor_name as string) ?? null,
    amount: typeof input.amount === "number" ? input.amount : null,
    currency: (input.currency as string) ?? null,
    dueDate: (input.due_date as string) ?? null,
    issueDate: (input.issue_date as string) ?? null,
    invoiceNumber: (input.invoice_number as string) ?? null,
    suggestedExpenseCategory: (input.suggested_expense_category as string) ?? null,
    memo: (input.memo as string) ?? null,
  };
}

async function attachmentToContentBlock(
  messageId: string,
  attachment: EmailAttachment,
  gmail: GmailClient
): Promise<ContentBlock | null> {
  const data = await gmail.getAttachmentData(messageId, attachment.attachmentId);
  if (!data) return null;
  const base64 = data.toString("base64");

  if (attachment.mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }
  if (attachment.mimeType === "image/png" || attachment.mimeType === "image/jpeg") {
    return {
      type: "image",
      source: { type: "base64", media_type: attachment.mimeType, data: base64 },
    };
  }
  return null;
}
