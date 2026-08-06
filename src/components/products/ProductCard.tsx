import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import {
  formatExpiryDays,
  formatProductDate,
  getExpiryStatus,
  type ExpiryStatus,
} from "../../lib/productDisplay";
import {
  productBadgeToneClassNames,
  productFieldLabels,
} from "../../lib/productPageData";
import type { Product } from "../../types";
import type {
  CustomProductAttribute,
  ProductCardSettings,
} from "../../services/productSettings";
import { cardTypedFieldCss, getDefaultCardCode } from "./productCardCode";

type ProductCardProps = {
  actions?: React.ReactNode;
  badgeLabel?: string;
  badgeTone?: "green" | "neutral" | "amber" | "blue";
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  expiryClassName?: string;
  expiryLabel?: string;
  onSelect?: () => void;
  onEditField?: (key: string) => void;
  product: Product;
  settings?: ProductCardSettings;
  customAttributes?: CustomProductAttribute[];
  relatedProducts?: Product[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeCardHtml(html: string) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  documentNode
    .querySelectorAll("script,iframe,object,embed,link,meta,style,form")
    .forEach((node) => node.remove());
  documentNode.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "src") &&
          (value.startsWith("javascript:") || value.startsWith("data:text")))
      )
        node.removeAttribute(attribute.name);
      if (name === "classname") {
        node.setAttribute("class", attribute.value);
        node.removeAttribute(attribute.name);
      }
    });
  });
  return documentNode.body.innerHTML;
}

function normalizeCardValues(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return [String(value)];
}

function applyCardTextTemplate(
  settings: ProductCardSettings,
  key: string,
  value: string,
) {
  return settings.textTemplates?.[key]?.split("{value}").join(value) ?? value;
}

function applyCardHtmlTemplate(
  settings: ProductCardSettings,
  key: string,
  safeHtml: string,
) {
  const template = settings.textTemplates?.[key];
  if (!template) return safeHtml;
  const marker = template.indexOf("{value}");
  if (marker < 0) return escapeHtml(template);
  return `${escapeHtml(template.slice(0, marker))}${safeHtml}${escapeHtml(template.slice(marker + 7))}`;
}

function applyCardFieldOrder(root: ShadowRoot, fieldOrder: string[]) {
  const content = root.querySelector<HTMLElement>(".content");
  if (!content) return;

  const orderByKey = new Map(fieldOrder.map((key, index) => [key, index]));
  const positioned = (element: HTMLElement) => {
    const position = getComputedStyle(element).position;
    return (
      position === "absolute" || position === "fixed" || position === "sticky"
    );
  };
  const fieldContainers = Array.from(content.children).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      (element.classList.contains("fields") ||
        element.classList.contains("attributes")),
  );
  const orderedItems: Array<{
    key: string;
    node: HTMLElement;
    sourceContainer: HTMLElement | null;
    sourceIndex: number;
  }> = [];
  let sourceIndex = 0;

  Array.from(content.children).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;

    if (fieldContainers.includes(element)) {
      Array.from(element.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        const key = child.dataset.cardField;
        if (!key || positioned(child)) return;
        orderedItems.push({
          key,
          node: child,
          sourceContainer: element,
          sourceIndex: sourceIndex++,
        });
      });
      return;
    }

    const field = element.dataset.cardField
      ? element
      : element.querySelector<HTMLElement>("[data-card-field]");
    const key = field?.dataset.cardField;
    if (!field || !key || positioned(element) || positioned(field)) return;
    orderedItems.push({
      key,
      node: element,
      sourceContainer: null,
      sourceIndex: sourceIndex++,
    });
  });

  if (orderedItems.length < 2) return;

  orderedItems.sort(
    (left, right) =>
      (orderByKey.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (orderByKey.get(right.key) ?? Number.MAX_SAFE_INTEGER) ||
      left.sourceIndex - right.sourceIndex,
  );

  let activeContainer: HTMLElement | null = null;
  let activeSource: HTMLElement | null = null;
  const flushContainer = () => {
    if (activeContainer) content.append(activeContainer);
    activeContainer = null;
    activeSource = null;
  };

  orderedItems.forEach((item) => {
    if (item.sourceContainer) {
      if (activeSource !== item.sourceContainer) {
        flushContainer();
        activeSource = item.sourceContainer;
        activeContainer = item.sourceContainer.cloneNode(false) as HTMLElement;
      }
      activeContainer?.append(item.node);
      return;
    }

    flushContainer();
    content.append(item.node);
  });
  flushContainer();

  fieldContainers.forEach((container) => {
    if (!container.children.length) container.remove();
  });
}

