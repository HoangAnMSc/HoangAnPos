import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Product } from "../../features/products/types";
import { getActiveProductModeVariants, getVariantLabel } from "../../features/products/utils/variants";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { ConversionProductCard } from "./ConversionProductCard";

type Props = {
  products: Product[];
  onClose: () => void;
  onSelect: (product: Product) => void;
};

export function StockConversionProductPicker({ products, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const catalog = useMemo(() => products.map((product) => {
    const variants = getActiveProductModeVariants(product);
    return {
      product,
      variantCount: variants.length,
      categoryId: product.category ? `category:${product.category.id}` : product.product_type ? `type:${product.product_type.id}` : "uncategorized",
      categoryName: product.category?.name ?? product.product_type?.name ?? "Chưa phân loại",
      searchText: [product.name, product.category?.name, product.product_type?.name,
        ...variants.flatMap((variant) => [variant.sku, variant.barcode, getVariantLabel(variant, product.variant_attributes)]),
      ].filter(Boolean).join(" ").toLocaleLowerCase("vi"),
    };
  }), [products]);
  const categories = useMemo(() => [...new Map(catalog.map((item) => [item.categoryId, item.categoryName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "vi")), [catalog]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = catalog.filter((item) => (categoryId === "all" || item.categoryId === categoryId)
    && (!normalizedQuery || item.searchText.includes(normalizedQuery)));
  const hasFilters = Boolean(query) || categoryId !== "all";

  function clearFilters() { setQuery(""); setCategoryId("all"); }

  return (
    <Modal
      bodyClassName="!p-0"
      footer={<Button className="w-full sm:w-auto" onClick={onClose} variant="secondary">Hủy</Button>}
      onClose={onClose}
      open
      size="xl"
      title="Chọn sản phẩm quy đổi"
    >
      <div className="sticky top-0 z-10 space-y-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)] sm:items-end">
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-bold">Tìm sản phẩm</span>
            <span className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-100 px-3">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tên, biến thể hoặc EAN-13..."
                value={query}
              />
            </span>
          </label>
          <Select label="Danh mục" onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
            <option value="all">Tất cả danh mục</option>
            {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <p aria-live="polite">{visibleProducts.length} sản phẩm · Có ít nhất 2 biến thể đang hoạt động</p>
          {hasFilters ? <button className="py-1 font-extrabold text-moss-700 hover:text-moss-900" onClick={clearFilters} type="button">Xóa bộ lọc</button> : null}
        </div>
      </div>
      <div className="p-3 sm:p-4">
        {visibleProducts.length ? (
          <div className="grid grid-cols-2 justify-start gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(168px,184px))] sm:gap-3">
            {visibleProducts.map(({ product, variantCount }) => (
              <ConversionProductCard caption={`${variantCount} biến thể`} key={product.id} onClick={() => onSelect(product)} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            description={hasFilters ? "Thử đổi từ khóa hoặc danh mục để tìm sản phẩm." : "Sản phẩm cần có ít nhất hai biến thể đang hoạt động để thiết lập quy đổi."}
            icon={Search}
            title={hasFilters ? "Không có sản phẩm phù hợp" : "Chưa có sản phẩm đủ điều kiện"}
          />
        )}
      </div>
    </Modal>
  );
}
