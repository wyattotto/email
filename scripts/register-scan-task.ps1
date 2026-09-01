# Registers a Task Scheduler job that runs the scan every 15 minutes.
# Does NOT require an elevated terminal — this creates a normal per-user
# task, which only runs while you're logged in. (If you want it to run
# even when logged out, open Task Scheduler, find the task, and check
# "Run whether user is logged on or not" under its Properties — Windows
# will prompt you to store your account password for that.)
#
# Usage (from a regular PowerShell prompt, in the project directory):
#   powershell -ExecutionPolicy Bypass -File scripts\register-scan-task.ps1

$ErrorActionPreference = "Stop"
$taskName = "InboxBillToQuickBooks-Scan"
$scriptPath = Join-Path $PSScriptRoot "run-scan.bat"

$action = New-ScheduledTaskAction -Execute $scriptPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 15) `
  -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $taskName `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Scans Gmail for bills and queues them for review (Inbox Bill -> QuickBooks)." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$taskName' — runs every 15 minutes."
Write-Host "View/edit it in Task Scheduler, or run: Get-ScheduledTask -TaskName '$taskName'"
