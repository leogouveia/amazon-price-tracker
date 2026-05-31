export function extractASIN(url: string): string | null {
    const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);

    return match?.[1] ?? null;
}


export function resolveTargetPrice(
    value: number | null | undefined,
): number | null {
    if (value == null || value === 0 || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    return value;
}

export function hasTargetPrice(value: number | null | undefined): boolean {
    return resolveTargetPrice(value) !== null;
}

export function parseTargetPriceInput(input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const value = Number.parseFloat(trimmed);
    return resolveTargetPrice(value);
}

export function targetPriceForDb(value: number | null | undefined): number {
    return resolveTargetPrice(value) ?? 0;
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return "Não verificado";

    // SQLite grava CURRENT_TIMESTAMP em UTC no formato "YYYY-MM-DD HH:MM:SS".
    // Marcamos como UTC para o JS converter corretamente ao fuso local.
    const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) return "Não verificado";

    return date.toLocaleString("pt-BR");
}

export function parsePrice(text: string): number | null {
    const cleaned = text
        .replace(/\s/g, "")
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".");

    const price = Number.parseFloat(cleaned);

    return Number.isFinite(price) ? price : null;
}

export type PriceVariation = {
    icon: string;
    formattedDiff: string;
    diff: number;
};

export function getPriceVariation(
    price: number | null,
    previousPrice: number | null | undefined,
): PriceVariation | null {
    if (price === null || previousPrice == null) {
        return null;
    }

    const diff = price - previousPrice;
    const icon = diff > 0 ? "⬆️🔴" : diff < 0 ? "⬇️🟢" : "➖🟡";
    const formattedDiff = diff.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        signDisplay: "exceptZero",
    });

    return { icon, formattedDiff, diff };
}

export function checkVariation(
    price: number | null,
    previousPrice: number | undefined,
): string {
    const variation = getPriceVariation(price, previousPrice);
    if (!variation) {
        return "";
    }

    return `${variation.icon} <b>Variação:</b> ${variation.formattedDiff}\n`;
}