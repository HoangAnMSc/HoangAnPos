import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, ChevronRight, Pencil, Plus, RefreshCw, Search, Settings, SlidersHorizontal, Trash2 } from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { WarehouseProductDetails } from "../components/warehouse/WarehouseProductDetails";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { useAuth } from "../contexts/AuthContext";
import { fetchProducts } from "../features/products/services/productEngine";
import type { Product, ProductVariant } from "../features/products/types";
import { getProductModeVariants, getVariantDisplayValues, getVariantLabel } from "../features/products/utils/variants";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { isValidEan13, normalizeEan13Input } from "../lib/productDisplay";
import { createStockConversionRequestId as createRequestId, getStockConversionProductImage } from "../lib/stockConversions";
import { expiryDateLabel, expiryDaysLeft, expiryRowColors, expiryStatusLabels, expiryStatusOrder, stockExpiryToday, summarizeStockExpiry, type ExpiryGroup, type ExpiryLot, type ExpiryStatus, type ExpiryVariantState } from "../lib/stockExpiry";
import { clearStockExpiry, fetchStockExpiry, prepareStockExpiry, saveStockExpirySettings, setStockExpiry, type StockExpirySettings } from "../services/stockExpiry";

type Props = { open: boolean; onClose: () => void };
type Row = { product: Product; variant: ProductVariant; stock: number; undatedQuantity: number } & ReturnType<typeof summarizeStockExpiry>;
type ExpiryFilter = Exclude<ExpiryStatus, "pending" | "untracked"> | "all" | "undated";
type AllocationForm = {
  product: Product;
  variant: ProductVariant;
  lots: ExpiryLot[];
  quantity: number;
  originalDate: string | null;
  parts: { key: number; date: string; quantity: string }[];
  requestId: string;
};

function remainingLabel(date: string, today: string) {
  const days = expiryDaysLeft(date, today);
  return days < 0 ? `Quá HSD ${-days} ngày` : days === 0 ? "HSD hôm nay" : `Còn ${days} ngày`;
}

function ProductInfo({ product, variant, meta }: { product: Product; variant: ProductVariant; meta?: React.ReactNode }) {
  return <WarehouseProductDetails
    ean13={variant.barcode || (isValidEan13(variant.sku) ? variant.sku : null)}
    imageUrl={variant.image_url ?? getStockConversionProductImage(product)}
    meta={meta} name={product.name} variantValues={getVariantDisplayValues(variant, product.variant_attributes)}
  />;
}

function ExpiryQuantities({ row }: { row: Row }) {
  if (row.stock <= 0) return null;
  return <p aria-label={`Phân bổ HSD ${row.product.name}`} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-slate-600">
    {row.datedQuantity > 0 ? <span><strong className="tabular-nums text-slate-900">{row.datedQuantity}</strong> có HSD</span> : null}
    {row.datedQuantity > 0 && row.undatedQuantity > 0 ? <span aria-hidden="true">·</span> : null}
    {row.undatedQuantity > 0 ? <span><strong className="tabular-nums text-slate-900">{row.undatedQuantity}</strong> chưa có HSD</span> : null}
  </p>;
}

