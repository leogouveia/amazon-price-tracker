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
```

---

## Executar projeto

Modo desenvolvimento:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Executar versão compilada:

```bash
pnpm start
```

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