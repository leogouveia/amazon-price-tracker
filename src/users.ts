import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./database";
import { isValidLogin, normalizeLogin } from "./utils";

const ACTIVE_USER = "deleted_at IS NULL";
const BCRYPT_ROUNDS = 12;

export type UserRole = "admin" | "user";

export type User = {
  id: number;
  login: string;
  password_hash: string;
  role: UserRole;
  max_items: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UserPublic = {
  id: number;
  login: string;
  role: UserRole;
  max_items: number | null;
  created_at: string;
  updated_at: string;
  active_item_count: number;
};

export type AdminUserListItem = UserPublic & {
  telegram_connected: boolean;
  telegram_username: string | null;
};

export class UserDuplicateActiveError extends Error {
  readonly login: string;

  constructor(login: string) {
    super(`O usuário ${login} já está cadastrado`);
    this.name = "UserDuplicateActiveError";
    this.login = login;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  return bcrypt.compareSync(password, passwordHash);
}

export function generateSecurePassword(length = 16): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*-_";
  const bytes = randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i += 1) {
    password += alphabet[bytes[i]! % alphabet.length];
  }

  return password;
}

export function findUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | User
    | undefined;
}

export function findUserByLogin(login: string): User | undefined {
  const normalized =
    login.trim() === "admin" ? "admin" : login.trim().toLowerCase();
  return db.prepare("SELECT * FROM users WHERE login = ?").get(normalized) as
    | User
    | undefined;
}

export function findActiveUserByLogin(login: string): User | undefined {
  const user = findUserByLogin(login);
  if (!user || user.deleted_at != null) {
    return undefined;
  }
  return user;
}

export function isUserActive(user: User): boolean {
  return user.deleted_at == null;
}

export function countActiveUserItems(userId: number): number {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM user_items
      WHERE user_id = ? AND deleted_at IS NULL
    `,
    )
    .get(userId) as { count: number };

  return row.count;
}

export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    login: user.login,
    role: user.role,
    max_items: user.max_items,
    created_at: user.created_at,
    updated_at: user.updated_at,
    active_item_count: countActiveUserItems(user.id),
  };
}

export function ensureAdminUser(passwordHash: string): User {
  const existing = findUserByLogin("admin");
  if (existing) {
    return existing;
  }

  db.prepare(
    `
    INSERT INTO users (login, password_hash, role, max_items)
    VALUES ('admin', @passwordHash, 'admin', NULL)
  `,
  ).run({ passwordHash });

  return findUserByLogin("admin") as User;
}

export function authenticateUser(login: string, password: string): User | undefined {
  if (!isValidLogin(login)) {
    return undefined;
  }

  const normalizedLogin = normalizeLogin(login);
  const user = findActiveUserByLogin(normalizedLogin);
  if (!user) {
    return undefined;
  }

  return verifyPassword(password, user.password_hash) ? user : undefined;
}

export function listActiveUsersWithStats(): AdminUserListItem[] {
  // Status de Telegram via subconsultas correlacionadas para não inflar o
  // COUNT(ui.id) do GROUP BY com linhas de conexão.
  const rows = db
    .prepare(
      `
      SELECT
        u.id,
        u.login,
        u.role,
        u.max_items,
        u.created_at,
        u.updated_at,
        COUNT(ui.id) AS active_item_count,
        (
          SELECT tc.telegram_username
          FROM telegram_connections tc
          WHERE tc.user_id = u.id AND tc.unlinked_at IS NULL
          LIMIT 1
        ) AS telegram_username,
        EXISTS (
          SELECT 1
          FROM telegram_connections tc
          WHERE tc.user_id = u.id
            AND tc.unlinked_at IS NULL
            AND tc.enabled = 1
        ) AS telegram_connected
      FROM users u
      LEFT JOIN user_items ui
        ON ui.user_id = u.id AND ui.deleted_at IS NULL
      WHERE u.deleted_at IS NULL AND u.role = 'user'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `,
    )
    .all() as Array<{
      id: number;
      login: string;
      role: UserRole;
      max_items: number | null;
      created_at: string;
      updated_at: string;
      active_item_count: number;
      telegram_username: string | null;
      telegram_connected: number;
    }>;

  return rows.map((row) => ({
    id: row.id,
    login: row.login,
    role: row.role,
    max_items: row.max_items,
    created_at: row.created_at,
    updated_at: row.updated_at,
    active_item_count: row.active_item_count,
    telegram_connected: row.telegram_connected === 1,
    telegram_username: row.telegram_username,
  }));
}

export function createUser(params: {
  email: string;
  password: string;
  maxItems: number;
}): User {
  const login = params.email.trim().toLowerCase();
  if (!isValidLogin(login) || login === "admin") {
    throw new Error("E-mail inválido");
  }

  if (!Number.isInteger(params.maxItems) || params.maxItems < 1) {
    throw new Error("Limite de itens deve ser um inteiro positivo");
  }

  const existing = findUserByLogin(login);
  if (existing && isUserActive(existing)) {
    throw new UserDuplicateActiveError(login);
  }

  if (existing && !isUserActive(existing)) {
    throw new Error("Use reactivateUser para reativar usuário excluído");
  }

  db.prepare(
    `
    INSERT INTO users (login, password_hash, role, max_items)
    VALUES (@login, @passwordHash, 'user', @maxItems)
  `,
  ).run({
    login,
    passwordHash: hashPassword(params.password),
    maxItems: params.maxItems,
  });

  return findUserByLogin(login) as User;
}

export function reactivateUser(params: {
  email: string;
  password: string;
  maxItems: number;
}): User {
  const login = params.email.trim().toLowerCase();
  const existing = findUserByLogin(login);

  if (!existing || isUserActive(existing)) {
    throw new Error("Usuário não encontrado para reativação");
  }

  if (!Number.isInteger(params.maxItems) || params.maxItems < 1) {
    throw new Error("Limite de itens deve ser um inteiro positivo");
  }

  db.prepare(
    `
    UPDATE users
    SET password_hash = @passwordHash,
        max_items = @maxItems,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `,
  ).run({
    id: existing.id,
    passwordHash: hashPassword(params.password),
    maxItems: params.maxItems,
  });

  return findUserById(existing.id) as User;
}

export function softDeleteUser(userId: number): boolean {
  const user = findUserById(userId);
  if (!user || !isUserActive(user) || user.role === "admin") {
    return false;
  }

  const result = db
    .prepare(
      `
      UPDATE users
      SET deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND ${ACTIVE_USER} AND role = 'user'
    `,
    )
    .run(userId);

  return result.changes > 0;
}

export function updateUserMaxItems(userId: number, maxItems: number): boolean {
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new Error("Limite de itens deve ser um inteiro positivo");
  }

  const user = findUserById(userId);
  if (!user || !isUserActive(user) || user.role === "admin") {
    return false;
  }

  const result = db
    .prepare(
      `
      UPDATE users
      SET max_items = @maxItems,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND ${ACTIVE_USER}
    `,
    )
    .run({ id: userId, maxItems });

  return result.changes > 0;
}

export function canUserAddItem(user: User): boolean {
  if (user.role === "admin" || user.max_items == null) {
    return true;
  }

  return countActiveUserItems(user.id) < user.max_items;
}

export function getUserItemLimit(user: User): number | null {
  if (user.role === "admin") {
    return null;
  }
  return user.max_items;
}
