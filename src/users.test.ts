import { describe, it, expect, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateSecurePassword,
  authenticateUser,
  createUser,
  reactivateUser,
  softDeleteUser,
  canUserAddItem,
  findUserByLogin,
  UserDuplicateActiveError,
} from "./users";
import { clearAllTables, createTestAdmin, createTestUser } from "./__tests__/setup";
import { db } from "./database";

beforeEach(() => {
  clearAllTables();
});

describe("hashPassword + verifyPassword", () => {
  it("round-trip: verifica senha correta", () => {
    const hash = hashPassword("minha-senha-123");
    expect(verifyPassword("minha-senha-123", hash)).toBe(true);
  });

  it("rejeita senha incorreta", () => {
    const hash = hashPassword("minha-senha-123");
    expect(verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (salt aleatório)", () => {
    const h1 = hashPassword("mesma-senha");
    const h2 = hashPassword("mesma-senha");
    expect(h1).not.toBe(h2);
  });
});

describe("generateSecurePassword", () => {
  it("gera senha com comprimento padrão de 16", () => {
    const pw = generateSecurePassword();
    expect(pw).toHaveLength(16);
  });

  it("gera senha com comprimento customizado", () => {
    const pw = generateSecurePassword(24);
    expect(pw).toHaveLength(24);
  });

  it("gera senhas diferentes a cada chamada", () => {
    const p1 = generateSecurePassword();
    const p2 = generateSecurePassword();
    expect(p1).not.toBe(p2);
  });
});

describe("authenticateUser", () => {
  it("retorna usuário para credenciais corretas (admin)", () => {
    createTestAdmin();
    const user = authenticateUser("admin", "admin-pass-123");
    expect(user).toBeDefined();
    expect(user?.role).toBe("admin");
  });

  it("retorna usuário para credenciais corretas (usuário regular)", () => {
    createTestUser("user@example.com");
    const user = authenticateUser("user@example.com", "user-pass-123");
    expect(user).toBeDefined();
    expect(user?.login).toBe("user@example.com");
  });

  it("retorna undefined para senha incorreta", () => {
    createTestUser("user@example.com");
    expect(authenticateUser("user@example.com", "senha-errada")).toBeUndefined();
  });

  it("retorna undefined para usuário inexistente", () => {
    expect(authenticateUser("nao-existe@example.com", "qualquer")).toBeUndefined();
  });

  it("retorna undefined para usuário soft-deletado", () => {
    const user = createTestUser("deleted@example.com");
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    expect(authenticateUser("deleted@example.com", "user-pass-123")).toBeUndefined();
  });

  it("retorna undefined para login com formato inválido", () => {
    expect(authenticateUser("nao-e-email", "qualquer")).toBeUndefined();
  });
});

describe("createUser", () => {
  it("cria usuário com email válido", () => {
    createTestAdmin();
    const user = createUser({
      email: "novo@example.com",
      password: "senha123",
      maxItems: 5,
    });
    expect(user.login).toBe("novo@example.com");
    expect(user.role).toBe("user");
    expect(user.max_items).toBe(5);
  });

  it("lança UserDuplicateActiveError para email já cadastrado e ativo", () => {
    createTestUser("duplicado@example.com");
    expect(() =>
      createUser({ email: "duplicado@example.com", password: "pw", maxItems: 5 }),
    ).toThrow(UserDuplicateActiveError);
  });

  it("lança erro para email inválido", () => {
    expect(() =>
      createUser({ email: "nao-e-email", password: "pw", maxItems: 5 }),
    ).toThrow();
  });

  it("lança erro para maxItems < 1", () => {
    expect(() =>
      createUser({ email: "ok@example.com", password: "pw", maxItems: 0 }),
    ).toThrow();
  });

  it("lança erro para maxItems não inteiro", () => {
    expect(() =>
      createUser({ email: "ok@example.com", password: "pw", maxItems: 1.5 }),
    ).toThrow();
  });

  it("lança erro se login for 'admin'", () => {
    expect(() =>
      createUser({ email: "admin", password: "pw", maxItems: 5 }),
    ).toThrow();
  });

  it("lança erro orientando reativação quando usuário existe soft-deletado", () => {
    const user = createTestUser("soft@example.com");
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
    expect(() =>
      createUser({ email: "soft@example.com", password: "nova-senha", maxItems: 3 }),
    ).toThrow(/reativar/i);
  });
});

describe("reactivateUser", () => {
  it("reativa usuário soft-deletado com nova senha e max_items", () => {
    const user = createTestUser("soft@example.com", 3);
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const reactivated = reactivateUser({
      email: "soft@example.com",
      password: "nova-senha-456",
      maxItems: 10,
    });

    expect(reactivated.deleted_at).toBeNull();
    expect(reactivated.max_items).toBe(10);
    expect(verifyPassword("nova-senha-456", reactivated.password_hash)).toBe(true);
  });

  it("lança erro quando usuário não existe", () => {
    expect(() =>
      reactivateUser({ email: "nao-existe@example.com", password: "pw", maxItems: 5 }),
    ).toThrow();
  });

  it("lança erro quando usuário está ativo", () => {
    createTestUser("ativo@example.com");
    expect(() =>
      reactivateUser({ email: "ativo@example.com", password: "pw", maxItems: 5 }),
    ).toThrow();
  });
});

describe("softDeleteUser", () => {
  it("soft-deleta usuário regular e retorna true", () => {
    const user = createTestUser("para-deletar@example.com");
    const result = softDeleteUser(user.id);
    expect(result).toBe(true);
    const after = findUserByLogin("para-deletar@example.com");
    expect(after?.deleted_at).not.toBeNull();
  });

  it("retorna false ao tentar deletar o admin", () => {
    const admin = createTestAdmin();
    const result = softDeleteUser(admin.id);
    expect(result).toBe(false);
  });

  it("retorna false para ID inexistente", () => {
    expect(softDeleteUser(9999)).toBe(false);
  });
});

describe("canUserAddItem", () => {
  it("admin pode sempre adicionar item", () => {
    const admin = createTestAdmin();
    expect(canUserAddItem(admin)).toBe(true);
  });

  it("usuário abaixo do limite pode adicionar", () => {
    const user = createTestUser("user@example.com", 5);
    expect(canUserAddItem(user)).toBe(true);
  });

  it("usuário no limite não pode adicionar", () => {
    const user = createTestUser("user@example.com", 1);
    // Insere um item ativo para atingir o limite
    db.prepare(
      `INSERT INTO products (asin, url) VALUES ('B000000001', 'https://amazon.com.br/dp/B000000001')`,
    ).run();
    const product = db.prepare("SELECT id FROM products WHERE asin = 'B000000001'").get() as { id: number };
    db.prepare(
      `INSERT INTO user_items (user_id, product_id, target_price) VALUES (?, ?, 0)`,
    ).run(user.id, product.id);

    const refreshed = findUserByLogin(user.login)!;
    expect(canUserAddItem(refreshed)).toBe(false);
  });
});
