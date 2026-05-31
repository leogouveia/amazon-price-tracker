import {
  fetchProductInfo,
  getPreviousPrice,
  listProducts,
  savePriceHistory,
} from "./database";
import { sendTelegramMessage } from "./telegram";
import { checkVariation, formatDateTime, hasTargetPrice } from "./utils";

export type MonitorProductError = {
  productId: number;
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
    const products = await listProducts();

    for (const product of products) {
      try {
        console.log(`\n🔎 Verificando: ${product.id}`);

        const info = await fetchProductInfo(product.url);
        const title = info.title ?? product.title;
        const price = info.price;

        savePriceHistory({
          productId: product.id,
          price,
        });

        const previous = getPreviousPrice(String(product.id));

        console.log("Título:", title ?? "não encontrado");
        console.log("Preço número:", price ?? "não encontrado");
        console.log(
          "Preço anterior:",
          previous
            ? `${previous.price} (${formatDateTime(previous.checked_at)})`
            : "não encontrado",
        );

        const reachedTarget =
          price !== null &&
          hasTargetPrice(product.target_price) &&
          price <= product.target_price;

        const formattedPreviousPrice = previous
          ? `${formatCurrency(previous.price)} (${formatDateTime(previous.checked_at)})`
          : "Primeira verificação";

        const targetLine = hasTargetPrice(product.target_price)
          ? `🎯 Alvo: ${formatCurrency(product.target_price)}`
          : "";

        reports.push({
          title: title?.trim() ?? String(product.id),
          url: product.url,
          formattedPrice: formatCurrency(price),
          formattedPreviousPrice,
          variation: checkVariation(price, previous?.price) ?? "",
          targetLine,
          reachedTarget,
        });

        checked += 1;
      } catch (error) {
        errors.push({
          productId: product.id,
          asin: product.asin,
          message: error instanceof Error ? error.message : "Erro desconhecido",
        });
        console.error(`Erro ao verificar produto ${product.asin}:`, error);
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
