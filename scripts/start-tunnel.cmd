@echo off
setlocal
cd /d C:\Users\HP\Desktop\church
echo [ChMS] Starting Cloudflare Tunnel on port 4000...
scripts\cloudflared.exe tunnel --url http://localhost:4000
pause
