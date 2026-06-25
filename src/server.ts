import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  clearSessionCookie,
  createSessionToken,
  getCurrentUser,
  getCurrentUserPublic,
  isAdminRequest,
  isAuthenticatedRequest,
  isMobileClient,
  serializeUserResponse,
  setSessionCookie,
} from "./auth";
import {
  addProduct,
  deleteAllUserProducts,
  deleteProduct,
  deleteUserProductByAsin,
  DuplicateProductError,
  fetchProductInfo,
  findUserItemByUserAndAsin,
  getProductDetailByAsin,
  getProductPriceHistory,
  isUserItemActive,
  ItemLimitReachedError,
  listProductsPriceHistory,
} from "./database";
import {
  MonitorAlreadyRunningError,
  runPriceMonitor,
} from "./monitor";
import {
  authenticateUser,
  createUser,
  findUserById,
  findUserByLogin,
  generateSecurePassword,
  isUserActive,
  listActiveUsersWithStats,
  reactivateUser,
  softDeleteUser,
  toUserPublic,
  updateUserMaxItems,
  UserDuplicateActiveError,
} from "./users";
import { extractASIN, isValidLogin, normalizeLogin, resolveTargetPrice } from "./utils";

const app = new Hono();

const defaultCorsOrigins =
  process.env.NODE_ENV === "production"
    ? ["https://tracker2.leogouveia.com"]
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
      ];

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : defaultCorsOrigins;

function isAllowedCorsOrigin(origin: string): boolean {
  if (corsOrigins.includes(origin)) {
    return true;
  }
  if (/^capacitor:\/\//i.test(origin)) {
    return true;
  }
  if (/^ionic:\/\//i.test(origin)) {
    return true;
  }
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) {
    return true;
  }
  return false;
}

app.use(
  "/api/*",
  cors({
    origin: (origin) => (origin && isAllowedCorsOrigin(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-token",
      "x-session-token",
      "x-client",
    ],
    credentials: true,
  }),
);

const publicRoutes = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
];

app.use("/api/*", async (c, next) => {
  if (publicRoutes.includes(c.req.path)) {
    return next();
  }

  if (!isAuthenticatedRequest(c)) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  return next();
});

app.use("/api/admin/*", async (c, next) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: "Acesso negado" }, 403);
  }
  return next();
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/api/auth/login", async (c) => {
  try {
    const body = await c.req.json<{ login?: string; password?: string; client?: string }>();

    if (!body.login || !body.password) {
      return c.json({ error: "Identificador e senha são obrigatórios" }, 400);
    }

    if (!isValidLogin(body.login)) {
      return c.json({ error: "Identificador inválido" }, 400);
    }

    const user = authenticateUser(body.login, body.password);
    if (!user) {
      return c.json({ error: "Credenciais inválidas" }, 401);
    }

    const token = createSessionToken(user);
    setSessionCookie(c, token);

    const wantsMobileToken =
      body.client === "mobile" || isMobileClient(c);

    return c.json({
      authenticated: true,
      user: serializeUserResponse(user),
      ...(wantsMobileToken ? { token } : {}),
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Autenticação indisponível" }, 500);
  }
});

app.post("/api/auth/logout", (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/api/auth/me", (c) => {
  if (isApiTokenAdmin(c)) {
    return c.json({
      authenticated: true,
      user: {
        id: 0,
        login: "api-token",
        role: "admin",
        max_items: null,
        created_at: "",
        updated_at: "",
        active_item_count: 0,
      },
    });
  }

  const user = getCurrentUserPublic(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  return c.json({ authenticated: true, user });
});

function isApiTokenAdmin(c: import("hono").Context): boolean {
  return isAdminRequest(c) && !getCurrentUser(c);
}

app.get("/api/products", (c) => {
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  const items = listProductsPriceHistory(user.id);
  return c.json({
    items,
    usage: {
      active: items.length,
      max: user.role === "admin" ? null : user.max_items,
    },
  });
});

app.get("/api/products/:asin/history", (c) => {
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  const asin = c.req.param("asin");
  const history = getProductPriceHistory(user.id, asin);

  if (history === null) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }

  return c.json(history);
});

app.get("/api/products/:asin", (c) => {
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  const asin = c.req.param("asin");
  const product = getProductDetailByAsin(user.id, asin);

  if (!product) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }

  return c.json(product);
});

app.post("/api/products", async (c) => {
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }

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
      userId: user.id,
      user,
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
    if (error instanceof ItemLimitReachedError) {
      return c.json({ error: error.message, maxItems: error.maxItems }, 403);
    }
    throw error;
  }
});

