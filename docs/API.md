# Amazon Price Tracker — Documentação da API

API REST para monitorar preços de produtos na Amazon. Base URL padrão em desenvolvimento:

```
http://localhost:3000
```

Em produção, use o domínio configurado (ex.: `https://tracker2.leogouveia.com` via proxy reverso).

Todas as rotas da API estão sob o prefixo `/api`.

---

## Autenticação

Rotas protegidas exigem **uma** das formas abaixo.

### 1. Sessão web (cookie)

Após `POST /api/auth/login`, o servidor define o cookie `session` (`httpOnly`, `SameSite=Lax`, 7 dias).

No browser, envie requisições com:

```http
Cookie: session=<token>
```

No frontend web, use `fetch` com `credentials: "include"`.

### 2. Sessão mobile (Bearer)

No login com `client: "mobile"` ou header `X-Client: mobile`, a resposta inclui `token`. Envie nas requisições:

```http
Authorization: Bearer <token>
```

Alternativa:

```http
x-session-token: <token>
```

O token expira em **7 dias** (mesmo prazo do cookie).

### 3. Token de serviço (automação)

Para scripts, cron ou integrações sem login interativo:

```http
x-api-token: <API_TOKEN>
```

Configure `API_TOKEN` no `.env` do servidor. **Não** embuta esse valor em apps mobile distribuídos (APK/IPA).

### Rotas públicas (sem autenticação)

| Método | Rota |
|--------|------|
| GET | `/api/health` |
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |

`GET /api/auth/me` retorna `401` se não houver sessão/token válido.

### Resposta de erro de autenticação

```json
{ "error": "Não autorizado" }
```

Status: **401**

---

## CORS

Aplicado em `/api/*` para clientes browser/WebView.

| Ambiente | Origens padrão |
|----------|----------------|
| Produção | `https://tracker2.leogouveia.com` |
| Desenvolvimento | `localhost` / `127.0.0.1` nas portas 5173, 8081, 8082 |

Também aceitas automaticamente: `capacitor://*`, `ionic://*`, `http(s)://localhost`.

Variável opcional no servidor:

```env
CORS_ORIGINS=https://meu-dominio.com,https://outro.com
```

Headers permitidos: `Content-Type`, `Authorization`, `x-api-token`, `x-session-token`, `x-client`.

`credentials: true` — necessário para cookies no browser.

**Apps nativos** (React Native, Flutter, etc.) **não** passam por CORS; autentiquem com Bearer ou `x-api-token`.

---

## Variáveis de ambiente (servidor)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `APP_PASSWORD` | Sim (migração) | Senha inicial do usuário `admin` (hash criado na migração) |
| `SESSION_SECRET` | Sim | Assinatura HMAC do token de sessão |
| `API_TOKEN` | Recomendada | Token fixo para `x-api-token` |
| `TELEGRAM_BOT_TOKEN` | Para monitor | Bot Telegram |
| `TELEGRAM_CHAT_ID` | Para monitor | Chat Telegram |
| `CORS_ORIGINS` | Não | Lista de origens separadas por vírgula |
| `NODE_ENV` | Não | `production` ativa cookie `Secure` |

---

## Convenções

- **Content-Type:** `application/json` em POST/DELETE com corpo.
- **Datas:** SQLite em UTC, formato `"YYYY-MM-DD HH:MM:SS"` (sem `T`).
- **Preço alvo:** `0` ou ausente = sem alvo definido.
- **ASIN:** 10 caracteres alfanuméricos na URL Amazon (`/dp/...` ou `/gp/product/...`).

---

## Endpoints

### Saúde

#### `GET /api/health`

Público. Verifica se a API está no ar.

**Resposta 200**

```json
{ "status": "ok" }
```

---

### Autenticação

#### `POST /api/auth/login`

Público. Valida identificador e senha e inicia sessão.

**Corpo**

