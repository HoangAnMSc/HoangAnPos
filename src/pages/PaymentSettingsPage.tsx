import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ImagePlus, QrCode, Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { uploadPaymentQr } from "../lib/cloudinary";
import { fetchPaymentSettings, savePaymentSettings } from "../services/paymentSettings";

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function PaymentSettingsPage() {
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await fetchPaymentSettings();
      setNote(settings?.transfer_note ?? "");
      setQrUrl(settings?.transfer_qr_url ?? "");
      setQrPreview(settings?.transfer_qr_url ?? "");
    } catch (requestError) {
      setErrorNotice({
        message:
          requestError instanceof Error ? requestError.message : "Khong tai duoc cau hinh.",
        title: "Khong tai duoc cau hinh",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function handleFileChange(file: File | null) {
    setQrFile(file);

    if (!file) {
      setQrPreview(qrUrl);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setQrPreview(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess("");

    try {
      const nextQrUrl = qrFile ? await uploadPaymentQr(qrFile) : normalizeText(qrUrl);
      const settings = await savePaymentSettings({
        transfer_note: normalizeText(note),
        transfer_qr_url: nextQrUrl,
      });

      setQrFile(null);
      setQrUrl(settings.transfer_qr_url ?? "");
      setQrPreview(settings.transfer_qr_url ?? "");
      setNote(settings.transfer_note ?? "");
      setSuccess("Da luu cau hinh thanh toan.");
    } catch (requestError) {
      setErrorNotice({
        message:
          requestError instanceof Error ? requestError.message : "Luu cau hinh that bai.",
        title: "Luu cau hinh that bai",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <ConfigNotice />

        {success ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-700 shadow-sm">
            {success}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Dang tai cau hinh thanh toan..." />
          </div>
        ) : (
          <form
            className="grid gap-6 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-7"
            onSubmit={handleSubmit}
          >
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-coal/15 bg-slate-50 p-4 text-center transition hover:bg-slate-100">
                {qrPreview ? (
                  <img
                    alt="Ma nhan tien"
                    className="aspect-square w-full rounded-xl bg-white object-contain"
                    src={qrPreview}
                  />
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center rounded-xl bg-white text-slate-400">
                    <QrCode className="h-20 w-20" />
                    <span className="mt-3 px-4 text-sm font-bold">Chua co ma nhan tien</span>
                  </div>
                )}
                <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-coal px-4 py-2 text-sm font-extrabold text-white">
                  <ImagePlus className="h-4 w-4" />
                  Chon anh QR
                </span>
                <input
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
            </div>

            <div className="space-y-5">
              <Input
                label="Link anh QR"
                onChange={(event) => {
                  setQrUrl(event.target.value);
                  if (!qrFile) {
                    setQrPreview(event.target.value);
                  }
                }}
                placeholder="https://..."
                value={qrUrl}
              />
              <Textarea
                label="Thong tin hien kem ma"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Vi du: STK, ten chu tai khoan, noi dung chuyen khoan..."
                value={note}
              />
              <div className="flex justify-end">
                <Button className="min-w-36" isLoading={saving} type="submit">
                  <Save className="h-4 w-4" />
                  Luu cau hinh
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </div>
  );
}
