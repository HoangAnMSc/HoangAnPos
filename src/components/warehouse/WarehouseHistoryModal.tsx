import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
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

  return (
    <Modal
      footer={
        <Button className="w-full sm:w-auto" onClick={onClose} variant="secondary">
          Đóng
        </Button>
      }
      onClose={onClose}
      open={open}
      size="xl"
      title="Lịch sử kho"
    >
      <div className="space-y-4">
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
          <div className="max-h-[58dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain rounded-xl border border-slate-200">
            {visibleMovements.map((movement) => {
              const display = getMovementDisplay(movement);

              return (
                <article
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 px-3 py-3 sm:grid-cols-[40px_minmax(0,1fr)_auto_150px] sm:items-center sm:px-4"
                  key={movement.id}
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
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
