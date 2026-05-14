import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Barcode,
  Boxes,
  Download,
  Edit3,
  FileImage,
  History,
  Search,
  Trash2,
} from "lucide-react";
import { Ean13ScannerModal } from "../components/products/Ean13ScannerModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import {
  findProductByEan13,
  formatProductDate,
  getProductEan13Value,
  isValidEan13,
  normalizeEan13Input,
} from "../lib/productDisplay";
import { fetchProducts } from "../services/products";
import type { Product } from "../types";

type CountMap = Record<string, string>;

type InventoryRow = {
  ean13: string;
  counted: number;
  diff: number;
  product: Product;
  status: "ok" | "short" | "over";
};

type InventoryStats = {
  auditedCount: number;
  countedTotal: number;
  okCount: number;
  overCount: number;
  shortCount: number;
  systemTotal: number;
};

type ReportHistoryItem = {
  createdAt: string;
  id: string;
  image: string;
  rows: Array<{
    ean13: string;
    counted: number;
    diff: number;
    name: string;
    status: InventoryRow["status"];
    stock: number;
  }>;
  staffName?: string;
  stats: InventoryStats;
};

const reportHistoryStorageKey = "hoang-an-pos:inventory-report-history:v1";
const maxReportHistoryItems = 12;

function hasInventoryCount(value?: string) {
  return value !== undefined && value.trim() !== "";
}

function parseInventoryCount(value?: string) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function getInventoryStatus(diff: number): InventoryRow["status"] {
  if (diff < 0) {
    return "short";
  }

  if (diff > 0) {
    return "over";
  }

  return "ok";
}

function getStatusLabel(row: InventoryRow) {
  if (row.status === "short") {
    return `Thieu ${Math.abs(row.diff)}`;
  }

  if (row.status === "over") {
    return `Thua ${row.diff}`;
  }

  return "Du";
}

function getStatusTone(status: InventoryRow["status"]): "green" | "amber" | "red" {
  if (status === "short") {
    return "red";
  }

  if (status === "over") {
    return "amber";
  }

  return "green";
}

function createInventoryRows(products: Product[], counts: CountMap) {
  return products
    .filter((product) => hasInventoryCount(counts[product.id]))
    .map((product): InventoryRow => {
      const counted = parseInventoryCount(counts[product.id]);
      const diff = counted - product.stock;

      return {
        ean13: getProductEan13Value(product),
        counted,
        diff,
        product,
        status: getInventoryStatus(diff),
      };
    });
}

function getInventoryStats(rows: InventoryRow[]): InventoryStats {
  return rows.reduce(
    (stats, row) => ({
      auditedCount: stats.auditedCount + 1,
      countedTotal: stats.countedTotal + row.counted,
      okCount: stats.okCount + (row.status === "ok" ? 1 : 0),
      overCount: stats.overCount + (row.status === "over" ? 1 : 0),
      shortCount: stats.shortCount + (row.status === "short" ? 1 : 0),
      systemTotal: stats.systemTotal + row.product.stock,
    }),
    {
      auditedCount: 0,
      countedTotal: 0,
      okCount: 0,
      overCount: 0,
      shortCount: 0,
      systemTotal: 0,
    }
  );
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2
) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  let lineCount = 0;

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;

    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
      lineCount += 1;
      return;
    }

    line = nextLine;
  });

  if (line && lineCount < maxLines) {
    context.fillText(line, x, currentY);
  }
}

function drawSummaryBox(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  tone: string
) {
  context.fillStyle = tone;
  context.beginPath();
  context.roundRect(x, y, width, 86, 18);
  context.fill();
  context.fillStyle = "#64748b";
  context.font = "700 18px Arial";
  context.fillText(label, x + 20, y + 32);
  context.fillStyle = "#0f172a";
  context.font = "800 34px Arial";
  context.fillText(value, x + 20, y + 66);
}

