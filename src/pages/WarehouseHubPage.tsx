import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  PackageMinus,
  PackagePlus,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { WarehouseHistoryModal } from "../components/warehouse/WarehouseHistoryModal";
import { PageContainer } from "../components/ui/Page";
import { useAuth } from "../contexts/AuthContext";
import { InventoryPage } from "./InventoryPage";
import { ShelfTransferPage } from "./ShelfTransferPage";
import { StockMovementPage } from "./StockMovementPage";
import { WarehousePage } from "./WarehousePage";

type WarehouseTab = "overview" | "inventory" | "in" | "shelf" | "out";

export function WarehouseHubPage() {
  const { canAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = [
    { key: "overview" as const, label: "Kho", icon: Boxes, allowed: canAccess("warehouse") },
    {
      key: "inventory" as const,
      label: "Tồn kho",
      icon: ClipboardCheck,
      allowed: canAccess("inventory"),
    },
    {
      key: "in" as const,
      label: "Nhập kho",
      icon: PackagePlus,
      allowed: canAccess("products.receive-stock"),
    },
    {
      key: "out" as const,
      label: "Xuất kho",
      icon: PackageMinus,
      allowed: canAccess("warehouse.stock-out"),
    },
    {
      key: "shelf" as const,
      label: "Chuyển kệ",
      icon: ArrowLeftRight,
      allowed: canAccess("warehouse") || canAccess("products.receive-stock"),
    },
  ].filter((tab) => tab.allowed);
  const requested = searchParams.get("tab") as WarehouseTab | null;
  const active = tabs.some((tab) => tab.key === requested) ? requested! : tabs[0]?.key;
  const historyOpen = searchParams.get("history") === "1";

  if (!active) return <Navigate replace to="/unauthorized" />;

  function selectTab(tab: WarehouseTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    setSearchParams(nextParams);
  }

  function closeHistory() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("history");
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-3">
      <PageContainer className="!pb-0" maxWidth="none">
        <nav
          aria-label="Chức năng kho"
          className="flex gap-1.5 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-soft"
        >
          {tabs.map((tab) => (
            <button
              className={`flex min-h-10 min-w-[108px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-extrabold whitespace-nowrap transition sm:text-sm ${
                active === tab.key
                  ? "bg-coal text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              type="button"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </PageContainer>

      {active === "overview" ? <WarehousePage /> : null}
      {active === "inventory" ? <InventoryPage /> : null}
      {active === "shelf" ? (
        <PageContainer maxWidth="none">
          <ShelfTransferPage />
        </PageContainer>
      ) : null}
      {active === "in" || active === "out" ? (
        <PageContainer maxWidth="none">
          <StockMovementPage key={active} type={active} />
        </PageContainer>
      ) : null}

      <WarehouseHistoryModal onClose={closeHistory} open={historyOpen} />
    </div>
  );
}
