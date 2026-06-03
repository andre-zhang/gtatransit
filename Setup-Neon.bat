@echo off
setlocal
cd /d "%~dp0"
title GTA Transit - load real data into Neon

echo.
echo  ============================================================
echo   Load REAL transit data into your Neon database
echo  ============================================================
echo.
echo  This window will run for 30-60 minutes (TTC is huge).
echo  You can walk away - just do not close it.
echo.

if exist "neon-direct-url.txt" (
  echo  Found neon-direct-url.txt - using your pasted database URL.
  goto :run
)

if exist ".env.local" (
  echo  Found .env.local - using Vercel/Neon settings from there.
  goto :run
)

echo  STEP A - Get your database password string
echo  -----------------------------------------
echo  1. Open https://vercel.com/dashboard
echo  2. Click your GTA Transit project
echo  3. Storage -^> Neon -^> .env.local tab OR Connection details
echo  4. Copy POSTGRES_URL_NON_POOLING or "Direct connection"
echo     ^(must say non-pooling / direct - NOT the pooled URL^)
echo  5. Open Notepad, paste that ONE line, save as:
echo.
echo        %~dp0neon-direct-url.txt
echo.
echo  STEP B - Optional: pull all env vars automatically
echo  -----------------------------------------
echo  If you prefer, run these in a terminal first:
echo    npx vercel login
echo    npx vercel link
echo    npx vercel env pull .env.local
echo.
set /p OK="Press Enter after neon-direct-url.txt exists (or .env.local), or Q to quit: "
if /i "%OK%"=="Q" exit /b 0

if not exist "neon-direct-url.txt" if not exist ".env.local" (
  echo.
  echo  Still missing neon-direct-url.txt and .env.local
  pause
  exit /b 1
)

:run
echo.
echo  Starting import...
echo.
call npx pnpm@9.15.4 load-neon
echo.
pause
