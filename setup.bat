@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Please install Python 3.12 from https://www.python.org/downloads/windows/
    pause
    exit /b 1
  )
  set PYTHON=python
) else (
  set PYTHON=py -3.12
)
echo Creating local virtual environment...
%PYTHON% -m venv .venv
if errorlevel 1 (
  echo Could not create the virtual environment. Confirm Python 3.12 is installed.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)
python -m pip install PySide6
if errorlevel 1 (
  echo Desktop GUI dependency installation failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo Setup complete. Double-click run.bat for the browser app or run_desktop.bat for the desktop app.
pause
