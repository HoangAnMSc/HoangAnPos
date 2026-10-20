import { Boxes } from "lucide-react";
import type { ReactNode } from "react";
import type { VariantDisplayValue } from "../../features/products/types";

type WarehouseProductDetailsProps = {
  name: string;
  variantValues?: VariantDisplayValue[];
  ean13?: string | null;
  imageUrl?: string | null;
  children: ReactNode;
  meta?: ReactNode;
};

export function WarehouseProductDetails({ name, variantValues, ean13, imageUrl, children, meta }: WarehouseProductDetailsProps) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-2.5 sm:grid-cols-[48px_minmax(0,1fr)_80px] sm:gap-3">
      <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 sm:h-12 sm:w-12">
        {imageUrl ? <img alt="" className="h-full w-full object-contain p-1" src={imageUrl} /> : <Boxes className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5 text-slate-950 [overflow-wrap:anywhere]">{name}</p>
        {variantValues?.length ? <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
          {variantValues.map((value) => <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-moss-200 bg-moss-100/80 px-2 py-1 text-xs font-extrabold leading-4 text-moss-900" key={value.id}>
            {value.color ? <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: value.color }} /> : null}
            <span className="min-w-0 [overflow-wrap:anywhere]">{value.label}</span>
          </span>)}
        </div> : null}
        <p className="mt-1.5 text-[11px] font-medium tabular-nums leading-4 text-slate-500 [overflow-wrap:anywhere]">EAN-13: {ean13 || "Chưa có mã"}</p>
        {meta ? <div className="mt-1.5">{meta}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
