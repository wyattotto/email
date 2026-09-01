// One-time setup script: run `npm run gmail:auth` after filling in
// GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env. It opens a local server,
// prints a URL for you to visit and approve access, then prints the
// refresh token to paste into GMAIL_REFRESH_TOKEN.
import * as http from "http";
import * as dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1. Open this URL in your browser and approve access:\n");
  console.log(authUrl);
  console.log(`\n2. Waiting for the redirect back to ${REDIRECT_URI} ...\n`);

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(error ? "Authorization failed. Check the terminal." : "Success! You can close this tab.");
      server.close();
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error("No code returned"));
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token returned. If you've authorized this app before, revoke access at " +
        "https://myaccount.google.com/permissions and run this again."
    );
    process.exit(1);
  }

  console.log("\nSuccess. Add this to your .env file:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
