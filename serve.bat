@echo off
setlocal
cd /d "%~dp0"
if not exist "data" mkdir "data"
set "PYTHONIOENCODING=utf-8"
".venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8011 >> "data\server.log" 2>&1
