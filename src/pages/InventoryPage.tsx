import { useCallback, useEffect, useMemo, useState } from "react";
import { Barcode, Search } from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { InventoryProductRow } from "../components/warehouse/InventoryProductRow";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "../lib/localDraft";
import { hasInventoryCount, parseInventoryCount, type InventoryCountMap } from "../lib/inventoryAudits";
import { findProductByEan13, getProductEan13Value, isValidEan13, normalizeEan13Input } from "../lib/productDisplay";
import { fetchInventoryCountProducts, type InventoryCountProduct } from "../services/products";
import { submitInventoryAudit } from "../services/inventoryAudits";

type Props = { open: boolean; onClose: () => void };

export function InventoryPage({ open, onClose }: Props) {
  const { canAccess, profile, user } = useAuth();
  const { alertAction, confirmAction, showSuccess } = useActionNotice();
  const [products, setProducts] = useState<InventoryCountProduct[]>([]);
  const [counts, setCounts] = useState<InventoryCountMap>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const canCreate = canAccess("inventory");
  const draftKey = `warehouse:inventory-draft:${user?.id ?? "anonymous"}`;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setProducts(await fetchInventoryCountProducts()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không tải được danh sách sản phẩm."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open && canCreate) void load(); }, [canCreate, load, open]);
  useEffect(() => {
    if (!open || !canCreate) { setDraftReady(false); setScannerOpen(false); return; }
    const draft = readLocalDraft<{ counts?: InventoryCountMap }>(draftKey, {});
    setCounts(draft.counts && typeof draft.counts === "object" ? draft.counts : {});
    setDraftReady(true);
  }, [canCreate, draftKey, open]);
  useEffect(() => {
    if (!open || !canCreate || !draftReady) return;
    if (Object.values(counts).some((value) => value.trim() !== "")) writeLocalDraft(draftKey, { counts });
    else clearLocalDraft(draftKey);
  }, [canCreate, counts, draftKey, draftReady, open]);

  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(() => products.filter((product) => !normalizedQuery ||
    [product.name, product.variant_sku, product.sku, getProductEan13Value(product)].filter(Boolean).some((value) => String(value).toLocaleLowerCase("vi").includes(normalizedQuery))), [normalizedQuery, products]);
  const countedProducts = useMemo(() => products.filter((product) => hasInventoryCount(counts[product.id])), [counts, products]);

  async function requestClose() {
    if (submitting) return;
    const hasDraft = Object.values(counts).some((value) => value.trim() !== "");
    if (hasDraft) {
      const confirmed = await confirmAction({ title: "Thoát phiên kiểm kê?", message: "Số lượng đã nhập sẽ được lưu nháp và tự khôi phục khi bạn mở lại.", confirmLabel: "Thoát và lưu nháp", cancelLabel: "Tiếp tục nhập" });
      if (!confirmed) return;
    }
    setQuery(""); setError(""); onClose();
  }
  function focusProduct(product: InventoryCountProduct) {
    setQuery(""); setScannerOpen(false);
    window.setTimeout(() => document.getElementById(`inventory-count-${product.id}`)?.focus(), 80);
  }
  function detected(value: string) {
    if (!canCreate) return;
    const code = normalizeEan13Input(value);
    if (!isValidEan13(code)) { void alertAction({ title: "EAN-13 không hợp lệ", message: "Mã vừa quét không phải EAN-13 hợp lệ.", tone: "danger" }); return; }
    const product = findProductByEan13(products, code);
    if (!product) { void alertAction({ title: "Không tìm thấy sản phẩm", message: `Không có sản phẩm mang mã ${code}.`, tone: "danger" }); return; }
    focusProduct(product);
  }
  async function submit() {
    if (!canCreate || !countedProducts.length) { setError("Nhập số lượng cho ít nhất một sản phẩm."); return; }
    const confirmed = await confirmAction({ title: "Hoàn tất phiên kiểm kê", message: `Lưu số lượng thực tế của ${countedProducts.length} sản phẩm?`, confirmLabel: "Xác nhận hoàn tất", tone: "success" });
    if (!confirmed) return;
    setSubmitting(true); setError("");
    try {
      await submitInventoryAudit(profile?.full_name || user?.email || "Nhân viên", countedProducts.map((product) => ({ counted: parseInventoryCount(counts[product.id]), ean13: getProductEan13Value(product), productId: product.id, productName: product.name })));
      clearLocalDraft(draftKey); setCounts({}); setQuery(""); setError(""); setSubmitting(false); onClose(); showSuccess("Đã lưu phiên kiểm kê.");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không lưu được phiên kiểm kê."); }
    finally { setSubmitting(false); }
  }

  if (!canCreate) return null;

  return <>
    <Modal bodyClassName="!p-0" footer={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button className="!bg-slate-100 !ring-0" disabled={submitting} onClick={() => void requestClose()} variant="secondary">Hủy</Button>{canCreate ? <Button className="!bg-moss-600 hover:!bg-moss-700" disabled={!countedProducts.length} isLoading={submitting} onClick={() => void submit()}>Hoàn tất ({countedProducts.length})</Button> : null}</div>} onClose={() => void requestClose()} open={open} size="xl" title="Tạo phiên kiểm kê">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-2.5 sm:px-6">
        <p className="text-xs font-semibold tabular-nums text-slate-500">{countedProducts.length}/{products.length} đã nhập</p>
        <div aria-label="Tiến độ kiểm kê" aria-valuemax={products.length || 1} aria-valuemin={0} aria-valuenow={countedProducts.length} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar"><div className="h-full rounded-full bg-moss-400 transition-all" style={{ width: `${products.length ? countedProducts.length / products.length * 100 : 0}%` }} /></div>
        <div className="mt-2 flex gap-2"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-moss-400 focus-within:ring-2 focus-within:ring-moss-100"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label="Tìm sản phẩm kiểm kê" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sản phẩm..." value={query} /></label>{canCreate ? <Button aria-label="Quét mã EAN-13" className="!min-h-11 !w-11 !rounded-lg !border !border-slate-200 !bg-white !px-0" onClick={() => setScannerOpen(true)} variant="secondary"><Barcode className="h-5 w-5" /></Button> : null}</div>
        <div aria-hidden="true" className="mt-2 flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500"><span>Sản phẩm</span><span className="w-16 text-center sm:w-20">SL thực tế</span></div>
      </div>
      <div className="divide-y divide-slate-100 bg-white">
        {loading ? <div className="p-10"><Spinner label="Đang tải sản phẩm..." /></div> : visibleProducts.map((product) => {
          const counted = hasInventoryCount(counts[product.id]);
          return <article className="px-4 py-2.5 sm:px-6 sm:py-3" key={product.id}>
            <InventoryProductRow ean13={getProductEan13Value(product)} imageUrl={product.image_url} name={product.product_name ?? product.name} variantValues={product.variant_values}>
              <input aria-label={`Số lượng thực tế ${product.name}`} className={`h-10 w-full rounded-lg border bg-white px-1 text-center text-base font-bold tabular-nums outline-none focus:border-moss-400 focus:ring-2 focus:ring-moss-100 ${counted ? "border-moss-300" : "border-slate-200"}`} disabled={!canCreate} id={`inventory-count-${product.id}`} inputMode="numeric" onChange={(event) => { setCounts((current) => ({ ...current, [product.id]: normalizeIntegerInput(event.target.value) })); setError(""); }} placeholder="—" value={formatIntegerInput(counts[product.id] ?? "")} />
            </InventoryProductRow>
          </article>;
        })}
        {!loading && !visibleProducts.length ? <p className="p-8 text-center text-sm font-semibold text-slate-500">Không tìm thấy sản phẩm phù hợp.</p> : null}
      </div>
      {error ? <p className="mx-4 mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p> : null}
    </Modal>
    <Ean13ScannerModal description="Quét mã để chuyển nhanh đến dòng cần nhập số lượng." onClose={() => setScannerOpen(false)} onDetected={detected} open={scannerOpen} title="Quét sản phẩm kiểm kê" />
  </>;
}
