@echo off
setlocal
rem =========================================================================
rem ChMS Online Host - Runs local PostgreSQL + API and tunnels it to the internet
rem =========================================================================

cd /d C:\Users\HP\Desktop\church

echo [ChMS] Checking PostgreSQL service...
sc query postgresql-x64-16 | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo [ChMS] Starting PostgreSQL...
  net start postgresql-x64-16 >nul 2>&1
)

echo [ChMS] Starting API server on port 4000...
start "ChMS API (:4000)" cmd /k "cd /d C:\Users\HP\Desktop\church && npm run dev:api"

echo [ChMS] Starting Cloudflare HTTPS Tunnel...
timeout /t 3 /nobreak >nul
start "ChMS Cloudflare Tunnel" cmd /k "cd /d C:\Users\HP\Desktop\church && scripts\cloudflared.exe tunnel --url http://localhost:4000"

echo.
echo =========================================================================
echo Both ChMS API and the Online Tunnel have been launched!
echo Look at the "ChMS Cloudflare Tunnel" window to see your public URL.
echo (e.g. https://xxxx.trycloudflare.com)
echo.
echo In your Vercel Dashboard, set:
echo NEXT_PUBLIC_API_URL = https://xxxx.trycloudflare.com/api/v1
echo =========================================================================
pause
