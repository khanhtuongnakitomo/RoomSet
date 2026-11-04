$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $projectRoot '.run/demo-processes.json'
if (-not (Test-Path -LiteralPath $stateFile)) { Write-Host 'No tracked demo processes.'; return }
$tracked = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
foreach ($entry in ($tracked | Sort-Object -Property started -Descending)) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $sameStart = ([datetimeoffset]$process.StartTime).UtcDateTime.Ticks -eq ([datetimeoffset]$entry.started).UtcDateTime.Ticks
    $samePath = $process.Path -eq $entry.path
    if ($sameStart -and $samePath -and $entry.path) {
        Stop-Process -Id $process.Id
        Write-Host "Stopped Roomset $($entry.kind)."
    } else {
        Write-Warning "Process $($entry.id) no longer matches the recorded demo. It was left running."
    }
}
Remove-Item -LiteralPath $stateFile
