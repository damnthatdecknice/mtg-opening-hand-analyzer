@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\pythonw.exe" (
  start "" ".venv\Scripts\pythonw.exe" desktop_app.py
  exit /b 0
)
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" desktop_app.py
  exit /b %errorlevel%
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3.12 desktop_app.py
  exit /b %errorlevel%
)
where python >nul 2>nul
if not errorlevel 1 (
  python desktop_app.py
  exit /b %errorlevel%
)
echo Python was not found. Run setup.bat first or install Python 3.12.
pause
exit /b 1
