import { Boxes } from "lucide-react";
import type { ReactNode } from "react";
import type { VariantDisplayValue } from "../../features/products/types";

type InventoryProductRowProps = {
  name: string;
  variantValues?: VariantDisplayValue[];
  ean13?: string | null;
  imageUrl?: string | null;
  children: ReactNode;
  meta?: ReactNode;
};

export function InventoryProductRow({ name, variantValues, ean13, imageUrl, children, meta }: InventoryProductRowProps) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-2.5">
      <span className="grid h-16 w-11 place-items-center overflow-hidden rounded-lg text-slate-400 sm:w-12">
        {imageUrl ? <img alt="" className="h-full w-full object-contain" src={imageUrl} /> : <Boxes className="h-7 w-7" />}
      </span>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_64px] items-start gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_80px] sm:gap-x-2.5">
        <p className="col-span-2 min-w-0 text-sm font-bold leading-5 text-slate-950 [overflow-wrap:break-word]">{name}</p>
        <div className="min-w-0 space-y-1">
          {variantValues?.length ? <div className="flex min-w-0 flex-wrap gap-1">
            {variantValues.map((value) => <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-moss-100 px-1.5 py-0.5 text-xs font-bold leading-4 text-moss-900" key={value.id}>
              {value.color ? <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: value.color }} /> : null}
              <span className="min-w-0 [overflow-wrap:break-word]">{value.label}</span>
            </span>)}
          </div> : null}
          <p className="text-[11px] font-medium leading-4 text-slate-500">EAN-13: <span className="whitespace-nowrap tabular-nums">{ean13 || "Chưa có mã"}</span></p>
          {meta}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
