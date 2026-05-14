import { Barcode, Printer } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { formatCurrency } from "../../lib/format";
import {
  createCode128SvgMarkup,
  escapeHtml,
  formatProductDate,
  getProductBarcodeValue,
} from "../../lib/productDisplay";
import type { Product } from "../../types";

type BarcodeLabelsModalProps = {
  onClose: () => void;
  open: boolean;
  products: Product[];
};

function createPrintDocument(products: Product[]) {
  const labels = products
    .map((product) => {
      const barcodeValue = getProductBarcodeValue(product);

      return `
        <section class="label">
          <div class="label-head">
            <div class="name">${escapeHtml(product.name)}</div>
            <div class="price">${escapeHtml(formatCurrency(product.price))}</div>
          </div>
          <div class="barcode">${createCode128SvgMarkup(barcodeValue)}</div>
          <div class="code">${escapeHtml(barcodeValue)}</div>
          <div class="meta">
            <span>Stock: <strong>${product.stock}</strong></span>
            <span>HSD: <strong>${escapeHtml(formatProductDate(product.expiry_date))}</strong></span>
          </div>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Barcode san pham</title>
        <style>
          @page {
            size: A4;
            margin: 8mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .sheet {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4mm;
          }

          .label {
            min-height: 38mm;
            break-inside: avoid;
            border: 1px solid #cbd5e1;
            border-radius: 4mm;
            padding: 3mm;
            background: #fff;
          }

          .label-head {
            display: grid;
            gap: 1mm;
          }

          .name {
            min-height: 9mm;
            overflow: hidden;
            font-size: 10pt;
            font-weight: 800;
            line-height: 1.15;
          }

          .price {
            color: #475569;
            font-size: 8pt;
            font-weight: 700;
          }

          .barcode {
            height: 15mm;
            margin-top: 2mm;
          }

          .barcode svg {
            display: block;
            width: 100%;
            height: 100%;
          }

          .code {
            margin-top: 1mm;
            text-align: center;
            font-family: "Courier New", monospace;
            font-size: 8pt;
            font-weight: 700;
            letter-spacing: 0.08em;
          }

          .meta {
            display: flex;
            justify-content: space-between;
            gap: 2mm;
            margin-top: 2mm;
            color: #475569;
            font-size: 7.5pt;
          }

          .meta strong {
            color: #0f172a;
          }
        </style>
      </head>
      <body>
        <main class="sheet">${labels}</main>
      </body>
    </html>
  `;
}

function printProductBarcodes(products: Product[]) {
  const printWindow = window.open("", "_blank", "width=960,height=720");

  if (!printWindow) {
    window.alert("Trinh duyet dang chan cua so in barcode.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(createPrintDocument(products));
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
}

export function BarcodeLabelsModal({ onClose, open, products }: BarcodeLabelsModalProps) {
  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} variant="secondary">
            Dong
          </Button>
          <Button disabled={products.length === 0} onClick={() => printProductBarcodes(products)}>
            <Printer className="h-4 w-4" />
            In barcode
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="wide"
      title="Barcode san pham"
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          Tao ma Code 128 cho tat ca san pham. May quet ma vach va ung dung camera co ho tro
          barcode co the doc ma nay; POS cung tim duoc theo SKU hoac ma in tren tem.
        </div>

        <div className="grid max-h-[58vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const barcodeValue = getProductBarcodeValue(product);

            return (
              <article
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                key={product.id}
              >
                <div className="min-h-12">
                  <h3 className="line-clamp-2 text-sm font-extrabold leading-tight text-slate-950">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatCurrency(product.price)}
                  </p>
                </div>
                <div
                  className="mt-3 h-16 w-full [&_svg]:h-full [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: createCode128SvgMarkup(barcodeValue) }}
                />
                <p className="mt-1 truncate text-center font-mono text-xs font-bold tracking-wide text-slate-950">
                  {barcodeValue}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Stock: <strong className="text-slate-950">{product.stock}</strong>
                  </span>
                  <span>
                    HSD:{" "}
                    <strong className="text-slate-950">
                      {formatProductDate(product.expiry_date)}
                    </strong>
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        {products.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center">
            <Barcode className="h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-extrabold text-slate-950">Chua co san pham de in.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
