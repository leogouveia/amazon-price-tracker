#!/usr/bin/env bash

cd /home/leogouveia/apps/amazon-price-tracker || exit 1

export TZ=America/Sao_Paulo
export PATH="/home/leogouveia/.local/share/fnm:$PATH"

eval "$(/home/leogouveia/.local/share/fnm/fnm env --shell bash)"

fnm use 24

echo "=================================================="
echo "[$(date)] Iniciando amazon-monitor"
echo "Node: $(node -v)"
echo "PNPM: $(pnpm -v)"
echo "Diretório: $(pwd)"
echo "=================================================="

pnpm start

EXIT_CODE=$?

echo "[$(date)] amazon-monitor finalizado com código $EXIT_CODE"
echo ""

exit $EXIT_CODE
