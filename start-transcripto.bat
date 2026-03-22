@echo off
setlocal enabledelayedexpansion

REM Transcripto Launcher (Batch Version)
REM This script launches the Transcripto app

set "PNPM=%APPDATA%\npm\pnpm.cmd"

if not exist "%PNPM%" (
    echo Error: pnpm not found at %PNPM%
    echo Please install Node.js and pnpm first.
    pause
    exit /b 1
)

cd /d "%~dp0"
"%PNPM%" start
pause
