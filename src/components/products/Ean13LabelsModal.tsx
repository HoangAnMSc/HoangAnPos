import { Barcode, CheckSquare, Printer, Search, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Product, ProductStatus } from "../../features/products/types";
import {
  formatVariantValueLabel,
  getActiveProductModeVariants,
} from "../../features/products/utils/variants";
import {
  createEan13SvgMarkup,
  escapeHtml,
  isValidEan13,
  normalizeEan13Input,
} from "../../lib/productDisplay";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

type Ean13LabelsModalProps = {
  onClose: () => void;
  open: boolean;
  products: Product[];
};

type LabelRow = {
  barcode: string;
  id: string;
  productName: string;
  sku: string;
  status: ProductStatus;
  variantName: string;
};

type StatusFilter = "all" | ProductStatus;

const statusFilters: Array<{ label: string; value: StatusFilter }> = [
  { label: "Tất cả", value: "all" },
  { label: "Đang bán", value: "active" },
  { label: "Nháp", value: "draft" },
  { label: "Ẩn", value: "inactive" },
];

function buildLabelRows(products: Product[]) {
  return products.flatMap((product) => {
    const valuesById = new Map(
      product.variant_attributes.flatMap((attribute) =>
        attribute.values.map((value) => [
          value.id,
          formatVariantValueLabel(value.label, attribute.unit),
        ] as const),
      ),
    );

    return getActiveProductModeVariants(product).flatMap((variant): LabelRow[] => {
      const barcode = normalizeEan13Input(variant.barcode);
      if (!isValidEan13(barcode)) return [];
      const variantName = variant.value_ids
        .map((valueId) => valuesById.get(valueId))
        .filter((value): value is string => Boolean(value))
        .join(" / ");
      return [{
        barcode,
        id: variant.id,
        productName: product.name,
        sku: variant.sku,
        status: product.status,
        variantName,
      }];
    });
  });
}

function printLabels(rows: LabelRow[], copies: number) {
  const labels = rows.flatMap((row) =>
    Array.from({ length: copies }, (_, index) => ({ ...row, copy: index })),
  );
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const documentToPrint = frame.contentDocument;
  if (!documentToPrint) {
    frame.remove();
    return;
  }

  documentToPrint.open();
  documentToPrint.write(`<!doctype html><html><head><meta charset="utf-8"><title>Tem EAN-13</title><style>
    @page { margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, sans-serif; }
    .labels { display: grid; grid-template-columns: repeat(auto-fill, minmax(48mm, 1fr)); gap: 3mm; }
    .label { break-inside: avoid; min-height: 29mm; border: 0.25mm solid #d1d5db; border-radius: 2mm; padding: 2mm 2.5mm; text-align: center; overflow: hidden; }
    .name { overflow: hidden; font-size: 9pt; font-weight: 700; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
    .variant { min-height: 10pt; overflow: hidden; color: #4b5563; font-size: 7.5pt; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
    svg { display: block; width: 100%; height: 15mm; margin: 1mm auto 0; }
    .code { font-size: 8pt; letter-spacing: 0.8mm; line-height: 1; }
    .sku { margin-top: 0.7mm; color: #4b5563; font-size: 6.5pt; }
  </style></head><body><main class="labels">${labels.map((row) => `
    <section class="label">
      <div class="name">${escapeHtml(row.productName)}</div>
      <div class="variant">${escapeHtml(row.variantName || "SKU mặc định")}</div>
      ${createEan13SvgMarkup(row.barcode)}
      <div class="code">${escapeHtml(row.barcode)}</div>
      <div class="sku">SKU: ${escapeHtml(row.sku)}</div>
    </section>`).join("")}</main></body></html>`);
  documentToPrint.close();
  window.setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 150);
}

