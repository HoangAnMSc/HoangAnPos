import { requireSupabaseConfig, supabase } from "../lib/supabase";
import { fetchProducts as fetchEngineProducts } from "../features/products/services/productEngine";

export type CustomAttributeType =
  "text" | "number" | "date" | "single" | "multiple" | "media";
export type CustomProductAttribute = {
  id: string;
  name: string;
  type: CustomAttributeType;
  enabled: boolean;
  unit?: string | null;
  options: string[];
  optionColors?: Record<string, string>;
  optionImages?: Record<string, string>;
  optionDisplay?: "color" | "text" | "both";
  variantDisplayType?: "color" | "color_circle" | "text_button" | "image" | "image_text" | "image_text_horizontal" | "dropdown";
  useForVariants?: boolean;
};

export type ProductCardSettings = {
  showImage: boolean;
  showName: boolean;
  showPrice: boolean;
  showShelfStock: boolean;
  showExpiry: boolean;
  showCategory: boolean;
  showAttributes: boolean;
  imageFit: "cover" | "contain";
  order: string[];
  visibleFields: string[];
  textTemplates: Record<string, string>;
  templateHtml?: string;
  templateCss?: string;
  templates?: Array<{
    id: string;
    name: string;
    html: string;
    css: string;
    createdAt: string;
  }>;
};

export type ProductSettings = {
  id: string;
  enableColor: boolean;
  enableSize: boolean;
  customAttributes: CustomProductAttribute[];
  attributeOrder: string[];
  enabledFields: Record<string, boolean>;
  card: ProductCardSettings;
  posCard: ProductCardSettings;
  linkedAttributeIds: string[];
};

export const defaultProductSettings: ProductSettings = {
  id: "default",
  enableColor: false,
  enableSize: false,
  customAttributes: [],
  linkedAttributeIds: [],
  attributeOrder: [
    "image",
    "name",
    "sku",
    "category",
    "description",
    "price",
    "compare_price",
    "cost_price",
    "stock",
    "variant_count",
    "import_date",
    "expiry_date",
    "is_active",
    "is_reward",
    "reward_points_cost",
  ],
  enabledFields: {
    image: true,
    name: true,
    sku: true,
    category: true,
    description: true,
    price: true,
    compare_price: true,
    cost_price: true,
    stock: true,
    variant_count: true,
    shelf_stock: false,
    import_date: true,
    expiry_date: true,
    is_active: true,
    is_reward: true,
    reward_points_cost: true,
  },
  card: {
    showImage: true,
    showName: true,
    showPrice: true,
    showShelfStock: true,
    showExpiry: true,
    showCategory: false,
    showAttributes: true,
    imageFit: "cover",
    order: [
      "image",
      "name",
      "sku",
      "category",
      "description",
      "price",
      "compare_price",
      "cost_price",
      "stock",
      "variant_count",
      "import_date",
      "expiry_date",
      "is_active",
      "is_reward",
      "reward_points_cost",
    ],
    visibleFields: ["image", "name", "category", "price", "compare_price", "stock", "variant_count"],
    textTemplates: {
      name: "{value}",
      category: "{value}",
      price: "{value}",
      stock: "Còn {value} trong kho",
      expiry_date: "Hạn: {value}",
    },
  },
  posCard: {
    showImage: true,
    showName: true,
    showPrice: true,
    showShelfStock: true,
    showExpiry: false,
    showCategory: false,
    showAttributes: false,
    imageFit: "cover",
    order: ["image", "name", "stock", "price", "compare_price", "variant_count"],
    visibleFields: ["image", "name", "price", "compare_price", "stock", "variant_count"],
    textTemplates: {
      name: "{value}",
      category: "{value}",
      price: "{value}",
      stock: "Còn {value} trong kho",
      expiry_date: "Hạn: {value}",
    },
  },
};

