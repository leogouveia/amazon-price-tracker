import { db } from "../database";
import { ensureAdminUser, hashPassword, findUserByLogin, type User } from "../users";
import { createSessionToken } from "../auth";

export function clearAllTables(): void {
  // Tabelas de Telegram primeiro: têm FK para users.
  db.exec(`
    DELETE FROM telegram_link_tokens;
    DELETE FROM telegram_connections;
    DELETE FROM price_history;
    DELETE FROM user_items;
    DELETE FROM products;
    DELETE FROM users;
    DELETE FROM schema_migrations;
  `);
}

export function createTelegramConnection(
  userId: number,
  chatId: string,
  overrides: { enabled?: number; username?: string | null } = {},
): void {
  db.prepare(
    `INSERT INTO telegram_connections
       (user_id, chat_id, telegram_username, enabled, last_interaction_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).run(
    userId,
    chatId,
    overrides.username ?? null,
    overrides.enabled ?? 1,
  );
}

export function createTestAdmin(): User {
  return ensureAdminUser(hashPassword("admin-pass-123"));
}

export function createTestUser(
  email = "test@example.com",
  maxItems = 5,
): User {
  const login = email.toLowerCase();
  db.prepare(
    `INSERT INTO users (login, password_hash, role, max_items)
     VALUES (@login, @passwordHash, 'user', @maxItems)`,
  ).run({
    login,
    passwordHash: hashPassword("user-pass-123"),
    maxItems,
  });
  return findUserByLogin(login) as User;
}

export function sessionHeaderFor(user: User): Record<string, string> {
  const token = createSessionToken(user);
  return { "x-session-token": token };
}
