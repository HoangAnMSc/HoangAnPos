import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  BarChart3,
  Boxes,
  Download,
  FileImage,
  PackageCheck,
  Search,
} from "lucide-react";
import { BarcodeScannerModal } from "../components/products/BarcodeScannerModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import {
  findProductByBarcode,
  formatProductDate,
  getProductBarcodeValue,
} from "../lib/productDisplay";
import { fetchProducts } from "../services/products";
import type { Product } from "../types";

type CountMap = Record<string, string>;

type InventoryRow = {
  barcode: string;
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
        barcode: getProductBarcodeValue(product),
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

  return currentY + lineHeight;
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
  context.fillText(new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date()), 44, 94);

  const totalDiff = stats.countedTotal - stats.systemTotal;
  drawSummaryBox(context, "Da kiem", String(stats.auditedCount), 44, 154, 206, "#e0f2fe");
  drawSummaryBox(context, "He thong", String(stats.systemTotal), 272, 154, 206, "#f1f5f9");
  drawSummaryBox(context, "Thuc te", String(stats.countedTotal), 500, 154, 206, "#dcfce7");
  drawSummaryBox(context, "Chenh lech", String(totalDiff), 728, 154, 206, totalDiff < 0 ? "#fee2e2" : "#fef3c7");
  drawSummaryBox(context, "Thieu", String(stats.shortCount), 956, 154, 200, "#fee2e2");

  let y = 286;
  context.fillStyle = "#e2e8f0";
  context.fillRect(44, y, width - 88, 42);
  context.fillStyle = "#334155";
  context.font = "800 16px Arial";
  context.fillText("San pham", 64, y + 27);
  context.fillText("Barcode", 520, y + 27);
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
    context.fillText(row.barcode, 520, y + 45);
    context.fillText(String(row.product.stock), 760, y + 45);
    context.fillText(String(row.counted), 850, y + 45);
    context.fillStyle = row.diff < 0 ? "#dc2626" : row.diff > 0 ? "#d97706" : "#15803d";
    context.fillText(String(row.diff), 940, y + 45);
    context.fillText(getStatusLabel(row), 1030, y + 45);
    y += rowHeight;
  });

  return canvas.toDataURL("image/png");
}

