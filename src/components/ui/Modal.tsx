import { X } from "lucide-react";
import { clsx } from "clsx";

type ModalSize = "sm" | "md" | "lg" | "xl" | "wide";

type ModalProps = {
  bodyClassName?: string;
  children: React.ReactNode;
  contentClassName?: string;
  footer?: React.ReactNode;
  open: boolean;
  size?: ModalSize;
  title: string;
  onClose: () => void;
};

const sizeClassNames: Record<ModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  wide: "sm:max-w-6xl",
};

export function Modal({
  bodyClassName,
  children,
  contentClassName,
  footer,
  onClose,
  open,
  size = "lg",
  title,
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={clsx(
          "flex h-[calc(100dvh-3.5rem)] w-full flex-col overflow-hidden rounded-t-[1.5rem] bg-white text-slate-950 shadow-2xl sm:h-auto sm:max-h-[86vh] sm:rounded-[2rem]",
          sizeClassNames[size],
          contentClassName
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-slate-200 sm:hidden" />
        <header className="flex flex-none items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-8 sm:py-7">
          <h2 className="min-w-0 truncate text-base font-extrabold text-slate-950 sm:text-2xl">
            {title}
          </h2>
          <button
            aria-label="Dong popup"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-slate-950 transition hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className={clsx("min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-7", bodyClassName)}>
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-none items-center justify-end gap-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-8 sm:py-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
