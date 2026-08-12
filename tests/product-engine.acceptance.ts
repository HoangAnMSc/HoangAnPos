import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  countVariantCombinations,
  createSkuPrefix,
  generateVariantCombinations,
  isVariantValueAvailable,
  mergeGeneratedVariants,
} from "../src/features/products/utils/variants";
import type {
  ProductVariant,
  VariantAttribute,
} from "../src/features/products/types";
import {
  createVietnamEan13FromSeed,
  isValidEan13,
} from "../src/lib/productDisplay";

function attribute(
  name: string,
  labels: string[],
  display_type: VariantAttribute["display_type"] = "text_button",
): VariantAttribute {
  const id = crypto.randomUUID();
  return {
    id,
    product_id: crypto.randomUUID(),
    source_attribute_id: null,
    name,
    code: name.toLowerCase(),
    data_type: "option",
    display_type,
    is_required: true,
    sort_order: 0,
    values: labels.map((label, index) => ({
      id: crypto.randomUUID(),
      variant_attribute_id: id,
      label,
      value: label.toLowerCase(),
      metadata: {},
      sort_order: index,
      is_active: true,
    })),
  };
}

const color = attribute("Color", ["Blue", "White"], "color_circle");
const size = attribute("Size", ["S", "M", "L"]);
assert.equal(
  countVariantCombinations([color, size]),
  6,
  "CASE 1 must generate 6 SKUs",
);
assert.equal(generateVariantCombinations([color, size]).length, 6);

const material = attribute("Material", ["Cotton", "Linen"]);
assert.equal(
  countVariantCombinations([
    attribute("Color", ["Black", "Cream"]),
    attribute("Size", ["M", "L", "XL"]),
    material,
  ]),
  12,
  "CASE 2 remains product-specific",
);

const collar = attribute("Kiểu cổ", ["Cổ tròn", "Cổ V"], "image_text");
assert.equal(
  countVariantCombinations([color, size, collar]),
  12,
  "CASE 3 adds a dimension without schema changes",
);
assert.deepEqual(
  [color.display_type, size.display_type, collar.display_type],
  ["color_circle", "text_button", "image_text"],
  "CASE 4 display types are data-driven",
);

const drafts = mergeGeneratedVariants([color, size], [], "SHIRT");
const blueM = drafts.find(
  (variant) =>
    variant.value_ids.includes(color.values[0].id) &&
    variant.value_ids.includes(size.values[1].id),
)!;
const inventory = drafts.map((variant): ProductVariant => ({
  ...variant,
  id: crypto.randomUUID(),
  product_id: crypto.randomUUID(),
  image_url: null,
  cloudinary_public_id: null,
  stock_quantity: variant === blueM ? 0 : 10,
}));
assert.equal(
  isVariantValueAvailable(
    inventory,
    { [color.id]: color.values[0].id },
    size.id,
    size.values[1].id,
  ),
  false,
  "CASE 9 unavailable combinations are disabled",
);

const defaultSku = mergeGeneratedVariants([], [], "TABLE");
assert.equal(defaultSku.length, 1, "CASE 10 creates one default SKU");
assert.equal(defaultSku[0].is_default, true);
assert.notEqual(
  createSkuPrefix("san-pham-cung-tien-to-a"),
  createSkuPrefix("san-pham-cung-tien-to-b"),
  "SKU prefixes must not collide when long slugs share the same prefix",
);

const generatedEan13 = createVietnamEan13FromSeed("product-engine-acceptance");
assert.equal(
  generatedEan13.startsWith("893"),
  true,
  "Generated EAN-13 must use Vietnam prefix 893",
);
assert.equal(
  isValidEan13(generatedEan13),
  true,
  "Generated EAN-13 must have a valid checksum",
);

const sql = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
for (const table of [
  "product_types",
  "product_attributes",
  "product_variant_attributes",
  "product_variant_values",
  "product_variants",
  "variant_value_links",
  "promotions",
  "promotion_conditions",
  "promotion_scopes",
  "promotion_redemptions",
]) {
  assert.match(
    sql,
    new RegExp(`create table public\\.${table}\\b`, "i"),
    `${table} must exist`,
  );
}
assert.match(sql, /for update/i, "stock checkout must lock rows");
assert.match(sql, /evaluate_promotions/i, "promotion engine must be installed");
assert.match(
  sql,
  /product_variants_barcode_key[\s\S]*unique\s*\(barcode\)/i,
  "EAN-13 must be unique per SKU",
);
for (const typeCode of [
  "general",
  "clothing",
  "laptop",
  "smartphone",
  "furniture",
  "machine",
]) {
  assert.match(
    sql,
    new RegExp(`'${typeCode}'`, "i"),
    `Starter catalog must include ${typeCode}`,
  );
}
assert.match(
  sql,
  /on conflict/i,
  "Starter catalog seed must be safe to rerun",
);
assert.match(
  sql,
  /variant_value_links_variant_value_id_fkey[\s\S]*on delete cascade/i,
  "Removing a variant value must cascade its junction links",
);
assert.match(
  sql,
  /variant_value_links_variant_value_id_variant_attribute_id_fkey[\s\S]*on delete cascade/i,
  "Composite variant-value ownership FK must cascade",
);
console.log("Product engine acceptance checks passed.");
