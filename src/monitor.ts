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

let monitorRunning = false;

export function isMonitorRunning(): boolean {
  return monitorRunning;
}

export async function runPriceMonitor(): Promise<MonitorResult> {
  if (monitorRunning) {
    throw new MonitorAlreadyRunningError();
  }

  monitorRunning = true;
  const startedAt = Date.now();
  const errors: MonitorProductError[] = [];
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

        const status = reachedTarget
          ? "🔥 Abaixo do preço alvo!"
          : "👀 Monitoramento diário";

        const formattedPrice = price?.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const targetLine = hasTargetPrice(product.target_price)
          ? `🎯 <b>Preço alvo:</b> ${product.target_price.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}\n\n`
          : "";

        const formattedPreviousPrice = previous
          ? `${previous.price.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })} (${formatDateTime(previous.checked_at)})`
          : "Primeira verificação";

        const variation = checkVariation(price, previous?.price) ?? "";

        await sendTelegramMessage(
          `${status}\n\n` +
          `📦 <b>${title?.trim() ?? product.id}</b>\n\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `💰 <b>Preço atual:</b> ${formattedPrice ?? "Não encontrado"}\n` +
          `🕒 <b>Último preço:</b> ${formattedPreviousPrice}\n` +
          variation +
          targetLine +
          `📅 <b>Verificado em:</b> ${new Date().toLocaleString("pt-BR")}\n\n` +
          `━━━━━━━━━━━━━━\n\n` +
          `🔗 <a href="${product.url}">Abrir produto</a>`,
        );

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

    return {
      checked,
      errors,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    monitorRunning = false;
  }
}
