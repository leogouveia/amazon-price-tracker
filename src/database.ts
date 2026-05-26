import Database from "better-sqlite3";

export const db: InstanceType<typeof Database> = new Database("prices.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        title TEXT,
        price REAL,
        url TEXT NOT NULL,
        price_target REAL,
        checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    `)

export function savePriceHistory(params: {
    productId: string,
    title: string | null,
    price: number | null,
    url: string,
    price_target: number | null
}) {
    db.prepare(`
        INSERT INTO price_history (product_id, title, price, url, price_target)
    VALUES (@productId, @title, @price, @url, @price_target)
        `).run(params);
}