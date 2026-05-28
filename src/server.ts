import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  addProduct,
  db,
  deleteProduct,
  DuplicateProductError,
  fetchProductInfo,
  findProductByAsin,
  isProductActive,
  listProductsPriceHistory,
} from "./database";
import { extractASIN, resolveTargetPrice } from "./utils";

const app = new Hono();

const publicRoutes = ["/api/health"];

app.use("/api/*", async (c, next) => {
  if (publicRoutes.includes(c.req.path)) {
    return next();
  }

  const token = c.req.header("x-api-token");
  const expectedToken = process.env.API_TOKEN;

  if (!expectedToken) {
    return c.json({ error: "API_TOKEN não configurado" }, 500);
  }

  if (token !== expectedToken) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  await next();
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

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
    targetPrice?: number | null;
    title?: string | null;
    imageUrl?: string | null;
    currentPrice?: number | null;
  };

  const hasPreviewData =
    body.title !== undefined ||
    body.imageUrl !== undefined ||
    body.currentPrice !== undefined;

  const info = hasPreviewData
    ? {
      title: body.title ?? null,
      imageUrl: body.imageUrl ?? null,
      price: body.currentPrice ?? null,
    }
    : await fetchProductInfo(body.url);

  try {
    const product = addProduct({
      url: body.url,
      targetPrice: resolveTargetPrice(body.targetPrice),
      title: info.title,
      imageUrl: info.imageUrl,
      initialPrice: info.price,
    });

    return c.json(product);
  } catch (error) {
    if (error instanceof DuplicateProductError) {
      return c.json({ error: error.message, asin: error.asin }, 409);
    }
    throw error;
  }
});

app.post("/api/products/preview", async (c) => {
  try {
    const body = await c.req.json<{
      url: string;
      targetPrice?: number | null;
    }>();

    if (!body.url) {
      return c.json({ error: "URL é obrigatória" }, 400);
    }

    const asin = extractASIN(body.url);

    if (!asin) {
      return c.json({ error: "URL inválida" }, 400);
    }

    const existing = findProductByAsin(asin);

    if (existing && isProductActive(existing)) {
      return c.json(
        {
          error: `O produto ${asin} já está sendo monitorado`,
          asin,
        },
        409,
      );
    }

    const info = await fetchProductInfo(body.url);
    return c.json({
      asin,
      url: body.url,
      targetPrice: resolveTargetPrice(body.targetPrice),
      title: info.title,
      imageUrl: info.imageUrl,
      currentPrice: info.price ?? null,
      willReactivate: existing != null && !isProductActive(existing),
    });
  } catch (error) {
    console.error(error);

    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao consultar produto",
      },
      500,
    );
  }
});

app.delete("/api/products/:asin", (c) => {
  const asin = c.req.param("asin");
  const deleted = deleteProduct(asin);
  if (!deleted) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }
  return c.json({ ok: true });
});

serve({
  fetch: app.fetch,
  port: 3000,
});
console.log("🌐 Web rodando em http://localhost:3000");
