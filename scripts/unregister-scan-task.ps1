# Removes the scheduled task created by register-scan-task.ps1.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\unregister-scan-task.ps1

$taskName = "InboxBillToQuickBooks-Scan"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed scheduled task '$taskName'."
} else {
  Write-Host "Task '$taskName' isn't registered — nothing to do."
}
