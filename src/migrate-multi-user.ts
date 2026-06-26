import "dotenv/config";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { TELEGRAM_SCHEMA_SQL } from "./telegram-schema";

const DB_PATH = "prices.db";
const MIGRATION_NAME = "multi_user_v1";

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { name: string } | undefined;
  return row != null;
}

function columnExists(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  return columns.some((entry) => entry.name === column);
}

function isAlreadyMigrated(db: Database.Database): boolean {
  if (!tableExists(db, "schema_migrations")) {
    return false;
  }

  const row = db
    .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
    .get(MIGRATION_NAME);

  return row != null;
}

function ensureSchemaMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Tabelas de Telegram são idempotentes e independentes da migração multi-user.
// Roda sempre (inclusive em bancos já migrados) para que instalações existentes
// recebam as tabelas ao executar `pnpm migrate:multi-user`. Requer que `users`
// já exista (FK), por isso só é chamada após a checagem de schema legado.
function ensureTelegramSchema(db: Database.Database): void {
  db.exec(TELEGRAM_SCHEMA_SQL);
}

function createNewSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      max_items INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_active
      ON users(login) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asin TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      title TEXT,
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      target_price REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_items_user_product
      ON user_items(user_id, product_id);

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_item_id INTEGER NOT NULL,
      price REAL,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_item_id) REFERENCES user_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_user_item
      ON price_history(user_item_id);

    CREATE INDEX IF NOT EXISTS idx_price_history_checked
      ON price_history(checked_at);

    CREATE INDEX IF NOT EXISTS idx_user_items_user
      ON user_items(user_id);

    CREATE INDEX IF NOT EXISTS idx_products_asin
      ON products(asin);
  `);
}

function migrateLegacyData(db: Database.Database): void {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    throw new Error("APP_PASSWORD não configurado no .env");
  }

  const passwordHash = bcrypt.hashSync(appPassword, 12);

  db.prepare(
    `
    INSERT INTO users (login, password_hash, role, max_items)
    VALUES ('admin', ?, 'admin', NULL)
  `,
  ).run(passwordHash);

  const admin = db
    .prepare("SELECT id FROM users WHERE login = 'admin'")
    .get() as { id: number };

  const legacyProducts = db
    .prepare("SELECT * FROM products_legacy")
    .all() as Array<{
      id: number;
      asin: string;
      url: string;
      title: string | null;
      image_url: string | null;
      target_price: number;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }>;

  const productIdMap = new Map<number, number>();
  const userItemIdMap = new Map<number, number>();

  const insertProduct = db.prepare(`
    INSERT INTO products (asin, url, title, image_url, created_at, updated_at)
    VALUES (@asin, @url, @title, @imageUrl, @createdAt, @updatedAt)
  `);

  const insertUserItem = db.prepare(`
    INSERT INTO user_items (user_id, product_id, target_price, created_at, updated_at, deleted_at)
    VALUES (@userId, @productId, @targetPrice, @createdAt, @updatedAt, @deletedAt)
  `);

  for (const legacy of legacyProducts) {
    let productId = db
      .prepare("SELECT id FROM products WHERE asin = ?")
      .get(legacy.asin) as { id: number } | undefined;

    if (!productId) {
      const result = insertProduct.run({
        asin: legacy.asin,
        url: legacy.url,
        title: legacy.title,
        imageUrl: legacy.image_url,
        createdAt: legacy.created_at,
        updatedAt: legacy.updated_at,
      });
      productId = { id: Number(result.lastInsertRowid) };
    }

    const userItemResult = insertUserItem.run({
      userId: admin.id,
      productId: productId.id,
      targetPrice: legacy.target_price,
      createdAt: legacy.created_at,
      updatedAt: legacy.updated_at,
      deletedAt: legacy.deleted_at,
    });

    const userItemId = Number(userItemResult.lastInsertRowid);
    productIdMap.set(legacy.id, productId.id);
    userItemIdMap.set(legacy.id, userItemId);
  }

  const legacyHistory = db
    .prepare("SELECT * FROM price_history_legacy")
    .all() as Array<{
      id: number;
      product_id: number;
      price: number | null;
      checked_at: string;
    }>;

  const insertHistory = db.prepare(`
    INSERT INTO price_history (user_item_id, price, checked_at)
    VALUES (@userItemId, @price, @checkedAt)
  `);

  for (const entry of legacyHistory) {
    const userItemId = userItemIdMap.get(entry.product_id);
    if (!userItemId) {
      continue;
    }

    insertHistory.run({
      userItemId,
      price: entry.price,
      checkedAt: entry.checked_at,
    });
  }

  void productIdMap;
}

function runMigration(): void {
  const db = new Database(DB_PATH);

  try {
    ensureSchemaMigrations(db);

    if (isAlreadyMigrated(db)) {
      ensureTelegramSchema(db);
      console.log(
        "Migração multi-usuário já aplicada. Tabelas de Telegram garantidas.",
      );
      return;
    }

    const hasLegacyProducts =
      tableExists(db, "products") &&
      columnExists(db, "products", "target_price") &&
      !tableExists(db, "user_items");

    db.exec("BEGIN");

    if (hasLegacyProducts) {
      console.log("Detectado schema legado. Migrando...");

      db.exec(`
        ALTER TABLE products RENAME TO products_legacy;
        ALTER TABLE price_history RENAME TO price_history_legacy;
      `);

      createNewSchema(db);
      migrateLegacyData(db);

      db.exec(`
        DROP TABLE price_history_legacy;
        DROP TABLE products_legacy;
      `);
    } else {
      console.log("Criando schema multi-usuário em banco novo ou parcial...");
      createNewSchema(db);

      const appPassword = process.env.APP_PASSWORD;
      if (!appPassword) {
        throw new Error("APP_PASSWORD não configurado no .env");
      }

      const passwordHash = bcrypt.hashSync(appPassword, 12);
      db.prepare(
        `
        INSERT OR IGNORE INTO users (login, password_hash, role, max_items)
        VALUES ('admin', ?, 'admin', NULL)
      `,
      ).run(passwordHash);
    }

    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(
      MIGRATION_NAME,
    );

    db.exec("COMMIT");

    ensureTelegramSchema(db);

    console.log("Migração multi-usuário concluída com sucesso.");
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("Falha na migração:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

runMigration();
