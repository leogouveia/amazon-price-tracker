import { randomBytes } from "node:crypto";
import { db } from "./database";

// Token de vínculo expira em ~15 minutos e é de uso único.
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export type TelegramConnection = {
  id: number;
  user_id: number;
  chat_id: string;
  telegram_user_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  telegram_language_code: string | null;
  telegram_chat_type: string | null;
  enabled: number;
  linked_at: string;
  last_interaction_at: string | null;
  unlinked_at: string | null;
  created_at: string;
  updated_at: string;
};

// Metadados úteis extraídos do update do Telegram. Sem telefone, sem payload bruto.
export type TelegramMetadata = {
  chatId: string;
  telegramUserId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  telegramLanguageCode: string | null;
  telegramChatType: string | null;
};

export type TelegramStatus =
  | { connected: false }
  | {
      connected: true;
      enabled: boolean;
      telegramUsername: string | null;
      telegramFirstName: string | null;
      telegramLastName: string | null;
      telegramLanguageCode: string | null;
      telegramChatType: string | null;
      linkedAt: string;
      lastInteractionAt: string | null;
    };

export type LinkResult =
  | { status: "linked"; connection: TelegramConnection }
  | { status: "invalid_token" }
  | { status: "chat_in_use" };

export function createLinkToken(userId: number): {
  token: string;
  expiresAt: string;
} {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO telegram_link_tokens (user_id, token, expires_at)
     VALUES (?, ?, ?)`,
  ).run(userId, token, expiresAt);

  return { token, expiresAt };
}

function getConnectionById(id: number): TelegramConnection | undefined {
  return db
    .prepare("SELECT * FROM telegram_connections WHERE id = ?")
    .get(id) as TelegramConnection | undefined;
}

export function getActiveConnectionByUserId(
  userId: number,
): TelegramConnection | undefined {
  return db
    .prepare(
      "SELECT * FROM telegram_connections WHERE user_id = ? AND unlinked_at IS NULL",
    )
    .get(userId) as TelegramConnection | undefined;
}

// Conexão apta a receber notificações: ativa, habilitada e de usuário não excluído.
// O webhook é o único caminho sem o guard de auth, então a checagem de usuário
// ativo é refeita aqui (e também no consumo do token).
export function getSendableConnectionByUserId(
  userId: number,
): TelegramConnection | undefined {
  return db
    .prepare(
      `SELECT tc.*
       FROM telegram_connections tc
       INNER JOIN users u ON u.id = tc.user_id
       WHERE tc.user_id = ?
         AND tc.unlinked_at IS NULL
         AND tc.enabled = 1
         AND u.deleted_at IS NULL`,
    )
    .get(userId) as TelegramConnection | undefined;
}

export function getConnectionStatusForUser(userId: number): TelegramStatus {
  const connection = getActiveConnectionByUserId(userId);
  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    enabled: connection.enabled === 1,
    telegramUsername: connection.telegram_username,
    telegramFirstName: connection.telegram_first_name,
    telegramLastName: connection.telegram_last_name,
    telegramLanguageCode: connection.telegram_language_code,
    telegramChatType: connection.telegram_chat_type,
    linkedAt: connection.linked_at,
    lastInteractionAt: connection.last_interaction_at,
  };
}

export function disconnectTelegramForUser(userId: number): boolean {
  const result = db
    .prepare(
      `UPDATE telegram_connections
       SET unlinked_at = CURRENT_TIMESTAMP,
           enabled = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND unlinked_at IS NULL`,
    )
    .run(userId);

  return result.changes > 0;
}

// Valida o token e vincula o chat ao usuário, tudo numa transação.
// O envio da mensagem de sucesso é responsabilidade do chamador (best-effort),
// para não desfazer um vínculo já concluído caso o envio falhe.
export function linkTelegramFromToken(
  token: string,
  meta: TelegramMetadata,
): LinkResult {
  return db.transaction((): LinkResult => {
    const tokenRow = db
      .prepare(
        `SELECT t.id AS token_id, t.user_id, t.used_at, t.expires_at,
                u.deleted_at AS user_deleted_at
         FROM telegram_link_tokens t
         INNER JOIN users u ON u.id = t.user_id
         WHERE t.token = ?`,
      )
      .get(token) as
      | {
          token_id: number;
          user_id: number;
          used_at: string | null;
          expires_at: string;
          user_deleted_at: string | null;
        }
      | undefined;

    if (
      !tokenRow ||
      tokenRow.used_at != null ||
      tokenRow.user_deleted_at != null ||
      new Date(tokenRow.expires_at).getTime() <= Date.now()
    ) {
      return { status: "invalid_token" };
    }

    const userId = tokenRow.user_id;

    // Se este chat já pertence a OUTRO usuário ativo, não vincular.
    const chatOwner = db
      .prepare(
        "SELECT user_id FROM telegram_connections WHERE chat_id = ? AND unlinked_at IS NULL",
      )
      .get(meta.chatId) as { user_id: number } | undefined;

    if (chatOwner && chatOwner.user_id !== userId) {
      return { status: "chat_in_use" };
    }

    db.prepare(
      "UPDATE telegram_link_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(tokenRow.token_id);

    const params = {
      userId,
      chatId: meta.chatId,
      telegramUserId: meta.telegramUserId,
      telegramUsername: meta.telegramUsername,
      telegramFirstName: meta.telegramFirstName,
      telegramLastName: meta.telegramLastName,
      telegramLanguageCode: meta.telegramLanguageCode,
      telegramChatType: meta.telegramChatType,
    };

    const existing = getActiveConnectionByUserId(userId);

    if (existing) {
      db.prepare(
        `UPDATE telegram_connections SET
           chat_id = @chatId,
           telegram_user_id = @telegramUserId,
           telegram_username = @telegramUsername,
           telegram_first_name = @telegramFirstName,
           telegram_last_name = @telegramLastName,
           telegram_language_code = @telegramLanguageCode,
           telegram_chat_type = @telegramChatType,
           enabled = 1,
           last_interaction_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = @id`,
      ).run({ id: existing.id, ...params });

      return { status: "linked", connection: getConnectionById(existing.id)! };
    }

    const result = db
      .prepare(
        `INSERT INTO telegram_connections
           (user_id, chat_id, telegram_user_id, telegram_username,
            telegram_first_name, telegram_last_name, telegram_language_code,
            telegram_chat_type, enabled, last_interaction_at)
         VALUES
           (@userId, @chatId, @telegramUserId, @telegramUsername,
            @telegramFirstName, @telegramLastName, @telegramLanguageCode,
            @telegramChatType, 1, CURRENT_TIMESTAMP)`,
      )
      .run(params);

    return {
      status: "linked",
      connection: getConnectionById(Number(result.lastInsertRowid))!,
    };
  })();
}
