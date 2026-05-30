#!/usr/bin/env bash

set -euo pipefail

export TZ=America/Sao_Paulo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/package.json" ]; then
  APP_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../package.json" ]; then
  APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  echo "[$(date)] ERRO: Não encontrei package.json em:"
  echo "  $SCRIPT_DIR"
  echo "  $SCRIPT_DIR/.."
  exit 1
fi

cd "$APP_DIR" || exit 1

mkdir -p logs

if [ -x "$HOME/.local/share/fnm/fnm" ]; then
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$("$HOME/.local/share/fnm/fnm" env --shell bash)"
elif command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)"
else
  echo "[$(date)] ERRO: fnm não encontrado"
  exit 1
fi

fnm use 24.16.0

echo "=================================================="
echo "[$(date)] Iniciando amazon-monitor"
echo "Usuário: $(whoami)"
echo "Node: $(node -v)"
echo "PNPM: $(pnpm -v)"
echo "Diretório: $(pwd)"
echo "=================================================="

pnpm start

EXIT_CODE=$?

echo "[$(date)] amazon-monitor finalizado com código $EXIT_CODE"
echo ""

exit "$EXIT_CODE"
