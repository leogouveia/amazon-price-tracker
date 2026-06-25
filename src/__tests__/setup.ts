import { db } from "../database";
import { ensureAdminUser, hashPassword, findUserByLogin, type User } from "../users";
import { createSessionToken } from "../auth";

export function clearAllTables(): void {
  db.exec(`
    DELETE FROM price_history;
    DELETE FROM user_items;
    DELETE FROM products;
    DELETE FROM users;
    DELETE FROM schema_migrations;
  `);
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
