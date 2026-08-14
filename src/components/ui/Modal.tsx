import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";

type ModalSize = "sm" | "md" | "lg" | "xl" | "wide";

type ModalProps = {
  bodyClassName?: string;
  children: React.ReactNode;
  contentClassName?: string;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
  open: boolean;
  size?: ModalSize;
  title: string;
  onClose: () => void;
  zIndex?: number;
};

const sizeClassNames: Record<ModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  wide: "sm:max-w-6xl",
};

const openModalIds: symbol[] = [];
let originalBodyOverflow = "";
let nextModalLayer = 0;

function registerOpenModal(id: symbol) {
  openModalIds.push(id);
  if (openModalIds.length === 1) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  return () => {
    const index = openModalIds.lastIndexOf(id);
    if (index >= 0) openModalIds.splice(index, 1);
    if (openModalIds.length === 0) {
      document.body.style.overflow = originalBodyOverflow;
      nextModalLayer = 0;
    }
  };
}

export function Modal({
  bodyClassName,
  children,
  contentClassName,
  footer,
  headerAction,
  onClose,
  open,
  size = "lg",
  title,
  zIndex = 100,
}: ModalProps) {
  const modalId = useRef(Symbol("modal"));
  const layer = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  if (open && layer.current === null) {
    nextModalLayer += 1;
    layer.current = nextModalLayer;
  } else if (!open) {
    layer.current = null;
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const unregister = registerOpenModal(modalId.current);

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        openModalIds[openModalIds.length - 1] === modalId.current
      ) {
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unregister();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      aria-modal="true"
      className="fixed left-0 top-0 m-0 flex h-dvh w-screen items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      style={{ zIndex: zIndex + (layer.current ?? 0) }}
    >
      <div
        className={clsx(
          "flex h-[calc(100dvh-3.5rem)] w-full flex-col overflow-hidden rounded-t-[1.5rem] bg-white text-slate-950 shadow-2xl sm:h-auto sm:max-h-[86vh] sm:rounded-[2rem]",
          sizeClassNames[size],
          contentClassName,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-slate-200 sm:hidden" />
        <header className="flex flex-none items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-8 sm:py-7">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <h2 className="min-w-0 truncate text-base font-extrabold text-slate-950 sm:text-2xl">
              {title}
            </h2>
            {headerAction}
          </div>
          <button
            aria-label="Đóng cửa sổ"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-slate-950 transition hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-7",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-none items-center justify-end gap-3 overflow-x-auto border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:py-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
