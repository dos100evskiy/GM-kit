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

echo.
echo Открываю dev-сервер Vite: http://localhost:5173
echo LAN-режим игроков в dev недоступен — используй start-win.cmd.
echo.
call npm run dev -- --open
if errorlevel 1 (
  echo.
  echo Dev-сервер завершился с ошибкой.
  pause
)
