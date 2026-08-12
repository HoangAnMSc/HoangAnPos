import type { ReactNode } from "react";
import { Check, Layers3, Package } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import type { ProductCardSettings } from "../../services/productSettings";

type Props = {
  action?: ReactNode;
  category?: string | null;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  name: string;
  onActivate?: () => void;
  price: number;
  selected?: boolean;
  settings: ProductCardSettings;
  stock: number;
  variantCount: number;
};

export function ConfigurableProductCard({
  action,
  category,
  compareAtPrice,
  imageUrl,
  name,
  onActivate,
  price,
  selected = false,
  settings,
  stock,
  variantCount,
}: Props) {
  const visible = (field: string) => settings.visibleFields.includes(field);
  const imageVisible = visible("image");
  return (
    <div
      className={`group flex h-full w-full max-w-[172px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-moss-300 hover:shadow-md ${onActivate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500" : ""}`}
      onClick={onActivate}
      onKeyDown={onActivate ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      } : undefined}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
    >
      {imageVisible ? (
        <div className="relative aspect-[1.45/1] overflow-hidden bg-slate-100">
          {imageUrl ? (
            <img
              alt={name}
              className={`h-full w-full transition duration-300 group-hover:scale-[1.02] ${settings.imageFit === "contain" ? "object-contain p-1.5" : "object-cover"}`}
              src={imageUrl}
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-300"><Package className="h-9 w-9" /></div>
          )}
          {visible("stock") ? (
            <span className={`absolute left-2 top-2 max-w-[calc(100%-3rem)] truncate rounded-lg px-2 py-1 text-[10px] font-extrabold shadow-sm ${stock > 0 ? "bg-emerald-50/95 text-emerald-700" : "bg-red-50/95 text-red-600"}`}>
              {stock > 0 ? `Còn ${stock}` : "Hết hàng"}
            </span>
          ) : null}
          {selected ? (
            <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-moss-700 text-white shadow-md">
              <Check className="h-4 w-4 stroke-[3]" />
            </span>
          ) : null}
          {visible("variant_count") && variantCount > 1 ? (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-950/85 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur">
              <Layers3 className="h-3 w-3" /> {variantCount} biến thể
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col p-3">
        {visible("category") && category ? (
          <p className="mb-1 truncate text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{category}</p>
        ) : null}
        {visible("name") ? (
          <h3 className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950" title={name}>{name}</h3>
        ) : null}
        {visible("price") || visible("compare_price") ? (
          <div className="mt-2 min-w-0">
            {visible("compare_price") && compareAtPrice != null && compareAtPrice > price ? (
              <p className="truncate text-[11px] font-bold tabular-nums text-slate-400 line-through">{formatCurrency(compareAtPrice)}</p>
            ) : <div className="h-4" />}
            {visible("price") ? (
              <p className="truncate text-base font-black tabular-nums text-moss-800" title={formatCurrency(price)}>{formatCurrency(price)}</p>
            ) : null}
          </div>
        ) : null}

        {action || (!imageVisible && visible("stock")) ? (
        <div className="mt-auto flex min-h-11 items-end justify-between gap-1 pt-2">
          {!imageVisible && visible("stock") ? (
            <span className={`mb-0.5 w-fit max-w-full truncate rounded-lg px-2 py-1 text-[10px] font-extrabold ${stock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {stock > 0 ? `Còn ${stock}` : "Hết hàng"}
            </span>
          ) : <span />}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}