function renderChoiceValue(
  values: string[],
  attribute: CustomProductAttribute,
) {
  const display = attribute.optionDisplay ?? "text";
  return `<span class="choice-list">${values
    .map((value) => {
      const configuredColor = attribute.optionColors?.[value] ?? "";
      const color = /^#[0-9a-f]{3,8}$/i.test(configuredColor)
        ? configuredColor
        : "transparent";
      const swatch =
        display === "text"
          ? ""
          : `<i class="choice-swatch" style="background:${escapeHtml(color)}"></i>`;
      const text =
        display === "color"
          ? ""
          : `<span class="choice-text">${escapeHtml(value)}</span>`;
      return `<span class="choice-chip choice-${display}" title="${escapeHtml(value)}">${swatch}${text}</span>`;
    })
    .join("")}</span>`;
}

function renderCardFieldBlocks(
  product: Product,
  settings: ProductCardSettings,
  customAttributes: CustomProductAttribute[],
  explicitlyRendered: Set<string>,
) {
  const productValues = product as unknown as Record<string, unknown>;
  const attributes =
    product.attributes &&
    typeof product.attributes === "object" &&
    !Array.isArray(product.attributes)
      ? (product.attributes as Record<string, unknown>)
      : {};
  const visible = new Set(settings.visibleFields);
  const customById = new Map(customAttributes.map((item) => [item.id, item]));
  const reserved = new Set(["image", "is_active", ...explicitlyRendered]);
  const order = [
    ...settings.order,
    ...customAttributes.map((item) => item.id),
  ].filter((key, index, items) => items.indexOf(key) === index);

  return order
    .filter((key) => visible.has(key) && !reserved.has(key))
    .map((key) => {
      if (key === "reward_points_cost" && !product.is_reward) return "";
      const attribute = customById.get(key);
      const raw = attribute ? attributes[key] : productValues[key];
      const values = normalizeCardValues(raw);
      if (!values.length) return "";
      const label = escapeHtml(
        attribute?.name ?? productFieldLabels[key] ?? key,
      );
      let typeClass = "field-text";
      let content = escapeHtml(values.join(", "));

      if (attribute?.type === "single" || attribute?.type === "multiple") {
        typeClass =
          attribute.type === "single" ? "field-single" : "field-multiple";
        content = renderChoiceValue(values, attribute);
      } else if (attribute?.type === "number") {
        typeClass = "field-number";
        content = escapeHtml(
          values
            .map((value) => {
              const number = Number(value);
              return Number.isFinite(number)
                ? number.toLocaleString("vi-VN")
                : value;
            })
            .join(", "),
        );
      } else if (attribute?.type === "date") {
        typeClass = "field-date";
        content = escapeHtml(values.map(formatProductDate).join(", "));
      } else if (attribute?.type === "media") {
        const media = raw as { images?: string[]; video?: string };
        const image = media.images?.[0];
        if (!(image || media.video)) return "";
        typeClass = "field-media";
        content = `${image ? `<img src="${escapeHtml(image)}" alt="${label}" />` : ""}<span>${media.images?.length ?? 0} ảnh${media.video ? " · 1 video" : ""}</span>`;
      } else if (key === "price" || key === "cost_price") {
        typeClass = "field-money";
        content = escapeHtml(formatCurrency(Number(raw ?? 0)));
      } else if (
        key === "stock" ||
        key === "shelf_stock" ||
        key === "reward_points_cost"
      ) {
        typeClass = "field-number field-stock";
        content = escapeHtml(Number(raw ?? 0).toLocaleString("vi-VN"));
      } else if (key === "import_date" || key === "expiry_date") {
        typeClass = "field-date";
        content = escapeHtml(formatProductDate(String(raw)));
      } else if (key === "is_active" || key === "is_reward") {
        typeClass = `field-status ${raw ? "is-positive" : "is-muted"}`;
        content = escapeHtml(
          key === "is_active"
            ? raw
              ? "Đang bán"
              : "Đang ẩn"
            : raw
              ? "Đổi điểm"
              : "Không đổi điểm",
        );
      } else if (key === "sku") {
        typeClass = "field-code";
      }

      content = applyCardHtmlTemplate(settings, key, content);

      return `<span class="product-field ${typeClass}" data-field="${escapeHtml(key)}"><span class="field-label">${label}</span><span class="field-value">${content}</span></span>`;
    })
    .filter(Boolean)
    .join("");
}

