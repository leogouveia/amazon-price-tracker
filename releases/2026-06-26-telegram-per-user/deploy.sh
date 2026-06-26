#!/usr/bin/env bash
# Migration: Telegram por usuário — 2026-06-26
# Idempotente: pode ser executado mais de uma vez sem efeitos colaterais.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo ""
echo "=== Migração: Telegram por usuário ==="
echo "Diretório: $APP_DIR"
echo ""

cd "$APP_DIR"

# Verificar .env
if [ ! -f ".env" ]; then
  echo "ERRO: arquivo .env não encontrado em $APP_DIR"
  exit 1
fi

source .env 2>/dev/null || true

# Checar variáveis novas
MISSING_VARS=()
[ -z "${TELEGRAM_BOT_TOKEN:-}" ]     && MISSING_VARS+=("TELEGRAM_BOT_TOKEN")
[ -z "${TELEGRAM_BOT_USERNAME:-}" ]  && MISSING_VARS+=("TELEGRAM_BOT_USERNAME")
[ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ] && MISSING_VARS+=("TELEGRAM_WEBHOOK_SECRET")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "ATENÇÃO: as seguintes variáveis não estão definidas no .env:"
  for v in "${MISSING_VARS[@]}"; do
    echo "  - $v"
  done
  echo ""
  echo "Adicione-as antes de continuar. Consulte releases/2026-06-26-telegram-per-user/CHANGES.md"
  exit 1
fi

echo "[1/3] Backup do banco de dados..."
BACKUP="prices.db.bak-$(date +%F-%H%M%S)"
if [ -f "prices.db" ]; then
  cp prices.db "$BACKUP"
  echo "      Backup criado: $BACKUP"
else
  echo "      prices.db não encontrado — pulando backup."
fi

echo ""
echo "[2/3] Rodando migração (cria tabelas telegram_*)..."
pnpm migrate:multi-user
echo "      Migração concluída."

echo ""
echo "[3/3] Registrando webhook do Telegram..."
WEBHOOK_URL="https://tracker.leogouveia.com/api/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}"
RESPONSE=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${WEBHOOK_URL}")
echo "      Resposta: $RESPONSE"

OK=$(echo "$RESPONSE" | grep -o '"ok":true' || true)
if [ -z "$OK" ]; then
  echo ""
  echo "AVISO: o webhook pode não ter sido registrado. Verifique manualmente:"
  echo "  curl \"https://api.telegram.org/bot\$TELEGRAM_BOT_TOKEN/getWebhookInfo\""
else
  echo "      Webhook registrado com sucesso."
fi

echo ""
echo "=== Migração concluída. Próximo passo: bash deploy.sh ==="
echo ""
