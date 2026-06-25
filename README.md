# Amazon Price Tracker

Monitor de preços da Amazon com multiusuário, limites por conta e painel admin.

- Node.js + TypeScript + Hono + Preact + SQLite + Playwright + Telegram

## Requisitos

- Node.js 24.16.0
- pnpm 11.3.0

## Configuração

```bash
cp .env.example .env
pnpm install
pnpm exec playwright install chromium
```

Variáveis principais:

| Variável | Descrição |
|----------|-----------|
| `APP_PASSWORD` | Senha inicial do usuário `admin` (usada na migração) |
| `SESSION_SECRET` | Assinatura do cookie de sessão |
| `API_TOKEN` | Token de serviço (`x-api-token`, privilégios de admin) |
| `TELEGRAM_*` | Notificações do monitor |

## Migração multiusuário

**Obrigatória** ao atualizar de uma versão single-user. Faça backup antes:

```bash
cp prices.db prices.db.bak-$(date +%F)
pnpm migrate:multi-user
```

A migração:

- Cria tabelas `users`, `products` (canônico por ASIN), `user_items`, `price_history`
- Cria usuário `admin` com hash de `APP_PASSWORD`
- Associa produtos existentes ao admin
- Preserva histórico de preços

## Login

| Usuário | Identificador | Senha |
|---------|---------------|-------|
| Admin | `admin` | Valor de `APP_PASSWORD` na migração |
| Comum | E-mail cadastrado | Senha gerada pelo admin |

## Limites de itens

- Cada usuário comum tem `max_items` definido pelo admin
- Apenas itens **ativos** contam no limite
- Validação no backend em `POST /api/products`
- Admin não tem limite

## Desenvolvimento

```bash
pnpm migrate:multi-user   # se ainda não rodou
pnpm dev
```

Web: `http://localhost:5173` — API: `http://localhost:3000`

## Deploy na VM

```bash
cd ~/apps/amazon-price-tracker
cp prices.db prices.db.bak-$(date +%F)
git pull
pnpm install
pnpm migrate:multi-user
pnpm build:web
./deploy.sh
```

## Monitor

```bash
pnpm start                 # CLI
POST /api/monitor/run      # Web (somente admin)
```

## Documentação da API

Ver [docs/API.md](docs/API.md).

## Papéis

- **admin**: gerencia usuários, vê todos os itens, dispara monitor manual
- **user**: vê e gerencia apenas os próprios itens, respeitando o limite