export function Ean13LabelsModal({ onClose, open, products }: Ean13LabelsModalProps) {
  const rows = useMemo(() => buildLabelRows(products), [products]);
  const [query, setQuery] = useState("");
  const [copies, setCopies] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCopies(1);
    setStatusFilter("all");
    setSelectedIds(new Set(rows.map((row) => row.id)));
  }, [open, rows]);

  const statusRows = useMemo(
    () => rows.filter((row) => statusFilter === "all" || row.status === statusFilter),
    [rows, statusFilter],
  );
  const filteredTotalVariants = useMemo(
    () => products.reduce(
      (total, product) =>
        statusFilter === "all" || product.status === statusFilter
          ? total + getActiveProductModeVariants(product).length
          : total,
      0,
    ),
    [products, statusFilter],
  );
  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi");
    if (!keyword) return statusRows;
    return statusRows.filter((row) =>
      `${row.productName} ${row.variantName} ${row.sku} ${row.barcode}`
        .toLocaleLowerCase("vi")
        .includes(keyword),
    );
  }, [query, statusRows]);
  const selectedRows = statusRows.filter((row) => selectedIds.has(row.id));
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      const next = new Set(current);
      filteredRows.forEach((row) => {
        if (allFilteredSelected) next.delete(row.id);
        else next.add(row.id);
      });
      return next;
    });
  }

  return (
    <Modal
      footer={<>
        <Button onClick={onClose} variant="secondary">Đóng</Button>
        <Button disabled={!selectedRows.length} onClick={() => printLabels(selectedRows, copies)}>
          <Printer className="h-4 w-4" />
          In {selectedRows.length * copies} tem
        </Button>
      </>}
      onClose={onClose}
      open={open}
      size="xl"
      title="In tem EAN-13 toàn bộ sản phẩm"
    >
      <div className="space-y-4">
        <section className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 sm:flex sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Có thể in</p>
            <p className="mt-0.5 text-lg font-black text-coal">{statusRows.length} SKU</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Đã chọn</p>
            <p className="mt-0.5 text-lg font-black text-moss-700">{selectedRows.length} SKU</p>
          </div>
          <label className="col-span-2 flex items-center gap-2 sm:w-44">
            <span className="shrink-0 text-sm font-bold">Số tem/SKU</span>
            <input
              className="h-10 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-center font-bold outline-none focus:border-moss-500"
              max={100}
              min={1}
              onChange={(event) => setCopies(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
              type="number"
              value={copies}
            />
          </label>
        </section>

        {filteredTotalVariants > statusRows.length ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
            {filteredTotalVariants - statusRows.length} SKU chưa có EAN-13 hợp lệ nên chưa thể in.
          </div>
        ) : null}

        <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Lọc theo trạng thái sản phẩm">
          {statusFilters.map((filter) => (
            <button
              aria-pressed={statusFilter === filter.value}
              className={`shrink-0 rounded-full px-3 py-2 text-xs font-extrabold transition ${statusFilter === filter.value ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input aria-label="Tìm SKU để in" className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Tìm sản phẩm, SKU hoặc EAN-13..." value={query} />
          </div>
          <Button className="shrink-0" onClick={toggleAllFiltered} variant="secondary">
            {allFilteredSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            <span className="hidden sm:inline">{allFilteredSelected ? "Bỏ chọn" : "Chọn tất cả"}</span>
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          {filteredRows.length ? (
            <div className="max-h-[44vh] divide-y divide-slate-100 overflow-y-auto">
              {filteredRows.map((row) => {
                const selected = selectedIds.has(row.id);
                return (
                  <button
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50 ${selected ? "bg-moss-50/60" : "bg-white"}`}
                    key={row.id}
                    onClick={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (selected) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    })}
                    type="button"
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-moss-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {selected ? <CheckSquare className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold text-coal">{row.productName}</span>
                      <span className="block truncate text-xs text-slate-500">{row.variantName || "SKU mặc định"} · {row.sku}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs font-bold text-slate-600 sm:text-sm">{row.barcode}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center px-5 text-center text-sm text-slate-500">
              Không có SKU phù hợp với tìm kiếm và có EAN-13 hợp lệ.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
