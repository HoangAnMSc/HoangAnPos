import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import { Input } from "./Input";

type PageContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  maxWidth?: "5xl" | "6xl" | "7xl" | "none";
};

const maxWidthClassNames = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  none: "max-w-none",
};

export function PageContainer({
  children,
  className,
  maxWidth = "none",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={clsx(
        "mx-auto w-full space-y-5 px-4 pb-10 sm:px-6 lg:px-8",
        maxWidthClassNames[maxWidth],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type PageToolbarProps = {
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  title: string;
};

export function PageToolbar({
  action,
  children,
  className,
  description,
  eyebrow,
  title,
}: PageToolbarProps) {
  return (
    <section className={clsx("rounded-2xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-bold uppercase tracking-wider text-moss-700">{eyebrow}</p>
          ) : null}
          <h2 className={clsx("font-display text-xl font-bold text-coal", eyebrow && "mt-1")}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-coal/60">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

type SearchInputProps = {
  className?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export function SearchInput({
  className,
  onChange,
  placeholder,
  value,
}: SearchInputProps) {
  return (
    <div className={clsx("relative w-full", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/40"
      />
      <Input
        aria-label={placeholder}
        className="h-11 py-2 pl-11"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  );
}

type StateNoticeProps = {
  icon?: LucideIcon;
  message: string;
  tone?: "error" | "success" | "warning";
};

const noticeClassNames = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-moss-200 bg-moss-50 text-moss-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

export function StateNotice({ icon: Icon, message, tone = "error" }: StateNoticeProps) {
  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
        noticeClassNames[tone]
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {Icon ? <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <p>{message}</p>
    </div>
  );
}
