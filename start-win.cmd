@echo off
chcp 65001 >nul
title PF2e GM Kit
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js не найден.
  echo Установи LTS-версию с https://nodejs.org и запусти этот файл снова.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Первый запуск: устанавливаю зависимости, это может занять пару минут...
  call npm install
  if errorlevel 1 (
    echo.
    echo Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

node scripts\start.mjs
if errorlevel 1 (
  echo.
  echo Не удалось запустить приложение.
  pause
)
