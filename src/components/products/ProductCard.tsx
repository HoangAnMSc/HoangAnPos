import { clsx } from "clsx";
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

export function NoImagePlaceholder({ compact = false }: { compact?: boolean }) {
  return <div className="flex h-full w-full flex-col items-center justify-center bg-white text-slate-900">
    <svg aria-hidden="true" className={compact ? "h-10 w-14" : "h-16 w-24"} fill="none" viewBox="0 0 120 80">
      <path d="M25 25h17l8-10h22l9 10h12a9 9 0 0 1 9 9v30a9 9 0 0 1-9 9H25a9 9 0 0 1-9-9V34a9 9 0 0 1 9-9Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
      <circle cx="59" cy="49" r="16" stroke="currentColor" strokeWidth="5" />
      <circle cx="89" cy="36" r="3" fill="currentColor" />
      <path d="m18 76 87-72" stroke="white" strokeWidth="10" /><path d="m18 76 87-72" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
    </svg>
    <span className={compact ? "mt-0.5 text-[8px] font-black tracking-[0.16em]" : "mt-1 text-xs font-black tracking-[0.18em]"}>NO IMAGE</span>
  </div>;
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
}: ProductCardProps) {
  const expiryStatus = getExpiryStatus(product.expiry_date);

  return (
    <article
      className={clsx(
        "group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_3px_12px_rgba(15,23,42,0.05)] transition",
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
            <NoImagePlaceholder compact={compact} />
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

          {product.is_reward ? <span className="absolute bottom-1.5 left-1.5 rounded-md bg-amber-100/95 px-1.5 py-1 text-[9px] font-black text-amber-800 shadow-sm sm:text-[10px]">{product.reward_points_cost.toLocaleString("vi-VN")} điểm</span> : null}

          {!product.is_active ? <span className={compact ? "absolute right-1.5 top-1.5 rounded-md bg-slate-900/90 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm" : "absolute right-2 top-2 rounded-full bg-slate-900/90 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm"}>Đang ẩn</span> : null}
        </div>

        <div className={clsx("flex flex-1 flex-col", compact ? "px-2 pb-2 pt-2" : "px-1.5 pt-3")}>
          <h3
            className={clsx(
              "line-clamp-2 font-extrabold leading-tight text-slate-950",
              compact ? "min-h-8 text-[13px] sm:text-sm" : "min-h-[2.6rem] text-base sm:text-lg"
            )}
          >
            {product.name}
          </h3>
          <p className={clsx("mt-1 border-b border-slate-100 pb-2 font-black text-moss-700", compact ? "text-[13px]" : "text-sm")}>
            {formatCurrency(product.price)}
          </p>

          <div
            className={clsx(
              "mt-auto grid gap-2 pt-4 text-xs text-slate-500",
              compact ? "grid-cols-2 gap-1.5 pt-2 text-[10px]" : "grid-cols-2 sm:text-sm"
            )}
          >
            <span className={clsx("min-w-0", compact ? "rounded-xl bg-emerald-50 px-1.5 py-2 text-center" : "flex items-center justify-between gap-2")}>
              <span className={clsx("flex-none", compact && "block text-emerald-600")}>Kệ</span>
              <strong className={clsx("truncate font-extrabold text-emerald-900", compact ? "mt-0.5 block text-sm" : "text-right")} title={String(product.shelf_stock)}>{product.shelf_stock}</strong>
            </span>
            <span className={clsx("min-w-0", compact ? "rounded-xl bg-amber-50 px-1 py-2 text-center" : "flex items-center justify-between gap-2")}>
              <span className={clsx("flex-none", compact && "block text-amber-600")}>Hạn</span>
              <strong
                className={clsx(
                  "truncate font-extrabold",
                  compact ? "mt-0.5 block text-xs" : "text-right",
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
