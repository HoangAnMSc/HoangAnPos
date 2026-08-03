import { Boxes, ClipboardCheck, PackageMinus, PackagePlus } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { PageContainer } from "../components/ui/Page";
import { useAuth } from "../contexts/AuthContext";
import { InventoryPage } from "./InventoryPage";
import { StockMovementPage } from "./StockMovementPage";
import { WarehousePage } from "./WarehousePage";

type WarehouseTab = "overview" | "inventory" | "in" | "out";

export function WarehouseHubPage() {
  const { canAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = [
    { key: "overview" as const, label: "Kho", icon: Boxes, allowed: canAccess("warehouse") },
    { key: "inventory" as const, label: "Tồn kho", icon: ClipboardCheck, allowed: canAccess("inventory") },
    { key: "in" as const, label: "Nhập kho", icon: PackagePlus, allowed: canAccess("products.receive-stock") },
    { key: "out" as const, label: "Xuất kho", icon: PackageMinus, allowed: canAccess("warehouse.stock-out") },
  ].filter((tab) => tab.allowed);
  const requested = searchParams.get("tab") as WarehouseTab | null;
  const active = tabs.some((tab) => tab.key === requested) ? requested! : tabs[0]?.key;

  if (!active) return <Navigate replace to="/unauthorized" />;

  return (
    <div className="space-y-4">
      <PageContainer className="!pb-0" maxWidth="none">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft sm:grid-cols-4">
          {tabs.map((tab) => <button className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition ${active === tab.key ? "bg-coal text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`} key={tab.key} onClick={() => setSearchParams({ tab: tab.key })} type="button"><tab.icon className="h-4 w-4" />{tab.label}</button>)}
        </div>
      </PageContainer>
      {active === "overview" ? <WarehousePage /> : null}
      {active === "inventory" ? <InventoryPage /> : null}
      {active === "in" || active === "out" ? <PageContainer maxWidth="none"><StockMovementPage type={active} /></PageContainer> : null}
    </div>
  );
}
