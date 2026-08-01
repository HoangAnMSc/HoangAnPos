import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useAuth } from "../contexts/AuthContext";
import { isEmailIdentifier } from "../lib/phone";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

type LoginMode = "login" | "request-otp" | "verify-otp" | "new-password";

function getRequestError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  const translations: Array<[RegExp, string]> = [
    [/invalid login credentials/i, "Email/số điện thoại hoặc mật khẩu không đúng."],
    [/phone provider.*disabled|unsupported phone provider/i, "Đăng nhập bằng số điện thoại chưa được bật trong Supabase."],
    [/email address not authorized/i, "Email này chưa được Supabase cho phép gửi. Hãy cấu hình Custom SMTP trong Supabase."],
    [/email rate limit|rate limit/i, "Bạn vừa yêu cầu OTP. Vui lòng chờ một lúc trước khi gửi lại."],
    [/token.*expired|otp.*expired/i, "Mã OTP đã hết hạn. Hãy yêu cầu mã mới."],
    [/token.*invalid|invalid.*otp/i, "Mã OTP không đúng."],
    [/user not found/i, "Không tìm thấy tài khoản với thông tin này."],
  ];

  const translated = translations.find(([pattern]) => pattern.test(message))?.[1];
  return translated || message || fallback;
}

export function LoginPage() {
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [mode, setMode] = useState<LoginMode>("login");
  const [newPassword, setNewPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const {
    isAdmin,
    loading,
    requestPasswordResetOtp,
    signIn,
    updatePasswordAfterOtp,
    user,
    verifyPasswordResetOtp,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? "/pos";

  useEffect(() => {
    if (mode === "login" && !loading && user && isAdmin) {
      navigate(from, { replace: true });
    }
  }, [from, isAdmin, loading, mode, navigate, user]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function returnToLogin() {
    clearMessages();
    setMode("login");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    setSubmitting(true);

    try {
      await signIn(identifier.trim(), password);
      navigate(from, { replace: true });
    } catch (requestError) {
      setError(getRequestError(requestError, "Đăng nhập thất bại. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isEmailIdentifier(normalizedEmail)) {
      setError("Nhập đúng email đã đăng ký để nhận mã OTP.");
      return;
    }

    clearMessages();
    setSubmitting(true);

    try {
      await requestPasswordResetOtp(normalizedEmail);
      setResetIdentifier(normalizedEmail);
      setMode("verify-otp");
      setSuccess(`Đã gửi mã OTP đến ${normalizedEmail}.`);
    } catch (requestError) {
      setError(getRequestError(requestError, "Không gửi được mã OTP. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendOtp(resetIdentifier || identifier);
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    const normalizedOtp = otp.replace(/\D/g, "");
    if (normalizedOtp.length !== 6) {
      setError("Mã OTP phải gồm 6 chữ số.");
      return;
    }

    setSubmitting(true);
    try {
      await verifyPasswordResetOtp(resetIdentifier, normalizedOtp);
      setMode("new-password");
      setSuccess("Mã OTP chính xác. Hãy đặt mật khẩu mới.");
    } catch (requestError) {
      setError(getRequestError(requestError, "Mã OTP không đúng hoặc đã hết hạn."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();

    if (newPassword.length < 6) {
      setError("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Hai mật khẩu mới chưa khớp nhau.");
      return;
    }

    setSubmitting(true);
    try {
      await updatePasswordAfterOtp(newPassword);
      setPassword("");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
      setSuccess("Đổi mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.");
    } catch (requestError) {
      setError(getRequestError(requestError, "Không đổi được mật khẩu. Vui lòng thử lại."));
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "login" && !loading && user && isAdmin) {
    return <Navigate replace to={from} />;
  }

  const title = mode === "login" ? "Đăng nhập" : "Quên mật khẩu";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10 text-coal">
      <div className="absolute inset-0 bg-grain" />
      <Card className="relative w-full max-w-md border-moss-100 bg-white/95 p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-moss-100 text-moss-700">
            <KeyRound className="h-6 w-6" />
          </span>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-moss-700">
            Khu vực quản trị
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">{title}</h2>
          {mode !== "login" ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-coal/55">
              {mode === "request-otp" && "Mã OTP chỉ được gửi qua email đã đăng ký."}
              {mode === "verify-otp" && `Nhập mã 6 số đã gửi đến ${resetIdentifier}.`}
              {mode === "new-password" && "OTP đã xác thực, hãy tạo mật khẩu mới."}
            </p>
          ) : null}
        </div>

        {mode === "login" ? (
          <form className="space-y-4" onSubmit={handleLogin}>
            <Input
              autoComplete="username"
              label="Email hoặc số điện thoại"
              name="identifier"
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="0901234567 hoặc email@example.com"
              required
              value={identifier}
            />
            <Input
              autoComplete="current-password"
              label="Mật khẩu"
              minLength={6}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />

            <button
              className="ml-auto block text-sm font-extrabold text-moss-700 transition hover:text-moss-900"
              onClick={() => {
                clearMessages();
                setResetIdentifier(isEmailIdentifier(identifier) ? identifier.trim() : "");
                setMode("request-otp");
              }}
              type="button"
            >
              Quên mật khẩu?
            </button>

            {success ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {success}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <Button className="w-full" isLoading={submitting} type="submit">
              Đăng nhập
            </Button>
          </form>
        ) : null}

        {mode === "request-otp" ? (
          <form className="space-y-4" onSubmit={handleRequestOtp}>
            <Input
              autoComplete="email"
              label="Email nhận OTP"
              onChange={(event) => setResetIdentifier(event.target.value)}
              placeholder="email@example.com"
              required
              type="email"
              value={resetIdentifier}
            />
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}
            <Button className="w-full" isLoading={submitting} type="submit">
              Gửi mã OTP
            </Button>
            <button
              className="mx-auto flex items-center gap-2 text-sm font-bold text-coal/55 hover:text-coal"
              onClick={returnToLogin}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại đăng nhập
            </button>
          </form>
        ) : null}

        {mode === "verify-otp" ? (
          <form className="space-y-4" onSubmit={handleVerifyOtp}>
            <Input
              autoComplete="one-time-code"
              className="text-center text-xl font-extrabold tracking-[0.35em] tabular-nums"
              inputMode="numeric"
              label="Mã OTP"
              maxLength={6}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              value={otp}
            />
            {success ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {success}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}
            <Button className="w-full" isLoading={submitting} type="submit">
              Xác nhận OTP
            </Button>
            <div className="flex items-center justify-center gap-4 text-sm font-bold">
              <button className="text-moss-700 hover:text-moss-900" onClick={() => void sendOtp(resetIdentifier)} type="button">
                Gửi lại mã
              </button>
              <button className="text-coal/55 hover:text-coal" onClick={() => setMode("request-otp")} type="button">
                Đổi email
              </button>
            </div>
          </form>
        ) : null}

        {mode === "new-password" ? (
          <form className="space-y-4" onSubmit={handleNewPassword}>
            <Input
              autoComplete="new-password"
              label="Mật khẩu mới"
              minLength={6}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
            <Input
              autoComplete="new-password"
              label="Nhập lại mật khẩu mới"
              minLength={6}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
            {success ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {success}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}
            <Button className="w-full" isLoading={submitting} type="submit">
              Đổi mật khẩu
            </Button>
          </form>
        ) : null}
      </Card>
    </main>
  );
}
