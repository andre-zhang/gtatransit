@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Starting PostGIS...
  docker compose up -d
  timeout /t 8 /nobreak >nul
  call npx pnpm@9.15.4 db:migrate
  set DEMO_MODE=
) else (
  echo Docker not found — DEMO_MODE ^(GTFS-based route list if built^).
  set DEMO_MODE=1
  if not exist "data\gtfs\go.zip" (
    echo Fetching GTFS feeds...
    call npx pnpm@9.15.4 fetch-gtfs
  )
  echo Building demo fixtures from GTFS...
  call npx pnpm@9.15.4 build-demo
)

start "GTA RT Poller" cmd /k "cd /d %~dp0 && set DEMO_MODE=%DEMO_MODE% && npx pnpm@9.15.4 rt:poll"
start "GTA Transit Web" cmd /k "cd /d %~dp0 && set DEMO_MODE=%DEMO_MODE% && npx pnpm@9.15.4 dev"

echo.
echo Open http://localhost:3001
echo Close the two command windows to stop.
pause
