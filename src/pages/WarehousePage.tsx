import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ClipboardCheck,
  PackageCheck,
  PackageMinus,
  RefreshCw,
  Scale,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorNoticeModal } from "../components/ui/ErrorNoticeModal";
import { Modal } from "../components/ui/Modal";
import { PageContainer, PageToolbar, SearchInput, StateNotice } from "../components/ui/Page";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { useErrorNotice } from "../hooks/useErrorNotice";
import {
  getInventoryDifferenceStatus,
  type InventoryAuditSession,
} from "../lib/inventoryAudits";
import { getProductEan13Value } from "../lib/productDisplay";
import {
  deleteInventoryAudit,
  fetchInventoryAudits,
} from "../services/inventoryAudits";
import { fetchProducts } from "../services/products";
import type { Product } from "../types";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getDifferenceLabel(difference: number) {
  if (difference < 0) {
    return `Thiếu ${Math.abs(difference)}`;
  }

  if (difference > 0) {
    return `Thừa ${difference}`;
  }

  return "Khớp";
}

function getDifferenceTone(difference: number): "amber" | "green" | "red" {
  const status = getInventoryDifferenceStatus(difference);
  return status === "short" ? "red" : status === "over" ? "amber" : "green";
}

export function WarehousePage() {
  const { canAccess } = useAuth();
  const [audits, setAudits] = useState<InventoryAuditSession[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const { clearErrorNotice, errorNotice, showErrorNotice } = useErrorNotice(setError);
  const canDeleteAudit = canAccess("warehouse.audit.delete");

  const loadWarehouseData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextProducts, nextAudits] = await Promise.all([
        fetchProducts(),
        fetchInventoryAudits(),
      ]);
      setProducts(nextProducts);
      setAudits(nextAudits);
      setSelectedAuditId((current) =>
        nextAudits.some((audit) => audit.id === current) ? current : (nextAudits[0]?.id ?? "")
      );
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error ? requestError.message : "Không tải được dữ liệu kho.",
        "Không tải được Kho"
      );
    } finally {
      setLoading(false);
    }
  }, [showErrorNotice]);

  useEffect(() => {
    void loadWarehouseData();
  }, [loadWarehouseData]);

  const selectedAudit = audits.find((audit) => audit.id === selectedAuditId) ?? audits[0] ?? null;
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );
  const comparisonRows = useMemo(
    () =>
      selectedAudit?.lines.map((line) => {
        const product = line.productId ? productsById.get(line.productId) : undefined;
        const systemStock = product?.stock ?? 0;
        const difference = line.counted - systemStock;

        return {
          ...line,
          difference,
          product,
          systemStock,
        };
      }) ?? [],
    [productsById, selectedAudit]
  );
  const comparisonStats = useMemo(
    () =>
      comparisonRows.reduce(
        (stats, row) => ({
          matched: stats.matched + (row.difference === 0 ? 1 : 0),
          over: stats.over + (row.difference > 0 ? 1 : 0),
          short: stats.short + (row.difference < 0 ? 1 : 0),
        }),
        { matched: 0, over: 0, short: 0 }
      ),
    [comparisonRows]
  );
  const warehouseStats = useMemo(
    () => ({
      activeProducts: products.filter((product) => product.is_active).length,
      lowStock: products.filter((product) => product.stock > 0 && product.stock <= 5).length,
      outOfStock: products.filter((product) => product.stock <= 0).length,
      totalStock: products.reduce((total, product) => total + Math.max(0, product.stock), 0),
    }),
    [products]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(
    () =>
      [...products]
        .filter((product) =>
          normalizedQuery
            ? [product.name, product.sku, product.category, getProductEan13Value(product)]
                .filter(Boolean)
                .some((value) => value!.toLocaleLowerCase("vi").includes(normalizedQuery))
            : true
        )
        .sort((first, second) => first.name.localeCompare(second.name, "vi")),
    [normalizedQuery, products]
  );

  async function confirmDeleteAudit() {
    if (!canDeleteAudit || !selectedAudit) {
      return;
    }

    setDeleting(true);
    try {
      await deleteInventoryAudit(selectedAudit.id);
      const nextAudits = audits.filter((audit) => audit.id !== selectedAudit.id);
      setAudits(nextAudits);
      setSelectedAuditId(nextAudits[0]?.id ?? "");
      setDeleteConfirmOpen(false);
    } catch (requestError) {
      showErrorNotice(
        requestError instanceof Error
          ? requestError.message
          : "Không xóa được phiên kiểm kê. Vui lòng thử lại.",
        "Không xóa được kiểm kê"
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageContainer className="!space-y-3 sm:!space-y-4" maxWidth="none">
      <ConfigNotice />
      <PageToolbar
        action={
          <Button disabled={loading} onClick={() => void loadWarehouseData()} variant="secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
        }
        description="Theo dõi số lượng hiện có và đối chiếu với các phiên kiểm kê do nhân viên gửi."
        eyebrow="Quản lý hàng hóa"
        title="Kho"
      >
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[
            {
              icon: Boxes,
              label: "Tổng số lượng",
              tone: "bg-moss-100 text-moss-700",
              value: warehouseStats.totalStock,
            },
            {
              icon: PackageCheck,
              label: "Đang bán",
              tone: "bg-sky-100 text-sky-700",
              value: warehouseStats.activeProducts,
            },
            {
              icon: TriangleAlert,
              label: "Sắp hết",
              tone: "bg-amber-100 text-amber-700",
              value: warehouseStats.lowStock,
            },
            {
              icon: PackageMinus,
              label: "Hết hàng",
              tone: "bg-red-100 text-red-700",
              value: warehouseStats.outOfStock,
            },
          ].map((item) => (
            <div
              className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"
              key={item.label}
            >
              <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${item.tone}`}>
                <item.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-extrabold uppercase tracking-wide text-slate-500 sm:text-xs">
                  {item.label}
                </p>
                <p className="text-xl font-black tabular-nums text-slate-950">
                  {loading ? "—" : item.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </PageToolbar>

      {error ? <StateNotice message={error} tone="error" /> : null}

      <Card className="border border-moss-100 p-3 shadow-[0_10px_28px_rgba(57,67,46,0.07)] sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-moss-700" />
              <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">So sánh tồn kho</h3>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 sm:text-sm">
              Số nhân viên đếm được được đối chiếu với số kho hiện tại.
            </p>
          </div>
          {audits.length > 0 ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Select
                aria-label="Chọn phiên kiểm kê"
                className="h-10 w-full py-1.5 sm:min-w-72"
                onChange={(event) => setSelectedAuditId(event.target.value)}
                value={selectedAudit?.id ?? ""}
              >
                {audits.map((audit) => (
                  <option key={audit.id} value={audit.id}>
                    {dateTimeFormatter.format(new Date(audit.createdAt))} · {audit.staffName}
                  </option>
                ))}
              </Select>
              {canDeleteAudit ? (
                <Button onClick={() => setDeleteConfirmOpen(true)} variant="danger">
                  <Trash2 className="h-4 w-4" />
                  Xóa phiên
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!selectedAudit ? (
          <div className="mt-4">
            <EmptyState
              description="Khi nhân viên hoàn tất nhập tại trang Tồn kho, kết quả sẽ xuất hiện ở đây."
              icon={ClipboardCheck}
              title="Chưa có phiên kiểm kê"
            />
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge className="px-2.5 py-1" tone="neutral">{comparisonRows.length} đã kiểm</Badge>
              <Badge className="px-2.5 py-1" tone="green">{comparisonStats.matched} khớp</Badge>
              <Badge className="px-2.5 py-1" tone="red">{comparisonStats.short} thiếu</Badge>
              <Badge className="px-2.5 py-1" tone="amber">{comparisonStats.over} thừa</Badge>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[minmax(220px,1fr)_100px_100px_105px] gap-3 bg-slate-100 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-500 md:grid">
                <span>Sản phẩm</span>
                <span className="text-right">Kho hiện tại</span>
                <span className="text-right">Đã đếm</span>
                <span className="text-right">Chênh lệch</span>
              </div>
              <div className="max-h-[46dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                {comparisonRows.map((row) => (
                  <article
                    className={`grid gap-2.5 px-3 py-2.5 transition md:grid-cols-[minmax(220px,1fr)_100px_100px_105px] md:items-center ${
                      row.difference < 0
                        ? "bg-red-50/35 hover:bg-red-50/70"
                        : row.difference > 0
                          ? "bg-amber-50/35 hover:bg-amber-50/70"
                          : "hover:bg-moss-50/60"
                    }`}
                    key={row.productId ?? `${selectedAudit.id}-${row.ean13}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-950">
                        {row.product?.name ?? row.productName}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        EAN-13 {row.ean13}
                        {!row.product ? " · Sản phẩm không còn trong kho" : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between md:block md:text-right">
                      <span className="text-xs font-bold text-slate-400 md:hidden">Kho hiện tại</span>
                      <span className="font-extrabold tabular-nums text-slate-950">
                        {row.product ? row.systemStock : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between md:block md:text-right">
                      <span className="text-xs font-bold text-slate-400 md:hidden">Đã đếm</span>
                      <span className="font-extrabold tabular-nums text-slate-950">{row.counted}</span>
                    </div>
                    <div className="flex items-center justify-between md:justify-end">
                      <span className="text-xs font-bold text-slate-400 md:hidden">Chênh lệch</span>
                      {row.product ? (
                        <Badge tone={getDifferenceTone(row.difference)}>
                          {getDifferenceLabel(row.difference)}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Không đối chiếu</Badge>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="border border-slate-200 p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] sm:p-4">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">Kho hiện tại</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 sm:text-sm">
              Toàn bộ số lượng đang được hệ thống ghi nhận.
            </p>
          </div>
          <SearchInput
            className="lg:max-w-lg"
            onChange={setQuery}
            placeholder="Tìm tên, nhóm hàng, SKU hoặc EAN-13..."
            value={query}
          />
        </div>

        {loading ? (
          <div className="mt-4">
            <Spinner label="Đang tải thông tin kho..." />
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              description="Không có sản phẩm phù hợp với từ khóa."
              icon={Boxes}
              title="Không tìm thấy sản phẩm"
            />
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[minmax(240px,1fr)_150px_110px_100px] gap-3 bg-slate-100 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-slate-500 md:grid">
              <span>Sản phẩm</span>
              <span>Nhóm hàng</span>
              <span>Trạng thái</span>
              <span className="text-right">Số lượng</span>
            </div>
            <div className="max-h-[60dvh] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
              {visibleProducts.map((product) => (
                <article
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-3 py-2.5 transition md:grid-cols-[minmax(240px,1fr)_150px_110px_100px] md:items-center md:gap-3 ${
                    product.stock <= 0
                      ? "bg-red-50/35 hover:bg-red-50/70"
                      : product.stock <= 5
                        ? "bg-amber-50/35 hover:bg-amber-50/70"
                        : "hover:bg-moss-50/60"
                  }`}
                  key={product.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-950">{product.name}</p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 sm:text-xs">
                      EAN-13 {getProductEan13Value(product)}
                    </p>
                  </div>
                  <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 md:contents">
                    <p className="min-w-0 truncate text-xs font-semibold text-slate-600 md:text-sm">
                      {product.category || "Chưa phân nhóm"}
                    </p>
                    <Badge
                      className="w-fit flex-none px-2 py-0.5 text-[10px] md:px-3 md:py-1 md:text-xs"
                      tone={product.is_active ? "green" : "neutral"}
                    >
                      {product.is_active ? "Đang bán" : "Đang ẩn"}
                    </Badge>
                  </div>
                  <div
                    className={`col-start-2 row-span-2 row-start-1 flex min-w-[58px] flex-col items-end justify-center self-stretch rounded-xl px-2.5 py-1.5 md:col-start-auto md:row-span-1 md:row-start-auto md:block md:min-w-0 md:self-auto md:bg-transparent md:p-0 md:text-right ${
                      product.stock <= 0
                        ? "bg-red-100/70"
                        : product.stock <= 5
                          ? "bg-amber-100/70"
                          : "bg-slate-100"
                    }`}
                  >
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400 md:hidden">
                      Số lượng
                    </span>
                    <span
                      className={`text-lg font-black tabular-nums md:text-xl ${
                        product.stock <= 0
                          ? "text-red-600"
                          : product.stock <= 5
                            ? "text-amber-700"
                            : "text-slate-950"
                      }`}
                    >
                      {product.stock}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button onClick={() => setDeleteConfirmOpen(false)} variant="secondary">
              Hủy
            </Button>
            <Button
              isLoading={deleting}
              onClick={() => void confirmDeleteAudit()}
              variant="danger"
            >
              Xóa phiên kiểm kê
            </Button>
          </div>
        }
        onClose={() => setDeleteConfirmOpen(false)}
        open={deleteConfirmOpen}
        size="sm"
        title="Xóa phiên kiểm kê?"
      >
        <StateNotice
          message="Kết quả kiểm kê này sẽ bị xóa khỏi thiết bị và không thể khôi phục."
          tone="warning"
        />
      </Modal>

      <ErrorNoticeModal notice={errorNotice} onClose={clearErrorNotice} />
    </PageContainer>
  );
}
