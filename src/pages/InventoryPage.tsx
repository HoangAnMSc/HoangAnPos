import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Barcode, Boxes, CheckCircle2, ClipboardCheck, Edit3, Trash2 } from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer, PageToolbar, SearchInput, StateNotice } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
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
            min="0"
            onChange={(event) => onChange(event.target.value)}
            placeholder="0"
            step="1"
            type="number"
            value={countValue}
          />
        </label>
        {error ? <StateNotice message={error} tone="error" /> : null}
      </form>
    </Modal>
  );
}

export function InventoryPage() {
  const { canAccess, profile, user } = useAuth();
  const [counts, setCounts] = useState<InventoryCountMap>({});
  const [countingProduct, setCountingProduct] = useState<InventoryCountProduct | null>(null);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<InventoryCountProduct[]>([]);
  const [query, setQuery] = useState("");
  const [quantityDraft, setQuantityDraft] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const { clearErrorNotice, errorNotice, showErrorNotice } = useErrorNotice(setError);
  const canCountInventory = canAccess("inventory.count");
  const canSubmitInventory = canAccess("inventory.submit");
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
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(() => {
    const matched = normalizedQuery
      ? products.filter((product) =>
          [product.name, product.sku, product.category, getProductEan13Value(product)]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase("vi").includes(normalizedQuery))
        )
      : products;

    return [...matched].sort((first, second) => {
      const firstCounted = hasInventoryCount(counts[first.id]);
      const secondCounted = hasInventoryCount(counts[second.id]);

      if (firstCounted !== secondCounted) {
        return firstCounted ? 1 : -1;
      }

      return first.name.localeCompare(second.name, "vi");
    });
  }, [counts, normalizedQuery, products]);

  function openQuantityModal(product: InventoryCountProduct) {
    if (!canCountInventory) {
      return;
    }

    setCountingProduct(product);
    setQuantityDraft(counts[product.id] ?? "");
    setQuantityError("");
    setSuccess("");
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
    setSuccess(`Đã ghi nhận ${countingProduct.name}.`);
    setQuery("");
    closeQuantityModal();
  }

  function removeCount(productId: string) {
    setCounts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setSuccess("");
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
      setSuccess("Đã hoàn tất phiên kiểm kê và gửi kết quả sang trang Kho.");
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
    <PageContainer maxWidth="none">
      <ConfigNotice />
      <PageToolbar
        action={
          <div className="grid gap-2 sm:flex">
            {canCountInventory ? (
              <Button onClick={() => setEan13ScannerOpen(true)} variant="secondary">
                <Barcode className="h-4 w-4" />
                Quét EAN-13
              </Button>
            ) : null}
            {canSubmitInventory ? (
              <Button
                disabled={countedProducts.length === 0}
                onClick={() => setSubmitConfirmOpen(true)}
              >
                <ClipboardCheck className="h-4 w-4" />
                Hoàn tất kiểm kê
              </Button>
            ) : null}
          </div>
        }
        description="Nhân viên nhập số lượng đếm thực tế. Số tồn hệ thống và chênh lệch chỉ hiển thị tại trang Kho."
        eyebrow="Ghi nhận thực tế"
        title="Tồn kho"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            className="lg:max-w-xl"
            onChange={setQuery}
            placeholder="Tìm tên, nhóm hàng, SKU hoặc EAN-13..."
            value={query}
          />
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{products.length} sản phẩm</Badge>
            <Badge tone="green">{countedProducts.length} đã nhập</Badge>
            <Badge tone="neutral">{products.length - countedProducts.length} chưa nhập</Badge>
          </div>
        </div>
      </PageToolbar>

      {error ? <StateNotice message={error} tone="error" /> : null}
      {success ? <StateNotice icon={CheckCircle2} message={success} tone="success" /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
        <Card className="min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-950">Chọn sản phẩm</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Chọn một sản phẩm để nhập số lượng đếm được.
              </p>
            </div>
            <Badge>{visibleProducts.length}</Badge>
          </div>

          {loading ? (
            <Spinner label="Đang tải sản phẩm..." />
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              description="Không có sản phẩm phù hợp với từ khóa."
              icon={Boxes}
              title="Không tìm thấy sản phẩm"
            />
          ) : (
            <div className="max-h-[68vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {visibleProducts.map((product) => {
                const counted = hasInventoryCount(counts[product.id]);

                return (
                  <button
                    className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                      counted
                        ? "border-moss-200 bg-moss-50/60 hover:bg-moss-50"
                        : "border-slate-200 bg-white hover:border-moss-200 hover:bg-slate-50"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    disabled={!canCountInventory}
                    key={product.id}
                    onClick={() => openQuantityModal(product)}
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
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <Boxes className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {product.category || "Chưa phân nhóm"} · {getProductEan13Value(product)}
                      </p>
                    </div>
                    <Badge tone={counted ? "green" : "neutral"}>
                      {counted ? `Đã nhập ${parseInventoryCount(counts[product.id])}` : "Chưa nhập"}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-950">Số lượng đã nhập</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">
                Kiểm tra lại dữ liệu trước khi hoàn tất phiên kiểm kê.
              </p>
            </div>
            {canCountInventory && countedProducts.length > 0 ? (
              <Button className="px-3" onClick={() => setCounts({})} variant="secondary">
                Xóa tất cả
              </Button>
            ) : null}
          </div>

          {loading ? (
            <Spinner label="Đang tải dữ liệu..." />
          ) : countedProducts.length === 0 ? (
            <EmptyState
              description="Quét EAN-13 hoặc chọn sản phẩm ở danh sách bên cạnh để bắt đầu."
              icon={ClipboardCheck}
              title="Chưa nhập số lượng"
            />
          ) : (
            <div className="space-y-2">
              {countedProducts.map((product) => (
                <article
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center"
                  key={product.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      EAN-13 {getProductEan13Value(product)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="rounded-xl bg-moss-50 px-4 py-2 text-center">
                      <p className="text-[11px] font-bold uppercase text-moss-700">Đã đếm</p>
                      <p className="text-xl font-extrabold tabular-nums text-moss-800">
                        {parseInventoryCount(counts[product.id])}
                      </p>
                    </div>
                    {canCountInventory ? (
                      <div className="flex gap-1">
                        <button
                          aria-label={`Sửa số lượng ${product.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          onClick={() => openQuantityModal(product)}
                          type="button"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Xóa ${product.name} khỏi phiên kiểm kê`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-700"
                          onClick={() => removeCount(product.id)}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>

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
