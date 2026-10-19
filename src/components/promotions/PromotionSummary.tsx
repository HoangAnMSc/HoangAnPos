import type { ReceiptPromotion } from "../../lib/receipt";
import { formatCurrency } from "../../lib/format";

export function PromotionSummary({ promotions }: { promotions: ReceiptPromotion[] }) {
  return <div className="space-y-2">
    {promotions.map((promotion, index) => <div className="min-w-0 text-sm" key={`${promotion.name}-${index}`}>
      <div className="flex items-start justify-between gap-3 text-emerald-700">
        <span className="min-w-0 break-words font-bold">{promotion.name}</span>
        {promotion.discount_amount > 0 ? <strong className="shrink-0 tabular-nums">-{formatCurrency(promotion.discount_amount)}</strong> : null}
      </div>
      {promotion.free_shipping ? <p className="text-xs text-emerald-700">Miễn phí vận chuyển</p> : null}
      {(promotion.gifts ?? []).map((gift) => <div key={gift.variant_id}>
        {gift.quantity > 0 ? <p className="mt-1 break-words text-xs font-semibold text-emerald-800">Quà tặng: {gift.quantity} × {gift.product_name}{gift.variant_name ? ` · ${gift.variant_name}` : ""} · 0đ</p> : null}
        {gift.warning ? <p role="status" className="mt-1 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">{gift.warning}</p> : null}
      </div>)}
    </div>)}
  </div>;
}
