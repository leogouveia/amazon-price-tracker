# Amazon Price Tracker 🚀

Monitor de preços da Amazon utilizando:

- Node.js
- TypeScript
- pnpm
- Playwright
- SQLite
- Telegram Bot

## Requisitos

- Node.js 24.16.0
- pnpm 11.3.0
- Volta (recomendado)
- Fedora/WSL ou Linux equivalente

---

## Configuração inicial

### Instalar Node e pnpm

Instalar ferramentas:

```bash
volta install node@24.16.0
volta install pnpm@11.3.0
```

Verificar:

```bash
node -v
pnpm -v
```

Resultado esperado:

```txt
v24.16.0
11.3.0
```

---

## Clonar projeto

```bash
git clone <URL_DO_REPOSITORIO>
cd amazon-price-tracker
```

---

## Instalar dependências

```bash
pnpm install
```

---

## Instalar navegadores do Playwright

```bash
pnpm exec playwright install chromium
```

---

## Dependências Linux (Fedora / WSL)

Caso esteja utilizando Fedora/WSL:

```bash
sudo dnf install -y \
atk \
at-spi2-atk \
cups-libs \
libdrm \
libXcomposite \
libXdamage \
libXfixes \
libXrandr \
mesa-libgbm \
pango \
alsa-lib
```

---

## Configurar variáveis de ambiente

Copiar arquivo de exemplo:

```bash
cp .env.example .env
```

Editar:

```env
TELEGRAM_BOT_TOKEN=seu_token
TELEGRAM_CHAT_ID=seu_chat_id
APP_PASSWORD=senha_da_web
SESSION_SECRET=segredo_longo_aleatorio
API_TOKEN=token_para_bruno_scripts
```

Gerar `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

- `APP_PASSWORD` — senha única para login na interface web
- `SESSION_SECRET` — assina o cookie de sessão (nunca expor no frontend)
- `API_TOKEN` — apenas para Bruno/scripts via header `x-api-token` (não usar no browser)

---

## Executar projeto

API (com hot reload):

```bash
pnpm api:dev
```

Frontend:

```bash
pnpm web
```

Monitor de preços (cron/manual):

```bash
pnpm start
```

Acesse a web em `http://localhost:5173` e faça login com `APP_PASSWORD`.

---

## Estrutura

```txt
amazon-price-tracker/
├── src/
├── products.json
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Próximos passos

- [ ] Histórico de preços
- [ ] Integração Telegram
- [ ] Extração de preços Amazon
- [ ] Agendamento automático