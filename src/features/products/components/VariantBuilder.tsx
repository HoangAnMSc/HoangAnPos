import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { CloudinaryImageField } from "../../../components/media/CloudinaryImageField";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { useActionNotice } from "../../../contexts/ActionNoticeContext";
import type {
  VariantAttribute,
  VariantDisplayType,
  ProductAttribute,
  VariantValue,
} from "../types";
import { countVariantCombinations } from "../utils/variants";
import { formatVariantValueLabel } from "../utils/variants";

type Props = {
  attributes: VariantAttribute[];
  catalogAttributes: ProductAttribute[];
  onChange: (attributes: VariantAttribute[]) => void;
  onCreateAttribute: (input: {
    code: string;
    displayType: VariantDisplayType;
    name: string;
    unit: string | null;
  }) => Promise<ProductAttribute>;
  onDimensionsChanged: () => void;
};
const displayOptions: Array<{ value: VariantDisplayType; label: string }> = [
  { value: "color_circle", label: "Màu + chữ" },
  { value: "color", label: "Màu" },
  { value: "text_button", label: "Chữ" },
  { value: "image", label: "Hình ảnh" },
  { value: "image_text", label: "Hình ảnh + chữ dọc" },
  { value: "image_text_horizontal", label: "Hình ảnh + chữ ngang" },
  { value: "dropdown", label: "Dropdown" },
];
const fallbackColors = [
  "#111827",
  "#EF4444",
  "#3B82F6",
  "#22C55E",
  "#F59E0B",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
];
const slug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const inferDisplayType = (
  inputType: ProductAttribute["input_type"],
): VariantDisplayType => {
  if (inputType === "color") return "color_circle";
  if (inputType === "image") return "image";
  if (inputType === "image_text") return "image_text";
  if (inputType === "select" || inputType === "multi_select") return "dropdown";
  return "text_button";
};

