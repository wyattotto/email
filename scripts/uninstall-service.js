// Stops and removes the Windows Service installed by install-service.js.
// Requires an elevated ("Run as Administrator") terminal.
//
// Usage (from an elevated PowerShell/cmd, in the project directory):
//   npm run service:uninstall
const { Service } = require("node-windows");
const serviceConfig = require("./windows-service-config");

const svc = new Service(serviceConfig);

svc.on("alreadyuninstalled", () => {
  console.log(`Service "${serviceConfig.name}" isn't installed — nothing to do.`);
});
svc.on("uninstall", () => {
  console.log(`Service "${serviceConfig.name}" uninstalled.`);
});
svc.on("error", (err) => {
  console.error("Service error:", err);
});

console.log(`Uninstalling "${serviceConfig.name}"...`);
svc.uninstall();
