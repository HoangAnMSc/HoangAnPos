import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ImagePlus, QrCode, Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { ErrorNoticeModal, type ErrorNotice } from "../components/ui/ErrorNoticeModal";
import { Input } from "../components/ui/Input";
import { PageContainer, StateNotice } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import { uploadPaymentQr } from "../lib/cloudinary";
import { getErrorMessage } from "../lib/errors";
import { normalizeNullableText } from "../lib/text";
import { fetchPaymentSettings, savePaymentSettings } from "../services/paymentSettings";

export function PaymentSettingsPage() {
  const { canAccess } = useAuth();
  const [errorNotice, setErrorNotice] = useState<ErrorNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const canUpdateSettings = canAccess("payment-settings.update");

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
          getErrorMessage(requestError, "Không tải được cấu hình."),
        title: "Không tải được cấu hình",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function handleFileChange(file: File | null) {
    if (!canUpdateSettings) {
      return;
    }

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

    if (!canUpdateSettings) {
      return;
    }

    setSaving(true);
    setSuccess("");

    try {
      const nextQrUrl = qrFile ? await uploadPaymentQr(qrFile) : normalizeNullableText(qrUrl);
      const settings = await savePaymentSettings({
        transfer_note: normalizeNullableText(note),
        transfer_qr_url: nextQrUrl,
      });

      setQrFile(null);
      setQrUrl(settings.transfer_qr_url ?? "");
      setQrPreview(settings.transfer_qr_url ?? "");
      setNote(settings.transfer_note ?? "");
      setSuccess("Đã lưu cấu hình thanh toán.");
    } catch (requestError) {
      setErrorNotice({
        message:
          getErrorMessage(requestError, "Lưu cấu hình thất bại."),
        title: "Lưu cấu hình thất bại",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer maxWidth="5xl">
        <ConfigNotice />

        {success ? (
          <StateNotice message={success} tone="success" />
        ) : null}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 shadow-soft">
            <Spinner label="Đang tải cấu hình thanh toán..." />
          </div>
        ) : (
          <form
            className="grid gap-6 rounded-3xl bg-white p-5 shadow-soft ring-1 ring-coal/5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-7"
            onSubmit={handleSubmit}
          >
            <div className="space-y-4">
              <label
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-coal/15 bg-slate-50 p-4 text-center transition ${
                  canUpdateSettings ? "cursor-pointer hover:bg-slate-100" : ""
                }`}
              >
                {qrPreview ? (
                  <img
                    alt="Mã nhận tiền"
                    className="aspect-square w-full rounded-xl bg-white object-contain"
                    src={qrPreview}
                  />
                ) : (
                  <div className="flex aspect-square w-full flex-col items-center justify-center rounded-xl bg-white text-slate-400">
                    <QrCode className="h-20 w-20" />
                    <span className="mt-3 px-4 text-sm font-bold">Chưa có mã nhận tiền</span>
                  </div>
                )}
                {canUpdateSettings ? (
                  <>
                    <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-coal px-4 py-2 text-sm font-extrabold text-white">
                      <ImagePlus className="h-4 w-4" />
                      Chọn ảnh QR
                    </span>
                    <input
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                      type="file"
                    />
                  </>
                ) : null}
              </label>
            </div>

            <div className="space-y-5">
              <Input
                label="Link ảnh QR"
                onChange={(event) => {
                  setQrUrl(event.target.value);
                  if (!qrFile) {
                    setQrPreview(event.target.value);
                  }
                }}
                placeholder="https://..."
                readOnly={!canUpdateSettings}
                value={qrUrl}
              />
              <Textarea
                label="Thông tin hiển thị kèm mã"
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: số tài khoản, tên chủ tài khoản, nội dung chuyển khoản..."
                readOnly={!canUpdateSettings}
                value={note}
              />
              {canUpdateSettings ? (
                <div className="flex justify-end">
                  <Button className="min-w-36" isLoading={saving} type="submit">
                    <Save className="h-4 w-4" />
                    Lưu cấu hình
                  </Button>
                </div>
              ) : null}
            </div>
          </form>
        )}
      <ErrorNoticeModal notice={errorNotice} onClose={() => setErrorNotice(null)} />
    </PageContainer>
  );
}
