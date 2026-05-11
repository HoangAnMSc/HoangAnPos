import { FormEvent, useEffect, useState } from "react";
import { BadgeDollarSign, LockKeyhole, Sparkles } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { Input } from "../components/ui/Input";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { isAdmin, loading, signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? "/pos";

  useEffect(() => {
    if (!loading && user && isAdmin) {
      navigate(from, { replace: true });
    }
  }, [from, isAdmin, loading, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Đăng nhập thất bại. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!loading && user && isAdmin) {
    return <Navigate replace to={from} />;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-cream text-coal">
      <div className="absolute inset-0 bg-grain" />
      <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-clay/20 blur-3xl" />
      <div className="absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-moss/20 blur-3xl" />

      <section className="relative z-10 grid min-h-screen items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-14">
        <div className="mx-auto max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-extrabold text-clay shadow-soft">
            <Sparkles className="h-4 w-4" />
            Quản trị bán hàng gọn, nhanh, rõ tiền
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold leading-tight sm:text-6xl">
            Hoang An POS cho những ca bán hàng thật mượt.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-coal/65">
            Đăng nhập bằng tài khoản Supabase đã được gán quyền admin để quản lý POS,
            khách hàng, sản phẩm và ảnh Cloudinary trong cùng một giao diện.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Supabase Auth", "Admin Role", "Cloudinary Image"].map((item) => (
              <div className="rounded-3xl bg-white/70 p-4 text-sm font-extrabold shadow-soft" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <Card className="mx-auto w-full max-w-md bg-white/90">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-3xl bg-coal p-3 text-white">
              <BadgeDollarSign className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-clay">
                Admin Login
              </p>
              <h2 className="font-display text-3xl font-bold">Đăng nhập</h2>
            </div>
          </div>

          <div className="mb-5">
            <ConfigNotice />
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              autoComplete="email"
              label="Email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@hoangan.vn"
              required
              type="email"
              value={email}
            />
            <Input
              autoComplete="current-password"
              label="Mật khẩu"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />

            {error ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            ) : null}

            <Button className="w-full" isLoading={submitting} type="submit">
              <LockKeyhole className="h-4 w-4" />
              Vào trang quản trị
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
