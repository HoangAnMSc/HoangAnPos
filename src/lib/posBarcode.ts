import type { CartProductVariant, Product } from "../types";
import { getProductVariants, getVariantStock, type ProductVariant } from "./productPageData";
import { getProductEan13Value, isValidEan13, normalizeEan13Input } from "./productDisplay";

export function cartVariantFromSku(variant: ProductVariant): CartProductVariant {
  const id = variant.linked_values?._variant_id;
  return {
    id,
    key: id ?? JSON.stringify(variant.values),
    label: variant.display_label || Object.values(variant.values).join(" / ") || "Mặc định",
    image_url: variant.image_url,
    linked_values: variant.linked_values,
    source_values: [variant.values],
    values: variant.values,
    stock: getVariantStock(variant),
    shelf_stock: getVariantStock(variant),
  };
}

export function findCartVariantById(product: Product, id: string) {
  const variant = getProductVariants(product).find((row) => row.linked_values?._variant_id === id);
  return variant ? cartVariantFromSku(variant) : null;
}

export type PosBarcodeMatch = { product: Product; variant: CartProductVariant | null };

export function buildPosBarcodeIndex(products: Product[]) {
  // A duplicate is ambiguous: never silently sell whichever SKU was loaded first.
  const index = new Map<string, PosBarcodeMatch | null>();
  const add = (value: string | undefined, match: PosBarcodeMatch) => {
    const code = normalizeEan13Input(value);
    if (!isValidEan13(code)) return;
    index.set(code, index.has(code) ? null : match);
  };
  for (const product of products) {
    const variants = getProductVariants(product);
    if (variants.length) {
      for (const variant of variants) {
        add(variant.linked_values?.barcode, { product, variant: cartVariantFromSku(variant) });
      }
    } else {
      const attributes = product.attributes;
      const isEngineProduct = attributes && typeof attributes === "object" && !Array.isArray(attributes) && "_variants" in attributes;
      if (!isEngineProduct) add(getProductEan13Value(product), { product, variant: null });
    }
  }
  return index;
}
