import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { fetchProducts, receiveProductStock } from "../services/products";
import { fetchStockMovements, issueProductStock, type StockMovement } from "../services/stockMovements";
import type { Product } from "../types";

type Props = { type: "in" | "out" };

export function StockMovementPage({ type }: Props) {
  const inbound = type === "in";
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [productId, setProductId] = useState("");
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
      const [nextProducts, nextMovements] = await Promise.all([fetchProducts(), fetchStockMovements(type)]);
      setProducts(nextProducts);
      setMovements(nextMovements);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu kho.");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { void load(); }, [load]);
  const selectedProduct = useMemo(() => products.find((item) => item.id === productId) ?? null, [productId, products]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    setError(""); setSuccess("");
    if (!productId || !Number.isInteger(amount) || amount <= 0) {
      setError("Chọn sản phẩm và nhập số lượng nguyên lớn hơn 0."); return;
    }
    if (!inbound && !reason.trim()) { setError("Xuất kho bắt buộc nhập lý do."); return; }
    if (!inbound && selectedProduct && amount > selectedProduct.stock) { setError("Số lượng xuất vượt quá tồn kho hiện tại."); return; }
    setSaving(true);
    try {
      if (inbound) {
        await receiveProductStock({ product_id: productId, quantity: amount, import_date: importDate || null, expiry_date: expiryDate || null });
      } else {
        await issueProductStock(productId, amount, reason);
      }
      setQuantity(""); setReason(""); setImportDate(""); setExpiryDate("");
      setSuccess(inbound ? "Đã nhập kho thành công." : "Đã xuất kho thành công.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không cập nhật được kho.");
    } finally { setSaving(false); }
  }

  const Icon = inbound ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h3 className="flex items-center gap-2 text-lg font-extrabold"><Icon className="h-5 w-5 text-moss-700" />{inbound ? "Nhập kho" : "Xuất kho"}</h3><p className="mt-1 text-sm text-slate-500">{inbound ? "Tạo lô hàng và cộng tồn kho." : "Trừ tồn kho, lưu người thực hiện và lý do."}</p></div>
          <Button disabled={loading} onClick={() => void load()} variant="secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Làm mới</Button>
        </div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <label className="block"><span className="mb-1.5 block text-sm font-bold">Sản phẩm</span><Select onChange={(event) => setProductId(event.target.value)} value={productId}><option value="">Chọn sản phẩm</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · tồn {item.stock}</option>)}</Select></label>
          <Input inputMode="numeric" label="Số lượng" onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))} value={formatIntegerInput(quantity)} />
          {inbound ? <><Input label="Ngày nhập" onChange={(event) => setImportDate(event.target.value)} type="date" value={importDate} /><Input label="Ngày hết hạn" onChange={(event) => setExpiryDate(event.target.value)} type="date" value={expiryDate} /></> : <div className="md:col-span-2"><Textarea label="Lý do xuất kho" onChange={(event) => setReason(event.target.value)} placeholder="Ví dụ: hàng hỏng, dùng nội bộ, chuyển kho..." value={reason} /></div>}
          {error ? <p className="md:col-span-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
          {success ? <p className="md:col-span-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p> : null}
          <div className="md:col-span-2"><Button isLoading={saving} type="submit"><Icon className="h-4 w-4" />{inbound ? "Xác nhận nhập kho" : "Xác nhận xuất kho"}</Button></div>
        </form>
      </Card>
      <Card className="overflow-hidden p-0"><div className="border-b border-slate-200 px-4 py-3 font-extrabold">100 giao dịch gần nhất</div>{loading ? <Spinner label="Đang tải lịch sử..." /> : movements.length === 0 ? <EmptyState description="Giao dịch sẽ xuất hiện sau khi cập nhật kho." icon={Icon} title="Chưa có lịch sử" /> : <div className="divide-y divide-slate-100">{movements.map((item) => <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-4" key={item.id}><div><p className="font-extrabold">{item.products?.name ?? "Sản phẩm"}</p><p className="text-xs text-slate-500">{item.reason || (inbound ? "Nhập kho" : "—")}</p></div><p className={`font-black ${inbound ? "text-emerald-700" : "text-red-700"}`}>{inbound ? "+" : "−"}{item.quantity}</p><p className="text-xs text-slate-500 sm:text-right">{item.actor_name}<br />{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.created_at))}</p></div>)}</div>}</Card>
    </div>
  );
}
