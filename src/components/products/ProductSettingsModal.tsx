import { useEffect, useState, type PointerEvent } from "react";
import {
  Check,
  Code2,
  Eye,
  EyeOff,
  GripVertical,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import {
  NoImagePlaceholder,
  ProductCard,
  ProductCardCodeRenderer,
} from "./ProductCard";
import { getDefaultCardCode } from "./productCardCode";
import { formatCurrency } from "../../lib/format";
import type { Product } from "../../types";
import type {
  CustomAttributeType,
  ProductSettings,
} from "../../services/productSettings";

const labels: Record<string, string> = {
  image: "Hình ảnh",
  name: "Tên sản phẩm",
  sku: "EAN-13",
  category: "Nhóm hàng",
  description: "Mô tả",
  price: "Giá bán",
  cost_price: "Giá vốn",
  stock: "Tổng tồn kho",
  shelf_stock: "Tồn trên kệ",
  import_date: "Ngày nhập",
  expiry_date: "Hạn sử dụng",
  is_active: "Trạng thái",
  is_reward: "Sản phẩm đổi điểm",
  reward_points_cost: "Điểm cần đổi",
  color: "Màu sắc",
  size: "Kích thước",
};
const attributeTypeLabels: Record<CustomAttributeType, string> = {
  text: "Văn bản",
  number: "Số",
  date: "Ngày",
  single: "Chọn một",
  multiple: "Chọn nhiều",
  media: "Ảnh & video",
};
type OptionDraft = {
  id: string;
  label: string;
  color: string;
  useColor: boolean;
};
type EditorState = {
  id?: string;
  name: string;
  type: CustomAttributeType;
  options: OptionDraft[];
  useForVariants: boolean;
  optionDisplay: "color" | "text" | "both";
};
type CardTextEditor = { key: string; before: string; after: string };
type CardCodeEditor = {
  html: string;
  css: string;
  activeTab: "html" | "css";
  error: string;
  saveTemplateOpen: boolean;
  templateName: string;
};

const placeholderLabels: Record<string, string> = {
  name: "{#ten}",
  category: "{#nhomhang}",
  price: "{#giaban}",
  shelf_stock: "{#trenke}",
  stock: "{#tongton}",
  expiry_date: "{#hansudung}",
};

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={`relative h-7 w-12 shrink-0 rounded-full ${checked ? "bg-moss-700" : "bg-slate-300"}`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

export function ProductSettingsModal({
  open,
  settings,
  sample,
  saving,
  onClose,
  onSave,
  initialPreview = null,
  initialLinks = false,
}: {
  open: boolean;
  settings: ProductSettings;
  sample: Product | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: ProductSettings) => Promise<void>;
  initialPreview?: "card" | "pos" | null;
  initialLinks?: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  const [preview, setPreview] = useState<"card" | "pos" | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState("");
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [linkOpen, setLinkOpen] = useState(false);
  const [cardTextEditor, setCardTextEditor] = useState<CardTextEditor | null>(
    null,
  );
  const [cardCodeEditor, setCardCodeEditor] = useState<CardCodeEditor | null>(
    null,
  );
  useEffect(() => {
    setDraft(settings);
    if (open) {
      setPreview(initialPreview);
      setLinkOpen(initialLinks);
    }
  }, [open, settings, initialPreview, initialLinks]);
  const fieldLabel = (key: string) =>
    labels[key] ??
    draft.customAttributes.find((item) => item.id === key)?.name ??
    key;
  const cardEditorSampleValue = cardTextEditor
    ? (draft.customAttributes.find((item) => item.id === cardTextEditor.key)
        ?.name ??
      {
        name: sample?.name ?? "Tên sản phẩm",
        category: sample?.category ?? "Nhóm hàng",
        price: formatCurrency(sample?.price ?? 20000),
        cost_price: formatCurrency(sample?.cost_price ?? 15000),
        stock: String(sample?.stock ?? 20),
        shelf_stock: String(sample?.shelf_stock ?? 10),
        sku: sample?.sku ?? "8930000000000",
        description: sample?.description ?? "Mô tả sản phẩm",
        import_date: sample?.import_date ?? "2026-08-05",
        expiry_date: sample?.expiry_date ?? "2027-08-05",
        is_active: sample?.is_active === false ? "Đang ẩn" : "Đang bán",
        is_reward: sample?.is_reward ? "Có" : "Không",
        reward_points_cost: String(sample?.reward_points_cost ?? 100),
      }[cardTextEditor.key] ??
      "Nội dung mẫu")
    : "";
  const reorder = (items: string[], source: string, target: string) => {
    const next = items.filter((item) => item !== source);
    next.splice(Math.max(0, next.indexOf(target)), 0, source);
    return next;
  };
  const reorderDraft = (
    current: ProductSettings,
    source: string,
    target: string,
  ) => ({
    ...current,
    attributeOrder: reorder(current.attributeOrder, source, target),
    card: {
      ...current.card,
      order: reorder(current.card.order, source, target),
    },
  });
  const move = (event: PointerEvent<HTMLElement>) => {
    if (!dragged) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-card-key]")
      ?.getAttribute("data-card-key");
    if (target && target !== dragged) {
      if (preview)
        updatePreviewCard((card) => ({
          ...card,
          order: reorder(card.order, dragged, target),
        }));
      else setDraft((current) => reorderDraft(current, dragged, target));
    }
  };
  const dragProps = (key: string) => ({
    "data-card-key": key,
    draggable: true,
    onDragStart: () => setDragged(key),
    onDragOver: (event: React.DragEvent) => event.preventDefault(),
    onDrop: () => {
      if (dragged && dragged !== key) {
        if (preview)
          updatePreviewCard((card) => ({
            ...card,
            order: reorder(card.order, dragged, key),
          }));
        else setDraft((current) => reorderDraft(current, dragged, key));
      }
      setDragged(null);
    },
    onPointerDown: () => setDragged(key),
    onPointerMove: move,
    onPointerUp: () => setDragged(null),
  });
  const productAttributes =
    sample?.attributes &&
    typeof sample.attributes === "object" &&
    !Array.isArray(sample.attributes)
      ? sample.attributes
      : {};
  const previewAttributes = draft.customAttributes.reduce<
    Record<string, unknown>
  >(
    (values, attribute) => {
      if (values[attribute.id] !== null && values[attribute.id] !== undefined)
        return values;
      const sampleValue =
        attribute.type === "single"
          ? (attribute.options[0] ?? "Lựa chọn mẫu")
          : attribute.type === "multiple"
            ? attribute.options.slice(0, 2)
            : attribute.type === "number"
              ? 10
              : attribute.type === "date"
                ? new Date().toISOString().slice(0, 10)
                : attribute.type === "media"
                  ? {
                      images: [
                        sample?.image_url ??
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='160'%3E%3Crect width='100%25' height='100%25' fill='%23f1f5f9'/%3E%3C/svg%3E",
                      ],
                      video: "",
                    }
                  : "Nội dung mẫu";
      return { ...values, [attribute.id]: sampleValue };
    },
    { ...productAttributes },
  );
  const previewProduct = sample
    ? {
        ...sample,
        category: sample.category || "Nhóm hàng mẫu",
        description: sample.description || "Mô tả sản phẩm mẫu",
        expiry_date: sample.expiry_date || "2027-08-05",
        import_date: sample.import_date || "2026-08-05",
        sku: sample.sku || "8930000000000",
        attributes: previewAttributes as Product["attributes"],
      }
    : null;
  const previewCard = preview === "pos" ? draft.posCard : draft.card;
  const effectivePreviewCard = {
    ...previewCard,
    visibleFields: previewCard.visibleFields.filter(
      (key) => draft.enabledFields[key] !== false,
    ),
  };
  const enabledCardKeys = previewCard.order.filter(
    (key) => draft.enabledFields[key] !== false,
  );
  const visibleCount = previewCard.visibleFields.filter((key) =>
    enabledCardKeys.includes(key),
  ).length;
  const updatePreviewCard = (
    update: (card: ProductSettings["card"]) => ProductSettings["card"],
  ) =>
    setDraft((current) =>
      preview === "pos"
        ? { ...current, posCard: update(current.posCard) }
        : { ...current, card: update(current.card) },
    );

  function openCardFieldEditor(key: string) {
    if (key === "image") {
      setCardTextEditor({ key, before: "", after: "" });
      return;
    }
    const fallback = key === "shelf_stock" ? "Còn {value} trên kệ" : "{value}";
    const template = previewCard.textTemplates?.[key] ?? fallback;
    const marker = template.indexOf("{value}");
    setCardTextEditor({
      key,
      before: marker < 0 ? "" : template.slice(0, marker),
      after: marker < 0 ? "" : template.slice(marker + 7),
    });
  }

  function saveCardFieldEditor() {
    if (!cardTextEditor) return;
    if (cardTextEditor.key !== "image") {
      updatePreviewCard((card) => ({
        ...card,
        textTemplates: {
          ...card.textTemplates,
          [cardTextEditor.key]: `${cardTextEditor.before}{value}${cardTextEditor.after}`,
        },
      }));
    }
    setCardTextEditor(null);
  }

  function openCardCodeEditor() {
    const defaults = getDefaultCardCode(preview === "pos" ? "pos" : "card");
    setCardCodeEditor({
      activeTab: "html",
      error: "",
      html: previewCard.templateHtml || defaults.html,
      css: previewCard.templateCss || defaults.css,
      saveTemplateOpen: false,
      templateName: "",
    });
  }

  function saveCurrentCardTemplate() {
    if (!cardCodeEditor) return;
    const name = cardCodeEditor.templateName.trim();
    if (!name) {
      setCardCodeEditor({
        ...cardCodeEditor,
        error: "Vui lòng nhập tên mẫu mới.",
      });
      return;
    }
    if (
      previewCard.templates?.some(
        (template) => template.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setCardCodeEditor({
        ...cardCodeEditor,
        error: "Tên mẫu đã tồn tại trong loại card này.",
      });
      return;
    }
    updatePreviewCard((card) => ({
      ...card,
      templates: [
        ...(card.templates ?? []),
        {
          id: crypto.randomUUID(),
          name,
          html: cardCodeEditor.html,
          css: cardCodeEditor.css,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setCardCodeEditor({
      ...cardCodeEditor,
      error: "",
      saveTemplateOpen: false,
      templateName: "",
    });
  }

  function saveCardCodeEditor() {
    if (!cardCodeEditor) return;
    if (!cardCodeEditor.html.trim()) {
      setCardCodeEditor({
        ...cardCodeEditor,
        activeTab: "html",
        error: "Vui lòng nhập mã TSX/HTML cho card.",
      });
      return;
    }
    updatePreviewCard((card) => ({
      ...card,
      templateHtml: cardCodeEditor.html,
      templateCss: cardCodeEditor.css,
    }));
    setCardCodeEditor(null);
  }

  function openEditor(id?: string) {
    const item = draft.customAttributes.find((value) => value.id === id);
    setEditor(
      item
        ? {
            id: item.id,
            name: item.name,
            type: item.type,
            useForVariants: item.useForVariants === true,
            optionDisplay:
              item.optionDisplay ??
              (Object.keys(item.optionColors ?? {}).length ? "both" : "text"),
            options: item.options.map((label) => ({
              id: crypto.randomUUID(),
              label,
              color: item.optionColors?.[label] ?? "#5f744b",
              useColor: Boolean(item.optionColors?.[label]),
            })),
          }
        : {
            name: "",
            type: "text",
            options: [],
            useForVariants: false,
            optionDisplay: "text",
          },
    );
    setEditorError("");
  }
  function saveEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      setEditorError("Vui lòng nhập tên thuộc tính.");
      return;
    }
    if (
      draft.customAttributes.some(
        (item) =>
          item.id !== editor.id &&
          item.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setEditorError("Tên thuộc tính đã tồn tại.");
      return;
    }
    const optionRows = editor.options
      .map((item) => ({
        ...item,
        label:
          editor.optionDisplay === "color" ? item.color : item.label.trim(),
      }))
      .filter((item) => item.label);
    if (
      (editor.type === "single" || editor.type === "multiple") &&
      optionRows.length === 0
    ) {
      setEditorError("Hãy thêm ít nhất một lựa chọn text hoặc màu.");
      return;
    }
    const options = [...new Set(optionRows.map((item) => item.label))];
    const optionColors = Object.fromEntries(
      optionRows
        .filter(() => editor.optionDisplay !== "text")
        .map((item) => [item.label, item.color]),
    );
    if (editor.id) {
      setDraft((current) => ({
        ...current,
        customAttributes: current.customAttributes.map((item) =>
          item.id === editor.id
            ? {
                ...item,
                name,
                type: editor.type,
                options,
                optionColors,
                useForVariants: editor.useForVariants,
                optionDisplay: editor.optionDisplay,
              }
            : item,
        ),
      }));
    } else {
      const id = crypto.randomUUID();
      setDraft((current) => ({
        ...current,
        customAttributes: [
          ...current.customAttributes,
          {
            id,
            name,
            type: editor.type,
            options,
            optionColors,
            enabled: true,
            useForVariants: editor.useForVariants,
            optionDisplay: editor.optionDisplay,
          },
        ],
        attributeOrder: [...current.attributeOrder, id],
        enabledFields: { ...current.enabledFields, [id]: true },
        card: {
          ...current.card,
          order: [...current.card.order, id],
          visibleFields: [...new Set([...current.card.visibleFields, id])],
        },
        posCard: {
          ...current.posCard,
          order: [...current.posCard.order, id],
          visibleFields: [...new Set([...current.posCard.visibleFields, id])],
        },
      }));
    }
    setEditor(null);
  }
  function deleteAttribute(id: string) {
    setDraft((current) => ({
      ...current,
      customAttributes: current.customAttributes.filter(
        (item) => item.id !== id,
      ),
      attributeOrder: current.attributeOrder.filter((key) => key !== id),
      linkedAttributeIds: current.linkedAttributeIds.filter(
        (key) => key !== id,
      ),
      enabledFields: { ...current.enabledFields, [id]: false },
      card: {
        ...current.card,
        order: current.card.order.filter((key) => key !== id),
        visibleFields: current.card.visibleFields.filter((key) => key !== id),
      },
      posCard: {
        ...current.posCard,
        order: current.posCard.order.filter((key) => key !== id),
        visibleFields: current.posCard.visibleFields.filter(
          (key) => key !== id,
        ),
      },
    }));
    setEditor(null);
  }
  function setFieldEnabled(key: string, value: boolean) {
    setDraft((current) => ({
      ...current,
      enableColor: key === "color" ? value : current.enableColor,
      enableSize: key === "size" ? value : current.enableSize,
      enabledFields: { ...current.enabledFields, [key]: value },
      customAttributes: current.customAttributes.map((item) =>
        item.id === key ? { ...item, enabled: value } : item,
      ),
    }));
  }

  function closePreview() {
    setPreview(null);
    setCardTextEditor(null);
    setCardCodeEditor(null);
    if (initialPreview) onClose();
  }

  function closeVariants() {
    setLinkOpen(false);
    setEditor(null);
    if (initialLinks) onClose();
  }

  return (
    <>
      <Modal
        open={open && !preview && !linkOpen}
        onClose={onClose}
        size="xl"
        title="Cài đặt sản phẩm"
        footer={
          <div className="flex w-full justify-end">
            <Button disabled={saving} onClick={() => void onSave(draft)}>
              {saving ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>
          </div>
        }
      >
        <section>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-950">
                Thứ tự form sản phẩm
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Kéo để đổi vị trí trường trong form tạo/sửa sản phẩm. Switch
                quyết định trường có được sử dụng hay không.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {draft.attributeOrder
              .filter(
                (key) =>
                  !draft.customAttributes.some((item) => item.id === key),
              )
              .map((key, index) => {
                const enabled = draft.enabledFields[key] !== false;
                return (
                  <div
                    {...dragProps(key)}
                    className={`flex touch-none select-none items-center gap-3 rounded-2xl border px-3 py-3 shadow-sm transition ${enabled ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-65"}`}
                    key={key}
                  >
                    <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-slate-400" />
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-extrabold text-slate-900">
                      {fieldLabel(key)}
                    </span>
                    <Switch
                      checked={enabled}
                      onChange={(value) => setFieldEnabled(key, value)}
                    />
                  </div>
                );
              })}
          </div>
        </section>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={closePreview}
        size="lg"
        title={
          preview === "pos"
            ? "Điều chỉnh card POS"
            : "Điều chỉnh card dùng chung"
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={closePreview} variant="secondary">
              Hủy
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                await onSave(draft);
                setPreview(null);
              }}
            >
              {saving ? "Đang lưu..." : "Lưu hiển thị card"}
            </Button>
          </div>
        }
      >
        <div className="mb-4 rounded-2xl bg-slate-100 p-1">
          <div className="grid grid-cols-2">
            <button
              className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${preview === "card" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              onClick={() => setPreview("card")}
              type="button"
            >
              Card chung
            </button>
            <button
              className={`rounded-xl px-3 py-2.5 text-sm font-extrabold transition ${preview === "pos" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              onClick={() => setPreview("pos")}
              type="button"
            >
              Card POS
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button
              className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-sm"
              onClick={() => setPreviewExpanded((value) => !value)}
              type="button"
            >
              {previewExpanded ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {previewExpanded ? "Ẩn xem trước" : "Hiện xem trước"}
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-slate-800"
              onClick={openCardCodeEditor}
              type="button"
            >
              <Code2 className="h-4 w-4" />
              Điều chỉnh code
            </button>
          </div>
        </div>
        <div
          className={`grid gap-5 ${previewExpanded ? "sm:grid-cols-[minmax(0,1fr)_220px]" : "grid-cols-1"}`}
        >
          <section className="order-2 sm:order-1">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-slate-950">Nội dung card</h3>
                <p className="text-xs font-semibold text-slate-500">
                  Đang hiện {visibleCount}/{enabledCardKeys.length} mục
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  className="px-2 text-xs"
                  onClick={() =>
                    updatePreviewCard((card) => ({
                      ...card,
                      visibleFields: card.order.filter(
                        (key) => draft.enabledFields[key] !== false,
                      ),
                    }))
                  }
                  variant="secondary"
                >
                  Bật tất cả
                </Button>
                <Button
                  className="px-2 text-xs"
                  onClick={() =>
                    updatePreviewCard((card) => ({
                      ...card,
                      visibleFields: [],
                    }))
                  }
                  variant="secondary"
                >
                  Tắt tất cả
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {enabledCardKeys.map((key) => {
                const visible = previewCard.visibleFields.includes(key);
                return (
                  <div
                    {...dragProps(key)}
                    className={`flex touch-none items-center gap-3 rounded-xl border p-3 transition ${visible ? "border-moss-200 bg-moss-50" : "border-slate-200 bg-white opacity-70"}`}
                    key={key}
                  >
                    <GripVertical className="h-5 w-5 cursor-grab text-slate-400" />
                    <span className="min-w-0 flex-1 text-sm font-bold">
                      {fieldLabel(key)}
                    </span>
                    {visible ? (
                      <Check className="h-4 w-4 text-moss-700" />
                    ) : null}
                    <Switch
                      checked={visible}
                      onChange={(value) =>
                        updatePreviewCard((card) => ({
                          ...card,
                          visibleFields: value
                            ? [...new Set([...card.visibleFields, key])]
                            : card.visibleFields.filter((item) => item !== key),
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </section>
          {previewExpanded ? (
            <aside className="order-1 rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:order-2 sm:self-start">
              <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs font-bold text-slate-500">
                <Pencil className="h-3.5 w-3.5" />
                Nhấn vào từng vùng để sửa
              </p>
              {preview === "card" && previewProduct ? (
                <div className="mx-auto w-full max-w-[210px]">
                  <ProductCard
                    compact
                    customAttributes={draft.customAttributes}
                    onEditField={openCardFieldEditor}
                    product={previewProduct}
                    relatedProducts={[previewProduct]}
                    settings={effectivePreviewCard}
                  />
                </div>
              ) : preview === "pos" &&
                previewProduct &&
                previewCard.templateHtml ? (
                <div className="mx-auto w-full max-w-[210px]">
                  <ProductCardCodeRenderer
                    customAttributes={draft.customAttributes}
                    mode="pos"
                    product={previewProduct}
                    quantity={0}
                    settings={effectivePreviewCard}
                  />
                </div>
              ) : (
                <article className="mx-auto flex w-full max-w-[210px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md">
                  {previewCard.order.map((key) => (
                    <div
                      className="cursor-pointer rounded-md transition hover:ring-2 hover:ring-moss-300"
                      key={key}
                      onClick={() => openCardFieldEditor(key)}
                    >
                      <PreviewBlock
                        blockKey={key}
                        label={fieldLabel(key)}
                        product={previewProduct}
                        attributes={previewAttributes}
                        enabled={effectivePreviewCard}
                        definition={draft.customAttributes.find(
                          (item) => item.id === key,
                        )}
                        mode={preview === "pos" ? "pos" : "card"}
                      />
                    </div>
                  ))}
                </article>
              )}
            </aside>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(cardTextEditor)}
        onClose={() => setCardTextEditor(null)}
        size="sm"
        title={
          cardTextEditor?.key === "image"
            ? "Hiển thị hình ảnh"
            : `Chỉnh nội dung ${cardTextEditor ? fieldLabel(cardTextEditor.key) : ""}`
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={() => setCardTextEditor(null)} variant="secondary">
              Hủy
            </Button>
            <Button onClick={saveCardFieldEditor}>Áp dụng</Button>
          </div>
        }
      >
        {cardTextEditor?.key === "image" ? (
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-600">
              Chọn cách ảnh sản phẩm nằm trong khung card.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["cover", "contain"] as const).map((fit) => (
                <button
                  className={`rounded-xl border p-3 text-sm font-extrabold ${previewCard.imageFit === fit ? "border-moss-500 bg-moss-50 text-moss-800" : "border-slate-200"}`}
                  key={fit}
                  onClick={() =>
                    updatePreviewCard((card) => ({ ...card, imageFit: fit }))
                  }
                  type="button"
                >
                  {fit === "cover" ? "Lấp đầy khung" : "Hiện toàn bộ ảnh"}
                </button>
              ))}
            </div>
          </div>
        ) : cardTextEditor ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-moss-50 p-3 text-xs font-semibold text-moss-800">
              Chỉ thay đổi chữ ở hai bên. Giá trị thật của sản phẩm luôn được
              giữ nguyên.
            </div>
            <label className="block text-sm font-bold text-slate-700">
              Chữ phía trước
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
                onChange={(event) =>
                  setCardTextEditor({
                    ...cardTextEditor,
                    before: event.target.value,
                  })
                }
                placeholder="Ví dụ: Còn "
                value={cardTextEditor.before}
              />
            </label>
            <div className="flex items-center gap-2">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs font-black text-white">
                {placeholderLabels[cardTextEditor.key] ?? "{#giatri}"}
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <label className="block text-sm font-bold text-slate-700">
              Chữ phía sau
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
                onChange={(event) =>
                  setCardTextEditor({
                    ...cardTextEditor,
                    after: event.target.value,
                  })
                }
                placeholder="Ví dụ: trên kệ"
                value={cardTextEditor.after}
              />
            </label>
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="mb-1 text-[11px] font-bold uppercase text-slate-400">
                Xem thử
              </p>
              <p className="font-bold text-slate-900">
                {cardTextEditor.before}
                <span className="text-moss-700">{cardEditorSampleValue}</span>
                {cardTextEditor.after}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        bodyClassName="!p-3 sm:!p-4"
        contentClassName="!h-[min(92dvh,820px)]"
        open={Boolean(cardCodeEditor)}
        onClose={() => setCardCodeEditor(null)}
        size="wide"
        title={`IDE card ${preview === "pos" ? "POS" : "dùng chung"}`}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button onClick={() => setCardCodeEditor(null)} variant="secondary">
              Hủy
            </Button>
            <Button onClick={saveCardCodeEditor}>Áp dụng toàn bộ card</Button>
          </div>
        }
      >
        {cardCodeEditor ? (
          <div className="grid h-full min-h-[420px] gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-inner">
              <div className="flex flex-none items-center justify-between gap-3 border-b border-slate-700 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <strong className="ml-2 text-xs text-slate-300">
                    {cardCodeEditor.activeTab === "html"
                      ? "Card.tsx"
                      : "Card.css"}
                  </strong>
                </div>
                <button
                  className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700"
                  onClick={() => {
                    const defaults = getDefaultCardCode(
                      preview === "pos" ? "pos" : "card",
                    );
                    setCardCodeEditor({
                      ...cardCodeEditor,
                      error: "",
                      html: defaults.html,
                      css: defaults.css,
                    });
                  }}
                  type="button"
                >
                  Khôi phục mẫu
                </button>
              </div>
              <div className="grid flex-none grid-cols-2 border-b border-slate-700 bg-slate-900 p-1">
                {(["html", "css"] as const).map((tab) => (
                  <button
                    className={`rounded-lg px-3 py-2 text-xs font-black transition ${cardCodeEditor.activeTab === tab ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
                    key={tab}
                    onClick={() =>
                      setCardCodeEditor({
                        ...cardCodeEditor,
                        activeTab: tab,
                        error: "",
                      })
                    }
                    type="button"
                  >
                    {tab === "html" ? "TSX / HTML" : "CSS"}
                  </button>
                ))}
              </div>
              <div className="flex flex-none items-center gap-2 border-b border-slate-700 bg-slate-900 px-2 py-2">
                <select
                  aria-label="Chọn mẫu card đã lưu"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs font-bold text-slate-200 outline-none focus:border-moss-400"
                  defaultValue=""
                  onChange={(event) => {
                    const template = previewCard.templates?.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!template) return;
                    setCardCodeEditor({
                      ...cardCodeEditor,
                      error: "",
                      html: template.html,
                      css: template.css,
                    });
                    event.target.value = "";
                  }}
                >
                  <option value="">
                    {previewCard.templates?.length
                      ? `Mẫu đã lưu (${previewCard.templates.length})`
                      : "Chưa có mẫu đã lưu"}
                  </option>
                  {previewCard.templates?.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  className="h-9 shrink-0 rounded-lg bg-moss-700 px-3 text-xs font-black text-white transition hover:bg-moss-800"
                  onClick={() =>
                    setCardCodeEditor({
                      ...cardCodeEditor,
                      error: "",
                      saveTemplateOpen: !cardCodeEditor.saveTemplateOpen,
                    })
                  }
                  type="button"
                >
                  Lưu mẫu mới
                </button>
              </div>
              {cardCodeEditor.saveTemplateOpen ? (
                <div className="flex flex-none gap-2 border-b border-slate-700 bg-slate-900 px-2 pb-2">
                  <input
                    autoFocus
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-moss-400"
                    onChange={(event) =>
                      setCardCodeEditor({
                        ...cardCodeEditor,
                        error: "",
                        templateName: event.target.value,
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") saveCurrentCardTemplate();
                    }}
                    placeholder="Tên mẫu, ví dụ: Card tối giản"
                    value={cardCodeEditor.templateName}
                  />
                  <button
                    className="h-9 rounded-lg bg-white px-3 text-xs font-black text-slate-950"
                    onClick={saveCurrentCardTemplate}
                    type="button"
                  >
                    Lưu
                  </button>
                </div>
              ) : null}
              <textarea
                aria-label={
                  cardCodeEditor.activeTab === "html"
                    ? "Mã TSX hoặc HTML của toàn bộ card"
                    : "Mã CSS của toàn bộ card"
                }
                autoFocus
                className={`min-h-0 flex-1 resize-none bg-slate-950 p-4 font-mono text-[13px] leading-6 outline-none selection:bg-moss-700 ${cardCodeEditor.activeTab === "html" ? "text-emerald-300" : "text-sky-300"}`}
                onChange={(event) =>
                  setCardCodeEditor({
                    ...cardCodeEditor,
                    error: "",
                    [cardCodeEditor.activeTab]: event.target.value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key !== "Tab") return;
                  event.preventDefault();
                  const target = event.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const currentValue =
                    cardCodeEditor[cardCodeEditor.activeTab];
                  const value = `${currentValue.slice(0, start)}  ${currentValue.slice(end)}`;
                  setCardCodeEditor({
                    ...cardCodeEditor,
                    error: "",
                    [cardCodeEditor.activeTab]: value,
                  });
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  });
                }}
                spellCheck={false}
                value={cardCodeEditor[cardCodeEditor.activeTab]}
              />
              <div className="flex-none border-t border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold">
                {cardCodeEditor.error ? (
                  <span className="text-red-300">{cardCodeEditor.error}</span>
                ) : (
                  <span className="text-slate-400">
                    Dùng biến như {"{{name}}"}, {"{{price}}"},{" "}
                    {"{{image_url}}"}, {"{{shelf_stock_text}}"} và{" "}
                    {"{{attributes}}"}.
                  </span>
                )}
              </div>
            </div>
            <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-3 text-center text-xs font-extrabold text-slate-500">
                Xem trước trực tiếp · {preview === "pos" ? "Card POS" : "Card chung"}
              </p>
              {previewProduct ? (
                <ProductCardCodeRenderer
                  customAttributes={draft.customAttributes}
                  mode={preview === "pos" ? "pos" : "card"}
                  product={previewProduct}
                  quantity={0}
                  settings={{
                    ...effectivePreviewCard,
                    templateHtml: cardCodeEditor.html,
                    templateCss: cardCodeEditor.css,
                  }}
                />
              ) : (
                <p className="rounded-xl bg-white p-4 text-center text-xs font-semibold text-slate-500">
                  Cần ít nhất một sản phẩm để xem dữ liệu mẫu.
                </p>
              )}
            </aside>
            </div>
        ) : null}
      </Modal>

      <Modal
        open={linkOpen}
        onClose={closeVariants}
        size="sm"
        title="Các biến thể"
        footer={
          <div className="flex w-full justify-end">
            <Button disabled={saving} onClick={() => void onSave(draft)}>
              {saving ? "Đang lưu..." : "Lưu biến thể"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl bg-moss-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm text-moss-900">
                Thư viện biến thể
              </strong>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-moss-800">
                {draft.customAttributes.length} biến thể
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold text-moss-700">
              Tạo các mẫu như Màu sắc, Dung lượng hoặc Chất liệu để dùng lại cho
              từng sản phẩm.
            </p>
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-moss-400 bg-white p-3 text-sm font-extrabold text-moss-800 transition hover:bg-moss-50"
            onClick={() => openEditor()}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Thêm biến thể
          </button>
          {draft.customAttributes.length ? (
            draft.customAttributes.map((attribute) => {
              return (
                <div
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  key={attribute.id}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-slate-950">
                      {attribute.name}
                    </strong>
                    <small className="font-semibold text-slate-500">
                      {attributeTypeLabels[attribute.type]}
                    </small>
                  </span>
                  <Button
                    aria-label="Sửa biến thể"
                    onClick={() => openEditor(attribute.id)}
                    variant="secondary"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label="Xóa biến thể"
                    onClick={() => deleteAttribute(attribute.id)}
                    variant="danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">
              Chưa có biến thể. Nhấn “Thêm biến thể” để bắt đầu.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        size="md"
        title={editor?.id ? "Sửa biến thể" : "Thêm biến thể"}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {editor?.id ? (
              <Button
                onClick={() => deleteAttribute(editor.id!)}
                variant="danger"
              >
                <Trash2 className="h-4 w-4" />
                Xóa
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button onClick={() => setEditor(null)} variant="secondary">
                Hủy
              </Button>
              <Button onClick={saveEditor}>Lưu biến thể</Button>
            </div>
          </div>
        }
      >
        {editor ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-moss-100 bg-moss-50 p-3">
              <p className="text-sm font-extrabold text-moss-900">
                {editor.id ? "Cập nhật mẫu biến thể" : "Tạo mẫu biến thể mới"}
              </p>
              <p className="mt-1 text-xs font-semibold text-moss-700">
                Mẫu đã lưu có thể chọn lại khi thêm hoặc sửa bất kỳ sản phẩm
                nào.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                autoFocus
                label="Tên biến thể"
                placeholder="Ví dụ: Màu sắc, Dung lượng"
                value={editor.name}
                onChange={(event) =>
                  setEditor({ ...editor, name: event.target.value })
                }
              />
              <label className="block text-sm font-bold">
                Kiểu nhập dữ liệu
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
                  value={editor.type}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      type: event.target.value as CustomAttributeType,
                      options:
                        event.target.value === "single" ||
                        event.target.value === "multiple"
                          ? editor.options
                          : [],
                    })
                  }
                >
                  <option value="text">Văn bản</option>
                  <option value="number">Số</option>
                  <option value="date">Ngày tháng năm</option>
                  <option value="single">Chọn duy nhất</option>
                  <option value="multiple">Chọn nhiều</option>
                  <option value="media">Hình ảnh & video</option>
                </select>
              </label>
            </div>
            {editor.type === "single" || editor.type === "multiple" ? (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                <div className="mb-4">
                  <label className="block text-sm font-extrabold">
                    Kiểu hiển thị lựa chọn
                    <select
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-semibold outline-none focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          optionDisplay: event.target.value as
                            | "color"
                            | "text"
                            | "both",
                        })
                      }
                      value={editor.optionDisplay}
                    >
                      <option value="text">Chữ</option>
                      <option value="color">Màu</option>
                      <option value="both">Cả hai</option>
                    </select>
                  </label>
                </div>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-extrabold">Các lựa chọn</p>
                    <p className="text-xs font-semibold text-slate-500">
                      Nhập dữ liệu theo kiểu hiển thị đã chọn ở trên.
                    </p>
                  </div>
                  <Button
                    aria-label="Thêm lựa chọn"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        options: [
                          ...editor.options,
                          {
                            id: crypto.randomUUID(),
                            label: "",
                            color: "#5f744b",
                            useColor: false,
                          },
                        ],
                      })
                    }
                    variant="secondary"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {editor.options.map((option, index) => (
                    <div
                      className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
                      key={option.id}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-500">
                        {index + 1}
                      </span>
                      {editor.optionDisplay !== "text" ? (
                        <label
                          className="relative h-10 w-10 shrink-0 cursor-pointer rounded-full border-[3px] border-white shadow-sm ring-1 ring-slate-300 transition hover:scale-105 hover:ring-moss-500"
                          style={{ backgroundColor: option.color }}
                          title={`Màu ${option.color.toUpperCase()}`}
                        >
                          <input
                            aria-label={`Chọn màu cho lựa chọn ${index + 1}`}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            type="color"
                            value={option.color}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                options: editor.options.map((item) =>
                                  item.id === option.id
                                    ? { ...item, color: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      ) : null}
                      {editor.optionDisplay !== "color" ? (
                        <input
                          aria-label={`Chữ cho lựa chọn ${index + 1}`}
                          autoFocus={index === editor.options.length - 1}
                          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-moss-500 focus:ring-2 focus:ring-moss-100"
                          placeholder="Nhập nội dung lựa chọn"
                          value={option.label}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              options: editor.options.map((item) =>
                                item.id === option.id
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      ) : null}
                      <Button
                        aria-label="Xóa lựa chọn"
                        className="h-10 w-10 shrink-0 p-0"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            options: editor.options.filter(
                              (item) => item.id !== option.id,
                            ),
                          })
                        }
                        variant="danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {editor.options.length === 0 ? (
                  <button
                    className="w-full rounded-xl border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-500"
                    onClick={() =>
                      setEditor({
                        ...editor,
                        options: [
                          {
                            id: crypto.randomUUID(),
                            label: "",
                            color: "#5f744b",
                            useColor: false,
                          },
                        ],
                      })
                    }
                    type="button"
                  >
                    + Thêm lựa chọn đầu tiên
                  </button>
                ) : null}
              </section>
            ) : null}
            {editorError ? (
              <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
                {editorError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function PreviewBlock({
  blockKey,
  label,
  product,
  attributes,
  enabled,
  definition,
  mode,
}: {
  blockKey: string;
  label: string;
  product: Product | null;
  attributes: Record<string, unknown>;
  enabled: ProductSettings["card"];
  definition?: ProductSettings["customAttributes"][number];
  mode: "card" | "pos";
}) {
  if (!enabled.visibleFields.includes(blockKey)) return null;
  const renderText = (value: string) =>
    enabled.textTemplates?.[blockKey]?.split("{value}").join(value) ?? value;
  if (blockKey === "image")
    return (
      <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
        {product?.image_url ? (
          <img
            alt={product.name}
            className={`h-full w-full ${enabled.imageFit === "contain" ? "object-contain" : "object-cover"}`}
            src={product.image_url}
          />
        ) : (
          <NoImagePlaceholder compact />
        )}
      </div>
    );
  if (blockKey === "name")
    return (
      <div className="px-2 pt-2 text-sm font-black">
        {renderText(product?.name ?? "Tên sản phẩm")}
      </div>
    );
  if (blockKey === "price")
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <strong className="text-sm font-black">
          {renderText(formatCurrency(product?.price ?? 20000))}
        </strong>
        {mode === "pos" ? (
          <span className="flex items-center gap-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border">
              <Minus className="h-3 w-3" />
            </span>
            <b className="text-xs">0</b>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-moss-800 text-white">
              <Plus className="h-3 w-3" />
            </span>
          </span>
        ) : null}
      </div>
    );
  const standard = product
    ? (product as unknown as Record<string, unknown>)[blockKey]
    : undefined;
  const raw = standard ?? attributes[blockKey];
  if (definition?.type === "single")
    return (
      <div className="px-2 py-2">
        <p className="mb-1 text-[10px] font-bold text-slate-600">
          {renderText(label)}
        </p>
        <div
          className={
            definition.optionDisplay === "color"
              ? "flex flex-wrap gap-1.5"
              : "space-y-1"
          }
        >
          {definition.options.map((option, index) => (
            <span
              className={`flex items-center gap-1.5 text-[9px] font-semibold ${definition.optionDisplay === "color" ? "inline-flex" : "w-full text-slate-700"}`}
              key={option}
            >
              <i
                className={`h-7 w-7 rounded-full border-2 p-0.5 ${index === 0 ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-600"}`}
                style={{
                  backgroundColor:
                    definition.optionColors?.[option] ?? "transparent",
                }}
              />
              {definition.optionDisplay === "color" ? null : option}
            </span>
          ))}
        </div>
      </div>
    );
  if (definition?.type === "multiple")
    return (
      <div className="px-2 py-1 text-[10px] font-bold text-slate-600">
        <p className="mb-1">{renderText(label)}</p>
        <div
          className={
            definition.optionDisplay === "color"
              ? "flex flex-wrap gap-1.5"
              : "space-y-1"
          }
        >
          {definition.options.map((option) => {
            const selected = Array.isArray(raw) && raw.includes(option);
            return (
              <span
                className={`flex items-center gap-1.5 ${definition.optionDisplay === "color" ? "inline-flex" : "w-full"} ${selected ? "text-slate-900" : "text-slate-400"}`}
                key={option}
              >
                {definition.optionDisplay !== "text" ? (
                  <i
                    className={`h-4 w-4 rounded-full border-2 ${selected ? "border-moss-600 ring-1 ring-moss-500" : "border-slate-300"}`}
                    style={{
                      backgroundColor:
                        definition.optionColors?.[option] ?? option,
                    }}
                  />
                ) : null}
                {definition.optionDisplay !== "color" ? option : null}
              </span>
            );
          })}
        </div>
      </div>
    );
  if (definition?.type === "media") {
    const media =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as { images?: string[]; video?: string })
        : {};
    return (
      <div className="px-2 py-1">
        <p className="text-[10px] font-bold text-slate-600">
          {renderText(label)}
        </p>
        <div className="relative mt-1 aspect-square overflow-hidden rounded-lg bg-slate-100">
          {media.images?.[0] ? (
            <img
              alt={label}
              className={`h-full w-full ${enabled.imageFit === "contain" ? "object-contain" : "object-cover"}`}
              src={media.images[0]}
            />
          ) : media.video ? (
            <video
              className="h-full w-full object-cover"
              muted
              src={media.video}
            />
          ) : (
            <NoImagePlaceholder compact />
          )}
          {(media.images?.length ?? 0) > 1 || media.video ? (
            <span className="absolute bottom-1 right-1 rounded-full bg-slate-950/80 px-2 py-1 text-[8px] font-bold text-white">
              {media.images?.length ?? 0} ảnh{media.video ? " + video" : ""}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  const value =
    blockKey === "cost_price"
      ? formatCurrency(Number(raw ?? 0))
      : blockKey === "shelf_stock"
        ? renderText(String(raw ?? 20))
        : blockKey === "is_active"
          ? raw === false
            ? "Đang ẩn"
            : "Đang bán"
          : blockKey === "is_reward"
            ? raw
              ? "Có"
              : "Không"
            : Array.isArray(raw)
              ? raw.join(", ")
              : String(raw ?? label);
  return (
    <div className="px-2 py-1 text-[10px] font-semibold text-slate-500">
      {enabled.textTemplates?.[blockKey] ? null : `${label}: `}
      <strong className="text-slate-800">
        {enabled.textTemplates?.[blockKey] && blockKey !== "shelf_stock"
          ? renderText(String(value))
          : value}
      </strong>
    </div>
  );
}
