import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach } from "vitest";
import { createSessionToken, parseSessionToken, sessionCookieOptions } from "./auth";
import { clearAllTables, createTestAdmin, createTestUser } from "./__tests__/setup";

function signPayload(encoded: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(encoded).digest("base64url");
}

beforeEach(() => {
  clearAllTables();
});

describe("createSessionToken", () => {
  it("retorna string no formato base64.base64", () => {
    const admin = createTestAdmin();
    const token = createSessionToken(admin);
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
  });

  it("payload decodificado contém sub, role e exp", () => {
    const admin = createTestAdmin();
    const token = createSessionToken(admin);
    const [encoded] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8"));
    expect(payload.sub).toBe(admin.id);
    expect(payload.role).toBe("admin");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("tokens de usuários diferentes são diferentes", () => {
    const admin = createTestAdmin();
    const user = createTestUser();
    expect(createSessionToken(admin)).not.toBe(createSessionToken(user));
  });
});

describe("parseSessionToken", () => {
  it("retorna payload para token válido", () => {
    const admin = createTestAdmin();
    const token = createSessionToken(admin);
    const payload = parseSessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(admin.id);
    expect(payload?.role).toBe("admin");
  });

  it("retorna null para token expirado", () => {
    const admin = createTestAdmin();
    const past = Date.now() - 1000;
    const expiredPayload = { sub: admin.id, role: admin.role, exp: past };
    const encoded = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const sig = signPayload(encoded);
    expect(parseSessionToken(`${encoded}.${sig}`)).toBeNull();
  });

  it("retorna null para assinatura adulterada", () => {
    const admin = createTestAdmin();
    const token = createSessionToken(admin);
    const [encoded] = token.split(".");
    expect(parseSessionToken(`${encoded}.invalidsignature`)).toBeNull();
  });

  it("retorna null para token sem ponto separador", () => {
    expect(parseSessionToken("tokenSemseparador")).toBeNull();
  });

  it("retorna null para payload JSON inválido", () => {
    const invalidJson = Buffer.from("não é JSON").toString("base64url");
    const sig = signPayload(invalidJson);
    expect(parseSessionToken(`${invalidJson}.${sig}`)).toBeNull();
  });

  it("retorna null para role inválido no payload", () => {
    const payload = { sub: 1, role: "superuser", exp: Date.now() + 99999999 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = signPayload(encoded);
    expect(parseSessionToken(`${encoded}.${sig}`)).toBeNull();
  });
});

describe("sessionCookieOptions", () => {
  it("httpOnly é sempre true", () => {
    expect(sessionCookieOptions().httpOnly).toBe(true);
  });

  it("sameSite é sempre Lax", () => {
    expect(sessionCookieOptions().sameSite).toBe("Lax");
  });

  it("secure é false em ambiente de teste (NODE_ENV=test)", () => {
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("secure é true em produção", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    expect(sessionCookieOptions().secure).toBe(true);
    process.env.NODE_ENV = original;
  });

  it("maxAge é 7 dias em segundos", () => {
    expect(sessionCookieOptions().maxAge).toBe(60 * 60 * 24 * 7);
  });
});
