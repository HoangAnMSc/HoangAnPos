import { useCallback, useEffect, useMemo, useState } from "react";
import { Barcode, Boxes, CheckCircle2, ClipboardCheck, Search } from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
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
  const canCount = canAccess("inventory.count");
  const canSubmit = canAccess("inventory.submit");
  const draftKey = `warehouse:inventory-draft:${user?.id ?? "anonymous"}`;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setProducts(await fetchInventoryCountProducts()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không tải được danh sách sản phẩm."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [load, open]);
  useEffect(() => {
    if (!open) { setDraftReady(false); return; }
    const draft = readLocalDraft<{ counts?: InventoryCountMap }>(draftKey, {});
    setCounts(draft.counts && typeof draft.counts === "object" ? draft.counts : {});
    setDraftReady(true);
  }, [draftKey, open]);
  useEffect(() => {
    if (!open || !draftReady) return;
    if (Object.values(counts).some((value) => value.trim() !== "")) writeLocalDraft(draftKey, { counts });
    else clearLocalDraft(draftKey);
  }, [counts, draftKey, draftReady, open]);

  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(() => products.filter((product) => !normalizedQuery ||
    [product.name, product.sku, getProductEan13Value(product)].filter(Boolean).some((value) => String(value).toLocaleLowerCase("vi").includes(normalizedQuery))), [normalizedQuery, products]);
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
    const code = normalizeEan13Input(value);
    if (!isValidEan13(code)) { void alertAction({ title: "EAN-13 không hợp lệ", message: "Mã vừa quét không phải EAN-13 hợp lệ.", tone: "danger" }); return; }
    const product = findProductByEan13(products, code);
    if (!product) { void alertAction({ title: "Không tìm thấy sản phẩm", message: `Không có sản phẩm mang mã ${code}.`, tone: "danger" }); return; }
    focusProduct(product);
  }
  async function submit() {
    if (!canSubmit || !countedProducts.length) { setError("Nhập số lượng cho ít nhất một sản phẩm."); return; }
    const confirmed = await confirmAction({ title: "Hoàn tất phiên kiểm kê", message: `Lưu số lượng thực tế của ${countedProducts.length} sản phẩm?`, confirmLabel: "Xác nhận hoàn tất", tone: "success" });
    if (!confirmed) return;
    setSubmitting(true); setError("");
    try {
      await submitInventoryAudit(profile?.full_name || user?.email || "Nhân viên", countedProducts.map((product) => ({ counted: parseInventoryCount(counts[product.id]), ean13: getProductEan13Value(product), productId: product.id, productName: product.name })));
      clearLocalDraft(draftKey); setCounts({}); setQuery(""); setError(""); setSubmitting(false); onClose(); showSuccess("Đã lưu phiên kiểm kê.");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không lưu được phiên kiểm kê."); }
    finally { setSubmitting(false); }
  }

  return <>
    <Modal bodyClassName="!p-0" footer={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button disabled={submitting} onClick={() => void requestClose()} variant="secondary">Hủy</Button>{canSubmit ? <Button disabled={!countedProducts.length} isLoading={submitting} onClick={() => void submit()}><ClipboardCheck className="h-4 w-4" />Hoàn tất ({countedProducts.length})</Button> : null}</div>} onClose={() => void requestClose()} open={open} size="xl" title="Tạo phiên kiểm kê">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Nhập số lượng thực tế cho các sản phẩm đã kiểm.</p><strong className="shrink-0 text-sm tabular-nums text-moss-700">{countedProducts.length}/{products.length}</strong></div>
        <div className="mt-3 flex gap-2"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3"><Search className="h-4 w-4 text-slate-400" /><input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sản phẩm, SKU, EAN-13..." value={query} /></label>{canCount ? <Button className="!min-h-11 !px-3" onClick={() => setScannerOpen(true)} variant="secondary"><Barcode className="h-4 w-4" /><span className="hidden sm:inline">Quét mã</span></Button> : null}</div>
      </div>
      <div className="space-y-2 bg-slate-50/70 p-3 sm:p-4">
        {loading ? <div className="p-10"><Spinner label="Đang tải sản phẩm..." /></div> : visibleProducts.map((product) => {
          const counted = hasInventoryCount(counts[product.id]);
          return <article className={`grid grid-cols-[44px_minmax(0,1fr)_88px] items-center gap-3 rounded-xl border p-2.5 transition sm:grid-cols-[48px_minmax(0,1fr)_110px] ${counted ? "border-moss-200 bg-moss-50" : "border-slate-200 bg-white"}`} key={product.id}>
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{product.image_url ? <img alt="" className="h-full w-full object-contain p-1" src={product.image_url} /> : <Boxes className="h-5 w-5" />}</span>
            <div className="min-w-0"><div className="flex items-center gap-1.5"><p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p>{counted ? <CheckCircle2 className="h-4 w-4 shrink-0 text-moss-600" /> : null}</div><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{product.sku || "Chưa có SKU"} · EAN {getProductEan13Value(product)}</p></div>
            <input aria-label={`Số lượng thực tế ${product.name}`} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-base font-black tabular-nums outline-none focus:border-moss-400 focus:ring-2 focus:ring-moss-100" disabled={!canCount} id={`inventory-count-${product.id}`} inputMode="numeric" onChange={(event) => { setCounts((current) => ({ ...current, [product.id]: normalizeIntegerInput(event.target.value) })); setError(""); }} placeholder="0" value={formatIntegerInput(counts[product.id] ?? "")} />
          </article>;
        })}
        {!loading && !visibleProducts.length ? <p className="p-8 text-center text-sm font-semibold text-slate-500">Không tìm thấy sản phẩm phù hợp.</p> : null}
      </div>
      {error ? <p className="mx-4 mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p> : null}
    </Modal>
    <Ean13ScannerModal description="Quét mã để chuyển nhanh đến dòng cần nhập số lượng." onClose={() => setScannerOpen(false)} onDetected={detected} open={scannerOpen} title="Quét sản phẩm kiểm kê" />
  </>;
}
