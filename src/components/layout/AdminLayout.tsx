import {
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  Images,
  LogOut,
  Menu,
  PanelLeftClose,
  ReceiptText,
  Search,
  Settings,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/Button";

const navigation = [
  { to: "/pos", label: "POS", icon: BadgeDollarSign },
  { to: "/orders", label: "Hoa don", icon: ReceiptText },
  { to: "/customers", label: "Khach hang", icon: UsersRound },
  { to: "/products", label: "San pham", icon: Boxes },
  { to: "/cloudinary-images", label: "Anh Cloudinary", icon: Images },
  { to: "/inventory", label: "Ton kho", icon: ClipboardList },
  { to: "/payment-settings", label: "Thanh toan", icon: Settings },
];

const pageTitles: Record<string, { title: string }> = {
  "/pos": {
    title: "Ban hang tai quay",
  },
  "/orders": {
    title: "Hoa don",
  },
  "/customers": {
    title: "Khach hang",
  },
  "/products": {
    title: "San pham",
  },
  "/cloudinary-images": {
    title: "Anh Cloudinary",
  },
  "/inventory": {
    title: "Ton kho",
  },
  "/payment-settings": {
    title: "Cau hinh thanh toan",
  },
};

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut, user } = useAuth();
  const location = useLocation();
  const page = pageTitles[location.pathname] ?? pageTitles["/pos"];
  const displayName = profile?.full_name || user?.email || "Admin";
  const isPosRoute = location.pathname === "/pos";

  return (
    <div className="min-h-screen bg-white text-coal">
      <div className="fixed inset-0 -z-10 bg-grain" />

      <aside
        className={`fixed inset-y-0 left-0 z-[90] flex w-72 flex-col border-r border-white/70 bg-coal p-5 text-white shadow-2xl transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.35em] text-clay">
              Hoang An
            </p>
            <h1 className="font-display text-3xl font-bold">POS</h1>
          </div>
          <button
            className="rounded-2xl p-2 text-white/70 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <PanelLeftClose className="h-6 w-6" />
          </button>
        </div>

        <nav className="space-y-2">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold transition ${
                  isActive
                    ? "bg-cream text-coal shadow-lift"
                    : "text-white/72 hover:bg-white/10 hover:text-white"
                }`
              }
              key={item.to}
              onClick={() => setSidebarOpen(false)}
              to={item.to}
            >
              <item.icon className="h-6 w-6" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-[1.75rem] bg-white/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-white/45">Dang nhap</p>
          <p className="mt-1 truncate font-bold">{displayName}</p>
          <Button className="mt-4 w-full bg-white text-coal" onClick={signOut} variant="secondary">
            <LogOut className="h-4 w-4" />
            Dang xuat
          </Button>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          aria-label="Dong menu"
          className="fixed inset-0 z-[80] bg-coal/45 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <div className="lg:pl-72">
        {isPosRoute ? (
          <>
            <button
              className="fixed left-4 top-4 z-50 rounded-2xl bg-white p-4 text-coal shadow-soft lg:hidden"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <main className="min-h-screen text-[#111827]">
              <Outlet />
            </main>
          </>
        ) : (
          <>
            <header className="sticky top-0 z-20 border-b border-white/70 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
              <div className="flex items-center gap-4">
                <button
                  className="rounded-2xl bg-white p-3 text-coal shadow-soft lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  type="button"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-bold sm:text-3xl">{page.title}</h2>
                </div>
                <div className="hidden min-w-72 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-coal/45 shadow-soft xl:flex">
                  <Search className="h-4 w-4" />
                  <span className="text-sm font-semibold">Du lieu dong bo qua Supabase</span>
                </div>
              </div>
            </header>

            <main className="pt-6 sm:pt-4">
              <Outlet />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
