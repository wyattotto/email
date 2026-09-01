// One-time setup script: run `npm run qbo:auth` after filling in
// QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_ENVIRONMENT in .env. It opens a
// local server, prints a URL for you to visit and approve access against a
// specific QuickBooks company, then saves tokens (including the company's
// realmId) to the token store file.
import * as http from "http";
import * as dotenv from "dotenv";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OAuthClient = require("intuit-oauth");

dotenv.config();

const PORT = 3000;

async function main() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const environment = process.env.QBO_ENVIRONMENT || "sandbox";
  const redirectUri = process.env.QBO_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;

  if (!clientId || !clientSecret) {
    console.error("Set QBO_CLIENT_ID and QBO_CLIENT_SECRET in .env first.");
    process.exit(1);
  }

  const oauthClient = new OAuthClient({
    clientId,
    clientSecret,
    environment,
    redirectUri,
  });

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: "inbox-bill-to-quickbooks-setup",
  });

  console.log("\n1. Open this URL, sign in, and pick the QuickBooks company to connect:\n");
  console.log(authUri);
  console.log(`\n2. Waiting for the redirect back to ${redirectUri} ...\n`);

  const callbackUrl: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.end("Success! You can close this tab.");
      server.close();
      if (!req.url) {
        reject(new Error("No callback URL received"));
        return;
      }
      resolve(`http://localhost:${PORT}${req.url}`);
    });
    server.listen(PORT);
  });

  const authResponse = await oauthClient.createToken(callbackUrl);
  const token = authResponse.getJson();
  const realmId = new URL(callbackUrl).searchParams.get("realmId");

  if (!realmId) {
    console.error("No realmId returned — did you pick a company during authorization?");
    process.exit(1);
  }

  const { saveQboTokens } = await import("./token-store");
  saveQboTokens({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    realmId,
    expiresAt: Date.now() + token.expires_in * 1000,
  });

  console.log("\nSuccess. QuickBooks tokens saved to the token store.");
  console.log(`Realm (company) ID: ${realmId}`);
  console.log(`Environment: ${environment}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
