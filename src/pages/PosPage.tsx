import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Barcode,
  Bell,
  Check,
  ChevronDown,
  DollarSign,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Save,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { ProductCard } from "../components/products/ProductCard";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { formatCurrency } from "../lib/format";
import {
  findProductByEan13,
  getProductEan13Value,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import { createCustomer, fetchCustomers, type CustomerInput } from "../services/customers";
import { createSale } from "../services/orders";
import { fetchProducts, getActiveProducts } from "../services/products";
import type { CartItem, Customer, Product } from "../types";

type PosCartItem = CartItem & {
  lineId: string;
};

type PosBill = {
  id: number;
  cart: PosCartItem[];
  cashReceived: string;
  customerQuery: string;
  discount: string;
  orderNote: string;
  paymentMethod: string;
  savedAt: string | null;
  selectedCustomerId: string;
};

type PosWorkspace = {
  activeBillId: number;
  bills: PosBill[];
};

type QuickCustomerFormState = {
  name: string;
  phone: string;
  note: string;
};

const posWorkspaceStorageKey = "hoang-an-pos:pos-workspace:v1";

const emptyCustomerForm: QuickCustomerFormState = {
  name: "",
  note: "",
  phone: "",
};
const renderLegacyModalActions = false;

function createLineId(productId: string) {
  return `${productId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createEmptyBill(id: number): PosBill {
  return {
    id,
    cart: [],
    cashReceived: "",
    customerQuery: "",
    discount: "0",
    orderNote: "",
    paymentMethod: "cash",
    savedAt: null,
    selectedCustomerId: "",
  };
}

function normalizeCartItem(item: CartItem & { lineId?: string }, index: number): PosCartItem {
  return {
    ...item,
    lineId: item.lineId || `${item.product.id}-${index}`,
  };
}

function normalizeBill(value: Partial<PosBill> | undefined, fallbackId: number): PosBill {
  const cart = Array.isArray(value?.cart)
    ? value.cart.map((item, index) => normalizeCartItem(item, index))
    : [];

  return {
    ...createEmptyBill(Number(value?.id) || fallbackId),
    ...value,
    cart,
    discount: String(value?.discount ?? "0"),
    cashReceived: String(value?.cashReceived ?? ""),
    paymentMethod: value?.paymentMethod || "cash",
    savedAt: value?.savedAt || null,
  };
}

function createInitialWorkspace(): PosWorkspace {
  return {
    activeBillId: 1,
    bills: [createEmptyBill(1), createEmptyBill(2)],
  };
}

function loadPosWorkspace(): PosWorkspace {
  if (typeof window === "undefined") {
    return createInitialWorkspace();
  }

  try {
    const rawValue = window.localStorage.getItem(posWorkspaceStorageKey);
    if (!rawValue) {
      return createInitialWorkspace();
    }

    const parsed = JSON.parse(rawValue) as Partial<PosWorkspace>;
    const loadedBills = Array.isArray(parsed.bills)
      ? parsed.bills.map((bill, index) => normalizeBill(bill, index + 1))
      : [];
    const bills = loadedBills.length > 0 ? loadedBills : createInitialWorkspace().bills;
    const activeBillId = bills.some((bill) => bill.id === parsed.activeBillId)
      ? Number(parsed.activeBillId)
      : bills[0].id;

    return { activeBillId, bills };
  } catch {
    return createInitialWorkspace();
  }
}

function getNextBillId(bills: PosBill[]) {
  return bills.reduce((maxId, bill) => Math.max(maxId, bill.id), 0) + 1;
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ShortcutTag({ children }: { children: string }) {
  return (
    <span className="inline-flex h-8 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-extrabold text-slate-500 shadow-sm">
      {children}
    </span>
  );
}

function formatCustomerLabel(customer: Customer) {
  return `${customer.name}${customer.phone ? ` - ${customer.phone}` : ""}`;
}

type QuickCustomerFormProps = {
  formId: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (input: CustomerInput) => Promise<void>;
};

function QuickCustomerForm({ formId, onCancel, onSubmit, submitting }: QuickCustomerFormProps) {
  const [form, setForm] = useState(emptyCustomerForm);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const name = form.name.trim();
    if (!name) {
      setError("Ten khach hang la bat buoc.");
      return;
    }

    await onSubmit({
      name,
      note: normalizeText(form.note),
      phone: normalizeText(form.phone),
    });
  }

  return (
    <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
      <Input
        label="Ten khach"
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        placeholder="Ten khach hang"
        required
        value={form.name}
      />
      <Input
        label="So dien thoai"
        onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
        placeholder="090..."
        value={form.phone}
      />
      <Textarea
        label="Ghi chu nhanh"
        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
        placeholder="Vi du: khach than thiet, can giao chieu nay..."
        value={form.note}
      />
      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      {renderLegacyModalActions ? (
        <div className="hidden">
        <Button onClick={onCancel} type="button" variant="secondary">
          Huy
        </Button>
        <Button isLoading={submitting} type="submit">
          Luu khach
        </Button>
        </div>
      ) : null}
    </form>
  );
}

export function PosPage() {
  const { profile, user } = useAuth();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const paidAmountRef = useRef<HTMLInputElement>(null);

  const [autoPrint, setAutoPrint] = useState(true);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [lineSeparated, setLineSeparated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [success, setSuccess] = useState("");
  const [workspace, setWorkspace] = useState<PosWorkspace>(() => loadPosWorkspace());

  const activeBill =
    workspace.bills.find((bill) => bill.id === workspace.activeBillId) ??
    workspace.bills[0] ??
    createEmptyBill(1);
  const cart = activeBill?.cart ?? [];
  const cashReceived = activeBill?.cashReceived ?? "";
  const customerQuery = activeBill?.customerQuery ?? "";
  const discount = activeBill?.discount ?? "0";
  const orderNote = activeBill?.orderNote ?? "";
  const paymentMethod = activeBill?.paymentMethod ?? "cash";
  const selectedCustomerId = activeBill?.selectedCustomerId ?? "";

  const showErrorNotice = useCallback((message: string, title = "Thong bao loi") => {
    setError(message);
    setErrorNotice({ message, title });
  }, []);

  const loadPosData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [productData, customerData] = await Promise.all([fetchProducts(), fetchCustomers()]);
      setProducts(productData);
      setCustomers(customerData);
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Khong tai duoc du lieu POS.",
        "Khong tai duoc du lieu POS"
      );
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  useEffect(() => {
    void loadPosData();
  }, [loadPosData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(posWorkspaceStorageKey, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => {
    if (products.length === 0) {
      return;
    }

    const productsById = new Map(products.map((product) => [product.id, product]));

    setWorkspace((current) => {
      let changed = false;
      const bills = current.bills.map((bill) => {
        const refreshedCart = bill.cart
          .map((item): PosCartItem | null => {
            const freshProduct = productsById.get(item.product.id);
            if (!freshProduct) {
              return item;
            }

            if (!freshProduct.is_active || freshProduct.stock <= 0) {
              changed = true;
              return null;
            }

            const quantity = Math.min(item.quantity, freshProduct.stock);
            if (quantity !== item.quantity || freshProduct !== item.product) {
              changed = true;
            }

            return { ...item, product: freshProduct, quantity };
          })
          .filter((item): item is PosCartItem => Boolean(item));

        return changed ? { ...bill, cart: refreshedCart } : bill;
      });

      return changed ? { ...current, bills } : current;
    });
  }, [products]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        customerSearchRef.current?.focus();
      }

      if (event.key === "F3") {
        event.preventDefault();
        productSearchRef.current?.focus();
      }

      if (event.key === "F4") {
        event.preventDefault();
        paidAmountRef.current?.focus();
      }

      if (event.key === "F6") {
        event.preventDefault();
        discountRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const activeProducts = useMemo(() => getActiveProducts(products), [products]);
  const normalizedProductQuery = productQuery.trim().toLowerCase();
  const productResults = useMemo(() => {
    if (!normalizedProductQuery) {
      return [];
    }

    return activeProducts
      .filter((product) =>
        [product.name, product.sku, product.category, getProductEan13Value(product)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedProductQuery))
      )
      .slice(0, 8);
  }, [activeProducts, normalizedProductQuery]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const normalizedCustomerQuery = customerQuery.trim().toLowerCase();
  const customerResults = useMemo(() => {
    if (!normalizedCustomerQuery || selectedCustomer) {
      return [];
    }

    return customers
      .filter((customer) =>
        [customer.name, customer.phone, customer.email]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedCustomerQuery))
      )
      .slice(0, 6);
  }, [customers, normalizedCustomerQuery, selectedCustomer]);

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const rawDiscount = Number(discount || 0);
  const safeDiscount = Math.min(Math.max(Number.isNaN(rawDiscount) ? 0 : rawDiscount, 0), subtotal);
  const total = subtotal - safeDiscount;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const paidAmount = Number(cashReceived || 0) || 0;
  const changeAmount = Math.max(paidAmount - total, 0);
  const displayName = profile?.full_name || user?.email || "Nguoi dung";
  const userInitial = displayName.trim().charAt(0).toUpperCase() || "U";
  const roleLabel = profile?.role === "admin" ? "Quan tri vien" : "Chua phan vai tro";
  const quickCustomerFormId = "quick-customer-form";

  function updateActiveBill(updater: (bill: PosBill) => PosBill) {
    setWorkspace((current) => ({
      ...current,
      bills: current.bills.map((bill) =>
        bill.id === current.activeBillId ? updater(bill) : bill
      ),
    }));
  }

  function updateActiveBillField<K extends keyof Omit<PosBill, "cart" | "id" | "savedAt">>(
    key: K,
    value: PosBill[K]
  ) {
    updateActiveBill((bill) => ({
      ...bill,
      [key]: value,
      savedAt: null,
    }));
  }

  function updateActiveCart(nextCart: PosCartItem[] | ((current: PosCartItem[]) => PosCartItem[])) {
    updateActiveBill((bill) => ({
      ...bill,
      cart: typeof nextCart === "function" ? nextCart(bill.cart) : nextCart,
      savedAt: null,
    }));
  }

  function getQuantityInCart(productId: string) {
    return cart
      .filter((item) => item.product.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  function switchBill(billId: number) {
    setWorkspace((current) => ({ ...current, activeBillId: billId }));
    setProductQuery("");
    setError("");
    setSuccess("");
  }

  function addBill() {
    setWorkspace((current) => {
      const nextId = getNextBillId(current.bills);
      return {
        activeBillId: nextId,
        bills: [...current.bills, createEmptyBill(nextId)],
      };
    });
    setProductQuery("");
    setError("");
    setSuccess("");
  }

  function closeBill(billId: number) {
    setWorkspace((current) => {
      if (current.bills.length === 1) {
        return {
          activeBillId: billId,
          bills: [createEmptyBill(billId)],
        };
      }

      const nextBills = current.bills.filter((bill) => bill.id !== billId);
      const activeBillId =
        current.activeBillId === billId ? nextBills[nextBills.length - 1].id : current.activeBillId;

      return { activeBillId, bills: nextBills };
    });
  }

  function addToCart(product: Product) {
    setSuccess("");
    setError("");

    if (product.stock <= 0) {
      showErrorNotice("San pham nay da het hang.", "Khong the them san pham");
      return;
    }

    updateActiveCart((current) => {
      const quantityInCart = current
        .filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);

      if (quantityInCart >= product.stock) {
        return current;
      }

      if (lineSeparated) {
        return [...current, { lineId: createLineId(product.id), product, quantity: 1 }];
      }

      const existingItem = current.find((item) => item.product.id === product.id);

      if (existingItem) {
        return current.map((item) =>
          item.lineId === existingItem.lineId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, { lineId: createLineId(product.id), product, quantity: 1 }];
    });
    setProductQuery("");
    productSearchRef.current?.focus();
  }

  function changeQuantity(lineId: string, nextQuantity: number) {
    updateActiveCart((current) =>
      current
        .map((item) => {
          if (item.lineId !== lineId) {
            return item;
          }

          const otherQuantity = current
            .filter((cartItem) => cartItem.lineId !== lineId)
            .filter((cartItem) => cartItem.product.id === item.product.id)
            .reduce((sum, cartItem) => sum + cartItem.quantity, 0);
          const maxQuantity = Math.max(item.product.stock - otherQuantity, 0);

          return {
            ...item,
            quantity: Math.min(Math.max(nextQuantity, 0), maxQuantity),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(lineId: string) {
    updateActiveCart((current) => current.filter((item) => item.lineId !== lineId));
  }

  function clearCart() {
    updateActiveBill((bill) => createEmptyBill(bill.id));
    setError("");
    setSuccess("");
  }

  function selectCustomer(customer: Customer) {
    updateActiveBill((bill) => ({
      ...bill,
      customerQuery: formatCustomerLabel(customer),
      savedAt: null,
      selectedCustomerId: customer.id,
    }));
  }

  function clearSelectedCustomer() {
    updateActiveBill((bill) => ({
      ...bill,
      customerQuery: "",
      savedAt: null,
      selectedCustomerId: "",
    }));
    customerSearchRef.current?.focus();
  }

  function handleProductSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && productResults[0]) {
      event.preventDefault();
      addToCart(productResults[0]);
    }
  }

  function handleEan13Detected(value: string) {
    const ean13Code = normalizeEan13Input(value);
    const product = findProductByEan13(products, ean13Code);

    setSuccess("");

    if (!isValidEan13(ean13Code)) {
      showErrorNotice("Ma quet khong phai EAN-13 hop le.", "EAN-13 khong hop le");
      setProductQuery(ean13Code);
      productSearchRef.current?.focus();
      return;
    }

    if (!product) {
      showErrorNotice(
        `Chua co san pham trong database voi EAN-13 ${ean13Code}.`,
        "Khong co san pham"
      );
      setProductQuery(ean13Code);
      productSearchRef.current?.focus();
      return;
    }

    if (!product.is_active) {
      showErrorNotice(`San pham "${product.name}" dang tam an.`, "San pham chua duoc ban");
      return;
    }

    if (product.stock <= 0 || getQuantityInCart(product.id) >= product.stock) {
      showErrorNotice(`San pham "${product.name}" khong con ton de them.`, "Het ton kho");
      return;
    }

    addToCart(product);
    setSuccess(`Da quet ${product.name}.`);
  }

  async function handleCreateCustomer(input: CustomerInput) {
    setSubmittingCustomer(true);
    setError("");

    try {
      const customer = await createCustomer(input);
      setCustomers((current) => [customer, ...current]);
      selectCustomer(customer);
      setCustomerModalOpen(false);
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Khong them duoc khach hang.",
        "Khong them duoc khach hang"
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
      showErrorNotice("Gio hang dang trong.", "Chua co san pham");
      return;
    }

    if (Number.isNaN(discountValue) || discountValue < 0) {
      showErrorNotice("Giam gia phai la so khong am.", "Giam gia khong hop le");
      return;
    }

    if (paymentMethod === "cash" && paidAmount < total) {
      showErrorNotice("Khach dua chua du so tien can thu.", "Chua du tien thanh toan");
      paidAmountRef.current?.focus();
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

      updateActiveBill((bill) => createEmptyBill(bill.id));
      setSuccess(`Da tao hoa don ${order.code} voi tong tien ${formatCurrency(order.total)}.`);
      await loadPosData();
      if (autoPrint) {
        window.setTimeout(() => window.print(), 150);
      }
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Tao hoa don that bai.",
        "Tao hoa don that bai"
      );
    } finally {
      setSubmittingSale(false);
    }
  }

  function handleSaveBill() {
    setError("");
    setSuccess("");

    if (cart.length === 0 && !selectedCustomerId && !orderNote.trim()) {
      showErrorNotice("Don hien tai chua co thong tin de luu.", "Khong the luu don");
      return;
    }

    updateActiveBill((bill) => ({
      ...bill,
      savedAt: new Date().toISOString(),
    }));
    setSuccess(`Da luu Don ${activeBill.id} tren may nay.`);
  }

  return (
    <div className="min-h-screen bg-[#e8eef6]">
      <header className="sticky top-0 z-40 rounded-b-[1.5rem] border-b border-white/80 bg-white/95 px-4 py-3 pl-20 shadow-[0_14px_36px_rgba(15,23,42,0.12)] backdrop-blur lg:pl-5 xl:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 gap-2">
            <button
              aria-label="Quet EAN-13"
              className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-slate-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 md:h-16 md:w-16"
              onClick={() => setEan13ScannerOpen(true)}
              type="button"
            >
              <Barcode className="h-6 w-6" />
            </button>
            <div className="relative min-w-0 flex-1">
              <input
                className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 pr-16 text-base font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 md:h-16 md:px-5 md:pr-20 md:text-xl"
                onChange={(event) => setProductQuery(event.target.value)}
                onKeyDown={handleProductSearchKeyDown}
                placeholder="Nhap ten san pham hoac EAN-13"
                ref={productSearchRef}
                value={productQuery}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2">
                <ShortcutTag>F3</ShortcutTag>
              </span>

              {productQuery ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                  {loading ? (
                    <Spinner label="Dang tai san pham..." />
                  ) : productResults.length === 0 ? (
                    <div className="flex items-center gap-3 p-5 text-sm font-semibold text-slate-500">
                      <PackageSearch className="h-5 w-5" />
                      Khong tim thay san pham phu hop.
                    </div>
                  ) : (
                    <div className="max-h-[560px] overflow-y-auto p-3">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {productResults.map((product) => {
                          const quantityInCart = getQuantityInCart(product.id);
                          const disabled = product.stock <= 0 || quantityInCart >= product.stock;
                          const badgeLabel =
                            product.stock <= 0
                              ? "Het hang"
                              : quantityInCart > 0
                                ? `Da chon ${quantityInCart}`
                                : undefined;

                          return (
                            <ProductCard
                              badgeLabel={badgeLabel}
                              badgeTone={product.stock <= 0 ? "neutral" : "blue"}
                              compact
                              disabled={disabled}
                              key={product.id}
                              onSelect={() => addToCart(product)}
                              product={product}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="hidden min-w-0 shrink-0 items-end gap-1 overflow-x-auto pb-1 md:flex">
            {workspace.bills.map((bill) => (
              <button
                className={`flex h-16 min-w-24 items-center justify-center gap-2 whitespace-nowrap rounded-t-2xl border px-4 text-lg font-extrabold transition ${
                  activeBill.id === bill.id
                    ? "border-slate-300 bg-[#dfe7f2] text-slate-900"
                    : "border-slate-200 bg-[#eef3f9] text-slate-500"
                }`}
                key={bill.id}
                onClick={() => switchBill(bill.id)}
                type="button"
              >
                Don {bill.id}
                {bill.savedAt ? (
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                ) : null}
                <span
                  className="rounded-md p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeBill(bill.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <X className="h-4 w-4" />
                </span>
              </button>
            ))}
            <button
              className="flex h-16 min-w-14 items-center justify-center rounded-t-2xl border border-slate-200 bg-[#eef3f9] text-slate-600 transition hover:bg-slate-100"
              onClick={addBill}
              type="button"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          <div className="hidden shrink-0 items-center justify-end gap-3 md:flex">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-white text-slate-700 shadow-[0_12px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
              <Bell className="h-6 w-6" />
            </div>
            <div className="flex h-16 min-w-56 items-center gap-3 rounded-full bg-white px-4 pr-5 text-left shadow-[0_14px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-xl font-extrabold text-green-700">
                {userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-extrabold text-slate-900">
                  {displayName}
                </span>
                <span className="block truncate text-base font-bold text-slate-500">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="h-5 w-5 text-slate-400" />
            </div>
          </div>
        </div>
      </header>

      <main className="px-3 py-4 sm:px-4 xl:px-6">
        <div className="mx-auto max-w-[1500px] space-y-4">
          <ConfigNotice />

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700 shadow-sm">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-700 shadow-sm">
              {success}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_560px]">
            <div className="space-y-6">
              <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10)] ring-1 ring-slate-100">
                <div className="flex flex-col gap-4 border-b border-slate-100 px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <h1 className="whitespace-nowrap text-2xl font-extrabold text-slate-900">
                    San pham ({totalItems})
                  </h1>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-3 text-lg font-semibold text-slate-800">
                      <input
                        checked={lineSeparated}
                        className="h-6 w-6 rounded border-slate-300 text-green-600 focus:ring-green-500"
                        onChange={(event) => setLineSeparated(event.target.checked)}
                        type="checkbox"
                      />
                      Tach dong san pham
                    </label>
                    <button
                      className="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-lg font-extrabold text-red-300 transition hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={cart.length === 0}
                      onClick={clearCart}
                      type="button"
                    >
                      Xoa tat ca
                    </button>
                  </div>
                </div>

                {loading ? (
                  <div className="min-h-[290px]">
                    <Spinner label="Dang tai du lieu POS..." />
                  </div>
                ) : cart.length === 0 ? (
                  <div className="flex min-h-[245px] flex-col items-center justify-center px-6 py-8 text-center md:min-h-[290px] md:py-10">
                    <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-slate-500 md:mb-5 md:h-32 md:w-32">
                      <DollarSign className="h-16 w-16 stroke-[1.5] md:h-24 md:w-24" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-500 md:text-3xl">
                      Ban chua them san pham nao
                    </h2>
                    <p className="mt-3 text-base font-medium text-slate-500 md:mt-4 md:text-xl">
                      Nhan phim: F3 de tim kiem nhanh san pham
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {cart.map((item) => {
                      const quantityInProduct = getQuantityInCart(item.product.id);

                      return (
                        <article
                          className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_170px_140px_48px] lg:items-center"
                          key={item.lineId}
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-slate-100">
                              {item.product.image_url ? (
                                <img
                                  alt={item.product.name}
                                  className="h-full w-full object-cover"
                                  src={item.product.image_url}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <ShoppingBag className="h-8 w-8" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-extrabold text-slate-900">
                                {item.product.name}
                              </h3>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                EAN-13 {getProductEan13Value(item.product)} -{" "}
                                {formatCurrency(item.product.price)}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-400">
                                Ton kho: {item.product.stock}
                              </p>
                            </div>
                          </div>

                          <div className="flex w-fit items-center gap-2 rounded-xl bg-slate-50 p-1">
                            <button
                              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                              onClick={() => changeQuantity(item.lineId, item.quantity - 1)}
                              type="button"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-10 text-center text-lg font-extrabold text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={quantityInProduct >= item.product.stock}
                              onClick={() => changeQuantity(item.lineId, item.quantity + 1)}
                              type="button"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>

                          <p className="text-left text-xl font-extrabold text-slate-900 lg:text-right">
                            {formatCurrency(item.product.price * item.quantity)}
                          </p>

                          <button
                            aria-label="Xoa san pham"
                            className="flex h-12 w-12 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                            onClick={() => removeFromCart(item.lineId)}
                            type="button"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="hidden gap-5 md:grid md:grid-cols-2">
                <section className="rounded-3xl bg-white px-6 py-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
                  <h2 className="text-xl font-extrabold text-slate-900">Sapo Invoice</h2>
                  <p className="mt-3 text-lg font-medium text-orange-500">Can thiet lap mau hoa don</p>
                </section>
                <section className="rounded-3xl bg-white px-6 py-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
                  <h2 className="text-xl font-extrabold text-slate-900">Nhan vien xu ly</h2>
                  <p className="mt-3 text-lg font-medium text-orange-500">
                    {profile?.full_name || "Chua chon"}
                  </p>
                </section>
              </div>

              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_330px]">
                <input
                  className="h-[68px] rounded-2xl border-0 bg-white px-5 text-xl font-medium text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.06)] outline-none ring-1 ring-slate-100 transition placeholder:text-slate-500 focus:ring-4 focus:ring-blue-100"
                  onChange={(event) => updateActiveBillField("orderNote", event.target.value)}
                  placeholder="Nhap ghi chu don hang"
                  value={orderNote}
                />
                <button
                  className="flex h-[68px] items-center justify-center gap-2 rounded-2xl border border-blue-500 bg-blue-50 px-5 text-xl font-extrabold text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={cart.length === 0 && !selectedCustomerId && !orderNote.trim()}
                  onClick={handleSaveBill}
                  type="button"
                >
                  <Save className="h-5 w-5" />
                  Luu don
                </button>
              </div>
            </div>

            <div className="space-y-6 xl:sticky xl:top-32 xl:self-start">
              <section className="rounded-[1.75rem] bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.10)] ring-1 ring-slate-100">
                <div className="relative flex gap-4">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="h-[68px] w-full rounded-xl border border-slate-200 bg-white px-5 pr-16 text-xl font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      onChange={(event) => {
                        updateActiveBill((bill) => ({
                          ...bill,
                          customerQuery: event.target.value,
                          savedAt: null,
                          selectedCustomerId: "",
                        }));
                      }}
                      placeholder="Tim kiem khach hang"
                      ref={customerSearchRef}
                      value={customerQuery}
                    />
                    {selectedCustomer ? (
                      <button
                        aria-label="Bo chon khach hang"
                        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        onClick={clearSelectedCustomer}
                        type="button"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    ) : (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2">
                        <ShortcutTag>F2</ShortcutTag>
                      </span>
                    )}

                    {customerResults.length > 0 ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                        <div className="max-h-72 overflow-y-auto p-2">
                          {customerResults.map((customer) => (
                            <button
                              className="flex w-full flex-col rounded-xl px-4 py-3 text-left transition hover:bg-slate-50"
                              key={customer.id}
                              onClick={() => selectCustomer(customer)}
                              type="button"
                            >
                              <span className="font-extrabold text-slate-900">{customer.name}</span>
                              <span className="mt-1 text-sm font-semibold text-slate-500">
                                {customer.phone || "Chua co so dien thoai"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    aria-label="Them khach hang"
                    className="flex h-[70px] w-[70px] flex-none items-center justify-center rounded-xl bg-green-600 text-white shadow-[0_14px_30px_rgba(22,163,74,0.28)] transition hover:bg-green-700"
                    onClick={() => setCustomerModalOpen(true)}
                    type="button"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-10 space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-2xl font-extrabold text-slate-900">
                      Tam tinh ({totalItems} san pham)
                    </span>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex min-w-0 items-center gap-1 text-xl font-extrabold text-blue-600">
                      <span>Giam gia:</span>
                      <input
                        className="h-12 w-32 rounded-xl border border-slate-100 bg-white px-2 text-right text-xl font-extrabold text-blue-600 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        min="0"
                        onChange={(event) => updateActiveBillField("discount", event.target.value)}
                        ref={discountRef}
                        type="number"
                        value={discount}
                      />
                      <ShortcutTag>F6</ShortcutTag>
                    </label>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatCurrency(safeDiscount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-2xl font-extrabold text-slate-900">Thanh tien</span>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-2xl font-extrabold text-slate-900">Khach dua</span>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatCurrency(paidAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-2xl font-extrabold text-slate-900">Tien thua</span>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-4xl font-extrabold text-slate-900">Can thu</span>
                      <span className="text-4xl font-extrabold text-slate-900">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.75rem] bg-white p-7 shadow-[0_18px_45px_rgba(15,23,42,0.10)] ring-1 ring-slate-100">
                <label className="flex cursor-pointer items-center gap-3 text-xl font-semibold text-slate-800">
                  <input
                    checked={autoPrint}
                    className="h-6 w-6 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    onChange={(event) => setAutoPrint(event.target.checked)}
                    type="checkbox"
                  />
                  In hoa don tu dong
                </label>

                <div className="mt-7 grid gap-4 sm:grid-cols-[164px_minmax(0,1fr)]">
                  <Select
                    aria-label="Phuong thuc thanh toan"
                    className="h-[66px] rounded-xl text-xl"
                    onChange={(event) =>
                      updateActiveBillField("paymentMethod", event.target.value)
                    }
                    value={paymentMethod}
                  >
                    <option value="cash">Tien mat</option>
                    <option value="transfer">Chuyen khoan</option>
                    <option value="card">The</option>
                  </Select>
                  <div className="relative">
                    <input
                      className="h-[66px] w-full rounded-xl border border-slate-200 bg-white px-5 pr-16 text-xl font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      min="0"
                      onChange={(event) =>
                        updateActiveBillField("cashReceived", event.target.value)
                      }
                      placeholder="Nhap so tien khach dua"
                      ref={paidAmountRef}
                      type="number"
                      value={cashReceived}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2">
                      <ShortcutTag>F4</ShortcutTag>
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600 transition hover:bg-slate-200"
                    disabled={cart.length === 0}
                    onClick={() => updateActiveBillField("cashReceived", String(total))}
                    type="button"
                  >
                    Thu du
                  </button>
                  <button
                    className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-extrabold text-slate-600 transition hover:bg-slate-200"
                    disabled={cart.length === 0}
                    onClick={() =>
                      updateActiveBillField(
                        "cashReceived",
                        String(Math.ceil(total / 100000) * 100000)
                      )
                    }
                    type="button"
                  >
                    Lam tron tien dua
                  </button>
                </div>

                <button
                  className="mt-6 flex h-[70px] w-full items-center justify-center gap-3 rounded-2xl bg-green-600 text-2xl font-extrabold text-white shadow-[0_18px_36px_rgba(22,163,74,0.28)] transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={cart.length === 0 || submittingSale}
                  onClick={handleCheckout}
                  type="button"
                >
                  {submittingSale ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-7 w-7" />}
                  Thanh toan
                </button>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              onClick={() => setCustomerModalOpen(false)}
              type="button"
              variant="secondary"
            >
              Huy
            </Button>
            <Button form={quickCustomerFormId} isLoading={submittingCustomer} type="submit">
              Luu khach
            </Button>
          </div>
        }
        onClose={() => setCustomerModalOpen(false)}
        open={customerModalOpen}
        size="md"
        title="Them khach nhanh"
      >
        <QuickCustomerForm
          formId={quickCustomerFormId}
          onCancel={() => setCustomerModalOpen(false)}
          onSubmit={handleCreateCustomer}
          submitting={submittingCustomer}
        />
      </Modal>
      <Ean13ScannerModal
        description="Quet EAN-13 de them nhanh san pham vao hoa don hien tai."
        onClose={() => setEan13ScannerOpen(false)}
        onDetected={handleEan13Detected}
        open={ean13ScannerOpen}
        title="Quet EAN-13 ban hang"
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
