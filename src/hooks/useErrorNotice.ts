import { useCallback, useState } from "react";
import type { ErrorNotice } from "../components/ui/ErrorNoticeModal";

export function useErrorNotice(onShow?: (message: string) => void) {
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);

  const showErrorNotice = useCallback(
    (message: string, title = "Thông báo lỗi", detail?: string) => {
      onShow?.(message);
      setErrorNotice({ detail, message, title });
    },
    [onShow]
  );

  const clearErrorNotice = useCallback(() => {
    setErrorNotice(null);
  }, []);

  return {
    clearErrorNotice,
    errorNotice,
    setErrorNotice,
    showErrorNotice,
  };
}
