@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\activate.bat" (
  echo Setup has not been completed. Please double-click setup.bat first.
  pause
  exit /b 1
)
call .venv\Scripts\activate.bat
streamlit run app.py
if errorlevel 1 (
  echo The app did not start correctly. Try running setup.bat again.
  pause
  exit /b 1
)
