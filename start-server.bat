@echo off
REM Tashkent Pixel Map - local server (optional: index.html also works by double-click).
REM Requires Python 3.
cd /d "%~dp0"
start "" http://localhost:8080/index.html
python -m http.server 8080
