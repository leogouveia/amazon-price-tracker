import Database from "better-sqlite3";
import { chromium } from "playwright";

export type Product = {
  id: number;
  asin: string;
  url: string;
  title: string | null;
  image_url: string | null;
  target_price: number;
  created_at: string;
  updated_at: string;
};

export const db: InstanceType<typeof Database> = new Database("prices.db");

db.exec(`
   CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    asin TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,

    title TEXT,
    image_url TEXT,

    target_price REAL NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    product_id INTEGER NOT NULL,

    price REAL,

    checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
      REFERENCES products(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_products_asin
    ON products(asin);

  CREATE INDEX IF NOT EXISTS idx_price_history_product
    ON price_history(product_id);

  CREATE INDEX IF NOT EXISTS idx_price_history_checked
    ON price_history(checked_at);
`);

function extractASIN(url: string): string | null {
  const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);

  return match?.[1] ?? null;
}

export async function fetchProductInfo(url: string) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ locale: "pt-BR" });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

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

    return {
      title: title?.trim() ?? null,
      imageUrl,
    };
  } finally {
    await browser.close();
  }
}

export function addProduct(params: {
  url: string;
  targetPrice: number;
  title: string | null;
  imageUrl: string | null;
}) {
  const asin = extractASIN(params.url);
  if (!asin) {
    throw new Error("ASIN não encontrado na URL");
  }

  db.prepare(
    `
    INSERT INTO products (asin, url, title, image_url, target_price)
    VALUES (@asin, @url, @title, @imageUrl, @targetPrice)
    ON CONFLICT(asin) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      image_url = excluded.image_url,
      target_price = excluded.target_price,
      updated_at = CURRENT_TIMESTAMP
    `,
  ).run({
    asin,
    url: params.url,
    title: params.title,
    imageUrl: params.imageUrl,
    targetPrice: params.targetPrice,
  });

  return db.prepare("SELECT * FROM products WHERE asin = ?").get(asin);
}

export function upsertProduct(params: {
  asin: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
  targetPrice: number;
}) {
  db.prepare(
    `
    INSERT INTO products(
    asin,
    url,
    title, 
    image_url,
    target_price
    )
    VALUES (
    @asin,
    @url,
    @title,
    @imageUrl,
    @targetPrice
    )
     ON CONFLICT(asin) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      image_url = excluded.image_url,
      target_price = excluded.target_price,
      updated_at = CURRENT_TIMESTAMP
  `,
  ).run({
    asin: params.asin,
    url: params.url,
    title: params.title,
    imageUrl: params.imageUrl,
    targetPrice: params.targetPrice,
  });
  return db
    .prepare(
      `
      SELECT *
      FROM products
      WHERE asin = ?
    `,
    )
    .get(params.asin) as Product;
}

export function listProducts() {
  return db.prepare("SELECT * FROM products").all() as Product[];
}

export function getPreviousPrice(productId: string) {
  return db
    .prepare(
      `
        SELECT price FROM price_history
        WHERE product_id = ?
            AND price IS NOT NULL
            AND date(checked_at, 'localtime') < date('now', 'localtime')
        ORDER BY checked_at DESC
        LIMIT 1
        `,
    )
    .get(productId) as { price: number } | undefined;
}

export function savePriceHistory(params: {
  productId: number;
  price: number | null;
}) {
  db.prepare(
    `
    INSERT INTO price_history (product_id, price) 
    VALUES (@productId, @price)
        `,
  ).run({
    productId: params.productId,
    price: params.price,
  });
}

export function listProductsPriceHistory() {
  return db
    .prepare(
      `
      SELECT
        p.id,
        p.asin,
        p.title,
        p.url,
        p.image_url,
        p.target_price,
        p.created_at,
        p.updated_at,

        latest.price AS last_price,
        latest.checked_at AS last_checked_at
      FROM products p
      LEFT JOIN (
        SELECT ph1.product_id, ph1.price, ph1.checked_at
        FROM price_history ph1
        INNER JOIN (
          SELECT product_id, MAX(checked_at) AS max_checked_at
          FROM price_history
          GROUP BY product_id
        ) ph2
          ON ph1.product_id = ph2.product_id
         AND ph1.checked_at = ph2.max_checked_at
      ) latest
        ON latest.product_id = p.id
      ORDER BY p.created_at DESC
    `,
    )
    .all();
}
