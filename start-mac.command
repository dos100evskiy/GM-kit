#!/bin/bash
# Двойной клик в Finder запускает этот файл в Terminal.
cd "$(dirname "$0")" || exit 1

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"

pause_on_error() {
  echo ""
  echo "Нажми любую клавишу, чтобы закрыть окно..."
  read -n 1 -s -r
}

if ! command -v node >/dev/null 2>&1; then
  # Двойной клик не читает ~/.zshrc, поэтому nvm/fnm ищем вручную.
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден."
  echo "Установи LTS-версию с https://nodejs.org и запусти файл снова."
  pause_on_error
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: устанавливаю зависимости, это может занять пару минут..."
  if ! npm install; then
    echo "Не удалось установить зависимости."
    pause_on_error
    exit 1
  fi
fi

node scripts/start.mjs
status=$?
if [ $status -ne 0 ]; then
  pause_on_error
fi
exit $status
