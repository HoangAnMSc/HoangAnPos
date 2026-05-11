import { X } from "lucide-react";
import { Button } from "./Button";

type ModalProps = {
  children: React.ReactNode;
  open: boolean;
  title: string;
  onClose: () => void;
};

export function Modal({ children, onClose, open, title }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-coal/45 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-cream p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-bold text-coal">{title}</h2>
          <Button aria-label="Đóng" className="h-10 w-10 p-0" onClick={onClose} variant="ghost">
            <X className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
