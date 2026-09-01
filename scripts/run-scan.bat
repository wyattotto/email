@echo off
REM Wrapper invoked by the Task Scheduler job. Runs the scan job with its
REM working directory set to the project root, appending output to a log
REM file (creating the logs folder if it doesn't exist yet).
cd /d "%~dp0.."
if not exist logs mkdir logs
node dist\scan.js >> logs\scan.log 2>&1
