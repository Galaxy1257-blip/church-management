@echo off
setlocal
cd /d C:\Users\HP\Desktop\church
echo [ChMS] Checking PostgreSQL service...
sc query postgresql-x64-16 | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo [ChMS] Starting PostgreSQL...
  net start postgresql-x64-16 >nul 2>&1
)
echo [ChMS] Starting ChMS API on port 4000...
npm run dev:api
pause
