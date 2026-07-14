@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  set PYTHON=.venv\Scripts\python.exe
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    set PYTHON=py -3.12
  ) else (
    set PYTHON=python
  )
)
%PYTHON% -m pip install -r requirements.txt pyinstaller
if errorlevel 1 (
  echo Could not install build dependencies.
  pause
  exit /b 1
)
%PYTHON% -m PyInstaller --noconfirm --clean --windowed --name "MTG Opening Hand Analyzer" --paths src --add-data "data\samples;data\samples" desktop_app.py
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)
echo Built dist\MTG Opening Hand Analyzer\MTG Opening Hand Analyzer.exe
pause