function fromRow(row: {
  id: string;
  enable_color: boolean;
  enable_size: boolean;
  custom_attributes: unknown;
  card_settings: unknown;
}): ProductSettings {
  const removedBuiltInAttributes = new Set(["color", "size"]);
  const customAttributes = Array.isArray(row.custom_attributes)
    ? (row.custom_attributes as CustomProductAttribute[])
    : [];
  const savedLinkedAttributeIds = Array.isArray(
    (row.card_settings as { linkedAttributeIds?: unknown })?.linkedAttributeIds,
  )
    ? (row.card_settings as { linkedAttributeIds: string[] }).linkedAttributeIds
    : customAttributes
        .filter((item) => item.useForVariants)
        .map((item) => item.id);
  const savedOrder = Array.isArray(
    (row.card_settings as { attributeOrder?: unknown })?.attributeOrder,
  )
    ? (row.card_settings as { attributeOrder: string[] }).attributeOrder.filter(
        (key) => !removedBuiltInAttributes.has(key),
      )
    : defaultProductSettings.attributeOrder;
  const availableAttributeIds = [
    ...defaultProductSettings.attributeOrder,
    ...customAttributes.map((item) => item.id),
  ];
  const attributeOrder = [
    ...savedOrder.filter((id) => availableAttributeIds.includes(id)),
    ...availableAttributeIds.filter((id) => !savedOrder.includes(id)),
  ];
  const savedEnabled =
    (row.card_settings as { enabledFields?: Record<string, boolean> })
      ?.enabledFields ?? {};
  const enabledFields = {
    ...defaultProductSettings.enabledFields,
    ...savedEnabled,
  };
  delete enabledFields.color;
  delete enabledFields.size;
  const rawCard = row.card_settings as Partial<ProductCardSettings> & {
    visibleFields?: string[];
  };
  const savedVisible = Array.isArray(rawCard?.visibleFields)
    ? rawCard.visibleFields
    : defaultProductSettings.card.visibleFields;
  const visibleFields = savedVisible.filter((key) =>
    attributeOrder.includes(key),
  );
  const savedCardOrder = Array.isArray(rawCard?.order)
    ? rawCard.order.filter((key) => attributeOrder.includes(key))
    : [];
  const cardOrder = [
    ...savedCardOrder,
    ...attributeOrder.filter((key) => !savedCardOrder.includes(key)),
  ];
  const rawPosCard = (
    row.card_settings as { posCard?: Partial<ProductCardSettings> }
  )?.posCard;
  const savedPosOrder = Array.isArray(rawPosCard?.order)
    ? rawPosCard.order.filter((key) => !removedBuiltInAttributes.has(key))
    : defaultProductSettings.posCard.order;
  const posCard = {
    ...defaultProductSettings.posCard,
    ...rawPosCard,
    order: [
      ...savedPosOrder,
      ...attributeOrder.filter((key) => !savedPosOrder.includes(key)),
    ],
    visibleFields: Array.isArray(rawPosCard?.visibleFields)
      ? rawPosCard.visibleFields
      : defaultProductSettings.posCard.visibleFields,
  };
  return {
    id: row.id,
    enableColor: false,
    enableSize: false,
    customAttributes,
    linkedAttributeIds: savedLinkedAttributeIds.filter((id) =>
      attributeOrder.includes(id),
    ),
    attributeOrder,
    enabledFields,
    card: {
      ...defaultProductSettings.card,
      ...rawCard,
      order: cardOrder,
      visibleFields,
    },
    posCard,
  };
}

export async function fetchProductSettings() {
  requireSupabaseConfig();
  let dynamicAttributes: CustomProductAttribute[] = [];
  try {
    const products = await fetchEngineProducts();
    const byId = new Map<string, CustomProductAttribute>();
    products.forEach((product) => product.variant_attributes.forEach((attribute) => {
      const current = byId.get(attribute.id);
      const options = [...new Set([...(current?.options ?? []), ...attribute.values.filter((value) => value.is_active).map((value) => value.label)])];
      byId.set(attribute.id, {
        id: attribute.id, name: attribute.name, type: "single", enabled: true, options,
        unit: attribute.unit,
        optionColors: Object.fromEntries(attribute.values.filter((value) => value.metadata.hex).map((value) => [value.label, value.metadata.hex as string])),
        optionImages: Object.fromEntries(attribute.values.filter((value) => value.metadata.image_url).map((value) => [value.label, value.metadata.image_url as string])),
        optionDisplay: attribute.display_type === "color" || attribute.display_type === "color_circle" ? "color" : attribute.display_type === "image_text" || attribute.display_type === "image_text_horizontal" ? "both" : "text",
        variantDisplayType: attribute.display_type,
        useForVariants: true,
      });
    }));
    dynamicAttributes = [...byId.values()];
  } catch (engineError) {
    if (!(engineError instanceof Error) || !/product_types|product_variant|schema cache|does not exist/i.test(engineError.message)) throw engineError;
  }
  const { data, error } = await supabase
    .from("product_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        ...defaultProductSettings,
        customAttributes: dynamicAttributes,
        attributeOrder: [...defaultProductSettings.attributeOrder, ...dynamicAttributes.map((item) => item.id)],
        enabledFields: { ...defaultProductSettings.enabledFields, ...Object.fromEntries(dynamicAttributes.map((item) => [item.id, true])) },
      };
    }
    throw error;
  }
  const saved = data ? fromRow(data as never) : defaultProductSettings;
  const dynamicIds = dynamicAttributes.map((item) => item.id);
  return {
    ...saved,
    customAttributes: dynamicAttributes,
    attributeOrder: [
      ...saved.attributeOrder.filter((id) => !dynamicIds.includes(id)),
      ...dynamicIds,
    ],
    enabledFields: {
      ...saved.enabledFields,
      ...Object.fromEntries(dynamicIds.map((id) => [id, true])),
    },
  };
}

export async function saveProductSettings(settings: ProductSettings) {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("product_settings")
    .upsert({
      id: "default",
      enable_color: settings.enableColor,
      enable_size: settings.enableSize,
      custom_attributes: settings.customAttributes,
      card_settings: {
        ...settings.card,
        attributeOrder: settings.attributeOrder,
        enabledFields: settings.enabledFields,
        posCard: settings.posCard,
        linkedAttributeIds: settings.linkedAttributeIds,
      },
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error(
        "Database chưa có bảng product_settings. Hãy chạy lại supabase/schema.sql.",
      );
    }
    throw error;
  }
  return fromRow(data as never);
}
