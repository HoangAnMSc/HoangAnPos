import { useMemo, useState } from "react";
import { Barcode, Boxes, Search } from "lucide-react";
import { Ean13ScannerModal } from "../products/Ean13ScannerModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../ui/ErrorNoticeModal";
import { Modal } from "../ui/Modal";
import { SearchInput } from "../ui/Page";
import {
  findProductByEan13,
  getProductEan13Value,
} from "../../lib/productDisplay";
import type { Product } from "../../types";

type WarehouseProductActionsProps = {
  actionLabel: string;
  products: Product[];
  selectedProductId?: string;
  onSelect: (product: Product) => void;
};

export function WarehouseProductActions({
  actionLabel,
  onSelect,
  products,
  selectedProductId,
}: WarehouseProductActionsProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<ErrorNotice | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(
    () =>
      products.filter((product) =>
        normalizedQuery
          ? [product.name, product.category, product.sku, getProductEan13Value(product)]
              .filter(Boolean)
              .some((value) => value!.toLocaleLowerCase("vi").includes(normalizedQuery))
          : true
      ),
    [normalizedQuery, products]
  );

  function selectProduct(product: Product) {
    onSelect(product);
    setQuery("");
    setSearchOpen(false);
  }

  function handleEan13Detected(value: string) {
    const product = findProductByEan13(products, value);

    if (!product) {
      setNotice({
        message: `Không tìm thấy sản phẩm có mã EAN-13 ${value}.`,
        title: "Không có sản phẩm",
      });
      return;
    }

    onSelect(product);
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-moss-100 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_36px_rgba(57,67,46,0.16)] backdrop-blur-xl lg:left-72">
        <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2">
          <Button
            className="!min-h-12 w-full !rounded-xl !bg-sky-50 !px-3 !py-2.5 !text-sky-700 ring-sky-200 hover:!bg-sky-100"
            disabled={products.length === 0}
            onClick={() => setScannerOpen(true)}
            variant="secondary"
          >
            <Barcode className="h-5 w-5" />
            Quét EAN-13
          </Button>
          <Button
            className="!min-h-12 w-full !rounded-xl !bg-moss-700 !px-3 !py-2.5 !text-white hover:!bg-moss-800"
            disabled={products.length === 0}
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-5 w-5" />
            Tìm kiếm
          </Button>
        </div>
      </div>

      <Ean13ScannerModal
        description={`Quét EAN-13 để chọn nhanh sản phẩm cần ${actionLabel.toLocaleLowerCase("vi")}.`}
        onClose={() => setScannerOpen(false)}
        onDetected={handleEan13Detected}
        open={scannerOpen}
        title={`Quét EAN-13 ${actionLabel.toLocaleLowerCase("vi")}`}
      />

      <Modal
        onClose={() => {
          setQuery("");
          setSearchOpen(false);
        }}
        open={searchOpen}
        size="lg"
        title={`Tìm sản phẩm · ${actionLabel}`}
      >
        <div className="space-y-4">
          <SearchInput
            onChange={setQuery}
            placeholder="Tìm tên, nhóm hàng, SKU hoặc EAN-13..."
            value={query}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-500">
              Chạm vào sản phẩm để đưa vào biểu mẫu.
            </p>
            <Badge tone="neutral">{visibleProducts.length} sản phẩm</Badge>
          </div>

          {visibleProducts.length === 0 ? (
            <EmptyState
              description="Thử tìm bằng tên, nhóm hàng, SKU hoặc EAN-13 khác."
              icon={Search}
              title="Không tìm thấy sản phẩm"
            />
          ) : (
            <div className="max-h-[56dvh] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {visibleProducts.map((product) => {
                const selected = product.id === selectedProductId;

                return (
                  <button
                    className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                      selected
                        ? "border-moss-300 bg-moss-50"
                        : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/50"
                    }`}
                    key={product.id}
                    onClick={() => selectProduct(product)}
                    type="button"
                  >
                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-100">
                      {product.image_url ? (
                        <img
                          alt={product.name}
                          className="h-full w-full object-contain p-1"
                          src={product.image_url}
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-slate-400">
                          <Boxes className="h-5 w-5" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {product.category || "Chưa phân nhóm"} · EAN-13 {getProductEan13Value(product)}
                      </p>
                    </div>
                    <Badge tone={selected ? "green" : "neutral"}>
                      {selected ? "Đã chọn" : `Tồn ${product.stock}`}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <ErrorNoticeModal notice={notice} onClose={() => setNotice(null)} />
    </>
  );
}
