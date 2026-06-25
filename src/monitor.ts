import {
  fetchProductInfo,
  getPreviousPrice,
  listActiveMonitorItems,
  savePriceHistory,
} from "./database";
import { sendTelegramMessage } from "./telegram";
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
    lines.push(`${status} <b>${entry.title}</b>`);
    lines.push(
      `💰 ${entry.formattedPrice} | 🕒 ${entry.formattedPreviousPrice}`,
    );
    if (entry.variation) {
      lines.push(entry.variation.trimEnd());
    }
    if (entry.targetLine) {
      lines.push(entry.targetLine.trimEnd());
    }
    lines.push(`🔗 <a href="${entry.url}">Abrir produto</a>`);
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
  const reports: ProductReport[] = [];
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

        const info = await fetchProductInfo(sample.url);
        const title = info.title ?? sample.title;
        const price = info.price;

        for (const item of group) {
          savePriceHistory({
            userItemId: item.user_item_id,
            price,
          });
        }

        const previous = getPreviousPrice(sample.user_item_id);

        const reachedTarget =
          price !== null &&
          hasTargetPrice(sample.target_price) &&
          price <= sample.target_price;

        const formattedPreviousPrice = previous
          ? `${formatCurrency(previous.price)} (${formatDateTime(previous.checked_at)})`
          : "Primeira verificação";

        const targetLine = hasTargetPrice(sample.target_price)
          ? `🎯 Alvo: ${formatCurrency(sample.target_price)}`
          : "";

        reports.push({
          title: title?.trim() ?? asin,
          url: sample.url,
          formattedPrice: formatCurrency(price),
          formattedPreviousPrice,
          variation: checkVariation(price, previous?.price) ?? "",
          targetLine,
          reachedTarget,
        });

        checked += group.length;
      } catch (error) {
        for (const item of group) {
          errors.push({
            userItemId: item.user_item_id,
            asin: item.asin,
            message: error instanceof Error ? error.message : "Erro desconhecido",
          });
        }
        console.error(`Erro ao verificar ASIN ${asin}:`, error);
      }
    }

    if (reports.length > 0 || errors.length > 0) {
      await sendTelegramMessage(buildMonitorTelegramMessage(reports, errors));
    }

    return {
      checked,
      errors,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    monitorRunning = false;
  }
}
