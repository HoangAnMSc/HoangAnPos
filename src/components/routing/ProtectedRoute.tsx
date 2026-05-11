import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Spinner } from "../ui/Spinner";

type ProtectedRouteProps = {
  requireAdmin?: boolean;
};

export function ProtectedRoute({ requireAdmin = false }: ProtectedRouteProps) {
  const { isAdmin, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="min-h-screen bg-grain">
        <Spinner label="Đang kiểm tra phiên đăng nhập..." />
      </main>
    );
  }

  if (!user) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate replace to="/unauthorized" />;
  }

  return <Outlet />;
}
