import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ProtectedRoute } from "./components/routing/ProtectedRoute";
import { Spinner } from "./components/ui/Spinner";
import { useAuth } from "./contexts/AuthContext";
import { appPermissions } from "./lib/permissions";

const AttendancePage = lazy(() =>
  import("./pages/AttendancePage").then((module) => ({ default: module.AttendancePage }))
);
const CloudinaryImagesPage = lazy(() =>
  import("./pages/CloudinaryImagesPage").then((module) => ({
    default: module.CloudinaryImagesPage,
  }))
);
const CustomersPage = lazy(() =>
  import("./pages/CustomersPage").then((module) => ({ default: module.CustomersPage }))
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({ default: module.NotFoundPage }))
);
const OrdersPage = lazy(() =>
  import("./pages/OrdersPage").then((module) => ({ default: module.OrdersPage }))
);
const RevenuePage = lazy(() =>
  import("./pages/RevenuePage").then((module) => ({ default: module.RevenuePage }))
);
const PaymentSettingsPage = lazy(() =>
  import("./pages/PaymentSettingsPage").then((module) => ({
    default: module.PaymentSettingsPage,
  }))
);
const PosPage = lazy(() =>
  import("./pages/PosPage").then((module) => ({ default: module.PosPage }))
);
const ProductsPage = lazy(() =>
  import("./pages/ProductsPage").then((module) => ({ default: module.ProductsPage }))
);
const RolesPage = lazy(() =>
  import("./pages/RolesPage").then((module) => ({ default: module.RolesPage }))
);
const UnauthorizedPage = lazy(() =>
  import("./pages/UnauthorizedPage").then((module) => ({ default: module.UnauthorizedPage }))
);
const UsersPage = lazy(() =>
  import("./pages/UsersPage").then((module) => ({ default: module.UsersPage }))
);
const WarehouseHubPage = lazy(() =>
  import("./pages/WarehouseHubPage").then((module) => ({ default: module.WarehouseHubPage }))
);

function DefaultAdminRedirect() {
  const { canAccess } = useAuth();
  const firstAllowedPage = appPermissions.find((permission) => canAccess(permission.key));

  return <Navigate to={firstAllowedPage?.path ?? "/unauthorized"} replace />;
}

export function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f7f8f5]">
          <Spinner label="Đang mở trang..." />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route element={<ProtectedRoute requireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route index element={<DefaultAdminRedirect />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="revenue" element={<RevenuePage />} />
            <Route path="cash-management" element={<Navigate replace to="/revenue" />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="cloudinary-images" element={<CloudinaryImagesPage />} />
            <Route path="warehouse" element={<WarehouseHubPage />} />
            <Route path="inventory" element={<Navigate replace to="/warehouse?tab=inventory" />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="payment-settings" element={<PaymentSettingsPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
