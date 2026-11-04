param([switch]$CheckOnly)

# Run this interactively. Account secrets are never printed or written into the repo.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot 'backend/.venv/Scripts/python.exe'
$ngrokCommand = Get-Command ngrok.exe -ErrorAction SilentlyContinue
if (-not $ngrokCommand) {
    throw 'ngrok is not installed yet. Install ngrok from the Microsoft Store, then try again.'
}
$ngrok = $ngrokCommand.Source
if (-not (Test-Path -LiteralPath $python)) {
    throw 'The project Python environment is missing. Ask Codex to complete the local setup.'
}

& $python -m modal --version
if ($LASTEXITCODE -ne 0) { throw 'The Modal tool is not available in this project.' }
& $ngrok version
if ($LASTEXITCODE -ne 0) { throw 'The ngrok tool did not start.' }
if ($CheckOnly) { exit 0 }

Write-Host ''
Write-Host 'Step 1 of 2: Connect Modal' -ForegroundColor Cyan
Write-Host 'Sign in in the browser and choose the workspace with your hackathon credits.'
Write-Host 'This only connects the account. It does not deploy a worker or start GPU compute.'
& $python -m modal token new
if ($LASTEXITCODE -ne 0) { throw 'Modal login did not complete. You can rerun this script.' }

Write-Host ''
Write-Host 'Step 2 of 2: Connect ngrok' -ForegroundColor Cyan
Write-Host 'Sign in on the page below and copy your authtoken.'
Write-Host 'Paste it into this local prompt only. Nothing will appear while you paste.'
Write-Host 'https://dashboard.ngrok.com/get-started/your-authtoken'
Start-Process 'https://dashboard.ngrok.com/get-started/your-authtoken'
$secureToken = Read-Host 'ngrok authtoken (leave empty to keep existing configuration)' -AsSecureString
if ($secureToken.Length -gt 0) {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $tokenText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
        & $ngrok config add-authtoken $tokenText
        if ($LASTEXITCODE -ne 0) { throw 'ngrok could not save the token.' }
    } finally {
        $tokenText = $null
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
        $secureToken.Dispose()
    }
} else {
    $secureToken.Dispose()
}
& $ngrok config check
if ($LASTEXITCODE -ne 0) { throw 'ngrok configuration is not ready. Rerun this script to finish.' }

Write-Host ''
Write-Host 'Local account setup finished. Tell Codex: setup done.' -ForegroundColor Green
Write-Host 'Codex will verify account access and start the app/tunnel separately.'
