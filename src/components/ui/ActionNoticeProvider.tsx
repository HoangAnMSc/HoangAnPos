import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, HelpCircle, TriangleAlert } from "lucide-react";
import {
  ActionNoticeContext,
  type ActionNotice,
  type ActionDialogOptions,
  type ActionPromptOptions,
} from "../../contexts/ActionNoticeContext";

type DisplayNotice = ActionNotice & { id: number };
type ActionDialog = ActionDialogOptions & {
  inputLabel?: string;
  kind: "alert" | "confirm" | "prompt";
  placeholder?: string;
  required?: boolean;
};

export function ActionNoticeProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<DisplayNotice | null>(null);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [dialogError, setDialogError] = useState("");
  const nextNoticeId = useRef(0);
  const dialogResolver = useRef<((value: boolean | string | null) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearActionNotice = useCallback(() => setNotice(null), []);
  const showSuccess = useCallback(
    (message: string, title = "Thành công") => {
      nextNoticeId.current += 1;
      setNotice({ id: nextNoticeId.current, message, title });
    },
    [],
  );
  const closeDialog = useCallback((value: boolean | string | null) => {
    dialogResolver.current?.(value);
    dialogResolver.current = null;
    setDialog(null);
    setDialogInput("");
    setDialogError("");
  }, []);
  const confirmAction = useCallback((options: ActionDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      dialogResolver.current = resolve as (value: boolean | string | null) => void;
      setDialog({ ...options, kind: "confirm" });
      setDialogInput("");
      setDialogError("");
    });
  }, []);
  const promptAction = useCallback((options: ActionPromptOptions) => {
    return new Promise<string | null>((resolve) => {
      dialogResolver.current = resolve as (value: boolean | string | null) => void;
      setDialog({ ...options, kind: "prompt" });
      setDialogInput(options.initialValue ?? "");
      setDialogError("");
    });
  }, []);
  const alertAction = useCallback((options: ActionDialogOptions) => {
    return new Promise<void>((resolve) => {
      dialogResolver.current = () => resolve();
      setDialog({ ...options, kind: "alert" });
      setDialogInput("");
      setDialogError("");
    });
  }, []);
  const value = useMemo(
    () => ({ alertAction, clearActionNotice, confirmAction, promptAction, showSuccess }),
    [alertAction, clearActionNotice, confirmAction, promptAction, showSuccess],
  );

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearActionNotice, 2200);
    return () => window.clearTimeout(timeout);
  }, [clearActionNotice, notice]);

  useEffect(() => {
    if (!dialog) return;
    if (dialog.kind === "prompt") window.setTimeout(() => inputRef.current?.focus(), 50);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog(dialog.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, dialog]);

  function submitDialog() {
    if (!dialog) return;
    if (dialog.kind === "prompt") {
      const value = dialogInput.trim();
      if (dialog.required !== false && !value) {
        setDialogError("Vui lòng nhập thông tin trước khi tiếp tục.");
        inputRef.current?.focus();
        return;
      }
      closeDialog(value);
      return;
    }
    closeDialog(true);
  }

  const dialogTone = dialog?.tone ?? "default";
  const DialogIcon = dialogTone === "danger" ? TriangleAlert : dialogTone === "success" ? CheckCircle2 : HelpCircle;
  const iconStyle = dialogTone === "danger"
    ? "bg-red-100 text-red-600 ring-red-50"
    : dialogTone === "success"
      ? "bg-moss-100 text-moss-700 ring-moss-50"
      : "bg-slate-100 text-slate-700 ring-slate-50";
  const confirmStyle = dialogTone === "danger"
    ? "bg-red-600 text-white hover:bg-red-700"
    : dialogTone === "success"
      ? "bg-moss-700 text-white hover:bg-moss-800"
      : "bg-coal text-white hover:bg-ink";

  return (
    <ActionNoticeContext.Provider value={value}>
      {children}
      {notice ? createPortal(
        <div aria-live="polite" className="pointer-events-none fixed inset-0 z-[300] grid place-items-center p-5" role="status">
          <div className="action-notice-card flex w-full max-w-sm flex-col items-center rounded-3xl bg-white px-7 py-6 text-center shadow-[0_24px_70px_rgba(15,23,42,0.22)] ring-1 ring-slate-200" key={notice.id}>
            <span className="action-notice-ring relative grid h-16 w-16 place-items-center rounded-full bg-moss-100 ring-8 ring-moss-50">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-moss-500 shadow-[0_6px_18px_rgba(105,122,77,0.4)]">
                <svg aria-hidden="true" className="action-notice-check h-7 w-7" fill="none" viewBox="0 0 56 56">
                  <path d="M15 29.5 24 38l17-20" pathLength="1" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
                </svg>
              </span>
            </span>
            <p className="mt-4 text-base font-black text-slate-950">{notice.title}</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{notice.message}</p>
          </div>
        </div>,
        document.body,
      ) : null}
      {dialog ? createPortal(
        <div
          aria-labelledby="action-dialog-title"
          aria-modal="true"
          className="action-dialog-overlay fixed inset-0 z-[310] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
          role="dialog"
        >
          <form
            className="action-dialog-card max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto overflow-x-hidden rounded-3xl bg-white shadow-[0_28px_90px_rgba(15,23,42,0.32)] ring-1 ring-white/70"
            onSubmit={(event) => { event.preventDefault(); submitDialog(); }}
          >
            <div className="flex flex-col items-center px-6 pb-5 pt-7 text-center">
              <span className={`grid h-14 w-14 place-items-center rounded-full ring-8 ${iconStyle}`}>
                <DialogIcon className="h-7 w-7" strokeWidth={2.4} />
              </span>
              <h2 className="mt-5 max-w-full break-words text-lg font-black text-slate-950 [overflow-wrap:anywhere]" id="action-dialog-title">{dialog.title}</h2>
              <p className={`mt-2 max-w-full whitespace-pre-wrap break-all text-sm font-semibold leading-6 text-slate-600 ${dialogTone === "danger" ? "w-full rounded-xl bg-red-50 px-3 py-2.5 text-left text-red-700" : "text-center"}`}>{dialog.message}</p>
              {dialog.kind === "prompt" ? (
                <label className="mt-5 block w-full text-left">
                  <span className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    {dialog.inputLabel ?? "Thông tin"}
                  </span>
                  <input
                    className={`h-12 w-full rounded-xl border bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none transition focus:bg-white focus:ring-4 ${dialogError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-200 focus:border-moss-500 focus:ring-moss-100"}`}
                    onChange={(event) => { setDialogInput(event.target.value); setDialogError(""); }}
                    placeholder={dialog.placeholder}
                    ref={inputRef}
                    value={dialogInput}
                  />
                  {dialogError ? <span className="mt-2 block text-xs font-bold text-red-600">{dialogError}</span> : null}
                </label>
              ) : null}
            </div>
            <div className={`grid gap-2 border-t border-slate-100 bg-slate-50/70 p-3 ${dialog.kind === "alert" ? "grid-cols-1" : "grid-cols-2"}`}>
              {dialog.kind !== "alert" ? <button
                  className="h-12 rounded-xl bg-white text-sm font-extrabold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                  onClick={() => closeDialog(dialog.kind === "confirm" ? false : null)}
                  type="button"
                >
                  {dialog.cancelLabel ?? "Hủy"}
                </button> : null}
              <button className={`h-12 rounded-xl text-sm font-extrabold shadow-sm transition ${confirmStyle}`} type="submit">
                {dialog.confirmLabel ?? (dialog.kind === "alert" ? "Đã hiểu" : "Xác nhận")}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      ) : null}
    </ActionNoticeContext.Provider>
  );
}
