import { google, gmail_v1 } from "googleapis";
import { config } from "../config";

export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface CandidateEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

// Attachments larger than this are skipped (Claude's request size limits).
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function createOAuthClient() {
  const auth = new google.auth.OAuth2(config.gmail.clientId, config.gmail.clientSecret);
  auth.setCredentials({ refresh_token: config.gmail.refreshToken });
  return auth;
}

export class GmailClient {
  private gmail: gmail_v1.Gmail;
  private labelIdCache = new Map<string, string>();

  constructor() {
    this.gmail = google.gmail({ version: "v1", auth: createOAuthClient() });
  }

  async listCandidateMessageIds(query: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.gmail.users.messages.list({
        userId: "me",
        q: query,
        pageToken,
        maxResults: 25,
      });
      for (const m of res.data.messages ?? []) {
        if (m.id) ids.push(m.id);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return ids;
  }

  async getCandidateEmail(messageId: string): Promise<CandidateEmail> {
    const res = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    const message = res.data;
    const headers = message.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    const attachments: EmailAttachment[] = [];
    const bodyParts: string[] = [];

    const walk = (part?: gmail_v1.Schema$MessagePart) => {
      if (!part) return;
      const mimeType = part.mimeType ?? "";
      if (part.filename && part.body?.attachmentId) {
        if (SUPPORTED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
          attachments.push({
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            mimeType,
            size: part.body.size ?? 0,
          });
        }
      } else if (mimeType === "text/plain" && part.body?.data) {
        bodyParts.push(decodeBase64Url(part.body.data));
      } else if (mimeType === "text/html" && part.body?.data && bodyParts.length === 0) {
        bodyParts.push(stripHtml(decodeBase64Url(part.body.data)));
      }
      for (const child of part.parts ?? []) walk(child);
    };
    walk(message.payload ?? undefined);

    return {
      id: messageId,
      threadId: message.threadId ?? "",
      subject: header("Subject"),
      from: header("From"),
      date: header("Date"),
      bodyText: bodyParts.join("\n").slice(0, 20000),
      attachments,
    };
  }

  async getAttachmentData(messageId: string, attachmentId: string): Promise<Buffer | null> {
    const res = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = res.data.data;
    const size = res.data.size ?? 0;
    if (!data || size > MAX_ATTACHMENT_BYTES) return null;
    return Buffer.from(data, "base64");
  }

  async ensureLabel(name: string): Promise<string> {
    if (this.labelIdCache.has(name)) return this.labelIdCache.get(name)!;
    const list = await this.gmail.users.labels.list({ userId: "me" });
    const existing = list.data.labels?.find((l) => l.name === name);
    if (existing?.id) {
      this.labelIdCache.set(name, existing.id);
      return existing.id;
    }
    const created = await this.gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    const id = created.data.id!;
    this.labelIdCache.set(name, id);
    return id;
  }

  async applyLabel(messageId: string, labelName: string): Promise<void> {
    const labelId = await this.ensureLabel(labelName);
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds: [labelId] },
    });
  }
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
