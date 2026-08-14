import { Boxes, ClipboardCheck, History, PackageMinus, PackagePlus } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { WarehouseHistoryModal } from "../components/warehouse/WarehouseHistoryModal";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { useAuth } from "../contexts/AuthContext";
import { InventoryPage } from "./InventoryPage";
import { StockMovementPage } from "./StockMovementPage";
import { WarehousePage } from "./WarehousePage";

type WarehouseAction = "products" | "audits" | "inventory" | "in" | "out";

export function WarehouseHubPage() {
  const { canAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const actions = [
    {
      key: "products" as const,
      label: "Sản phẩm",
      icon: Boxes,
      iconTone: "bg-slate-900/90 text-white",
      glowTone: "bg-slate-300/50",
      allowed: canAccess("warehouse"),
    },
    {
      key: "audits" as const,
      label: "Lịch sử kiểm kê",
      icon: History,
      iconTone: "bg-violet-500/90 text-white",
      glowTone: "bg-violet-300/55",
      allowed: canAccess("warehouse") || canAccess("inventory"),
    },
    {
      key: "inventory" as const,
      label: "Kiểm kê",
      icon: ClipboardCheck,
      iconTone: "bg-sky-500/90 text-white",
      glowTone: "bg-sky-300/55",
      allowed: canAccess("inventory") && canAccess("inventory.count") && canAccess("inventory.submit"),
    },
    {
      key: "in" as const,
      label: "Nhập kho",
      icon: PackagePlus,
      iconTone: "bg-amber-500/90 text-white",
      glowTone: "bg-amber-300/55",
      allowed: canAccess("products.receive-stock"),
    },
    {
      key: "out" as const,
      label: "Xuất kho",
      icon: PackageMinus,
      iconTone: "bg-rose-500/90 text-white",
      glowTone: "bg-rose-300/55",
      allowed: canAccess("warehouse.stock-out"),
    },
  ].filter((action) => action.allowed);
  const requested = searchParams.get("tab") as WarehouseAction | null;
  const active = actions.some((action) => action.key === requested) ? requested : null;
  const historyOpen = searchParams.get("history") === "1";

  if (!actions.length) return <Navigate replace to="/unauthorized" />;

  function selectAction(action: WarehouseAction | null) {
    const nextParams = new URLSearchParams(searchParams);
    if (action) nextParams.set("tab", action);
    else nextParams.delete("tab");
    setSearchParams(nextParams);
  }

  function closeHistory() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("history");
    setSearchParams(nextParams, { replace: true });
  }

  return (
    <div className="space-y-3">
      <PageContainer maxWidth="none">
        <section aria-label="Chức năng kho" className="mx-auto w-full max-w-5xl">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
            {actions.map((action) => {
              const selected = active === action.key;
              return (
                <button
                  aria-pressed={selected}
                  className={`group relative isolate flex h-[96px] min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-[1.2rem] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.54)_55%,rgba(241,245,249,0.68)_100%)] p-3 text-center text-slate-900 shadow-[0_10px_26px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white hover:bg-white/80 hover:shadow-[0_15px_32px_rgba(15,23,42,0.14)] sm:h-[106px] sm:p-4 ${selected ? "ring-4 ring-slate-200" : ""}`}
                  key={action.key}
                  onClick={() => selectAction(action.key)}
                  type="button"
                >
                  <span aria-hidden="true" className={`pointer-events-none absolute -right-7 -top-8 -z-10 h-20 w-20 rounded-full blur-2xl transition group-hover:scale-125 ${action.glowTone}`} />
                  <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 -left-5 -z-10 h-20 w-20 rounded-full bg-white/80 blur-2xl" />
                  <span className={`grid h-10 w-10 place-items-center rounded-xl border border-white/40 shadow-[0_7px_16px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md ${action.iconTone}`}>
                    <action.icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                  </span>
                  <strong className="block w-full truncate text-sm font-black leading-5 sm:text-base">{action.label}</strong>
                </button>
              );
            })}
          </div>
        </section>
      </PageContainer>

      <Modal bodyClassName="!p-0" footer={<Button className="w-full sm:w-auto" onClick={() => selectAction(null)} variant="secondary">Đóng</Button>} onClose={() => selectAction(null)} open={active === "products"} size="wide" title="Sản phẩm trong kho">
        <WarehousePage mode="products" />
      </Modal>
      <Modal bodyClassName="!p-0" footer={<Button className="w-full sm:w-auto" onClick={() => selectAction(null)} variant="secondary">Đóng</Button>} onClose={() => selectAction(null)} open={active === "audits"} size="xl" title="Lịch sử kiểm kê">
        <WarehousePage mode="audits" />
      </Modal>
      <InventoryPage onClose={() => selectAction(null)} open={active === "inventory"} />
      <StockMovementPage onClose={() => selectAction(null)} open={active === "in"} type="in" />
      <StockMovementPage onClose={() => selectAction(null)} open={active === "out"} type="out" />
      <WarehouseHistoryModal onClose={closeHistory} open={historyOpen} />
    </div>
  );
}
