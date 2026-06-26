import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import { chromium, type Page } from "playwright";
import { TELEGRAM_SCHEMA_SQL } from "./telegram-schema";
import type { User } from "./users";
import { extractASIN, parsePrice, targetPriceForDb } from "./utils";

const ACTIVE_USER_ITEM = "ui.deleted_at IS NULL";

export type CanonicalProduct = {
  id: number;
  asin: string;
  url: string;
  title: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserItem = {
  id: number;
  user_id: number;
  product_id: number;
  target_price: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class DuplicateProductError extends Error {
  readonly asin: string;

  constructor(asin: string) {
    super(`O produto ${asin} já está sendo monitorado`);
    this.name = "DuplicateProductError";
    this.asin = asin;
  }
}

export class ItemLimitReachedError extends Error {
  readonly maxItems: number;

  constructor(maxItems: number) {
    super(`Limite de ${maxItems} itens atingido`);
    this.name = "ItemLimitReachedError";
    this.maxItems = maxItems;
  }
}

export const db: InstanceType<typeof Database> = new Database(
  process.env.DATABASE_PATH ?? "prices.db",
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("cache_size = -4000");
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("temp_store = MEMORY");

function tableExists(name: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { name: string } | undefined;
  return row != null;
}

function columnExists(table: string, column: string): boolean {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  return columns.some((entry) => entry.name === column);
}

function ensureNewSchema(): void {
  if (tableExists("products") && columnExists("products", "target_price")) {
    throw new Error(
      "Banco legado detectado. Execute: pnpm migrate:multi-user",
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE INDEX IF NOT EXISTS idx_user_items_user
      ON user_items(user_id);

    DROP INDEX IF EXISTS idx_products_asin;
    DROP INDEX IF EXISTS idx_price_history_checked;

    CREATE INDEX IF NOT EXISTS idx_price_history_user_item_checked
      ON price_history(user_item_id, checked_at DESC)
      WHERE price IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_price_history_user_item_price
      ON price_history(user_item_id, price ASC, checked_at ASC)
      WHERE price IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_user_items_active_by_user
      ON user_items(user_id)
      WHERE deleted_at IS NULL;
  `);

  db.exec(TELEGRAM_SCHEMA_SQL);
}

ensureNewSchema();

export function findCanonicalProductByAsin(
  asin: string,
): CanonicalProduct | undefined {
  return db.prepare("SELECT * FROM products WHERE asin = ?").get(asin) as
    | CanonicalProduct
    | undefined;
}

export function findUserItemByUserAndAsin(
  userId: number,
  asin: string,
): (UserItem & CanonicalProduct) | undefined {
  return db
    .prepare(
      `
      SELECT
        ui.id,
        ui.user_id,
        ui.product_id,
        ui.target_price,
        ui.created_at,
        ui.updated_at,
        ui.deleted_at,
        p.asin,
        p.url,
        p.title,
        p.image_url
      FROM user_items ui
      INNER JOIN products p ON p.id = ui.product_id
      WHERE ui.user_id = ? AND p.asin = ?
    `,
    )
    .get(userId, asin) as (UserItem & CanonicalProduct) | undefined;
}

export function isUserItemActive(item: UserItem): boolean {
  return item.deleted_at == null;
}

async function handleAmazonContinueShopping(page: Page): Promise<boolean> {
  try {
    const bodyText = await page
      .locator("body")
      .textContent({ timeout: 5000 })
      .catch(() => null);
    if (!bodyText) return false;

    if (!/continuar comprando/i.test(bodyText)) return false;

    const clickable = page
      .getByRole("button", { name: /continuar comprando/i })
      .or(page.getByRole("link", { name: /continuar comprando/i }))
      .first();

    const inputByValue = page
      .locator('input[type="submit"][value*="Continuar" i]')
      .first();

    const target = (await clickable.count()) > 0 ? clickable : inputByValue;

    if ((await target.count()) === 0) return false;

    await target.click();
    await page
      .waitForLoadState("domcontentloaded", { timeout: 30000 })
      .catch(() => {});

    return true;
  } catch {
    return false;
  }
}

async function saveDebugFiles(page: Page, asin: string): Promise<void> {
  try {
    const logsDir = "logs";
    await mkdir(logsDir, { recursive: true });
    const timestamp = Date.now();
    await page.screenshot({
      path: join(logsDir, `screenshot_${asin}_${timestamp}.png`),
    });
    const html = await page.content();
    await writeFile(
      join(logsDir, `html_${asin}_${timestamp}.html`),
      html,
      "utf-8",
    );
    console.log(
      `[scraper] Debug salvo em ${logsDir}/screenshot_${asin}_${timestamp}.png`,
    );
  } catch (err) {
    console.warn("[scraper] Não foi possível salvar arquivos de debug:", err);
  }
}

export async function fetchProductInfo(url: string) {
  const browser = await chromium.launch({ headless: true });
  const asin = extractASIN(url) ?? "unknown";
  try {
    const page = await browser.newPage({ locale: "pt-BR" });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const detectedContinueShopping = await handleAmazonContinueShopping(page);
    if (detectedContinueShopping) {
      console.log(
        `[scraper] Tela "Continuar comprando" detectada (asin=${asin})`,
      );
    }

    const title = await page
      .locator("#productTitle")
      .first()
      .textContent()
      .catch(() => null);

    const imageUrl = await page
      .locator("#landingImage")
      .first()
      .getAttribute("src")
      .catch(() => null);

    const priceText = await page
      .locator(".a-price .a-offscreen")
      .first()
      .textContent()
      .catch(() => null);

    const unavailable = await page
      .locator("#availability")
      .textContent()
      .then((t) => /não disponível|currently unavailable/i.test(t ?? ""))
      .catch(() => false);

    if (unavailable) {
      return { title: title?.trim() ?? null, imageUrl, price: null };
    }

    const price = priceText ? parsePrice(priceText) : null;

    if (price === null) {
      console.warn(`[scraper] Preço não encontrado (asin=${asin})`);
      await saveDebugFiles(page, asin);
    }

    return {
      title: title?.trim() ?? null,
      imageUrl,
      price,
    };
  } finally {
    await browser.close();
  }
}

function upsertCanonicalProduct(params: {
  asin: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
}): CanonicalProduct {
  db.prepare(
    `
    INSERT INTO products (asin, url, title, image_url)
    VALUES (@asin, @url, @title, @imageUrl)
    ON CONFLICT(asin) DO UPDATE SET
      url = excluded.url,
      title = COALESCE(excluded.title, products.title),
      image_url = COALESCE(excluded.image_url, products.image_url),
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run({
    asin: params.asin,
    url: params.url,
    title: params.title,
    imageUrl: params.imageUrl,
  });

  return findCanonicalProductByAsin(params.asin) as CanonicalProduct;
}

export function addProduct(params: {
  userId: number;
  user: User;
  url: string;
  targetPrice?: number | null;
  title: string | null;
  imageUrl: string | null;
  initialPrice?: number | null;
}) {
  const asin = extractASIN(params.url);
  if (!asin) {
    throw new Error("ASIN não encontrado na URL");
  }

  return db.transaction(() => {
    const existingItem = findUserItemByUserAndAsin(params.userId, asin);
    const targetPrice = targetPriceForDb(params.targetPrice);

    if (existingItem && isUserItemActive(existingItem)) {
      throw new DuplicateProductError(asin);
    }

    const isReactivating =
      existingItem != null && !isUserItemActive(existingItem);

    if (
      params.user.role !== "admin" &&
      params.user.max_items != null &&
      !isReactivating
    ) {
      const activeCount = db
        .prepare(
          "SELECT COUNT(*) AS count FROM user_items WHERE user_id = ? AND deleted_at IS NULL",
        )
        .get(params.userId) as { count: number };

      if (activeCount.count >= params.user.max_items) {
        throw new ItemLimitReachedError(params.user.max_items);
      }
    }

    const product = upsertCanonicalProduct({
      asin,
      url: params.url,
      title: params.title,
      imageUrl: params.imageUrl,
    });

    let userItemId: number;

    if (existingItem && !isUserItemActive(existingItem)) {
      db.prepare(
        `
        UPDATE user_items
        SET target_price = @targetPrice,
            deleted_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `,
      ).run({
        id: existingItem.id,
        targetPrice,
      });
      userItemId = existingItem.id;
    } else {
      const result = db
        .prepare(
          `
          INSERT INTO user_items (user_id, product_id, target_price)
          VALUES (@userId, @productId, @targetPrice)
        `,
        )
        .run({
          userId: params.userId,
          productId: product.id,
          targetPrice,
        });
      userItemId = Number(result.lastInsertRowid);
    }

    savePriceHistory({
      userItemId,
      price: params.initialPrice ?? null,
    });

    return getUserItemSummaryById(userItemId) as ProductPriceSummary;
  })();
}

export type MonitorUserItem = {
  user_item_id: number;
  user_id: number;
  asin: string;
  url: string;
  title: string | null;
  target_price: number;
};

export function listActiveMonitorItems(): MonitorUserItem[] {
  return db
    .prepare(
      `
      SELECT
        ui.id AS user_item_id,
        ui.user_id,
        p.asin,
        p.url,
        p.title,
        ui.target_price
      FROM user_items ui
      INNER JOIN products p ON p.id = ui.product_id
      WHERE ui.deleted_at IS NULL
      ORDER BY p.asin, ui.id
    `,
    )
    .all() as MonitorUserItem[];
}

export function getPreviousPrice(userItemId: number) {
  return db
    .prepare(
      `
      SELECT price, checked_at FROM price_history
      WHERE user_item_id = ?
        AND price IS NOT NULL
      ORDER BY checked_at DESC
      LIMIT 1 OFFSET 1
    `,
    )
    .get(userItemId) as { price: number; checked_at: string } | undefined;
}

export function savePriceHistory(params: {
  userItemId: number;
  price: number | null;
}) {
  db.prepare(
    `
    INSERT INTO price_history (user_item_id, price)
    VALUES (@userItemId, @price)
  `,
  ).run(params);
}

const PRODUCT_PRICE_SUMMARY_SQL = `
      SELECT
        ui.id,
        ui.user_id,
        p.id AS product_id,
        p.asin,
        p.title,
        p.url,
        p.image_url,
        ui.target_price,
        ui.created_at,
        ui.updated_at,

        latest.price AS last_price,
        latest.checked_at AS last_checked_at,

        (
          SELECT ph.price FROM price_history ph
          WHERE ph.user_item_id = ui.id AND ph.price IS NOT NULL
          ORDER BY ph.checked_at DESC
          LIMIT 1 OFFSET 1
        ) AS previous_price,
        (
          SELECT ph.checked_at FROM price_history ph
          WHERE ph.user_item_id = ui.id AND ph.price IS NOT NULL
          ORDER BY ph.checked_at DESC
          LIMIT 1 OFFSET 1
        ) AS previous_checked_at,

        (
          SELECT ph.price FROM price_history ph
          WHERE ph.user_item_id = ui.id AND ph.price IS NOT NULL
          ORDER BY ph.price ASC, ph.checked_at ASC
          LIMIT 1
        ) AS lowest_price,
        (
          SELECT ph.checked_at FROM price_history ph
          WHERE ph.user_item_id = ui.id AND ph.price IS NOT NULL
          ORDER BY ph.price ASC, ph.checked_at ASC
          LIMIT 1
        ) AS lowest_checked_at
      FROM user_items ui
      INNER JOIN products p ON p.id = ui.product_id
      LEFT JOIN (
        SELECT ph1.user_item_id, ph1.price, ph1.checked_at
        FROM price_history ph1
        INNER JOIN (
          SELECT user_item_id, MAX(checked_at) AS max_checked_at
          FROM price_history
          GROUP BY user_item_id
        ) ph2
          ON ph1.user_item_id = ph2.user_item_id
         AND ph1.checked_at = ph2.max_checked_at
      ) latest
        ON latest.user_item_id = ui.id
`;

export type ProductPriceSummary = {
  id: number;
  user_id: number;
  product_id: number;
  asin: string;
  title: string | null;
  url: string;
  image_url: string | null;
  target_price: number;
  created_at: string;
  updated_at: string;
  last_price: number | null;
  last_checked_at: string | null;
  previous_price: number | null;
  previous_checked_at: string | null;
  lowest_price: number | null;
  lowest_checked_at: string | null;
};

export type PriceHistoryEntry = {
  price: number;
  checked_at: string;
};

function getUserItemSummaryById(
  userItemId: number,
): ProductPriceSummary | undefined {
  return db
    .prepare(
      `
      ${PRODUCT_PRICE_SUMMARY_SQL}
      WHERE ui.id = ?
    `,
    )
    .get(userItemId) as ProductPriceSummary | undefined;
}

export function listProductsPriceHistory(userId: number) {
  return db
    .prepare(
      `
      ${PRODUCT_PRICE_SUMMARY_SQL}
      WHERE ui.user_id = ? AND ${ACTIVE_USER_ITEM}
      ORDER BY ui.created_at DESC
    `,
    )
    .all(userId) as ProductPriceSummary[];
}

export function listProductsPriceHistoryForUser(userId: number) {
  return listProductsPriceHistory(userId);
}

export function getProductDetailByAsin(
  userId: number,
  asin: string,
): ProductPriceSummary | undefined {
  return db
    .prepare(
      `
      ${PRODUCT_PRICE_SUMMARY_SQL}
      WHERE ui.user_id = ? AND p.asin = ? AND ${ACTIVE_USER_ITEM}
    `,
    )
    .get(userId, asin) as ProductPriceSummary | undefined;
}

export function getProductPriceHistory(
  userId: number,
  asin: string,
): PriceHistoryEntry[] | null {
  const item = findUserItemByUserAndAsin(userId, asin);
  if (!item || !isUserItemActive(item)) {
    return null;
  }

  return db
    .prepare(
      `
      SELECT price, checked_at FROM price_history
      WHERE user_item_id = ? AND price IS NOT NULL
      ORDER BY checked_at ASC
    `,
    )
    .all(item.id) as PriceHistoryEntry[];
}

export function deleteProduct(userId: number, asin: string) {
  const result = db
    .prepare(
      `
      UPDATE user_items
      SET deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT ui.id
        FROM user_items ui
        INNER JOIN products p ON p.id = ui.product_id
        WHERE ui.user_id = ? AND p.asin = ? AND ui.deleted_at IS NULL
      )
    `,
    )
    .run(userId, asin);
  return result.changes > 0;
}

export function deleteAllUserProducts(userId: number): number {
  const result = db
    .prepare(
      `
      UPDATE user_items
      SET deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND deleted_at IS NULL
    `,
    )
    .run(userId);
  return result.changes;
}

export function deleteUserProductByAsin(
  userId: number,
  asin: string,
): boolean {
  return deleteProduct(userId, asin);
}

export function isProductActiveForUser(userId: number, asin: string): boolean {
  const item = findUserItemByUserAndAsin(userId, asin);
  return item != null && isUserItemActive(item);
}

// Compat helpers used by preview endpoint
export function findProductByAsin(asin: string): CanonicalProduct | undefined {
  return findCanonicalProductByAsin(asin);
}

export function isProductActive(product: CanonicalProduct): boolean {
  void product;
  return true;
}
