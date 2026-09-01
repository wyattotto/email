// Shared service definition used by both install-service.js and
// uninstall-service.js so the two never drift apart.
const path = require("path");

module.exports = {
  name: "InboxBillToQuickBooks",
  description: "Review UI for bills extracted from Gmail before they're sent to QuickBooks.",
  script: path.join(__dirname, "..", "dist", "server.js"),
  workingDirectory: path.join(__dirname, ".."),
};
