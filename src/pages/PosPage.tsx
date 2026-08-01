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
  Check,
  ChevronDown,
  DollarSign,
  ImagePlus,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  QrCode,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
import { uploadPaymentProof } from "../lib/cloudinary";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { normalizeNullableText } from "../lib/text";
import { printPosReceipt } from "../lib/receipt";
import {
  findProductByEan13,
  formatProductDate,
  getProductEan13Value,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import { createCustomer, fetchCustomers, type CustomerInput } from "../services/customers";
import { createSale, recordOrderPrint, type PaymentMethod } from "../services/orders";
import { fetchPaymentSettings } from "../services/paymentSettings";
import { fetchProductBatches, fetchProducts, getActiveProducts } from "../services/products";
import type { CartItem, Customer, Order, PaymentSettings, Product, ProductBatch } from "../types";

type PosCartItem = CartItem & {
  lineId: string;
};

type CompletedSale = {
  customer: Customer | null;
  items: PosCartItem[];
  order: Order;
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

const posWorkspaceStorageKey = (userId: string) => `hoang-an-pos:pos-workspace:v2:${userId}`;

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

function loadPosWorkspace(userId?: string): PosWorkspace {
  if (typeof window === "undefined" || !userId) {
    return createInitialWorkspace();
  }

  try {
    const rawValue = window.localStorage.getItem(posWorkspaceStorageKey(userId));
    if (!rawValue) {
      return createInitialWorkspace();
    }

    const parsed = JSON.parse(rawValue) as Partial<PosWorkspace>;
    const loadedBills = Array.isArray(parsed.bills)
      ? parsed.bills.map((bill, index) => normalizeBill(bill, index + 1))
      : [];
    const bills = Array.isArray(parsed.bills) ? loadedBills : createInitialWorkspace().bills;
    const activeBillId = bills.length === 0
      ? 0
      : bills.some((bill) => bill.id === parsed.activeBillId)
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
      setError("Tên khách hàng là bắt buộc.");
      return;
    }

    await onSubmit({
      name,
      note: normalizeNullableText(form.note),
      phone: normalizeNullableText(form.phone),
    });
  }

  return (
    <form className="space-y-4" id={formId} onSubmit={handleSubmit}>
      <Input
        label="Tên khách hàng"
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
      {renderLegacyModalActions ? (
        <div className="hidden">
        <Button onClick={onCancel} type="button" variant="secondary">
          Hủy
        </Button>
        <Button isLoading={submitting} type="submit">
          Lưu khách hàng
        </Button>
        </div>
      ) : null}
    </form>
  );
}

export function PosPage() {
  const { canAccess, user } = useAuth();
  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const focusSearchAfterBatchRef = useRef(true);
  const paidAmountRef = useRef<HTMLInputElement>(null);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [cartExpanded, setCartExpanded] = useState(true);
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
  const [quickProductsExpanded, setQuickProductsExpanded] = useState(true);
  const [productQuery, setProductQuery] = useState("");
  const [productToBatchSelect, setProductToBatchSelect] = useState<Product | null>(null);
  const [printingCompletedSale, setPrintingCompletedSale] = useState(false);
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [success, setSuccess] = useState("");
  const [workspace, setWorkspace] = useState<PosWorkspace>(() => loadPosWorkspace(user?.id));
  const { clearErrorNotice, errorNotice, showErrorNotice } = useErrorNotice(setError);

  const activeBill =
    workspace.bills.find((bill) => bill.id === workspace.activeBillId) ??
    workspace.bills[0] ??
    createEmptyBill(1);
  const hasActiveBill = workspace.bills.some((bill) => bill.id === workspace.activeBillId);
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
        requestError instanceof Error ? requestError.message : "Không tải được dữ liệu POS.",
        "Không tải được dữ liệu POS"
      );
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  useEffect(() => {
    void loadPosData();
  }, [loadPosData]);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) {
      return;
    }

    window.localStorage.removeItem("hoang-an-pos:pos-workspace:v1");
    window.localStorage.setItem(posWorkspaceStorageKey(user.id), JSON.stringify(workspace));
  }, [user?.id, workspace]);

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
      const nextBills = current.bills.filter((bill) => bill.id !== billId);
      const activeBillId =
        current.activeBillId === billId
          ? nextBills[nextBills.length - 1]?.id ?? 0
          : current.activeBillId;

      return { activeBillId, bills: nextBills };
    });
    setPaymentModalOpen(false);
    setProductQuery("");
    setError("");
    setSuccess("");
  }

  function addToCart(
    product: Product,
    batch?: ProductBatch | null,
    focusSearchAfterAdd = true
  ) {
    if (!canCheckout) {
      return;
    }

    setSuccess("");
    setError("");

    if (product.stock <= 0) {
      showErrorNotice("Sản phẩm này đã hết hàng.", "Không thể thêm sản phẩm");
      return;
    }

    const batches = getProductBatches(product.id);
    const selectedBatch = batch === undefined && batches.length === 1 ? batches[0] : batch;

    if (batch === undefined && batches.length > 1) {
      focusSearchAfterBatchRef.current = focusSearchAfterAdd;
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
    if (focusSearchAfterAdd) {
      productSearchRef.current?.focus();
    }
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
      showErrorNotice("Mã quét không phải EAN-13 hợp lệ.", "EAN-13 không hợp lệ");
      setProductQuery(ean13Code);
      productSearchRef.current?.focus();
      return;
    }

    if (!product) {
      showErrorNotice(
        `Chưa có sản phẩm trong cơ sở dữ liệu với EAN-13 ${ean13Code}.`,
        "Không có sản phẩm"
      );
      setProductQuery(ean13Code);
      productSearchRef.current?.focus();
      return;
    }

    if (!product.is_active) {
      showErrorNotice(`Sản phẩm "${product.name}" đang tạm ẩn.`, "Sản phẩm chưa được bán");
      return;
    }

    if (product.stock <= 0 || getQuantityInCart(product.id) >= product.stock) {
      showErrorNotice(`Sản phẩm "${product.name}" không còn tồn để thêm.`, "Hết tồn kho");
      return;
    }

    addToCart(product);
    setSuccess(`Đã quét ${product.name}.`);
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
        requestError instanceof Error ? requestError.message : "Không thêm được khách hàng.",
        "Không thêm được khách hàng"
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
      showErrorNotice("Giỏ hàng đang trống.", "Chưa có sản phẩm");
      return null;
    }

    if (Number.isNaN(discountValue) || discountValue < 0) {
      showErrorNotice("Giảm giá phải là số không âm.", "Giảm giá không hợp lệ");
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
      showErrorNotice("Khách đưa chưa đủ số tiền cần thu.", "Chưa đủ tiền thanh toán");
      paidAmountRef.current?.focus();
      return;
    }

    if (selectedPaymentMethod === "transfer" && !paymentProofFile && !paymentProofNote.trim()) {
      showErrorNotice(
        "Cần chụp/chọn ảnh hoặc nhập mã giao dịch để xác nhận chuyển khoản.",
        "Thiếu xác nhận thanh toán"
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
        note: normalizeNullableText(orderNote),
        paymentMethod: selectedPaymentMethod,
        paymentProofNote: normalizeNullableText(paymentProofNote),
        paymentProofUrl,
      });
      const completedItems = [...cart];
      const completedCustomer = selectedCustomer;

      updateActiveBill((bill) => createEmptyBill(bill.id));
      setPaymentModalOpen(false);
      setPaymentProofModalOpen(false);
      setPaymentQrModalOpen(false);
      setPaymentProofFile(null);
      setPaymentProofNote("");
      setPaymentProofPreview("");
      const earnedPoints = completedCustomer ? Math.floor(Number(order.total) / 100000) : 0;
      setSuccess(
        `Đã tạo hóa đơn ${order.code} với tổng tiền ${formatCurrency(order.total)}.${
          completedCustomer ? ` Khách hàng được cộng ${earnedPoints} điểm.` : ""
        }`
      );
      setCompletedSale({
        customer: completedCustomer,
        items: completedItems,
        order,
      });
      await loadPosData();
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Tạo hóa đơn thất bại.",
        "Tạo hóa đơn thất bại"
      );
    } finally {
      setSubmittingSale(false);
    }
  }

  async function handlePrintCompletedSale() {
    if (!completedSale || printingCompletedSale) {
      return;
    }

    setPrintingCompletedSale(true);
    try {
      const updatedOrder = await recordOrderPrint(completedSale.order.id);
      const nextSale = {
        ...completedSale,
        order: { ...completedSale.order, print_count: updatedOrder.print_count },
      };
      setCompletedSale(nextSale);
      printPosReceipt(nextSale);
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Không in được hóa đơn.",
        "In hóa đơn thất bại"
      );
    } finally {
      setPrintingCompletedSale(false);
    }
  }

  function handleSaveBill() {
    if (!canCheckout) {
      return;
    }

    setError("");
    setSuccess("");

    if (cart.length === 0 && !selectedCustomerId && !orderNote.trim()) {
      showErrorNotice("Đơn hiện tại chưa có thông tin để lưu.", "Không thể lưu đơn");
      return;
    }

    updateActiveBill((bill) => ({
      ...bill,
      savedAt: new Date().toISOString(),
    }));
    setSuccess(`Đã lưu đơn ${activeBill.id} trên máy này.`);
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[linear-gradient(135deg,#f8faf7_0%,#f1f5ee_55%,#f8fafc_100%)]">
      <header className="sticky top-0 z-40 border-b border-moss-100 bg-white/95 px-2 py-1.5 shadow-[0_8px_28px_rgba(57,67,46,0.10)] backdrop-blur-xl sm:px-3 sm:py-2 xl:px-4">
        <div className="flex flex-col gap-1.5 lg:gap-2 xl:flex-row xl:items-center">
          <div className="flex min-w-0 flex-1 gap-1.5 pl-12 lg:gap-2 lg:pl-0">
            {canCheckout ? (
              <button
                aria-label="Quét EAN-13"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-moss-700 text-white shadow-[0_8px_18px_rgba(72,84,54,0.24)] transition hover:bg-moss-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-moss-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none lg:h-12 lg:w-12 lg:rounded-xl xl:h-14 xl:w-14"
                disabled={!hasActiveBill}
                onClick={() => setEan13ScannerOpen(true)}
                type="button"
              >
                <Barcode className="h-5 w-5 xl:h-6 xl:w-6" />
              </button>
            ) : null}
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 lg:left-4 lg:h-5 lg:w-5"
              />
              <input
                aria-label="Tìm sản phẩm"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-10 text-sm font-semibold text-slate-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-moss-400 focus:ring-4 focus:ring-moss-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 lg:h-12 lg:rounded-xl lg:pl-11 lg:pr-12 lg:text-base xl:h-14 xl:pl-12 xl:pr-20 xl:text-lg"
                disabled={!hasActiveBill}
                onChange={(event) => setProductQuery(event.target.value)}
                onKeyDown={handleProductSearchKeyDown}
                placeholder={hasActiveBill ? "Tìm sản phẩm hoặc EAN-13" : "Tạo đơn mới để bắt đầu bán hàng"}
                ref={productSearchRef}
                value={productQuery}
              />
              {productQuery && hasActiveBill ? (
                <button
                  aria-label="Xóa nội dung tìm kiếm"
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:right-2 lg:h-9 lg:w-9 xl:right-3"
                  onClick={() => {
                    setProductQuery("");
                    productSearchRef.current?.focus();
                  }}
                  type="button"
                >
                  <X className="h-4 w-4 lg:h-5 lg:w-5" />
                </button>
              ) : hasActiveBill ? (
                <span className="absolute right-4 top-1/2 hidden -translate-y-1/2 lg:block">
                  <ShortcutTag>F3</ShortcutTag>
                </span>
              ) : null}

              {productQuery ? (
                <div
                  className={`fixed left-2 right-2 top-[6.25rem] z-50 max-h-[min(60dvh,620px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:left-3 sm:right-3 sm:top-[6.5rem] lg:absolute lg:right-0 lg:top-[calc(100%+4rem)] xl:top-[calc(100%+0.5rem)] ${
                    canCheckout ? "lg:-left-16 xl:left-0" : "lg:left-0"
                  }`}
                >
                  {loading ? (
                    <Spinner label="Đang tải sản phẩm..." />
                  ) : productResults.length === 0 ? (
                    <div className="flex items-center gap-3 p-5 text-sm font-semibold text-slate-500">
                      <PackageSearch className="h-5 w-5" />
                      Không tìm thấy sản phẩm phù hợp.
                    </div>
                  ) : (
                    <div className="max-h-[min(70vh,620px)] overflow-y-auto p-2">
                      {productResults.map((product) => {
                        const quantityInCart = getQuantityInCart(product.id);
                        const disabled =
                          !canCheckout || product.stock <= 0 || quantityInCart >= product.stock;

                        return (
                          <button
                            className="grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl p-2 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-400 disabled:cursor-not-allowed disabled:opacity-55 sm:grid-cols-[68px_minmax(0,1fr)_120px_96px] sm:p-3"
                            disabled={disabled}
                            key={product.id}
                            onClick={() => addToCart(product)}
                            type="button"
                          >
                            <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100 sm:h-[68px] sm:w-[68px]">
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
                              <p className="mt-1 text-sm font-extrabold tabular-nums text-moss-700 sm:hidden">
                                {formatCurrency(product.price)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs font-extrabold">
                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">
                                  Tồn {product.stock}
                                </span>
                                {quantityInCart > 0 ? (
                                  <span className="rounded-lg bg-moss-50 px-2 py-1 text-moss-700">
                                    Đã chọn {quantityInCart}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="hidden text-right sm:block">
                              <p className="text-xs font-extrabold uppercase text-slate-400">Giá</p>
                              <p className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">
                                {formatCurrency(product.price)}
                              </p>
                            </div>
                            {canCheckout ? (
                              <span className="flex h-11 items-center rounded-xl bg-moss-700 px-3 text-sm font-extrabold text-white shadow-sm">
                                Thêm
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

          <div
            aria-label="Danh sách đơn đang bán"
            className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto lg:gap-1.5 xl:max-w-[46%] xl:flex-none"
          >
            {workspace.bills.length === 0 ? (
              <span className="inline-flex h-9 flex-none items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs font-extrabold text-slate-500 lg:h-11 lg:rounded-xl lg:text-sm">
                Chưa có đơn
              </span>
            ) : null}
            {workspace.bills.map((bill) => {
              const isActive = activeBill.id === bill.id;
              const billItemCount = bill.cart.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <div
                  className={`flex h-9 flex-none items-stretch overflow-hidden rounded-lg border transition lg:h-11 lg:rounded-xl ${
                    isActive
                      ? "border-moss-700 bg-gradient-to-r from-moss-800 to-moss-600 text-white shadow-[0_8px_18px_rgba(72,84,54,0.22)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-moss-200 hover:bg-moss-50"
                  }`}
                  key={bill.id}
                >
                  <button
                    aria-current={isActive ? "page" : undefined}
                    className="flex min-w-16 items-center gap-1.5 whitespace-nowrap px-2 text-xs font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-300 lg:min-w-24 lg:gap-2 lg:px-3 lg:text-sm"
                    onClick={() => switchBill(bill.id)}
                    type="button"
                  >
                    Đơn {bill.id}
                    {billItemCount > 0 ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                          isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {billItemCount}
                      </span>
                    ) : null}
                    {bill.savedAt ? (
                      <span
                        aria-label="Đã lưu tạm"
                        className={`h-2 w-2 rounded-full ${
                          isActive ? "bg-moss-300" : "bg-moss-500"
                        }`}
                      />
                    ) : null}
                  </button>
                  {canCheckout ? (
                    <button
                      aria-label={`Đóng đơn ${bill.id}`}
                      className={`${isActive ? "flex" : "hidden lg:flex"} w-8 items-center justify-center border-l transition lg:w-9 ${
                        isActive
                          ? "border-white/15 text-white/65 hover:bg-white/10 hover:text-white"
                          : "border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      }`}
                      onClick={() => closeBill(bill.id)}
                      type="button"
                    >
                      <X className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {canCheckout ? (
              <button
                aria-label="Thêm đơn mới"
                className="flex h-9 min-w-9 flex-none items-center justify-center rounded-lg border border-moss-600 bg-moss-600 text-white shadow-sm transition hover:bg-moss-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-400 lg:h-11 lg:min-w-11 lg:rounded-xl"
                onClick={addBill}
                type="button"
              >
                <Plus className="h-4 w-4 lg:h-5 lg:w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className={`w-full max-w-[100vw] px-2 pt-3 sm:px-3 xl:pb-4 xl:px-4 ${
          hasActiveBill ? "pb-[calc(7.5rem+env(safe-area-inset-bottom))]" : "pb-5"
        }`}
      >
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

          {!hasActiveBill ? (
            <section className="mx-auto flex min-h-[min(68dvh,620px)] max-w-3xl flex-col items-center justify-center rounded-3xl border border-moss-200 bg-white px-5 py-12 text-center shadow-[0_20px_60px_rgba(57,67,46,0.10)] sm:px-10">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-moss-100 to-moss-200 text-moss-700 shadow-[0_12px_30px_rgba(72,84,54,0.16)]">
                <ShoppingBag className="h-10 w-10 stroke-[1.8]" />
              </div>
              <span className="mt-6 rounded-full bg-moss-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-moss-700">
                Khu vực bán hàng
              </span>
              <h1 className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
                Chưa có đơn đang bán
              </h1>
              <p className="mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500 sm:text-base">
                Hiện không còn đơn trong phiên bán hàng. Hãy tạo đơn mới khi bạn sẵn sàng phục vụ khách tiếp theo.
              </p>
              {canCheckout ? (
                <button
                  className="mt-7 flex h-14 items-center justify-center gap-2 rounded-2xl bg-moss-700 px-6 text-base font-extrabold text-white shadow-[0_14px_28px_rgba(72,84,54,0.28)] transition hover:-translate-y-0.5 hover:bg-moss-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-moss-200"
                  onClick={addBill}
                  type="button"
                >
                  <Plus className="h-5 w-5" />
                  Tạo đơn mới
                </button>
              ) : null}
            </section>
          ) : (
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_clamp(380px,27vw,480px)]">
            <div className="min-w-0 space-y-3">
              {!loading && quickProducts.length > 0 ? (
                <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_rgba(57,67,46,0.07)] ring-1 ring-moss-100">
                  <div
                    className={`grid grid-cols-1 gap-2 bg-gradient-to-r from-moss-50/90 to-white px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-4 ${
                      quickProductsExpanded ? "border-b border-moss-100" : ""
                    }`}
                  >
                    <button
                      aria-controls="pos-quick-products"
                      aria-expanded={quickProductsExpanded}
                      className="flex min-w-0 items-center gap-3 rounded-lg text-left outline-none transition hover:text-moss-700 focus-visible:ring-2 focus-visible:ring-moss-500"
                      onClick={() => setQuickProductsExpanded((current) => !current)}
                      type="button"
                    >
                      <div>
                        <h2 className="text-base font-extrabold text-slate-900">
                          Sản phẩm nhanh
                        </h2>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">
                          Chọn để thêm ngay · {availableProductCount} mặt hàng sẵn bán
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 flex-none text-slate-400 transition-transform ${
                          quickProductsExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <button
                      className="hidden w-fit rounded-xl bg-slate-100 px-3 py-2 text-xs font-extrabold text-slate-600 transition hover:bg-slate-200 sm:block"
                      onClick={() => productSearchRef.current?.focus()}
                      type="button"
                    >
                      Tìm bằng F3
                    </button>
                  </div>
                  {quickProductsExpanded ? (
                    <div
                      className="grid max-h-[min(48dvh,520px)] grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-2.5 sm:grid-cols-4 sm:p-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-4 2xl:grid-cols-6"
                      id="pos-quick-products"
                    >
                      {quickProducts.map((product) => {
                        const quantityInCart = getQuantityInCart(product.id);
                        const disabled = !canCheckout || quantityInCart >= product.stock;

                        return (
                          <button
                            aria-label={`Thêm ${product.name} vào đơn`}
                            className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss-400 disabled:cursor-not-allowed disabled:opacity-55 sm:p-2 ${
                              quantityInCart > 0
                                ? "border-moss-300 bg-moss-50 shadow-[0_6px_16px_rgba(72,84,54,0.10)]"
                                : "border-slate-200 bg-white hover:border-moss-300 hover:bg-moss-50"
                            }`}
                            disabled={disabled}
                            key={product.id}
                            onClick={() => addToCart(product, undefined, false)}
                            type="button"
                          >
                            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-100 sm:rounded-xl">
                              {product.image_url ? (
                                <img
                                  alt={product.name}
                                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                  src={product.image_url}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <ShoppingBag className="h-5 w-5" />
                                </div>
                              )}
                              {quantityInCart > 0 ? (
                                <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-moss-700 px-1.5 text-[10px] font-black text-white shadow-sm">
                                  {quantityInCart}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col px-0.5 pb-0.5 pt-1.5">
                              <span
                                className="line-clamp-2 min-h-8 text-[11px] font-extrabold leading-4 text-slate-900 sm:text-xs"
                                title={product.name}
                              >
                                {product.name}
                              </span>
                              <span
                                className="mt-1 block max-w-full truncate whitespace-nowrap text-[11px] font-extrabold tabular-nums text-moss-700 sm:text-xs"
                                title={formatCurrency(product.price)}
                              >
                                {formatIntegerInput(String(product.price))} đ
                              </span>
                              <span className="mt-1 truncate text-[10px] font-bold text-slate-500 sm:text-[11px]">
                                Tồn {product.stock}
                                {quantityInCart > 0 ? ` / Đã chọn ${quantityInCart}` : ""}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80">
                <div
                  className={`grid grid-cols-1 gap-2 bg-slate-50/80 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3 sm:px-4 ${
                    cartExpanded ? "border-b border-slate-100" : ""
                  }`}
                >
                  <button
                    aria-controls="pos-cart-products"
                    aria-expanded={cartExpanded}
                    className="flex min-w-0 items-center gap-2 rounded-lg text-left outline-none transition focus-visible:ring-2 focus-visible:ring-moss-500"
                    onClick={() => setCartExpanded((current) => !current)}
                    type="button"
                  >
                    <span>
                      <span className="block whitespace-nowrap text-lg font-extrabold text-slate-900 sm:text-xl">
                        Giỏ hàng
                      </span>
                      <span className="block text-xs font-bold text-slate-500">
                        Đơn {activeBill.id} · {totalItems} sản phẩm
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-400 transition-transform ${
                        cartExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700 sm:gap-2 sm:text-sm">
                      <input
                        checked={lineSeparated}
                        className="h-4 w-4 rounded border-slate-300 text-moss-600 focus:ring-moss-500"
                        onChange={(event) => setLineSeparated(event.target.checked)}
                        type="checkbox"
                      />
                      <span className="sm:hidden">Tách dòng</span>
                      <span className="hidden sm:inline">Tách dòng sản phẩm</span>
                    </label>
                    {canCheckout && cart.length > 0 ? (
                      <button
                        aria-label="Xóa tất cả sản phẩm trong giỏ"
                        className="flex h-10 items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 text-sm font-extrabold text-red-500 transition hover:border-red-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={clearCart}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Xóa tất cả</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {cartExpanded ? (
                  <div id="pos-cart-products">
                    {loading ? (
                      <div className="min-h-[220px]">
                        <Spinner label="Đang tải dữ liệu POS..." />
                      </div>
                    ) : cart.length === 0 ? (
                      <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-8 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-moss-50 text-moss-600">
                          <ShoppingBag className="h-8 w-8 stroke-[1.8]" />
                        </div>
                        <h2 className="text-lg font-extrabold text-slate-700">
                          Giỏ hàng đang trống
                        </h2>
                        <p className="mt-1.5 max-w-sm text-sm font-medium text-slate-500">
                          Tìm sản phẩm phía trên hoặc chọn từ danh sách sản phẩm nhanh.
                        </p>
                        <button
                          className="mt-4 rounded-xl bg-moss-700 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-moss-800"
                          onClick={() => productSearchRef.current?.focus()}
                          type="button"
                        >
                          Tìm sản phẩm
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {cart.map((item) => {
                          const quantityInProduct = getQuantityInCart(item.product.id);

                          return (
                            <article
                              className="grid grid-cols-[56px_minmax(0,1fr)_40px] gap-x-3 gap-y-3 p-3 transition hover:bg-moss-50/45 sm:grid-cols-[64px_minmax(0,1fr)_132px_130px_40px] sm:items-center sm:px-4 sm:py-3"
                              key={item.lineId}
                            >
                              <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100 sm:h-16 sm:w-16">
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
                              <div className="min-w-0 self-center">
                                <h3 className="line-clamp-2 text-sm font-extrabold leading-tight text-slate-900 sm:text-base">
                                  {item.product.name}
                                </h3>
                                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                  {getProductEan13Value(item.product)} ·{" "}
                                  {formatCurrency(item.product.price)}
                                </p>
                                {item.batch ? (
                                  <p className="mt-1 truncate text-xs font-extrabold text-moss-600">
                                    Lô {formatProductDate(item.batch.import_date)} · HSD{" "}
                                    {formatProductDate(item.batch.expiry_date)}
                                  </p>
                                ) : null}
                              </div>

                              <div className="col-span-3 row-start-2 flex min-w-0 items-center justify-between gap-2 sm:contents">
                                {canCheckout ? (
                                  <div className="flex w-fit flex-none items-center gap-0.5 rounded-xl bg-slate-100 p-1">
                                    <button
                                      aria-label={`Giảm số lượng ${item.product.name}`}
                                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 sm:h-10 sm:w-10"
                                      onClick={() => changeQuantity(item.lineId, item.quantity - 1)}
                                      type="button"
                                    >
                                      <Minus className="h-4 w-4" />
                                    </button>
                                    <span className="min-w-8 text-center text-base font-extrabold tabular-nums text-slate-900 sm:min-w-9 sm:text-lg">
                                      {item.quantity}
                                    </span>
                                    <button
                                      aria-label={`Tăng số lượng ${item.product.name}`}
                                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-moss-700 text-white shadow-sm transition hover:bg-moss-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-60 sm:h-10 sm:w-10"
                                      disabled={quantityInProduct >= item.product.stock}
                                      onClick={() => changeQuantity(item.lineId, item.quantity + 1)}
                                      type="button"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-lg font-extrabold text-slate-900">
                                    Số lượng: {item.quantity}
                                  </span>
                                )}

                                <div className="min-w-0 self-center text-right sm:col-start-4">
                                  <p className="text-xs font-bold text-slate-400 sm:hidden">
                                    Thành tiền
                                  </p>
                                  <p className="truncate text-xs font-extrabold tabular-nums text-slate-900 min-[360px]:text-sm sm:text-lg">
                                    {formatCurrency(item.product.price * item.quantity)}
                                  </p>
                                </div>
                              </div>

                              {canCheckout ? (
                                <button
                                  aria-label={`Xóa ${item.product.name}`}
                                  className="col-start-3 row-start-1 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-500 sm:col-start-5 sm:row-start-auto"
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
                  </div>
                ) : null}
              </section>

              <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <input
                  aria-label="Ghi chú đơn hàng"
                  className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
                  onChange={(event) => updateActiveBillField("orderNote", event.target.value)}
                  placeholder="Nhập ghi chú đơn hàng"
                  value={orderNote}
                />
                {canCheckout ? (
                  <button
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-base font-extrabold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={cart.length === 0 && !selectedCustomerId && !orderNote.trim()}
                    onClick={handleSaveBill}
                    type="button"
                  >
                    <Save className="h-5 w-5" />
                    Lưu đơn
                  </button>
                ) : null}
              </div>
            </div>

            <aside className="order-first min-w-0 space-y-3 xl:order-none xl:sticky xl:top-[4.75rem] xl:flex xl:max-h-[calc(100dvh-5.25rem)] xl:flex-col xl:self-start xl:overflow-hidden">
              <section className="min-h-0 rounded-2xl bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80 sm:p-4 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">Khách hàng</h2>
                    <p className="mt-0.5 text-xs font-bold text-slate-500">
                      Không bắt buộc cho đơn bán lẻ
                    </p>
                  </div>
                  {!selectedCustomer ? (
                    <span className="hidden sm:block">
                      <ShortcutTag>F2</ShortcutTag>
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      aria-label="Tìm khách hàng"
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-base font-medium text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
                      onChange={(event) => {
                        updateActiveBill((bill) => ({
                          ...bill,
                          customerQuery: event.target.value,
                          savedAt: null,
                          selectedCustomerId: "",
                        }));
                      }}
                      placeholder="Tìm kiếm khách hàng"
                      ref={customerSearchRef}
                      value={customerQuery}
                    />
                    {selectedCustomer ? (
                      <button
                        aria-label="Bỏ chọn khách hàng"
                        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        onClick={clearSelectedCustomer}
                        type="button"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    ) : (
                      <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                      />
                    )}
                  </div>
                  {canCreateQuickCustomer ? (
                    <button
                      aria-label="Thêm khách hàng"
                      className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                      onClick={() => setCustomerModalOpen(true)}
                      type="button"
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  ) : null}
                </div>

                {selectedCustomer ? (
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm">
                    <span className="font-bold text-amber-800">Điểm tích lũy hiện có</span>
                    <span className="font-extrabold tabular-nums text-amber-900">
                      {(selectedCustomer.points ?? 0).toLocaleString("vi-VN")} điểm
                    </span>
                  </div>
                ) : null}

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
                          <span className="mt-0.5 flex w-full items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                            <span className="truncate">
                              {customer.phone || "Chưa có số điện thoại"}
                            </span>
                            <span className="shrink-0 font-extrabold text-amber-700">
                              {(customer.points ?? 0).toLocaleString("vi-VN")} điểm
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 hidden gap-3 border-t border-slate-100 pt-4 xl:grid">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">
                      Tạm tính ({totalItems} sản phẩm)
                    </span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-sm font-extrabold text-moss-700">
                      Giảm giá
                    </span>
                    {canApplyDiscount ? (
                      <label className="relative min-w-0 max-w-40 flex-1">
                        <input
                          aria-label="Số tiền giảm giá"
                          className="h-10 w-full rounded-xl border border-moss-200 bg-white px-3 pr-8 text-right text-sm font-extrabold tabular-nums text-moss-700 outline-none transition focus:border-moss-400 focus:ring-4 focus:ring-moss-100"
                          inputMode="numeric"
                          onChange={(event) =>
                            updateActiveBillField(
                              "discount",
                              normalizeIntegerInput(event.target.value)
                            )
                          }
                          ref={discountRef}
                          type="text"
                          value={formatIntegerInput(discount)}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          đ
                        </span>
                      </label>
                    ) : (
                      <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                        {formatCurrency(safeDiscount)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">Thành tiền</span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">Khách đưa</span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(paidAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-extrabold text-slate-600">Tiền thừa</span>
                    <span className="min-w-[10ch] text-right text-base font-extrabold tabular-nums text-slate-900">
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>

                  <div className="mt-1 rounded-2xl border border-moss-200 bg-moss-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-lg font-extrabold text-moss-800">Cần thu</span>
                      <span className="min-w-[10ch] text-right text-2xl font-extrabold tabular-nums text-moss-800">
                        {formatCurrency(total)}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="hidden rounded-2xl bg-white p-3 shadow-[0_10px_28px_rgba(57,67,46,0.08)] ring-1 ring-moss-100 xl:block xl:flex-none">
                {canCheckout ? (
                  <button
                    className="hidden h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(5,150,105,0.24)] transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 xl:flex"
                    disabled={cart.length === 0 || submittingSale}
                    onClick={openPaymentModal}
                    type="button"
                  >
                    {submittingSale ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />}
                    Thanh toán
                  </button>
                ) : null}
              </section>
            </aside>
          </div>
          )}
        </div>
      </main>

      {hasActiveBill ? (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-moss-100 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_36px_rgba(57,67,46,0.16)] backdrop-blur-xl lg:left-72 xl:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Đơn {activeBill.id} · {totalItems} sản phẩm
            </p>
            <p className="truncate text-xl font-extrabold tabular-nums text-moss-800 sm:text-2xl">
              {formatCurrency(total)}
            </p>
          </div>
          {canCheckout ? (
            <button
              className="flex h-14 min-w-[8.5rem] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-extrabold text-white shadow-[0_12px_26px_rgba(5,150,105,0.25)] transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-40"
              disabled={cart.length === 0 || submittingSale}
              onClick={openPaymentModal}
              type="button"
            >
              {submittingSale ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Wallet className="h-5 w-5" />
              )}
              Thanh toán
            </button>
          ) : null}
        </div>
      </div>
      ) : null}

      {canCreateQuickCustomer ? (
        <Modal
          footer={
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button
                onClick={() => setCustomerModalOpen(false)}
                type="button"
                variant="secondary"
              >
                Hủy
              </Button>
              <Button form={quickCustomerFormId} isLoading={submittingCustomer} type="submit">
                Lưu khách hàng
              </Button>
            </div>
          }
          onClose={() => setCustomerModalOpen(false)}
          open={customerModalOpen}
          size="md"
          title="Thêm khách hàng nhanh"
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
        bodyClassName="px-4 py-3 sm:px-8 sm:py-7"
        contentClassName="!h-auto max-h-[calc(100dvh-1rem)] sm:max-h-[86vh]"
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={submittingSale}
              onClick={() => setPaymentModalOpen(false)}
              type="button"
              variant="secondary"
            >
              Hủy
            </Button>
            <Button
              className="bg-coal hover:bg-coal/90"
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
              Xác nhận
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
        title={`Thanh toán đơn ${activeBill.id}`}
      >
        <div className="space-y-3 sm:space-y-6">
          <div className="rounded-xl bg-slate-50 px-4 py-3 sm:rounded-2xl sm:p-5">
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              <span className="text-sm font-extrabold text-slate-600 sm:text-lg">Cần thu</span>
              <span className="break-words text-right text-2xl font-black tabular-nums text-slate-950 sm:text-3xl">
                {formatCurrency(total)}
              </span>
            </div>
            {safeDiscount > 0 ? (
              <p className="mt-2 text-sm font-bold text-moss-700 sm:text-right">
                Đã giảm {formatCurrency(safeDiscount)}
              </p>
            ) : null}
          </div>

          {canApplyDiscount ? (
            <label className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-3 xl:hidden">
              <span className="shrink-0 text-sm font-extrabold text-slate-700">Giảm giá</span>
              <span className="relative w-36">
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pr-8 text-right text-base font-extrabold text-moss-700 outline-none focus:border-moss-400 focus:ring-4 focus:ring-moss-100 sm:h-11"
                  inputMode="numeric"
                  onChange={(event) =>
                    updateActiveBillField("discount", normalizeIntegerInput(event.target.value))
                  }
                  type="text"
                  value={formatIntegerInput(discount)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  đ
                </span>
              </span>
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {(["cash", "transfer"] as PaymentMethod[]).map((method) => {
              const active = selectedPaymentMethod === method;
              return (
                <button
                  className={`flex min-h-16 min-w-0 items-center justify-center gap-2 rounded-xl border-2 px-2 py-2.5 text-left transition sm:min-h-20 sm:justify-start sm:gap-4 sm:rounded-2xl sm:px-5 sm:py-3 ${
                    active
                      ? "border-moss-500 bg-moss-50 text-moss-800 shadow-[inset_0_0_0_1px_rgba(105,122,77,0.12)]"
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
                    <DollarSign className="h-5 w-5 flex-none sm:h-7 sm:w-7" />
                  ) : (
                    <QrCode className="h-5 w-5 flex-none sm:h-7 sm:w-7" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold sm:text-xl">
                      {method === "cash" ? "Tiền mặt" : "Chuyển khoản"}
                    </span>
                    <span className="mt-1 hidden text-xs font-bold opacity-70 sm:block sm:text-sm">
                      {method === "cash" ? "Nhập tiền khách đưa" : "Cần ảnh xác nhận"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedPaymentMethod === "cash" ? (
            <div className="space-y-3 sm:space-y-4">
              <div className="relative">
                <label
                  className="mb-1.5 block text-sm font-extrabold text-slate-700"
                  htmlFor="payment-cash-received"
                >
                  Tiền khách đưa
                </label>
                <input
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 pr-16 text-xl font-extrabold text-slate-900 outline-none transition placeholder:text-base placeholder:font-medium placeholder:text-slate-400 focus:border-moss-300 focus:ring-4 focus:ring-moss-100 sm:h-[66px] sm:px-5"
                  id="payment-cash-received"
                  inputMode="numeric"
                  onChange={(event) =>
                    updateActiveBillField(
                      "cashReceived",
                      normalizeIntegerInput(event.target.value)
                    )
                  }
                  placeholder="Nhập số tiền khách đưa"
                  ref={paidAmountRef}
                  type="text"
                  value={formatIntegerInput(cashReceived)}
                />
                <span className="absolute right-4 top-[calc(50%+13px)] hidden -translate-y-1/2 sm:block">
                  <ShortcutTag>F4</ShortcutTag>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                <button
                  className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200 sm:px-4 sm:py-2"
                  disabled={cart.length === 0}
                  onClick={() => updateActiveBillField("cashReceived", String(total))}
                  type="button"
                >
                  Nhận đủ
                </button>
                <button
                  className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-extrabold text-slate-700 transition hover:bg-slate-200 sm:px-4 sm:py-2"
                  disabled={cart.length === 0}
                  onClick={() =>
                    updateActiveBillField(
                      "cashReceived",
                      String(Math.ceil(total / 100000) * 100000)
                    )
                  }
                  type="button"
                >
                  Làm tròn tiền đưa
                </button>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-200 rounded-xl bg-slate-50 px-3 py-3 sm:rounded-2xl sm:px-4 sm:py-4">
                <div className="pr-3">
                  <p className="text-xs font-bold text-slate-500 sm:text-sm">Khách đưa</p>
                  <p className="mt-1 truncate text-lg font-extrabold tabular-nums text-slate-900 sm:text-2xl">
                    {formatCurrency(paidAmount)}
                  </p>
                </div>
                <div className="pl-3">
                  <p className="text-xs font-bold text-slate-500 sm:text-sm">Tiền thừa</p>
                  <p className="mt-1 truncate text-lg font-extrabold tabular-nums text-moss-700 sm:text-2xl">
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
                    Mã nhận tiền
                  </span>
                  <span className="mt-1 block text-sm font-bold text-slate-500">
                    {paymentSettings?.transfer_qr_url ? "Bấm để hiện mã QR" : "Chưa cài đặt mã QR"}
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
                    Xác nhận thanh toán
                  </span>
                  <span className="mt-1 block truncate text-sm font-bold text-slate-600">
                    {paymentProofFile
                      ? `Đã có ảnh: ${paymentProofFile.name}`
                      : paymentProofNote.trim()
                        ? "Đã xác nhận thủ công"
                        : canUploadPaymentProof
                          ? "Chụp ảnh hoặc nhập mã giao dịch"
                          : "Nhập mã giao dịch/ghi chú"}
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
        </Modal>
      ) : null}
      <Modal
        contentClassName="!h-auto"
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={printingCompletedSale}
              onClick={() => setCompletedSale(null)}
              type="button"
              variant="secondary"
            >
              Đóng
            </Button>
            <Button
              isLoading={printingCompletedSale}
              onClick={() => void handlePrintCompletedSale()}
              type="button"
            >
              <Printer className="h-4 w-4" />
              In hóa đơn
            </Button>
          </div>
        }
        onClose={() => {
          if (!printingCompletedSale) {
            setCompletedSale(null);
          }
        }}
        open={Boolean(completedSale)}
        size="sm"
        title="Tạo hóa đơn thành công"
      >
        {completedSale ? (
          <div className="text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss-100 text-moss-700">
              <Check className="h-8 w-8" />
            </span>
            <p className="mt-4 text-sm font-bold text-slate-500">Mã hóa đơn</p>
            <p className="mt-1 text-lg font-black text-slate-950">{completedSale.order.code}</p>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-sm font-bold text-slate-500">Tổng thanh toán</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">
                {formatCurrency(completedSale.order.total)}
              </p>
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Bạn có thể in ngay hoặc đóng để tiếp tục bán hàng.
            </p>
          </div>
        ) : null}
      </Modal>
      <Modal
        footer={
          <Button onClick={() => setPaymentQrModalOpen(false)} type="button" variant="secondary">
            Đóng
          </Button>
        }
        onClose={() => setPaymentQrModalOpen(false)}
        open={paymentQrModalOpen}
        size="md"
        title="Mã nhận tiền"
      >
        {paymentSettings?.transfer_qr_url ? (
          <div className="space-y-4">
            <img
              alt="Mã nhận tiền"
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
            <p className="mt-3 text-base font-extrabold">Chưa cài đặt mã nhận tiền.</p>
          </div>
        )}
      </Modal>
      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setPaymentProofModalOpen(false)} type="button" variant="secondary">
              Hủy
            </Button>
            <Button
              className="bg-coal hover:bg-coal/90"
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
        title="Chụp thanh toán"
      >
        <div className="space-y-4">
          {canUploadPaymentProof ? (
            <>
              <label className="flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center transition hover:bg-slate-50">
                {paymentProofPreview ? (
                  <img
                    alt="Ảnh thanh toán"
                    className="max-h-[56vh] w-full rounded-xl object-contain"
                    src={paymentProofPreview}
                  />
                ) : (
                  <>
                    <ImagePlus className="h-14 w-14 text-slate-400" />
                    <span className="mt-3 text-xl font-extrabold text-slate-800">
                      Chọn hoặc chụp ảnh
                    </span>
                    <span className="mt-1 text-sm font-bold text-slate-500">
                      Ảnh biên lai chuyển khoản của khách
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
                  Đã chọn ảnh: {paymentProofFile.name}
                </p>
              ) : (
                <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-extrabold text-amber-700">
                  Máy tính không có camera có thể nhập mã giao dịch hoặc ghi chú xác nhận bên dưới.
                </p>
              )}
            </>
          ) : null}
          <Textarea
            label="Xác nhận thủ công trên máy tính"
            onChange={(event) => setPaymentProofNote(event.target.value)}
            placeholder="Nhập mã giao dịch, tên người kiểm tra hoặc ghi chú đã đối soát..."
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
            Đóng
          </Button>
        }
        onClose={() => {
          setBatchModalOpen(false);
          setProductToBatchSelect(null);
        }}
        open={batchModalOpen}
        size="lg"
        title="Chọn lô nhập kho"
      >
        {productToBatchSelect ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-500">Sản phẩm</p>
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
                    onClick={() =>
                      addToCart(
                        productToBatchSelect,
                        batch,
                        focusSearchAfterBatchRef.current
                      )
                    }
                    type="button"
                  >
                    <div>
                      <p className="text-lg font-extrabold text-slate-900">
                        Ngày nhập {formatProductDate(batch.import_date)}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        Hạn sử dụng {formatProductDate(batch.expiry_date)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-extrabold uppercase text-slate-400">Còn lại</p>
                      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">
                        {batch.quantity - selectedQuantity}
                      </p>
                    </div>
                    <span className="rounded-xl bg-coal px-4 py-3 text-center text-sm font-extrabold text-white">
                      Chọn lô
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
          description="Quét EAN-13 để thêm nhanh sản phẩm vào hóa đơn hiện tại."
          onClose={() => setEan13ScannerOpen(false)}
          onDetected={handleEan13Detected}
          open={ean13ScannerOpen}
          title="Quét EAN-13 bán hàng"
        />
      ) : null}
      <ErrorNoticeModal notice={errorNotice} onClose={clearErrorNotice} />
    </div>
  );
}