export function InventoryPage() {
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [counts, setCounts] = useState<CountMap>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [reportImage, setReportImage] = useState("");
  const [success, setSuccess] = useState("");

  async function loadProducts() {
    setLoading(true);
    setError("");

    try {
      setProducts(await fetchProducts());
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Khong tai duoc du lieu ton kho."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const rows = useMemo(() => createInventoryRows(products, counts), [counts, products]);
  const stats = useMemo(() => getInventoryStats(rows), [rows]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!normalizedQuery) {
      return products;
    }

    return products.filter((product) =>
      [product.name, product.sku, product.category, getProductBarcodeValue(product)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [normalizedQuery, products]);

  function updateCount(productId: string, value: string) {
    setCounts((current) => ({ ...current, [productId]: value }));
    setReportImage("");
  }

  function clearCounts() {
    setCounts({});
    setReportImage("");
    setSuccess("");
    setError("");
  }

  function handleBarcodeDetected(value: string) {
    const product = findProductByBarcode(products, value);

    if (!product) {
      setError(`Khong tim thay san pham voi barcode ${value}.`);
      setQuery(value);
      return;
    }

    setCounts((current) => {
      const nextValue = parseInventoryCount(current[product.id]) + 1;
      return { ...current, [product.id]: String(nextValue) };
    });
    setQuery(product.name);
    setReportImage("");
    setError("");
    setSuccess(`Da quet ${product.name}. Co the sua lai so luong neu can.`);
  }

  function handleCreateReportImage() {
    if (rows.length === 0) {
      setError("Nhap so luong thuc te cho it nhat mot san pham truoc khi tao anh.");
      setReportImage("");
      return;
    }

    setReportImage(createInventoryReportImage(rows, stats));
    setError("");
    setSuccess("Da tao anh thong ke ton kho.");
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
                <Badge tone="green">{stats.auditedCount} da kiem</Badge>
                {stats.shortCount > 0 ? <Badge tone="red">{stats.shortCount} thieu</Badge> : null}
                {stats.overCount > 0 ? <Badge tone="amber">{stats.overCount} thua</Badge> : null}
              </div>
            </div>
            <div className="grid gap-2 sm:flex">
              <Button onClick={() => setBarcodeScannerOpen(true)} variant="secondary">
                <Barcode className="h-4 w-4" />
                Quet barcode
              </Button>
              <Button onClick={handleCreateReportImage}>
                <FileImage className="h-4 w-4" />
                Tao anh thong ke
              </Button>
            </div>
          </div>

          <div className="relative mt-4 w-full xl:max-w-xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
            <Input
              className="pl-11"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tim theo ten, SKU, barcode, nhom hang..."
              value={query}
            />
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

        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            {loading ? (
              <Spinner label="Dang tai ton kho..." />
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                description="Thu quet barcode hoac tim theo ten/SKU de bat dau kiem kho."
                icon={Boxes}
                title="Chua co san pham phu hop"
              />
            ) : (
              <div className="space-y-3">
                {filteredProducts.map((product) => {
                  const value = counts[product.id] ?? "";
                  const counted = hasInventoryCount(value);
                  const countNumber = parseInventoryCount(value);
                  const diff = counted ? countNumber - product.stock : 0;
                  const status = counted ? getInventoryStatus(diff) : null;

                  return (
                    <article
                      className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_130px_170px] sm:items-center"
                      key={product.id}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-14 w-14 flex-none overflow-hidden rounded-xl bg-slate-100">
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
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-extrabold text-slate-950">
                            {product.name}
                          </h3>
                          <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                            {getProductBarcodeValue(product)} / HSD {formatProductDate(product.expiry_date)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:block">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Ton he thong
                        </p>
                        <p className="mt-1 text-lg font-extrabold text-slate-950">{product.stock}</p>
                      </div>

                      <div className="grid gap-2">
                        <input
                          className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-base font-extrabold text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          min="0"
                          onChange={(event) => updateCount(product.id, event.target.value)}
                          placeholder="So thuc te"
                          type="number"
                          value={value}
                        />
                        {status ? (
                          <Badge className="w-fit" tone={getStatusTone(status)}>
                            {getStatusLabel({
                              barcode: getProductBarcodeValue(product),
                              counted: countNumber,
                              diff,
                              product,
                              status,
                            })}
                          </Badge>
                        ) : (
                          <Badge className="w-fit" tone="neutral">
                            Chua nhap
                          </Badge>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
            <Card className="rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-blue-50 p-3 text-blue-700">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-extrabold text-coal">Thong ke nhanh</h3>
                  <p className="text-xs font-semibold text-coal/55">
                    So sanh so thuc te voi ton he thong.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-500">He thong</p>
                  <p className="mt-1 text-xl font-extrabold text-slate-950">{stats.systemTotal}</p>
                </div>
                <div className="rounded-2xl bg-green-50 p-3">
                  <p className="text-xs font-bold text-green-700">Thuc te</p>
                  <p className="mt-1 text-xl font-extrabold text-green-800">{stats.countedTotal}</p>
                </div>
                <div className="rounded-2xl bg-red-50 p-3">
                  <p className="text-xs font-bold text-red-700">Thieu</p>
                  <p className="mt-1 text-xl font-extrabold text-red-800">{stats.shortCount}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-700">Thua</p>
                  <p className="mt-1 text-xl font-extrabold text-amber-800">{stats.overCount}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1" onClick={clearCounts} variant="secondary">
                  Xoa dem
                </Button>
                <Button className="flex-1" onClick={() => void loadProducts()} variant="secondary">
                  Tai lai
                </Button>
              </div>
            </Card>

            {reportImage ? (
              <Card className="rounded-2xl p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-extrabold text-coal">
                    <PackageCheck className="h-5 w-5" />
                    Anh thong ke
                  </div>
                  <a
                    className="inline-flex items-center gap-1 rounded-xl bg-coal px-3 py-2 text-xs font-extrabold text-white"
                    download={`ton-kho-${Date.now()}.png`}
                    href={reportImage}
                  >
                    <Download className="h-4 w-4" />
                    Tai anh
                  </a>
                </div>
                <img
                  alt="Bao cao ton kho"
                  className="w-full rounded-xl border border-slate-200"
                  src={reportImage}
                />
              </Card>
            ) : (
              <Card className="rounded-2xl p-4 text-sm font-semibold text-coal/60 shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-clay" />
                  <p>Nhap so luong thuc te, roi bam Tao anh thong ke de xuat bao cao dang PNG.</p>
                </div>
              </Card>
            )}
          </aside>
        </div>
      </Card>

      <BarcodeScannerModal
        description="Quet barcode tren tem san pham. Moi lan quet se cong 1 vao so luong thuc te cua san pham."
        onClose={() => setBarcodeScannerOpen(false)}
        onDetected={handleBarcodeDetected}
        open={barcodeScannerOpen}
        title="Quet barcode ton kho"
      />
    </div>
  );
}
