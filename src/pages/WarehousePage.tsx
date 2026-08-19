import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Boxes, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Trash2, X } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { SearchInput } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
import { getInventoryDifferenceStatus, type InventoryAuditSession } from "../lib/inventoryAudits";
import { getProductEan13Value } from "../lib/productDisplay";
import { deleteInventoryAudit, fetchInventoryAudits } from "../services/inventoryAudits";
import { fetchProducts } from "../services/products";
import type { Product } from "../types";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });
function differenceLabel(value: number) { return value < 0 ? `Thiếu ${Math.abs(value)}` : value > 0 ? `Thừa ${value}` : "Khớp"; }
function differenceTone(value: number): "amber" | "green" | "red" { const status = getInventoryDifferenceStatus(value); return status === "short" ? "red" : status === "over" ? "amber" : "green"; }

type WarehousePageProps = { mode: "products" | "audits" };
type AuditFilter = "all" | "matched" | "mismatched";

export function WarehousePage({ mode }: WarehousePageProps) {
  const { canAccess } = useAuth();
  const { confirmAction, showSuccess } = useActionNotice();
  const [audits, setAudits] = useState<InventoryAuditSession[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [auditDate, setAuditDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const auditDateInputRef = useRef<HTMLInputElement>(null);
  const { clearErrorNotice, errorNotice, showErrorNotice } = useErrorNotice();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "products") setProducts(await fetchProducts());
      else {
        const [nextProducts, nextAudits] = await Promise.all([fetchProducts(), fetchInventoryAudits()]);
        setProducts(nextProducts); setAudits(nextAudits);
      }
    } catch (requestError) {
      showErrorNotice(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu kho.", mode === "products" ? "Không tải được sản phẩm" : "Không tải được lịch sử kiểm kê");
    } finally { setLoading(false); }
  }, [mode, showErrorNotice]);
  useEffect(() => { void load(); }, [load]);

  const inventoryRows = useMemo(() => products.flatMap((product) => {
    const attributes = product.attributes && typeof product.attributes === "object" && !Array.isArray(product.attributes) ? product.attributes as Record<string, unknown> : {};
    const hasEngineVariants = Array.isArray(attributes._variants);
    const variants = hasEngineVariants ? attributes._variants as Array<{ display_label?: string; image_url?: string; linked_values?: { _variant_id?: string; sku?: string }; stock?: number; values?: Record<string, string | string[]> }> : [];
    if (!hasEngineVariants) return [product];
    if (!variants.length) return [];
    return variants.map((variant, index) => {
      const rawValues = Object.values(variant.values ?? {}).flat().filter(Boolean).join(" / ");
      const values = variant.display_label && variant.display_label !== "Mặc định" ? variant.display_label : rawValues;
      return { ...product, id: variant.linked_values?._variant_id ?? `${product.id}-${index}`, image_url: variant.image_url ?? product.image_url, name: values ? `${product.name} · ${values}` : product.name, sku: variant.linked_values?.sku ?? product.sku, stock: Math.max(0, Number(variant.stock) || 0) };
    });
  }), [products]);
  const selectedAudit = audits.find((audit) => audit.id === selectedAuditId) ?? null;
  const rowsById = useMemo(() => new Map(inventoryRows.map((row) => [row.id, row])), [inventoryRows]);
  const comparisonRows = useMemo(() => selectedAudit?.lines.map((line) => {
    const product = line.productId ? rowsById.get(line.productId) : undefined;
    const systemStock = line.systemStock ?? product?.stock ?? 0;
    const canCompare = line.systemStock !== null || Boolean(product);
    return { ...line, canCompare, product, systemStock, difference: line.counted - systemStock };
  }) ?? [], [rowsById, selectedAudit]);
  const comparisonStats = useMemo(() => comparisonRows.reduce((stats, row) => ({ matched: stats.matched + +(row.difference === 0), short: stats.short + +(row.difference < 0), over: stats.over + +(row.difference > 0) }), { matched: 0, short: 0, over: 0 }), [comparisonRows]);
  const auditMismatchById = useMemo(() => new Map(audits.map((audit) => [audit.id, audit.lines.some((line) => {
    const product = line.productId ? rowsById.get(line.productId) : undefined;
    const systemStock = line.systemStock ?? product?.stock;
    return systemStock === undefined || line.counted !== systemStock;
  })])), [audits, rowsById]);
  const dateFilteredAudits = useMemo(() => audits.filter((audit) => {
    if (!auditDate) return true;
    const date = new Date(audit.createdAt);
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return localDate === auditDate;
  }), [auditDate, audits]);
  const auditFilterCounts = useMemo(() => ({
    all: dateFilteredAudits.length,
    matched: dateFilteredAudits.filter((audit) => !auditMismatchById.get(audit.id)).length,
    mismatched: dateFilteredAudits.filter((audit) => auditMismatchById.get(audit.id)).length,
  }), [auditMismatchById, dateFilteredAudits]);
  const visibleAudits = useMemo(() => dateFilteredAudits.filter((audit) => auditFilter === "all" || (auditFilter === "mismatched" ? auditMismatchById.get(audit.id) : !auditMismatchById.get(audit.id))), [auditFilter, auditMismatchById, dateFilteredAudits]);
  const auditDateLabel = auditDate ? auditDate.split("-").reverse().join("/") : "Chọn ngày kiểm kê";
  const totalStock = useMemo(() => inventoryRows.reduce((sum, row) => sum + Math.max(0, row.stock), 0), [inventoryRows]);
  const categories = useMemo(() => Array.from(new Set(inventoryRows.map((product) => product.category?.trim() || "Chưa phân loại"))).sort((a, b) => a.localeCompare(b, "vi")), [inventoryRows]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(() => inventoryRows.filter((product) => (categoryFilter === "all" || (product.category?.trim() || "Chưa phân loại") === categoryFilter) && (!normalizedQuery || [product.name, product.sku, getProductEan13Value(product)].filter(Boolean).some((value) => String(value).toLocaleLowerCase("vi").includes(normalizedQuery)))).sort((a, b) => a.name.localeCompare(b.name, "vi")), [categoryFilter, inventoryRows, normalizedQuery]);
  const visibleStock = useMemo(() => visibleProducts.reduce((sum, product) => sum + Math.max(0, product.stock), 0), [visibleProducts]);

  async function removeAudit() {
    if (!selectedAudit || !canAccess("warehouse.audit.delete")) return;
    const confirmed = await confirmAction({ title: "Xóa phiên kiểm kê", message: "Phiên kiểm kê sẽ bị xóa vĩnh viễn và không thể khôi phục.", confirmLabel: "Xóa phiên", tone: "danger" });
    if (!confirmed) return;
    setDeleting(true);
    try { await deleteInventoryAudit(selectedAudit.id); setAudits((current) => current.filter((audit) => audit.id !== selectedAudit.id)); setSelectedAuditId(""); showSuccess("Đã xóa phiên kiểm kê."); }
    catch (requestError) { showErrorNotice(requestError instanceof Error ? requestError.message : "Không xóa được phiên kiểm kê.", "Không xóa được kiểm kê"); }
    finally { setDeleting(false); }
  }

  function openAuditDatePicker() {
    const input = auditDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  return <>
    {mode === "products" ? <section aria-label="Danh sách sản phẩm trong kho">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:px-6">
        <div className="min-w-0 flex-1 space-y-2">
          <SearchInput onChange={setQuery} placeholder="Tìm tên, SKU hoặc EAN-13..." value={query} />
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {["all", ...categories].map((category) => <button className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition ${categoryFilter === category ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} key={category} onClick={() => setCategoryFilter(category)} type="button">{category === "all" ? "Tất cả" : category}</button>)}
          </div>
        </div>
        <p className="shrink-0 text-xs font-bold tabular-nums text-slate-500"><strong className="text-slate-950">{visibleProducts.length}</strong> SKU · <strong className="text-moss-700">{categoryFilter === "all" && !normalizedQuery ? totalStock : visibleStock}</strong> sản phẩm</p>
      </div>
      {loading ? <div className="p-12"><Spinner label="Đang tải sản phẩm..." /></div> : !visibleProducts.length ? <div className="p-5"><EmptyState description="Không có sản phẩm phù hợp với từ khóa." icon={Boxes} title="Không tìm thấy sản phẩm" /></div> : <div className="divide-y divide-slate-100">
        {visibleProducts.map((product) => {
          const stockTone = product.stock <= 0 ? "bg-red-50 text-red-700" : product.stock <= 5 ? "bg-amber-50 text-amber-700" : "bg-moss-50 text-moss-700";
          return <article className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50 sm:grid-cols-[48px_minmax(0,1fr)_110px] sm:px-6" key={product.id}>
            <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">{product.image_url ? <img alt="" className="h-full w-full object-contain p-1" src={product.image_url} /> : <Boxes className="h-5 w-5" />}</span>
            <div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{product.sku || "Chưa có SKU"}{getProductEan13Value(product) ? ` · EAN ${getProductEan13Value(product)}` : ""}</p></div>
            <div className={`min-w-20 rounded-xl px-2 py-1.5 text-center ${stockTone}`}><span className="block text-[9px] font-black uppercase tracking-wide">Tồn kho</span><strong className="text-sm tabular-nums">{product.stock} sản phẩm</strong></div>
          </article>;
        })}
      </div>}
    </section> : null}

    {mode === "audits" ? <section aria-label="Danh sách phiên kiểm kê">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {([
            { key: "all", label: "Tất cả", count: auditFilterCounts.all },
            { key: "matched", label: "Đã khớp", count: auditFilterCounts.matched },
            { key: "mismatched", label: "Chênh lệch", count: auditFilterCounts.mismatched },
          ] as const).map((filter) => <button className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-extrabold transition ${auditFilter === filter.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`} key={filter.key} onClick={() => setAuditFilter(filter.key)} type="button"><span className="truncate">{filter.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${auditFilter === filter.key ? filter.key === "mismatched" && filter.count ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600" : "bg-white/60 text-slate-500"}`}>{filter.count}</span></button>)}
        </div>
        <div className="mt-2 w-full">
          <div className={`flex h-11 w-full min-w-0 items-center overflow-hidden rounded-xl border transition ${auditDate ? "border-slate-300 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <button aria-label="Chọn ngày kiểm kê" className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left" onClick={openAuditDatePicker} type="button">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${auditDate ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}><CalendarDays className="h-3.5 w-3.5" /></span>
              <span className={`min-w-0 flex-1 truncate text-sm font-extrabold ${auditDate ? "text-slate-900" : "text-slate-500"}`}>{auditDateLabel}</span>
              <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:block">Nhấn để chọn</span>
            </button>
            {auditDate ? <button aria-label="Bỏ lọc ngày" className="relative z-10 grid h-full w-10 shrink-0 place-items-center border-l border-slate-200 text-slate-400 transition hover:bg-white hover:text-slate-900" onClick={() => setAuditDate("")} type="button"><X className="h-4 w-4" /></button> : null}
          </div>
          <input aria-label="Ngày kiểm kê" className="pointer-events-none absolute h-px w-px opacity-0" onChange={(event) => setAuditDate(event.target.value)} ref={auditDateInputRef} tabIndex={-1} type="date" value={auditDate} />
        </div>
      </div>
      {loading ? <div className="p-12"><Spinner label="Đang tải lịch sử kiểm kê..." /></div> : !audits.length ? <div className="p-5"><EmptyState description="Các phiên hoàn tất sẽ xuất hiện tại đây." icon={ClipboardCheck} title="Chưa có phiên kiểm kê" /></div> : !visibleAudits.length ? <div className="p-5"><EmptyState description="Không có phiên kiểm kê thuộc trạng thái này." icon={ClipboardCheck} title="Không có kết quả" /></div> : <div className="divide-y divide-slate-100">
        {visibleAudits.map((audit) => {
          const mismatched = auditMismatchById.get(audit.id) ?? false;
          return <button className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-6" key={audit.id} onClick={() => setSelectedAuditId(audit.id)} type="button"><span aria-label={mismatched ? "Có chênh lệch" : "Đã khớp"} className={`grid h-10 w-10 place-items-center rounded-xl ${mismatched ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>{mismatched ? <AlertCircle className="h-5 w-5" strokeWidth={2.5} /> : <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />}</span><span className="min-w-0"><strong className="block truncate text-sm text-slate-950">{dateTimeFormatter.format(new Date(audit.createdAt))}</strong><span className={`mt-0.5 block truncate text-xs font-semibold ${mismatched ? "text-red-600" : "text-slate-500"}`}>{audit.staffName} · {audit.lines.length} sản phẩm{mismatched ? " · Có chênh lệch" : " · Đã khớp"}</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></button>;
        })}
      </div>}
    </section> : null}

    <Modal footer={<div className="flex w-full justify-between gap-2"><div>{canAccess("warehouse.audit.delete") ? <Button isLoading={deleting} onClick={() => void removeAudit()} variant="danger"><Trash2 className="h-4 w-4" />Xóa phiên</Button> : null}</div><Button onClick={() => setSelectedAuditId("")} variant="secondary">Đóng</Button></div>} onClose={() => setSelectedAuditId("")} open={mode === "audits" && Boolean(selectedAudit)} size="lg" title="Chi tiết phiên kiểm kê">
      {selectedAudit ? <div className="space-y-4"><div><p className="font-extrabold text-slate-950">{dateTimeFormatter.format(new Date(selectedAudit.createdAt))}</p><p className="mt-1 text-sm font-semibold text-slate-500">Thực hiện bởi {selectedAudit.staffName}</p></div><div className="flex flex-wrap gap-1.5"><Badge tone="neutral">{comparisonRows.length} đã kiểm</Badge><Badge tone="green">{comparisonStats.matched} khớp</Badge><Badge tone="red">{comparisonStats.short} thiếu</Badge><Badge tone="amber">{comparisonStats.over} thừa</Badge></div><div className="divide-y divide-slate-100">{comparisonRows.map((row) => <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3" key={row.productId ?? `${selectedAudit.id}-${row.ean13}`}><div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-950">{row.product?.name ?? row.productName}</p><p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{row.ean13 || "Không có mã"}</p><p className="mt-1 text-xs font-bold text-slate-600">Tồn lúc kiểm: {row.canCompare ? row.systemStock : "—"} · Đã đếm: {row.counted}</p></div>{row.canCompare ? <Badge className="self-center" tone={differenceTone(row.difference)}>{differenceLabel(row.difference)}</Badge> : <Badge className="self-center" tone="neutral">Không đối chiếu</Badge>}</article>)}</div></div> : null}
    </Modal>
    <ErrorNoticeModal notice={errorNotice} onClose={clearErrorNotice} />
  </>;
}
