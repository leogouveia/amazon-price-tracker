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

export function parsePrice(text: string): number | null {
    const cleaned = text
        .replace(/\s/g, "")
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".");

    const price = Number.parseFloat(cleaned);

    return Number.isFinite(price) ? price : null;
}

export function checkVariation(
    price: number | null,
    previousPrice: number | undefined,
): string {
    if (price !== null && previousPrice != null) {
        const diff = price - previousPrice;

        const icon = diff > 0 ? "⬆️🔴" : diff < 0 ? "⬇️🟢" : "➖🟡";
        const formattedDiff = diff.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            signDisplay: "exceptZero",
        });

        return `${icon} <b>Variação:</b> ${formattedDiff}\n`;
    }
    return "";
}