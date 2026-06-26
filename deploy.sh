#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="/var/www/amazon-price-tracker"
PM2_PROCESS="amazon-api"

echo "🚀 Iniciando deploy..."

cd "$APP_DIR"

echo "📥 Atualizando código..."
git pull

echo "📦 Instalando dependências..."
pnpm install --frozen-lockfile

echo "🗄️ Rodando migrações..."
pnpm migrate:multi-user

echo "🏗️ Buildando frontend..."
pnpm build:web

echo "🌐 Publicando frontend em $WEB_DIR..."
sudo mkdir -p "$WEB_DIR"
sudo rsync -av --delete dist/ "$WEB_DIR/"

echo "🔐 Ajustando permissões..."
sudo chown -R caddy:caddy "$WEB_DIR"

echo "🔁 Reiniciando API no PM2..."
if pnpm exec pm2 describe "$PM2_PROCESS" > /dev/null 2>&1; then
  pnpm exec pm2 restart "$PM2_PROCESS"
else
  pnpm api:start
fi

echo "💾 Salvando estado do PM2..."
pnpm exec pm2 save

echo "♻️ Recarregando Caddy..."
sudo systemctl reload caddy

echo "✅ Deploy concluído!"