function createInventoryReportImage(rows: InventoryRow[], stats: InventoryStats) {
  const scale = 2;
  const width = 1200;
  const rowHeight = 76;
  const height = 340 + rows.length * rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  context.scale(scale, scale);
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#0f172a";
  context.fillRect(0, 0, width, 126);
  context.fillStyle = "#ffffff";
  context.font = "800 44px Arial";
  context.fillText("Bao cao ton kho", 44, 58);
  context.font = "600 20px Arial";
  context.fillText(
    new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date()
    ),
    44,
    94
  );

  const totalDiff = stats.countedTotal - stats.systemTotal;
  drawSummaryBox(context, "Da kiem", String(stats.auditedCount), 44, 154, 206, "#e0f2fe");
  drawSummaryBox(context, "He thong", String(stats.systemTotal), 272, 154, 206, "#f1f5f9");
  drawSummaryBox(context, "Thuc te", String(stats.countedTotal), 500, 154, 206, "#dcfce7");
  drawSummaryBox(
    context,
    "Chenh lech",
    String(totalDiff),
    728,
    154,
    206,
    totalDiff < 0 ? "#fee2e2" : "#fef3c7"
  );
  drawSummaryBox(context, "Thieu", String(stats.shortCount), 956, 154, 200, "#fee2e2");

  let y = 286;
  context.fillStyle = "#e2e8f0";
  context.fillRect(44, y, width - 88, 42);
  context.fillStyle = "#334155";
  context.font = "800 16px Arial";
  context.fillText("San pham", 64, y + 27);
  context.fillText("EAN-13", 520, y + 27);
  context.fillText("Kho", 760, y + 27);
  context.fillText("Dem", 850, y + 27);
  context.fillText("Lech", 940, y + 27);
  context.fillText("Trang thai", 1030, y + 27);
  y += 42;

  rows.forEach((row, index) => {
    context.fillStyle = index % 2 === 0 ? "#ffffff" : "#f8fafc";
    context.fillRect(44, y, width - 88, rowHeight);
    context.fillStyle = "#0f172a";
    context.font = "800 18px Arial";
    drawWrappedText(context, row.product.name, 64, y + 28, 410, 21, 2);
    context.fillStyle = "#64748b";
    context.font = "600 14px Arial";
    context.fillText(`HSD: ${formatProductDate(row.product.expiry_date)}`, 64, y + 64);
    context.fillStyle = "#334155";
    context.font = "700 16px Arial";
    context.fillText(row.ean13, 520, y + 45);
    context.fillText(String(row.product.stock), 760, y + 45);
    context.fillText(String(row.counted), 850, y + 45);
    context.fillStyle = row.diff < 0 ? "#dc2626" : row.diff > 0 ? "#d97706" : "#15803d";
    context.fillText(String(row.diff), 940, y + 45);
    context.fillText(getStatusLabel(row), 1030, y + 45);
    y += rowHeight;
  });

  return canvas.toDataURL("image/png");
}

