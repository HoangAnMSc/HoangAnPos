import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Barcode, Boxes, CheckCircle2, ChevronRight, ClipboardCheck } from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer, StateNotice } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import {
  hasInventoryCount,
  type InventoryCountMap,
  parseInventoryCount,
} from "../lib/inventoryAudits";
import {
  findProductByEan13,
  getProductEan13Value,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import {
  fetchInventoryCountProducts,
  type InventoryCountProduct,
} from "../services/products";
import { submitInventoryAudit } from "../services/inventoryAudits";

type QuantityModalProps = {
  countValue: string;
  error: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  product: InventoryCountProduct | null;
};

function QuantityModal({
  countValue,
  error,
  onChange,
  onClose,
  onSubmit,
  product,
}: QuantityModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} variant="secondary">
            Hủy
          </Button>
          <Button form="inventory-quantity-form" type="submit">
            Lưu số lượng
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(product)}
      size="sm"
      title="Nhập số lượng thực tế"
    >
      <form className="space-y-4" id="inventory-quantity-form" onSubmit={handleSubmit}>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="font-extrabold text-slate-950">{product?.name}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            EAN-13 {product ? getProductEan13Value(product) : ""}
          </p>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-slate-950">
            Số lượng đếm được
          </span>
          <input
            autoFocus
            className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-2xl font-extrabold tabular-nums text-slate-950 outline-none transition focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
            inputMode="numeric"
            onChange={(event) => onChange(normalizeIntegerInput(event.target.value))}
            placeholder="0"
            type="text"
            value={formatIntegerInput(countValue)}
          />
        </label>
        {error ? <StateNotice message={error} tone="error" /> : null}
      </form>
    </Modal>
  );
}

