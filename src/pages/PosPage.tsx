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
  const quickProducts = useMemo(
    () => activeProducts.filter((product) => product.stock > 0).slice(0, 8),
    [activeProducts]
  );

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
  const availableProductCount = activeProducts.filter((product) => product.stock > 0).length;
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
    const selectedBatch = batch === undefined && batches.length === 1 ? batches[0] : batch;

    if (batch === undefined && batches.length > 1) {
      setProductToBatchSelect(product);
      setBatchModalOpen(true);
      return;
    }

    updateActiveCart((current) => {
      const quantityInCart = current
        .filter((item) => item.product.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      const quantityInBatch = selectedBatch
        ? current
            .filter((item) => item.batch?.id === selectedBatch?.id)
            .reduce((sum, item) => sum + item.quantity, 0)
        : 0;
      const maxByBatch = selectedBatch
        ? selectedBatch.quantity - quantityInBatch
        : product.stock - quantityInCart;

      if (quantityInCart >= product.stock || maxByBatch <= 0) {
        return current;
      }

      if (lineSeparated) {
        return [
          ...current,
          { batch: selectedBatch ?? null, lineId: createLineId(product.id), product, quantity: 1 },
        ];
      }

      const existingItem = current.find(
        (item) =>
          item.product.id === product.id &&
          (item.batch?.id ?? null) === (selectedBatch?.id ?? null)
      );

      if (existingItem) {
        return current.map((item) =>
          item.lineId === existingItem.lineId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [
        ...current,
        { batch: selectedBatch ?? null, lineId: createLineId(product.id), product, quantity: 1 },
      ];
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
    <div className="min-h-screen bg-moss-50">
      <header className="sticky top-0 z-40 rounded-b-2xl border-b border-moss-100 bg-white/95 px-3 py-2 pl-16 shadow-[0_10px_28px_rgba(16,32,24,0.10)] backdrop-blur lg:pl-4 xl:px-4">
        <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center">
          <div className="flex min-w-0 flex-1 gap-2">
            {canCheckout ? (
              <button
                aria-label="Quet EAN-13"
                className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.16)] transition hover:bg-slate-800 md:h-14 md:w-14"
                onClick={() => setEan13ScannerOpen(true)}
                type="button"
              >
                <Barcode className="h-6 w-6" />
              </button>
            ) : null}
            <div className="relative min-w-0 flex-1">
              <input
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-16 text-base font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-moss-300 focus:ring-4 focus:ring-moss-100 md:h-14 md:px-5 md:pr-20 md:text-lg"
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
                                  <span className="rounded-lg bg-moss-50 px-2 py-1 text-moss-700">
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
                              <span className="rounded-xl bg-moss-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm">
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

          <div className="hidden min-w-0 items-end gap-1 overflow-x-auto pb-1 md:flex 2xl:shrink-0">
            {workspace.bills.map((bill) => (
              <button
                className={`flex h-11 min-w-20 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-extrabold transition ${
                  activeBill.id === bill.id
                    ? "border-moss-300 bg-moss-100 text-moss-900"
                    : "border-moss-100 bg-white text-slate-500"
                }`}
                key={bill.id}
                onClick={() => switchBill(bill.id)}
                type="button"
              >
                Don {bill.id}
                {bill.savedAt ? (
                  <span className="h-2 w-2 rounded-full bg-moss-500" />
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
                className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-moss-100 bg-white text-moss-700 transition hover:bg-moss-50"
                onClick={addBill}
                type="button"
              >
                <Plus className="h-5 w-5" />
              </button>
            ) : null}
          </div>

          <div className="hidden shrink-0 items-center justify-end gap-2 2xl:flex">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex h-12 min-w-52 items-center gap-3 rounded-xl bg-white px-3 pr-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-moss-100 text-base font-extrabold text-moss-700">
                {userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-slate-900">
                  {displayName}
                </span>
                <span className="block truncate text-xs font-bold text-slate-500">
                  {roleLabel}
                </span>
              </span>
              <ChevronDown className="h-5 w-5 text-slate-400" />
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[100vw] px-3 py-3 xl:px-4">
        <div className="mx-auto w-full max-w-none space-y-4">
          <ConfigNotice />

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700 shadow-sm">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-moss-200 bg-moss-50 px-5 py-4 text-sm font-bold text-moss-700 shadow-sm">
              {success}
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_clamp(360px,26vw,480px)]">
            <div className="space-y-3">
              {!loading && quickProducts.length > 0 ? (
                <section className="overflow-hidden rounded-xl bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
                  <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">San pham nhanh</h2>
                      <p className="mt-0.5 text-xs font-bold text-slate-500">
                        {availableProductCount} mat hang con ton
                      </p>
                    </div>
                    <button
                      className="w-fit rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200"
                      onClick={() => productSearchRef.current?.focus()}
                      type="button"
                    >
                      Tim bang F3
                    </button>
                  </div>
                  <div className="grid gap-2 p-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                    {quickProducts.map((product) => {
                      const quantityInCart = getQuantityInCart(product.id);
                      const disabled = !canCheckout || quantityInCart >= product.stock;

                      return (
                        <button
                          className="grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left transition hover:border-moss-200 hover:bg-moss-50 disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={disabled}
                          key={product.id}
                          onClick={() => addToCart(product)}
                          type="button"
                        >
                          <div className="h-10 w-10 overflow-hidden rounded-md bg-slate-100">
                            {product.image_url ? (
                              <img
                                alt={product.name}
                                className="h-full w-full object-cover"
                                src={product.image_url}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-400">
                                <ShoppingBag className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="line-clamp-2 text-xs font-extrabold leading-tight text-slate-900">
                              {product.name}
                            </span>
                            <span className="mt-0.5 text-xs font-extrabold tabular-nums text-moss-700">
                              {formatCurrency(product.price)}
                            </span>
                            <span className="mt-auto truncate text-[11px] font-bold text-slate-500">
                              Ton {product.stock}
                              {quantityInCart > 0 ? ` / Da chon ${quantityInCart}` : ""}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="overflow-hidden rounded-xl bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)] ring-1 ring-slate-100">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <h1 className="whitespace-nowrap text-xl font-extrabold text-slate-900">
                    San pham ({totalItems})
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                      <input
                        checked={lineSeparated}
                        className="h-4 w-4 rounded border-slate-300 text-moss-600 focus:ring-moss-500"
                        onChange={(event) => setLineSeparated(event.target.checked)}
                        type="checkbox"
                      />
                      Tach dong san pham
                    </label>
                    {canCheckout ? (
                      <button
                        className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-extrabold text-red-400 transition hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
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
                  <div className="min-h-[220px]">
                    <Spinner label="Dang tai du lieu POS..." />
                  </div>
                ) : cart.length === 0 ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center px-6 py-6 text-center md:min-h-[210px]">
                    <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <DollarSign className="h-12 w-12 stroke-[1.5]" />
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-500">
                      Ban chua them san pham nao
                    </h2>
                    <p className="mt-2 text-sm font-medium text-slate-500">
                      Nhan phim: F3 de tim kiem nhanh san pham
                    </p>
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-285px)] divide-y divide-slate-100 overflow-y-auto">
                    {cart.map((item) => {
                      const quantityInProduct = getQuantityInCart(item.product.id);

                      return (
                        <article
                          className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_150px_130px_44px] md:items-center"
                          key={item.lineId}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="h-16 w-16 flex-none overflow-hidden rounded-lg bg-slate-100">
                              {item.product.image_url ? (
                                <img
                                  alt={item.product.name}
                                  className="h-full w-full object-cover"
                                  src={item.product.image_url}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <ShoppingBag className="h-6 w-6" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="line-clamp-2 text-base font-extrabold leading-tight text-slate-900">
                                {item.product.name}
                              </h3>
                              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                EAN-13 {getProductEan13Value(item.product)} -{" "}
                                {formatCurrency(item.product.price)}
                              </p>
                              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                                Ton kho: {item.product.stock}
                              </p>
                              {item.batch ? (
                                <p className="mt-0.5 truncate text-xs font-extrabold text-moss-600">
                                  Lo: {formatProductDate(item.batch.import_date)} - HSD{" "}
                                  {formatProductDate(item.batch.expiry_date)} ({item.batch.quantity})
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {canCheckout ? (
                            <div className="flex w-fit items-center gap-1 rounded-lg bg-slate-50 p-1">
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
                                onClick={() => changeQuantity(item.lineId, item.quantity - 1)}
                                type="button"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-9 text-center text-lg font-extrabold text-slate-900">
                                {item.quantity}
                              </span>
                              <button
                                className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={quantityInProduct >= item.product.stock}
                                onClick={() => changeQuantity(item.lineId, item.quantity + 1)}
                                type="button"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-lg font-extrabold text-slate-900">
                              {item.quantity}
                            </span>
                          )}

                          <p className="text-left text-lg font-extrabold tabular-nums text-slate-900 md:text-right">
                            {formatCurrency(item.product.price * item.quantity)}
                          </p>

                          {canCheckout ? (
                            <button
                              aria-label="Xoa san pham"
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500"
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

              <div className="hidden gap-3 md:grid md:grid-cols-2">
                <section className="rounded-xl bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    Don dang xu ly
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-4">
                    <h2 className="text-xl font-extrabold text-slate-900">Don {activeBill.id}</h2>
                    <span className="text-right text-base font-extrabold tabular-nums text-moss-700">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {activeBill.savedAt ? "Da luu tam tren may nay" : "Chua luu tam"}
                  </p>
                </section>
                <section className="rounded-xl bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    Nhan vien
                  </p>
                  <h2 className="mt-1 truncate text-xl font-extrabold text-slate-900">
                    {profile?.full_name || user?.email || "Chua co ten"}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {availableProductCount} san pham san sang ban
                  </p>
                </section>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <input
                  className="h-12 rounded-xl border-0 bg-white px-4 text-base font-medium text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.05)] outline-none ring-1 ring-slate-100 transition placeholder:text-slate-500 focus:ring-4 focus:ring-moss-100"
                  onChange={(event) => updateActiveBillField("orderNote", event.target.value)}
                  placeholder="Nhap ghi chu don hang"
                  value={orderNote}
                />
                {canCheckout ? (
                  <button
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-moss-500 bg-moss-50 px-4 text-base font-extrabold text-moss-600 transition hover:bg-moss-100 disabled:cursor-not-allowed disabled:opacity-60"
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

             <div className="space-y-3 xl:sticky xl:top-[4.75rem] xl:flex xl:max-h-[calc(100dvh-5.25rem)] xl:flex-col xl:self-start xl:overflow-hidden">
              <section className="min-h-0 rounded-xl bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.08)] ring-1 ring-slate-100 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-14 text-base font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-moss-300 focus:ring-4 focus:ring-moss-100"
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
                  </div>
                  {canCreateQuickCustomer ? (
                    <button
                      aria-label="Them khach hang"
                      className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-moss-600 text-white shadow-[0_10px_22px_rgba(22,163,74,0.22)] transition hover:bg-moss-700"
                      onClick={() => setCustomerModalOpen(true)}
                      type="button"
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  ) : null}
                </div>

                {customerResults.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="max-h-48 overflow-y-auto overscroll-contain p-1.5">
                      {customerResults.map((customer) => (
                        <button
                          className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                          key={customer.id}
                          onClick={() => selectCustomer(customer)}
                          type="button"
                        >
                          <span className="truncate text-sm font-extrabold text-slate-900">
                            {customer.name}
                          </span>
                          <span className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                            {customer.phone || "Chua co so dien thoai"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">
                      Tam tinh ({totalItems} san pham)
                    </span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    {canApplyDiscount ? (
                      <label className="flex min-w-0 items-center gap-1 text-sm font-extrabold text-moss-600">
                        <span>Giam gia:</span>
                        <input
                          className="h-9 w-28 rounded-lg border border-slate-100 bg-white px-2 text-right text-sm font-extrabold text-moss-600 outline-none focus:border-moss-300 focus:ring-4 focus:ring-moss-100"
                          min="0"
                          onChange={(event) => updateActiveBillField("discount", event.target.value)}
                          ref={discountRef}
                          type="number"
                          value={discount}
                        />
                        <ShortcutTag>F6</ShortcutTag>
                      </label>
                    ) : (
                      <span className="text-sm font-extrabold text-moss-600">Giam gia</span>
                    )}
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(safeDiscount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">Thanh tien</span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">Khach dua</span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(paidAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">Tien thua</span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>

                  <div className="rounded-xl border border-moss-100 bg-moss-50 px-4 py-3 md:col-span-2 xl:col-span-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-lg font-extrabold text-moss-800">Can thu</span>
                      <span className="min-w-[10ch] text-right text-2xl font-extrabold tabular-nums text-moss-800">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.08)] ring-1 ring-slate-100 xl:flex-none">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    checked={autoPrint}
                    className="h-4 w-4 rounded border-slate-300 text-moss-600 focus:ring-moss-500"
                    onChange={(event) => setAutoPrint(event.target.checked)}
                    type="checkbox"
                  />
                  In hoa don tu dong
                </label>

                {canCheckout ? (
                  <button
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-moss-600 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(22,163,74,0.24)] transition hover:bg-moss-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={cart.length === 0 || submittingSale}
                    onClick={openPaymentModal}
                    type="button"
                  >
                    {submittingSale ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
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
              className="bg-moss-600 hover:bg-moss-700"
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
                      ? "border-moss-500 bg-moss-50 text-moss-800 ring-4 ring-moss-100"
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
                  className="h-[66px] w-full rounded-xl border border-slate-200 bg-white px-5 pr-16 text-xl font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-moss-300 focus:ring-4 focus:ring-moss-100"
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
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-moss-50 text-moss-700">
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
                    ? "border-moss-300 bg-moss-50 hover:bg-moss-100"
                    : "border-amber-200 bg-amber-50 hover:bg-amber-100"
                }`}
                onClick={() => setPaymentProofModalOpen(true)}
                type="button"
              >
                <span
                  className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${
                    paymentProofFile ? "bg-moss-100 text-moss-700" : "bg-white text-amber-700"
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
              className="bg-moss-600 hover:bg-moss-700"
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
                <p className="rounded-2xl bg-moss-50 px-4 py-3 text-sm font-extrabold text-moss-700">
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
                    <span className="rounded-xl bg-moss-600 px-4 py-3 text-center text-sm font-extrabold text-white">
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
