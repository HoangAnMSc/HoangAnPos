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
        "group relative h-full overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition",
        disabled ? "opacity-55" : "hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)]",
        className
      )}
    >
      <button
        className={clsx(
          "flex h-full w-full flex-col text-left focus:outline-none focus:ring-4 focus:ring-moss-100",
          compact ? "p-1.5" : "p-2"
        )}
        disabled={disabled || !onSelect}
        onClick={onSelect}
        type="button"
      >
        <div
          className={clsx(
            "relative flex w-full items-center justify-center overflow-hidden rounded-[20px] bg-slate-50",
            compact ? "aspect-[1.55]" : "aspect-[1.14]"
          )}
        >
          {product.image_url ? (
            <img
              alt={product.name}
              className={clsx(
                "h-full w-full object-cover transition rounded-[20px] duration-300 group-hover:scale-[1.03]",
                compact ? "p-2" : "p-3"
              )}
              src={product.image_url}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <Boxes className={compact ? "h-8 w-8" : "h-11 w-11"} />
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
        </div>

        <div className={clsx("flex flex-1 flex-col", compact ? "px-1 pt-2" : "px-1.5 pt-3")}>
          <h3
            className={clsx(
              "line-clamp-2 font-extrabold leading-tight text-slate-950",
              compact ? "min-h-[2.25rem] text-[13px]" : "min-h-[2.6rem] text-base sm:text-lg"
            )}
          >
            {product.name}
          </h3>
          <p className={clsx("mt-1 font-semibold text-slate-500", compact ? "text-xs" : "text-sm")}>
            {formatCurrency(product.price)}
          </p>

          <div
            className={clsx(
              "mt-auto grid grid-cols-2 gap-2 pt-4 text-xs text-slate-500",
              compact ? "pt-3 text-[11px]" : "sm:text-sm"
            )}
          >
            <span className="min-w-0">
              Stock:{" "}
              <strong className="font-extrabold text-slate-950">
                {stockLabel ?? product.stock}
              </strong>
            </span>
            <span className="min-w-0 text-right">
              Han:{" "}
              <strong
                className={clsx(
                  "font-extrabold",
                  expiryClassName ?? getExpiryClassName(expiryStatus)
                )}
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
