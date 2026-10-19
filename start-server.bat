@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   SanXiao Xiao Jing - local server
echo   http://localhost:8080/
echo   Press Ctrl+C to stop.
echo.
start "" http://localhost:8080/
python -m http.server 8080
if errorlevel 1 (
  echo.
  echo   Python not found. Open dist\SanXiao.html directly instead.
  pause
)