export function ProductCardCodeRenderer({
  product,
  settings,
  customAttributes = [],
  mode = "card",
  quantity = 0,
  embedded = false,
  onEditField,
}: {
  product: Product;
  settings: ProductCardSettings;
  customAttributes?: CustomProductAttribute[];
  mode?: "card" | "pos";
  quantity?: number;
  embedded?: boolean;
  onEditField?: (key: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const root =
      hostRef.current.shadowRoot ??
      hostRef.current.attachShadow({ mode: "open" });
    const defaults = getDefaultCardCode(mode);
    const source = settings.templateHtml || defaults.html;
    const tokenFields: Record<string, string> = {
      image_url: "image",
      name: "name",
      category: "category",
      description: "description",
      price: "price",
      cost_price: "cost_price",
      stock: "stock",
      shelf_stock: "shelf_stock",
      shelf_stock_text: "shelf_stock",
      sku: "sku",
      import_date: "import_date",
      expiry_date: "expiry_date",
      is_active: "is_active",
      is_reward: "is_reward",
      reward_points_badge: "reward_points_cost",
      reward_points_cost: "reward_points_cost",
    };
    const explicitlyRendered = new Set(
      Array.from(source.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g))
        .map((match) =>
          match[1].startsWith("attribute.")
            ? match[1].slice("attribute.".length)
            : tokenFields[match[1]],
        )
        .filter((field): field is string => Boolean(field)),
    );
    const attributes =
      product.attributes &&
      typeof product.attributes === "object" &&
      !Array.isArray(product.attributes)
        ? (product.attributes as Record<string, unknown>)
        : {};
    const visible = new Set(settings.visibleFields);
    const noImage =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'%3E%3Cg fill='none' stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='5'%3E%3Crect x='132' y='65' width='56' height='46' rx='7'/%3E%3Cpath d='m140 102 14-14 11 10 8-7 8 8'/%3E%3Ccircle cx='171' cy='79' r='4' fill='%2394a3b8' stroke='none'/%3E%3C/g%3E%3Ctext x='160' y='137' text-anchor='middle' fill='%2394a3b8' font-family='sans-serif' font-size='13' font-weight='700' letter-spacing='1.5'%3ENO IMAGE%3C/text%3E%3C/svg%3E";
    const fieldBlocks = renderCardFieldBlocks(
      product,
      settings,
      customAttributes,
      explicitlyRendered,
    );
    const values: Record<string, unknown> = {
      image_url: visible.has("image") ? product.image_url || noImage : "",
      name: visible.has("name")
        ? applyCardTextTemplate(settings, "name", product.name)
        : "",
      category: visible.has("category")
        ? applyCardTextTemplate(settings, "category", product.category ?? "")
        : "",
      description: visible.has("description")
        ? applyCardTextTemplate(
            settings,
            "description",
            product.description ?? "",
          )
        : "",
      price: visible.has("price")
        ? applyCardTextTemplate(
            settings,
            "price",
            formatCurrency(product.price),
          )
        : "",
      cost_price: visible.has("cost_price")
        ? applyCardTextTemplate(
            settings,
            "cost_price",
            formatCurrency(product.cost_price),
          )
        : "",
      stock: visible.has("stock")
        ? applyCardTextTemplate(settings, "stock", String(product.stock))
        : "",
      shelf_stock: visible.has("shelf_stock")
        ? applyCardTextTemplate(
            settings,
            "shelf_stock",
            String(product.shelf_stock),
          )
        : "",
      shelf_stock_text: visible.has("shelf_stock")
        ? settings.textTemplates?.shelf_stock
          ? applyCardTextTemplate(
              settings,
              "shelf_stock",
              String(product.shelf_stock),
            )
          : `Còn ${product.shelf_stock} trên kệ`
        : "",
      sku: visible.has("sku")
        ? applyCardTextTemplate(settings, "sku", product.sku ?? "")
        : "",
      import_date: visible.has("import_date")
        ? applyCardTextTemplate(
            settings,
            "import_date",
            product.import_date ?? "",
          )
        : "",
      expiry_date: visible.has("expiry_date")
        ? applyCardTextTemplate(
            settings,
            "expiry_date",
            product.expiry_date ?? "",
          )
        : "",
      is_active: "",
      is_reward: visible.has("is_reward")
        ? product.is_reward
          ? "Có"
          : "Không"
        : "",
      attributes: fieldBlocks,
      field_blocks: fieldBlocks,
      reward_points_badge:
        visible.has("reward_points_cost") && product.is_reward
          ? applyCardTextTemplate(
              settings,
              "reward_points_cost",
              `${product.reward_points_cost.toLocaleString("vi-VN")} điểm`,
            )
          : "",
      reward_points_cost:
        visible.has("reward_points_cost") && product.is_reward
          ? applyCardTextTemplate(
              settings,
              "reward_points_cost",
              String(product.reward_points_cost),
            )
          : "",
      quantity,
    };
    customAttributes.forEach((attribute) => {
      values[`attribute.${attribute.id}`] = visible.has(attribute.id)
        ? attributes[attribute.id]
        : "";
    });
    const rendered = source.replace(
      /\{\{\s*([\w.-]+)\s*\}\}/g,
      (_match, key: string) =>
        key === "field_blocks" || key === "attributes"
          ? String(values[key] ?? "")
          : escapeHtml(values[key]),
    );
    const safeCss = (settings.templateCss || defaults.css)
      .replace(/@import[^;]+;/gi, "")
      .replace(/<\/style/gi, "");
    const embeddedGuard = embedded
      ? ".card-shell{border:0!important;border-radius:inherit!important;box-shadow:none!important;transform:none!important}"
      : "";
    const editorGuard = onEditField
      ? "[data-card-field]{pointer-events:auto!important;cursor:pointer;transition:outline-color .15s ease,box-shadow .15s ease}[data-card-field]:hover{outline:2px solid #8fa676;outline-offset:2px;box-shadow:0 0 0 4px rgba(143,166,118,.13)}"
      : "";
    const imageFitGuard = `.media>img{object-fit:${settings.imageFit === "contain" ? "contain" : "cover"}!important}`;
    const visibilityGuard = `.visibility-status{position:absolute;z-index:30;top:7px;right:7px;display:flex;width:28px;height:28px;align-items:center;justify-content:center;border:1px solid rgba(203,213,225,.9);border-radius:999px;background:rgba(255,255,255,.95);color:#475569;box-shadow:0 3px 10px rgba(15,23,42,.18);backdrop-filter:blur(6px)}.visibility-status.is-visible{border-color:#cbd9bd;color:#50613e}.visibility-status svg{width:15px;height:15px;pointer-events:none}`;
    const layoutGuard = `:host{display:block;width:100%;height:100%;min-width:0;overflow:hidden}*{box-sizing:border-box}.card-shell{height:100%;min-width:0;max-width:100%;overflow:hidden}img,video{max-width:100%}${embeddedGuard}${editorGuard}${imageFitGuard}${visibilityGuard}`;
    root.innerHTML = `<style>${layoutGuard}\n${cardTypedFieldCss}\n${safeCss}</style>${sanitizeCardHtml(rendered)}`;
    if (visible.has("image") && visible.has("is_active")) {
      const media = root.querySelector<HTMLElement>(".media");
      if (media) {
        const status = document.createElement("span");
        status.className = `visibility-status ${product.is_active ? "is-visible" : "is-hidden"}`;
        status.dataset.cardField = "is_active";
        status.setAttribute(
          "aria-label",
          product.is_active ? "Đang hiện" : "Đang ẩn",
        );
        status.title = product.is_active ? "Đang hiện" : "Đang ẩn";
        status.innerHTML = product.is_active
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.1 12a10.5 10.5 0 0 1 19.8 0 10.5 10.5 0 0 1-19.8 0"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 2 20 20"/><path d="M6.7 6.7A10.7 10.7 0 0 0 2.1 12a10.5 10.5 0 0 0 15.2 5.3"/><path d="M10.7 4.1A10.5 10.5 0 0 1 21.9 12a10.6 10.6 0 0 1-2.2 3.2"/><path d="M14.1 14.1A3 3 0 0 1 9.9 9.9"/></svg>';
        media.append(status);
      }
    }
    const editableSelectors: Array<[string, string]> = [
      [".media", "image"],
      [".name", "name"],
      [".category", "category"],
      [".description", "description"],
      [".price", "price"],
      [".cost-price, .cost_price", "cost_price"],
      [".total-stock, .total_stock", "stock"],
      [".stock", "shelf_stock"],
      [".sku, .ean13", "sku"],
      [".import-date, .import_date", "import_date"],
      [".expiry-date, .expiry_date", "expiry_date"],
      [".reward-status, .is_reward", "is_reward"],
      [".reward-badge", "reward_points_cost"],
    ];
    editableSelectors.forEach(([selector, key]) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        element.dataset.cardField ||= key;
      });
    });
    root.querySelectorAll<HTMLElement>("[data-field]").forEach((element) => {
      element.dataset.cardField = element.dataset.field;
    });
    applyCardFieldOrder(root, settings.order);
    if (!onEditField) return;
    const handleEdit = (event: Event) => {
      const editable = event
        .composedPath()
        .find(
          (node): node is HTMLElement =>
            node instanceof HTMLElement && Boolean(node.dataset.cardField),
        );
      const key = editable?.dataset.cardField;
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      onEditField(key);
    };
    root.addEventListener("click", handleEdit);
    return () => root.removeEventListener("click", handleEdit);
  }, [
    customAttributes,
    embedded,
    mode,
    onEditField,
    product,
    quantity,
    settings,
  ]);
  return <div className="h-full min-w-0 w-full" ref={hostRef} />;
}

