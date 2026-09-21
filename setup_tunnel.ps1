param(
    [switch]$Quick,
    [switch]$Domain,
    [switch]$InstallService
)

$ErrorActionPreference = "Stop"

# Find cloudflared executable
$cfPath = ""
if (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $cfPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    $cfPath = "C:\Program Files\cloudflared\cloudflared.exe"
} else {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) {
        $cfPath = $cmd.Source
    } else {
        Write-Host "Installing cloudflared via winget..." -ForegroundColor Cyan
        winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements --silent
        $cfPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    }
}

Write-Host ""
Write-Host "Cloudflare Tunnel Manager for Mikasa OS" -ForegroundColor Red
Write-Host "Binary: $cfPath" -ForegroundColor DarkGray
Write-Host ""

if ($Domain) {
    Write-Host "Setting up Permanent Custom Domain Tunnel: mikasa.mrswapnil.me" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Step 1: Logging in to Cloudflare (browser will open)..." -ForegroundColor Yellow
    & $cfPath tunnel login

    Write-Host ""
    Write-Host "Step 2: Creating Tunnel 'mikasa-assistant'..." -ForegroundColor Yellow
    & $cfPath tunnel create mikasa-assistant

    Write-Host ""
    Write-Host "Step 3: Routing DNS for mikasa.mrswapnil.me..." -ForegroundColor Yellow
    & $cfPath tunnel route dns mikasa-assistant mikasa.mrswapnil.me

    Write-Host ""
    Write-Host "Step 4: Starting Tunnel..." -ForegroundColor Green
    & $cfPath tunnel run --url http://localhost:3000 mikasa-assistant
} elseif ($InstallService) {
    Write-Host "Installing Cloudflare Tunnel as Windows Service..." -ForegroundColor Cyan
    & $cfPath service install
} else {
    Write-Host "Launching Quick Cloudflare Tunnel for http://localhost:3000..." -ForegroundColor Green
    Write-Host "Your public HTTPS link will appear below:" -ForegroundColor Yellow
    Write-Host ""
    & $cfPath tunnel --url http://localhost:3000
}
