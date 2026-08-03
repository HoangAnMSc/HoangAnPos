import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpToLine } from "lucide-react";
import { WarehouseProductActions } from "../components/warehouse/WarehouseProductActions";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { formatProductDate } from "../lib/productDisplay";
import {
  fetchProductBatches,
  fetchProducts,
  transferProductShelf,
} from "../services/products";
import type { Product, ProductBatch } from "../types";

type Direction = "to_shelf" | "to_warehouse";

export function ShelfTransferPage() {
  const [products, setProducts] = useState<Product[]>([]);
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
    setError("");

    try {
      const [nextProducts, nextBatches] = await Promise.all([
        fetchProducts(),
        fetchProductBatches(),
      ]);
      setProducts(nextProducts);
      setBatches(nextBatches);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không tải được dữ liệu kho và kệ."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  function selectProduct(product: Product) {
    setProductId(product.id);
    setBatchId("");
    setQuantity("");
    setError("");
    setSuccess("");
  }

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
      setSuccess(
        direction === "to_shelf"
          ? "Đã chuyển hàng lên kệ."
          : "Đã chuyển hàng về kho."
      );
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Không chuyển được hàng."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && products.length === 0) {
    return <Spinner label="Đang tải kho và kệ..." />;
  }

  return (
    <div className="pb-24">
      <Card className="mx-auto max-w-4xl border border-slate-200 p-4 shadow-soft">
        <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <ArrowLeftRight className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold sm:text-lg">Chuyển hàng kho – kệ</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 sm:text-sm">
              Chuyển theo đúng lô; tổng tồn không thay đổi.
            </p>
          </div>
        </div>

        <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <label>
            <span className="mb-1.5 block text-sm font-bold">Hướng chuyển</span>
            <Select
              onChange={(event) => {
                setDirection(event.target.value as Direction);
                setQuantity("");
              }}
              value={direction}
            >
              <option value="to_shelf">Trong kho → Trên kệ</option>
              <option value="to_warehouse">Trên kệ → Trong kho</option>
            </Select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-bold">Sản phẩm</span>
            <Select
              onChange={(event) => {
                setProductId(event.target.value);
                setBatchId("");
              }}
              value={productId}
            >
              <option value="">Chọn sản phẩm</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · Tổng {product.stock} · Kệ {product.shelf_stock}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-bold">Lô hàng</span>
            <Select
              disabled={!productId}
              onChange={(event) => setBatchId(event.target.value)}
              value={batchId}
            >
              <option value="">Chọn lô</option>
              {productBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  HSD {formatProductDate(batch.expiry_date)} · Kho{" "}
                  {batch.quantity - batch.shelf_quantity} · Kệ {batch.shelf_quantity}
                </option>
              ))}
            </Select>
          </label>

          <Input
            inputMode="numeric"
            label={`Số lượng (có thể chuyển: ${available})`}
            onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))}
            value={formatIntegerInput(quantity)}
          />

          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 md:col-span-2">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700 md:col-span-2">
              {success}
            </p>
          ) : null}

          <div className="flex justify-end md:col-span-2">
            <Button className="w-full sm:w-auto" isLoading={saving} type="submit">
              {direction === "to_shelf" ? (
                <ArrowUpToLine className="h-4 w-4" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              Xác nhận chuyển
            </Button>
          </div>
        </form>
      </Card>

      <WarehouseProductActions
        actionLabel="Chuyển kệ"
        onSelect={selectProduct}
        products={products}
        selectedProductId={productId}
      />
    </div>
  );
}
