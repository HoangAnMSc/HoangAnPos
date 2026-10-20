import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ArrowLeftRight, ArrowRight, Plus, Search, Trash2 } from "lucide-react";
import { ConversionProductCard } from "../components/warehouse/ConversionProductCard";
import { StockConversionProductPicker } from "../components/warehouse/StockConversionProductPicker";
import { ProductThumbnail } from "../components/products/ProductThumbnail";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { fetchProducts } from "../features/products/services/productEngine";
import { productEngineClient } from "../features/products/services/client";
import type { Product, ProductVariant } from "../features/products/types";
import { getActiveProductModeVariants, getVariantDisplayValues, getVariantLabel } from "../features/products/utils/variants";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { createStockConversionRequestId, getConversionQuantity, getStockConversionProductImage, MAX_STOCK_QUANTITY } from "../lib/stockConversions";
import { deleteStockConversion, executeStockConversion, fetchStockConversions, saveStockConversion, type StockConversion } from "../services/stockConversions";

type SetupForm = { id?: string; updated_at?: string; productId: string; variantA: string; quantityA: string; variantB: string; quantityB: string };
type ExecutionForm = { conversionId: string; reversed: boolean; quantity: string; note: string; requestId: string };
type Props = { open: boolean; onClose: () => void };

function variantLabel(product: Product, id: string) {
  const variant = product.variants.find((item) => item.id === id);
  if (!variant) return "Biến thể không còn hoạt động";
  const label = getVariantLabel(variant, product.variant_attributes);
  return label === "Mặc định" ? variant.sku : label;
}

function ratioSides(product: Product, conversion: StockConversion) {
  return {
    source: `${conversion.quantity_a} ${variantLabel(product, conversion.variant_a_id)}`,
    target: `${conversion.quantity_b} ${variantLabel(product, conversion.variant_b_id)}`,
  };
}

function ratioLabel(product: Product, conversion: StockConversion) {
  const { source, target } = ratioSides(product, conversion);
  return `${source} ↔ ${target}`;
}

function setupForm(conversion?: StockConversion): SetupForm {
  return conversion ? { id: conversion.id, updated_at: conversion.updated_at, productId: conversion.product_id, variantA: conversion.variant_a_id, quantityA: String(conversion.quantity_a), variantB: conversion.variant_b_id, quantityB: String(conversion.quantity_b) }
    : { productId: "", variantA: "", quantityA: "1", variantB: "", quantityB: "", };
}

function SwapIcon({ className = "" }: { className?: string }) {
  return <><ArrowDownUp aria-hidden="true" className={`h-5 w-5 sm:hidden ${className}`} /><ArrowLeftRight aria-hidden="true" className={`hidden h-5 w-5 sm:block ${className}`} /></>;
}

function ConversionPreview({ source, target, bidirectional = true }: { source: string; target: string; bidirectional?: boolean }) {
  const Icon = bidirectional ? ArrowLeftRight : ArrowRight;
  return <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-moss-50 p-3 text-center text-sm font-extrabold text-moss-800">
    <span className="min-w-0 [overflow-wrap:anywhere]">{source}</span>
    <span className="flex shrink-0 items-center justify-center"><Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><span className="sr-only">{bidirectional ? "tương đương hai chiều với" : "quy đổi thành"}</span></span>
    <span className="min-w-0 [overflow-wrap:anywhere]">{target}</span>
  </div>;
}

