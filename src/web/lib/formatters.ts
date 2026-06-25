import { hasTargetPrice } from "../../utils";

export function formatPrice(price: number | null) {
  if (price === null) return "Não encontrado";

  return price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatTargetPrice(price: number | null) {
  if (!hasTargetPrice(price)) return "Não definido";

  return price!.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function variationColorClass(diff: number): string {
  if (diff > 0) return "text-error";
  if (diff < 0) return "text-success";
  return "text-warning";
}
