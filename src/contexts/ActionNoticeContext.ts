import { createContext, useContext } from "react";

export type ActionNotice = {
  message: string;
  title: string;
};

export type ActionDialogOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
  message: string;
  title: string;
  tone?: "default" | "danger" | "success";
};

export type ActionPromptOptions = ActionDialogOptions & {
  initialValue?: string;
  inputLabel?: string;
  placeholder?: string;
  required?: boolean;
};

export type ActionNoticeContextValue = {
  alertAction: (options: ActionDialogOptions) => Promise<void>;
  clearActionNotice: () => void;
  confirmAction: (options: ActionDialogOptions) => Promise<boolean>;
  promptAction: (options: ActionPromptOptions) => Promise<string | null>;
  showSuccess: (message: string, title?: string) => void;
};

export const ActionNoticeContext =
  createContext<ActionNoticeContextValue | null>(null);

export function useActionNotice() {
  const context = useContext(ActionNoticeContext);
  if (!context) {
    throw new Error("useActionNotice must be used inside ActionNoticeProvider.");
  }
  return context;
}
