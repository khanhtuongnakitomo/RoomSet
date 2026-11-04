param([switch]$LocalOnly, [switch]$NoBuild, [int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $projectRoot '.run'
$backend = Join-Path $projectRoot 'backend'
$python = Join-Path $backend '.venv/Scripts/python.exe'
$stateFile = Join-Path $runtime 'demo-processes.json'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not (Test-Path -LiteralPath $python)) { throw 'Install the project dependencies first.' }
if (Test-Path -LiteralPath $stateFile) { & (Join-Path $PSScriptRoot 'stop.ps1') }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use by another application. Choose a different -Port."
}
if (-not $LocalOnly -and (Get-NetTCPConnection -LocalPort 4040 -State Listen -ErrorAction SilentlyContinue)) {
    throw 'Another ngrok agent is using port 4040. Close that agent or use -LocalOnly.'
}
if (-not $NoBuild) {
    Push-Location (Join-Path $projectRoot 'frontend')
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' } }
    finally { Pop-Location }
}
Push-Location $backend
try { & $python -X utf8 -m alembic upgrade head; if ($LASTEXITCODE -ne 0) { throw 'Database setup failed.' } }
finally { Pop-Location }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tracked = @()
function Save-ProcessState($process, $kind) {
    # On Windows, MainModule can briefly report ntdll during process initialization.
    $identity = $null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $identity = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
        if ($identity.ExecutablePath -like '*.exe') { break }
        Start-Sleep -Milliseconds 100
    }
    if (-not $identity.ExecutablePath) { throw 'Could not record the new process identity.' }
    $fresh = Get-Process -Id $process.Id
    $record = [PSCustomObject]@{
        id = $fresh.Id; started = $fresh.StartTime.ToUniversalTime().ToString('o')
        path = $identity.ExecutablePath; kind = $kind
    }
    $script:tracked = @($script:tracked | Where-Object { $_.id -ne $fresh.Id }) + $record
    ConvertTo-Json -InputObject $script:tracked | Set-Content -LiteralPath $stateFile -Encoding utf8
}
try {
    $server = Start-Process -FilePath $python -WorkingDirectory $backend -WindowStyle Hidden -PassThru `
        -ArgumentList @('-X', 'utf8', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$Port") `
        -RedirectStandardOutput (Join-Path $runtime "server-$stamp.log") `
        -RedirectStandardError (Join-Path $runtime "server-$stamp.err.log")
    Save-ProcessState $server 'server-launcher'
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        if ($server.HasExited) { throw "The server stopped. See .run/server-$stamp.err.log." }
        try { $null = Invoke-RestMethod "http://127.0.0.1:$Port/readyz" -TimeoutSec 1; $ready = $true; break }
        catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'The server did not become ready.' }
    $serverListener = Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -First 1
    $serverIdentity = Get-CimInstance Win32_Process -Filter "ProcessId=$($serverListener.OwningProcess)"
    if ($serverIdentity.ProcessId -ne $server.Id -and $serverIdentity.ParentProcessId -ne $server.Id) {
        throw 'The listening process does not belong to the server just started.'
    }
    Save-ProcessState (Get-Process -Id $serverListener.OwningProcess) 'server'
    Write-Host "Local demo: http://127.0.0.1:$Port/demo" -ForegroundColor Green
    if ($LocalOnly) { return }
    $ngrok = (Get-Command ngrok.exe -ErrorAction Stop).Source
    $tunnel = Start-Process -FilePath $ngrok -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
        -ArgumentList @('http', "http://127.0.0.1:$Port", '--inspect=false', '--log=stdout', '--log-format=json') `
        -RedirectStandardOutput (Join-Path $runtime "ngrok-$stamp.log") `
        -RedirectStandardError (Join-Path $runtime "ngrok-$stamp.err.log")
    Save-ProcessState $tunnel 'ngrok'
    $publicUrl = $null
    for ($i = 0; $i -lt 30; $i++) {
        if ($tunnel.HasExited) { throw "ngrok stopped. See .run/ngrok-$stamp.log." }
        try {
            $tunnels = Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 1
            $publicUrl = ($tunnels.tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1).public_url
            if ($publicUrl) { break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    if (-not $publicUrl) { throw 'ngrok did not return an HTTPS address.' }
    Save-ProcessState (Get-Process -Id $tunnel.Id) 'ngrok'
    $demoUrl = "$publicUrl/demo"
    $demoUrl | Set-Content -LiteralPath (Join-Path $runtime 'url.txt') -Encoding utf8
    & $python -c 'import qrcode,sys; qrcode.make(sys.argv[1]).save(sys.argv[2])' $demoUrl (Join-Path $runtime 'phone-demo-qr.png')
    Write-Host "Phone demo: $demoUrl" -ForegroundColor Green
    Write-Host 'Keep this laptop awake. The phone can use Wi-Fi or mobile data.'
    Write-Host 'Stop the demo with scripts/stop.ps1 when finished.'
} catch {
    Write-Warning 'Setup stopped. The tracked processes can be closed with scripts/stop.ps1.'
    throw
}
