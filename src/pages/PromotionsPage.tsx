import { CalendarDays, Plus, Search, TicketPercent, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { fetchCategories, fetchProducts } from "../features/products/services/productEngine";
import type { Product } from "../features/products/types";
import { fetchPromotions, savePromotion } from "../features/promotions/services/promotions";
import type { DiscountType, Promotion, PromotionCondition, PromotionScope, PromotionTrigger } from "../features/promotions/types";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";

type Draft = Omit<Promotion, "created_at" | "updated_at" | "usage_count"> & { id: string };
type CategoryOption = { id: string; name: string };
const emptyDraft = (): Draft => ({
  id: "", name: "", code: null, trigger_type: "coupon", discount_type: "percentage",
  discount_value: 0, max_discount_amount: null, start_at: null, end_at: null,
  total_usage_limit: null, usage_per_customer: 1, priority: 0, is_stackable: false,
  is_active: true, conditions: [], scopes: [{ scope_type: "all", scope_id: null }],
});
const localDate = (value: string | null) => value ? value.slice(0, 16) : "";
const triggerLabel = (value: PromotionTrigger) => value === "coupon" ? "Mã giảm giá" : "Tự động";
const discountLabel = (item: Pick<Promotion, "discount_type" | "discount_value">) =>
  item.discount_type === "percentage" ? `${item.discount_value}%` :
    item.discount_type === "fixed_amount" ? formatCurrency(item.discount_value) : "Miễn phí vận chuyển";

export function PromotionsPage() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const load = useCallback(async () => {
    try {
      const [promotions, nextProducts, nextCategories] = await Promise.all([
        fetchPromotions(), fetchProducts(), fetchCategories(),
      ]);
      setItems(promotions);
      setProducts(nextProducts);
      setCategories(nextCategories);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được dữ liệu khuyến mãi.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesText = `${item.name} ${item.code ?? ""}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
    return matchesText && (status === "all" || item.is_active === (status === "active"));
  }), [items, query, status]);

  function edit(item?: Promotion) {
    setError("");
    setDraft(item ? { ...item, conditions: [...item.conditions], scopes: [...item.scopes] } : emptyDraft());
    setOpen(true);
  }

  async function submit() {
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-3 pb-10 sm:px-6 lg:px-8">
      {error && !open ? <div className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
      <Card className="overflow-hidden bg-gradient-to-br from-coal to-ink p-4 text-white sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Tiếp thị</p>
            <h1 className="mt-1 text-xl font-black sm:text-2xl">Khuyến mãi & voucher</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/70">Tạo ưu đãi tự động hoặc mã giảm giá mà không thay đổi giá gốc của SKU.</p>
          </div>
          <div className="flex gap-2">
            <Metric label="Tổng chương trình" value={items.length} />
            <Metric label="Đang hoạt động" value={items.filter((item) => item.is_active).length} />
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-soft sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-moss-500 focus:bg-white focus:ring-2 focus:ring-moss-100" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên hoặc mã voucher..." value={query} />
        </label>
        <Select className="sm:!w-48" onChange={(event) => setStatus(event.target.value as typeof status)} value={status}>
          <option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Tạm dừng</option>
        </Select>
        <Button onClick={() => edit()}><Plus className="h-4 w-4" />Thêm chương trình</Button>
      </div>

      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>
            <th className="p-4">Chương trình</th><th>Hình thức</th><th>Ưu đãi</th><th>Thời gian</th><th>Lượt dùng</th><th>Trạng thái</th><th className="pr-4 text-right">Thao tác</th>
          </tr></thead>
          <tbody>{filtered.map((item) => <tr className="border-t border-slate-100" key={item.id}>
            <td className="p-4"><p className="font-extrabold">{item.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{item.code ?? "Không cần mã"}</p></td>
            <td>{triggerLabel(item.trigger_type)}</td><td className="font-bold text-moss-700">{discountLabel(item)}</td>
            <td className="text-xs text-slate-600">{item.start_at ? new Date(item.start_at).toLocaleDateString("vi-VN") : "Áp dụng ngay"} → {item.end_at ? new Date(item.end_at).toLocaleDateString("vi-VN") : "Không giới hạn"}</td>
            <td>{item.usage_count ?? 0} / {item.total_usage_limit ?? "∞"}</td><td><Status active={item.is_active} /></td>
            <td className="pr-4 text-right"><Button onClick={() => edit(item)} variant="secondary">Chỉnh sửa</Button></td>
          </tr>)}</tbody>
        </table>
      </Card>

      <div className="grid gap-3 md:hidden">{filtered.map((item) => <Card className="p-4" key={item.id}>
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss-50 text-moss-700"><TicketPercent className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="font-black">{item.name}</h3><Status active={item.is_active} /></div><p className="font-mono text-xs text-slate-500">{item.code ?? "TỰ ĐỘNG"}</p></div></div>
        <div className="my-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="text-xs text-slate-500">Ưu đãi</p><strong>{discountLabel(item)}</strong></div><div><p className="text-xs text-slate-500">Lượt dùng</p><strong>{item.usage_count ?? 0} / {item.total_usage_limit ?? "∞"}</strong></div></div>
        <div className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-4 w-4" /><span>{item.start_at ? new Date(item.start_at).toLocaleDateString("vi-VN") : "Ngay"} → {item.end_at ? new Date(item.end_at).toLocaleDateString("vi-VN") : "Không giới hạn"}</span><Button className="ml-auto min-h-9 px-3 py-1.5" onClick={() => edit(item)} variant="secondary">Sửa</Button></div>
      </Card>)}</div>
      {!filtered.length ? <Card className="p-8 text-center text-sm text-slate-500">Không tìm thấy chương trình phù hợp.</Card> : null}

      <Modal footer={<><Button onClick={() => setOpen(false)} variant="secondary">Hủy</Button><Button isLoading={saving} onClick={() => void submit()}>Lưu chương trình</Button></>} onClose={() => setOpen(false)} open={open} size="xl" title={draft.id ? "Chỉnh sửa chương trình" : "Thêm chương trình"}>
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
              <Input label="Tổng lượt sử dụng" inputMode="numeric" onChange={(event) => { const value = normalizeIntegerInput(event.target.value); setDraft((current) => ({ ...current, total_usage_limit: value ? Number(value) : null })); }} value={formatIntegerInput(draft.total_usage_limit ?? "")} />
              <Input label="Số lượt mỗi khách" inputMode="numeric" onChange={(event) => { const value = normalizeIntegerInput(event.target.value); setDraft((current) => ({ ...current, usage_per_customer: value ? Number(value) : null })); }} value={formatIntegerInput(draft.usage_per_customer ?? "")} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><Toggle checked={draft.is_stackable} label="Cho phép cộng dồn ưu đãi" onChange={(checked) => setDraft((current) => ({ ...current, is_stackable: checked }))} /><Toggle checked={draft.is_active} label="Đang hoạt động" onChange={(checked) => setDraft((current) => ({ ...current, is_active: checked }))} /></div>
          </FormSection>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="min-w-24 rounded-xl bg-white/10 px-3 py-2 text-center"><strong className="block text-lg font-black">{value}</strong><span className="text-[11px] text-white/65">{label}</span></div>; }
function Status({ active }: { active: boolean }) { return <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Hoạt động" : "Tạm dừng"}</span>; }
function FormSection({ children, description, title }: { children: React.ReactNode; description: string; title: string }) { return <section className="rounded-2xl border border-slate-200 p-3 sm:p-4"><div className="mb-3"><h3 className="font-extrabold">{title}</h3><p className="text-xs text-slate-500">{description}</p></div>{children}</section>; }
function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) { return <label className="flex min-h-11 cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 text-sm font-bold"><span>{label}</span><input checked={checked} className="h-4 w-4 accent-moss-700" onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>; }

const conditionLabels: Record<string, string> = { order_total: "Tổng tiền đơn hàng", quantity: "Tổng số lượng sản phẩm", customer_order_count: "Số đơn đã mua của khách" };
const operatorLabels: Record<PromotionCondition["operator"], string> = { eq: "Bằng", neq: "Khác", gt: "Lớn hơn", gte: "Từ", lt: "Nhỏ hơn", lte: "Tối đa", in: "Thuộc danh sách", not_in: "Không thuộc danh sách" };
function Conditions({ onChange, value }: { onChange: (value: PromotionCondition[]) => void; value: PromotionCondition[] }) {
  return <FormSection description="Khách phải thỏa tất cả điều kiện bên dưới. Để trống nếu không có điều kiện." title="Điều kiện áp dụng">
    <div className="space-y-2">{value.map((condition, index) => <div className="grid gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-[1.3fr_1fr_1.5fr_auto]" key={`${condition.condition_type}-${index}`}>
      <Select aria-label="Loại điều kiện" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, condition_type: event.target.value, value: 0 } : item))} value={condition.condition_type}>{Object.entries(conditionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Select aria-label="Phép so sánh" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, operator: event.target.value as PromotionCondition["operator"] } : item))} value={condition.operator}>{Object.entries(operatorLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
      <Input aria-label="Giá trị điều kiện" inputMode="numeric" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, value: Number(normalizeIntegerInput(event.target.value)) || 0 } : item))} value={formatIntegerInput(String(condition.value ?? ""))} />
      <Button aria-label="Xóa điều kiện" className="px-3" onClick={() => onChange(value.filter((_, position) => position !== index))} variant="danger"><Trash2 className="h-4 w-4" /></Button>
    </div>)}</div>
    <Button className="mt-3 w-full sm:w-auto" onClick={() => onChange([...value, { condition_type: "order_total", operator: "gte", value: 0 }])} variant="secondary"><Plus className="h-4 w-4" />Thêm điều kiện</Button>
  </FormSection>;
}

function variantName(product: Product, variantId: string) { const variant = product.variants.find((item) => item.id === variantId); if (!variant) return variantId; const values = new Map(product.variant_attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, value.label] as const))); const label = variant.value_ids.map((id) => values.get(id)).filter(Boolean).join(" / "); return `${product.name} · ${label || "Mặc định"} · ${variant.sku}`; }
function Scopes({ categories, onChange, products, value }: { categories: CategoryOption[]; onChange: (value: PromotionScope[]) => void; products: Product[]; value: PromotionScope[] }) {
  const options = (scope: PromotionScope) => scope.scope_type === "category" ? categories.map((item) => ({ id: item.id, label: item.name })) : scope.scope_type === "product" ? products.map((item) => ({ id: item.id, label: item.name })) : scope.scope_type === "variant" ? products.flatMap((product) => product.variants.map((variant) => ({ id: variant.id, label: variantName(product, variant.id) }))) : [];
  return <FormSection description="Chọn sản phẩm được hưởng ưu đãi. SKU là một tổ hợp cụ thể." title="Phạm vi sản phẩm">
    <div className="space-y-2">{value.map((scope, index) => <div className="grid gap-2 rounded-xl bg-slate-50 p-2.5 sm:grid-cols-[1fr_2fr_auto]" key={`${scope.scope_type}-${index}`}>
      <Select aria-label="Loại phạm vi" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, scope_type: event.target.value as PromotionScope["scope_type"], scope_id: null } : item))} value={scope.scope_type}><option value="all">Tất cả sản phẩm</option><option value="category">Danh mục</option><option value="product">Sản phẩm</option><option value="variant">SKU cụ thể</option></Select>
      {scope.scope_type === "all" ? <div className="flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500">Áp dụng cho toàn bộ sản phẩm</div> : <Select aria-label="Đối tượng áp dụng" onChange={(event) => onChange(value.map((item, position) => position === index ? { ...item, scope_id: event.target.value || null } : item))} value={scope.scope_id ?? ""}><option value="">Chọn đối tượng áp dụng</option>{options(scope).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>}
      <Button aria-label="Xóa phạm vi" className="px-3" disabled={value.length === 1} onClick={() => onChange(value.filter((_, position) => position !== index))} variant="danger"><Trash2 className="h-4 w-4" /></Button>
    </div>)}</div>
    {!value.some((scope) => scope.scope_type === "all") ? <Button className="mt-3 w-full sm:w-auto" onClick={() => onChange([...value, { scope_type: "product", scope_id: null }])} variant="secondary"><Plus className="h-4 w-4" />Thêm phạm vi</Button> : null}
  </FormSection>;
}
