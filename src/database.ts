import Database from "better-sqlite3";
import { chromium } from "playwright";
import { extractASIN, parsePrice, targetPriceForDb } from "./utils";

const ACTIVE_PRODUCT = "deleted_at IS NULL";

export type Product = {
  id: number;
  asin: string;
  url: string;
  title: string | null;
  image_url: string | null;
  target_price: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export class DuplicateProductError extends Error {
  readonly asin: string;

  constructor(asin: string) {
    super(`O produto ${asin} já está sendo monitorado`);
    this.name = "DuplicateProductError";
    this.asin = asin;
  }
}

export function findProductByAsin(asin: string): Product | undefined {
  return db.prepare("SELECT * FROM products WHERE asin = ?").get(asin) as
    | Product
    | undefined;
}

export function isProductActive(product: Product): boolean {
  return product.deleted_at == null;
}

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

const columns = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
if (!columns.some((c) => c.name === "deleted_at")) {
  db.exec("ALTER TABLE products ADD COLUMN deleted_at TEXT");
}

export async function fetchProductInfo(url: string) {
  const browser = await chromium.launch({ headless: true });
  const asin = extractASIN(url);
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

    const priceText = await page
      .locator(".a-price .a-offscreen")
      .first()
      .textContent()
      .catch(() => null);

    const unavailable = await page
      .locator("#availability")
      .textContent()
      .then((t) => /não disponível|currently unavailable/i.test(t ?? ""));

    // await page.screenshot({ path: `screenshot_${asin}_${Date.now()}.png` });

    if (unavailable) {
      return { title: title?.trim() ?? null, imageUrl, price: null };
    }

    const price = priceText ? parsePrice(priceText) : null;

    return {
      title: title?.trim() ?? null,
      imageUrl,
      price,
    };
  } finally {
    await browser.close();
  }
}

export function addProduct(params: {
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

  const existing = findProductByAsin(asin);
  const targetPrice = targetPriceForDb(params.targetPrice);

  if (existing && isProductActive(existing)) {
    throw new DuplicateProductError(asin);
  }

  if (existing && !isProductActive(existing)) {
    db.prepare(
      `
      UPDATE products
      SET url = @url,
          title = @title,
          image_url = @imageUrl,
          target_price = @targetPrice,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE asin = @asin
      `,
    ).run({
      asin,
      url: params.url,
      title: params.title,
      imageUrl: params.imageUrl,
      targetPrice,
    });
  } else {
    db.prepare(
      `
      INSERT INTO products (asin, url, title, image_url, target_price)
      VALUES (@asin, @url, @title, @imageUrl, @targetPrice)
      `,
    ).run({
      asin,
      url: params.url,
      title: params.title,
      imageUrl: params.imageUrl,
      targetPrice,
    });
  }

  const product = findProductByAsin(asin) as Product;

  savePriceHistory({
    productId: product.id,
    price: params.initialPrice ?? null,
  });

  return product;
}

export function listProducts() {
  return db
    .prepare(`SELECT * FROM products WHERE ${ACTIVE_PRODUCT}`)
    .all() as Product[];
}

export function getPreviousPrice(productId: string) {
  return db
    .prepare(
      `
        SELECT price, checked_at FROM price_history
        WHERE product_id = ?
            AND price IS NOT NULL
        ORDER BY checked_at DESC
        LIMIT 1 OFFSET 1
        `,
    )
    .get(productId) as { price: number; checked_at: string } | undefined;
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
        latest.checked_at AS last_checked_at,

        (
          SELECT ph.price FROM price_history ph
          WHERE ph.product_id = p.id AND ph.price IS NOT NULL
          ORDER BY ph.checked_at DESC
          LIMIT 1 OFFSET 1
        ) AS previous_price,
        (
          SELECT ph.checked_at FROM price_history ph
          WHERE ph.product_id = p.id AND ph.price IS NOT NULL
          ORDER BY ph.checked_at DESC
          LIMIT 1 OFFSET 1
        ) AS previous_checked_at,

        (
          SELECT ph.price FROM price_history ph
          WHERE ph.product_id = p.id AND ph.price IS NOT NULL
          ORDER BY ph.price ASC, ph.checked_at ASC
          LIMIT 1
        ) AS lowest_price,
        (
          SELECT ph.checked_at FROM price_history ph
          WHERE ph.product_id = p.id AND ph.price IS NOT NULL
          ORDER BY ph.price ASC, ph.checked_at ASC
          LIMIT 1
        ) AS lowest_checked_at
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
      WHERE p.deleted_at IS NULL
      ORDER BY p.created_at DESC
    `,
    )
    .all();
}

export function deleteProduct(asin: string) {
  const result = db
    .prepare(
      `
      UPDATE products
      SET deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE asin = ?
        AND ${ACTIVE_PRODUCT}
      `,
    )
    .run(asin);
  return result.changes > 0;
}