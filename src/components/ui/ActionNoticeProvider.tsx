import { useCallback, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  ActionNoticeContext,
  type ActionNotice,
} from "../../contexts/ActionNoticeContext";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ActionNoticeProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const clearActionNotice = useCallback(() => setNotice(null), []);
  const showSuccess = useCallback(
    (message: string, title = "Thao tác thành công") =>
      setNotice({ message, title }),
    [],
  );
  const value = useMemo(
    () => ({ clearActionNotice, showSuccess }),
    [clearActionNotice, showSuccess],
  );

  return (
    <ActionNoticeContext.Provider value={value}>
      {children}
      <Modal
        footer={
          <Button className="w-full sm:w-auto sm:min-w-28" onClick={clearActionNotice}>
            Xong
          </Button>
        }
        onClose={clearActionNotice}
        open={Boolean(notice)}
        size="sm"
        title={notice?.title ?? "Thao tác thành công"}
        zIndex={200}
      >
        {notice ? (
          <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <p className="min-w-0 self-center text-sm font-extrabold leading-6">
              {notice.message}
            </p>
          </div>
        ) : null}
      </Modal>
    </ActionNoticeContext.Provider>
  );
}
