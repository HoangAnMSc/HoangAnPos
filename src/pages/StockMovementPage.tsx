import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { WarehouseProductActions } from "../components/warehouse/WarehouseProductActions";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { fetchProducts, receiveProductStock } from "../services/products";
import { issueProductStock } from "../services/stockMovements";
import type { Product } from "../types";

type Props = { type: "in" | "out" };

export function StockMovementPage({ type }: Props) {
  const inbound = type === "in";
  const [products, setProducts] = useState<Product[]>([]);
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
      setProducts(await fetchProducts());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không tải được dữ liệu kho."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === productId) ?? null,
    [productId, products]
  );

  function selectProduct(product: Product) {
    setProductId(product.id);
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(quantity);
    setError("");
    setSuccess("");

    if (!productId || !Number.isInteger(amount) || amount <= 0) {
      setError("Chọn sản phẩm và nhập số lượng nguyên lớn hơn 0.");
      return;
    }
    if (!inbound && !reason.trim()) {
      setError("Xuất kho bắt buộc nhập lý do.");
      return;
    }
    if (!inbound && selectedProduct && amount > selectedProduct.stock) {
      setError("Số lượng xuất vượt quá tồn kho hiện tại.");
      return;
    }

    setSaving(true);
    try {
      if (inbound) {
        await receiveProductStock({
          product_id: productId,
          quantity: amount,
          import_date: importDate || null,
          expiry_date: expiryDate || null,
        });
      } else {
        await issueProductStock(productId, amount, reason);
      }

      setQuantity("");
      setReason("");
      setImportDate("");
      setExpiryDate("");
      setSuccess(inbound ? "Đã nhập kho thành công." : "Đã xuất kho thành công.");
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không cập nhật được kho."
      );
    } finally {
      setSaving(false);
    }
  }

  const Icon = inbound ? ArrowDownToLine : ArrowUpFromLine;
  const actionLabel = inbound ? "Nhập kho" : "Xuất kho";

  if (loading && products.length === 0) {
    return <Spinner label={`Đang tải dữ liệu ${actionLabel.toLocaleLowerCase("vi")}...`} />;
  }

  return (
    <div className="pb-24">
      <Card className="mx-auto max-w-4xl border border-slate-200 p-4 shadow-soft">
        <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-moss-50 text-moss-700">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold sm:text-lg">
              {actionLabel}
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 sm:text-sm">
              {inbound
                ? "Tạo lô hàng và cộng tồn kho."
                : "Trừ tồn kho, lưu người thực hiện và lý do."}
            </p>
          </div>
        </div>

        <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Sản phẩm</span>
            <Select onChange={(event) => setProductId(event.target.value)} value={productId}>
              <option value="">Chọn sản phẩm</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · tồn {item.stock}
                </option>
              ))}
            </Select>
          </label>
          <Input
            inputMode="numeric"
            label="Số lượng"
            onChange={(event) => setQuantity(normalizeIntegerInput(event.target.value))}
            value={formatIntegerInput(quantity)}
          />

          {inbound ? (
            <>
              <Input
                label="Ngày nhập"
                onChange={(event) => setImportDate(event.target.value)}
                type="date"
                value={importDate}
              />
              <Input
                label="Ngày hết hạn"
                onChange={(event) => setExpiryDate(event.target.value)}
                type="date"
                value={expiryDate}
              />
            </>
          ) : (
            <div className="md:col-span-2">
              <Textarea
                label="Lý do xuất kho"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ví dụ: hàng hỏng, dùng nội bộ, chuyển kho..."
                value={reason}
              />
            </div>
          )}

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
              <Icon className="h-4 w-4" />
              Xác nhận {actionLabel.toLocaleLowerCase("vi")}
            </Button>
          </div>
        </form>
      </Card>

      <WarehouseProductActions
        actionLabel={actionLabel}
        onSelect={selectProduct}
        products={products}
        selectedProductId={productId}
      />
    </div>
  );
}
