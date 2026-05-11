import { Loader2 } from "lucide-react";

export function Spinner({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-sm font-bold text-coal/60">
      <Loader2 className="h-5 w-5 animate-spin text-clay" />
      {label}
    </div>
  );
}
