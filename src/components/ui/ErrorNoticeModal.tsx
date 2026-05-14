import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export type ErrorNotice = {
  detail?: string;
  message: string;
  title?: string;
};

type ErrorNoticeModalProps = {
  actionLabel?: string;
  notice: ErrorNotice | null;
  onClose: () => void;
};

export function ErrorNoticeModal({
  actionLabel = "Da hieu",
  notice,
  onClose,
}: ErrorNoticeModalProps) {
  return (
    <Modal
      footer={
        <Button className="w-full sm:w-auto sm:min-w-28" onClick={onClose}>
          {actionLabel}
        </Button>
      }
      onClose={onClose}
      open={Boolean(notice)}
      size="sm"
      title={notice?.title ?? "Thong bao loi"}
    >
      {notice ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-red-700">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white text-red-600 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-red-800">{notice.message}</p>
              {notice.detail ? (
                <p className="mt-2 text-sm font-semibold leading-6 text-red-700/80">
                  {notice.detail}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
