@echo off
cd /d "%~dp0"
set PORT=4173
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%PORT%"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)
where node >nul 2>nul
if %errorlevel%==0 (
  node tools\server.mjs %PORT%
  goto :eof
)
echo Serve Python 3 oppure Node.js per avviare la prova locale.
echo In alternativa pubblica la cartella su GitHub Pages o Vercel.
pause
