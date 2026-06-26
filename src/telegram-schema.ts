// DDL compartilhado das tabelas de Telegram.
//
// Usado tanto em `ensureNewSchema()` (database.ts, roda em todo startup) quanto
// na migração (`migrate-multi-user.ts`). Mantém-se idempotente: apenas
// `CREATE TABLE/INDEX IF NOT EXISTS`, sem alterar tabelas existentes.
//
// Não adiciona colunas de Telegram em `users`: a conexão vive em tabelas
// próprias e é vinculada por `user_id`.
export const TELEGRAM_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id
    ON telegram_link_tokens(user_id);

  CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token
    ON telegram_link_tokens(token);

  CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_at
    ON telegram_link_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS telegram_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chat_id TEXT NOT NULL,
    telegram_user_id TEXT,
    telegram_username TEXT,
    telegram_first_name TEXT,
    telegram_last_name TEXT,
    telegram_language_code TEXT,
    telegram_chat_type TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_interaction_at TEXT,
    unlinked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- No máximo uma conexão ativa por usuário e por chat.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_connections_user_active
    ON telegram_connections(user_id) WHERE unlinked_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_connections_chat_active
    ON telegram_connections(chat_id) WHERE unlinked_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_telegram_connections_user_id
    ON telegram_connections(user_id);

  CREATE INDEX IF NOT EXISTS idx_telegram_connections_telegram_user_id
    ON telegram_connections(telegram_user_id);
`;
