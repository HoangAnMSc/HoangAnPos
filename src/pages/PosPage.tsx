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
  ImagePlus,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  QrCode,
  Save,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { uploadPaymentProof } from "../lib/cloudinary";
import { formatCurrency } from "../lib/format";
import {
  findProductByEan13,
  formatProductDate,
  getProductEan13Value,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import { createCustomer, fetchCustomers, type CustomerInput } from "../services/customers";
import { createSale, type PaymentMethod } from "../services/orders";
import { fetchPaymentSettings } from "../services/paymentSettings";
import { fetchProductBatches, fetchProducts, getActiveProducts } from "../services/products";
import type { CartItem, Customer, PaymentSettings, Product, ProductBatch } from "../types";

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
  paymentMethod: PaymentMethod;
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
    paymentMethod: value?.paymentMethod === "transfer" ? "transfer" : "cash",
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
  const { canAccess, profile, user } = useAuth();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const paidAmountRef = useRef<HTMLInputElement>(null);

  const [autoPrint, setAutoPrint] = useState(true);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [lineSeparated, setLineSeparated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentProofModalOpen, setPaymentProofModalOpen] = useState(false);
  const [paymentProofNote, setPaymentProofNote] = useState("");
  const [paymentQrModalOpen, setPaymentQrModalOpen] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("cash");
  const [products, setProducts] = useState<Product[]>([]);
  const [productBatches, setProductBatches] = useState<ProductBatch[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productToBatchSelect, setProductToBatchSelect] = useState<Product | null>(null);
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
  const canCheckout = canAccess("pos.checkout");
  const canApplyDiscount = canAccess("pos.discount");
  const canCreateQuickCustomer =
    canAccess("pos.quick-customer.create") || canAccess("customers.create");
  const canUploadPaymentProof = canAccess("pos.payment-proof.upload");

  const showErrorNotice = useCallback((message: string, title = "Thong bao loi") => {
    setError(message);
    setErrorNotice({ message, title });
  }, []);

  const loadPosData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [productData, batchData, customerData, settingsData] = await Promise.all([
        fetchProducts(),
        fetchProductBatches(),
        fetchCustomers(),
        fetchPaymentSettings(),
      ]);
      setProducts(productData);
      setProductBatches(batchData);
      setCustomers(customerData);
      setPaymentSettings(settingsData);
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
    const batchesById = new Map(productBatches.map((batch) => [batch.id, batch]));

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

            const freshBatch = item.batch?.id ? batchesById.get(item.batch.id) ?? null : null;
            const availableStock = freshBatch?.quantity ?? freshProduct.stock;
            if (item.batch?.id && (!freshBatch || freshBatch.quantity <= 0)) {
              changed = true;
              return null;
            }

            const quantity = Math.min(item.quantity, availableStock);
            if (quantity !== item.quantity || freshProduct !== item.product || freshBatch !== item.batch) {
              changed = true;
            }

            return { ...item, batch: freshBatch, product: freshProduct, quantity };
          })
          .filter((item): item is PosCartItem => Boolean(item));

        return changed ? { ...bill, cart: refreshedCart } : bill;
      });

      return changed ? { ...current, bills } : current;
    });
  }, [productBatches, products]);

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
        if (canCheckout) {
          setPaymentModalOpen(true);
        }
      }

      if (event.key === "F6") {
        event.preventDefault();
        if (canApplyDiscount) {
          discountRef.current?.focus();
        }
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [canApplyDiscount, canCheckout]);

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
  const rawDiscount = canApplyDiscount ? Number(discount || 0) : 0;
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

  function getQuantityInCart(productId: string, batchId?: string | null) {
    return cart
      .filter((item) => item.product.id === productId)
      .filter((item) => (batchId ? item.batch?.id === batchId : true))
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  function getProductBatches(productId: string) {
    return productBatches.filter((batch) => batch.product_id === productId && batch.quantity > 0);
  }

  function switchBill(billId: number) {
    setWorkspace((current) => ({ ...current, activeBillId: billId }));
    setProductQuery("");
    setError("");
    setSuccess("");
  }

  function addBill() {
    if (!canCheckout) {
      return;
    }

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
    if (!canCheckout) {
      return;
    }

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

  function addToCart(product: Product, batch?: ProductBatch | null) {
    if (!canCheckout) {
      return;
    }

    setSuccess("");
    setError("");

    if (product.stock <= 0) {
      showErrorNotice("San pham nay da het hang.", "Khong the them san pham");
      return;
    }

    const batches = getProductBatches(product.id);
    if (batch === undefined && batches.length > 0) {
      setProductToBatchSelect(product);
      setBatchModalOpen(true);
      return;
    }

    updateActiveCart((current) => {
      const quantityInCart = current
        .filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      const quantityInBatch = batch
        ? current
            .filter((item) => item.batch?.id === batch.id)
            .reduce((sum, item) => sum + item.quantity, 0)
        : 0;
      const maxByBatch = batch ? batch.quantity - quantityInBatch : product.stock - quantityInCart;

      if (quantityInCart >= product.stock || maxByBatch <= 0) {
        return current;
      }

      if (lineSeparated) {
        return [...current, { batch: batch ?? null, lineId: createLineId(product.id), product, quantity: 1 }];
      }

      const existingItem = current.find(
        (item) => item.product.id === product.id && (item.batch?.id ?? null) === (batch?.id ?? null)
      );

      if (existingItem) {
        return current.map((item) =>
          item.lineId === existingItem.lineId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [...current, { batch: batch ?? null, lineId: createLineId(product.id), product, quantity: 1 }];
    });
    setBatchModalOpen(false);
    setProductToBatchSelect(null);
    setProductQuery("");
    productSearchRef.current?.focus();
  }

  function changeQuantity(lineId: string, nextQuantity: number) {
    if (!canCheckout) {
      return;
    }

    updateActiveCart((current) =>
      current
        .map((item) => {
          if (item.lineId !== lineId) {
            return item;
          }

          const otherQuantity = current
            .filter((cartItem) => cartItem.lineId !== lineId)
            .filter((cartItem) =>
              item.batch
                ? cartItem.batch?.id === item.batch.id
                : cartItem.product.id === item.product.id
            )
            .reduce((sum, cartItem) => sum + cartItem.quantity, 0);
          const availableStock = item.batch?.quantity ?? item.product.stock;
          const maxQuantity = Math.max(availableStock - otherQuantity, 0);

          return {
            ...item,
            quantity: Math.min(Math.max(nextQuantity, 0), maxQuantity),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(lineId: string) {
    if (!canCheckout) {
      return;
    }

    updateActiveCart((current) => current.filter((item) => item.lineId !== lineId));
  }

  function clearCart() {
    if (!canCheckout) {
      return;
    }

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
    if (event.key === "Enter" && productResults[0] && canCheckout) {
      event.preventDefault();
      addToCart(productResults[0]);
    }
  }

  function handleEan13Detected(value: string) {
    if (!canCheckout) {
      return;
    }

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
    if (!canCreateQuickCustomer) {
      return;
    }

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

  function getValidatedDiscount() {
    const discountValue = canApplyDiscount ? Number(discount || 0) : 0;
    setError("");
    setSuccess("");

    if (cart.length === 0) {
      showErrorNotice("Gio hang dang trong.", "Chua co san pham");
      return null;
    }

    if (Number.isNaN(discountValue) || discountValue < 0) {
      showErrorNotice("Giam gia phai la so khong am.", "Giam gia khong hop le");
      return null;
    }

    return discountValue;
  }

  function openPaymentModal() {
    if (!canCheckout) {
      return;
    }

    const discountValue = getValidatedDiscount();
    if (discountValue === null) {
      return;
    }

    setSelectedPaymentMethod(paymentMethod);
    setPaymentProofFile(null);
    setPaymentProofNote("");
    setPaymentProofPreview("");
    setPaymentProofModalOpen(false);
    setPaymentQrModalOpen(false);
    setPaymentModalOpen(true);

    window.setTimeout(() => {
      if (paymentMethod === "cash") {
        paidAmountRef.current?.focus();
      }
    }, 80);
  }

  function handlePaymentProofChange(file: File | null) {
    if (!canUploadPaymentProof) {
      return;
    }

    setPaymentProofFile(file);
    setPaymentProofPreview("");

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPaymentProofPreview(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  }

  async function handleCheckout() {
    if (!canCheckout) {
      return;
    }

    const discountValue = getValidatedDiscount();
    if (discountValue === null) {
      return;
    }

    if (selectedPaymentMethod === "cash" && paidAmount < total) {
      showErrorNotice("Khach dua chua du so tien can thu.", "Chua du tien thanh toan");
      paidAmountRef.current?.focus();
      return;
    }

    if (selectedPaymentMethod === "transfer" && !paymentProofFile && !paymentProofNote.trim()) {
      showErrorNotice(
        "Can chup/chon anh hoac nhap ma giao dich de xac nhan chuyen khoan.",
        "Thieu xac nhan thanh toan"
      );
      return;
    }

    setSubmittingSale(true);

    try {
      const paymentProofUrl =
        selectedPaymentMethod === "transfer" && paymentProofFile && canUploadPaymentProof
          ? await uploadPaymentProof(paymentProofFile)
          : null;

      const order = await createSale({
        cashReceived: selectedPaymentMethod === "cash" ? paidAmount : total,
        cashierId: user?.id ?? null,
        cart,
        customerId: selectedCustomerId || null,
        discount: discountValue,
        note: normalizeText(orderNote),
        paymentMethod: selectedPaymentMethod,
        paymentProofNote: normalizeText(paymentProofNote),
        paymentProofUrl,
      });

      updateActiveBill((bill) => createEmptyBill(bill.id));
      setPaymentModalOpen(false);
      setPaymentProofModalOpen(false);
      setPaymentQrModalOpen(false);
      setPaymentProofFile(null);
      setPaymentProofNote("");
      setPaymentProofPreview("");
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
    if (!canCheckout) {
      return;
    }

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
            {canCheckout ? (
              <button
                aria-label="Quet EAN-13"
                className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-slate-900 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 md:h-16 md:w-16"
                onClick={() => setEan13ScannerOpen(true)}
                type="button"
              >
                <Barcode className="h-6 w-6" />
              </button>
            ) : null}
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
                <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-50 max-h-[min(70vh,620px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                  {loading ? (
                    <Spinner label="Dang tai san pham..." />
                  ) : productResults.length === 0 ? (
                    <div className="flex items-center gap-3 p-5 text-sm font-semibold text-slate-500">
                      <PackageSearch className="h-5 w-5" />
                      Khong tim thay san pham phu hop.
                    </div>
                  ) : (
                    <div className="max-h-[min(70vh,620px)] overflow-y-auto p-2">
                      {productResults.map((product) => {
                        const quantityInCart = getQuantityInCart(product.id);
                        const disabled =
                          !canCheckout || product.stock <= 0 || quantityInCart >= product.stock;

                        return (
                          <button
                            className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55 sm:grid-cols-[76px_minmax(0,1fr)_120px_120px]"
                            disabled={disabled}
                            key={product.id}
                            onClick={() => addToCart(product)}
                            type="button"
                          >
                            <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100 sm:h-[76px] sm:w-[76px]">
                              {product.image_url ? (
                                <img
                                  alt={product.name}
                                  className="h-full w-full object-cover"
                                  src={product.image_url}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <ShoppingBag className="h-7 w-7" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                                {product.name}
                              </p>
                              <p className="mt-1 truncate text-sm font-bold text-slate-500">
                                EAN-13 {getProductEan13Value(product)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs font-extrabold">
                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">
                                  Ton {product.stock}
                                </span>
                                {quantityInCart > 0 ? (
                                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">
                                    Da chon {quantityInCart}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="hidden text-right sm:block">
                              <p className="text-xs font-extrabold uppercase text-slate-400">Gia</p>
                              <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">
                                {formatCurrency(product.price)}
                              </p>
                            </div>
                            {canCheckout ? (
                              <span className="rounded-xl bg-green-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm">
                                Them
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
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
                {canCheckout ? (
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
                ) : null}
              </button>
            ))}
            {canCheckout ? (
              <button
                className="flex h-16 min-w-14 items-center justify-center rounded-t-2xl border border-slate-200 bg-[#eef3f9] text-slate-600 transition hover:bg-slate-100"
                onClick={addBill}
                type="button"
              >
                <Plus className="h-6 w-6" />
              </button>
            ) : null}
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

      <main className="w-full max-w-[100vw] px-[1.2vw] py-4">
        <div className="mx-auto w-full max-w-none space-y-4">
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

          <div className="grid gap-[1.2vw] xl:grid-cols-[minmax(0,1fr)_clamp(420px,32vw,560px)]">
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
                    {canCheckout ? (
                      <button
                        className="rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-lg font-extrabold text-red-300 transition hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={cart.length === 0}
                        onClick={clearCart}
                        type="button"
                      >
                        Xoa tat ca
                      </button>
                    ) : null}
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
                  <div className="max-h-[calc(100vh-300px)] divide-y divide-slate-100 overflow-y-auto">
                    {cart.map((item) => {
                      const quantityInProduct = getQuantityInCart(item.product.id);

                      return (
                        <article
                          className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_180px_150px_52px] lg:items-center"
                          key={item.lineId}
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="h-24 w-24 flex-none overflow-hidden rounded-xl bg-slate-100">
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
                              <h3 className="line-clamp-2 text-xl font-extrabold leading-tight text-slate-900">
                                {item.product.name}
                              </h3>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                EAN-13 {getProductEan13Value(item.product)} -{" "}
                                {formatCurrency(item.product.price)}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-400">
                                Ton kho: {item.product.stock}
                              </p>
                              {item.batch ? (
                                <p className="mt-1 text-sm font-extrabold text-blue-600">
                                  Lo: {formatProductDate(item.batch.import_date)} - HSD{" "}
                                  {formatProductDate(item.batch.expiry_date)} ({item.batch.quantity})
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {canCheckout ? (
                            <div className="flex w-fit items-center gap-2 rounded-xl bg-slate-50 p-1.5">
                              <button
                                className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                                onClick={() => changeQuantity(item.lineId, item.quantity - 1)}
                                type="button"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-12 text-center text-2xl font-extrabold text-slate-900">
                                {item.quantity}
                              </span>
                              <button
                                className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={quantityInProduct >= item.product.stock}
                                onClick={() => changeQuantity(item.lineId, item.quantity + 1)}
                                type="button"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-2xl font-extrabold text-slate-900">
                              {item.quantity}
                            </span>
                          )}

                          <p className="text-left text-2xl font-extrabold tabular-nums text-slate-900 lg:text-right">
                            {formatCurrency(item.product.price * item.quantity)}
                          </p>

                          {canCheckout ? (
                            <button
                              aria-label="Xoa san pham"
                              className="flex h-12 w-12 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                              onClick={() => removeFromCart(item.lineId)}
                              type="button"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          ) : null}
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
                {canCheckout ? (
                  <button
                    className="flex h-[68px] items-center justify-center gap-2 rounded-2xl border border-blue-500 bg-blue-50 px-5 text-xl font-extrabold text-blue-600 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={cart.length === 0 && !selectedCustomerId && !orderNote.trim()}
                    onClick={handleSaveBill}
                    type="button"
                  >
                    <Save className="h-5 w-5" />
                    Luu don
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
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
                  {canCreateQuickCustomer ? (
                    <button
                      aria-label="Them khach hang"
                      className="flex h-[70px] w-[70px] flex-none items-center justify-center rounded-xl bg-green-600 text-white shadow-[0_14px_30px_rgba(22,163,74,0.28)] transition hover:bg-green-700"
                      onClick={() => setCustomerModalOpen(true)}
                      type="button"
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-10 space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold text-slate-900">
                      Tam tinh ({totalItems} san pham)
                    </span>
                    <span className="min-w-[11ch] text-right text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    {canApplyDiscount ? (
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
                    ) : (
                      <span className="text-xl font-extrabold text-blue-600">Giam gia</span>
                    )}
                    <span className="min-w-[11ch] text-right text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(safeDiscount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold text-slate-900">Thanh tien</span>
                    <span className="min-w-[11ch] text-right text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold text-slate-900">Khach dua</span>
                    <span className="min-w-[11ch] text-right text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(paidAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold text-slate-900">Tien thua</span>
                    <span className="min-w-[11ch] text-right text-[clamp(1.1rem,1.4vw,1.5rem)] font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[clamp(1.8rem,2.4vw,2.5rem)] font-extrabold text-slate-900">Can thu</span>
                      <span className="min-w-[11ch] text-right text-[clamp(1.8rem,2.4vw,2.5rem)] font-extrabold tabular-nums text-slate-900">
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

                {canCheckout ? (
                  <button
                    className="mt-6 flex h-[70px] w-full items-center justify-center gap-3 rounded-2xl bg-green-600 text-2xl font-extrabold text-white shadow-[0_18px_36px_rgba(22,163,74,0.28)] transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={cart.length === 0 || submittingSale}
                    onClick={openPaymentModal}
                    type="button"
                  >
                    {submittingSale ? <Loader2 className="h-6 w-6 animate-spin" /> : <Wallet className="h-7 w-7" />}
                    Thanh toan
                  </button>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </main>

      {canCreateQuickCustomer ? (
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
      ) : null}
      {canCheckout ? (
        <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={submittingSale}
              onClick={() => setPaymentModalOpen(false)}
              type="button"
              variant="secondary"
            >
              Huy
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={
                submittingSale ||
                (selectedPaymentMethod === "transfer" &&
                  !paymentProofFile &&
                  !paymentProofNote.trim())
              }
              isLoading={submittingSale}
              onClick={handleCheckout}
              type="button"
            >
              <Check className="h-4 w-4" />
              Hoan tat
            </Button>
          </div>
        }
        onClose={() => {
          if (!submittingSale) {
            setPaymentModalOpen(false);
            setPaymentProofModalOpen(false);
            setPaymentQrModalOpen(false);
          }
        }}
        open={paymentModalOpen}
        size="lg"
        title="Chon thanh toan"
      >
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-lg font-extrabold text-slate-700">Can thu</span>
              <span className="text-right text-3xl font-extrabold tabular-nums text-slate-950">
                {formatCurrency(total)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["cash", "transfer"] as PaymentMethod[]).map((method) => {
              const active = selectedPaymentMethod === method;
              return (
                <button
                  className={`flex h-20 items-center gap-4 rounded-2xl border px-5 text-left transition ${
                    active
                      ? "border-green-500 bg-green-50 text-green-800 ring-4 ring-green-100"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  key={method}
                  onClick={() => {
                    setSelectedPaymentMethod(method);
                    updateActiveBillField("paymentMethod", method);
                    window.setTimeout(() => {
                      if (method === "cash") {
                        paidAmountRef.current?.focus();
                      }
                    }, 80);
                  }}
                  type="button"
                >
                  {method === "cash" ? (
                    <DollarSign className="h-7 w-7 flex-none" />
                  ) : (
                    <QrCode className="h-7 w-7 flex-none" />
                  )}
                  <span>
                    <span className="block text-xl font-extrabold">
                      {method === "cash" ? "Tien mat" : "Chuyen khoan"}
                    </span>
                    <span className="mt-1 block text-sm font-bold opacity-70">
                      {method === "cash" ? "Nhap tien khach dua" : "Can anh xac nhan"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedPaymentMethod === "cash" ? (
            <div className="space-y-4">
              <div className="relative">
                <input
                  className="h-[66px] w-full rounded-xl border border-slate-200 bg-white px-5 pr-16 text-xl font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                  min="0"
                  onChange={(event) => updateActiveBillField("cashReceived", event.target.value)}
                  placeholder="Nhap so tien khach dua"
                  ref={paidAmountRef}
                  type="number"
                  value={cashReceived}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                  <ShortcutTag>F4</ShortcutTag>
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
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
              <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-bold text-slate-500">Khach dua</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                    {formatCurrency(paidAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-500">Tien thua</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                    {formatCurrency(changeAmount)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                className="flex min-h-28 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:bg-slate-50"
                onClick={() => setPaymentQrModalOpen(true)}
                type="button"
              >
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <QrCode className="h-7 w-7" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xl font-extrabold text-slate-900">
                    Ma nhan tien
                  </span>
                  <span className="mt-1 block text-sm font-bold text-slate-500">
                    {paymentSettings?.transfer_qr_url ? "Bam de hien QR" : "Chua cai dat QR"}
                  </span>
                </span>
              </button>

              <button
                className={`flex min-h-28 items-center gap-4 rounded-2xl border p-5 text-left transition ${
                  paymentProofFile
                    ? "border-green-300 bg-green-50 hover:bg-green-100"
                    : "border-amber-200 bg-amber-50 hover:bg-amber-100"
                }`}
                onClick={() => setPaymentProofModalOpen(true)}
                type="button"
              >
                <span
                  className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${
                    paymentProofFile ? "bg-green-100 text-green-700" : "bg-white text-amber-700"
                  }`}
                >
                  <ImagePlus className="h-7 w-7" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xl font-extrabold text-slate-900">
                    Xac nhan thanh toan
                  </span>
                  <span className="mt-1 block truncate text-sm font-bold text-slate-600">
                    {paymentProofFile
                      ? `Da co anh: ${paymentProofFile.name}`
                      : paymentProofNote.trim()
                        ? "Da xac nhan thu cong"
                        : canUploadPaymentProof
                          ? "Chup anh hoac nhap ma giao dich"
                          : "Nhap ma giao dich/ghi chu"}
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
        </Modal>
      ) : null}
      <Modal
        footer={
          <Button onClick={() => setPaymentQrModalOpen(false)} type="button" variant="secondary">
            Dong
          </Button>
        }
        onClose={() => setPaymentQrModalOpen(false)}
        open={paymentQrModalOpen}
        size="md"
        title="Ma nhan tien"
      >
        {paymentSettings?.transfer_qr_url ? (
          <div className="space-y-4">
            <img
              alt="Ma nhan tien"
              className="mx-auto aspect-square w-full max-w-sm rounded-2xl bg-slate-50 object-contain"
              src={paymentSettings.transfer_qr_url}
            />
            {paymentSettings.transfer_note ? (
              <p className="whitespace-pre-line rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
                {paymentSettings.transfer_note}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center text-slate-500">
            <QrCode className="h-16 w-16" />
            <p className="mt-3 text-base font-extrabold">Chua cai dat ma nhan tien.</p>
          </div>
        )}
      </Modal>
      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setPaymentProofModalOpen(false)} type="button" variant="secondary">
              Huy
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!paymentProofFile && !paymentProofNote.trim()}
              onClick={() => setPaymentProofModalOpen(false)}
              type="button"
            >
              Xong
            </Button>
          </div>
        }
        onClose={() => setPaymentProofModalOpen(false)}
        open={paymentProofModalOpen}
        size="lg"
        title="Chup thanh toan"
      >
        <div className="space-y-4">
          {canUploadPaymentProof ? (
            <>
              <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center transition hover:bg-slate-50">
                {paymentProofPreview ? (
                  <img
                    alt="Anh thanh toan"
                    className="max-h-[56vh] w-full rounded-xl object-contain"
                    src={paymentProofPreview}
                  />
                ) : (
                  <>
                    <ImagePlus className="h-14 w-14 text-slate-400" />
                    <span className="mt-3 text-xl font-extrabold text-slate-800">
                      Chon hoac chup anh
                    </span>
                    <span className="mt-1 text-sm font-bold text-slate-500">
                      Anh bien lai chuyen khoan cua khach
                    </span>
                  </>
                )}
                <input
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => handlePaymentProofChange(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              {paymentProofFile ? (
                <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-extrabold text-green-700">
                  Da chon anh: {paymentProofFile.name}
                </p>
              ) : (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-700">
                  May PC khong co camera co the nhap ma giao dich/ghi chu xac nhan ben duoi.
                </p>
              )}
            </>
          ) : null}
          <Textarea
            label="Xac nhan thu cong tren PC"
            onChange={(event) => setPaymentProofNote(event.target.value)}
            placeholder="Nhap ma giao dich, ten nguoi kiem tra, hoac ghi chu da doi soat..."
            value={paymentProofNote}
          />
        </div>
      </Modal>
      {canCheckout ? (
        <Modal
        footer={
          <Button
            onClick={() => {
              setBatchModalOpen(false);
              setProductToBatchSelect(null);
            }}
            type="button"
            variant="secondary"
          >
            Dong
          </Button>
        }
        onClose={() => {
          setBatchModalOpen(false);
          setProductToBatchSelect(null);
        }}
        open={batchModalOpen}
        size="lg"
        title="Chon date nhap kho"
      >
        {productToBatchSelect ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">San pham</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">
                {productToBatchSelect.name}
              </p>
            </div>
            <div className="grid gap-3">
              {getProductBatches(productToBatchSelect.id).map((batch) => {
                const selectedQuantity = getQuantityInCart(productToBatchSelect.id, batch.id);
                const disabled = selectedQuantity >= batch.quantity;

                return (
                  <button
                    className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-center"
                    disabled={disabled}
                    key={batch.id}
                    onClick={() => addToCart(productToBatchSelect, batch)}
                    type="button"
                  >
                    <div>
                      <p className="text-lg font-extrabold text-slate-900">
                        Ngay nhap {formatProductDate(batch.import_date)}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        Han su dung {formatProductDate(batch.expiry_date)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-extrabold uppercase text-slate-400">Con lai</p>
                      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                        {batch.quantity - selectedQuantity}
                      </p>
                    </div>
                    <span className="rounded-xl bg-green-600 px-4 py-3 text-center text-sm font-extrabold text-white">
                      Chon lo
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        </Modal>
      ) : null}
      {canCheckout ? (
        <Ean13ScannerModal
          description="Quet EAN-13 de them nhanh san pham vao hoa don hien tai."
          onClose={() => setEan13ScannerOpen(false)}
          onDetected={handleEan13Detected}
          open={ean13ScannerOpen}
          title="Quet EAN-13 ban hang"
        />
      ) : null}
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