app.post("/api/products/preview", async (c) => {
  try {
    const user = getCurrentUser(c);
    if (!user) {
      return c.json({ error: "Não autorizado" }, 401);
    }

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

    const existing = findUserItemByUserAndAsin(user.id, asin);

    if (existing && isUserItemActive(existing)) {
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
      willReactivate: existing != null && !isUserItemActive(existing),
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
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  const asin = c.req.param("asin");
  const deleted = deleteProduct(user.id, asin);
  if (!deleted) {
    return c.json({ error: "Produto não encontrado" }, 404);
  }
  return c.json({ ok: true });
});

app.post("/api/monitor/run", async (c) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: "Acesso negado" }, 403);
  }

  try {
    const result = await runPriceMonitor();
    return c.json(result);
  } catch (error) {
    if (error instanceof MonitorAlreadyRunningError) {
      return c.json({ error: error.message }, 409);
    }

    console.error(error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao executar monitoramento",
      },
      500,
    );
  }
});

app.get("/api/admin/users", (c) => {
  return c.json(listActiveUsersWithStats());
});

app.post("/api/admin/users", async (c) => {
  try {
    const body = await c.req.json<{ email?: string; maxItems?: number }>();

    if (!body.email || body.maxItems == null) {
      return c.json({ error: "E-mail e limite de itens são obrigatórios" }, 400);
    }

    const login = normalizeLogin(body.email);
    if (!isValidLogin(login) || login === "admin") {
      return c.json({ error: "E-mail inválido" }, 400);
    }

    const password = generateSecurePassword();
    const existing = findUserByLogin(login);

    if (existing && isUserActive(existing)) {
      return c.json({ error: `O usuário ${login} já está cadastrado` }, 409);
    }

    if (existing && !isUserActive(existing)) {
      const user = reactivateUser({
        email: login,
        password,
        maxItems: body.maxItems,
      });

      return c.json({
        user: toUserPublic(user),
        generatedPassword: password,
        reactivated: true,
        message:
          "Usuário já existia e estava excluído. Foi reativado com nova senha e novo limite. Itens antigos não foram restaurados.",
      });
    }

    const user = createUser({
      email: login,
      password,
      maxItems: body.maxItems,
    });

    return c.json({
      user: toUserPublic(user),
      generatedPassword: password,
      reactivated: false,
    });
  } catch (error) {
    if (error instanceof UserDuplicateActiveError) {
      return c.json({ error: error.message }, 409);
    }
    console.error(error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Erro ao criar usuário",
      },
      400,
    );
  }
});

app.patch("/api/admin/users/:id", async (c) => {
  try {
    const userId = Number.parseInt(c.req.param("id"), 10);
    const body = await c.req.json<{ maxItems?: number }>();

    if (!Number.isFinite(userId) || body.maxItems == null) {
      return c.json({ error: "Dados inválidos" }, 400);
    }

    const updated = updateUserMaxItems(userId, body.maxItems);
    if (!updated) {
      return c.json({ error: "Usuário não encontrado" }, 404);
    }

    const user = findUserById(userId);
    return c.json({ user: user ? toUserPublic(user) : null });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar" },
      400,
    );
  }
});

app.delete("/api/admin/users/:id", (c) => {
  const userId = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(userId)) {
    return c.json({ error: "ID inválido" }, 400);
  }

  const deleted = softDeleteUser(userId);
  if (!deleted) {
    return c.json({ error: "Usuário não encontrado" }, 404);
  }

  return c.json({ ok: true });
});

app.get("/api/admin/users/:id/products", (c) => {
  const userId = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(userId)) {
    return c.json({ error: "ID inválido" }, 400);
  }

  const user = findUserById(userId);
  if (!user || !isUserActive(user)) {
    return c.json({ error: "Usuário não encontrado" }, 404);
  }

  return c.json(listProductsPriceHistory(userId));
});

app.delete("/api/admin/users/:id/products", (c) => {
  const userId = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(userId)) {
    return c.json({ error: "ID inválido" }, 400);
  }

  const count = deleteAllUserProducts(userId);
  return c.json({ ok: true, deletedCount: count });
});

app.delete("/api/admin/users/:id/products/:asin", (c) => {
  const userId = Number.parseInt(c.req.param("id"), 10);
  const asin = c.req.param("asin");

  if (!Number.isFinite(userId)) {
    return c.json({ error: "ID inválido" }, 400);
  }

  const deleted = deleteUserProductByAsin(userId, asin);
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
