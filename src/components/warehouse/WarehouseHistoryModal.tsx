import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  ChevronRight,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { StateNotice } from "../ui/Page";
import { Spinner } from "../ui/Spinner";
import {
  fetchWarehouseMovements,
  type StockMovement,
} from "../../services/stockMovements";

type HistoryFilter = "all" | "in" | "out";

type WarehouseHistoryModalProps = {
  open: boolean;
  onClose: () => void;
};

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

const filters: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "in", label: "Nhập kho" },
  { key: "out", label: "Xuất kho" },
];

function getMovementDisplay(movement: StockMovement) {
  switch (movement.movement_type) {
    case "in":
      return {
        Icon: ArrowDownToLine,
        iconClassName: "bg-emerald-50 text-emerald-700",
        label: "Nhập kho",
        quantity: `+${movement.quantity}`,
        quantityClassName: "text-emerald-700",
      };
    case "out":
      return {
        Icon: ArrowUpFromLine,
        iconClassName: "bg-red-50 text-red-700",
        label: "Xuất kho",
        quantity: `−${movement.quantity}`,
        quantityClassName: "text-red-700",
      };
    case "sale":
      return {
        Icon: ArrowUpFromLine,
        iconClassName: "bg-red-50 text-red-700",
        label: "Bán hàng",
        quantity: `−${movement.quantity}`,
        quantityClassName: "text-red-700",
      };
    case "return":
      return {
        Icon: ArrowDownToLine,
        iconClassName: "bg-emerald-50 text-emerald-700",
        label: "Hoàn kho",
        quantity: `+${movement.quantity}`,
        quantityClassName: "text-emerald-700",
      };
    default:
      return {
        Icon: ArrowDownToLine,
        iconClassName: "bg-amber-50 text-amber-700",
        label: "Điều chỉnh",
        quantity: String(movement.quantity),
        quantityClassName: "text-amber-700",
      };
  }
}

export function WarehouseHistoryModal({ open, onClose }: WarehouseHistoryModalProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setMovements(await fetchWarehouseMovements());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không tải được lịch sử thao tác kho."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadHistory();
    }
  }, [loadHistory, open]);

  const visibleMovements = useMemo(
    () =>
      movements.filter((movement) => {
        if (filter === "all") return true;
        return movement.movement_type === filter;
      }),
    [filter, movements]
  );
  const selectedDisplay = selectedMovement ? getMovementDisplay(selectedMovement) : null;

  function closeHistory() {
    setSelectedMovement(null);
    onClose();
  }

  return <>
    <Modal
      bodyClassName="!flex !min-h-0 !flex-col !overflow-hidden"
      contentClassName="sm:h-[min(760px,86vh)]"
      footer={
        <Button className="w-full sm:w-auto" onClick={closeHistory} variant="secondary">
          Đóng
        </Button>
      }
      onClose={closeHistory}
      open={open}
      size="xl"
      title="Lịch sử kho"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {filters.map((item) => (
              <button
                className={`rounded-lg px-2 py-2 text-xs font-extrabold transition sm:px-3 ${
                  filter === item.key
                    ? "bg-white text-coal shadow-sm"
                    : "text-slate-500 hover:text-coal"
                }`}
                key={item.key}
                onClick={() => setFilter(item.key)}
                type="button"
              >
                {item.label}
              </button>
            ))}
        </div>

        {error ? <StateNotice message={error} tone="error" /> : null}

        {loading && movements.length === 0 ? (
          <Spinner label="Đang tải lịch sử kho..." />
        ) : visibleMovements.length === 0 ? (
          <EmptyState
            description="Các lần nhập, xuất, bán hàng và điều chỉnh sẽ xuất hiện tại đây."
            icon={Bell}
            title="Chưa có lịch sử"
          />
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-200">
            {visibleMovements.map((movement) => {
              const display = getMovementDisplay(movement);

              return (
                <button
                  className="grid w-full grid-cols-[40px_minmax(0,1fr)_auto_16px] items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[40px_minmax(0,1fr)_auto_150px_16px] sm:px-4"
                  key={movement.id}
                  onClick={() => setSelectedMovement(movement)}
                  type="button"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${display.iconClassName}`}
                  >
                    <display.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">
                      {movement.products?.name ?? "Sản phẩm"}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {movement.reason || movement.products?.sku || "Không có ghi chú"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 sm:hidden">
                      {movement.actor_name} · {dateTimeFormatter.format(new Date(movement.created_at))}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone="neutral">{display.label}</Badge>
                    <p className={`mt-1 text-base font-black tabular-nums ${display.quantityClassName}`}>
                      {display.quantity}
                    </p>
                  </div>
                  <p className="hidden text-right text-xs font-semibold text-slate-500 sm:block">
                    {movement.actor_name}
                    <br />
                    {dateTimeFormatter.format(new Date(movement.created_at))}
                  </p>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>

    <Modal
      footer={<Button className="w-full sm:w-auto" onClick={() => setSelectedMovement(null)} variant="secondary">Đóng</Button>}
      onClose={() => setSelectedMovement(null)}
      open={Boolean(selectedMovement)}
      size="md"
      title="Chi tiết thao tác kho"
    >
      {selectedMovement && selectedDisplay ? (
        <dl className="divide-y divide-slate-100">
          <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">Sản phẩm</dt><dd className="break-words text-sm font-black text-slate-950">{selectedMovement.products?.name ?? "Sản phẩm không còn trong kho"}</dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">Thao tác</dt><dd><span className="inline-flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${selectedDisplay.iconClassName}`}><selectedDisplay.Icon className="h-4 w-4" /></span><Badge tone="neutral">{selectedDisplay.label}</Badge></span></dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">Số lượng</dt><dd className={`text-lg font-black tabular-nums ${selectedDisplay.quantityClassName}`}>{selectedDisplay.quantity} sản phẩm</dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">SKU</dt><dd className="break-words text-sm font-extrabold text-slate-900">{selectedMovement.products?.sku || "Chưa có SKU"}</dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">Người thực hiện</dt><dd className="break-words text-sm font-extrabold text-slate-900">{selectedMovement.actor_name || "Hệ thống"}</dd></div>
          <div className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">Thời gian</dt><dd className="text-sm font-extrabold text-slate-900">{dateTimeFormatter.format(new Date(selectedMovement.created_at))}</dd></div>
          <div className="grid gap-1 py-3 last:pb-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-extrabold text-slate-500">Lý do / ghi chú</dt><dd className="whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-700">{selectedMovement.reason || "Không có ghi chú cho thao tác này."}</dd></div>
        </dl>
      ) : null}
    </Modal>
  </>;
}
