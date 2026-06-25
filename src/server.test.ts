import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clearAllTables, createTestAdmin, createTestUser, sessionHeaderFor } from "./__tests__/setup";
import { addProduct } from "./database";

vi.mock("./database", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./database")>();
  return {
    ...mod,
    fetchProductInfo: vi.fn().mockResolvedValue({
      title: "Produto Mockado",
      imageUrl: "https://example.com/img.jpg",
      price: 299.9,
    }),
  };
});

vi.mock("./monitor", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./monitor")>();
  return {
    ...mod,
    runPriceMonitor: vi.fn().mockResolvedValue({ checked: 1, errors: [], durationMs: 100 }),
    isMonitorRunning: vi.fn().mockReturnValue(false),
  };
});

import { app } from "./server";

const SAMPLE_URL = "https://www.amazon.com.br/dp/B08N5WRWNW";
const SAMPLE_ASIN = "B08N5WRWNW";

function json(body: unknown): BodyInit {
  return JSON.stringify(body);
}

async function req(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
) {
  return app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body != null ? json(options.body) : undefined,
  });
}

beforeEach(() => {
  clearAllTables();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
describe("GET /api/health", () => {
  it("responde 200 sem autenticação", async () => {
    const res = await req("GET", "/api/health");
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe("POST /api/auth/login", () => {
  it("retorna 200 e token para credenciais válidas", async () => {
    createTestAdmin();
    const res = await req("POST", "/api/auth/login", {
      body: { login: "admin", password: "admin-pass-123" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { token?: string };
    expect(body.token ?? res.headers.get("set-cookie")).toBeTruthy();
  });

  it("retorna 401 para senha incorreta", async () => {
    createTestAdmin();
    const res = await req("POST", "/api/auth/login", {
      body: { login: "admin", password: "senha-errada" },
    });
    expect(res.status).toBe(401);
  });

  it("retorna 401 para usuário inexistente", async () => {
    const res = await req("POST", "/api/auth/login", {
      body: { login: "nao-existe@example.com", password: "qualquer" },
    });
    expect(res.status).toBe(401);
  });

  it("retorna 401 para usuário soft-deletado", async () => {
    const user = createTestUser("deleted@example.com");
    const { db } = await import("./database");
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const res = await req("POST", "/api/auth/login", {
      body: { login: "deleted@example.com", password: "user-pass-123" },
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("retorna 200 e limpa o cookie", async () => {
    const admin = createTestAdmin();
    const res = await req("POST", "/api/auth/logout", {
      headers: sessionHeaderFor(admin),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/me", () => {
  it("retorna 200 com dados do usuário autenticado", async () => {
    const admin = createTestAdmin();
    const res = await req("GET", "/api/auth/me", {
      headers: sessionHeaderFor(admin),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user: { role: string } };
    expect(body.user.role).toBe("admin");
  });

  it("retorna 401 sem sessão", async () => {
    const res = await req("GET", "/api/auth/me");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
describe("GET /api/products", () => {
  it("retorna 200 com lista de produtos do usuário", async () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Echo", imageUrl: null });

    const res = await req("GET", "/api/products", {
      headers: sessionHeaderFor(user),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("retorna 401 sem autenticação", async () => {
    const res = await req("GET", "/api/products");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/products", () => {
  it("retorna 200 para URL válida com produto mockado", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("POST", "/api/products", {
      headers: sessionHeaderFor(user),
      body: { url: SAMPLE_URL },
    });
    expect(res.status).toBe(200);
  });

  it("retorna 409 para ASIN já monitorado", async () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });

    const res = await req("POST", "/api/products", {
      headers: sessionHeaderFor(user),
      body: { url: SAMPLE_URL },
    });
    expect(res.status).toBe(409);
  });

  it("retorna 403 quando usuário atingiu o limite", async () => {
    const user = createTestUser("user@example.com", 1);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });

    const res = await req("POST", "/api/products", {
      headers: sessionHeaderFor(user),
      body: { url: "https://www.amazon.com.br/dp/B09XYZ12AB" },
    });
    expect(res.status).toBe(403);
  });

  it("retorna 400 para URL sem ASIN válido", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("POST", "/api/products", {
      headers: sessionHeaderFor(user),
      body: { url: "https://www.amazon.com.br/s?k=echo" },
    });
    expect(res.status).toBe(400);
  });

  it("retorna 400 para body sem URL", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("POST", "/api/products", {
      headers: sessionHeaderFor(user),
      body: {},
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/products/:asin", () => {
  it("retorna 200 para produto do usuário", async () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: "Echo", imageUrl: null });

    const res = await req("GET", `/api/products/${SAMPLE_ASIN}`, {
      headers: sessionHeaderFor(user),
    });
    expect(res.status).toBe(200);
  });

  it("retorna 404 para ASIN de outro usuário", async () => {
    const user1 = createTestUser("user1@example.com", 5);
    const user2 = createTestUser("user2@example.com", 5);
    addProduct({ userId: user1.id, user: user1, url: SAMPLE_URL, title: null, imageUrl: null });

    const res = await req("GET", `/api/products/${SAMPLE_ASIN}`, {
      headers: sessionHeaderFor(user2),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/products/:asin", () => {
  it("retorna 200 ao deletar produto próprio", async () => {
    const user = createTestUser("user@example.com", 5);
    addProduct({ userId: user.id, user, url: SAMPLE_URL, title: null, imageUrl: null });

    const res = await req("DELETE", `/api/products/${SAMPLE_ASIN}`, {
      headers: sessionHeaderFor(user),
    });
    expect(res.status).toBe(200);
  });

  it("retorna 404 para ASIN inexistente", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("DELETE", `/api/products/XXXXXXXXXX`, {
      headers: sessionHeaderFor(user),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/products/preview", () => {
  it("retorna 200 com dados do produto para URL válida", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("POST", "/api/products/preview", {
      headers: sessionHeaderFor(user),
      body: { url: SAMPLE_URL },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { asin: string };
    expect(body.asin).toBe(SAMPLE_ASIN);
  });

  it("retorna 400 para URL inválida", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("POST", "/api/products/preview", {
      headers: sessionHeaderFor(user),
      body: { url: "https://www.amazon.com.br/s?k=notebook" },
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Admin — usuários
// ---------------------------------------------------------------------------
describe("GET /api/admin/users", () => {
  it("retorna 200 para admin", async () => {
    const admin = createTestAdmin();
    const res = await req("GET", "/api/admin/users", {
      headers: sessionHeaderFor(admin),
    });
    expect(res.status).toBe(200);
  });

  it("retorna 403 para usuário regular", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("GET", "/api/admin/users", {
      headers: sessionHeaderFor(user),
    });
    expect(res.status).toBe(403);
  });

  it("retorna 401 sem autenticação (middleware de auth dispara antes do guard admin)", async () => {
    const res = await req("GET", "/api/admin/users");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/users", () => {
  it("admin cria usuário e retorna 200 com senha temporária", async () => {
    const admin = createTestAdmin();
    const res = await req("POST", "/api/admin/users", {
      headers: sessionHeaderFor(admin),
      body: { email: "novo@example.com", maxItems: 5 },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { generatedPassword: string };
    expect(typeof body.generatedPassword).toBe("string");
    expect(body.generatedPassword.length).toBeGreaterThan(0);
  });

  it("retorna 409 para email já cadastrado", async () => {
    const admin = createTestAdmin();
    createTestUser("duplicado@example.com");
    const res = await req("POST", "/api/admin/users", {
      headers: sessionHeaderFor(admin),
      body: { email: "duplicado@example.com", maxItems: 5 },
    });
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/admin/users/:id", () => {
  it("admin atualiza max_items de usuário", async () => {
    const admin = createTestAdmin();
    const user = createTestUser("user@example.com", 5);
    const res = await req("PATCH", `/api/admin/users/${user.id}`, {
      headers: sessionHeaderFor(admin),
      body: { maxItems: 10 },
    });
    expect(res.status).toBe(200);
  });

  it("retorna 403 para usuário regular", async () => {
    const user = createTestUser("user@example.com", 5);
    const res = await req("PATCH", `/api/admin/users/${user.id}`, {
      headers: sessionHeaderFor(user),
      body: { maxItems: 10 },
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("admin soft-deleta usuário", async () => {
    const admin = createTestAdmin();
    const user = createTestUser("user@example.com", 5);
    const res = await req("DELETE", `/api/admin/users/${user.id}`, {
      headers: sessionHeaderFor(admin),
    });
    expect(res.status).toBe(200);
  });

  it("retorna 404 para ID inexistente", async () => {
    const admin = createTestAdmin();
    const res = await req("DELETE", `/api/admin/users/9999`, {
      headers: sessionHeaderFor(admin),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Monitor
// ---------------------------------------------------------------------------
describe("POST /api/monitor/run", () => {
  it("admin pode executar o monitor", async () => {
    const admin = createTestAdmin();
    const res = await req("POST", "/api/monitor/run", {
      headers: sessionHeaderFor(admin),
    });
    expect(res.status).toBe(200);
  });

  it("usuário regular recebe 403", async () => {
    createTestAdmin();
    const user = createTestUser("user@example.com", 5);
    const res = await req("POST", "/api/monitor/run", {
      headers: sessionHeaderFor(user),
    });
    expect(res.status).toBe(403);
  });

  it("x-api-token admin pode executar o monitor", async () => {
    const res = await req("POST", "/api/monitor/run", {
      headers: { "x-api-token": "test-api-token" },
    });
    expect(res.status).toBe(200);
  });
});
