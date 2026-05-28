import "dotenv/config";
import { chromium } from "playwright";
import {
  getPreviousPrice,
  listProducts,
  savePriceHistory,
} from "./database.js";
import { sendTelegramMessage } from "./telegram.js";

function parsePrice(text: string): number | null {
  const cleaned = text
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");

  const price = Number.parseFloat(cleaned);

  return Number.isFinite(price) ? price : null;
}

async function main() {
  const products = await listProducts();
  console.log(products);

  const browser = await chromium.launch({});

  const page = await browser.newPage({
    locale: "pt-BR",
  });

  for (const product of products) {
    console.log(`\n🔎 Verificando: ${product.id}`);

    await page.goto(product.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const title = await page
      .locator("#productTitle")
      .first()
      .textContent()
      .catch(() => null);

    const priceText = await page
      .locator(".a-price .a-offscreen")
      .first()
      .textContent()
      .catch(() => null);

    const price = priceText ? parsePrice(priceText) : null;
    const previousPrice = getPreviousPrice(product.asin)?.price;

    savePriceHistory({
      productId: product.id,
      price,
    });

    console.log("Título:", title?.trim() ?? "não encontrado");
    console.log("Preço texto:", priceText ?? "não encontrado");
    console.log("Preço número:", price ?? "não encontrado");
    console.log("Preço anterior:", previousPrice ?? "não encontrado");

    const reachedTarget =
      price !== null &&
      product.target_price !== null &&
      price <= product.target_price;

    const status = reachedTarget
      ? "🔥 Abaixo do preço alvo!"
      : "👀 Monitoramento diário";

    const formattedPrice = price?.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const formattedTargetPrice = product.target_price?.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const formattedPreviousPrice =
      previousPrice?.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) ?? "Primeira verificação";

    const variation = checkVariation(price, previousPrice) ?? "";
    await sendTelegramMessage(
      `${status}\n\n` +
        `📦 <b>${title?.trim() ?? product.id}</b>\n\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `💰 <b>Preço atual:</b> ${formattedPrice ?? "Não encontrado"}\n` +
        `🕒 <b>Último preço:</b> ${formattedPreviousPrice}\n` +
        variation +
        `🎯 <b>Preço alvo:</b> ${formattedTargetPrice ?? "Não definido"}\n\n` +
        `📅 <b>Verificado em:</b> ${new Date().toLocaleString("pt-BR")}\n\n` +
        `━━━━━━━━━━━━━━\n\n` +
        `🔗 <a href="${product.url}">Abrir produto</a>`,
    );
  }
  await browser.close();
}

function checkVariation(
  price: number | null,
  previousPrice: number | undefined,
): string {
  if (price !== null && previousPrice != null) {
    const diff = price - previousPrice;

    const icon = diff > 0 ? "📈" : diff < 0 ? "📉" : "➖";

    return (
      `${icon} <b>Variação:</b> ` +
      `${diff.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}\n`
    );
  }
  return "";
}

main().catch((error) => {
  console.error("Erro: ", error);
  process.exit(1);
});