```json
{
  "login": "admin",
  "password": "sua-senha",
  "client": "mobile"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `login` | string | Sim | E-mail válido ou `admin` |
| `password` | string | Sim | Senha do usuário |
| `client` | string | Não | Use `"mobile"` para receber `token` no JSON |

**Header opcional:** `X-Client: mobile` (equivalente a `client: "mobile"`).

**Resposta 200 (web)**

```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "login": "admin",
    "role": "admin",
    "max_items": null,
    "active_item_count": 3
  }
}
```

+ cookie `session`.

**Resposta 200 (mobile)**

```json
{
  "authenticated": true,
  "token": "<session-token>"
}
```

**Erros**

| Status | Corpo |
|--------|--------|
| 401 | `{ "error": "Credenciais inválidas" }` |
| 500 | `{ "error": "Autenticação indisponível" }` |

---

#### `POST /api/auth/logout`

Público. Remove o cookie de sessão.

**Resposta 200**

```json
{ "ok": true }
```

No mobile, descarte o token localmente.

---

#### `GET /api/auth/me`

Público na rota, mas exige credencial válida para sucesso.

**Resposta 200**

```json
{ "authenticated": true }
```

Aceita cookie, Bearer, `x-session-token` ou `x-api-token`.

**Erro 401**

```json
{ "error": "Não autorizado" }
```

---

### Produtos

#### `GET /api/products`

Lista itens ativos do usuário logado.

**Resposta 200**

```json
{
  "items": [ "...ProductPriceSummary..." ],
  "usage": {
    "active": 3,
    "max": 10
  }
}
```

`usage.max` é `null` para admin (sem limite).

---

#### `GET /api/products/:asin`

Detalhe de um produto (mesmo formato de `ProductPriceSummary`).

**Parâmetros**

| Nome | Descrição |
|------|-----------|
| `asin` | ASIN do produto |

**Resposta 200** — objeto `ProductPriceSummary`.

**Erro 404**

```json
{ "error": "Produto não encontrado" }
```

---

#### `GET /api/products/:asin/history`

Histórico de preços com valor não nulo, ordenado por data **crescente**.

**Resposta 200** — array de `PriceHistoryEntry`:

```json
[
  { "price": 120.0, "checked_at": "2026-01-10 14:00:00" },
  { "price": 95.0, "checked_at": "2026-01-19 08:00:00" },
  { "price": 89.9, "checked_at": "2026-01-20 12:00:00" }
]
```

**Erro 404** — produto inexistente ou removido (soft delete).

---

#### `POST /api/products`

Cadastra produto. Se `title` / `imageUrl` / `currentPrice` forem enviados, não dispara scrape na hora (usa preview). Caso contrário, abre a página na Amazon com Playwright.

**Corpo**

```json
{
  "url": "https://www.amazon.com.br/dp/B0XXXXXXXX",
  "targetPrice": 99.9,
  "title": "Opcional",
  "imageUrl": "https://...",
  "currentPrice": 109.9
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `url` | string | Sim | URL Amazon com ASIN |
| `targetPrice` | number \| null | Não | Preço alvo em BRL |
| `title` | string \| null | Não | Título (evita scrape se enviado com outros campos de preview) |
| `imageUrl` | string \| null | Não | URL da imagem |
| `currentPrice` | number \| null | Não | Preço inicial no histórico |

**Resposta 200** — objeto `Product` (campos do banco: `id`, `asin`, `url`, `title`, `image_url`, `target_price`, `created_at`, `updated_at`).

**Erro 403** — limite de itens atingido (usuário comum).

**Erro 409** — produto já monitorado pelo usuário.

```json
{
  "error": "O produto B0XXXXXXXX já está sendo monitorado",
  "asin": "B0XXXXXXXX"
}
```

---

#### `POST /api/products/preview`

Consulta Amazon sem salvar (útil antes de cadastrar).

**Corpo**

```json
{
  "url": "https://www.amazon.com.br/dp/B0XXXXXXXX",
  "targetPrice": 99.9
}
```

**Resposta 200**

```json
{
  "asin": "B0XXXXXXXX",
  "url": "https://...",
  "targetPrice": 99.9,
  "title": "Nome",
  "imageUrl": "https://...",
  "currentPrice": 109.9,
  "willReactivate": false
}
```

`willReactivate: true` se o produto existia mas estava removido (soft delete).

**Erros**

| Status | Descrição |
|--------|-----------|
| 400 | URL ausente ou inválida |
| 409 | Produto já ativo |
| 500 | Falha no scrape |

---

#### `DELETE /api/products/:asin`

Remove produto (soft delete: `deleted_at` preenchido).

**Resposta 200**

```json
{ "ok": true }
```

**Erro 404**

```json
{ "error": "Produto não encontrado" }
```

---

### Monitoramento

#### `POST /api/monitor/run`

Executa verificação de preços de **todos** os itens ativos. **Somente admin** (ou `x-api-token`).

Apenas uma execução por vez.

**Resposta 200**

```json
{
  "checked": 3,
  "errors": [
    {
      "productId": 2,
      "asin": "B0YYYYYYYY",
      "message": "Timeout"
    }
  ],
  "durationMs": 45000
}
```

| Campo | Descrição |
|-------|-----------|
| `checked` | Produtos processados com sucesso |
| `errors` | Falhas por produto |
| `durationMs` | Duração total em milissegundos |

**Erro 403** — usuário comum.

**Erro 409** — monitor já em execução:

```json
{ "error": "Monitoramento já em execução" }
```

**Nota:** pode levar vários minutos conforme a quantidade de produtos. A requisição HTTP aguarda até o fim (síncrona).

---

### Admin (somente `role: admin` ou `x-api-token`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/users` | Lista usuários ativos com contagem de itens |
| POST | `/api/admin/users` | Cria ou reativa usuário (`email`, `maxItems`) |
| PATCH | `/api/admin/users/:id` | Atualiza `maxItems` |
| DELETE | `/api/admin/users/:id` | Soft delete do usuário |
| GET | `/api/admin/users/:id/products` | Itens ativos do usuário |
| DELETE | `/api/admin/users/:id/products` | Soft delete de todos os itens |
| DELETE | `/api/admin/users/:id/products/:asin` | Soft delete de um item |

**POST /api/admin/users** — resposta inclui `generatedPassword` (exibir uma vez). Se `reactivated: true`, o e-mail existia com soft delete; itens antigos não são restaurados.

---

## Exemplos

### Web (cookie)

```bash
# Login
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"sua-senha"}'

# Listar produtos
curl -b cookies.txt http://localhost:3000/api/products
```

### Mobile (Bearer)

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client: mobile" \
  -d '{"login":"admin","password":"sua-senha"}' | jq -r .token)

# Listar produtos
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/products
```

### Automação (`x-api-token`)

```bash
curl -H "x-api-token: $API_TOKEN" \
  -X POST http://localhost:3000/api/monitor/run
```

---

## Códigos de status HTTP

| Status | Uso |
|--------|-----|
| 200 | Sucesso |
| 400 | Validação (URL inválida, etc.) |
| 401 | Não autenticado |
| 403 | Sem permissão (admin) ou limite de itens |
| 404 | Recurso não encontrado |
| 409 | Conflito (duplicado, monitor em execução) |
| 500 | Erro interno / scrape / Telegram |

---

## CLI

O mesmo monitor pode ser executado pela linha de comando (sem HTTP):

```bash
pnpm start
```

Equivalente a `runPriceMonitor()` usado em `POST /api/monitor/run`.