function getExpiryClassName(status: ExpiryStatus | null) {
  if (status === "expired") {
    return "text-red-600";
  }

  if (status === "soon") {
    return "text-amber-600";
  }

  return "text-slate-950";
}

export function NoImagePlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white text-slate-900">
      <svg
        aria-hidden="true"
        className={compact ? "h-10 w-14" : "h-16 w-24"}
        fill="none"
        viewBox="0 0 120 80"
      >
        <path
          d="M25 25h17l8-10h22l9 10h12a9 9 0 0 1 9 9v30a9 9 0 0 1-9 9H25a9 9 0 0 1-9-9V34a9 9 0 0 1 9-9Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5"
        />
        <circle cx="59" cy="49" r="16" stroke="currentColor" strokeWidth="5" />
        <circle cx="89" cy="36" r="3" fill="currentColor" />
        <path d="m18 76 87-72" stroke="white" strokeWidth="10" />
        <path
          d="m18 76 87-72"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="5"
        />
      </svg>
      <span
        className={
          compact
            ? "mt-0.5 text-[8px] font-black tracking-[0.16em]"
            : "mt-1 text-xs font-black tracking-[0.18em]"
        }
      >
        NO IMAGE
      </span>
    </div>
  );
}

export function ProductCard({
  actions,
  badgeLabel,
  badgeTone = "neutral",
  className,
  compact = false,
  disabled = false,
  expiryClassName,
  expiryLabel,
  onSelect,
  onEditField,
  product,
  settings,
  customAttributes = [],
  relatedProducts = [],
}: ProductCardProps) {
  const expiryStatus = getExpiryStatus(product.expiry_date);
  const blockOrder = (key: ProductCardSettings["order"][number]) =>
    Math.max(settings?.order?.indexOf(key) ?? 0, 0);
  const isVisible = (key: string, legacy = true) =>
    settings?.visibleFields ? settings.visibleFields.includes(key) : legacy;
  const renderText = (key: string, value: string) =>
    settings?.textTemplates?.[key]?.split("{value}").join(value) ?? value;
  const editField = (key: string, event: React.MouseEvent) => {
    if (!onEditField) return;
    event.preventDefault();
    event.stopPropagation();
    onEditField(key);
  };
  const editableClass = onEditField
    ? "cursor-pointer rounded-md transition hover:ring-2 hover:ring-moss-300"
    : "";

  if (settings?.templateHtml) {
    return (
      <article
        className={clsx(
          "group relative h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.05)] transition",
          disabled ? "opacity-55" : "hover:-translate-y-0.5",
          className,
        )}
      >
        <button
          className="block h-full min-w-0 w-full overflow-hidden text-left focus:outline-none focus:ring-4 focus:ring-moss-100"
          disabled={disabled}
          onClick={onSelect}
          type="button"
        >
          <ProductCardCodeRenderer
            customAttributes={customAttributes}
            embedded
            onEditField={onEditField}
            product={product}
            settings={settings}
          />
        </button>
        {actions ? (
          <div
            className="absolute right-3 top-3 z-20 flex items-center gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={clsx(
        "group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.05)] transition",
        disabled
          ? "opacity-55"
          : "hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)]",
        className,
      )}
    >
      <button
        className={clsx(
          "flex h-full w-full flex-col text-left focus:outline-none focus:ring-4 focus:ring-moss-100",
          compact ? "p-1" : "p-2",
        )}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        {!isVisible("image", settings?.showImage !== false) ? null : (
          <div
            onClick={(event) => editField("image", event)}
            style={{ order: blockOrder("image") }}
            className={clsx(
              "relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50",
              compact ? "aspect-[1.6]" : "aspect-[1.14]",
              editableClass,
            )}
          >
            {product.image_url ? (
              <img
                alt={product.name}
                className={clsx(
                  "h-full w-full rounded-lg object-cover transition duration-300 group-hover:scale-[1.03]",
                  compact ? "p-0" : "p-3",
                  settings?.imageFit === "contain" && "object-contain",
                )}
                src={product.image_url}
              />
            ) : (
              <NoImagePlaceholder compact={compact} />
            )}

            {badgeLabel ? (
              <span
                className={clsx(
                  "absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold",
                  productBadgeToneClassNames[badgeTone],
                )}
              >
                {badgeLabel}
              </span>
            ) : null}

            {product.is_reward ? (
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-amber-100/95 px-1.5 py-1 text-[9px] font-black text-amber-800 shadow-sm sm:text-[10px]">
                {product.reward_points_cost.toLocaleString("vi-VN")} điểm
              </span>
            ) : null}

            {isVisible("is_active", false) ? (
              <span
                aria-label={product.is_active ? "Đang hiện" : "Đang ẩn"}
                className={clsx(
                  "absolute right-1.5 top-1.5 z-20 flex items-center justify-center rounded-full bg-white/95 shadow-md ring-1 backdrop-blur-sm",
                  compact ? "h-7 w-7" : "h-8 w-8",
                  product.is_active
                    ? "text-moss-700 ring-moss-200"
                    : "text-slate-600 ring-slate-300",
                  editableClass,
                )}
                onClick={(event) => editField("is_active", event)}
                title={product.is_active ? "Đang hiện" : "Đang ẩn"}
              >
                {product.is_active ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </span>
            ) : null}
          </div>
        )}

        <div className="contents">
          {!isVisible("name", settings?.showName !== false) ? null : (
            <h3
              onClick={(event) => editField("name", event)}
              style={{ order: blockOrder("name") }}
              className={clsx(
                "line-clamp-2 px-2 pt-2 font-extrabold leading-tight text-slate-950",
                compact
                  ? "min-h-8 text-[13px] sm:text-sm"
                  : "min-h-[2.6rem] text-base sm:text-lg",
                editableClass,
              )}
            >
              {renderText("name", product.name)}
            </h3>
          )}
          {isVisible("category", settings?.showCategory) && product.category ? (
            <p
              onClick={(event) => editField("category", event)}
              style={{ order: blockOrder("category") }}
              className={clsx(
                "mt-1 truncate px-2 text-xs font-bold text-slate-500",
                editableClass,
              )}
            >
              {renderText("category", product.category)}
            </p>
          ) : null}
          {!isVisible("price", settings?.showPrice !== false) ? null : (
            <p
              onClick={(event) => editField("price", event)}
              style={{ order: blockOrder("price") }}
              className={clsx(
                "mx-2 mt-1 pb-2 font-black text-moss-700",
                compact ? "text-[13px]" : "text-sm",
                editableClass,
              )}
            >
              {renderText("price", formatCurrency(product.price))}
            </p>
          )}

          {settings?.visibleFields
            ?.filter(
              (key) =>
                ![
                  "image",
                  "name",
                  "category",
                  "price",
                  "shelf_stock",
                  "expiry_date",
                  "is_active",
                ].includes(key),
            )
            .map((key) => {
              const definition = customAttributes.find(
                (item) => item.id === key,
              );
              const productValue = (
                product as unknown as Record<string, unknown>
              )[key];
              const attributeValue =
                product.attributes &&
                typeof product.attributes === "object" &&
                !Array.isArray(product.attributes)
                  ? product.attributes[key]
                  : undefined;
              const value = productValue ?? attributeValue;
              if (
                definition?.type === "media" &&
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
              ) {
                const media = value as { images?: string[]; video?: string };
                if (!(media.images?.length || media.video)) return null;
                return (
                  <div
                    className={clsx("px-2 pt-2", editableClass)}
                    key={key}
                    onClick={(event) => editField(key, event)}
                    style={{ order: blockOrder(key) }}
                  >
                    <p className="mb-1 text-[10px] font-bold text-slate-600">
                      {renderText(key, definition.name)}
                    </p>
                    <div className="relative aspect-[1.6] overflow-hidden rounded-lg bg-slate-100">
                      {media.images?.[0] ? (
                        <img
                          alt={definition.name}
                          className={`h-full w-full ${settings?.imageFit === "contain" ? "object-contain" : "object-cover"}`}
                          src={media.images[0]}
                        />
                      ) : media.video ? (
                        <video
                          className="h-full w-full object-cover"
                          muted
                          src={media.video}
                        />
                      ) : (
                        <NoImagePlaceholder compact />
                      )}
                      {(media.images?.length ?? 0) > 1 || media.video ? (
                        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-slate-950/80 px-2 py-1 text-[9px] font-black text-white">
                          {media.images?.length ?? 0} ảnh
                          {media.video ? " + video" : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              }
              if (
                value === null ||
                value === undefined ||
                value === "" ||
                (Array.isArray(value) && value.length === 0) ||
                (typeof value === "object" && !Array.isArray(value))
              )
                return null;
              if (definition?.type === "single")
                return (
                  <div
                    className={clsx("px-2 pt-2", editableClass)}
                    key={key}
                    onClick={(event) => editField(key, event)}
                    style={{ order: blockOrder(key) }}
                  >
                    <p className="mb-1 text-[10px] font-bold text-slate-600">
                      {renderText(key, definition.name)}
                    </p>
                    <div
                      className={
                        definition.optionDisplay === "color"
                          ? "flex flex-wrap gap-1.5"
                          : "space-y-1"
                      }
                    >
                      {definition.options.map((option) => (
                        <span
                          className={`flex items-center gap-1.5 text-[10px] font-semibold ${definition.optionDisplay === "color" ? "inline-flex" : "w-full"} ${String(value) === option ? "text-slate-950" : "text-slate-400"}`}
                          key={option}
                        >
                          <i
                            className={`h-4 w-4 rounded-full border-2 ${String(value) === option ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-300"}`}
                            style={{
                              backgroundColor:
                                definition.optionColors?.[option] ??
                                "transparent",
                              backgroundImage: (() => {
                                const attributes =
                                  product.attributes &&
                                  typeof product.attributes === "object" &&
                                  !Array.isArray(product.attributes)
                                    ? (product.attributes as Record<
                                        string,
                                        unknown
                                      >)
                                    : {};
                                const variants = Array.isArray(
                                  attributes._variants,
                                )
                                  ? (attributes._variants as Array<{
                                      values?: Record<string, string>;
                                      image_url?: string;
                                    }>)
                                  : [];
                                const image = variants.find(
                                  (variant) => variant.values?.[key] === option,
                                )?.image_url;
                                return image ? `url(${image})` : undefined;
                              })(),
                              backgroundPosition: "center",
                              backgroundSize: "cover",
                            }}
                          />
                          {definition.optionDisplay === "color" ? null : option}
                          <b className="rounded-full bg-slate-100 px-1.5 text-[9px] text-slate-700">
                            {relatedProducts.reduce((total, item) => {
                              const attributes =
                                item.attributes &&
                                typeof item.attributes === "object" &&
                                !Array.isArray(item.attributes)
                                  ? (item.attributes as Record<string, unknown>)
                                  : {};
                              const variants = Array.isArray(
                                attributes._variants,
                              )
                                ? (attributes._variants as Array<{
                                    values?: Record<string, string>;
                                    shelf_stock?: number;
                                  }>)
                                : [];
                              if (variants.length)
                                return (
                                  total +
                                  variants
                                    .filter(
                                      (variant) =>
                                        variant.values?.[key] === option,
                                    )
                                    .reduce(
                                      (sum, variant) =>
                                        sum +
                                        Math.max(
                                          Number(variant.shelf_stock) || 0,
                                          0,
                                        ),
                                      0,
                                    )
                                );
                              return attributes[key] === option
                                ? total +
                                    Math.max(Number(item.shelf_stock) || 0, 0)
                                : total;
                            }, 0)}
                          </b>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              if (definition?.type === "multiple")
                return (
                  <div
                    className={clsx(
                      "px-2 pt-2 text-[10px] font-bold text-slate-600",
                      editableClass,
                    )}
                    key={key}
                    onClick={(event) => editField(key, event)}
                    style={{ order: blockOrder(key) }}
                  >
                    <p className="mb-1">{renderText(key, definition.name)}</p>
                    <div
                      className={
                        definition.optionDisplay === "color"
                          ? "flex flex-wrap gap-1.5"
                          : "space-y-1"
                      }
                    >
                      {definition.options.map((option) => {
                        const selected = Array.isArray(value)
                          ? value.includes(option)
                          : String(value) === option;
                        return (
                          <span
                            className={`flex items-center gap-1.5 ${definition.optionDisplay === "color" ? "inline-flex" : "w-full"} ${selected ? "text-slate-950" : "text-slate-400"}`}
                            key={option}
                          >
                            {definition.optionDisplay !== "text" ? (
                              <i
                                className={`h-4 w-4 rounded-full border-2 ${selected ? "border-moss-600 ring-1 ring-moss-500" : "border-slate-300"}`}
                                style={{
                                  backgroundColor:
                                    definition.optionColors?.[option] ?? option,
                                }}
                              />
                            ) : null}
                            {definition.optionDisplay !== "color"
                              ? option
                              : null}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              const displayValue =
                key === "cost_price"
                  ? formatCurrency(Number(value))
                  : key === "is_active"
                    ? value === false
                      ? "Đang ẩn"
                      : "Đang bán"
                    : key === "is_reward"
                      ? value
                        ? "Có"
                        : "Không"
                      : Array.isArray(value)
                        ? value.join(", ")
                        : String(value);
              return (
                <p
                  style={{ order: blockOrder(key) }}
                  className={clsx(
                    "px-2 pt-1 text-[10px] font-semibold text-slate-500",
                    editableClass,
                  )}
                  key={key}
                  onClick={(event) => editField(key, event)}
                >
                  {settings?.textTemplates?.[key]
                    ? null
                    : `${definition?.name ?? key}: `}
                  <strong className="text-slate-800">
                    {renderText(key, displayValue)}
                  </strong>
                </p>
              );
            })}

          {!isVisible("shelf_stock", settings?.showShelfStock !== false) &&
          !isVisible("expiry_date", settings?.showExpiry !== false) ? null : (
            <div className="contents">
              {!isVisible(
                "shelf_stock",
                settings?.showShelfStock !== false,
              ) ? null : (
                <span
                  onClick={(event) => editField("shelf_stock", event)}
                  style={{ order: blockOrder("shelf_stock") }}
                  className={clsx(
                    "mx-2 mt-2 min-w-0 text-xs text-slate-500",
                    compact
                      ? "rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px]"
                      : "flex items-center justify-between gap-2",
                    editableClass,
                  )}
                >
                  <strong
                    className={clsx(
                      "truncate font-extrabold text-emerald-900",
                      compact ? "block text-[10px]" : "text-right",
                    )}
                    title={String(product.shelf_stock)}
                  >
                    {renderText("shelf_stock", String(product.shelf_stock))}
                  </strong>
                </span>
              )}
              {!isVisible(
                "expiry_date",
                settings?.showExpiry !== false,
              ) ? null : (
                <span
                  onClick={(event) => editField("expiry_date", event)}
                  style={{ order: blockOrder("expiry_date") }}
                  className={clsx(
                    "mx-2 mt-2 min-w-0 text-xs text-slate-500",
                    compact
                      ? "rounded-lg bg-amber-50 px-2 py-1.5 text-[10px]"
                      : "flex items-center justify-between gap-2",
                    editableClass,
                  )}
                >
                  <strong
                    className={clsx(
                      "truncate font-extrabold",
                      compact ? "block text-[10px]" : "text-right",
                      expiryClassName ?? getExpiryClassName(expiryStatus),
                    )}
                    title={expiryLabel ?? formatExpiryDays(product.expiry_date)}
                  >
                    {renderText(
                      "expiry_date",
                      expiryLabel ?? formatExpiryDays(product.expiry_date),
                    )}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>
      </button>

      {actions ? (
        <div
          className="absolute right-3 top-3 z-20 flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      ) : null}
    </article>
  );
}
