import { requireSupabaseConfig, supabase } from "../lib/supabase";

export type CustomAttributeType =
  "text" | "number" | "date" | "single" | "multiple" | "media";
export type CustomProductAttribute = {
  id: string;
  name: string;
  type: CustomAttributeType;
  enabled: boolean;
  options: string[];
  optionColors?: Record<string, string>;
  optionDisplay?: "color" | "text" | "both";
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
    "cost_price",
    "stock",
    "shelf_stock",
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
    cost_price: true,
    stock: true,
    shelf_stock: true,
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
      "cost_price",
      "stock",
      "shelf_stock",
      "import_date",
      "expiry_date",
      "is_active",
      "is_reward",
      "reward_points_cost",
    ],
    visibleFields: ["image", "name", "category", "price", "shelf_stock"],
    textTemplates: {
      name: "{value}",
      category: "{value}",
      price: "{value}",
      shelf_stock: "Còn {value} trên kệ",
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
    order: ["image", "name", "shelf_stock", "price"],
    visibleFields: ["image", "name", "shelf_stock", "price"],
    textTemplates: {
      name: "{value}",
      category: "{value}",
      price: "{value}",
      shelf_stock: "Còn {value} trên kệ",
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
  const { data, error } = await supabase
    .from("product_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01")
      return defaultProductSettings;
    throw error;
  }
  return data ? fromRow(data as never) : defaultProductSettings;
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
