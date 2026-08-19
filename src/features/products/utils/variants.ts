import type {
  Product,
  ProductVariant,
  VariantAttribute,
  VariantDraft,
  VariantSelection,
} from "../types";

export const MAX_VARIANT_COMBINATIONS = 5000;

export function formatVariantValueLabel(
  label: string,
  unit?: string | null,
) {
  const cleanLabel = label.trim();
  const cleanUnit = unit?.trim();
  if (!cleanUnit || !cleanLabel) return cleanLabel;
  const escapedUnit = cleanUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escapedUnit}$`, "i").test(cleanLabel)
    ? cleanLabel
    : `${cleanLabel} ${cleanUnit}`;
}

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

export function sortVariantsByAttributeOrder<
  T extends Pick<ProductVariant, "value_ids">,
>(variants: T[], attributes: VariantAttribute[]) {
  const orderedAttributes = [...attributes].sort(
    (first, second) => first.sort_order - second.sort_order,
  );

  return [...variants].sort((first, second) => {
    for (const attribute of orderedAttributes) {
      const orderedValues = [...attribute.values].sort(
        (firstValue, secondValue) =>
          firstValue.sort_order - secondValue.sort_order,
      );
      const firstIndex = orderedValues.findIndex((value) =>
        first.value_ids.includes(value.id),
      );
      const secondIndex = orderedValues.findIndex((value) =>
        second.value_ids.includes(value.id),
      );
      const comparison =
        (firstIndex < 0 ? Number.MAX_SAFE_INTEGER : firstIndex) -
        (secondIndex < 0 ? Number.MAX_SAFE_INTEGER : secondIndex);
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

export function productUsesVariants(
  product: Pick<Product, "variant_attributes" | "variants">,
) {
  return (
    product.variant_attributes.length > 0 ||
    product.variants.some(
      (variant) => variant.is_active && variant.value_ids.length > 0,
    )
  );
}

export function getSimpleProductVariant(
  product: Pick<Product, "variants">,
) {
  return (
    product.variants.find(
      (variant) =>
        variant.is_active &&
        variant.is_default &&
        variant.value_ids.length === 0,
    ) ??
    product.variants.find(
      (variant) => variant.is_active && variant.value_ids.length === 0,
    ) ??
    product.variants.find(
      (variant) => variant.is_default && variant.value_ids.length === 0,
    ) ??
    product.variants.find((variant) => variant.value_ids.length === 0) ??
    product.variants[0]
  );
}

export function getProductModeVariants(
  product: Pick<Product, "variant_attributes" | "variants">,
) {
  if (productUsesVariants(product)) {
    return product.variants.filter(
      (variant) => !variant.is_default && variant.value_ids.length > 0,
    );
  }

  const simpleVariant = getSimpleProductVariant(product);
  return simpleVariant ? [simpleVariant] : [];
}

export function getActiveProductModeVariants(
  product: Pick<Product, "variant_attributes" | "variants">,
) {
  return getProductModeVariants(product).filter((variant) => variant.is_active);
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
      attribute.values.map((value) => [
        value.id,
        formatVariantValueLabel(value.label, attribute.unit),
      ] as const),
    ),
  );
  return (
    variant.value_ids
      .map((id) => values.get(id))
      .filter(Boolean)
      .join(" / ") || "Mặc định"
  );
}
