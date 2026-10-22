@echo off
setlocal
rem ChMS launcher — boots the app stack from one double-click.
rem   1) PostgreSQL (native service postgresql-x64-16, Automatic)
rem   2) API  (http://localhost:4000/api/v1)  +  Web  (http://localhost:3000)
rem   3) Worker — ONLY if Redis is listening (BullMQ); otherwise it is skipped.
rem Login once the web window is ready:  slug demo / 0240000000 / admin1234

cd /d C:\Users\HP\Desktop\church

where node >nul 2>&1 || (echo [ChMS] Node.js not found on PATH & pause & exit /b 1)
if not exist node_modules (echo [ChMS] node_modules missing — run "npm install" once first & pause & exit /b 1)

rem --- PostgreSQL up? (service is Automatic; nudge it if stopped) ---
sc query postgresql-x64-16 | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo [ChMS] Starting PostgreSQL service...
  net start postgresql-x64-16 >nul 2>&1 || echo [ChMS] Could not start postgres automatically - open Services and start postgresql-x64-16.
)

rem --- API + Web in their own windows ---
start "ChMS API" cmd /k "cd /d C:\Users\HP\Desktop\church && npm run dev:api"
start "ChMS Web" cmd /k "cd /d C:\Users\HP\Desktop\church && npm run dev:web"

rem --- Worker only when Redis is available ---
netstat -an | findstr ":6379" | findstr /i "LISTENING" >nul
if not errorlevel 1 (
  start "ChMS Worker" cmd /k "cd /d C:\Users\HP\Desktop\church && npm run dev:worker"
) else (
  echo [ChMS] Redis not running - worker skipped (SMS/drip jobs idle). Start redis to enable it.
)

rem --- Open the app once Next.js has had a head start ---
timeout /t 8 /nobreak >nul
start "" http://localhost:3000

echo.
echo [ChMS] Launching... API :4000 · Web :3000 · demo login 0240000000 / admin1234
timeout /t 6 >nul
