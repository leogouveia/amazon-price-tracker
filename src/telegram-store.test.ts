import { describe, it, expect, beforeEach } from "vitest";
import { clearAllTables, createTestUser } from "./__tests__/setup";
import { db } from "./database";
import {
  createLinkToken,
  disconnectTelegramForUser,
  getActiveConnectionByUserId,
  getConnectionStatusForUser,
  getSendableConnectionByUserId,
  linkTelegramFromToken,
  type TelegramMetadata,
} from "./telegram-store";

function metaFor(chatId: string): TelegramMetadata {
  return {
    chatId,
    telegramUserId: "111",
    telegramUsername: "tester",
    telegramFirstName: "Test",
    telegramLastName: "User",
    telegramLanguageCode: "pt-br",
    telegramChatType: "private",
  };
}

beforeEach(() => {
  clearAllTables();
});

describe("createLinkToken", () => {
  it("gera token forte e com expiração futura", () => {
    const user = createTestUser("u@example.com", 5);
    const { token, expiresAt } = createLinkToken(user.id);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("linkTelegramFromToken", () => {
  it("vincula chat ao usuário e marca o token como usado", () => {
    const user = createTestUser("u@example.com", 5);
    const { token } = createLinkToken(user.id);

    const result = linkTelegramFromToken(token, metaFor("chat-1"));
    expect(result.status).toBe("linked");

    const status = getConnectionStatusForUser(user.id);
    expect(status.connected).toBe(true);

    const used = db
      .prepare("SELECT used_at FROM telegram_link_tokens WHERE token = ?")
      .get(token) as { used_at: string | null };
    expect(used.used_at).not.toBeNull();
  });

  it("rejeita token já usado", () => {
    const user = createTestUser("u@example.com", 5);
    const { token } = createLinkToken(user.id);
    linkTelegramFromToken(token, metaFor("chat-1"));

    const second = linkTelegramFromToken(token, metaFor("chat-2"));
    expect(second.status).toBe("invalid_token");
  });

  it("rejeita token expirado", () => {
    const user = createTestUser("u@example.com", 5);
    const past = new Date(Date.now() - 1000).toISOString();
    db.prepare(
      "INSERT INTO telegram_link_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
    ).run(user.id, "expired-token", past);

    const result = linkTelegramFromToken("expired-token", metaFor("chat-1"));
    expect(result.status).toBe("invalid_token");
  });

  it("rejeita token de usuário soft-deletado", () => {
    const user = createTestUser("u@example.com", 5);
    const { token } = createLinkToken(user.id);
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      user.id,
    );

    const result = linkTelegramFromToken(token, metaFor("chat-1"));
    expect(result.status).toBe("invalid_token");
  });

  it("rejeita chat já vinculado a outro usuário ativo", () => {
    const userA = createTestUser("a@example.com", 5);
    const userB = createTestUser("b@example.com", 5);
    linkTelegramFromToken(createLinkToken(userA.id).token, metaFor("shared-chat"));

    const result = linkTelegramFromToken(
      createLinkToken(userB.id).token,
      metaFor("shared-chat"),
    );
    expect(result.status).toBe("chat_in_use");
  });

  it("reconexão do mesmo usuário atualiza a conexão sem duplicar", () => {
    const user = createTestUser("u@example.com", 5);
    linkTelegramFromToken(createLinkToken(user.id).token, metaFor("chat-old"));
    linkTelegramFromToken(createLinkToken(user.id).token, metaFor("chat-new"));

    const active = db
      .prepare(
        "SELECT COUNT(*) AS count FROM telegram_connections WHERE user_id = ? AND unlinked_at IS NULL",
      )
      .get(user.id) as { count: number };
    expect(active.count).toBe(1);

    const conn = getActiveConnectionByUserId(user.id);
    expect(conn?.chat_id).toBe("chat-new");
  });
});

describe("disconnectTelegramForUser", () => {
  it("desativa a conexão e o status passa a desconectado", () => {
    const user = createTestUser("u@example.com", 5);
    linkTelegramFromToken(createLinkToken(user.id).token, metaFor("chat-1"));

    expect(disconnectTelegramForUser(user.id)).toBe(true);
    expect(getConnectionStatusForUser(user.id).connected).toBe(false);
    expect(getSendableConnectionByUserId(user.id)).toBeUndefined();
  });

  it("é idempotente quando não há conexão ativa", () => {
    const user = createTestUser("u@example.com", 5);
    expect(disconnectTelegramForUser(user.id)).toBe(false);
  });
});

describe("getSendableConnectionByUserId", () => {
  it("ignora conexão de usuário soft-deletado", () => {
    const user = createTestUser("u@example.com", 5);
    linkTelegramFromToken(createLinkToken(user.id).token, metaFor("chat-1"));
    db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      user.id,
    );

    expect(getSendableConnectionByUserId(user.id)).toBeUndefined();
  });
});
