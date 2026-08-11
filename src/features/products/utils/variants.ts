import type {
  ProductVariant,
  VariantAttribute,
  VariantDraft,
  VariantSelection,
} from "../types";

export const MAX_VARIANT_COMBINATIONS = 5000;

export function createSkuPrefix(slug: string) {
  return (
    slug
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "SKU"
  );
}

export function countVariantCombinations(attributes: VariantAttribute[]) {
  if (!attributes.length) return 1;
  return attributes.reduce(
    (total, attribute) =>
      total * attribute.values.filter((value) => value.is_active).length,
    1,
  );
}

export function generateVariantCombinations(attributes: VariantAttribute[]) {
  const count = countVariantCombinations(attributes);
  if (count > MAX_VARIANT_COMBINATIONS)
    throw new Error(
      `Có ${count.toLocaleString("vi-VN")} tổ hợp, vượt giới hạn an toàn ${MAX_VARIANT_COMBINATIONS.toLocaleString("vi-VN")}.`,
    );
  return [...attributes]
    .sort((a, b) => a.sort_order - b.sort_order)
    .reduce<string[][]>(
      (rows, attribute) => {
        const values = [...attribute.values]
          .filter((value) => value.is_active)
          .sort((a, b) => a.sort_order - b.sort_order);
        return rows.flatMap((row) => values.map((value) => [...row, value.id]));
      },
      [[]],
    );
}

export function variantCombinationKey(valueIds: string[]) {
  return [...valueIds].sort().join(":");
}

export function mergeGeneratedVariants(
  attributes: VariantAttribute[],
  current: VariantDraft[],
  skuPrefix: string,
) {
  const existing = new Map(
    current.map((variant) => [
      variantCombinationKey(variant.value_ids),
      variant,
    ]),
  );
  return generateVariantCombinations(attributes).map(
    (valueIds, index): VariantDraft =>
      existing.get(variantCombinationKey(valueIds)) ?? {
        sku: `${skuPrefix || "SKU"}-${String(index + 1).padStart(3, "0")}`,
        barcode: null,
        base_price: 0,
        compare_at_price: null,
        cost_price: 0,
        stock_quantity: 0,
        shelf_quantity: 0,
        weight: null,
        is_default: attributes.length === 0,
        is_active: true,
        value_ids: valueIds,
        image_url: null,
        cloudinary_public_id: null,
      },
  );
}

export function findSelectedVariant(
  variants: ProductVariant[],
  selection: VariantSelection,
) {
  const selectedIds = Object.values(selection).sort();
  return (
    variants.find(
      (variant) =>
        variant.is_active &&
        variantCombinationKey(variant.value_ids) ===
          variantCombinationKey(selectedIds),
    ) ?? null
  );
}

export function isVariantValueAvailable(
  variants: ProductVariant[],
  selection: VariantSelection,
  attributeId: string,
  valueId: string,
) {
  const required = Object.entries({ ...selection, [attributeId]: valueId }).map(
    ([, id]) => id,
  );
  return variants.some(
    (variant) =>
      variant.is_active &&
      variant.stock_quantity > 0 &&
      required.every((id) => variant.value_ids.includes(id)),
  );
}

export function getVariantLabel(
  variant: Pick<ProductVariant, "value_ids">,
  attributes: VariantAttribute[],
) {
  const values = new Map(
    attributes.flatMap((attribute) =>
      attribute.values.map((value) => [value.id, value.label] as const),
    ),
  );
  return (
    variant.value_ids
      .map((id) => values.get(id))
      .filter(Boolean)
      .join(" / ") || "Mặc định"
  );
}
