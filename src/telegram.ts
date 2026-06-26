import {
  linkTelegramFromToken,
  type TelegramMetadata,
} from "./telegram-store";

// Escapa caracteres reservados do parse_mode HTML do Telegram.
// Necessário para qualquer texto não controlado (metadados do usuário, títulos
// de produto vindos da Amazon): um "<" ou "&" cru faz o sendMessage retornar 400.
export function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Envia uma mensagem HTML para um chat específico do Telegram.
// O chat_id vem sempre do banco (conexão do usuário), nunca do cliente.
export async function sendTelegramMessage(
  chatId: string,
  html: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log(
      "Telegram não configurado (TELEGRAM_BOT_TOKEN ausente). Mensagem seria:",
    );
    console.log(html);
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro ao enviar Telegram: ${response.status} ${errorText}`);
  }
}

// Envio best-effort: o webhook precisa responder 200 mesmo se a mensagem falhar.
async function safeSend(chatId: string, html: string): Promise<void> {
  try {
    await sendTelegramMessage(chatId, html);
  } catch (error) {
    console.error(
      "Falha ao enviar mensagem Telegram:",
      error instanceof Error ? error.message : error,
    );
  }
}

export type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: {
      id?: number | string;
      type?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
  };
};

const CONNECT_INSTRUCTION =
  "Para conectar sua conta, acesse o Amazon Price Tracker e clique em “Conectar Telegram”.";

const SUCCESS_MESSAGE =
  "✅ <b>Telegram conectado com sucesso ao Amazon Price Tracker.</b>\nVocê receberá alertas apenas dos seus itens monitorados.";

const EXPIRED_OR_USED_MESSAGE =
  "Este link expirou ou já foi usado. Volte ao site e gere um novo link de conexão.";

const CHAT_IN_USE_MESSAGE =
  "Este Telegram já está conectado a outra conta do Amazon Price Tracker.\nDesconecte a conta antiga antes de conectar novamente.";

// Processa um update recebido no webhook. Nunca lança: o caller responde 200
// ao Telegram independentemente do resultado de negócio (token inválido etc.),
// caso contrário o Telegram reenfileira e acaba desabilitando o webhook.
export async function handleTelegramUpdate(
  update: TelegramUpdate,
): Promise<void> {
  const message = update?.message;
  if (!message || typeof message.text !== "string") {
    return;
  }

  const chat = message.chat;
  if (!chat || chat.id == null) {
    return;
  }

  const chatId = String(chat.id);

  // Aceita "/start TOKEN" e "/start@bot TOKEN".
  const startMatch = message.text.trim().match(/^\/start(?:@\w+)?\s+(\S+)/);
  if (!startMatch) {
    await safeSend(chatId, CONNECT_INSTRUCTION);
    return;
  }

  const token = startMatch[1]!;
  const from = message.from;

  const meta: TelegramMetadata = {
    chatId,
    telegramUserId: from?.id != null ? String(from.id) : null,
    telegramUsername: from?.username ?? chat.username ?? null,
    telegramFirstName: from?.first_name ?? chat.first_name ?? null,
    telegramLastName: from?.last_name ?? chat.last_name ?? null,
    telegramLanguageCode: from?.language_code ?? null,
    telegramChatType: chat.type ?? null,
  };

  const result = linkTelegramFromToken(token, meta);

  if (result.status === "linked") {
    await safeSend(chatId, SUCCESS_MESSAGE);
  } else if (result.status === "chat_in_use") {
    await safeSend(chatId, CHAT_IN_USE_MESSAGE);
  } else {
    await safeSend(chatId, EXPIRED_OR_USED_MESSAGE);
  }
}
