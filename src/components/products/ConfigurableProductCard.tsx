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
      className={`group flex h-[270px] w-full max-w-[184px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_7px_20px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] ${onActivate ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500" : ""}`}
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
          {visible("stock") ? (
            <span className={`absolute bottom-2 left-2 max-w-[calc(100%-3rem)] truncate rounded-full px-2 py-1 text-[10px] font-extrabold shadow-sm backdrop-blur ${stock > 0 ? "bg-white/90 text-slate-700" : "bg-red-600/95 text-white"}`}>
              {stock > 0 ? `Còn ${stock}` : "Hết hàng"}
            </span>
          ) : null}
          {selected ? (
            <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-moss-700 text-white shadow-md">
              <Check className="h-4 w-4 stroke-[3]" />
            </span>
          ) : null}
          {visible("variant_count") && variantCount > 1 ? (
            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur">
              <Layers3 className="h-3 w-3" /> {variantCount} biến thể
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-2.5 pt-2">
        {visible("category") && category ? (
          <p className="mb-1 flex min-h-4 shrink-0 items-center gap-1 text-[10px] font-extrabold leading-4 text-moss-700" title={category}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-moss-500" />
            <span className="min-w-0 truncate">{category}</span>
          </p>
        ) : null}
        {visible("name") ? (
          <h3 className="line-clamp-2 min-h-10 text-sm font-black leading-5 text-slate-950" title={name}>{name}</h3>
        ) : null}

        <div className="mt-auto flex min-h-[48px] items-end justify-between gap-1.5 border-t border-dashed border-slate-200 pt-1.5">
          {visible("price") || visible("compare_price") ? (
            <div className="min-w-0 flex-1">
              {visible("compare_price") && compareAtPrice != null && compareAtPrice > price ? (
                <p className="truncate text-[10px] font-bold tabular-nums text-slate-400 line-through">{formatCurrency(compareAtPrice)}</p>
              ) : <div className="h-3.5" />}
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
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
