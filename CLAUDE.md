# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`amazon-price-tracker` is a small self-hosted Amazon BR price tracker.

It has:

- TypeScript backend
- Preact frontend
- SQLite database
- Playwright scraper
- Telegram price summary
- Multi-user authentication with admin/user roles
- Per-user tracked items with shared canonical products by ASIN

Avoid large rewrites. Prefer small, incremental changes that preserve the current architecture.

---

## Commands

```bash
pnpm dev                  # API (port 3000) + frontend (port 5173) concurrently
pnpm api:dev              # API only, with hot reload (tsx watch)
pnpm web                  # Frontend only (Vite)
pnpm build:web            # Production frontend build
pnpm start                # Run price monitor CLI (one-shot)
pnpm migrate:multi-user   # Run DB migration (required on fresh install or after pull)
```

**PM2 (production API only):**

```bash
pnpm api:start
pnpm api:stop
pnpm api:restart
pnpm api:logs
```

There are no automated tests. `pnpm test` exits `1` by design.

After making changes, verify with:

```bash
pnpm build:web
```

---

## Runtime / production notes

Production currently runs on a Linux VPS.

Important assumptions:

- Ubuntu 24.04 LTS
- Node.js 24.x via `fnm`
- pnpm via Corepack
- SQLite database stored locally
- Price monitor is scheduled by Linux `crontab`
- API may be managed by PM2
- Playwright Chromium must be installed on the server

Do not assume Docker or Kubernetes.

The price monitor is a one-shot script. It starts, checks products, sends Telegram summary, and exits. It is better suited to `crontab` than PM2.

Expected cron style:

```cron
15 7,10,13,16,20,23 * * * /home/leogouveia/apps/amazon-price-tracker/run-monitor.sh >> /home/leogouveia/apps/amazon-price-tracker/logs/cron.log 2>&1
```

If changing monitor execution, update `run-monitor.sh`, cron documentation, and README/deploy notes.

---

## Deploy

If `deploy.sh` exists, inspect it before changing deployment behavior.

Typical safe deploy flow:

```bash
git pull
pnpm install
pnpm migrate:multi-user
pnpm build:web
```

If the API is running via PM2:

```bash
pnpm api:restart
```

The cron-based monitor does not need restart after code changes. It will use the updated code on the next scheduled run.

Do not modify production database destructively without a migration and backup guidance.

---

## Architecture

This is a single-package project: one `package.json` at the root, with a TypeScript backend and a Preact frontend sharing the same repo.

### Backend (`src/*.ts`)

- **`server.ts`** — Hono HTTP server on port 3000. All routes are under `/api`. Auth middleware runs on `/api/*` and skips explicitly public routes. Admin guard runs on `/api/admin/*`.
- **`database.ts`** — SQLite via `better-sqlite3`. Opens `prices.db` at startup and runs `ensureNewSchema()` synchronously. Also contains the Playwright scraper (`fetchProductInfo`).
- **`users.ts`** — User CRUD, bcrypt password hashing, role logic, soft delete/reactivation logic.
- **`auth.ts`** — Custom session tokens: base64url-encoded JSON + HMAC-SHA256 signature. Supports cookie session, `Authorization: Bearer`, and `x-session-token` header. Service requests may use `x-api-token`.
- **`monitor.ts`** — Price monitor. Deduplicates by ASIN, scrapes each active product once, saves price history per active `user_item_id`, and sends Telegram summary.
- **`telegram.ts`** — Sends HTML-formatted messages via the Bot API. Silently no-ops if Telegram env vars are missing.
- **`utils.ts`** — ASIN extraction regex, price parsing in BRL format, target price normalization, login validation.

### Frontend (`src/web/`)

- Preact + `preact-iso` for routing.
- Routes:
  - `/` product list
  - `/products/:asin` detail + chart
  - `/new` add product
  - `/admin` admin panel

- `src/web/lib/auth.tsx` — `AuthProvider` / `useAuth` context. Calls `GET /api/auth/me` on mount to restore session.
- `src/web/lib/api.ts` — `apiFetch` wrapper. Uses `credentials: "include"` and `Content-Type: application/json`.
- Vite proxies `/api/*` → `http://localhost:3000` in development.
- Styling: Tailwind CSS v4 + DaisyUI v5.

---

## Database schema

Current logical schema:

```text
users
  id
  login
  password_hash
  role              -- admin | user
  max_items
  deleted_at

products
  id
  asin              -- UNIQUE
  url
  title
  image_url

user_items
  id
  user_id
  product_id
  target_price
  deleted_at

price_history
  id
  user_item_id
  price
  checked_at

schema_migrations
```

### Canonical product model

`products` is canonical and shared across users.

When two users track the same ASIN:

- there is one row in `products`
- there are multiple rows in `user_items`
- each `user_items` row belongs to one user
- price history is stored per `user_item_id`

The monitor should scrape once per ASIN and fan out the price record to all active `user_item_id`s for that product.

### Soft delete

Soft delete is used for users and user items.

Active records use:

```sql
deleted_at IS NULL
```

Deleted records use:

```sql
deleted_at IS NOT NULL
```

Rules:

