import { createContext, useContext } from "react";

export type ActionNotice = {
  message: string;
  title: string;
};

export type ActionNoticeContextValue = {
  clearActionNotice: () => void;
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