export function VariantBuilder({
  attributes,
  catalogAttributes,
  onChange,
  onCreateAttribute,
  onDimensionsChanged,
}: Props) {
  const { alertAction, promptAction } = useActionNotice();
  const [open, setOpen] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [attributeQuery, setAttributeQuery] = useState("");
  const [savingAttribute, setSavingAttribute] = useState(false);
  const [localError, setLocalError] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("");
  const [display, setDisplay] = useState<VariantDisplayType>("text_button");
  const [required, setRequired] = useState(true);
  const [values, setValues] = useState<string[]>([""]);
  async function save() {
    const cleanValues = values
      .map((value) =>
        display === "color" ? value.toLocaleUpperCase() : value.trim(),
      )
      .filter(
        (value, index, rows) =>
          Boolean(value) &&
          rows.findIndex((item) => slug(item) === slug(value)) === index,
      );
    if (!name.trim() || !cleanValues.length) return;
    setSavingAttribute(true);
    setLocalError("");
    try {
      const savedAttribute = await onCreateAttribute({
        code: code.trim() || slug(name),
        displayType: display,
        name: name.trim(),
        unit: unit.trim() || null,
      });
    const id = crypto.randomUUID();
    const nextValues: VariantValue[] = cleanValues.map((label, index) => ({
      id: crypto.randomUUID(),
      variant_attribute_id: id,
      label,
      value: display === "color" ? `color_${label.slice(1).toLowerCase()}` : slug(label) || label,
      metadata: display === "color" ? { hex: label } : {},
      sort_order: index,
      is_active: true,
    }));
    onChange([
      ...attributes,
      {
        id,
        product_id: "",
        source_attribute_id: savedAttribute.id,
        name: savedAttribute.name,
        code: savedAttribute.code,
        data_type: "option",
        unit: savedAttribute.unit,
        display_type: display,
        is_required: required,
        sort_order: attributes.length,
        values: nextValues,
      },
    ]);
    onDimensionsChanged();
    setOpen(false);
    setAddMode("existing");
    setName("");
    setCode("");
    setUnit("");
    setValues([""]);
    } catch (reason) {
      setLocalError(
        reason instanceof Error ? reason.message : "Không thể tạo thuộc tính.",
      );
    } finally {
      setSavingAttribute(false);
    }
  }
  function addExistingAttribute(attribute: ProductAttribute) {
    const id = crypto.randomUUID();
    onChange([
      ...attributes,
      {
        id,
        product_id: "",
        source_attribute_id: attribute.id,
        name: attribute.name,
        code: attribute.code,
        data_type: "option",
        unit: attribute.unit,
        display_type: inferDisplayType(attribute.input_type),
        is_required: true,
        sort_order: attributes.length,
        values: [],
      },
    ]);
    onDimensionsChanged();
    setOpen(false);
    setAttributeQuery("");
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
  async function updateColor(
    attribute: VariantAttribute,
    target: VariantValue,
    hex: string,
  ) {
    const normalized = hex.toLocaleUpperCase();
    if (
      attribute.display_type === "color" &&
      attribute.values.some(
        (value) =>
          value.id !== target.id &&
          String(value.metadata.hex).toLocaleUpperCase() === normalized,
      )
    ) {
      await alertAction({
        message: "Màu này đã có trong tùy chọn.",
        title: "Màu đã tồn tại",
        tone: "danger",
      });
      return;
    }
    updateAttribute(attribute.id, {
      values: attribute.values.map((value) =>
        value.id === target.id
          ? {
              ...value,
              ...(attribute.display_type === "color"
                ? {
                    label: normalized,
                    value: `color_${normalized.slice(1).toLowerCase()}`,
                  }
                : {}),
              metadata: { ...value.metadata, hex: normalized },
            }
          : value,
      ),
    });
  }
  async function addColorValue(attribute: VariantAttribute, hex: string) {
    const normalized = hex.toLocaleUpperCase();
    if (
      attribute.values.some(
        (value) => String(value.metadata.hex).toLocaleUpperCase() === normalized,
      )
    ) {
      await alertAction({
        message: "Màu này đã có trong tùy chọn.",
        title: "Màu đã tồn tại",
        tone: "danger",
      });
      return;
    }
    updateAttribute(attribute.id, {
      values: [
        ...attribute.values,
        {
          id: crypto.randomUUID(),
          variant_attribute_id: attribute.id,
          label: normalized,
          value: `color_${normalized.slice(1).toLowerCase()}`,
          metadata: { hex: normalized },
          sort_order: attribute.values.length,
          is_active: true,
        },
      ],
    });
    onDimensionsChanged();
  }
  async function renameValue(attribute: VariantAttribute, target: VariantValue) {
    const label = await promptAction({
      confirmLabel: "Lưu thay đổi",
      initialValue: target.label,
      inputLabel: "Tên giá trị",
      message: `Đổi tên giá trị trong tùy chọn “${attribute.name}”.`,
      placeholder: "Ví dụ: Đỏ, XL, 500 ml",
      title: "Sửa giá trị tùy chọn",
    });
    const cleanLabel = label?.trim();
    if (!cleanLabel || cleanLabel === target.label) return;
    const cleanValue = slug(cleanLabel) || cleanLabel;
    if (
      attribute.values.some(
        (value) => value.id !== target.id && value.value === cleanValue,
      )
    ) {
      await alertAction({
        message: "Giá trị này đã tồn tại trong tùy chọn. Hãy nhập một tên khác.",
        title: "Giá trị đã tồn tại",
        tone: "danger",
      });
      return;
    }
    updateAttribute(attribute.id, {
      values: attribute.values.map((value) =>
        value.id === target.id
          ? { ...value, label: cleanLabel, value: cleanValue }
          : value,
      ),
    });
  }
  async function renameAttribute(attribute: VariantAttribute) {
    const name = await promptAction({
      confirmLabel: "Lưu thay đổi",
      initialValue: attribute.name,
      inputLabel: "Tên tùy chọn",
      message:
        "Chỉ đổi tên hiển thị trên sản phẩm này. Thuộc tính dùng chung không bị thay đổi.",
      placeholder: "Ví dụ: Màu sắc, Kích thước",
      title: "Sửa tên tùy chọn",
    });
    const cleanName = name?.trim();
    if (!cleanName || cleanName === attribute.name) return;
    updateAttribute(attribute.id, { name: cleanName });
  }
  const availableCatalogAttributes = catalogAttributes.filter(
    (attribute) =>
      attribute.is_active &&
      !attributes.some(
        (current) =>
          current.source_attribute_id === attribute.id ||
          current.code === attribute.code,
      ) &&
      `${attribute.name} ${attribute.code}`
        .toLocaleLowerCase()
        .includes(attributeQuery.trim().toLocaleLowerCase()),
  );
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
              aria-label={`Sửa tên tùy chọn ${attribute.name}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              onClick={() => void renameAttribute(attribute)}
              type="button"
            >
              <Pencil className="h-4 w-4" />
            </button>
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
                onChange={(event) => {
                  const displayType = event.target.value as VariantDisplayType;
                  updateAttribute(attribute.id, {
                    display_type: displayType,
                    values:
                      displayType === "color"
                        ? attribute.values.map((value, index) => {
                            const hex = String(
                              value.metadata.hex ??
                                fallbackColors[index % fallbackColors.length],
                            ).toLocaleUpperCase();
                            return {
                              ...value,
                              label: hex,
                              value: `color_${hex.slice(1).toLowerCase()}`,
                              metadata: { ...value.metadata, hex },
                            };
                          })
                        : attribute.values,
                  });
                }}
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
                  : attribute.display_type === "dropdown"
                    ? "mt-2 space-y-2"
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
                  publicId={
                    value.metadata.cloudinary_public_id as string | undefined
                  }
                  showRemove={false}
                  showTileLabel={false}
                />
              );

              if (
                attribute.display_type === "image" ||
                attribute.display_type === "image_text" ||
                attribute.display_type === "image_text_horizontal"
              ) {
                if (attribute.display_type === "image") {
                  return (
                    <div
                      className="relative min-w-0 rounded-xl border border-slate-200 bg-white p-1.5"
                      key={value.id}
                    >
                      {imageField}
                      <button
                        aria-label={`Xóa ${value.label}`}
                        className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-600 shadow-md transition hover:bg-red-100"
                        onClick={removeValue}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-1.5" key={value.id}>
                    {imageField}
                    <div className="mt-1.5 flex min-w-0 items-center gap-1 border-t border-slate-100 px-1 pt-1.5">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-xs font-extrabold text-slate-800 transition hover:bg-slate-50"
                        onClick={() => void renameValue(attribute, value)}
                        type="button"
                      >
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <Pencil className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      </button>
                      <button
                        aria-label={`Xóa ${value.label}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
                        onClick={removeValue}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              }

              if (
                attribute.display_type === "color_circle" ||
                attribute.display_type === "color"
              ) {
                const colorOnly = attribute.display_type === "color";
                return (
                  <div className={`relative flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 ${colorOnly ? "w-16" : "w-20"}`} key={value.id}>
                    <label className="relative cursor-pointer" title={`Đổi màu ${value.label}`}>
                      <span
                        className="block h-10 w-10 rounded-full border-2 border-white shadow ring-1 ring-slate-300"
                        style={{ backgroundColor: value.metadata.hex || "#000000" }}
                      />
                      <input
                        aria-label={`Màu ${value.label}`}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={(event) =>
                          void updateColor(attribute, value, event.target.value)
                        }
                        type="color"
                        value={value.metadata.hex || "#000000"}
                      />
                    </label>
                    {!colorOnly ? <button
                      className="flex max-w-full items-center gap-1 truncate text-center text-[11px] font-bold text-slate-700"
                      onClick={() => void renameValue(attribute, value)}
                      title={`Sửa tên ${value.label}`}
                      type="button"
                    >
                      <span className="truncate">{label}</span>
                      <Pencil className="h-3 w-3 shrink-0" />
                    </button> : null}
                    <button aria-label={`Xóa ${value.label}`} className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-red-50 text-red-600 shadow" onClick={removeValue} type="button"><Trash2 className="h-3 w-3" /></button>
                  </div>
                );
              }

              if (attribute.display_type === "dropdown") {
                return (
                  <div
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
                    key={value.id}
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <button
                      aria-label={`Sửa tên ${value.label}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-600 transition hover:bg-slate-100"
                      onClick={() => void renameValue(attribute, value)}
                      type="button"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label={`Xóa ${value.label}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600 transition hover:bg-red-100"
                      onClick={removeValue}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }

              return (
                <div className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold" key={value.id}>
                  <span>{label}</span>
                  <button aria-label={`Sửa tên ${value.label}`} className="ml-auto text-slate-500 transition hover:text-slate-900" onClick={() => void renameValue(attribute, value)} type="button"><Pencil className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Xóa ${value.label}`} className="text-red-600" onClick={removeValue} type="button"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
            {attribute.display_type === "color" ? (
              <label className="relative grid min-h-16 w-16 cursor-pointer place-items-center rounded-xl border border-dashed border-moss-400 px-2 text-center text-xs font-bold text-moss-700">
                + Thêm màu
                <input
                  aria-label="Chọn màu mới"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => void addColorValue(attribute, event.target.value)}
                  type="color"
                />
              </label>
            ) : <button
              className={`rounded-lg border border-dashed border-moss-400 px-3 py-1.5 text-sm font-bold text-moss-700 ${attribute.display_type === "image_text" || attribute.display_type === "image" ? "min-h-24" : attribute.display_type === "image_text_horizontal" ? "min-h-14" : ""}`}
              onClick={async () => {
                const label = await promptAction({
                  confirmLabel: "Thêm giá trị",
                  inputLabel: "Tên giá trị",
                  message: `Nhập giá trị mới cho biến thể “${attribute.name}”.`,
                  placeholder: "Ví dụ: Đỏ, XL, 500 ml",
                  title: "Thêm giá trị biến thể",
                });
                if (!label) return;
                if (
                  attribute.values.some(
                    (value) => value.value === (slug(label) || label),
                  )
                ) {
                  await alertAction({
                    message: "Giá trị này đã tồn tại trong biến thể. Hãy nhập một giá trị khác.",
                    title: "Giá trị đã tồn tại",
                    tone: "danger",
                  });
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
            </button>}
          </div>
        </section>
      ))}
      <Button
        className="w-full border-dashed sm:w-auto"
        onClick={() => {
          setAddMode("existing");
          setAttributeQuery("");
          setLocalError("");
          setOpen(true);
        }}
        type="button"
        variant="secondary"
      >
        <Plus className="h-4 w-4" /> Thêm biến thể
      </Button>
      <Modal
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={() => setOpen(false)} variant="secondary">
              Đóng
            </Button>
            {addMode === "new" ? (
              <Button
                disabled={savingAttribute || !name.trim()}
                onClick={() => void save()}
              >
                {savingAttribute ? "Đang tạo..." : "Tạo và thêm"}
              </Button>
            ) : null}
          </div>
        }
        onClose={() => setOpen(false)}
        open={open}
        title="Thêm biến thể"
        zIndex={110}
      >
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            className={`rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${addMode === "existing" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            onClick={() => {
              setAddMode("existing");
              setLocalError("");
            }}
            type="button"
          >
            Từ thuộc tính
          </button>
          <button
            className={`rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${addMode === "new" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
            onClick={() => {
              setAddMode("new");
              setLocalError("");
            }}
            type="button"
          >
            Tạo mới
          </button>
        </div>
        {localError ? (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {localError}
          </p>
        ) : null}
        {addMode === "existing" ? (
          <div className="space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
                onChange={(event) => setAttributeQuery(event.target.value)}
                placeholder="Tìm thuộc tính đã tạo..."
                value={attributeQuery}
              />
            </label>
            <div className="space-y-2 pb-1">
              {availableCatalogAttributes.map((attribute) => (
                <button
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left transition hover:border-moss-400 hover:bg-moss-50"
                  key={attribute.id}
                  onClick={() => addExistingAttribute(attribute)}
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">{attribute.name}</strong>
                    <span className="block truncate text-xs text-slate-500">
                      {attribute.code}{attribute.unit ? ` · ${attribute.unit}` : ""}
                    </span>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-moss-700" />
                </button>
              ))}
              {!availableCatalogAttributes.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Không còn thuộc tính phù hợp. Bạn có thể chuyển sang “Tạo mới”.
                </div>
              ) : null}
            </div>
          </div>
        ) : <>
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
          <Input
            label="Đơn vị (tùy chọn)"
            onChange={(event) => setUnit(event.target.value)}
            placeholder="Ví dụ: ml, kg"
            value={unit}
          />
          <Select
            label="Kiểu hiển thị"
            onChange={(event) => {
              const next = event.target.value as VariantDisplayType;
              setDisplay(next);
              if (next === "color") {
                setValues((current) => {
                  const colors = current.filter((value) =>
                    /^#[0-9a-f]{6}$/i.test(value),
                  );
                  return colors.length ? colors : ["#000000"];
                });
              }
            }}
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
          <p className="text-sm font-bold">
            {display === "color" ? "Danh sách màu" : "Danh sách giá trị"}
          </p>
          {values.map((value, index) =>
            display === "color" ? (
              <label
                className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3"
                key={index}
              >
                <input
                  className="h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  onChange={(event) =>
                    setValues((current) =>
                      current.map((item, position) =>
                        position === index ? event.target.value : item,
                      ),
                    )
                  }
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
                />
                <span className="flex-1 text-sm font-bold text-slate-700">
                  {value.toLocaleUpperCase()}
                </span>
                {values.length > 1 ? (
                  <button
                    aria-label={`Xóa màu ${index + 1}`}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600"
                    onClick={() =>
                      setValues((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </label>
            ) : (
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
            ),
          )}
          <Button
            onClick={() =>
              setValues((current) => [
                ...current,
                display === "color" ? "#000000" : "",
              ])
            }
            type="button"
            variant="secondary"
          >
            + {display === "color" ? "Thêm màu" : "Thêm giá trị"}
          </Button>
        </div>
        </>}
      </Modal>
    </div>
  );
}
