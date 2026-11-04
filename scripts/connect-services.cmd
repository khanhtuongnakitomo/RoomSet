@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0connect-services.ps1"
if errorlevel 1 echo Setup did not finish. Read the message above before trying again.
pause
