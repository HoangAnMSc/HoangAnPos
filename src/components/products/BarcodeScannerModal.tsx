import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Camera, Keyboard } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

type BarcodeScannerModalProps = {
  description?: string;
  open: boolean;
  title?: string;
  onClose: () => void;
  onDetected: (value: string) => void;
};

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

const barcodeFormats = [
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "itf",
  "qr_code",
  "upc_a",
  "upc_e",
];

function getBarcodeDetector() {
  return (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
}

export function BarcodeScannerModal({
  description = "Dua ma vach vao khung camera hoac nhap ma thu cong.",
  onClose,
  onDetected,
  open,
  title = "Quet barcode",
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("Dang khoi dong camera...");
  const [error, setError] = useState("");

  const submitCode = useCallback((value: string) => {
    const code = value.trim();

    if (!code) {
      return;
    }

    onDetected(code);
    setManualCode("");
    onClose();
  }, [onClose, onDetected]);

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCode(manualCode);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    let animationId = 0;
    let stopped = false;
    let stream: MediaStream | null = null;
    let videoElement: HTMLVideoElement | null = null;

    async function startScanner() {
      setError("");
      setStatus("Dang khoi dong camera...");

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Trinh duyet khong ho tro camera.");
        setError("Hay nhap barcode thu cong ben duoi.");
        return;
      }

      const Detector = getBarcodeDetector();
      if (!Detector) {
        setStatus("Trinh duyet chua ho tro BarcodeDetector.");
        setError("Hay dung Chrome/Edge moi hoac nhap barcode thu cong.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });

        const video = videoRef.current;
        videoElement = video;
        if (!video || stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        const detector = new Detector({ formats: barcodeFormats });
        setStatus("Dang quet barcode...");

        async function scanFrame() {
          if (stopped || !videoElement) {
            return;
          }

          try {
            if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const barcodes = await detector.detect(videoElement);
              const value = barcodes[0]?.rawValue?.trim();

              if (value) {
                stopped = true;
                submitCode(value);
                return;
              }
            }
          } catch {
            setStatus("Khong doc duoc ma. Thu can lai barcode hoac nhap tay.");
          }

          animationId = window.requestAnimationFrame(scanFrame);
        }

        animationId = window.requestAnimationFrame(scanFrame);
      } catch {
        setStatus("Khong mo duoc camera.");
        setError("Kiem tra quyen camera hoac nhap barcode thu cong.");
      }
    }

    void startScanner();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(animationId);
      stream?.getTracks().forEach((track) => track.stop());

      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [open, submitCode]);

  return (
    <Modal
      footer={
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button onClick={onClose} variant="secondary">
            Dong
          </Button>
          <Button form="manual-barcode-form" type="submit">
            <Keyboard className="h-4 w-4" />
            Nhap ma
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      title={title}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          {description}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-950">
          <video
            className="h-full w-full object-cover"
            muted
            playsInline
            ref={videoRef}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-28 w-64 max-w-[78%] rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]" />
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-xs font-bold text-white">
            <Camera className="h-4 w-4" />
            {status}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            {error}
          </div>
        ) : null}

        <form className="space-y-2" id="manual-barcode-form" onSubmit={handleManualSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-slate-950">
              Barcode thu cong
            </span>
            <div className="relative">
              <Barcode className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoComplete="off"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pl-11 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Quet bang may quet USB hoac nhap ma"
                value={manualCode}
              />
            </div>
          </label>
        </form>
      </div>
    </Modal>
  );
}
