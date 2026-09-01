import * as fs from "fs";
import * as path from "path";
import { config } from "../config";

export interface QboTokens {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  // Epoch ms when the access token expires.
  expiresAt: number;
}

export function loadQboTokens(): QboTokens | null {
  const p = config.qbo.tokenStorePath;
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveQboTokens(tokens: QboTokens): void {
  const p = config.qbo.tokenStorePath;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}
