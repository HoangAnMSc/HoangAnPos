import { clsx } from "clsx";
import { Boxes } from "lucide-react";
import { formatCurrency } from "../../lib/format";
import {
  formatExpiryDays,
  getExpiryStatus,
  type ExpiryStatus,
} from "../../lib/productDisplay";
import type { Product } from "../../types";

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
  product: Product;
  stockLabel?: string;
};

const badgeToneClassNames = {
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-moss-100 text-moss-700",
  green: "bg-moss-100 text-moss-700",
  neutral: "bg-slate-100 text-slate-600",
};

function getExpiryClassName(status: ExpiryStatus | null) {
  if (status === "expired") {
    return "text-red-600";
  }

  if (status === "soon") {
    return "text-amber-600";
  }

  return "text-slate-950";
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
  product,
  stockLabel,
}: ProductCardProps) {
  const expiryStatus = getExpiryStatus(product.expiry_date);

  return (
    <article
      className={clsx(
        "group relative h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition",
        disabled ? "opacity-55" : "hover:-translate-y-0.5 hover:border-moss-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.10)]",
        className
      )}
    >
      <button
        className={clsx(
          "flex h-full w-full flex-col text-left focus:outline-none focus:ring-4 focus:ring-moss-100",
          compact ? "p-1" : "p-2"
        )}
        disabled={disabled || !onSelect}
        onClick={onSelect}
        type="button"
      >
        <div
          className={clsx(
            "relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50",
            compact ? "aspect-[1.6]" : "aspect-[1.14]"
          )}
        >
          {product.image_url ? (
            <img
              alt={product.name}
              className={clsx(
                "h-full w-full rounded-lg object-cover transition duration-300 group-hover:scale-[1.03]",
                compact ? "p-0" : "p-3"
              )}
              src={product.image_url}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300">
              <Boxes className={compact ? "h-7 w-7" : "h-11 w-11"} />
            </div>
          )}

          {badgeLabel ? (
            <span
              className={clsx(
                "absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold",
                badgeToneClassNames[badgeTone]
              )}
            >
              {badgeLabel}
            </span>
          ) : null}

          <span
            className={clsx(
              compact
                ? "absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold shadow-sm"
                : "absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-sm",
              product.is_active
                ? "bg-moss-100/95 text-moss-800"
                : "bg-slate-900/90 text-white"
            )}
          >
            {product.is_active ? "Công khai" : "Đang ẩn"}
          </span>
        </div>

        <div className={clsx("flex flex-1 flex-col", compact ? "px-1.5 pb-1.5 pt-1.5" : "px-1.5 pt-3")}>
          <h3
            className={clsx(
              "line-clamp-2 font-extrabold leading-tight text-slate-950",
              compact ? "min-h-8 text-xs sm:text-[13px]" : "min-h-[2.6rem] text-base sm:text-lg"
            )}
          >
            {product.name}
          </h3>
          <p className={clsx("mt-1 font-black text-moss-700", compact ? "text-xs" : "text-sm")}>
            {product.is_reward
              ? `${product.reward_points_cost.toLocaleString("vi-VN")} điểm · ${formatCurrency(product.price)}`
              : formatCurrency(product.price)}
          </p>

          <div
            className={clsx(
              "mt-auto grid gap-2 pt-4 text-xs text-slate-500",
              compact ? "grid-cols-2 gap-1 pt-2 text-[10px]" : "grid-cols-2 sm:text-sm"
            )}
          >
            <span className={clsx("min-w-0", compact ? "rounded-md bg-slate-50 px-1.5 py-1" : "flex items-center justify-between gap-2")}>
              <span className={clsx("flex-none", compact && "block text-slate-400")}>Tồn kho</span>
              <strong className={clsx("truncate font-extrabold text-slate-950", compact ? "mt-0.5 block" : "text-right")} title={String(stockLabel ?? product.stock)}>
                {stockLabel ?? product.stock}
              </strong>
            </span>
            <span className={clsx("min-w-0", compact ? "rounded-md bg-slate-50 px-1.5 py-1" : "flex items-center justify-between gap-2")}>
              <span className={clsx("flex-none", compact && "block text-slate-400")}>Hạn</span>
              <strong
                className={clsx(
                  "truncate font-extrabold",
                  compact ? "mt-0.5 block" : "text-right",
                  expiryClassName ?? getExpiryClassName(expiryStatus)
                )}
                title={expiryLabel ?? formatExpiryDays(product.expiry_date)}
              >
                {expiryLabel ?? formatExpiryDays(product.expiry_date)}
              </strong>
            </span>
          </div>
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
