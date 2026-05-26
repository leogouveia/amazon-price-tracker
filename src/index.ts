import "dotenv/config";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { savePriceHistory } from "./database.js";
import { sendTelegramMessage } from "./telegram.js";

type Product = {
  id: string;
  url: string;
  targetPrice?: number;
};

async function loadProducts(): Promise<Product[]> {
  const file = await readFile("products.json", "utf-8");
  return JSON.parse(file);
}

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
  const products = await loadProducts();
  console.log(products);

  const browser = await chromium.launch({

  })

  const page = await browser.newPage({
    locale: "pt-BR",
  })

  for (const product of products) {
    console.log(`\n🔎 Verificando: ${product.id}`);

    await page.goto(product.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })

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

    savePriceHistory({
      productId: product.id,
      title: title?.trim() ?? null,
      price,
      url: product.url,
      price_target: product.targetPrice ?? null
    });

    console.log("Título:", title?.trim() ?? "não encontrado");
    console.log("Preço texto:", priceText ?? "não encontrado");
    console.log("Preço número:", price ?? "não encontrado");

    const reachedTarget = price !== null && product.targetPrice !== null && price <= product.targetPrice!;


    const status = reachedTarget
      ? "🔥 Abaixo do preço alvo!"
      : "👀 Monitoramento diário";

    const formattedPrice = price?.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    const formattedTargetPrice = product.targetPrice?.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    await sendTelegramMessage(
      `${status}\n\n` +
      `📦 <b>${title?.trim() ?? product.id}</b>\n\n` +
      `━━━━━━━━━━━━━━\n\n` +
      `💰 <b>Preço atual:</b> ${formattedPrice ?? "Não encontrado"}\n\n` +
      `🎯 <b>Preço alvo:</b> ${formattedTargetPrice ?? "Não definido"}\n\n` +
      `📅 <b>Verificado em:</b> ${new Date().toLocaleString(
        "pt-BR"
      )}\n\n` +
      `━━━━━━━━━━━━━━\n\n` +
      `🔗 <a href="${product.url}">Abrir produto</a>`
    );
  }
  await browser.close();
}

main().catch((error) => {
  console.error("Erro: ", error);
  process.exit(1);
})