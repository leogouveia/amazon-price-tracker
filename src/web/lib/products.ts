import { getPriceVariation, hasTargetPrice } from "../../utils";

export type ProductSortBy =
  | "created_at"
  | "title"
  | "variation"
  | "last_price"
  | "lowest_price"
  | "target_price";

export type SortDirection = "asc" | "desc";

export type ProductForSort = {
  asin: string;
  title: string | null;
  target_price: number;
  created_at: string;
  last_price: number | null;
  previous_price: number | null;
  lowest_price: number | null;
};

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const factor = direction === "asc" ? 1 : -1;
  return (a - b) * factor;
}

function getPriceVariationDiff(product: ProductForSort): number | null {
  return getPriceVariation(product.last_price, product.previous_price)?.diff ?? null;
}

function getTargetPriceForSort(product: ProductForSort): number | null {
  return hasTargetPrice(product.target_price) ? product.target_price : null;
}

export function sortProducts<T extends ProductForSort>(
  products: T[],
  sortBy: ProductSortBy,
  direction: SortDirection,
): T[] {
  const sorted = [...products];

  sorted.sort((a, b) => {
    switch (sortBy) {
      case "created_at": {
        const factor = direction === "asc" ? 1 : -1;
        return a.created_at.localeCompare(b.created_at) * factor;
      }
      case "title": {
        const factor = direction === "asc" ? 1 : -1;
        return (a.title ?? a.asin).localeCompare(b.title ?? b.asin, "pt-BR") * factor;
      }
      case "variation":
        return compareNullableNumbers(
          getPriceVariationDiff(a),
          getPriceVariationDiff(b),
          direction,
        );
      case "last_price":
        return compareNullableNumbers(a.last_price, b.last_price, direction);
      case "lowest_price":
        return compareNullableNumbers(a.lowest_price, b.lowest_price, direction);
      case "target_price":
        return compareNullableNumbers(
          getTargetPriceForSort(a),
          getTargetPriceForSort(b),
          direction,
        );
    }
  });

  return sorted;
}

export const PAGE_SIZE = 5;

export function getTotalPages(totalItems: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateProducts<T>(
  products: T[],
  page: number,
  pageSize = PAGE_SIZE,
): T[] {
  if (!isFinite(pageSize)) return products;
  const start = (page - 1) * pageSize;
  return products.slice(start, start + pageSize);
}
