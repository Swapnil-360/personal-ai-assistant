@echo off
title Mikasa Local Assistant Launcher
echo ==============================================
echo [Mikasa OS] Initializing Localhost & Docker...
echo ==============================================

:: 1. Ensure Docker n8n container is started
echo [*] Checking Docker container 'n8n'...
docker start n8n >nul 2>&1

:: 2. Launch Local Assistant (starts Web Command Center on :3000 and Telegram Bridge)
cd /d "d:\Projects\personal-ai-assistant"
echo [*] Starting Mikasa Assistant Local Core...
node index.js
