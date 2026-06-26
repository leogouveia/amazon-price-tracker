import {
  fetchProductInfo,
  getPreviousPrice,
  listActiveMonitorItems,
  savePriceHistory,
} from "./database";
import { htmlEscape, sendTelegramMessage } from "./telegram";
import { getSendableConnectionByUserId } from "./telegram-store";
import { checkVariation, formatDateTime, hasTargetPrice } from "./utils";

export type MonitorProductError = {
  userItemId: number;
  asin: string;
  message: string;
};

export type MonitorResult = {
  checked: number;
  errors: MonitorProductError[];
  durationMs: number;
};

export class MonitorAlreadyRunningError extends Error {
  constructor() {
    super("Monitoramento já em execução");
    this.name = "MonitorAlreadyRunningError";
  }
}

type ProductReport = {
  title: string;
  url: string;
  formattedPrice: string;
  formattedPreviousPrice: string;
  variation: string;
  targetLine: string;
  reachedTarget: boolean;
};

let monitorRunning = false;

export function isMonitorRunning(): boolean {
  return monitorRunning;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) {
    return "Não encontrado";
  }

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function buildMonitorTelegramMessage(
  entries: ProductReport[],
  errors: MonitorProductError[],
): string {
  const lines: string[] = [
    "📊 <b>Monitoramento de preços</b>",
    `📅 ${new Date().toLocaleString("pt-BR")}`,
    "",
  ];

  for (const entry of entries) {
    const status = entry.reachedTarget ? "🔥" : "👀";
    lines.push(`${status} <b>${htmlEscape(entry.title)}</b>`);
    if (entry.reachedTarget) {
      lines.push("🔥 <b>Alvo atingido!</b>");
    }
    lines.push(
      `💰 ${entry.formattedPrice} | 🕒 ${entry.formattedPreviousPrice}`,
    );
    if (entry.variation) {
      lines.push(entry.variation.trimEnd());
    }
    if (entry.targetLine) {
      lines.push(entry.targetLine.trimEnd());
    }
    lines.push(`🔗 <a href="${htmlEscape(entry.url)}">Abrir produto</a>`);
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(`❌ <b>Erros (${errors.length})</b>`);
    for (const error of errors) {
      lines.push(`• ${error.asin}: ${error.message}`);
    }
  }

  return lines.join("\n").trimEnd();
}

export async function runPriceMonitor(): Promise<MonitorResult> {
  if (monitorRunning) {
    throw new MonitorAlreadyRunningError();
  }

  monitorRunning = true;
  const startedAt = Date.now();
  const errors: MonitorProductError[] = [];
  // Relatórios e erros são acumulados por usuário para que cada um receba
  // apenas os próprios itens — nunca um resumo global com itens de terceiros.
  const reportsByUser = new Map<number, ProductReport[]>();
  const errorsByUser = new Map<number, MonitorProductError[]>();
  let checked = 0;

  try {
    const items = listActiveMonitorItems();
    const groupedByAsin = new Map<string, typeof items>();

    for (const item of items) {
      const group = groupedByAsin.get(item.asin) ?? [];
      group.push(item);
      groupedByAsin.set(item.asin, group);
    }

    for (const [asin, group] of groupedByAsin) {
      const sample = group[0]!;

      try {
        console.log(`\n🔎 Verificando ASIN: ${asin} (${group.length} item(ns))`);

        // Scraping deduplicado por ASIN: uma busca, fan-out por usuário.
        const info = await fetchProductInfo(sample.url);
        const title = info.title?.trim() ?? sample.title ?? asin;
        const price = info.price;

        for (const item of group) {
          savePriceHistory({
            userItemId: item.user_item_id,
            price,
          });

          const previous = getPreviousPrice(item.user_item_id);

          const reachedTarget =
            price !== null &&
            hasTargetPrice(item.target_price) &&
            price <= item.target_price;

          const formattedPreviousPrice = previous
            ? `${formatCurrency(previous.price)} (${formatDateTime(previous.checked_at)})`
            : "Primeira verificação";

          const targetLine = hasTargetPrice(item.target_price)
            ? `🎯 Alvo: ${formatCurrency(item.target_price)}`
            : "";

          const userReports = reportsByUser.get(item.user_id) ?? [];
          userReports.push({
            title,
            url: sample.url,
            formattedPrice: formatCurrency(price),
            formattedPreviousPrice,
            variation: checkVariation(price, previous?.price) ?? "",
            targetLine,
            reachedTarget,
          });
          reportsByUser.set(item.user_id, userReports);
        }

        checked += group.length;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        for (const item of group) {
          const entry = {
            userItemId: item.user_item_id,
            asin: item.asin,
            message,
          };
          errors.push(entry);
          const userErrors = errorsByUser.get(item.user_id) ?? [];
          userErrors.push(entry);
          errorsByUser.set(item.user_id, userErrors);
        }
        console.error(`Erro ao verificar ASIN ${asin}:`, error);
      }
    }

    await sendPerUserSummaries(reportsByUser, errorsByUser);

    return {
      checked,
      errors,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    monitorRunning = false;
  }
}

// Envia um resumo por usuário, somente para conexões aptas (ativas, habilitadas
// e de usuário não excluído). Usuários sem Telegram são ignorados sem erro.
async function sendPerUserSummaries(
  reportsByUser: Map<number, ProductReport[]>,
  errorsByUser: Map<number, MonitorProductError[]>,
): Promise<void> {
  const userIds = new Set<number>([
    ...reportsByUser.keys(),
    ...errorsByUser.keys(),
  ]);

  for (const userId of userIds) {
    const connection = getSendableConnectionByUserId(userId);
    if (!connection) {
      continue;
    }

    const userReports = reportsByUser.get(userId) ?? [];
    const userErrors = errorsByUser.get(userId) ?? [];

    if (userReports.length === 0 && userErrors.length === 0) {
      continue;
    }

    try {
      await sendTelegramMessage(
        connection.chat_id,
        buildMonitorTelegramMessage(userReports, userErrors),
      );
    } catch (error) {
      console.error(
        `Falha ao enviar resumo Telegram para usuário ${userId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
