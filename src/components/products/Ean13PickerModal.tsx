import { Barcode, PackagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createVietnamEan13FromSeed,
  isValidEan13,
  normalizeEan13Input,
} from "../../lib/productDisplay";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Ean13ScannerModal } from "./Ean13ScannerModal";

type Props = {
  currentCode?: string | null;
  description?: string;
  onClose: () => void;
  onSelect: (ean13: string) => void;
  open: boolean;
  title?: string;
  usedCodes: string[];
};

export function Ean13PickerModal({
  currentCode,
  description = "Quét mã có sẵn trên bao bì hoặc tự tạo EAN-13 Việt Nam bắt đầu bằng 893.",
  onClose,
  onSelect,
  open,
  title = "Chọn mã EAN-13",
  usedCodes,
}: Props) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setScannerOpen(false);
      setError("");
    }
  }, [open]);

  function accept(value: string) {
    const code = normalizeEan13Input(value);
    if (!isValidEan13(code)) {
      setError("Mã EAN-13 phải có đúng 13 chữ số và đúng số kiểm tra.");
      return;
    }
    if (
      code !== normalizeEan13Input(currentCode ?? "") &&
      usedCodes.some((item) => normalizeEan13Input(item) === code)
    ) {
      setError(`EAN-13 ${code} đã được sử dụng bởi SKU khác.`);
      return;
    }
    onSelect(code);
    setScannerOpen(false);
    onClose();
  }

  function createUniqueCode() {
    const used = new Set(usedCodes.map(normalizeEan13Input));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = createVietnamEan13FromSeed(
        `product-variant:${Date.now()}:${Math.random()}:${attempt}`,
      );
      if (!used.has(code)) {
        accept(code);
        return;
      }
    }
    setError("Không thể tạo EAN-13 duy nhất. Vui lòng thử lại.");
  }

  return (
    <>
      <Modal
        footer={
          <Button onClick={onClose} variant="secondary">
            Hủy
          </Button>
        }
        onClose={onClose}
        open={open}
        size="md"
        title={title}
        zIndex={120}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            {description}
          </div>
          {error ? (
            <div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-moss-300 hover:bg-moss-50"
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-moss-100 text-moss-700">
                <Barcode className="h-5 w-5" />
              </span>
              <span>
                <strong className="block">Quét EAN-13</strong>
                <small className="mt-1 block text-sm font-semibold text-slate-500">
                  Camera, máy quét USB hoặc nhập 13 chữ số.
                </small>
              </span>
            </button>
            <button
              className="flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-moss-300 hover:bg-moss-50"
              onClick={createUniqueCode}
              type="button"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-moss-100 text-moss-700">
                <PackagePlus className="h-5 w-5" />
              </span>
              <span>
                <strong className="block">Tự tạo mã Việt Nam</strong>
                <small className="mt-1 block text-sm font-semibold text-slate-500">
                  Sinh mã hợp lệ với tiền tố quốc gia 893.
                </small>
              </span>
            </button>
          </div>
        </div>
      </Modal>
      <Ean13ScannerModal
        description="Đưa mã EAN-13 vào camera hoặc nhập mã thủ công. Hệ thống sẽ kiểm tra số kiểm tra và trùng lặp."
        onClose={() => setScannerOpen(false)}
        onDetected={accept}
        open={open && scannerOpen}
        title="Quét EAN-13"
      />
    </>
  );
}
