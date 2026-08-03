import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { formatProductDate } from "../lib/productDisplay";
import { fetchProductBatches, fetchProducts, transferProductShelf } from "../services/products";
import { fetchShelfMovements, type StockMovement } from "../services/stockMovements";
import type { Product, ProductBatch } from "../types";

type Direction = "to_shelf" | "to_warehouse";

export function ShelfTransferPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [direction, setDirection] = useState<Direction>("to_shelf");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProducts, nextBatches, nextMovements] = await Promise.all([fetchProducts(), fetchProductBatches(), fetchShelfMovements()]);
      setProducts(nextProducts);
      setBatches(nextBatches);
      setMovements(nextMovements);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu kho và kệ.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const productBatches = useMemo(
    () => batches.filter((batch) => batch.product_id === productId),
    [batches, productId]
  );
  const selectedBatch = batches.find((batch) => batch.id === batchId) ?? null;
  const available = selectedBatch
    ? direction === "to_shelf"
      ? selectedBatch.quantity - selectedBatch.shelf_quantity
      : selectedBatch.shelf_quantity
    : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    setError("");
    setSuccess("");
    if (!productId || !batchId || !Number.isInteger(amount) || amount <= 0) {
      setError("Chọn sản phẩm, lô hàng và nhập số lượng hợp lệ.");
      return;
    }
    if (amount > available) {
      setError(`Số lượng chuyển vượt quá số hiện có (${available}).`);
      return;
    }
    setSaving(true);
    try {
      await transferProductShelf(productId, batchId, amount, direction);
      setQuantity("");
      setSuccess(direction === "to_shelf" ? "Đã chuyển hàng lên kệ." : "Đã chuyển hàng về kho.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không chuyển được hàng.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && products.length === 0) return <Spinner label="Đang tải kho và kệ..." />;

  return (
    <div className="space-y-4"><Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold">Chuyển hàng kho – kệ</h3>
          <p className="mt-1 text-sm text-slate-500">Chuyển theo đúng lô; tổng tồn không thay đổi.</p>
        </div>
        <Button disabled={loading} onClick={() => void load()} variant="secondary">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Làm mới
        </Button>
      </div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
        <label><span className="mb-1.5 block text-sm font-bold">Hướng chuyển</span>
          <Select onChange={(event) => { setDirection(event.target.value as Direction); setQuantity(""); }} value={direction}>
            <option value="to_shelf">Trong kho → Trên kệ</option>
            <option value="to_warehouse">Trên kệ → Trong kho</option>
          </Select>
        </label>
        <label><span className="mb-1.5 block text-sm font-bold">Sản phẩm</span>
          <Select onChange={(event) => { setProductId(event.target.value); setBatchId(""); }} value={productId}>
            <option value="">Chọn sản phẩm</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · Tổng {product.stock} · Kệ {product.shelf_stock}</option>)}
          </Select>
        </label>
        <label><span className="mb-1.5 block text-sm font-bold">Lô hàng</span>
          <Select disabled={!productId} onChange={(event) => setBatchId(event.target.value)} value={batchId}>
            <option value="">Chọn lô</option>
            {productBatches.map((batch) => <option key={batch.id} value={batch.id}>HSD {formatProductDate(batch.expiry_date)} · Kho {batch.quantity - batch.shelf_quantity} · Kệ {batch.shelf_quantity}</option>)}
          </Select>
        </label>
        <Input inputMode="numeric" label={`Số lượng (có thể chuyển: ${available})`} onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))} value={formatIntegerInput(quantity)} />
        {error ? <p className="md:col-span-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        {success ? <p className="md:col-span-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p> : null}
        <div className="md:col-span-2"><Button isLoading={saving} type="submit">
          {direction === "to_shelf" ? <ArrowUpToLine className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}
          Xác nhận chuyển
        </Button></div>
      </form>
    </Card>
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 px-4 py-3 font-extrabold">Lịch sử chuyển kệ</div>
      {movements.length === 0 ? <p className="p-5 text-sm font-semibold text-slate-500">Chưa có lần chuyển hàng nào.</p> : (
        <div className="divide-y divide-slate-100">{movements.map((movement) => (
          <div className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:gap-4" key={movement.id}>
            <p className="font-extrabold">{movement.products?.name ?? "Sản phẩm"}</p>
            <p className={`font-black ${movement.movement_type === "to_shelf" ? "text-sky-700" : "text-amber-700"}`}>
              {movement.movement_type === "to_shelf" ? "Lên kệ" : "Về kho"} · {movement.quantity}
            </p>
            <p className="text-xs text-slate-500 sm:text-right">{movement.actor_name}<br />{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.created_at))}</p>
          </div>
        ))}</div>
      )}
    </Card></div>
  );
}
