import { AlertTriangle, Barcode, Boxes, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CloudinaryImageField } from "../../../components/media/CloudinaryImageField";
import { Ean13PickerModal } from "../../../components/products/Ean13PickerModal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { formatIntegerInput, normalizeIntegerInput } from "../../../lib/format";
import type { VariantAttribute, VariantDraft } from "../types";
import { countVariantCombinations, getVariantLabel } from "../utils/variants";

type Props = {
  attributes: VariantAttribute[];
  variants: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  onGenerate: () => void;
  onAddManual: () => void;
  fallbackImageUrl?: string | null;
  usedEan13Codes?: string[];
};
const pageSize = 50;
function SellSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        aria-label="Cho phép bán"
        checked={checked}
        className="peer sr-only"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-moss-700 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-moss-300 peer-focus-visible:ring-offset-2" />
    </label>
  );
}
export function SkuMatrix({
  attributes,
  fallbackImageUrl,
  onAddManual,
  onChange,
  onGenerate,
  usedEan13Codes = [],
  variants,
}: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [eanTarget, setEanTarget] = useState<VariantDraft | null>(null);
  const [mobileIndex, setMobileIndex] = useState<number | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<"base_price" | "stock_quantity" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const expectedCount = attributes.length
    ? countVariantCombinations(attributes)
    : 0;
  const mobileVariant = mobileIndex == null ? null : variants[mobileIndex];
  const filtered = useMemo(
    () =>
      variants.filter((variant) =>
        `${variant.sku} ${getVariantLabel(variant as never, attributes)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [attributes, query, variants],
  );
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => {
    if (page * pageSize >= filtered.length && page > 0) setPage(0);
  }, [filtered.length, page]);
  function patch(index: number, value: Partial<VariantDraft>) {
    const target = rows[index];
    onChange(
      variants.map((variant) =>
        variant === target ? { ...variant, ...value } : variant,
      ),
    );
  }
  function patchMobile(value: Partial<VariantDraft>) {
    if (mobileIndex == null) return;
    onChange(
      variants.map((variant, index) =>
        index === mobileIndex ? { ...variant, ...value } : variant,
      ),
    );
  }
  function applyBulkNumber() {
    if (!bulkTarget) return;
    const value = Math.max(Number(normalizeIntegerInput(bulkValue)) || 0, 0);
    onChange(
      variants.map((variant) =>
        bulkTarget === "stock_quantity"
          ? {
              ...variant,
              stock_quantity: value as number,
              shelf_quantity: value as number,
            }
          : { ...variant, base_price: value },
      ),
    );
    setBulkTarget(null);
    setBulkValue("");
  }
  function setAllActive(is_active: boolean) {
    onChange(variants.map((variant) => ({ ...variant, is_active })));
    setActionsOpen(false);
  }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-black text-slate-950">Tổ hợp sản phẩm</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {variants.length} đã tạo · {expectedCount.toLocaleString("vi-VN")} dự kiến
            </p>
          </div>
          {variants.length ? (
            <Button
              aria-label="Thao tác hàng loạt"
              className="h-10 min-h-10 shrink-0 px-3"
              onClick={() => setActionsOpen(true)}
              variant="secondary"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Hàng loạt</span>
            </Button>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              disabled={expectedCount === 0}
              onClick={onGenerate}
            >
              {expectedCount
                ? `${variants.length ? "Đồng bộ" : "Tạo"} ${expectedCount.toLocaleString("vi-VN")} tổ hợp`
                : "Thêm giá trị để tạo SKU"}
            </Button>
            {expectedCount ? (
              <Button onClick={onAddManual} variant="secondary">
                + Tạo thủ công
              </Button>
            ) : null}
        </div>
      </div>
      {variants.length > 150 ? (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            Ma trận lớn ({variants.length} SKU). Danh sách được phân trang{" "}
            {pageSize} dòng để giữ giao diện mượt.
          </span>
        </div>
      ) : null}
      <label className={variants.length ? "relative block" : "hidden"}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Tìm SKU hoặc giá trị biến thể..."
          value={query}
        />
      </label>
      <div
        className={
          variants.length
            ? "hidden max-h-[55vh] overflow-auto rounded-xl border md:block"
            : "hidden"
        }
      >
        <table className="min-w-[950px] w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left shadow-sm">
            <tr>
              <th className="p-3">Biến thể</th>
              <th>SKU</th>
              <th>Barcode / EAN-13</th>
              <th>Giá</th>
              <th>Giá so sánh</th>
              <th>Tồn</th>
              <th>Ảnh Cloudinary</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((variant, index) => (
              <tr
                className="border-t"
                key={variant.id ?? `${variant.sku}-${index}`}
              >
                <td className="p-3 font-bold">
                  {getVariantLabel(variant as never, attributes)}
                </td>
                <td>
                  <input
                    className="w-36 rounded border p-2"
                    onChange={(event) =>
                      patch(index, { sku: event.target.value })
                    }
                    value={variant.sku}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <input
                      className="w-32 rounded border p-2"
                      inputMode="numeric"
                      maxLength={13}
                      onChange={(event) =>
                        patch(index, {
                          barcode:
                            event.target.value.replace(/\D/g, "") || null,
                        })
                      }
                      value={variant.barcode ?? ""}
                    />
                    <button
                      aria-label="Chọn EAN-13"
                      className="grid h-9 w-9 place-items-center rounded-lg bg-moss-50 text-moss-700"
                      onClick={() => setEanTarget(variant)}
                      type="button"
                    >
                      <Barcode className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td>
                  <input
                    className="w-28 rounded border p-2"
                    inputMode="numeric"
                    onChange={(event) =>
                      patch(index, {
                        base_price:
                          Number(normalizeIntegerInput(event.target.value)) ||
                          0,
                      })
                    }
                    value={formatIntegerInput(variant.base_price)}
                  />
                </td>
                <td>
                  <input
                    className="w-28 rounded border p-2"
                    inputMode="numeric"
                    onChange={(event) =>
                      patch(index, {
                        compare_at_price: normalizeIntegerInput(
                          event.target.value,
                        )
                          ? Number(normalizeIntegerInput(event.target.value))
                          : null,
                      })
                    }
                    value={formatIntegerInput(variant.compare_at_price ?? "")}
                  />
                </td>
                <td>
                  <input
                    className="w-20 rounded border p-2"
                    inputMode="numeric"
                    onChange={(event) =>
                      patch(index, {
                        stock_quantity:
                          Number(normalizeIntegerInput(event.target.value)) ||
                          0,
                        shelf_quantity:
                          Number(normalizeIntegerInput(event.target.value)) || 0,
                      })
                    }
                    value={formatIntegerInput(variant.stock_quantity)}
                  />
                </td>
                <td>
                  <CloudinaryImageField
                    compact
                    imageUrl={variant.image_url}
                    label={`Ảnh ${variant.sku}`}
                    onChange={(selected) =>
                      patch(index, {
                        image_url: selected.imageUrl || null,
                        cloudinary_public_id: selected.publicId,
                      })
                    }
                    publicId={variant.cloudinary_public_id}
                  />
                </td>
                <td>
                  <SellSwitch
                    checked={variant.is_active}
                    onChange={(checked) => patch(index, { is_active: checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={variants.length ? "space-y-3 md:hidden" : "hidden"}>
        {rows.map((variant, index) => (
          <button
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:bg-slate-50"
            key={variant.id ?? `${variant.sku}-${index}`}
            onClick={() => setMobileIndex(variants.indexOf(variant))}
            type="button"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-moss-50 text-moss-700 ring-1 ring-slate-100">
              {variant.image_url || fallbackImageUrl ? (
                <img
                  alt={getVariantLabel(variant as never, attributes)}
                  className="h-full w-full object-cover"
                  src={variant.image_url ?? fallbackImageUrl ?? ""}
                />
              ) : (
                <Boxes className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">
                {getVariantLabel(variant as never, attributes)}
              </p>
              <p className="truncate text-xs text-slate-500">
                {variant.sku || "Chưa có SKU"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-black">
                {formatIntegerInput(variant.base_price)} đ
              </p>
              <p
                className={`mt-0.5 text-[11px] font-extrabold tabular-nums ${variant.stock_quantity > 0 ? "text-moss-700" : "text-red-600"}`}
              >
                Tồn: {formatIntegerInput(variant.stock_quantity)}
              </p>
              <span
                className={`block text-[11px] font-bold ${variant.is_active ? "text-emerald-700" : "text-slate-400"}`}
              >
                {variant.is_active ? "Đang bán" : "Đã tắt"}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        ))}
      </div>
      {!rows.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500">
          {expectedCount
            ? `Đã sẵn sàng ${expectedCount.toLocaleString("vi-VN")} tổ hợp. Nhấn nút tạo ở phía trên để tiếp tục.`
            : "Thêm giá trị cho từng biến thể trước khi tạo SKU."}
        </div>
      ) : null}
      <div
        className={
          filtered.length > pageSize
            ? "flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            : "hidden"
        }
      >
        <span>
          {filtered.length} SKU · tối đa {pageSize} dòng/trang
        </span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
            variant="secondary"
          >
            Trước
          </Button>
          <Button
            disabled={(page + 1) * pageSize >= filtered.length}
            onClick={() => setPage((value) => value + 1)}
            variant="secondary"
          >
            Sau
          </Button>
        </div>
      </div>
      <Modal
        footer={<Button className="w-full" onClick={() => setActionsOpen(false)} variant="secondary">Đóng</Button>}
        onClose={() => setActionsOpen(false)}
        open={actionsOpen}
        size="sm"
        title="Thao tác hàng loạt"
        zIndex={115}
      >
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => { setActionsOpen(false); setBulkTarget("base_price"); }} variant="secondary">Đặt giá bán</Button>
          <Button onClick={() => { setActionsOpen(false); setBulkTarget("stock_quantity"); }} variant="secondary">Đặt tồn kho</Button>
          <Button onClick={() => setAllActive(true)} variant="secondary">Bật tất cả</Button>
          <Button onClick={() => setAllActive(false)} variant="secondary">Tắt tất cả</Button>
        </div>
      </Modal>
      <Modal
        footer={<div className="grid w-full grid-cols-2 gap-2"><Button onClick={() => setBulkTarget(null)} variant="secondary">Hủy</Button><Button onClick={applyBulkNumber}>Áp dụng</Button></div>}
        onClose={() => setBulkTarget(null)}
        open={Boolean(bulkTarget)}
        size="sm"
        title={bulkTarget === "base_price" ? "Đặt giá cho tất cả SKU" : "Đặt tồn kho cho tất cả SKU"}
        zIndex={116}
      >
        <Input
          autoFocus
          inputMode="numeric"
          label={bulkTarget === "base_price" ? "Giá bán" : "Số lượng tồn"}
          onChange={(event) => setBulkValue(normalizeIntegerInput(event.target.value))}
          placeholder="0"
          value={formatIntegerInput(bulkValue)}
        />
      </Modal>
      <Modal
        footer={
          <Button className="w-full" onClick={() => setMobileIndex(null)}>
            Xong
          </Button>
        }
        onClose={() => setMobileIndex(null)}
        open={Boolean(mobileVariant)}
        size="md"
        title={
          mobileVariant
            ? getVariantLabel(mobileVariant as never, attributes)
            : "Chỉnh sửa SKU"
        }
        zIndex={110}
      >
        {mobileVariant ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <CloudinaryImageField
                appearance="row"
                imageUrl={mobileVariant.image_url}
                label="Hình ảnh"
                onChange={(selected) =>
                  patchMobile({
                    image_url: selected.imageUrl || null,
                    cloudinary_public_id: selected.publicId,
                  })
                }
                publicId={mobileVariant.cloudinary_public_id}
              />
            </div>
            <div className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-3 text-sm font-bold sm:col-span-2">
              <div>
                <span className="block">Cho phép bán</span>
                <small className="font-medium text-slate-500">Tắt để ẩn SKU khỏi POS</small>
              </div>
              <SellSwitch
                checked={mobileVariant.is_active}
                onChange={(checked) => patchMobile({ is_active: checked })}
              />
            </div>
            <Input
              label="SKU"
              onChange={(event) => patchMobile({ sku: event.target.value })}
              value={mobileVariant.sku}
            />
            <div>
              <span className="mb-2 block text-sm font-bold">EAN-13</span>
              <button
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 px-3 text-sm font-semibold"
                onClick={() => {
                  setEanTarget(mobileVariant);
                  setMobileIndex(null);
                }}
                type="button"
              >
                <span>{mobileVariant.barcode ?? "Chọn hoặc quét mã"}</span>
                <Barcode className="h-4 w-4 text-moss-700" />
              </button>
            </div>
            <Input
              inputMode="numeric"
              label="Giá bán"
              onChange={(event) =>
                patchMobile({
                  base_price:
                    Number(normalizeIntegerInput(event.target.value)) || 0,
                })
              }
              value={formatIntegerInput(mobileVariant.base_price)}
            />
            <Input
              inputMode="numeric"
              label="Giá so sánh"
              onChange={(event) =>
                patchMobile({
                  compare_at_price: normalizeIntegerInput(event.target.value)
                    ? Number(normalizeIntegerInput(event.target.value))
                    : null,
                })
              }
              value={formatIntegerInput(mobileVariant.compare_at_price ?? "")}
            />
            <Input
              inputMode="numeric"
              label="Tồn kho"
              onChange={(event) => {
                const stock =
                  Number(normalizeIntegerInput(event.target.value)) || 0;
                patchMobile({
                  stock_quantity: stock,
                  shelf_quantity: stock,
                });
              }}
              value={formatIntegerInput(mobileVariant.stock_quantity)}
            />
          </div>
        ) : null}
      </Modal>
      <Ean13PickerModal
        currentCode={eanTarget?.barcode}
        description="EAN-13 thuộc riêng SKU này. Có thể quét mã trên bao bì hoặc tự tạo mã Việt Nam không trùng với SKU khác."
        onClose={() => setEanTarget(null)}
        onSelect={(code) => {
          if (!eanTarget) return;
          onChange(
            variants.map((variant) =>
              variant === eanTarget ? { ...variant, barcode: code } : variant,
            ),
          );
        }}
        open={Boolean(eanTarget)}
        title={`EAN-13 · ${eanTarget?.sku ?? "SKU"}`}
        usedCodes={[
          ...usedEan13Codes,
          ...variants
            .map((variant) => variant.barcode)
            .filter((code): code is string => Boolean(code)),
        ]}
      />
    </div>
  );
}