export function InventoryPage() {
  const { showSuccess } = useActionNotice();
  const { canAccess, profile, user } = useAuth();
  const [counts, setCounts] = useState<InventoryCountMap>({});
  const [countingProduct, setCountingProduct] = useState<InventoryCountProduct | null>(null);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<InventoryCountProduct[]>([]);
  const [quantityDraft, setQuantityDraft] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { clearErrorNotice, errorNotice, showErrorNotice } = useErrorNotice(setError);
  const canCountInventory = canAccess("inventory.count");
  const canSubmitInventory = canAccess("inventory.submit");
  const hasInventoryActions = canCountInventory || canSubmitInventory;
  const staffName = profile?.full_name || user?.email || "Nhân viên";

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setProducts(await fetchInventoryCountProducts());
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Không tải được danh sách sản phẩm.",
        "Không tải được dữ liệu kiểm kê"
      );
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const countedProducts = useMemo(
    () => products.filter((product) => hasInventoryCount(counts[product.id])),
    [counts, products]
  );
  const visibleProducts = useMemo(() => {
    return [...products].sort((first, second) => {
      const firstCounted = hasInventoryCount(counts[first.id]);
      const secondCounted = hasInventoryCount(counts[second.id]);

      if (firstCounted !== secondCounted) {
        return firstCounted ? 1 : -1;
      }

      return first.name.localeCompare(second.name, "vi");
    });
  }, [counts, products]);

  function openQuantityModal(product: InventoryCountProduct) {
    if (!canCountInventory) {
      return;
    }

    setCountingProduct(product);
    setQuantityDraft(counts[product.id] ?? "");
    setQuantityError("");
  }

  function closeQuantityModal() {
    setCountingProduct(null);
    setQuantityDraft("");
    setQuantityError("");
  }

  function saveQuantityDraft() {
    if (!canCountInventory || !countingProduct) {
      return;
    }

    const parsed = Number(quantityDraft);
    if (!quantityDraft.trim() || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      setQuantityError("Số lượng phải là số nguyên từ 0 trở lên.");
      return;
    }

    setCounts((current) => ({ ...current, [countingProduct.id]: String(parsed) }));
    closeQuantityModal();
  }

  function handleEan13Detected(value: string) {
    const ean13Code = normalizeEan13Input(value);

    if (!isValidEan13(ean13Code)) {
      showErrorNotice("Mã quét không phải EAN-13 hợp lệ.", "EAN-13 không hợp lệ");
      return;
    }

    const product = findProductByEan13(products, ean13Code);
    if (!product) {
      showErrorNotice(
        `Không tìm thấy sản phẩm có mã EAN-13 ${ean13Code}.`,
        "Không có sản phẩm"
      );
      return;
    }

    openQuantityModal(product);
  }

  async function handleSubmitInventory() {
    if (!canSubmitInventory || countedProducts.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      await submitInventoryAudit(
        staffName,
        countedProducts.map((product) => ({
          counted: parseInventoryCount(counts[product.id]),
          ean13: getProductEan13Value(product),
          productId: product.id,
          productName: product.name,
        }))
      );
      setCounts({});
      setSubmitConfirmOpen(false);
      showSuccess("Đã hoàn tất phiên kiểm kê và gửi kết quả sang trang Kho.");
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error
          ? requestError.message
          : "Không gửi được phiên kiểm kê. Vui lòng thử lại.",
        "Không lưu được kiểm kê"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer
      className={hasInventoryActions ? "!space-y-3 !pb-28" : "!space-y-3"}
      maxWidth="none"
    >
      <ConfigNotice />
      {error ? <StateNotice message={error} tone="error" /> : null}

      <section className="mx-auto w-full max-w-3xl min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
            <div>
              <h3 className="font-extrabold text-slate-950">Danh sách kiểm kê</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Chạm vào sản phẩm để nhập hoặc sửa số lượng.
              </p>
            </div>
            <p className="shrink-0 text-sm font-extrabold tabular-nums text-slate-600">
              <span className="text-moss-700">{countedProducts.length}</span>/{products.length}
            </p>
          </div>

          {loading ? (
            <div className="p-10"><Spinner label="Đang tải sản phẩm..." /></div>
          ) : visibleProducts.length === 0 ? (
            <div className="p-4 sm:p-6"><EmptyState description="Sản phẩm sẽ xuất hiện tại đây khi có dữ liệu trong kho." icon={Boxes} title="Chưa có sản phẩm cần kiểm kê" /></div>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-y-auto overscroll-contain bg-slate-50/70 p-2.5 sm:p-3">
              {visibleProducts.map((product) => {
                const counted = hasInventoryCount(counts[product.id]);

                return (
                  <button
                    className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition ${
                      counted
                        ? "border-moss-200 bg-moss-50/90 hover:bg-moss-100/80"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    disabled={!canCountInventory}
                    key={product.id}
                    onClick={() => openQuantityModal(product)}
                    type="button"
                  >
                    <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                      {product.image_url ? (
                        <img alt={product.name} className="h-full w-full object-contain p-1" src={product.image_url} />
                      ) : (
                        <Boxes className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                        {product.sku || "Chưa có SKU"} · EAN {getProductEan13Value(product)}
                      </p>
                    </div>
                    {counted ? (
                      <span aria-label="Đã nhập số lượng" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss-100 text-moss-700">
                        <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-slate-400">
                        Chưa nhập <ChevronRight className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
      </section>

      {hasInventoryActions ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-moss-100 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_36px_rgba(57,67,46,0.16)] backdrop-blur-xl lg:left-72">
          <div
            className={`mx-auto grid w-full max-w-3xl gap-2 sm:flex sm:justify-end ${
              canCountInventory && canSubmitInventory ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {canCountInventory ? (
              <Button
                className="!min-h-12 w-full !rounded-xl !bg-sky-50 !px-4 !py-2.5 !text-sky-700 ring-sky-200 hover:!bg-sky-100 sm:w-auto"
                onClick={() => setEan13ScannerOpen(true)}
                variant="secondary"
              >
                <Barcode className="h-5 w-5" />
                Quét EAN-13
              </Button>
            ) : null}
            {canSubmitInventory ? (
              <Button
                className="!min-h-12 w-full !rounded-xl !bg-moss-700 !px-4 !py-2.5 !text-white hover:!bg-moss-800 sm:w-auto"
                disabled={countedProducts.length === 0}
                onClick={() => setSubmitConfirmOpen(true)}
              >
                <ClipboardCheck className="h-5 w-5" />
                Hoàn tất kiểm kê
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Ean13ScannerModal
        description="Quét mã trên tem sản phẩm, sau đó nhập số lượng thực tế vừa đếm."
        onClose={() => setEan13ScannerOpen(false)}
        onDetected={handleEan13Detected}
        open={ean13ScannerOpen}
        title="Quét EAN-13 kiểm kê"
      />

      <QuantityModal
        countValue={quantityDraft}
        error={quantityError}
        onChange={(value) => {
          setQuantityDraft(value);
          setQuantityError("");
        }}
        onClose={closeQuantityModal}
        onSubmit={saveQuantityDraft}
        product={countingProduct}
      />

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setSubmitConfirmOpen(false)} variant="secondary">
              Kiểm tra lại
            </Button>
            <Button isLoading={submitting} onClick={() => void handleSubmitInventory()}>
              Xác nhận hoàn tất
            </Button>
          </div>
        }
        onClose={() => setSubmitConfirmOpen(false)}
        open={submitConfirmOpen}
        size="sm"
        title="Hoàn tất phiên kiểm kê?"
      >
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-600">
            Bạn đã nhập số lượng thực tế cho{" "}
            <strong className="text-slate-950">{countedProducts.length} sản phẩm</strong>. Sau khi
            xác nhận, dữ liệu sẽ được lưu tập trung và chuyển sang trang Kho để người có quyền đối
            chiếu.
          </p>
          {countedProducts.length < products.length ? (
            <StateNotice
              message={`Còn ${products.length - countedProducts.length} sản phẩm chưa được nhập trong phiên này.`}
              tone="warning"
            />
          ) : null}
        </div>
      </Modal>

      <ErrorNoticeModal notice={errorNotice} onClose={clearErrorNotice} />
    </PageContainer>
  );
}