- Do not hard-delete users.
- Do not hard-delete user items.
- Soft-deleted users cannot log in.
- Soft-deleted users should not appear in normal admin lists unless explicitly requested.
- Soft-deleted user items should not appear in normal product lists.
- Soft-deleted user items should not be processed by the monitor.
- Soft-deleted user items should not count toward the active item limit.
- Price history must be preserved.

### User reactivation

If admin creates a user with a login/e-mail that already exists as soft-deleted:

- do not create a duplicate active user
- reactivate the existing user
- clear `deleted_at`
- generate a new random password
- replace `password_hash`
- require/admin-provide a new `max_items` value
- do not restore old soft-deleted items
- inform the admin that the user already existed and was reactivated

If the login/e-mail already exists as an active user, return a friendly error.

If using a unique index, ensure it supports the intended reactivation behavior. Do not introduce duplicate active users with the same login.

---

## Authentication and authorization

### Login

The login identifier can be:

- the literal string `admin`
- a valid e-mail address

The admin user logs in with:

```text
login: admin
password: APP_PASSWORD-created initial password
```

Regular users log in with:

```text
login: user e-mail
password: admin-generated random password
```

### Passwords

Never store plaintext passwords.

Use secure hashing, currently bcrypt unless the project already switched to another algorithm.

Do not log passwords, generated passwords, password hashes, session tokens, or API tokens.

Generated passwords should only be shown to the admin once at creation/reactivation time.

### Authorization rules

Backend authorization is mandatory. Do not rely only on frontend hiding.

- Regular users can only see and manage their own active items.
- Regular users cannot access `/api/admin/*`.
- Regular users cannot list users.
- Regular users cannot run manual global price updates.
- Admin can manage users and user items.
- Admin-only routes must be protected server-side.
- Service/API-token requests should be limited to intended internal operations.

---

## Item limit rules

Each regular user has a maximum number of active tracked items.

Rules:

- `max_items` is defined by admin.
- Backend must prevent creating more active items than allowed.
- Frontend should display current usage and limit.
- Frontend should disable or warn when the limit is reached.
- The limit counts active `user_items` only.
- Soft-deleted items do not count toward the limit.

Example UI copy:

```text
Você cadastrou 3 de 10 itens permitidos.
```

---

## Monitor rules

The price monitor must:

- only process active `user_items` (`deleted_at IS NULL`)
- deduplicate scraping by ASIN — scrape once, fan out to all active `user_item_id`s for that product
- send Telegram summary if env vars are configured
- avoid overlapping runs

If the same ASIN is re-added after soft deletion, reuse the canonical `products` row.

---

## Scraper rules

The Amazon scraper is fragile by nature. Avoid aggressive bypass behavior.

Allowed:

- wait for page load
- handle Amazon's "Continuar comprando" intermediate page
- save debug screenshot and HTML when price parsing fails
- improve selectors
- parse BRL prices robustly

Not allowed:

- captcha solving
- proxy rotation
- aggressive anti-bot bypass
- high-frequency scraping loops

When a price cannot be parsed, save debug artifacts in `logs/` and log the final URL.

---

## Key conventions

### Target price

Target price is stored as `REAL`.

Current convention:

```text
0 = no target
```

Use helper functions:

- `resolveTargetPrice()` normalizes `null`, `0`, negative values → `null`
- `targetPriceForDb()` converts `null` → `0` for storage

Do not introduce inconsistent handling of target price.

### Admin login

Admin login is the literal string:

```text
admin
```

Regular users must use valid e-mail addresses.

### CORS

CORS is configured with a dynamic origin allowlist in `server.ts`.

`capacitor://` and `ionic://` origins are always allowed for mobile app support.

Do not loosen CORS to `*` when credentials/cookies are involved.

### Scraper debug

When a price cannot be parsed, the scraper saves screenshot and HTML dump to `logs/`.

### Monitor concurrency guard

`monitorRunning` in `monitor.ts` prevents overlapping runs.

The `/api/monitor/run` endpoint returns `409` if the monitor is already running.

Manual monitor execution must remain admin-only.

---

## Environment variables

| Variable             | Required                         | Purpose                                    |
| -------------------- | -------------------------------- | ------------------------------------------ |
| `SESSION_SECRET`     | Yes                              | HMAC key for session tokens                |
| `APP_PASSWORD`       | Initial migration/admin creation | Initial `admin` password                   |
| `API_TOKEN`          | Recommended                      | Service auth via `x-api-token`             |
| `TELEGRAM_BOT_TOKEN` | For monitor                      | Telegram Bot API token                     |
| `TELEGRAM_CHAT_ID`   | For monitor                      | Target chat/channel                        |
| `CORS_ORIGINS`       | No                               | Comma-separated additional allowed origins |
| `NODE_ENV`           | No                               | `production` enables `Secure` cookie flag  |

---

## Migration rules

`pnpm migrate:multi-user` must be run:

- on fresh install
- after pulling schema changes
- before first production use after multi-user changes

Migration must be idempotent.

Initial admin creation reads `APP_PASSWORD` from env. If the admin already exists, migration must not overwrite the admin password.

Before changing migrations, consider existing production data.

---

## Development notes

- Keep backend authorization checks close to the routes or service functions they protect.
- Update README when changing setup, migration, deploy, or environment variables.
- The production environment is a Linux VPS with cron + PM2 — do not introduce Docker-only assumptions.
