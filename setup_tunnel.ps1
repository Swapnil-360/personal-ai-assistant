<#
.SYNOPSIS
    Cloudflare Tunnel Manager for Mikasa Autonomous OS (mikasa.mrswapnil.me)
.DESCRIPTION
    Exposes Mikasa Command Center (http://localhost:3000) to the internet with free SSL via Cloudflare Tunnel.
.EXAMPLE
    .\setup_tunnel.ps1 -Quick
    Starts an instant quick tunnel on *.trycloudflare.com
.EXAMPLE
    .\setup_tunnel.ps1 -Domain
    Connects to mikasa.mrswapnil.me using your Cloudflare account DNS
#>

param(
    [switch]$Quick,
    [switch]$Domain,
    [switch]$InstallService
)

$ErrorActionPreference = "Stop"

# Find cloudflared executable
$cfPath = ""
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    $cfPath = "cloudflared"
} elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $cfPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    $cfPath = "C:\Program Files\cloudflared\cloudflared.exe"
} else {
    Write-Host "📦 Installing Cloudflare CLI (cloudflared) via winget..." -ForegroundColor Cyan
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements --silent
    if (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
        $cfPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
    } elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
        $cfPath = "C:\Program Files\cloudflared\cloudflared.exe"
    } else {
        Write-Error "Could not find cloudflared after install. Please restart terminal."
    }
}

Write-Host "`n⚔️ Cloudflare Tunnel Manager for Mikasa OS" -ForegroundColor Red
Write-Host "Binary: $cfPath" -ForegroundColor DarkGray

if ($Domain) {
    Write-Host "`n🌐 Setting up Permanent Custom Domain Tunnel: mikasa.mrswapnil.me" -ForegroundColor Cyan
    Write-Host "Step 1: Logging in to Cloudflare..." -ForegroundColor Yellow
    & $cfPath tunnel login

    Write-Host "`nStep 2: Creating Tunnel 'mikasa-assistant'..." -ForegroundColor Yellow
    & $cfPath tunnel create mikasa-assistant

    Write-Host "`nStep 3: Routing DNS subdomain mikasa.mrswapnil.me..." -ForegroundColor Yellow
    & $cfPath tunnel route dns mikasa-assistant mikasa.mrswapnil.me

    Write-Host "`nStep 4: Launching Tunnel for http://localhost:3000..." -ForegroundColor Green
    & $cfPath tunnel run --url http://localhost:3000 mikasa-assistant
} elseif ($InstallService) {
    Write-Host "`n⚙️ Installing Cloudflare Tunnel as Windows 24/7 Background Service..." -ForegroundColor Cyan
    & $cfPath service install
} else {
    Write-Host "`n⚡ Launching Quick Zero-Config Cloudflare Tunnel for http://localhost:3000..." -ForegroundColor Green
    Write-Host "Your public HTTPS link will appear below within seconds:`n" -ForegroundColor Yellow
    & $cfPath tunnel --url http://localhost:3000
}
