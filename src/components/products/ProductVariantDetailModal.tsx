import { Boxes } from "lucide-react";
import type { Product, ProductVariant } from "../../features/products/types";
import { formatVariantValueLabel, getVariantLabel } from "../../features/products/utils/variants";
import { formatCurrency } from "../../lib/format";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { ProductThumbnail } from "./ProductThumbnail";

export function ProductVariantDetailModal({ product, variant, onClose }: {
  product: Product;
  variant: ProductVariant;
  onClose: () => void;
}) {
  const label = getVariantLabel(variant, product.variant_attributes);
  const image = variant.image_url
    ?? product.images.find((item) => item.variant_id === variant.id)?.image_url
    ?? product.variant_attributes.flatMap((attribute) => attribute.values)
      .filter((value) => variant.value_ids.includes(value.id))
      .map((value) => value.metadata.image_url)
      .find((url): url is string => typeof url === "string" && Boolean(url))
    ?? product.images.find((item) => item.is_primary)?.image_url
    ?? product.images[0]?.image_url;
  const metrics = [
    ["Giá bán", formatCurrency(variant.base_price)],
    ["Giá so sánh", variant.compare_at_price == null ? "Chưa thiết lập" : formatCurrency(variant.compare_at_price)],
    ["Giá vốn", formatCurrency(variant.cost_price)],
    ["Tồn trong kho", String(variant.stock_quantity)],
    ["Tại quầy", String(variant.shelf_quantity)],
    ["Khối lượng", variant.weight == null ? "Chưa thiết lập" : String(variant.weight)],
  ];
  return <Modal
    open
    onClose={onClose}
    title="Chi tiết biến thể"
    size="lg"
    footer={<Button onClick={onClose} variant="secondary">Đóng</Button>}
  >
    <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="aspect-square overflow-hidden rounded-2xl bg-slate-50">
        {image ? <ProductThumbnail
          alt={`${product.name} · ${label}`}
          cacheVersion={product.updated_at}
          className="h-full w-full object-contain"
          loading="eager"
          src={image}
          thumbnailWidth={768}
        /> : <div className="grid h-full place-items-center text-slate-300"><Boxes className="h-12 w-12" /></div>}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-500">{product.name}</p>
        <h3 className="mt-1 text-xl font-black text-slate-950">{label}</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div><dt className="font-semibold text-slate-500">SKU</dt><dd className="break-all font-bold">{variant.sku}</dd></div>
          <div><dt className="font-semibold text-slate-500">EAN-13</dt><dd className="break-all font-mono font-bold">{variant.barcode || "Chưa có EAN-13"}</dd></div>
          <div><dt className="font-semibold text-slate-500">Trạng thái</dt><dd className="font-bold">{variant.is_active ? "Đang bán" : "Đã tắt"}</dd></div>
        </dl>
      </div>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map(([name, value]) => <div className="rounded-xl bg-slate-50 px-3 py-2.5" key={name}>
        <dt className="text-xs font-semibold text-slate-500">{name}</dt>
        <dd className="mt-1 break-words text-sm font-extrabold text-slate-900">{value}</dd>
      </div>)}
    </dl>
    {product.variant_attributes.length ? <dl className="mt-4 grid gap-2 sm:grid-cols-2">
      {product.variant_attributes.map((attribute) => {
        const value = attribute.values.find((item) => variant.value_ids.includes(item.id));
        return <div className="rounded-xl border border-slate-200 px-3 py-2.5" key={attribute.id}>
          <dt className="text-xs font-semibold text-slate-500">{attribute.name}</dt>
          <dd className="mt-1 text-sm font-bold">{value ? formatVariantValueLabel(value.label, attribute.unit) : "Chưa thiết lập"}</dd>
        </div>;
      })}
    </dl> : null}
  </Modal>;
}
