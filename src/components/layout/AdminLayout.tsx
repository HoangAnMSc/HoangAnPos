import { LogOut, Menu, PanelLeftClose, UserRound } from "lucide-react";
import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { appPermissions } from "../../lib/permissions";
import { Button } from "../ui/Button";

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { canAccess, profile, role, signOut, user } = useAuth();
  const location = useLocation();
  const page = appPermissions.find((item) => item.path === location.pathname) ?? appPermissions[0];
  const displayName = profile?.full_name || user?.email || "Admin";
  const isPosRoute = location.pathname === "/pos";
  const visibleNavigation = appPermissions.filter((item) => canAccess(item.key));
  const currentPermission = appPermissions.find((item) => item.path === location.pathname);

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
              Sữa tươi · Yến sào
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
              className="fixed left-2 top-1.5 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-coal shadow-soft ring-1 ring-slate-200 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <main className="min-h-screen bg-[#f7f8f5] text-coal">
              <Outlet />
            </main>
          </>
        ) : (
          <>
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
              <div className="flex items-center gap-4">
                <button
                  className="rounded-xl bg-white p-3 text-coal shadow-soft ring-1 ring-slate-200 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold sm:text-2xl">{page.label}</h2>
                  <p className="mt-0.5 hidden truncate text-sm text-coal/55 sm:block">
                    {page.description}
                  </p>
                </div>
              </div>
            </header>

            <main className="pt-5 sm:pt-6">
              <Outlet />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
