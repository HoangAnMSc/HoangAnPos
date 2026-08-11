import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Boxes } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { fetchProducts } from "../features/products/services/productEngine";
import type { Product, ProductVariant } from "../features/products/types";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { issueVariantStock, receiveVariantStock } from "../services/stockMovements";

type Props = { type: "in" | "out" };
type SkuOption = { product: Product; variant: ProductVariant; label: string };

function variantLabel(product: Product, variant: ProductVariant) {
  const values = new Map(
    product.variant_attributes.flatMap((attribute) =>
      attribute.values.map((value) => [value.id, value.label] as const),
    ),
  );
  const selected = variant.value_ids.map((id) => values.get(id)).filter(Boolean);
  return selected.length ? selected.join(" / ") : "Mặc định";
}

export function StockMovementPage({ type }: Props) {
  const inbound = type === "in";
  const [products, setProducts] = useState<Product[]>([]);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [importDate, setImportDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    setSuccess("");
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
          importDate: importDate || null,
          expiryDate: expiryDate || null,
        });
      } else {
        await issueVariantStock(variantId, amount, reason);
      }
      setQuantity("");
      setReason("");
      setImportDate("");
      setExpiryDate("");
      setSuccess(inbound ? "Đã nhập kho cho SKU." : "Đã xuất kho cho SKU.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không cập nhật được tồn kho.");
    } finally {
      setSaving(false);
    }
  }

  const Icon = inbound ? ArrowDownToLine : ArrowUpFromLine;
  const actionLabel = inbound ? "Nhập kho" : "Xuất kho";
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

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-bold">Sản phẩm và SKU</span>
          <Select onChange={(event) => { setVariantId(event.target.value); setError(""); }} value={variantId}>
            <option value="">Chọn SKU cần cập nhật</option>
            {products.map((product) => (
              <optgroup key={product.id} label={product.name}>
                {skuOptions.filter((item) => item.product.id === product.id).map((item) => (
                  <option key={item.variant.id} value={item.variant.id}>
                    {item.variant.sku} · {item.label} · tồn {item.variant.stock_quantity}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </label>

        {selected ? (
          <div className="flex items-center gap-3 rounded-xl border border-moss-100 bg-moss-50/60 p-3 sm:col-span-2">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-slate-400">
              {selected.variant.image_url ? <img alt="" className="h-full w-full object-contain" src={selected.variant.image_url} /> : <Boxes className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{selected.product.name} · {selected.label}</p>
              <p className="text-xs font-semibold text-slate-500">SKU {selected.variant.sku}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-slate-500">Tồn hiện tại</p>
              <strong className="text-xl tabular-nums text-moss-700">{selected.variant.stock_quantity}</strong>
            </div>
          </div>
        ) : null}

        <Input inputMode="numeric" label="Số lượng" onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))} value={formatIntegerInput(quantity)} />
        {inbound ? (
          <Input label="Ngày nhập" onChange={(event) => setImportDate(event.target.value)} type="date" value={importDate} />
        ) : <div />}
        {inbound ? (
          <Input label="Hạn sử dụng (nếu có)" onChange={(event) => setExpiryDate(event.target.value)} type="date" value={expiryDate} />
        ) : (
          <div className="sm:col-span-2"><Textarea label="Lý do xuất kho" onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: hàng hỏng, dùng nội bộ..." value={reason} /></div>
        )}

        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:col-span-2">{error}</p> : null}
        {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700 sm:col-span-2">{success}</p> : null}
        <div className="sm:col-span-2 sm:flex sm:justify-end">
          <Button className="w-full sm:w-auto" isLoading={saving} type="submit"><Icon className="h-4 w-4" />Xác nhận {actionLabel.toLowerCase()}</Button>
        </div>
      </form>
    </Card>
  );
}
