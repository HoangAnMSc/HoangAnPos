import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../contexts/AuthContext";

export function UnauthorizedPage() {
  const { signOut } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-grain p-4 text-coal">
      <Card className="max-w-lg text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-100 text-red-600">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="font-display text-3xl font-bold">Chưa có quyền admin</h1>
        <p className="mt-3 text-sm leading-6 text-coal/65">
          Tài khoản đã đăng nhập nhưng chưa được gán role admin trong bảng profiles.
          Hãy dùng tài khoản admin hoặc cập nhật role trên Supabase.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={signOut}>
            Đăng xuất
          </Button>
          <Link
            className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-coal ring-1 ring-coal/10"
            to="/login"
          >
            Về đăng nhập
          </Link>
        </div>
      </Card>
    </main>
  );
}
