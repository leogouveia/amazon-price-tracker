# Telegram por usuário — 2026-06-26

## O que mudou

### Banco de dados
Duas novas tabelas criadas pela migração:
- `telegram_link_tokens` — tokens temporários de vinculação (15 min, uso único)
- `telegram_connections` — conexões ativas por usuário (soft delete via `unlinked_at`)

Nenhuma coluna adicionada à tabela `users`.

### Monitor
O resumo de preços agora é enviado **por usuário**: cada usuário recebe apenas os próprios itens, somente se tiver o Telegram conectado e ativo. Não existe mais mensagem global. Usuários sem conexão são ignorados silenciosamente.

### API — novos endpoints
| Método | Rota | Acesso |
|--------|------|--------|
| GET | `/api/telegram/status` | Autenticado |
| POST | `/api/telegram/link-token` | Autenticado |
| POST | `/api/telegram/test` | Autenticado |
| POST | `/api/telegram/disconnect` | Autenticado |
| POST | `/api/telegram/webhook/:secret` | Público (validado pelo segredo) |

### Frontend
- Seção **Telegram** na tela de produtos (conectar, testar, desconectar)
- Coluna **Telegram** no painel admin com status de cada usuário

---

## Variáveis de ambiente novas (adicionar ao `.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `TELEGRAM_BOT_USERNAME` | Sim (para conexão) | Username do bot sem `@`, ex: `leo_price_tracker_bot` |
| `TELEGRAM_WEBHOOK_SECRET` | Sim (para webhook) | String grande e aleatória — faz parte da URL do webhook |

`TELEGRAM_CHAT_ID` não é mais usado pelo monitor; pode ser mantida ou removida do `.env`.

---

## Pré-requisitos antes do deploy

1. Bot criado no [@BotFather](https://t.me/BotFather) com token e username em mãos
2. API rodando via HTTPS público (já configurado com Caddy)
3. Backup do banco:
   ```bash
   cp prices.db prices.db.bak-$(date +%F)
   ```

---

## Pós-deploy obrigatório

Registrar o webhook do Telegram (uma única vez após o deploy):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://tracker2.leogouveia.com/api/telegram/webhook/$TELEGRAM_WEBHOOK_SECRET"
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Para remover (se necessário):
```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

---

## Rollback

Se necessário reverter:
1. `git checkout main` na revisão anterior
2. Restaurar o banco: `cp prices.db.bak-YYYY-MM-DD prices.db`
3. `pnpm build:web && bash deploy.sh`

As tabelas `telegram_*` não afetam o funcionamento do monitor antigo — o rollback de código é suficiente.
