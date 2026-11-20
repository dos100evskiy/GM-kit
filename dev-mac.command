#!/bin/bash
cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установи LTS с https://nodejs.org"
  read -n 1 -s -r -p "Нажми любую клавишу..."
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install || {
    read -n 1 -s -r -p "Установка не удалась. Нажми любую клавишу..."
    exit 1
  }
fi

echo ""
echo "Открываю dev-сервер Vite: http://localhost:5173"
echo "LAN-режим игроков в dev недоступен — используй start-mac.command."
echo ""
npm run dev -- --open
