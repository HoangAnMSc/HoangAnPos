import { Banknote, Bell, History, LogOut, Menu, PanelLeftClose, UserRound } from "lucide-react";
import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { appPermissions } from "../../lib/permissions";
import { formatCurrency } from "../../lib/format";
import { Button } from "../ui/Button";

export type AdminOutletContext = {
  setHeaderCashBalance: (value: number | null) => void;
};

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerCashBalance, setHeaderCashBalance] = useState<number | null>(null);
  const { canAccess, profile, role, signOut, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const page = appPermissions.find((item) => item.path === location.pathname) ?? appPermissions[0];
  const displayName = profile?.full_name || user?.email || "Admin";
  const isPosRoute = location.pathname === "/pos";
  const visibleNavigation = appPermissions.filter((item) => canAccess(item.key));
  const currentPermission = appPermissions.find((item) => item.path === location.pathname);
  const isWarehouseRoute = location.pathname === "/warehouse";
  const isStatisticsRoute = location.pathname === "/revenue";
  const isOrdersRoute = location.pathname === "/orders";
  const canOpenPageHistory =
    isWarehouseRoute ||
    (isStatisticsRoute && (canAccess("cash-management.history.view") || canAccess("cash-management.reconciliation.update") || canAccess("cash-management.reconciliation.delete")));
  const canAdjustCash = isStatisticsRoute && canAccess("cash-management.balance.adjust");
  const pageHistoryOpen =
    canOpenPageHistory && new URLSearchParams(location.search).get("history") === "1";
  const transferHistoryOpen = isOrdersRoute && (
    new URLSearchParams(location.search).get("transfer-history") === "1" ||
    new URLSearchParams(location.search).get("transfer-images") === "1"
  );
  const historyLabel = isWarehouseRoute
    ? "Mở lịch sử kho"
    : "Mở lịch sử đối soát két";
  const historyTitle = isWarehouseRoute
    ? "Lịch sử nhập kho, xuất kho và chuyển kệ"
    : "Lịch sử đối soát két";

  function openPageHistory() {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("history", "1");
    void navigate(`${location.pathname}?${nextParams.toString()}`);
  }

  function openTransferHistory() {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete("transfer-images");
    nextParams.set("transfer-history", "1");
    void navigate(`${location.pathname}?${nextParams.toString()}`);
  }

  function openCashAdjustment() {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("adjust", "1");
    void navigate(`${location.pathname}?${nextParams.toString()}`);
  }

  if (profile?.is_active === false) {
    return <Navigate replace to="/unauthorized" />;
  }

  if (currentPermission && !canAccess(currentPermission.key)) {
    return <Navigate replace to="/unauthorized" />;
  }

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-coal">
      <aside
        className={`fixed inset-y-0 left-0 z-[90] flex h-dvh w-72 flex-col overflow-hidden border-r border-slate-200 bg-white p-5 text-coal shadow-[12px_0_35px_rgba(15,23,42,0.06)] transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.01em] text-moss-700">
              Sữa tả · Yến sào
            </p>
            <h1 className="font-display text-3xl font-bold">BABYBOO</h1>
          </div>
          <button
            className="rounded-xl p-2 text-coal/60 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <PanelLeftClose className="h-6 w-6" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {visibleNavigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-extrabold transition ${
                  isActive
                    ? "bg-coal text-white shadow-lift"
                    : "text-coal/68 hover:bg-slate-100 hover:text-coal"
                }`
              }
              key={item.path}
              onClick={() => setSidebarOpen(false)}
              to={item.path}
            >
              <item.icon className="h-6 w-6" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 shrink-0 border-t border-slate-200 pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-moss-100 text-moss-700">
              <UserRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-coal">{displayName}</p>
              <p className="truncate text-xs text-coal/50">{role?.name ?? "Quản trị"}</p>
            </div>
          </div>
          <Button className="w-full" onClick={signOut} variant="secondary">
              <LogOut className="h-4 w-4" />
              Đăng xuất
          </Button>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          aria-label="Đóng menu"
          className="fixed inset-0 z-[80] bg-coal/45 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <div className="lg:pl-72">
        {isPosRoute ? (
          <>
            <button
              aria-label="Mở menu"
              className="fixed left-4 top-3 z-50 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-coal shadow-soft ring-1 ring-slate-200 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Menu className="h-6 w-6" />
            </button>
            <main className="min-h-screen bg-[#f7f8f5] text-coal">
              <Outlet context={{ setHeaderCashBalance }} />
            </main>
          </>
        ) : (
          <>
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur-xl sm:px-6 sm:py-3 lg:px-8">
              <div className="flex items-center gap-2 sm:gap-4">
                <button
                  className="rounded-xl bg-white p-3 text-coal shadow-soft ring-1 ring-slate-200 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-xl font-bold sm:text-2xl">{page.label}</h2>
                  <p className="mt-0.5 hidden truncate text-sm text-coal/55 sm:block">
                    {page.description}
                  </p>
                </div>
                {isOrdersRoute ? (
                  <button
                    aria-expanded={transferHistoryOpen}
                    aria-haspopup="dialog"
                    aria-label="Mở lịch sử chuyển khoản"
                    className={`relative ml-auto flex h-11 flex-none items-center justify-center gap-2 rounded-xl px-3 ring-1 transition sm:px-4 ${
                      transferHistoryOpen
                        ? "bg-coal text-white ring-coal"
                        : "bg-white text-coal shadow-soft ring-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={openTransferHistory}
                    title="Lịch sử thanh toán chuyển khoản"
                    type="button"
                  >
                    <History className="h-5 w-5" />
                    <span className="hidden text-sm font-extrabold sm:inline">Lịch sử CK</span>
                  </button>
                ) : null}
                {isStatisticsRoute ? (
                  <button
                    aria-haspopup={canAdjustCash ? "dialog" : undefined}
                    aria-label={canAdjustCash ? "Điều chỉnh tiền két" : "Tiền két hiện tại"}
                    className={`ml-auto flex h-11 min-w-0 max-w-[145px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-2.5 text-emerald-900 ring-1 ring-emerald-200 sm:max-w-none sm:flex-none sm:justify-start sm:px-3 ${canAdjustCash ? "cursor-pointer transition hover:bg-emerald-100 active:scale-[0.98]" : "cursor-default"}`}
                    onClick={canAdjustCash ? openCashAdjustment : undefined}
                    title={headerCashBalance == null ? "Đang tải tiền két" : `Tiền két: ${formatCurrency(headerCashBalance)}`}
                    type="button"
                  >
                    <Banknote className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div className="min-w-0 leading-tight">
                      <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">Tiền két</p>
                      <p className="truncate text-xs font-black tabular-nums sm:text-sm">
                        {headerCashBalance == null ? "Đang tải…" : formatCurrency(headerCashBalance)}
                      </p>
                    </div>
                  </button>
                ) : null}
                {canOpenPageHistory ? (
                  <button
                    aria-expanded={pageHistoryOpen}
                    aria-haspopup="dialog"
                    aria-label={historyLabel}
                    className={`relative ${canAdjustCash ? "" : "ml-auto"} flex h-11 w-11 flex-none items-center justify-center rounded-xl ring-1 transition ${
                      pageHistoryOpen
                        ? "bg-coal text-white ring-coal"
                        : "bg-white text-coal shadow-soft ring-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={openPageHistory}
                    title={historyTitle}
                    type="button"
                  >
                    <Bell className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </header>

            <main className="pt-5 sm:pt-6">
              <Outlet context={{ setHeaderCashBalance }} />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
