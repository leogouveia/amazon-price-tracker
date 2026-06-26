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
| `TELEGRAM_BOT_TOKEN` | Token do bot (@BotFather) |
| `TELEGRAM_BOT_USERNAME` | Username do bot, usado no link de conexão `https://t.me/<bot>?start=<token>` |
| `TELEGRAM_WEBHOOK_SECRET` | Segredo grande na URL do webhook do Telegram |
| `TELEGRAM_CHAT_ID` | Legado/global — não usado pelo fluxo por usuário |

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

O monitor envia um resumo **por usuário**, somente para quem tem o Telegram
conectado e ativo — cada usuário recebe apenas os próprios itens. Não há mais
resumo global. Após o deploy, nenhuma mensagem é enviada até os usuários
conectarem o Telegram.

## Telegram por usuário

Cada usuário conecta o próprio Telegram pela tela de produtos
(seção **Telegram**) e passa a receber alertas só dos seus itens.

Configuração (uma vez):

1. Crie um bot no [@BotFather](https://t.me/BotFather) e copie o token →
   `TELEGRAM_BOT_TOKEN`. Anote o username do bot → `TELEGRAM_BOT_USERNAME`.
2. Defina um segredo grande e aleatório → `TELEGRAM_WEBHOOK_SECRET`.
3. Suba a API em HTTPS público e registre o webhook:

   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://SEU_DOMINIO/api/telegram/webhook/$TELEGRAM_WEBHOOK_SECRET"
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"   # conferir
   ```

Fluxo do usuário: clica em **Conectar Telegram** → abre o bot → `/start` →
recebe confirmação. O `chat_id` vem sempre do webhook (nunca do cliente).
Endpoints: `GET /api/telegram/status`, `POST /api/telegram/link-token`,
`POST /api/telegram/test`, `POST /api/telegram/disconnect` (autenticados) e
`POST /api/telegram/webhook/:secret` (público, validado pelo segredo).

## Documentação da API

Ver [docs/API.md](docs/API.md).

## Papéis

- **admin**: gerencia usuários, vê todos os itens, dispara monitor manual
- **user**: vê e gerencia apenas os próprios itens, respeitando o limite
