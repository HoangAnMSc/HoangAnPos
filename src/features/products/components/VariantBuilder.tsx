import { Maximize2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { CloudinaryImageField } from "../../../components/media/CloudinaryImageField";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import type {
  VariantAttribute,
  VariantDisplayType,
  VariantValue,
} from "../types";
import { countVariantCombinations } from "../utils/variants";
import { formatVariantValueLabel } from "../utils/variants";

type Props = {
  attributes: VariantAttribute[];
  onChange: (attributes: VariantAttribute[]) => void;
  onDimensionsChanged: () => void;
};
const displayOptions: Array<{ value: VariantDisplayType; label: string }> = [
  { value: "color_circle", label: "Nút tròn màu" },
  { value: "text_button", label: "Nút chữ" },
  { value: "image", label: "Hình ảnh" },
  { value: "image_text", label: "Hình ảnh + chữ" },
  { value: "image_text_horizontal", label: "Hình ảnh + chữ ngang" },
  { value: "dropdown", label: "Dropdown" },
];
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function VariantBuilder({
  attributes,
  onChange,
  onDimensionsChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [display, setDisplay] = useState<VariantDisplayType>("text_button");
  const [required, setRequired] = useState(true);
  const [values, setValues] = useState<string[]>([""]);
  function save() {
    const cleanValues = values
      .map((value) => value.trim())
      .filter(
        (value, index, rows) =>
          Boolean(value) &&
          rows.findIndex((item) => slug(item) === slug(value)) === index,
      );
    if (!name.trim() || !cleanValues.length) return;
    const id = crypto.randomUUID();
    const nextValues: VariantValue[] = cleanValues.map((label, index) => ({
      id: crypto.randomUUID(),
      variant_attribute_id: id,
      label,
      value: slug(label) || label,
      metadata: {},
      sort_order: index,
      is_active: true,
    }));
    onChange([
      ...attributes,
      {
        id,
        product_id: "",
        source_attribute_id: null,
        name: name.trim(),
        code: code.trim() || slug(name),
        data_type: "option",
        display_type: display,
        is_required: required,
        sort_order: attributes.length,
        values: nextValues,
      },
    ]);
    onDimensionsChanged();
    setOpen(false);
    setName("");
    setCode("");
    setValues([""]);
  }
  function updateAttribute(id: string, patch: Partial<VariantAttribute>) {
    onChange(
      attributes.map((attribute) =>
        attribute.id === id ? { ...attribute, ...patch } : attribute,
      ),
    );
  }
  function updateValue(
    attribute: VariantAttribute,
    valueId: string,
    metadata: VariantValue["metadata"],
  ) {
    updateAttribute(attribute.id, {
      values: attribute.values.map((value) =>
        value.id === valueId ? { ...value, metadata } : value,
      ),
    });
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-moss-100 bg-moss-50 px-3 py-2.5 text-sm">
        <span>
          <strong className="text-moss-800">
            {countVariantCombinations(attributes).toLocaleString("vi-VN")}
          </strong>{" "}
          SKU dự kiến
        </span>
        <span className="text-xs text-slate-500">
          {attributes.length} chiều biến thể
        </span>
      </div>
      {!attributes.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
          <p className="font-extrabold text-slate-700">
            Sản phẩm hiện có một SKU mặc định
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Nếu sản phẩm có màu, size hoặc cấu hình khác nhau, hãy bấm “Thêm
            biến thể”.
          </p>
        </div>
      ) : null}
      {attributes.map((attribute) => (
        <section
          className="rounded-2xl border border-slate-200 bg-white p-3"
          key={attribute.id}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="font-extrabold leading-5">{attribute.name}</h4>
              <p className="text-xs text-slate-500">{attribute.code}</p>
            </div>
            <button
              aria-label="Xóa chiều biến thể"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
              onClick={() => {
                onChange(attributes.filter((item) => item.id !== attribute.id));
                onDimensionsChanged();
              }}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
            <span className="shrink-0 text-xs font-bold text-slate-500">
              Hiển thị
            </span>
            <div className="min-w-0 flex-1">
              <Select
                className="!py-2"
                onChange={(event) =>
                  updateAttribute(attribute.id, {
                    display_type: event.target.value as VariantDisplayType,
                  })
                }
                value={attribute.display_type}
              >
                {displayOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div
            className={
              attribute.display_type === "image_text_horizontal"
                ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,190px))]"
                : attribute.display_type === "image_text" ||
                    attribute.display_type === "image"
                  ? "mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(128px,160px))]"
                : "mt-2 flex flex-wrap gap-2"
            }
          >
            {!attribute.values.length ? (
              <p className="w-full rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                Chưa có giá trị. Thêm ít nhất một lựa chọn để tạo SKU.
              </p>
            ) : null}
            {attribute.values.map((value) => {
              const label = formatVariantValueLabel(value.label, attribute.unit);
              const imageUrl = value.metadata.image_url as string | undefined;
              const removeValue = () => {
                updateAttribute(attribute.id, {
                  values: attribute.values.filter((item) => item.id !== value.id),
                });
                onDimensionsChanged();
              };
              const imageField = (
                <CloudinaryImageField
                  appearance={
                    attribute.display_type === "image_text_horizontal"
                      ? "horizontal-tile"
                      : "tile"
                  }
                  imageUrl={imageUrl}
                  label={label}
                  onChange={(selected) =>
                    updateValue(attribute, value.id, {
                      ...value.metadata,
                      image_url: selected.imageUrl,
                      cloudinary_public_id: selected.publicId ?? undefined,
                    })
                  }
                  onRemove={removeValue}
                  publicId={
                    value.metadata.cloudinary_public_id as string | undefined
                  }
                  showTileLabel={attribute.display_type !== "image"}
                />
              );

              if (
                attribute.display_type === "image" ||
                attribute.display_type === "image_text" ||
                attribute.display_type === "image_text_horizontal"
              ) {
                return (
                  <div className="relative min-w-0 rounded-xl bg-slate-50 p-1.5" key={value.id}>
                    {imageField}
                    {imageUrl && attribute.display_type !== "image_text_horizontal" ? (
                      <button
                        aria-label={`Phóng to ảnh ${value.label}`}
                        className="absolute left-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-900/75 text-white shadow-md backdrop-blur transition hover:bg-slate-900"
                        onClick={() => setPreviewImage({ label, url: imageUrl })}
                        type="button"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                );
              }

              if (attribute.display_type === "color_circle") {
                return (
                  <div className="relative flex w-20 flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2" key={value.id}>
                    <label className="relative cursor-pointer" title={`Đổi màu ${value.label}`}>
                      <span
                        className="block h-10 w-10 rounded-full border-2 border-white shadow ring-1 ring-slate-300"
                        style={{ backgroundColor: value.metadata.hex || "#000000" }}
                      />
                      <input
                        aria-label={`Màu ${value.label}`}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={(event) =>
                          updateValue(attribute, value.id, {
                            ...value.metadata,
                            hex: event.target.value,
                          })
                        }
                        type="color"
                        value={value.metadata.hex || "#000000"}
                      />
                    </label>
                    <span className="w-full truncate text-center text-[11px] font-bold text-slate-700">{label}</span>
                    <button aria-label={`Xóa ${value.label}`} className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-red-50 text-red-600 shadow" onClick={removeValue} type="button">×</button>
                  </div>
                );
              }

              return (
                <div className={`flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold ${attribute.display_type === "dropdown" ? "min-w-44 justify-between" : ""}`} key={value.id}>
                  <span>{label}</span>
                  {attribute.display_type === "dropdown" ? <span className="ml-auto text-slate-400">⌄</span> : null}
                  <button aria-label={`Xóa ${value.label}`} className="ml-auto text-red-600" onClick={removeValue} type="button">×</button>
                </div>
              );
            })}
            <button
              className={`rounded-lg border border-dashed border-moss-400 px-3 py-1.5 text-sm font-bold text-moss-700 ${attribute.display_type === "image_text" || attribute.display_type === "image" ? "min-h-24" : attribute.display_type === "image_text_horizontal" ? "min-h-14" : ""}`}
              onClick={() => {
                const label = window
                  .prompt(`Giá trị mới cho ${attribute.name}`)
                  ?.trim();
                if (!label) return;
                if (
                  attribute.values.some(
                    (value) => value.value === (slug(label) || label),
                  )
                ) {
                  window.alert("Giá trị này đã tồn tại trong biến thể.");
                  return;
                }
                updateAttribute(attribute.id, {
                  values: [
                    ...attribute.values,
                    {
                      id: crypto.randomUUID(),
                      variant_attribute_id: attribute.id,
                      label,
                      value: slug(label) || label,
                      metadata: {},
                      sort_order: attribute.values.length,
                      is_active: true,
                    },
                  ],
                });
                onDimensionsChanged();
              }}
              type="button"
            >
              + Thêm giá trị
            </button>
          </div>
        </section>
      ))}
      <Button
        className="w-full border-dashed sm:w-auto"
        onClick={() => setOpen(true)}
        type="button"
        variant="secondary"
      >
        <Plus className="h-4 w-4" /> Thêm biến thể
      </Button>
      <Modal
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="secondary">
              Hủy
            </Button>
            <Button onClick={save}>Lưu</Button>
          </>
        }
        onClose={() => setOpen(false)}
        open={open}
        title="Thêm chiều biến thể"
        zIndex={110}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Tên biến thể"
            onChange={(event) => {
              setName(event.target.value);
              if (!code) setCode(slug(event.target.value));
            }}
            value={name}
          />
          <Input
            label="Code"
            onChange={(event) => setCode(slug(event.target.value))}
            value={code}
          />
          <Select label="Kiểu dữ liệu" disabled>
            <option>Option</option>
          </Select>
          <Select
            label="Kiểu hiển thị"
            onChange={(event) =>
              setDisplay(event.target.value as VariantDisplayType)
            }
            value={display}
          >
            {displayOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
              type="checkbox"
            />{" "}
            Bắt buộc
          </label>
        </div>
        <div className="mt-5 space-y-2">
          <p className="text-sm font-bold">Danh sách giá trị</p>
          {values.map((value, index) => (
            <Input
              key={index}
              onChange={(event) =>
                setValues((current) =>
                  current.map((item, position) =>
                    position === index ? event.target.value : item,
                  ),
                )
              }
              placeholder={`Giá trị ${index + 1}`}
              value={value}
            />
          ))}
          <Button
            onClick={() => setValues((current) => [...current, ""])}
            type="button"
            variant="secondary"
          >
            + Thêm giá trị
          </Button>
        </div>
      </Modal>
      <Modal
        footer={
          <Button className="w-full sm:w-auto" onClick={() => setPreviewImage(null)}>
            Đóng
          </Button>
        }
        onClose={() => setPreviewImage(null)}
        open={Boolean(previewImage)}
        size="lg"
        title={previewImage?.label ?? "Xem hình ảnh"}
        zIndex={130}
      >
        {previewImage ? (
          <div className="grid min-h-64 place-items-center overflow-hidden rounded-2xl bg-slate-100 p-2 sm:min-h-96">
            <img
              alt={previewImage.label}
              className="max-h-[65dvh] max-w-full rounded-xl object-contain"
              src={previewImage.url}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
