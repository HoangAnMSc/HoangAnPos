import { CalendarDays, ChevronRight, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { fetchProducts, fetchProductTypes } from "../features/products/services/productEngine";
import type { Product } from "../features/products/types";
import { getVariantLabel } from "../features/products/utils/variants";
import { deletePromotion, fetchPromotions, savePromotion } from "../features/promotions/services/promotions";
import type { DiscountType, Promotion, PromotionCondition, PromotionScope, PromotionTrigger } from "../features/promotions/types";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";

type Draft = Omit<Promotion, "created_at" | "updated_at" | "usage_count"> & { id: string };
type CategoryOption = { id: string; name: string };
const emptyDraft = (): Draft => ({
  id: "", name: "", code: null, trigger_type: "coupon", discount_type: "percentage",
  discount_value: 0, max_discount_amount: null, start_at: null, end_at: null,
  total_usage_limit: null, usage_per_customer: null, priority: 0, is_stackable: false,
  is_active: true, conditions: [], scopes: [{ scope_type: "all", scope_id: null }],
});
const localDate = (value: string | null) => value ? value.slice(0, 16) : "";
const triggerLabel = (value: PromotionTrigger) => value === "coupon" ? "Mã giảm giá" : "Tự động";
const discountLabel = (item: Pick<Promotion, "discount_type" | "discount_value">) =>
  item.discount_type === "percentage" ? `${item.discount_value}%` :
    item.discount_type === "fixed_amount" ? formatCurrency(item.discount_value) : "Miễn phí vận chuyển";

export function PromotionsPage() {
  const { canAccess } = useAuth();
  const canCreatePromotion = canAccess("promotions.create");
  const canUpdatePromotion = canAccess("promotions.update");
  const canDeletePromotion = canAccess("promotions.delete");
  const [items, setItems] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const promotions = await fetchPromotions();
      setItems(promotions);
      const [nextProducts, productTypes] = await Promise.all([
        fetchProducts(), fetchProductTypes(),
      ]);
      setProducts(nextProducts);
      setCategories(productTypes.map(({ id, name }) => ({ id, name })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu khuyến mãi.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesText = `${item.name} ${item.code ?? ""}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
    return matchesText && (status === "all" || item.is_active === (status === "active"));
  }), [items, query, status]);

  function edit(item?: Promotion) {
    if (item ? (!canUpdatePromotion && !canDeletePromotion) : !canCreatePromotion) return;
    setError("");
    setDraft(item ? { ...item, conditions: [...item.conditions], scopes: [...item.scopes] } : emptyDraft());
    setOpen(true);
  }

  async function submit() {
    if (draft.id ? !canUpdatePromotion : !canCreatePromotion) {
      setError("Tài khoản không có quyền lưu chương trình này.");
      return;
    }
    setError("");
    if (!draft.name.trim()) return setError("Vui lòng nhập tên chương trình.");
    if (draft.trigger_type === "coupon" && !draft.code?.trim()) return setError("Vui lòng nhập mã voucher.");
    if (draft.discount_type === "percentage" && (draft.discount_value <= 0 || draft.discount_value > 100)) return setError("Phần trăm giảm phải từ 1 đến 100.");
    if (draft.discount_type === "fixed_amount" && draft.discount_value <= 0) return setError("Số tiền giảm phải lớn hơn 0.");
    if (draft.start_at && draft.end_at && draft.start_at >= draft.end_at) return setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
    if (draft.scopes.some((scope) => scope.scope_type !== "all" && !scope.scope_id)) return setError("Vui lòng chọn đầy đủ phạm vi áp dụng.");
    setSaving(true);
    try {
      await savePromotion({ ...draft, code: draft.trigger_type === "coupon" ? draft.code!.trim().toUpperCase() : null });
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không lưu được chương trình.");
    } finally { setSaving(false); }
  }

  async function removeCurrentPromotion() {
    if (!draft.id) return;
    setDeleting(true);
    setError("");
    try {
      await deletePromotion(draft.id);
      setDeleteConfirmOpen(false);
      setOpen(false);
      await load();
    } catch (reason) {
      setDeleteConfirmOpen(false);
      setError(reason instanceof Error ? reason.message : "Không xóa được chương trình.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-3 px-3 pb-32 sm:px-6 sm:pb-28 lg:px-8">
      {error && !open ? <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
      <Card className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-black text-slate-950">Chương trình ưu đãi</h1>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-500">Voucher và khuyến mãi tự động</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-extrabold">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{items.length} chương trình</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">{items.filter((item) => item.is_active).length} hoạt động</span>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="grid min-h-40 place-items-center p-4"><Spinner label="Đang tải chương trình ưu đãi..." /></Card>
      ) : <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="p-4">Chương trình</th><th>Hình thức</th><th>Ưu đãi</th><th>Thời gian</th><th>Lượt dùng</th><th className="pr-4">Trạng thái</th>
          </tr></thead>
          <tbody>{filtered.map((item) => <tr className={`border-t border-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-400 ${canUpdatePromotion || canDeletePromotion ? "cursor-pointer hover:bg-slate-50 focus-visible:bg-slate-50" : ""}`} key={item.id} onClick={() => edit(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); edit(item); } }} tabIndex={canUpdatePromotion || canDeletePromotion ? 0 : -1}>
            <td className="p-4"><p className="font-extrabold">{item.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{item.code ?? "Không cần mã"}</p></td>
            <td>{triggerLabel(item.trigger_type)}</td><td className="font-bold text-moss-700">{discountLabel(item)}</td>
            <td className="text-xs text-slate-600">{item.start_at ? new Date(item.start_at).toLocaleDateString("vi-VN") : "Áp dụng ngay"} → {item.end_at ? new Date(item.end_at).toLocaleDateString("vi-VN") : "∞"}</td>
            <td>{item.usage_count ?? 0} / {item.total_usage_limit ?? "∞"}</td><td className="pr-4"><div className="flex items-center justify-between gap-2"><Status active={item.is_active} /><ChevronRight className="h-4 w-4 text-slate-300" /></div></td>
          </tr>)}</tbody>
        </table>
      </Card>}

      {!loading ? <div className="grid gap-2.5 md:hidden">{filtered.map((item) => <button className={`w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-soft transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-400 ${canUpdatePromotion || canDeletePromotion ? "active:scale-[0.99] active:bg-slate-50" : "cursor-default"}`} key={item.id} onClick={() => edit(item)} type="button">
        <div className="flex items-start gap-3 p-3.5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss-50 text-moss-700"><TicketPercent className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="truncate font-black text-slate-950">{item.name}</h3><Status active={item.is_active} /></div><p className="mt-0.5 font-mono text-[11px] font-semibold uppercase text-slate-500">{item.code ?? "Tự động"}</p></div></div>
        <div className="mx-3.5 grid grid-cols-2 divide-x divide-slate-200 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"><div className="pr-3"><p className="text-[11px] font-semibold text-slate-500">Ưu đãi</p><strong className="mt-0.5 block text-moss-800">{discountLabel(item)}</strong></div><div className="pl-3"><p className="text-[11px] font-semibold text-slate-500">Lượt dùng</p><strong className="mt-0.5 block">{item.usage_count ?? 0} / {item.total_usage_limit ?? "∞"}</strong></div></div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 px-3.5 py-3 text-xs font-medium text-slate-500"><CalendarDays className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{item.start_at ? new Date(item.start_at).toLocaleDateString("vi-VN") : "Áp dụng ngay"} → {item.end_at ? new Date(item.end_at).toLocaleDateString("vi-VN") : "∞"}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" /></div>
      </button>)}</div> : null}
      {!loading && !filtered.length ? <Card className="p-8 text-center text-sm text-slate-500">Không tìm thấy chương trình phù hợp trong database.</Card> : null}

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur-xl lg:left-72">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Tìm chương trình khuyến mãi"
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-moss-500 focus:bg-white focus:ring-2 focus:ring-moss-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm tên hoặc mã..."
              value={query}
            />
          </label>
          <div className="w-28 shrink-0 sm:w-44">
            <Select className="!min-h-12 !py-2 !pl-3 !pr-7" onChange={(event) => setStatus(event.target.value as typeof status)} value={status}>
              <option value="all">Tất cả</option><option value="active">Hoạt động</option><option value="inactive">Tạm dừng</option>
            </Select>
          </div>
          {canCreatePromotion ? <Button aria-label="Thêm chương trình" className="h-12 min-h-12 w-12 shrink-0 px-0 sm:w-auto sm:px-4" onClick={() => edit()}>
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Thêm chương trình</span>
          </Button> : null}
        </div>
      </div>

      <Modal footer={<div className="flex w-full items-center gap-2">{draft.id && canDeletePromotion ? <Button aria-label="Xóa chương trình" className="mr-auto px-3" disabled={saving} onClick={() => setDeleteConfirmOpen(true)} variant="danger"><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Xóa</span></Button> : <span className="mr-auto" />}<Button onClick={() => setOpen(false)} variant="secondary">Hủy</Button>{(draft.id ? canUpdatePromotion : canCreatePromotion) ? <Button isLoading={saving} onClick={() => void submit()}>Lưu</Button> : null}</div>} onClose={() => setOpen(false)} open={open} size="xl" title={draft.id ? "Chỉnh sửa chương trình" : "Thêm chương trình"}>
        <div className="space-y-4">
          {error ? <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
          <FormSection description="Tên, cách kích hoạt và mức ưu đãi." title="Thông tin chung">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Tên chương trình" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
              <Select label="Cách áp dụng" onChange={(event) => setDraft((current) => ({ ...current, trigger_type: event.target.value as PromotionTrigger, code: event.target.value === "automatic" ? null : current.code }))} value={draft.trigger_type}><option value="coupon">Khách nhập mã voucher</option><option value="automatic">Tự động áp dụng</option></Select>
              {draft.trigger_type === "coupon" ? <Input label="Mã voucher" onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="VD: SUMMER20" value={draft.code ?? ""} /> : null}
              <Select label="Loại ưu đãi" onChange={(event) => setDraft((current) => ({ ...current, discount_type: event.target.value as DiscountType }))} value={draft.discount_type}><option value="percentage">Giảm theo phần trăm</option><option value="fixed_amount">Giảm số tiền cố định</option><option value="free_shipping">Miễn phí vận chuyển</option></Select>
              {draft.discount_type !== "free_shipping" ? <Input label={draft.discount_type === "percentage" ? "Mức giảm (%)" : "Số tiền giảm"} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, discount_value: Number(normalizeIntegerInput(event.target.value)) || 0 }))} value={formatIntegerInput(draft.discount_value)} /> : null}
              {draft.discount_type === "percentage" ? <Input label="Giảm tối đa (để trống nếu không giới hạn)" inputMode="numeric" onChange={(event) => { const value = normalizeIntegerInput(event.target.value); setDraft((current) => ({ ...current, max_discount_amount: value ? Number(value) : null })); }} value={formatIntegerInput(draft.max_discount_amount ?? "")} /> : null}
            </div>
          </FormSection>

          <Conditions value={draft.conditions} onChange={(conditions) => setDraft((current) => ({ ...current, conditions }))} />
          <Scopes categories={categories} products={products} value={draft.scopes} onChange={(scopes) => setDraft((current) => ({ ...current, scopes }))} />

          <FormSection description="Thời gian hiệu lực và giới hạn số lần sử dụng." title="Thời gian & giới hạn">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Bắt đầu" onChange={(event) => setDraft((current) => ({ ...current, start_at: event.target.value ? new Date(event.target.value).toISOString() : null }))} type="datetime-local" value={localDate(draft.start_at)} />
              <Input label="Kết thúc" onChange={(event) => setDraft((current) => ({ ...current, end_at: event.target.value ? new Date(event.target.value).toISOString() : null }))} type="datetime-local" value={localDate(draft.end_at)} />
              <UsageLimitField label="Tổng lượt sử dụng" onChange={(total_usage_limit) => setDraft((current) => ({ ...current, total_usage_limit }))} value={draft.total_usage_limit} />
              <UsageLimitField label="Số lượt mỗi khách" onChange={(usage_per_customer) => setDraft((current) => ({ ...current, usage_per_customer }))} value={draft.usage_per_customer} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><Toggle checked={draft.is_stackable} label="Cho phép cộng dồn ưu đãi" onChange={(checked) => setDraft((current) => ({ ...current, is_stackable: checked }))} /><Toggle checked={draft.is_active} label="Đang hoạt động" onChange={(checked) => setDraft((current) => ({ ...current, is_active: checked }))} /></div>
          </FormSection>
        </div>
      </Modal>
      <Modal
        footer={<div className="grid w-full grid-cols-2 gap-2"><Button disabled={deleting} onClick={() => setDeleteConfirmOpen(false)} variant="secondary">Hủy</Button><Button isLoading={deleting} onClick={() => void removeCurrentPromotion()} variant="danger"><Trash2 className="h-4 w-4" />Xóa chương trình</Button></div>}
        onClose={() => { if (!deleting) setDeleteConfirmOpen(false); }}
        open={deleteConfirmOpen}
        size="sm"
        title="Xóa chương trình?"
        zIndex={120}
      >
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
          <p>Bạn sắp xóa <strong>{draft.name}</strong>. Điều kiện và phạm vi áp dụng của chương trình cũng sẽ bị xóa.</p>
          <p className="mt-2 text-xs font-semibold text-red-700">Chương trình đã có lượt sử dụng sẽ được giữ lại để bảo toàn lịch sử đơn hàng.</p>
        </div>
      </Modal>
    </div>
  );
}

function Status({ active }: { active: boolean }) { return <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Hoạt động" : "Tạm dừng"}</span>; }
function FormSection({ children, description, title }: { children: React.ReactNode; description: string; title: string }) { return <section className="rounded-2xl border border-slate-200 p-3 sm:p-4"><div className="mb-3"><h3 className="font-extrabold">{title}</h3><p className="text-xs text-slate-500">{description}</p></div>{children}</section>; }
function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 text-sm font-bold"><span>{label}</span><input checked={checked} className="h-4 w-4 accent-moss-700" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>; }

function SmallSwitch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
    <span>{label}</span>
    <input aria-label={label} checked={checked} className="peer sr-only" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    <span className="relative h-5 w-9 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-moss-700 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-moss-300" />
  </label>;
}

function UsageLimitField({ label, onChange, value }: { label: string; onChange: (value: number | null) => void; value: number | null }) {
  const unlimited = value == null;
  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-extrabold text-slate-800">{label}</span>
      <SmallSwitch checked={unlimited} label="Không giới hạn" onChange={(checked) => onChange(checked ? null : 1)} />
    </div>
    {!unlimited ? <div className="mt-3">
      <Input aria-label={label} inputMode="numeric" onChange={(event) => { const next = Number(normalizeIntegerInput(event.target.value)); onChange(Number.isFinite(next) && next > 0 ? next : 1); }} value={formatIntegerInput(value)} />
    </div> : <p className="mt-2 text-xs font-medium text-slate-500">Có thể sử dụng không giới hạn số lượt.</p>}
  </div>;
}

const conditionLabels: Record<string, string> = {
  order_total: "Tổng tiền đơn hàng",
  quantity: "Tổng số lượng sản phẩm",
  customer_order_count: "Số đơn đã mua của khách",
  customer_points: "Điểm tích lũy của khách",
};
const numericOperatorLabels: Partial<Record<PromotionCondition["operator"], string>> = {
  eq: "Bằng",
  neq: "Khác",
  gt: "Lớn hơn",
  gte: "Từ",
  lt: "Nhỏ hơn",
  lte: "Tối đa",
};
function Conditions({ onChange, value }: { onChange: (value: PromotionCondition[]) => void; value: PromotionCondition[] }) {
  return <FormSection description="Khách phải thỏa tất cả điều kiện. Điều kiện về khách hàng chỉ áp dụng khi POS đã chọn khách." title="Điều kiện áp dụng">
    <div className="space-y-2">{value.map((condition, index) => <div className="grid gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-[1.3fr_1fr_1.5fr_auto]" key={`${condition.condition_type}-${index}`}>
      <Select aria-label="Loại điều kiện" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, condition_type: event.target.value, value: 0 } : item))} value={condition.condition_type}>{Object.entries(conditionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Select aria-label="Phép so sánh" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, operator: event.target.value as PromotionCondition["operator"] } : item))} value={condition.operator}>{Object.entries(numericOperatorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Input aria-label="Giá trị điều kiện" inputMode="numeric" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, value: Number(normalizeIntegerInput(event.target.value)) || 0 } : item))} placeholder={condition.condition_type === "customer_points" ? "Nhập số điểm" : "Nhập giá trị"} value={formatIntegerInput(String(condition.value ?? ""))} />
      <Button aria-label="Xóa điều kiện" className="px-3" onClick={() => onChange(value.filter((_, position) => position !== index))} variant="danger"><Trash2 className="h-4 w-4" /></Button>
    </div>)}</div>
    <Button className="mt-3 w-full sm:w-auto" onClick={() => onChange([...value, { condition_type: "order_total", operator: "gte", value: 0 }])} variant="secondary"><Plus className="h-4 w-4" />Thêm điều kiện</Button>
  </FormSection>;
}

function variantName(product: Product, variantId: string) { const variant = product.variants.find((item) => item.id === variantId); if (!variant) return variantId; return `${product.name} · ${getVariantLabel(variant, product.variant_attributes)} · ${variant.sku}`; }
function Scopes({ categories, onChange, products, value }: { categories: CategoryOption[]; onChange: (value: PromotionScope[]) => void; products: Product[]; value: PromotionScope[] }) {
  const options = (scope: PromotionScope) => scope.scope_type === "category" ? categories.map((item) => ({ id: item.id, label: item.name })) : scope.scope_type === "product" ? products.map((item) => ({ id: item.id, label: item.name })) : scope.scope_type === "variant" ? products.flatMap((product) => product.variants.map((variant) => ({ id: variant.id, label: variantName(product, variant.id) }))) : [];
  return <FormSection description="Danh mục được lấy trực tiếp từ tab Danh mục sản phẩm. SKU là một tổ hợp cụ thể." title="Phạm vi sản phẩm">
    <div className="space-y-2">{value.map((scope, index) => <div className="grid gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-[1fr_2fr_auto]" key={`${scope.scope_type}-${index}`}>
      <Select aria-label="Loại phạm vi" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, scope_type: event.target.value as PromotionScope["scope_type"], scope_id: null } : item))} value={scope.scope_type}><option value="all">Tất cả sản phẩm</option><option value="category">Danh mục sản phẩm</option><option value="product">Sản phẩm</option><option value="variant">SKU cụ thể</option></Select>
      {scope.scope_type === "all" ? <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500">Áp dụng cho toàn bộ sản phẩm</div> : <Select aria-label="Đối tượng áp dụng" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, scope_id: event.target.value || null } : item))} value={scope.scope_id ?? ""}><option value="">Chọn đối tượng áp dụng</option>{options(scope).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>}
      <Button aria-label="Xóa phạm vi" className="px-3" disabled={value.length === 1} onClick={() => onChange(value.filter((_, position) => position !== index))} variant="danger"><Trash2 className="h-4 w-4" /></Button>
    </div>)}</div>
    {!value.some((scope) => scope.scope_type === "all") ? <Button className="mt-3 w-full sm:w-auto" onClick={() => onChange([...value, { scope_type: "product", scope_id: null }])} variant="secondary"><Plus className="h-4 w-4" />Thêm phạm vi</Button> : null}
  </FormSection>;
}
