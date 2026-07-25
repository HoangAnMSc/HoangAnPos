import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function EmptyState({ description, icon: Icon, title }: EmptyStateProps) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
      <div className="mb-4 rounded-2xl bg-moss-100 p-4 text-moss-700">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="font-display text-xl font-bold text-coal">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-coal/60">{description}</p>
    </div>
  );
}