function VariantDetails({ product, variant }: { product: Product; variant: ProductVariant }) {
  const values = getVariantDisplayValues(variant, product.variant_attributes);
  return <>
    <div className="flex min-w-0 flex-wrap gap-1.5">{values.length ? values.map((value) => <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-xs font-extrabold text-slate-700" key={value.id}>{value.color ? <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: value.color }} /> : null}<span className="min-w-0 [overflow-wrap:anywhere]">{value.label}</span></span>) : <span className="text-xs font-bold text-slate-600">{variant.sku}</span>}</div>
    <p className="mt-2 text-[11px] font-medium tabular-nums text-slate-500 [overflow-wrap:anywhere]">EAN-13: {variant.barcode || "Chưa có mã"}</p>
  </>;
}

export function StockConversionPage({ open, onClose }: Props) {
  const { canAccess } = useAuth();
  const { confirmAction, showSuccess } = useActionNotice();
  const canConfigure = canAccess("warehouse.conversion.configure");
  const canExecute = canAccess("warehouse.conversion.execute");
  const [tab, setTab] = useState<"execute" | "configure">("execute");
  const [products, setProducts] = useState<Product[]>([]);
  const [conversions, setConversions] = useState<StockConversion[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState<SetupForm | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [execution, setExecution] = useState<ExecutionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mutationPending = useRef(false);
  const stockRefresh = useRef(0);
  const activeTab = tab === "configure" ? canConfigure ? "configure" : "execute" : canExecute ? "execute" : "configure";

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextProducts, nextConversions] = await Promise.all([fetchProducts(), fetchStockConversions()]);
      setProducts(nextProducts); setConversions(nextConversions);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không tải được danh sách quy đổi."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open && (canConfigure || canExecute)) void load();
    if (!open) { setForm(null); setProductPickerOpen(false); setExecution(null); setQuery(""); setFormError(""); stockRefresh.current += 1; }
  }, [canConfigure, canExecute, load, open]);

  const eligibleProducts = useMemo(() => products.filter((product) => product.status === "active" && getActiveProductModeVariants(product).length > 1), [products]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const byProduct = useMemo(() => {
    const grouped = new Map<string, StockConversion[]>();
    for (const conversion of conversions) {
      const product = productById.get(conversion.product_id);
      if (!product) continue;
      const activeIds = new Set(getActiveProductModeVariants(product).map((variant) => variant.id));
      if (activeTab === "execute" && (product.status !== "active" || !activeIds.has(conversion.variant_a_id) || !activeIds.has(conversion.variant_b_id))) continue;
      grouped.set(product.id, [...(grouped.get(product.id) ?? []), conversion]);
    }
    return grouped;
  }, [activeTab, conversions, productById]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = (activeTab === "configure" ? products : eligibleProducts).filter((product) => byProduct.has(product.id) && (!normalizedQuery || [product.name, product.category?.name, ...product.variants.flatMap((variant) => [variant.sku, variant.barcode, variantLabel(product, variant.id)])].some((value) => value?.toLocaleLowerCase("vi").includes(normalizedQuery))));
  const savedSetup = form?.id ? conversions.find((conversion) => conversion.id === form.id) : undefined;
  const setupPending = saving || deleting;
  const editingProduct = form ? productById.get(form.productId) : undefined;
  const editingImage = editingProduct ? getStockConversionProductImage(editingProduct) : null;
  const editingVariants = editingProduct ? getActiveProductModeVariants(editingProduct) : [];
  const editingA = editingProduct?.variants.find((variant) => variant.id === form?.variantA);
  const editingB = editingProduct?.variants.find((variant) => variant.id === form?.variantB);
  const selectedConversion = execution ? conversions.find((item) => item.id === execution.conversionId) : undefined;
  const executingProduct = selectedConversion ? productById.get(selectedConversion.product_id) : undefined;
  const executingImage = executingProduct ? getStockConversionProductImage(executingProduct) : null;
  const sourceId = selectedConversion && (execution?.reversed ? selectedConversion.variant_b_id : selectedConversion.variant_a_id);
  const targetId = selectedConversion && (execution?.reversed ? selectedConversion.variant_a_id : selectedConversion.variant_b_id);
  const source = executingProduct?.variants.find((variant) => variant.id === sourceId);
  const target = executingProduct?.variants.find((variant) => variant.id === targetId);
  const sourceRatio = selectedConversion ? execution?.reversed ? selectedConversion.quantity_b : selectedConversion.quantity_a : 1;
  const targetRatio = selectedConversion ? execution?.reversed ? selectedConversion.quantity_a : selectedConversion.quantity_b : 1;
  const quantity = Number(execution?.quantity);
  const received = getConversionQuantity(quantity, sourceRatio, targetRatio);
  const quantityError = execution?.quantity ? received === null ? `Nhập số lượng là bội số của ${sourceRatio} và không vượt giới hạn tồn kho.`
    : source && quantity > source.stock_quantity ? `Không đủ tồn kho. Hiện còn ${source.stock_quantity}.`
    : target && target.stock_quantity + received > MAX_STOCK_QUANTITY ? "Tồn sau quy đổi vượt giới hạn cho phép." : "" : "";

  function close() { if (!mutationPending.current) { stockRefresh.current += 1; onClose(); } }
  function edit(conversion: StockConversion) { setFormError(""); setForm(setupForm(conversion)); }
  function selectSetupProduct(product: Product) {
    setFormError("");
    setForm((current) => current?.productId === product.id ? current : { ...setupForm(), id: current?.id, updated_at: current?.updated_at, productId: product.id });
    setProductPickerOpen(false);
  }

  async function refreshProductStock(productId: string) {
    const generation = ++stockRefresh.current;
    setRefreshing(true); setFormError("");
    try {
      const [{ data, error: requestError }, latestConversions] = await Promise.all([
        productEngineClient.from("product_variants").select("id,stock_quantity").eq("product_id", productId),
        fetchStockConversions(),
      ]);
      if (requestError) throw new Error(requestError.message);
      if (generation !== stockRefresh.current) return;
      const stocks = new Map((data ?? []).map((row) => [String(row.id), Number(row.stock_quantity)]));
      setConversions(latestConversions);
      setProducts((current) => current.map((product) => product.id === productId ? { ...product, variants: product.variants.map((variant) => ({ ...variant, stock_quantity: stocks.get(variant.id) ?? variant.stock_quantity })) } : product));
    } catch (requestError) { if (generation === stockRefresh.current) setFormError(requestError instanceof Error ? requestError.message : "Không tải được tồn mới nhất."); }
    finally { if (generation === stockRefresh.current) setRefreshing(false); }
  }

  function startExecution(conversion: StockConversion) {
    try {
      setExecution({ conversionId: conversion.id, reversed: false, quantity: String(conversion.quantity_a), note: "", requestId: createStockConversionRequestId() });
      void refreshProductStock(conversion.product_id);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Không mở được popup quy đổi."); }
  }

  function changeExecution(patch: Partial<ExecutionForm>) {
    setFormError("");
    try {
      const requestId = createStockConversionRequestId();
      setExecution((current) => current ? { ...current, ...patch, requestId } : current);
    } catch (requestError) { setFormError(requestError instanceof Error ? requestError.message : "Không tạo được mã quy đổi."); }
  }

  async function removeSetup() {
    if (!canConfigure || !form?.id || !form.updated_at || mutationPending.current) return;
    const current = { id: form.id, updated_at: form.updated_at };
    const product = savedSetup ? productById.get(savedSetup.product_id) : undefined;
    const confirmed = await confirmAction({
      title: "Xóa thiết lập quy đổi?", confirmLabel: "Xóa thiết lập", tone: "danger",
      message: `Xóa cặp quy đổi${product ? ` của “${product.name}”` : " đã chọn"}? Tồn kho và lịch sử quy đổi đã thực hiện được giữ nguyên.`,
    });
    if (!confirmed || mutationPending.current) return;
    mutationPending.current = true; setDeleting(true); setFormError("");
    try {
      await deleteStockConversion(current);
      setConversions((items) => items.filter((item) => item.id !== current.id));
      setForm(null); showSuccess("Đã xóa thiết lập quy đổi.");
    } catch (requestError) { setFormError(requestError instanceof Error ? requestError.message : "Không xóa được thiết lập quy đổi."); }
    finally { mutationPending.current = false; setDeleting(false); }
  }

  async function save() {
    if (!canConfigure || !form || mutationPending.current) return;
    setFormError("");
    if (!editingProduct || !form.variantA || !form.variantB || form.variantA === form.variantB) { setFormError("Chọn hai biến thể khác nhau của cùng một sản phẩm."); return; }
    if (getConversionQuantity(Number(form.quantityA), Number(form.quantityA), Number(form.quantityB)) === null) { setFormError("Số lượng hai phía phải là số nguyên lớn hơn 0 và không vượt giới hạn tồn kho."); return; }
    mutationPending.current = true; setSaving(true);
    try {
      const saved = await saveStockConversion({ id: form.id, updated_at: form.updated_at, product_id: form.productId, variant_a_id: form.variantA, quantity_a: Number(form.quantityA), variant_b_id: form.variantB, quantity_b: Number(form.quantityB) });
      setConversions((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setForm(null); showSuccess("Đã lưu thiết lập quy đổi hai chiều.");
    } catch (requestError) { setFormError(requestError instanceof Error ? requestError.message : "Không lưu được thiết lập quy đổi."); }
    finally { mutationPending.current = false; setSaving(false); }
  }

  async function execute() {
    if (!canExecute || !execution || !selectedConversion || !source || !target || received === null || quantityError || formError || refreshing || mutationPending.current) return;
    mutationPending.current = true; setExecuting(true); setFormError("");
    try {
      const result = await executeStockConversion({ conversion: selectedConversion, reversed: execution.reversed, quantity, requestId: execution.requestId, note: execution.note });
      setProducts((current) => current.map((product) => product.id === selectedConversion.product_id ? { ...product, variants: product.variants.map((variant) => variant.id === source.id ? { ...variant, stock_quantity: result.source_stock_after } : variant.id === target.id ? { ...variant, stock_quantity: result.target_stock_after } : variant) } : product));
      setExecution(null); showSuccess(`Đã quy đổi ${result.source_quantity} thành ${result.target_quantity} sản phẩm và lưu lịch sử.`);
    } catch (requestError) { setFormError(requestError instanceof Error ? requestError.message : "Không thực hiện được quy đổi."); }
    finally { mutationPending.current = false; setExecuting(false); }
  }

  if (!canConfigure && !canExecute) return null;
  return <>
    <Modal bodyClassName="!p-0" footer={<Button className="w-full sm:w-auto" disabled={setupPending || executing} onClick={close} variant="secondary">Đóng</Button>} onClose={close} open={open} size="xl" title="Quy đổi hàng hóa">
      <div className="sticky top-0 z-10 space-y-3 border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
        <div className="flex gap-2 border-b border-slate-100">
          {canExecute ? <button aria-pressed={activeTab === "execute"} className={`flex-1 border-b-2 px-3 py-2 text-sm font-extrabold sm:flex-none ${activeTab === "execute" ? "border-moss-600 text-moss-700" : "border-transparent text-slate-500"}`} onClick={() => { setTab("execute"); setQuery(""); }} type="button">Quy đổi</button> : null}
          {canConfigure ? <button aria-pressed={activeTab === "configure"} className={`flex-1 border-b-2 px-3 py-2 text-sm font-extrabold sm:flex-none ${activeTab === "configure" ? "border-moss-600 text-moss-700" : "border-transparent text-slate-500"}`} onClick={() => { setTab("configure"); setQuery(""); }} type="button">Thiết lập</button> : null}
        </div>
        <div className="flex gap-2"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-slate-100 px-3"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label="Tìm sản phẩm quy đổi" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sản phẩm..." value={query} /></label>{activeTab === "configure" ? <Button className="!min-h-11 !bg-moss-700 !text-white" disabled={loading || Boolean(error)} onClick={() => setProductPickerOpen(true)}><Plus className="h-4 w-4" />Thêm</Button> : null}</div>
        {activeTab === "execute" ? <p className="text-xs font-semibold text-slate-500">Chọn sản phẩm để nhập số lượng quy đổi.</p> : null}
      </div>
      <div className="p-3 sm:p-4">
        {loading ? <div className="p-10"><Spinner label="Đang tải danh sách quy đổi..." /></div> : error ? <div className="space-y-3"><p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p><Button onClick={() => void load()} variant="secondary">Tải lại</Button></div> : !visibleProducts.length ? <EmptyState description={query ? "Thử tìm tên sản phẩm hoặc biến thể khác." : activeTab === "configure" ? "Nhấn Thêm để chọn sản phẩm và cặp biến thể cần quy đổi." : "Các sản phẩm đã được thiết lập quy đổi sẽ xuất hiện tại đây."} icon={ArrowLeftRight} title={query ? "Không có kết quả" : "Chưa có sản phẩm quy đổi"} /> : <div className="grid grid-cols-2 justify-start gap-2 sm:[grid-template-columns:repeat(auto-fill,minmax(168px,184px))] sm:gap-3">
          {visibleProducts.map((product) => { const pairs = byProduct.get(product.id)!; return <ConversionProductCard key={product.id} onClick={() => activeTab === "configure" ? edit(pairs[0]) : startExecution(pairs[0])} product={product} ratios={pairs.map((conversion) => ratioSides(product, conversion))} />; })}
        </div>}
      </div>
    </Modal>

    <Modal footer={<div className="flex w-full flex-wrap items-center gap-2">{form?.id ? <Button aria-label="Xóa thiết lập quy đổi" className="mr-auto" disabled={saving} isLoading={deleting} onClick={() => void removeSetup()} variant="danger"><Trash2 aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">Xóa</span></Button> : <span className="mr-auto" />}<Button disabled={setupPending} onClick={() => setForm(null)} variant="secondary">Hủy</Button><Button className="!bg-moss-700 !text-white" disabled={deleting} isLoading={saving} onClick={() => void save()}>Lưu thiết lập</Button></div>} onClose={() => { if (!mutationPending.current) setForm(null); }} open={open && canConfigure && Boolean(form)} size="lg" title={form?.id ? "Sửa thiết lập quy đổi" : "Thêm quy đổi"}>
      {form ? <div className="space-y-4">
        {form.id && savedSetup?.product_id === form.productId && (byProduct.get(form.productId)?.length ?? 0) > 1 ? <Select disabled={setupPending} label="Cặp biến thể" onChange={(event) => { const conversion = conversions.find((item) => item.id === event.target.value); if (conversion) edit(conversion); }} value={form.id}>{byProduct.get(form.productId)?.map((conversion) => <option key={conversion.id} value={conversion.id}>{ratioLabel(editingProduct!, conversion)}</option>)}</Select> : null}
        <div><p className="mb-2 text-sm font-bold">Sản phẩm</p><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">{editingProduct && editingImage ? <ProductThumbnail alt="" cacheVersion={editingProduct.updated_at} className="h-11 w-11 shrink-0 rounded-lg object-contain" src={editingImage} /> : null}<strong className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{editingProduct?.name ?? "Sản phẩm không còn khả dụng"}</strong><Button className="shrink-0 !px-2 !text-xs" disabled={setupPending} onClick={() => setProductPickerOpen(true)} variant="secondary">Đổi sản phẩm</Button></div></div>
        <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] sm:gap-2">
          <div className="min-w-0 space-y-3 rounded-xl bg-sky-50 p-3"><Select disabled={setupPending || !editingProduct} label="Từ biến thể" onChange={(event) => { setFormError(""); setForm({ ...form, variantA: event.target.value }); }} value={form.variantA}><option value="">Chọn biến thể</option>{editingVariants.filter((variant) => variant.id !== form.variantB).map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(editingProduct!, variant.id)}</option>)}</Select>{editingProduct && editingA ? <VariantDetails product={editingProduct} variant={editingA} /> : null}<Input disabled={setupPending} inputMode="numeric" label="Số lượng" onChange={(event) => { setFormError(""); setForm({ ...form, quantityA: normalizeIntegerInput(event.target.value) }); }} value={formatIntegerInput(form.quantityA)} /></div>
          <span aria-hidden="true" className="flex items-center justify-center text-slate-500"><SwapIcon /></span>
          <div className="min-w-0 space-y-3 rounded-xl bg-moss-50 p-3"><Select disabled={setupPending || !editingProduct} label="Sang biến thể" onChange={(event) => { setFormError(""); setForm({ ...form, variantB: event.target.value }); }} value={form.variantB}><option value="">Chọn biến thể</option>{editingVariants.filter((variant) => variant.id !== form.variantA).map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(editingProduct!, variant.id)}</option>)}</Select>{editingProduct && editingB ? <VariantDetails product={editingProduct} variant={editingB} /> : null}<Input disabled={setupPending} inputMode="numeric" label="Số lượng" onChange={(event) => { setFormError(""); setForm({ ...form, quantityB: normalizeIntegerInput(event.target.value) }); }} value={formatIntegerInput(form.quantityB)} /></div>
        </div>
        {editingProduct && form.variantA && form.variantB ? <ConversionPreview source={`${form.quantityA || "—"} ${variantLabel(editingProduct, form.variantA)}`} target={`${form.quantityB || "—"} ${variantLabel(editingProduct, form.variantB)}`} /> : null}
        <p className="text-xs font-semibold text-slate-500">Áp dụng hai chiều cho hai biến thể của cùng sản phẩm.</p>
        {formError ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{formError}</p> : null}
      </div> : null}
    </Modal>

    <Modal footer={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button disabled={executing} onClick={() => { stockRefresh.current += 1; setExecution(null); }} variant="secondary">Hủy</Button><Button className="!bg-moss-700 !text-white" disabled={refreshing || received === null || Boolean(quantityError) || Boolean(formError) || !source || !target} isLoading={executing} onClick={() => void execute()}>Xác nhận quy đổi</Button></div>} onClose={() => { if (!mutationPending.current) { stockRefresh.current += 1; setExecution(null); } }} open={open && canExecute && Boolean(execution)} size="lg" title="Quy đổi sản phẩm">
      {execution && selectedConversion && executingProduct && source && target ? <div className="space-y-4">
        <div><p className="mb-2 text-sm font-bold">Sản phẩm</p><div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">{executingImage ? <ProductThumbnail alt="" cacheVersion={executingProduct.updated_at} className="h-11 w-11 shrink-0 rounded-lg object-contain" src={executingImage} /> : null}<strong className="min-w-0 text-sm [overflow-wrap:anywhere]">{executingProduct.name}</strong></div></div>
        {(byProduct.get(executingProduct.id)?.length ?? 0) > 1 ? <Select disabled={executing || refreshing} label="Cặp biến thể" onChange={(event) => { const conversion = conversions.find((item) => item.id === event.target.value); if (conversion) startExecution(conversion); }} value={selectedConversion.id}>{byProduct.get(executingProduct.id)?.map((conversion) => <option key={conversion.id} value={conversion.id}>{ratioLabel(executingProduct, conversion)}</option>)}</Select> : null}
        <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] sm:gap-2">
          <div className="min-w-0 space-y-3 rounded-xl bg-sky-50 p-3"><h3 className="text-sm font-extrabold text-slate-950">Giảm tồn</h3><VariantDetails product={executingProduct} variant={source} /><Input disabled={executing || refreshing} inputMode="numeric" label="Số lượng quy đổi" onChange={(event) => changeExecution({ quantity: normalizeIntegerInput(event.target.value) })} value={formatIntegerInput(execution.quantity)} /><p className="text-xs font-semibold tabular-nums text-slate-600">Tồn: {source.stock_quantity} → {received !== null && !quantityError ? source.stock_quantity - quantity : "—"}</p></div>
          <button aria-label="Đảo chiều quy đổi" className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-moss-600 bg-white text-moss-700 transition hover:bg-moss-50 disabled:opacity-50" disabled={executing || refreshing} onClick={() => changeExecution({ reversed: !execution.reversed, quantity: String(received ?? targetRatio) })} title="Đảo chiều quy đổi" type="button"><SwapIcon /></button>
          <div className="min-w-0 space-y-3 rounded-xl bg-moss-50 p-3"><h3 className="text-sm font-extrabold text-slate-950">Tăng tồn</h3><VariantDetails product={executingProduct} variant={target} /><Input label="Số lượng nhận" readOnly value={received !== null ? formatIntegerInput(received) : "—"} /><p className="text-xs font-semibold tabular-nums text-slate-600">Tồn: {target.stock_quantity} → {received !== null && !quantityError ? target.stock_quantity + received : "—"}</p></div>
        </div>
        {refreshing ? <Spinner label="Đang cập nhật tồn mới nhất..." /> : null}
        <ConversionPreview bidirectional={false} source={`${execution.quantity || "—"} ${variantLabel(executingProduct, source.id)}`} target={`${received ?? "—"} ${variantLabel(executingProduct, target.id)}`} />
        <p className="text-xs font-semibold text-slate-500">Tỷ lệ: {sourceRatio} ↔ {targetRatio}. Số lượng quy đổi phải là bội số của {sourceRatio}.</p>
        <Textarea disabled={executing} label="Ghi chú (tùy chọn)" maxLength={1000} onChange={(event) => changeExecution({ note: event.target.value })} placeholder="Nhập ghi chú..." value={execution.note} />
        {quantityError || formError ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{quantityError || formError}</p> : null}
        {formError && !executing ? <Button onClick={() => void refreshProductStock(executingProduct.id)} variant="secondary">Cập nhật tồn và thử lại</Button> : null}
      </div> : execution ? <div className="space-y-3"><p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">Sản phẩm hoặc thiết lập quy đổi không còn khả dụng. Hãy tải lại danh sách trước khi tiếp tục.</p><Button onClick={() => { stockRefresh.current += 1; setExecution(null); void load(); }} variant="secondary">Tải lại danh sách</Button></div> : null}
    </Modal>
    {open && canConfigure && productPickerOpen ? <StockConversionProductPicker onClose={() => setProductPickerOpen(false)} onSelect={selectSetupProduct} products={eligibleProducts} /> : null}
  </>;
}