export function StockExpiryPage({ open, onClose }: Props) {
  const { canAccess } = useAuth();
  const { alertAction, confirmAction, showSuccess } = useActionNotice();
  const canView = canAccess("warehouse.expiry.view");
  const canAdd = canAccess("warehouse.expiry.create");
  const canEdit = canAccess("warehouse.expiry.update");
  const canDelete = canAccess("warehouse.expiry.delete");
  const canConfigure = canAccess("warehouse.expiry.settings");
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<ExpiryVariantState[]>([]);
  const [settings, setSettings] = useState<StockExpirySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [filter, setFilter] = useState<ExpiryFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AllocationForm | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warningDays, setWarningDays] = useState("30");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [today, setToday] = useState(stockExpiryToday);
  const pending = useRef(false);
  const partKey = useRef(0);
  const generation = useRef(0);
  const clearRequests = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    if (!canView) return;
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const [catalog, expiry] = await Promise.all([fetchProducts(), fetchStockExpiry()]);
      if (current !== generation.current) return;
      setProducts(catalog); setBalances(expiry.variants); setSettings(expiry.settings);
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : "Không tải được danh sách HSD.");
    } finally { if (current === generation.current) setLoading(false); }
  }, [canView]);

  useEffect(() => {
    if (open && canView) { void load(); setToday(stockExpiryToday()); }
    else {
      generation.current += 1;
      setForm(null); setSelectedId(null); setSettingsOpen(false); setScannerOpen(false);
      setQuery(""); setFilter("all"); setCategory("all"); setFiltersOpen(false); setActionError(""); clearRequests.current.clear();
    }
  }, [canView, load, open]);
  useEffect(() => {
    if (!open || !canView) return;
    const timer = window.setInterval(() => setToday(stockExpiryToday()), 30_000);
    const refreshDay = () => setToday(stockExpiryToday());
    window.addEventListener("focus", refreshDay);
    return () => { clearInterval(timer); window.removeEventListener("focus", refreshDay); };
  }, [canView, open]);

  const rows = useMemo<Row[]>(() => {
    const byVariant = new Map(balances.map((entry) => [entry.variant_id, entry]));
    return products.flatMap((product) => getProductModeVariants(product).flatMap((variant) => {
      const balance = byVariant.get(variant.id);
      const stock = balance?.stock_quantity ?? variant.stock_quantity;
      const summary = summarizeStockExpiry(balance?.lots ?? [], settings?.warning_days ?? 30, today);
      return variant.is_active || stock > 0 ? [{ product, variant, stock, ...summary, undatedQuantity: summary.groups.length ? summary.unknownQuantity : Math.max(0, stock) }] : [];
    })).sort((a, b) => expiryStatusOrder[a.status] - expiryStatusOrder[b.status] || a.product.name.localeCompare(b.product.name, "vi"));
  }, [balances, products, settings, today]);
  const categories = useMemo(() => [...new Map(products.map((product) => [product.category?.id ?? product.product_type?.id ?? "uncategorized", product.category?.name ?? product.product_type?.name ?? "Chưa phân loại"])).entries()].sort((a, b) => a[1].localeCompare(b[1], "vi")), [products]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const categoryRows = rows.filter(({ product, variant }) => (category === "all" || (product.category?.id ?? product.product_type?.id ?? "uncategorized") === category)
    && (!normalizedQuery || [product.name, product.category?.name, product.product_type?.name, variant.barcode, variant.sku, getVariantLabel(variant, product.variant_attributes)].some((value) => value?.toLocaleLowerCase("vi").includes(normalizedQuery))));
  const visible = categoryRows.filter((row) => filter === "all" || (filter === "undated" ? row.undatedQuantity > 0 : row.status === filter));
  const undatedCount = rows.filter((row) => row.undatedQuantity > 0).length;
  const selected = rows.find((row) => row.variant.id === selectedId);
  const activeFilters = Number(category !== "all") + Number(filter !== "all" && filter !== "undated");
  const allocated = form?.parts.reduce((sum, part) => sum + Number(part.quantity || 0), 0) ?? 0;
  const canSaveAllocation = canView && (form?.originalDate ? canEdit : canAdd);
  const allocationValid = Boolean(form && allocated > 0 && allocated <= form.quantity && form.parts.every((part) => part.date && Number.isSafeInteger(Number(part.quantity)) && Number(part.quantity) > 0));
  const validWarningDays = warningDays !== "" && Number.isInteger(Number(warningDays)) && Number(warningDays) >= 0 && Number(warningDays) <= 3650;

  function close() { if (!pending.current) onClose(); }
  function viewDetails(row: Row) { setActionError(""); setSelectedId(row.variant.id); }
  async function editExpiry(row: Row, group?: ExpiryGroup) {
    if (!canView || !(group?.date ? canEdit : canAdd) || pending.current) return;
    if (row.stock <= 0) {
      void alertAction({ title: "Chưa có tồn kho", message: "Hãy nhập kho trước, sau đó gắn HSD cho số hàng thực tế." });
      return;
    }
    pending.current = true; setSaving(true); setActionError("");
    try {
      const fresh = await prepareStockExpiry(row.variant.id);
      setBalances((current) => [...current.filter((entry) => entry.variant_id !== fresh.variant_id), fresh]);
      const summary = summarizeStockExpiry(fresh.lots, settings?.warning_days ?? 30, today);
      const lots = group?.date ? summary.dated.find((entry) => entry.date === group.date)?.lots ?? [] : summary.unknownLots;
      if (!lots.length) throw new Error("Phần hàng đã thay đổi hoặc không còn tồn. Hãy tải lại danh sách.");
      const quantity = lots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
      setFormError("");
      setForm({ product: row.product, variant: row.variant, lots, quantity, originalDate: group?.date ?? null,
        parts: [{ key: ++partKey.current, date: group?.date ?? "", quantity: String(quantity) }], requestId: createRequestId() });
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Không mở được nhập HSD."); }
    finally { pending.current = false; setSaving(false); }
  }
  function changeParts(parts: AllocationForm["parts"]) {
    if (!form) return;
    try { setForm({ ...form, parts, requestId: createRequestId() }); setFormError(""); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : "Không tạo được mã thao tác."); }
  }
  async function saveAllocation() {
    if (!form || !allocationValid || !canSaveAllocation || pending.current) return;
    pending.current = true; setSaving(true); setFormError("");
    try {
      await setStockExpiry(form.variant.id, form.lots, form.parts.map((part) => ({ expiry_date: part.date, quantity: Number(part.quantity) })), form.requestId);
      setForm(null); showSuccess("Đã lưu HSD. Số lượng tồn kho giữ nguyên."); await load();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Không lưu được HSD."); }
    finally { pending.current = false; setSaving(false); }
  }
  async function removeExpiry(row: Row, group: ExpiryGroup) {
    if (!canView || !canDelete || pending.current || !group.date) return;
    pending.current = true; setActionError("");
    try {
      const confirmed = await confirmAction({ title: "Xóa HSD?", tone: "danger", confirmLabel: "Xóa HSD", cancelLabel: "Giữ lại",
        message: `Xóa HSD ${expiryDateLabel(group.date)} của ${group.quantity} sản phẩm ${row.product.name}? Phần hàng này chuyển sang không theo dõi HSD. Số lượng tồn kho giữ nguyên.` });
      if (!confirmed) return;
      const signature = JSON.stringify([row.variant.id, group.lots.map(({ id, updated_at }) => ({ id, updated_at }))]);
      const requestId = clearRequests.current.get(signature) ?? createRequestId();
      clearRequests.current.set(signature, requestId);
      setSaving(true);
      await clearStockExpiry(row.variant.id, group.lots, requestId);
      clearRequests.current.delete(signature);
      showSuccess("Đã xóa HSD và ngừng theo dõi phần hàng này."); await load();
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Không xóa được HSD."); }
    finally { pending.current = false; setSaving(false); }
  }
  async function saveSettings() {
    if (!settings || !validWarningDays || !canView || !canConfigure || pending.current) return;
    pending.current = true; setSaving(true); setFormError("");
    try { setSettings(await saveStockExpirySettings(Number(warningDays), settings)); setSettingsOpen(false); showSuccess("Đã cập nhật mốc cảnh báo HSD."); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : "Không lưu được cài đặt."); }
    finally { pending.current = false; setSaving(false); }
  }
  function scan(value: string) {
    const code = normalizeEan13Input(value);
    if (!isValidEan13(code)) { void alertAction({ title: "EAN-13 không hợp lệ", message: "Vui lòng quét lại mã EAN-13 của sản phẩm." }); return; }
    setScannerOpen(false); setQuery(code); setCategory("all"); setFilter("all");
  }

  if (!canView) return null;

  return <>
    <Modal bodyClassName="!p-0" footer={<Button className="w-full sm:w-auto" disabled={saving} onClick={close} variant="secondary">Đóng</Button>}
      headerAction={<div className="ml-auto flex shrink-0 items-center gap-1">
        <button aria-label="Tải lại HSD và tồn kho" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-50" disabled={loading || saving} onClick={() => void load()} title="Tải lại HSD và tồn kho" type="button"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        {canConfigure ? <button aria-label="Cài đặt cảnh báo HSD" className="grid h-9 w-9 place-items-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-50" disabled={loading || saving || !settings} onClick={() => { setWarningDays(String(settings?.warning_days ?? 30)); setFormError(""); setSettingsOpen(true); }} title="Cài đặt cảnh báo HSD" type="button"><Settings aria-hidden="true" className="h-5 w-5" /></button> : null}
      </div>} onClose={close} open={open} size="wide" title="Quản lý HSD">
      <div className="sticky top-0 z-10 space-y-2 border-b border-slate-100 bg-white px-3 pb-3 pt-1 sm:px-6 sm:pt-3">
        <div className="flex gap-3 border-b border-slate-100">
          <button aria-pressed={filter !== "undated"} className={`border-b-2 px-1 py-2 text-xs font-bold sm:text-sm ${filter !== "undated" ? "border-moss-600 text-moss-700" : "border-transparent text-slate-500"}`} onClick={() => setFilter("all")} type="button">Tất cả ({rows.length})</button>
          <button aria-pressed={filter === "undated"} className={`border-b-2 px-1 py-2 text-xs font-bold sm:text-sm ${filter === "undated" ? "border-moss-600 text-moss-700" : "border-transparent text-slate-500"}`} onClick={() => setFilter("undated")} type="button">Chưa có HSD ({undatedCount})</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label="Tìm sản phẩm theo tên, biến thể hoặc EAN-13" className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Tên hoặc EAN-13..." value={query} /></label>
          <Button aria-label="Quét EAN-13" className="h-10 w-10 shrink-0 !p-0" disabled={saving} onClick={() => setScannerOpen(true)} title="Quét EAN-13" variant="secondary"><Barcode aria-hidden="true" className="h-5 w-5" /></Button>
          <Button aria-expanded={filtersOpen} aria-label="Bộ lọc HSD" className={`relative h-10 w-10 shrink-0 !p-0 sm:!hidden ${activeFilters ? "!bg-moss-50 !text-moss-800" : ""}`} onClick={() => setFiltersOpen((value) => !value)} title="Bộ lọc HSD" variant="secondary"><SlidersHorizontal aria-hidden="true" className="h-4 w-4" />{activeFilters ? <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-moss-700 text-[9px] text-white">{activeFilters}</span> : null}</Button>
        </div>
        <div className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 gap-2 sm:grid`}>
          <Select aria-label="Lọc danh mục" onChange={(event) => setCategory(event.target.value)} value={category}><option value="all">Tất cả danh mục</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
          <Select aria-label="Lọc HSD" onChange={(event) => setFilter(event.target.value as ExpiryFilter)} value={filter}><option value="all">Tất cả HSD</option>{(["expired", "warning", "valid"] as const).map((status) => <option key={status} value={status}>{expiryStatusLabels[status]}</option>)}<option value="undated">Chưa có HSD</option></Select>
        </div>
        {activeFilters ? <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500"><span>{visible.length} SKU phù hợp</span><button className="text-moss-700 underline" onClick={() => { setCategory("all"); setFilter("all"); }} type="button">Bỏ bộ lọc</button></div> : null}
        {!selected && actionError ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{actionError}</p> : null}
      </div>
      <div className="space-y-2 bg-slate-50/50 p-3 sm:p-4">
        {loading ? <div className="p-10"><Spinner label="Đang tải HSD..." /></div> : error ? <div className="space-y-3"><p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p><Button onClick={() => void load()} variant="secondary">Tải lại</Button></div> : !visible.length ? <EmptyState description="Thử thay đổi từ khóa hoặc bộ lọc." icon={Search} title="Không có sản phẩm phù hợp" /> : visible.map((row) => {
          const nearest = row.dated[0];
          return <article className={`overflow-hidden rounded-xl border ${expiryRowColors[row.status]}`} key={row.variant.id}>
            <span className="sr-only">{row.status === "pending" || row.status === "untracked" ? "Chưa có HSD" : expiryStatusLabels[row.status]}</span>
            <button aria-label={`Xem HSD ${row.product.name} · ${getVariantLabel(row.variant, row.product.variant_attributes)}`} className="grid w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-2 p-3 text-left transition hover:bg-black/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-moss-600" disabled={saving} onClick={() => viewDetails(row)} type="button">
              <ProductInfo product={row.product} variant={row.variant} /><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-500" />
            </button>
            <div className="space-y-1.5 px-3 pb-3 text-xs font-semibold">
              <div className="flex flex-wrap items-center justify-between gap-2"><span>{nearest ? <>HSD <strong>{expiryDateLabel(nearest.date)}</strong>{row.dated.length > 1 ? <span className="ml-1.5 text-slate-500">+{row.dated.length - 1} HSD</span> : null}</> : row.stock <= 0 ? "Chưa có tồn kho" : "Chưa có HSD"}</span><span className="whitespace-nowrap">Tồn <strong className="text-sm tabular-nums">{row.stock}</strong></span></div>
              <div className="flex flex-wrap items-center justify-between gap-2"><ExpiryQuantities row={row} />{canAdd && row.undatedQuantity > 0 ? <Button aria-label={`Nhập HSD ${row.product.name}`} className="!min-h-8 !px-2 !py-1 !text-xs" disabled={saving} onClick={() => void editExpiry(row)} variant="secondary">Nhập HSD</Button> : null}</div>
            </div>
          </article>;
        })}
      </div>
    </Modal>

    <Modal footer={<div className="flex w-full gap-2 sm:w-auto"><Button className="flex-1 sm:flex-none" disabled={saving} onClick={() => setSelectedId(null)} variant="secondary">Đóng</Button>{canAdd && selected && selected.stock > 0 && (selected.unknownQuantity > 0 || !selected.groups.length) ? <Button className="flex-1 !bg-moss-700 !text-white sm:flex-none" isLoading={saving} onClick={() => void editExpiry(selected)}>Nhập HSD</Button> : null}</div>}
      onClose={() => { if (!pending.current) setSelectedId(null); }} open={open && Boolean(selected)} size="lg" title="Chi tiết HSD">
      {selected ? <div className="space-y-4">
        <ProductInfo meta={<div className="space-y-1"><p className="text-xs font-bold text-slate-600">Tồn kho: {selected.stock}</p><ExpiryQuantities row={selected} /></div>} product={selected.product} variant={selected.variant} />
        {actionError || error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{actionError || error}</p> : null}
        {!selected.groups.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">{selected.stock > 0 ? "Chưa có HSD. Chọn Nhập HSD để gắn ngày cho số hàng đang tồn." : "Chưa có hàng tồn. Nhập kho trước để gắn HSD."}</p> : selected.displayGroups.map((group) => <section className={`rounded-xl border p-3 ${expiryRowColors[group.status]}`} key={group.key}>
          <div className="flex items-center justify-between gap-3 text-sm font-extrabold"><span>{group.date ? expiryDateLabel(group.date) : "Chưa có HSD"}</span><span className="whitespace-nowrap tabular-nums">{group.quantity}</span></div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{group.date ? remainingLabel(group.date, today) : canAdd ? "Chọn Nhập HSD để bổ sung ngày." : "Chưa nhập ngày hạn sử dụng."}</span>
            {group.date && (canEdit || canDelete) ? <div className="flex shrink-0 gap-1">{canEdit ? <Button aria-label={`Sửa HSD ${expiryDateLabel(group.date)}`} className="h-10 w-10 !p-0" disabled={saving} onClick={() => void editExpiry(selected, group)} title="Sửa HSD" variant="ghost"><Pencil aria-hidden="true" className="h-4 w-4" /></Button> : null}{canDelete ? <Button aria-label={`Xóa HSD ${expiryDateLabel(group.date)}`} className="h-10 w-10 !p-0 !text-red-700" disabled={saving} onClick={() => void removeExpiry(selected, group)} title="Xóa HSD" variant="ghost"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button> : null}</div> : null}
          </div>
          <details className="mt-2 border-t border-black/5 pt-2 text-xs font-semibold"><summary className="cursor-pointer text-slate-500">Nguồn hàng</summary><div className="mt-2 space-y-2">{group.lots.map((lot) => <div className="flex flex-wrap items-center justify-between gap-2" key={lot.id}><span>{lot.origin.startsWith("opening") ? "Tồn ban đầu" : lot.origin === "conversion" ? "Quy đổi" : "Nhập"}{lot.import_date ? ` · ${expiryDateLabel(lot.import_date)}` : ""}</span><span className="tabular-nums">Còn {lot.remaining_quantity}</span></div>)}</div></details>
        </section>)}
      </div> : null}
    </Modal>

    <Modal footer={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button disabled={saving} onClick={() => setForm(null)} variant="secondary">Hủy</Button><Button className="!bg-moss-700 !text-white" disabled={!allocationValid} isLoading={saving} onClick={() => void saveAllocation()}>Lưu HSD</Button></div>}
      onClose={() => { if (!pending.current) setForm(null); }} open={open && canSaveAllocation && Boolean(form)} size="lg" title={form?.originalDate ? "Sửa HSD" : "Nhập HSD"}>
      {form ? <div className="space-y-4">
        <ProductInfo meta={<p className="text-xs font-bold text-slate-600">Có thể phân bổ: {form.quantity}</p>} product={form.product} variant={form.variant} />
        <div className="space-y-3">{form.parts.map((part) => <div className="grid grid-cols-[minmax(0,1fr)_36px] items-end gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_110px_36px] [&>label]:min-w-0" key={part.key}>
          <div className="col-span-2 min-w-0 sm:col-span-1"><Input className="min-w-0 !px-2" disabled={saving} label="Hạn sử dụng" onChange={(event) => changeParts(form.parts.map((item) => item.key === part.key ? { ...item, date: event.target.value } : item))} type="date" value={part.date} /></div>
          <Input className="!px-2" disabled={saving} inputMode="numeric" label="Số lượng" onChange={(event) => changeParts(form.parts.map((item) => item.key === part.key ? { ...item, quantity: normalizeIntegerInput(event.target.value) } : item))} value={formatIntegerInput(part.quantity)} />
          <Button aria-label="Bỏ dòng đang nhập" className="!min-h-11 !px-0" disabled={saving || form.parts.length === 1} onClick={() => changeParts(form.parts.filter((item) => item.key !== part.key))} variant="ghost"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
        </div>)}</div>
        <Button disabled={saving} onClick={() => changeParts([...form.parts, { key: ++partKey.current, date: "", quantity: "" }])} variant="secondary"><Plus aria-hidden="true" className="h-4 w-4" />Thêm HSD</Button>
        <div className={`rounded-xl p-3 text-sm font-extrabold ${allocated > form.quantity ? "bg-red-50 text-red-700" : "bg-moss-50 text-moss-800"}`}>
          <p>Phân bổ: {allocated} / {form.quantity}</p>
          {allocated < form.quantity ? <p className="mt-1 text-xs font-semibold">Còn {form.quantity - allocated} {form.originalDate ? `giữ HSD ${expiryDateLabel(form.originalDate)}` : "chưa có HSD, có thể nhập sau"}.</p> : null}
        </div>
        {formError ? <div className="space-y-2"><p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{formError}</p><Button disabled={saving} onClick={() => { setForm(null); void load(); }} variant="secondary">Tải lại số lượng</Button></div> : null}
      </div> : null}
    </Modal>

    <Modal footer={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button disabled={saving} onClick={() => setSettingsOpen(false)} variant="secondary">Hủy</Button><Button className="!bg-moss-700 !text-white" disabled={!validWarningDays} isLoading={saving} onClick={() => void saveSettings()}>Lưu cài đặt</Button></div>}
      onClose={() => { if (!pending.current) setSettingsOpen(false); }} open={open && canConfigure && settingsOpen} size="md" title="Cài đặt cảnh báo HSD">
      <div className="space-y-4"><Input disabled={saving} inputMode="numeric" label="Cảnh báo khi còn không quá (ngày)" onChange={(event) => { setWarningDays(normalizeIntegerInput(event.target.value)); setFormError(""); }} value={warningDays} />
        <div className="space-y-2 text-sm"><p className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Còn hạn: trên {warningDays || "0"} ngày.</p><p className="rounded-xl bg-yellow-50 p-3 text-yellow-900">Cảnh báo: từ 0 đến {warningDays || "0"} ngày.</p><p className="rounded-xl bg-red-50 p-3 text-red-900">Hết hạn: đã qua ngày HSD.</p></div>
        {!validWarningDays ? <p className="text-sm font-semibold text-red-700">Nhập số ngày từ 0 đến 3650.</p> : null}
        {formError ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{formError}</p> : null}
      </div>
    </Modal>
    <Ean13ScannerModal description="Quét mã để tìm nhanh sản phẩm trong danh sách HSD." onClose={() => setScannerOpen(false)} onDetected={scan} open={open && scannerOpen} title="Quét EAN-13" />
  </>;
}
