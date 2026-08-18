import { Layers3, Package } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import type { ProductCardSettings } from "../../services/productSettings";

export type ProductCardData = {
  category?: string | null;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  name: string;
  price: number;
  status: "active" | "draft" | "inactive";
  stock: number;
  variantCount: number;
};

const statusPresentation = {
  active: {
    className: "bg-emerald-50/95 text-emerald-700 ring-emerald-200",
    dotClassName: "bg-emerald-500",
    label: "Đang bán",
  },
  draft: {
    className: "bg-amber-50/95 text-amber-700 ring-amber-200",
    dotClassName: "bg-amber-500",
    label: "Bản nháp",
  },
  inactive: {
    className: "bg-slate-100/95 text-slate-600 ring-slate-200",
    dotClassName: "bg-slate-400",
    label: "Ngừng bán",
  },
} as const;

type Props = ProductCardData & {
  ariaLabel?: string;
  disabled?: boolean;
  onActivate?: () => void;
  presentation?: "product" | "pos";
  quantity?: number;
  selected?: boolean;
  settings: ProductCardSettings;
};

export function ConfigurableProductCard({
  ariaLabel,
  category,
  compareAtPrice,
  disabled = false,
  imageUrl,
  name,
  onActivate,
  price,
  presentation = "product",
  quantity = 0,
  selected = false,
  settings,
  status,
  stock,
  variantCount,
}: Props) {
  const visible = (field: string) => settings.visibleFields.includes(field);
  const imageVisible = visible("image");
  const isSelected = selected || (presentation === "pos" && quantity > 0);
  const hasMainInformation =
    (!imageVisible && visible("is_active")) ||
    (visible("category") && Boolean(category)) ||
    visible("name");
  const footerVisible =
    visible("price") ||
    visible("compare_price") ||
    (!imageVisible && visible("stock"));
  const canActivate = Boolean(onActivate) && !disabled;
  const productStatus = statusPresentation[status];
  const statusBadge = (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-extrabold shadow-sm ring-1 backdrop-blur ${productStatus.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${productStatus.dotClassName}`} />
      {productStatus.label}
    </span>
  );
  return (
    <div
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      className={`group flex h-full w-full max-w-[184px] min-w-0 flex-col overflow-hidden rounded-[20px] border bg-white transition ${isSelected ? "border-moss-500 shadow-[0_8px_20px_rgba(72,84,54,0.14)] ring-1 ring-moss-200" : "border-slate-200 shadow-[0_7px_20px_rgba(15,23,42,0.07)]"} ${disabled ? "cursor-not-allowed opacity-60" : canActivate ? "cursor-pointer hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500" : ""}`}
      onClick={canActivate ? onActivate : undefined}
      onKeyDown={canActivate ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate?.();
        }
      } : undefined}
      role={onActivate ? "button" : undefined}
      tabIndex={canActivate ? 0 : onActivate ? -1 : undefined}
    >
      {imageVisible ? (
        <div className="relative mx-2 mt-2 aspect-[1.25/1] shrink-0 overflow-hidden rounded-2xl bg-slate-100">
          {imageUrl ? (
            <img
              alt={name}
              className={`h-full w-full transition duration-300 group-hover:scale-[1.035] ${settings.imageFit === "contain" ? "object-contain p-2" : "object-cover"}`}
              src={imageUrl}
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-300"><Package className="h-9 w-9" /></div>
          )}
          {visible("is_active") ? (
            <span className="absolute left-2 top-2">{statusBadge}</span>
          ) : null}
          {visible("stock") ? (
            <span className={`absolute bottom-2 left-2 max-w-[calc(100%-3rem)] truncate rounded-full px-2 py-1 text-[10px] font-extrabold shadow-sm backdrop-blur ${stock > 0 ? "bg-white/90 text-slate-700" : "bg-red-600/95 text-white"}`}>
              {stock > 0 ? `Còn ${stock}` : "Hết hàng"}
            </span>
          ) : null}
          {isSelected ? (
            <span className="absolute right-2 top-2 grid h-8 min-w-8 place-items-center rounded-full bg-moss-700 px-1.5 text-xs font-black tabular-nums text-white shadow-md">
              {Math.max(quantity, 1)}
            </span>
          ) : null}
          {visible("variant_count") && variantCount > 1 ? (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur">
              <Layers3 className="h-3 w-3" /> 1/{variantCount}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2.5 pt-2">
        {!imageVisible && visible("is_active") ? (
          <div className="mb-1.5">{statusBadge}</div>
        ) : null}
        {visible("category") && category ? (
          <p className="mb-1 flex min-h-4 shrink-0 items-center gap-1 text-[10px] font-extrabold leading-4 text-moss-700" title={category}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-moss-500" />
            <span className="min-w-0 truncate">{category}</span>
          </p>
        ) : null}
        {visible("name") ? (
          <h3 className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950" title={name}>{name}</h3>
        ) : null}

        {footerVisible ? <div className={`${hasMainInformation ? "mt-auto" : ""} flex items-end justify-between gap-1.5 border-t border-dashed border-slate-200 pt-1.5`}>
          {visible("price") || visible("compare_price") ? (
            <div className="min-w-0 flex-1">
              {visible("compare_price") ? (
                <p className="h-3.5 truncate text-[10px] font-bold leading-[14px] tabular-nums text-slate-400 line-through">
                  {compareAtPrice != null && compareAtPrice > price
                    ? formatCurrency(compareAtPrice)
                    : "\u00a0"}
                </p>
              ) : null}
              {visible("price") ? (
                <p className="truncate text-[15px] font-black tabular-nums text-slate-950" title={formatCurrency(price)}>{formatCurrency(price)}</p>
              ) : null}
            </div>
          ) : <span className="flex-1" />}
          {!imageVisible && visible("stock") ? (
            <span className={`mb-0.5 w-fit max-w-full truncate rounded-lg px-2 py-1 text-[10px] font-extrabold ${stock > 0 ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-600"}`}>
              {stock > 0 ? `Còn ${stock}` : "Hết hàng"}
            </span>
          ) : null}
        </div> : null}
      </div>
    </div>
  );
}
