import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Barcode, Boxes, CheckCircle2, Search } from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { fetchProducts } from "../features/products/services/productEngine";
import type { Product, ProductVariant } from "../features/products/types";
import { getVariantLabel } from "../features/products/utils/variants";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { useAuth } from "../contexts/AuthContext";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { clearLocalDraft, readLocalDraft, writeLocalDraft } from "../lib/localDraft";
import { isValidEan13, normalizeEan13Input } from "../lib/productDisplay";
import { issueVariantStocks, receiveVariantStocks } from "../services/stockMovements";

type Props = { type: "in" | "out"; open: boolean; onClose: () => void };
type SkuOption = { product: Product; variant: ProductVariant; label: string; imageUrl: string | null };
type QuantityMap = Record<string, string>;

export function StockMovementPage({ type, open, onClose }: Props) {
  const { user } = useAuth();
  const { alertAction, confirmAction, showSuccess } = useActionNotice();
  const inbound = type === "in";
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const draftKey = `warehouse:${type}-draft:${user?.id ?? "anonymous"}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setProducts(await fetchProducts()); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu kho."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) void load(); }, [load, open]);
  useEffect(() => {
    if (!open) { setDraftReady(false); setScannerOpen(false); return; }
    const draft = readLocalDraft<{ quantities?: QuantityMap; reason?: string }>(draftKey, {});
    setQuantities(draft.quantities && typeof draft.quantities === "object" ? draft.quantities : {});
    setReason(typeof draft.reason === "string" ? draft.reason : "");
    setDraftReady(true);
  }, [draftKey, open]);
  useEffect(() => {
    if (!open || !draftReady) return;
    const hasDraft = Object.values(quantities).some((value) => value.trim() !== "") || reason.trim() !== "";
    if (hasDraft) writeLocalDraft(draftKey, { quantities, reason });
    else clearLocalDraft(draftKey);
  }, [draftKey, draftReady, open, quantities, reason]);

  const skuOptions = useMemo<SkuOption[]>(() => products.flatMap((product) => product.variants
    .filter((variant) => variant.is_active)
    .map((variant) => ({
      product,
      variant,
      label: getVariantLabel(variant, product.variant_attributes),
      imageUrl: variant.image_url ?? product.images.find((image) => image.is_primary)?.image_url ?? product.images[0]?.image_url ?? null,
    }))), [products]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleOptions = useMemo(() => skuOptions.filter(({ product, variant, label }) =>
    !normalizedQuery || [product.name, variant.sku, variant.barcode, label].filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("vi").includes(normalizedQuery))), [normalizedQuery, skuOptions]);
  const lines = useMemo(() => skuOptions.flatMap(({ variant }) => {
    const quantity = Number(quantities[variant.id]);
    return Number.isInteger(quantity) && quantity > 0 ? [{ variantId: variant.id, quantity }] : [];
  }), [quantities, skuOptions]);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  async function requestClose() {
    if (saving) return;
    const hasDraft = Object.values(quantities).some((value) => value.trim() !== "") || reason.trim() !== "";
    if (hasDraft) {
      const confirmed = await confirmAction({ title: `Thoát ${actionLabel.toLowerCase()}?`, message: "Dữ liệu đã nhập sẽ được lưu nháp và tự khôi phục khi bạn mở lại.", confirmLabel: "Thoát và lưu nháp", cancelLabel: "Tiếp tục nhập" });
      if (!confirmed) return;
    }
    setQuery(""); setError(""); onClose();
  }

  function handleEan13Detected(value: string) {
    const code = normalizeEan13Input(value);
    if (!isValidEan13(code)) {
      void alertAction({ title: "EAN-13 không hợp lệ", message: "Mã vừa quét không phải EAN-13 hợp lệ.", tone: "danger" });
      return;
    }
    const item = skuOptions.find(({ variant }) =>
      [variant.barcode, variant.sku].filter(Boolean).some((candidate) => normalizeEan13Input(String(candidate)) === code));
    if (!item) {
      void alertAction({ title: "Không tìm thấy sản phẩm", message: `Không có SKU mang mã EAN-13 ${code}.`, tone: "danger" });
      return;
    }
    setScannerOpen(false); setQuery(""); setError("");
    window.setTimeout(() => document.getElementById(`stock-${type}-quantity-${item.variant.id}`)?.focus(), 80);
  }

  async function submit() {
    setError("");
    if (!lines.length) { setError("Nhập số lượng cho ít nhất một sản phẩm."); return; }
    if (!inbound && !reason.trim()) { setError("Vui lòng nhập lý do xuất kho."); return; }
    const insufficient = skuOptions.find(({ variant }) => (Number(quantities[variant.id]) || 0) > variant.stock_quantity);
    if (!inbound && insufficient) { setError(`${insufficient.product.name} chỉ còn ${insufficient.variant.stock_quantity} sản phẩm.`); return; }
    const confirmed = await confirmAction({
      title: inbound ? "Xác nhận nhập kho" : "Xác nhận xuất kho",
      message: `${inbound ? "Nhập" : "Xuất"} tổng cộng ${totalQuantity} sản phẩm thuộc ${lines.length} SKU?`,
      confirmLabel: inbound ? "Xác nhận nhập" : "Xác nhận xuất",
      tone: inbound ? "success" : "danger",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      if (inbound) await receiveVariantStocks(lines);
      else await issueVariantStocks(lines, reason);
      clearLocalDraft(draftKey); setQuantities({}); setReason(""); setQuery(""); setError(""); setSaving(false); onClose();
      showSuccess(inbound ? "Đã nhập kho tất cả sản phẩm." : "Đã xuất kho tất cả sản phẩm.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không cập nhật được tồn kho.");
    } finally { setSaving(false); }
  }

  const Icon = inbound ? ArrowDownToLine : ArrowUpFromLine;
  const actionLabel = inbound ? "Nhập kho" : "Xuất kho";
  return <>
    <Modal
      bodyClassName="!p-0"
      footer={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button disabled={saving} onClick={() => void requestClose()} variant="secondary">Hủy</Button><Button isLoading={saving} onClick={() => void submit()} variant={inbound ? "primary" : "danger"}><Icon className="h-4 w-4" />{actionLabel} ({lines.length})</Button></div>}
      onClose={() => void requestClose()} open={open} size="xl" title={`${actionLabel} nhiều sản phẩm`}
    >
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Nhập số lượng ở các dòng cần xử lý, sau đó xác nhận một lần.</p><strong className="shrink-0 text-sm tabular-nums text-slate-900">{lines.length} SKU · {totalQuantity} sản phẩm</strong></div>
        <div className="mt-3 flex gap-2"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3"><Search className="h-4 w-4 text-slate-400" /><input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, SKU hoặc mã vạch..." value={query} /></label><Button className="!min-h-11 shrink-0 !px-3" onClick={() => setScannerOpen(true)} variant="secondary"><Barcode className="h-4 w-4" /><span className="hidden sm:inline">Quét EAN-13</span></Button></div>
      </div>
      <div className="space-y-2 bg-slate-50/70 p-3 sm:p-4">
        {loading ? <div className="p-10"><Spinner label="Đang tải danh sách SKU..." /></div> : visibleOptions.map((item) => {
          const entered = Boolean(quantities[item.variant.id]?.trim());
          return <article className={`grid grid-cols-[44px_minmax(0,1fr)_88px] items-center gap-3 rounded-xl border p-2.5 transition sm:grid-cols-[48px_minmax(0,1fr)_110px] ${entered ? inbound ? "border-moss-200 bg-moss-50" : "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"}`} key={item.variant.id}>
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">{item.imageUrl ? <img alt="" className="h-full w-full object-contain p-1" src={item.imageUrl} /> : <Boxes className="h-5 w-5" />}</span>
            <div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-sm font-extrabold text-slate-950">{item.product.name}</p>{entered ? <CheckCircle2 className={`h-4 w-4 shrink-0 ${inbound ? "text-moss-600" : "text-red-600"}`} /> : null}</div><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{item.label} · {item.variant.sku} · Tồn {item.variant.stock_quantity}</p></div>
            <input aria-label={`Số lượng ${item.product.name}`} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-center text-base font-black tabular-nums outline-none focus:border-moss-400 focus:ring-2 focus:ring-moss-100" id={`stock-${type}-quantity-${item.variant.id}`} inputMode="numeric" onChange={(event) => { setQuantities((current) => ({ ...current, [item.variant.id]: normalizeIntegerInput(event.target.value) })); setError(""); }} placeholder="0" value={formatIntegerInput(quantities[item.variant.id] ?? "")} />
          </article>;
        })}
        {!loading && !visibleOptions.length ? <p className="p-8 text-center text-sm font-semibold text-slate-500">Không tìm thấy sản phẩm phù hợp.</p> : null}
      </div>
      {!inbound ? <div className="border-t border-slate-100 bg-white p-4 sm:px-6"><Textarea label="Lý do xuất kho" onChange={(event) => { setReason(event.target.value); setError(""); }} placeholder="Ví dụ: hàng hỏng, sử dụng nội bộ..." value={reason} /></div> : null}
      {error ? <p className="mx-4 mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:mx-6">{error}</p> : null}
    </Modal>
    <Ean13ScannerModal description={`Quét mã để chuyển nhanh đến sản phẩm cần ${inbound ? "nhập" : "xuất"} kho.`} onClose={() => setScannerOpen(false)} onDetected={handleEan13Detected} open={scannerOpen} title={`Quét EAN-13 ${actionLabel.toLowerCase()}`} />
  </>;
}
