import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ProtectedRoute } from "./components/routing/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";
import { appPermissions } from "./lib/permissions";
import { CloudinaryImagesPage } from "./pages/CloudinaryImagesPage";
import { CustomersPage } from "./pages/CustomersPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PaymentSettingsPage } from "./pages/PaymentSettingsPage";
import { PosPage } from "./pages/PosPage";
import { ProductsPage } from "./pages/ProductsPage";
import { RolesPage } from "./pages/RolesPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";
import { UsersPage } from "./pages/UsersPage";

function DefaultAdminRedirect() {
  const { canAccess } = useAuth();
  const firstAllowedPage = appPermissions.find((permission) => canAccess(permission.key));

  return <Navigate to={firstAllowedPage?.path ?? "/unauthorized"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route element={<ProtectedRoute requireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route index element={<DefaultAdminRedirect />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="cloudinary-images" element={<CloudinaryImagesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="payment-settings" element={<PaymentSettingsPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
