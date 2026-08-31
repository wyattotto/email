import { config } from "../config";
import { loadQboTokens, saveQboTokens, QboTokens } from "./token-store";
import { logger } from "../util/logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const OAuthClient = require("intuit-oauth");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QuickBooks = require("node-quickbooks");

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min before expiry

async function getValidTokens(): Promise<QboTokens> {
  const tokens = loadQboTokens();
  if (!tokens) {
    throw new Error(
      "No QuickBooks tokens found. Run `npm run qbo:auth` once to connect a QuickBooks company."
    );
  }
  if (Date.now() < tokens.expiresAt - REFRESH_MARGIN_MS) {
    return tokens;
  }

  logger.info("Refreshing QuickBooks access token...");
  const oauthClient = new OAuthClient({
    clientId: config.qbo.clientId,
    clientSecret: config.qbo.clientSecret,
    environment: config.qbo.environment,
    redirectUri: config.qbo.redirectUri,
  });
  oauthClient.setToken({ refresh_token: tokens.refreshToken });
  const authResponse = await oauthClient.refresh();
  const token = authResponse.getJson();

  const updated: QboTokens = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    realmId: tokens.realmId,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  saveQboTokens(updated);
  return updated;
}

export async function createQboClient(): Promise<any> {
  const tokens = await getValidTokens();
  return new QuickBooks(
    config.qbo.clientId,
    config.qbo.clientSecret,
    tokens.accessToken,
    false, // no oauth token secret (OAuth2)
    tokens.realmId,
    config.qbo.environment === "sandbox",
    false, // debug
    null, // minor version (use latest)
    "2.0",
    tokens.refreshToken
  );
}

function promisify<T>(fn: (cb: (err: any, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => (err ? reject(normalizeQboError(err)) : resolve(result)));
  });
}

function normalizeQboError(err: any): Error {
  const detail =
    err?.Fault?.Error?.[0]?.Detail ?? err?.Fault?.Error?.[0]?.Message ?? err?.message ?? JSON.stringify(err);
  return new Error(`QuickBooks API error: ${detail}`);
}

export interface VendorRef {
  value: string; // Id
  name: string;
}

export async function findOrCreateVendor(qbo: any, displayName: string): Promise<VendorRef> {
  const found = await promisify<any>((cb) => qbo.findVendors({ DisplayName: displayName }, cb));
  const existing = found?.QueryResponse?.Vendor?.[0];
  if (existing) {
    return { value: existing.Id, name: existing.DisplayName };
  }
  const created = await promisify<any>((cb) => qbo.createVendor({ DisplayName: displayName }, cb));
  return { value: created.Id, name: created.DisplayName };
}

export interface AccountRef {
  value: string; // Id
  name: string;
}

/**
 * Tries to find an existing expense account matching the suggested category
 * name; falls back to the configured default expense account.
 */
export async function resolveExpenseAccount(
  qbo: any,
  suggestedCategory: string | null
): Promise<AccountRef> {
  const candidates = [suggestedCategory, config.qbo.defaultExpenseAccount].filter(
    (v): v is string => !!v
  );
  for (const name of candidates) {
    const found = await promisify<any>((cb) =>
      qbo.findAccounts({ Name: name, AccountType: "Expense" }, cb)
    );
    const account = found?.QueryResponse?.Account?.[0];
    if (account) return { value: account.Id, name: account.Name };
  }
  throw new Error(
    `No matching expense account found for "${suggestedCategory}" or default ` +
      `"${config.qbo.defaultExpenseAccount}". Create the account in QuickBooks or fix QBO_DEFAULT_EXPENSE_ACCOUNT.`
  );
}

export interface CreateBillInput {
  vendor: VendorRef;
  account: AccountRef;
  amount: number;
  txnDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  docNumber?: string;
  memo?: string;
}

export async function createBill(qbo: any, input: CreateBillInput): Promise<any> {
  const bill = {
    VendorRef: { value: input.vendor.value, name: input.vendor.name },
    TxnDate: input.txnDate,
    DueDate: input.dueDate,
    DocNumber: input.docNumber,
    PrivateNote: input.memo,
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: input.amount,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: input.account.value, name: input.account.name },
        },
        Description: input.memo,
      },
    ],
  };
  return promisify<any>((cb) => qbo.createBill(bill, cb));
}