function loadReportHistory() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(reportHistoryStorageKey);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? (parsed as ReportHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveReportHistory(history: ReportHistoryItem[]) {
  window.localStorage.setItem(reportHistoryStorageKey, JSON.stringify(history));
}

function createReportHistoryItem(
  image: string,
  rows: InventoryRow[],
  staffName: string,
  stats: InventoryStats
) {
  const createdAt = new Date().toISOString();

  return {
    createdAt,
    id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
    image,
    rows: rows.map((row) => ({
      ean13: row.ean13,
      counted: row.counted,
      diff: row.diff,
      name: row.product.name,
      status: row.status,
      stock: row.product.stock,
    })),
    staffName,
    stats,
  };
}

function getReportStatusLabel(stats: InventoryStats) {
  const parts = [];

  if (stats.shortCount > 0) {
    parts.push(`Thieu ${stats.shortCount}`);
  }

  if (stats.overCount > 0) {
    parts.push(`Thua ${stats.overCount}`);
  }

  return parts.length > 0 ? parts.join(" / ") : "Du";
}

function getReportStatusTone(stats: InventoryStats): "green" | "amber" | "red" {
  if (stats.shortCount > 0) {
    return "red";
  }

  if (stats.overCount > 0) {
    return "amber";
  }

  return "green";
}

type QuantityModalProps = {
  countValue: string;
  error: string;
  product: Product | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function QuantityModal({
  countValue,
  error,
  onChange,
  onClose,
  onSubmit,
  product,
}: QuantityModalProps) {
  if (!product) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} variant="secondary">
            Huy
          </Button>
          <Button form="inventory-quantity-form" type="submit">
            Luu san pham
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(product)}
      size="md"
      title="Nhap so luong thuc te"
    >
      <form className="space-y-4" id="inventory-quantity-form" onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-white">
            {product.image_url ? (
              <img
                alt={product.name}
                className="h-full w-full object-contain p-1"
                src={product.image_url}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <Boxes className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-extrabold text-slate-950">{product.name}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              EAN-13 {getProductEan13Value(product)} / Ton he thong {product.stock}
            </p>
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-extrabold text-slate-950">
            So luong thuc te
          </span>
          <input
            autoFocus
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg font-extrabold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            min="0"
            onChange={(event) => onChange(event.target.value)}
            placeholder="Nhap so luong dem duoc"
            type="number"
            value={countValue}
          />
        </label>

        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

export function InventoryPage() {
  const { profile, user } = useAuth();
  const [ean13ScannerOpen, setEan13ScannerOpen] = useState(false);
  const [counts, setCounts] = useState<CountMap>({});
  const [countingProduct, setCountingProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>(() => loadReportHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [quantityDraft, setQuantityDraft] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [viewingReport, setViewingReport] = useState<ReportHistoryItem | null>(null);
  const [success, setSuccess] = useState("");
  const staffName = profile?.full_name || user?.email || "Nhan vien";

  const showErrorNotice = useCallback((message: string, title = "Thong bao loi") => {
    setError(message);
    setErrorNotice({ message, title });
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setProducts(await fetchProducts());
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Khong tai duoc du lieu ton kho.",
        "Khong tai duoc ton kho"
      );
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const rows = useMemo(() => createInventoryRows(products, counts), [counts, products]);
  const stats = useMemo(() => getInventoryStats(rows), [rows]);
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return products
      .filter((product) =>
        [product.name, product.sku, product.category, getProductEan13Value(product)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      )
      .slice(0, 6);
  }, [normalizedQuery, products]);

  function openQuantityModal(product: Product) {
    setCountingProduct(product);
    setQuantityDraft(counts[product.id] ?? "");
    setQuantityError("");
    setError("");
    setSuccess("");
  }

  function closeQuantityModal() {
    setCountingProduct(null);
    setQuantityDraft("");
    setQuantityError("");
  }

  function saveQuantityDraft() {
    if (!countingProduct) {
      return;
    }

    const parsed = Number(quantityDraft);
    if (!quantityDraft.trim() || Number.isNaN(parsed) || parsed < 0) {
      setQuantityError("Nhap so luong khong am.");
      return;
    }

    const nextQuantity = String(Math.floor(parsed));
    setCounts((current) => ({ ...current, [countingProduct.id]: nextQuantity }));
    setSuccess(`Da nhap ${countingProduct.name}. Hay quet san pham tiep theo.`);
    setQuery("");
    closeQuantityModal();
  }

  function removeCount(productId: string) {
    setCounts((current) => {
      const nextCounts = { ...current };
      delete nextCounts[productId];
      return nextCounts;
    });
  }

  function clearCounts() {
    setCounts({});
    setSuccess("");
    setError("");
  }

  function handleEan13Detected(value: string) {
    const ean13Code = normalizeEan13Input(value);
    const product = findProductByEan13(products, ean13Code);

    if (!isValidEan13(ean13Code)) {
      showErrorNotice("Ma quet khong phai EAN-13 hop le.", "EAN-13 khong hop le");
      setQuery(ean13Code);
      return;
    }

    if (!product) {
      showErrorNotice(
        `Chua co san pham trong database voi EAN-13 ${ean13Code}.`,
        "Khong co san pham"
      );
      setQuery(ean13Code);
      return;
    }

    openQuantityModal(product);
  }

  function handleCreateReportImage() {
    if (rows.length === 0) {
      showErrorNotice(
        "Nhap so luong thuc te cho it nhat mot san pham truoc khi tao bao cao.",
        "Chua co du lieu bao cao"
      );
      return;
    }

    const nextReportImage = createInventoryReportImage(rows, stats);
    if (!nextReportImage) {
      showErrorNotice("Khong tao duoc anh bao cao.", "Tao bao cao that bai");
      return;
    }

    const nextHistoryItem = createReportHistoryItem(nextReportImage, rows, staffName, stats);
    const nextHistory = [nextHistoryItem, ...history].slice(0, maxReportHistoryItems);

    try {
      saveReportHistory(nextHistory);
      setHistory(nextHistory);
      setHistoryOpen(true);
      setError("");
      setSuccess("Da tao va luu bao cao ton kho.");
    } catch {
      showErrorNotice(
        "Da tao anh bao cao, nhung khong luu duoc lich su tren trinh duyet nay.",
        "Khong luu duoc lich su"
      );
    }
  }

  function clearHistory() {
    window.localStorage.removeItem(reportHistoryStorageKey);
    setHistory([]);
    setViewingReport(null);
  }

  return (
    <div className="space-y-5">
      <ConfigNotice />

      <Card className="p-0">
        <div className="border-b border-coal/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/45">
                Kiem ke
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-coal">Ton kho</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="neutral">{products.length} mat hang</Badge>
                <Badge tone="green">{rows.length} da nhap</Badge>
                {stats.shortCount > 0 ? <Badge tone="red">{stats.shortCount} thieu</Badge> : null}
                {stats.overCount > 0 ? <Badge tone="amber">{stats.overCount} thua</Badge> : null}
              </div>
            </div>
            <div className="grid gap-2 sm:flex">
              <Button onClick={() => setEan13ScannerOpen(true)} variant="secondary">
                <Barcode className="h-4 w-4" />
                Quet EAN-13
              </Button>
              <Button onClick={() => setHistoryOpen(true)} variant="secondary">
                <History className="h-4 w-4" />
                Lich su
              </Button>
              <Button disabled={rows.length === 0} onClick={handleCreateReportImage}>
                <FileImage className="h-4 w-4" />
                Tao bao cao
              </Button>
            </div>
          </div>

          <div className="relative mt-4 w-full xl:max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tim san pham de nhap tay neu khong quet duoc..."
              value={query}
            />

            {searchResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                <div className="max-h-80 overflow-y-auto p-2">
                  {searchResults.map((product) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                      key={product.id}
                      onClick={() => openQuantityModal(product)}
                      type="button"
                    >
                      <div className="h-11 w-11 flex-none overflow-hidden rounded-xl bg-slate-100">
                        {product.image_url ? (
                          <img
                            alt={product.name}
                            className="h-full w-full object-contain p-1"
                            src={product.image_url}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <Boxes className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-slate-950">
                          {product.name}
                        </span>
                        <span className="block truncate text-xs font-semibold text-slate-500">
                          {getProductEan13Value(product)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="m-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:m-5">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="m-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 sm:m-5">
            {success}
          </div>
        ) : null}

        <div className="p-4">
          <section>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-extrabold text-coal">San pham da nhap</h3>
              <Button disabled={rows.length === 0} onClick={clearCounts} variant="secondary">
                Xoa danh sach
              </Button>
            </div>

            {loading ? (
              <Spinner label="Dang tai ton kho..." />
            ) : rows.length === 0 ? (
              <EmptyState
                description="Bam Quet EAN-13, quet tem san pham, nhap so luong va luu tung san pham vao danh sach."
                icon={Boxes}
                title="Chua nhap san pham nao"
              />
            ) : (
              <div className="space-y-3">
                {rows.map((row) => (
                  <article
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                    key={row.product.id}
                  >
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-slate-100">
                          {row.product.image_url ? (
                            <img
                              alt={row.product.name}
                              className="h-full w-full object-contain p-1"
                              src={row.product.image_url}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <Boxes className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate font-extrabold text-slate-950">
                            {row.product.name}
                          </h4>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                            {row.ean13} / HSD {formatProductDate(row.product.expiry_date)}
                          </p>
                          <Badge className="mt-2 w-fit" tone={getStatusTone(row.status)}>
                            {getStatusLabel(row)}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-slate-50 p-2">
                          <p className="text-[11px] font-bold uppercase text-slate-400">Kho</p>
                          <p className="mt-1 font-extrabold text-slate-950">{row.product.stock}</p>
                        </div>
                        <div className="rounded-xl bg-green-50 p-2">
                          <p className="text-[11px] font-bold uppercase text-green-700">Dem</p>
                          <p className="mt-1 font-extrabold text-green-800">{row.counted}</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-2">
                          <p className="text-[11px] font-bold uppercase text-amber-700">Lech</p>
                          <p className="mt-1 font-extrabold text-amber-800">{row.diff}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <Button
                        className="h-10 px-3"
                        onClick={() => openQuantityModal(row.product)}
                        variant="secondary"
                      >
                        <Edit3 className="h-4 w-4" />
                        Sua
                      </Button>
                      <Button
                        className="h-10 px-3"
                        onClick={() => removeCount(row.product.id)}
                        variant="danger"
                      >
                        <Trash2 className="h-4 w-4" />
                        Xoa
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

        </div>
      </Card>

      <Ean13ScannerModal
        description="Quet EAN-13 tren tem san pham. Sau khi quet, he thong se mo popup de nhap so luong thuc te."
        onClose={() => setEan13ScannerOpen(false)}
        onDetected={handleEan13Detected}
        open={ean13ScannerOpen}
        title="Quet EAN-13 ton kho"
      />

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setHistoryOpen(false)} variant="secondary">
              Dong
            </Button>
            <Button disabled={history.length === 0} onClick={clearHistory} variant="danger">
              Xoa lich su
            </Button>
          </div>
        }
        onClose={() => setHistoryOpen(false)}
        open={historyOpen}
        size="lg"
        title="Lich su bao cao"
      >
        {history.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
            Chua co bao cao nao duoc tao tren may nay.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <button
                className="grid w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50 sm:grid-cols-[minmax(0,1fr)_180px_130px] sm:items-center"
                key={item.id}
                onClick={() => {
                  setHistoryOpen(false);
                  setViewingReport(item);
                }}
                type="button"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Nhan vien
                  </p>
                  <p className="mt-1 truncate font-extrabold text-slate-950">
                    {item.staffName || "Chua co ten"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Ngay gio
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {new Intl.DateTimeFormat("vi-VN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                  </p>
                </div>
                <Badge className="w-fit" tone={getReportStatusTone(item.stats)}>
                  {getReportStatusLabel(item.stats)}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setViewingReport(null)} variant="secondary">
              Dong
            </Button>
            {viewingReport ? (
              <a
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coal px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-lift"
                download={`ton-kho-${viewingReport.createdAt.slice(0, 10)}.png`}
                href={viewingReport.image}
              >
                <Download className="h-4 w-4" />
                Tai anh
              </a>
            ) : null}
          </div>
        }
        onClose={() => setViewingReport(null)}
        open={Boolean(viewingReport)}
        size="xl"
        title="Anh bao cao ton kho"
      >
        {viewingReport ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={getReportStatusTone(viewingReport.stats)}>
                {getReportStatusLabel(viewingReport.stats)}
              </Badge>
              <Badge tone="neutral">{viewingReport.staffName || "Chua co ten"}</Badge>
            </div>
            <img
              alt="Bao cao ton kho"
              className="w-full rounded-2xl border border-slate-200"
              src={viewingReport.image}
            />
          </div>
        ) : null}
      </Modal>

      <QuantityModal
        countValue={quantityDraft}
        error={quantityError}
        onChange={(value) => {
          setQuantityDraft(value);
          setQuantityError("");
        }}
        onClose={closeQuantityModal}
        onSubmit={saveQuantityDraft}
        product={countingProduct}
      />
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
