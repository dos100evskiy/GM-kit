@echo off
chcp 65001 >nul
title PF2e GM Kit — dev
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установи LTS с https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run dev
pause
