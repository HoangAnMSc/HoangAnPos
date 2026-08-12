import { Loader2 } from "lucide-react";

export function Spinner({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 text-center text-sm font-bold text-coal/60"
      role="status"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-moss-50 text-moss-700 ring-1 ring-moss-100">
        <Loader2 className="h-5 w-5 animate-spin" />
      </span>
      <span>{label}</span>
    </div>
  );
}
