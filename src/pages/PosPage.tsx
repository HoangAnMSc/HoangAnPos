import { FormEvent, useEffect, useState } from "react";
import {
  BadgeDollarSign,
  Minus,
  PackageSearch,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency } from "../lib/format";
import { createCustomer, fetchCustomers, type CustomerInput } from "../services/customers";
import { createSale } from "../services/orders";
import { fetchProducts, getActiveProducts } from "../services/products";
import type { CartItem, Customer, Product } from "../types";

type QuickCustomerFormState = {
  name: string;
  phone: string;
  note: string;
};

const emptyCustomerForm: QuickCustomerFormState = {
  name: "",
  note: "",
  phone: "",
};

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type QuickCustomerFormProps = {
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: CustomerInput) => Promise<void>;
};

function QuickCustomerForm({ onCancel, onSubmit, submitting }: QuickCustomerFormProps) {
  const [form, setForm] = useState(emptyCustomerForm);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    if (!name) {
      setError("Tên khách hàng là bắt buộc.");
      return;
    }

    await onSubmit({
      name,
      note: normalizeText(form.note),
      phone: normalizeText(form.phone),
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Input
        label="Tên khách"
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        placeholder="Tên khách hàng"
        required
        value={form.name}
      />
      <Input
        label="Số điện thoại"
        onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
        placeholder="090..."
        value={form.phone}
      />
      <Textarea
        label="Ghi chú nhanh"
        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
        placeholder="Ví dụ: khách thân thiết, cần giao chiều nay..."
        value={form.note}
      />
      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button onClick={onCancel} type="button" variant="secondary">
          Hủy
        </Button>
        <Button isLoading={submitting} type="submit">
          Lưu khách
        </Button>
      </div>
    </form>
  );
}

export function PosPage() {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [discount, setDiscount] = useState("0");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [success, setSuccess] = useState("");

  async function loadPosData() {
    setLoading(true);
    setError("");

    try {
      const [productData, customerData] = await Promise.all([fetchProducts(), fetchCustomers()]);
      setProducts(productData);
      setCustomers(customerData);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Không tải được dữ liệu POS."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPosData();
  }, []);

  function getQuantityInCart(productId: string) {
    return cart.find((item) => item.product.id === productId)?.quantity ?? 0;
  }

  function addToCart(product: Product) {
    setSuccess("");
    setError("");

    if (product.stock <= 0) {
      setError("Sản phẩm này đã hết hàng.");
      return;
    }

    setCart((current) => {
      const existingItem = current.find((item) => item.product.id === product.id);

      if (existingItem) {
        if (existingItem.quantity >= product.stock) {
          return current;
        }

        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, nextQuantity: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) {
            return item;
          }

          return {
            ...item,
            quantity: Math.min(Math.max(nextQuantity, 0), item.product.stock),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((item) => item.product.id !== productId));
  }

  async function handleCreateCustomer(input: CustomerInput) {
    setSubmittingCustomer(true);
    setError("");

    try {
      const customer = await createCustomer(input);
      setCustomers((current) => [customer, ...current]);
      setSelectedCustomerId(customer.id);
      setCustomerModalOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Không thêm được khách hàng."
      );
    } finally {
      setSubmittingCustomer(false);
    }
  }

  async function handleCheckout() {
    const discountValue = Number(discount || 0);
    setError("");
    setSuccess("");

    if (cart.length === 0) {
      setError("Giỏ hàng đang trống.");
      return;
    }

    if (Number.isNaN(discountValue) || discountValue < 0) {
      setError("Giảm giá phải là số không âm.");
      return;
    }

    setSubmittingSale(true);

    try {
      const order = await createSale({
        cashierId: user?.id ?? null,
        cart,
        customerId: selectedCustomerId || null,
        discount: discountValue,
      });

      setCart([]);
      setDiscount("0");
      setSuccess(`Đã tạo hóa đơn ${order.code} với tổng tiền ${formatCurrency(order.total)}.`);
      await loadPosData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Tạo hóa đơn thất bại."
      );
    } finally {
      setSubmittingSale(false);
    }
  }

  const activeProducts = getActiveProducts(products);
  const categories = Array.from(
    new Set(activeProducts.map((product) => product.category).filter(Boolean))
  ) as string[];
  const normalizedQuery = productQuery.trim().toLowerCase();
  const filteredProducts = activeProducts.filter((product) => {
    const matchesQuery = [product.name, product.sku, product.category]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;
    return matchesQuery && matchesCategory;
  });
  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const safeDiscount = Math.min(Math.max(Number(discount || 0) || 0, 0), subtotal);
  const total = subtotal - safeDiscount;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      <ConfigNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Sản phẩm đang bán
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{activeProducts.length}</p>
        </Card>
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Mặt hàng trong giỏ
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{totalItems}</p>
        </Card>
        <Card>
          <p className="text-sm font-extrabold uppercase tracking-wide text-coal/45">
            Tổng thanh toán
          </p>
          <p className="mt-2 font-display text-3xl font-bold">{formatCurrency(total)}</p>
        </Card>
      </div>

      {error ? (
        <div className="rounded-3xl bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-3xl bg-moss/10 px-5 py-4 text-sm font-semibold text-moss">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card>
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
              <Input
                className="pl-11"
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Tìm sản phẩm để bán..."
                value={productQuery}
              />
            </div>
            <Select
              className="lg:w-56"
              onChange={(event) => setSelectedCategory(event.target.value)}
              value={selectedCategory}
            >
              <option value="all">Tất cả nhóm</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <Spinner />
          ) : filteredProducts.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                description="Hãy thêm sản phẩm đang bán ở trang Sản phẩm để xuất hiện trong POS."
                icon={PackageSearch}
                title="Không có sản phẩm phù hợp"
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const quantityInCart = getQuantityInCart(product.id);
                const outOfStock = product.stock <= 0 || quantityInCart >= product.stock;

                return (
                  <button
                    className="group rounded-[1.75rem] border border-coal/10 bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-clay/40 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={outOfStock}
                    key={product.id}
                    onClick={() => addToCart(product)}
                    type="button"
                  >
                    <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-coal/5">
                      {product.image_url ? (
                        <img
                          alt={product.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          src={product.image_url}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-coal/35">
                          <ShoppingCart className="h-9 w-9" />
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-lg font-bold">{product.name}</h3>
                        <p className="mt-1 text-sm text-coal/50">
                          {product.category || "Chưa phân nhóm"}
                        </p>
                      </div>
                      <Badge tone={product.stock > 0 ? "green" : "red"}>
                        Tồn {product.stock}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <p className="font-display text-xl font-bold text-clay">
                        {formatCurrency(product.price)}
                      </p>
                      <span className="rounded-full bg-coal px-3 py-1 text-xs font-extrabold text-white">
                        {quantityInCart > 0 ? `Đã chọn ${quantityInCart}` : "Thêm"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="xl:sticky xl:top-28 xl:self-start">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide text-clay">
                Hóa đơn
              </p>
              <h2 className="font-display text-2xl font-bold">Giỏ hàng</h2>
            </div>
            <div className="rounded-3xl bg-coal p-3 text-white">
              <ReceiptText className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <Select
              label="Khách hàng"
              onChange={(event) => setSelectedCustomerId(event.target.value)}
              value={selectedCustomerId}
            >
              <option value="">Khách lẻ</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} {customer.phone ? `- ${customer.phone}` : ""}
                </option>
              ))}
            </Select>
            <Button onClick={() => setCustomerModalOpen(true)} variant="secondary">
              <UserPlus className="h-4 w-4" />
              Thêm khách nhanh
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {cart.length === 0 ? (
              <EmptyState
                description="Bấm vào sản phẩm bên trái để thêm vào hóa đơn."
                icon={BadgeDollarSign}
                title="Giỏ hàng còn trống"
              />
            ) : (
              cart.map((item) => (
                <div className="rounded-3xl bg-cream p-4" key={item.product.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{item.product.name}</h3>
                      <p className="mt-1 text-sm text-coal/55">
                        {formatCurrency(item.product.price)} x {item.quantity}
                      </p>
                    </div>
                    <Button
                      className="h-9 w-9 p-0"
                      onClick={() => removeFromCart(item.product.id)}
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        className="h-9 w-9 p-0"
                        onClick={() => changeQuantity(item.product.id, item.quantity - 1)}
                        variant="secondary"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="min-w-8 text-center font-display text-lg font-bold">
                        {item.quantity}
                      </span>
                      <Button
                        className="h-9 w-9 p-0"
                        disabled={item.quantity >= item.product.stock}
                        onClick={() => changeQuantity(item.product.id, item.quantity + 1)}
                        variant="secondary"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="font-display text-lg font-bold">
                      {formatCurrency(item.product.price * item.quantity)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 space-y-3 rounded-3xl bg-white/70 p-4">
            <div className="flex justify-between text-sm font-bold text-coal/65">
              <span>Tạm tính</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <Input
              label="Giảm giá"
              min="0"
              onChange={(event) => setDiscount(event.target.value)}
              type="number"
              value={discount}
            />
            <div className="flex justify-between text-sm font-bold text-coal/65">
              <span>Giảm</span>
              <span>{formatCurrency(safeDiscount)}</span>
            </div>
            <div className="border-t border-coal/10 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-display text-xl font-bold">Tổng</span>
                <span className="font-display text-2xl font-bold text-clay">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>

          <Button
            className="mt-5 w-full"
            disabled={cart.length === 0}
            isLoading={submittingSale}
            onClick={handleCheckout}
          >
            Thanh toán
          </Button>
        </Card>
      </div>

      <Modal
        onClose={() => setCustomerModalOpen(false)}
        open={customerModalOpen}
        title="Thêm khách nhanh"
      >
        <QuickCustomerForm
          onCancel={() => setCustomerModalOpen(false)}
          onSubmit={handleCreateCustomer}
          submitting={submittingCustomer}
        />
      </Modal>
    </div>
  );
}
