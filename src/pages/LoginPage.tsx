import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useAuth } from "../contexts/AuthContext";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10 text-coal">
      <div className="absolute inset-0 bg-grain" />
      <Card className="relative w-full max-w-md border-moss-100 bg-white/95 p-7 sm:p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-moss-700">
            Admin Login
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold">Đăng nhập</h2>
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
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <Button className="w-full" isLoading={submitting} type="submit">
            Đăng nhập
          </Button>
        </form>
      </Card>
    </main>
  );
}
