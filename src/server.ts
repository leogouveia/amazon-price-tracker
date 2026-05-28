import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  addProduct,
  db,
  fetchProductInfo,
  listProductsPriceHistory,
} from "./database.js";

const app = new Hono();

app.get("/api/prices", (c) => {
  const rows = db
    .prepare(
      `
      SELECT product_id, title, price, url, checked_at
      FROM price_history
      ORDER BY checked_at DESC
      LIMIT 100
    `,
    )
    .all();

  return c.json(rows);
});

app.get("/api/products", (c) => {
  const rows = listProductsPriceHistory();
  return c.json(rows);
});

app.post("/api/products", async (c) => {
  const body = (await c.req.json()) as {
    url: string;
    targetPrice: number;
  };
  const info = await fetchProductInfo(body.url);

  const product = addProduct({
    url: body.url,
    targetPrice: body.targetPrice,
    title: info.title,
    imageUrl: info.imageUrl,
  });

  return c.json(product);
});

serve({
  fetch: app.fetch,
  port: 3000,
});
console.log("🌐 Web rodando em http://localhost:3000");
