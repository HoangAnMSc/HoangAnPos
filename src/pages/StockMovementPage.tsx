import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { fetchProducts } from "../features/products/services/productEngine";
import type { Product, ProductVariant } from "../features/products/types";
import { getVariantLabel } from "../features/products/utils/variants";
import { useActionNotice } from "../contexts/ActionNoticeContext";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { issueVariantStock, receiveVariantStock } from "../services/stockMovements";

type Props = { type: "in" | "out" };
type SkuOption = { product: Product; variant: ProductVariant; label: string };

function variantLabel(product: Product, variant: ProductVariant) {
  return getVariantLabel(variant, product.variant_attributes);
}

export function StockMovementPage({ type }: Props) {
  const { showSuccess } = useActionNotice();
  const inbound = type === "in";
  const [products, setProducts] = useState<Product[]>([]);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await fetchProducts());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu kho.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const skuOptions = useMemo<SkuOption[]>(
    () => products.flatMap((product) => product.variants
      .filter((variant) => variant.is_active)
      .map((variant) => ({ product, variant, label: variantLabel(product, variant) }))),
    [products],
  );
  const selected = skuOptions.find((item) => item.variant.id === variantId) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    setError("");
    if (!selected || !Number.isInteger(amount) || amount <= 0) {
      setError("Chọn SKU và nhập số lượng nguyên lớn hơn 0.");
      return;
    }
    if (!inbound && !reason.trim()) {
      setError("Vui lòng nhập lý do xuất kho.");
      return;
    }
    if (!inbound && amount > selected.variant.stock_quantity) {
      setError(`SKU này chỉ còn ${selected.variant.stock_quantity} sản phẩm.`);
      return;
    }
    setSaving(true);
    try {
      if (inbound) {
        await receiveVariantStock({
          variantId,
          quantity: amount,
          importDate: null,
          expiryDate: null,
        });
      } else {
        await issueVariantStock(variantId, amount, reason);
      }
      setQuantity("");
      setReason("");
      showSuccess(inbound ? "Đã nhập kho cho SKU." : "Đã xuất kho cho SKU.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không cập nhật được tồn kho.");
    } finally {
      setSaving(false);
    }
  }

  const Icon = inbound ? ArrowDownToLine : ArrowUpFromLine;
  const actionLabel = inbound ? "Nhập kho" : "Xuất kho";
  const movementIconClass = inbound
    ? "bg-emerald-50 text-emerald-700"
    : "bg-red-50 text-red-700";
  if (loading && !products.length) return <Spinner label="Đang tải danh sách SKU..." />;

  return (
    <Card className="mx-auto max-w-3xl border border-slate-200 p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss-50 text-moss-700">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-black sm:text-lg">{actionLabel} theo SKU</h2>
          <p className="text-xs font-semibold text-slate-500 sm:text-sm">
            Mỗi thao tác chỉ cập nhật tồn của đúng một tổ hợp sản phẩm.
          </p>
        </div>
      </div>

      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <section className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-extrabold text-slate-900">Chọn sản phẩm</p>
            <span className="text-xs font-bold text-slate-500">{skuOptions.length} SKU</span>
          </div>
          {skuOptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500">Chưa có SKU khả dụng.</div>
          ) : (
            <div className="max-h-[52vh] space-y-2 overflow-y-auto overscroll-contain rounded-2xl bg-slate-50/80 p-2.5">
              {skuOptions.map((item) => {
                const active = item.variant.id === variantId;
                const imageUrl =
                  item.variant.image_url ??
                  item.product.images.find((image) => image.is_primary)?.image_url ??
                  item.product.images[0]?.image_url ??
                  null;
                return (
                  <button
                    aria-pressed={active}
                    className={`grid w-full min-w-0 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition ${active ? inbound ? "border-moss-300 bg-moss-50 ring-2 ring-moss-100" : "border-red-200 bg-red-50/70 ring-2 ring-red-100" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    key={item.variant.id}
                    onClick={() => { setVariantId(item.variant.id); setError(""); }}
                    type="button"
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                      {imageUrl ? <img alt={item.product.name} className="h-full w-full object-contain p-1" src={imageUrl} /> : <Boxes className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-slate-950">{item.product.name}</strong>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{item.label} · {item.variant.sku}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2.5">
                      <span className={`text-right ${active ? inbound ? "text-moss-700" : "text-red-700" : "text-slate-600"}`}>
                        <span className="block text-[9px] font-extrabold uppercase">Tồn</span>
                        <strong className="text-lg tabular-nums">{item.variant.stock_quantity}</strong>
                      </span>
                      <span className={`grid h-10 w-10 place-items-center rounded-xl ${movementIconClass}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className={inbound ? "sm:col-span-2 sm:max-w-sm" : ""}>
          <Input inputMode="numeric" label="Số lượng" onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))} value={formatIntegerInput(quantity)} />
        </div>
        {!inbound ? (
          <div><Textarea label="Lý do xuất kho" onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: hàng hỏng, dùng nội bộ..." value={reason} /></div>
        ) : null}

        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2 sm:flex sm:justify-end">
          <Button className="w-full sm:w-auto" isLoading={saving} type="submit"><Icon className="h-4 w-4" />Xác nhận {actionLabel.toLowerCase()}</Button>
        </div>
      </form>
    </Card>
  );
}
