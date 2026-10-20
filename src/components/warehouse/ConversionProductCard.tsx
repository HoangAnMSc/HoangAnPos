import { ArrowLeftRight, Package } from "lucide-react";
import { ProductThumbnail } from "../products/ProductThumbnail";
import type { Product } from "../../features/products/types";
import { getStockConversionProductImage } from "../../lib/stockConversions";

export function ConversionProductCard({ product, ratios = [], caption, onClick }: { product: Product; ratios?: { source: string; target: string }[]; caption?: string; onClick: () => void }) {
  const image = getStockConversionProductImage(product);
  const category = product.category?.name ?? product.product_type?.name;
  const ratio = ratios[0];
  return <button className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white text-left shadow-[0_7px_20px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-moss-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-500" onClick={onClick} type="button">
    <span className="relative mx-2 mt-2 block aspect-[1.25/1] shrink-0 self-stretch overflow-hidden rounded-2xl bg-slate-100">
      {image ? <ProductThumbnail alt={product.name} cacheVersion={product.updated_at} className="absolute inset-0 h-full w-full object-contain p-2" src={image} /> : <span className="absolute inset-0 grid place-items-center text-slate-300"><Package className="h-9 w-9" /></span>}
    </span>
    <span className="flex min-w-0 flex-1 flex-col self-stretch px-3 pb-2.5 pt-2">
      {category ? <span className="mb-1 text-[10px] font-extrabold leading-4 text-moss-700 [overflow-wrap:anywhere]">{category}</span> : null}
      <strong className="mb-2 min-h-10 text-sm font-black leading-5 text-slate-950 [overflow-wrap:anywhere]">{product.name}</strong>
      {ratio || caption ? <span className="mt-auto block border-t border-dashed border-slate-200 pt-2 text-[11px] font-extrabold leading-4 text-slate-700">
        {ratio ? <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-center">
          <span className="min-w-0 [overflow-wrap:anywhere]">{ratio.source}</span>
          <span className="flex shrink-0 items-center justify-center"><ArrowLeftRight aria-hidden="true" className="h-4 w-4 shrink-0 text-moss-700" /><span className="sr-only">tương đương hai chiều với</span></span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{ratio.target}</span>
        </span> : caption}
        {ratios.length > 1 ? <span className="mt-1 block text-moss-700">+{ratios.length - 1} cặp quy đổi</span> : null}
      </span> : null}
    </span>
  </button>;
}
