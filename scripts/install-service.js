// Installs the review UI (dist/server.js) as a Windows Service: starts
// automatically at boot, restarts itself if it crashes, and runs without
// a visible terminal window. Requires an elevated ("Run as Administrator")
// terminal, and requires `npm run build` to have been run first.
//
// Usage (from an elevated PowerShell/cmd, in the project directory):
//   npm run service:install
const { Service } = require("node-windows");
const serviceConfig = require("./windows-service-config");

const svc = new Service(serviceConfig);

svc.on("invalidinstallation", () => {
  console.error("Could not install the service — did you run this from an elevated (Administrator) terminal?");
  process.exit(1);
});
svc.on("alreadyinstalled", () => {
  console.log(`Service "${serviceConfig.name}" is already installed. Use "npm run service:uninstall" first to reinstall.`);
});
svc.on("install", () => {
  console.log(`Service "${serviceConfig.name}" installed. Starting it...`);
  svc.start();
});
svc.on("start", () => {
  console.log('Service started. Open the review UI in your browser once it finishes starting up.');
  console.log(`Logs: ${serviceConfig.workingDirectory}\\daemon\\`);
});
svc.on("error", (err) => {
  console.error("Service error:", err);
});

console.log(`Installing "${serviceConfig.name}" as a Windows Service...`);
svc.install();
