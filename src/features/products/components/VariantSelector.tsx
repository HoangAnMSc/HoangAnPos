import type {
  ProductVariant,
  VariantAttribute,
  VariantSelection,
} from "../types";
import { formatVariantValueLabel, isVariantValueAvailable } from "../utils/variants";

type Props = {
  attribute: VariantAttribute;
  selection: VariantSelection;
  variants: ProductVariant[];
  onChange: (attributeId: string, valueId: string) => void;
};

export function VariantSelector({
  attribute,
  onChange,
  selection,
  variants,
}: Props) {
  const values = attribute.values.filter((value) => value.is_active);
  const selected = selection[attribute.id];
  if (attribute.display_type === "dropdown")
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-bold">{attribute.name}</span>
        <select
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-moss-600 focus:ring-2 focus:ring-moss-100 sm:text-sm"
          value={selected ?? ""}
          onChange={(event) => onChange(attribute.id, event.target.value)}
        >
          <option value="">Chọn {attribute.name}</option>
          {values.map((value) => (
            <option
              disabled={
                !isVariantValueAvailable(
                  variants,
                  selection,
                  attribute.id,
                  value.id,
                )
              }
              key={value.id}
              value={value.id}
            >
              {formatVariantValueLabel(value.label, attribute.unit)}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold">{attribute.name}</legend>
      <div className="scrollbar-none flex flex-wrap gap-2">
        {values.map((value) => {
          const available = isVariantValueAvailable(
            variants,
            selection,
            attribute.id,
            value.id,
          );
          const active = selected === value.id;
          const content =
            attribute.display_type === "color_circle" ? (
              <span
                aria-label={value.label}
                className="block h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-slate-300"
                style={{ backgroundColor: value.metadata.hex || value.value }}
              />
            ) : attribute.display_type === "image" ||
              attribute.display_type === "image_text" ? (
              <>
                <span className="flex h-16 w-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {value.metadata.image_url ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={value.metadata.image_url}
                    />
                  ) : (
                    "Ảnh"
                  )}
                </span>
                {attribute.display_type === "image_text" ? (
                  <span className="text-xs font-bold">
                    {formatVariantValueLabel(value.label, attribute.unit)}
                  </span>
                ) : null}
              </>
            ) : (
              <span>{formatVariantValueLabel(value.label, attribute.unit)}</span>
            );
          return (
            <button
              aria-pressed={active}
              className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 transition ${active ? "border-moss-700 bg-moss-50 ring-2 ring-moss-200" : "border-slate-200 bg-white hover:border-slate-400"} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-35`}
              disabled={!available}
              key={value.id}
              onClick={() => onChange(attribute.id, value.id)}
              type="button"
            >
              {content}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
