import { Plus, Trash2 } from "lucide-react";
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
          <div className="mt-2 flex flex-wrap gap-2">
            {!attribute.values.length ? (
              <p className="w-full rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
                Chưa có giá trị. Thêm ít nhất một lựa chọn để tạo SKU.
              </p>
            ) : null}
            {attribute.values.map((value) => (
              <div
                className="min-w-[96px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                key={value.id}
              >
                <div>
                  {value.label}
                  <button
                    className="ml-2 text-red-600"
                    onClick={() => {
                      updateAttribute(attribute.id, {
                        values: attribute.values.filter(
                          (item) => item.id !== value.id,
                        ),
                      });
                      onDimensionsChanged();
                    }}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                {attribute.display_type === "color_circle" ? (
                  <input
                    aria-label={`Màu ${value.label}`}
                    className="mt-1 h-7 w-12"
                    onChange={(event) =>
                      updateValue(attribute, value.id, {
                        ...value.metadata,
                        hex: event.target.value,
                      })
                    }
                    type="color"
                    value={value.metadata.hex || "#000000"}
                  />
                ) : null}
                {attribute.display_type === "image" ||
                attribute.display_type === "image_text" ? (
                  <div className="mt-2">
                    <CloudinaryImageField
                      compact
                      imageUrl={value.metadata.image_url as string | undefined}
                      label={`Ảnh ${value.label}`}
                      onChange={(selected) =>
                        updateValue(attribute, value.id, {
                          ...value.metadata,
                          image_url: selected.imageUrl,
                          cloudinary_public_id: selected.publicId ?? undefined,
                        })
                      }
                      publicId={
                        value.metadata.cloudinary_public_id as
                          string | undefined
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
            <button
              className="rounded-lg border border-dashed border-moss-400 px-3 py-1.5 text-sm font-bold text-moss-700"
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
    </div>
  );
}
