export type ExpiryStatus = "expired" | "warning" | "valid" | "pending" | "untracked";

export type ExpiryLot = {
  id: string;
  receipt_id: string;
  expiry_date: string | null;
  initial_quantity: number;
  remaining_quantity: number;
  updated_at: string;
  tracks_expiry: boolean;
  import_date: string | null;
  origin: string;
  created_at: string;
};

export type ExpiryVariantState = { variant_id: string; stock_quantity: number; lots: ExpiryLot[] };
export type ExpiryGroup = { key: string; date: string | null; status: ExpiryStatus; quantity: number; lots: ExpiryLot[] };

export function stockExpiryToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function expiryDaysLeft(date: string, today = stockExpiryToday()) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function expiryStatus(date: string | null, tracked: boolean, warningDays: number, today = stockExpiryToday()): ExpiryStatus {
  if (!date) return tracked ? "pending" : "untracked";
  const days = expiryDaysLeft(date, today);
  return days < 0 ? "expired" : days <= warningDays ? "warning" : "valid";
}

export const expiryStatusOrder: Record<ExpiryStatus, number> = { expired: 0, warning: 1, pending: 2, valid: 3, untracked: 4 };
export const expiryStatusLabels: Record<ExpiryStatus, string> = { expired: "Hết hạn", warning: "Cảnh báo", valid: "Còn hạn", pending: "Chờ nhập HSD", untracked: "Không theo dõi HSD" };
export const expiryRowColors: Record<ExpiryStatus, string> = {
  expired: "border-red-200 bg-red-50 text-red-950",
  warning: "border-yellow-300 bg-yellow-50 text-yellow-950",
  valid: "border-emerald-200 bg-emerald-50 text-emerald-950",
  pending: "border-slate-200 bg-slate-50 text-slate-800",
  untracked: "border-slate-200 bg-white text-slate-800",
};

export function groupStockExpiry(lots: ExpiryLot[], warningDays: number, today = stockExpiryToday()): ExpiryGroup[] {
  const groups = new Map<string, ExpiryGroup>();
  for (const lot of lots) {
    if (lot.remaining_quantity <= 0) continue;
    const status = expiryStatus(lot.expiry_date, lot.tracks_expiry, warningDays, today);
    const key = lot.expiry_date ?? status;
    const group = groups.get(key) ?? { key, date: lot.expiry_date, status, quantity: 0, lots: [] };
    group.quantity += lot.remaining_quantity;
    group.lots.push(lot);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => expiryStatusOrder[a.status] - expiryStatusOrder[b.status] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export function summarizeStockExpiry(lots: ExpiryLot[], warningDays: number, today = stockExpiryToday()) {
  const groups = groupStockExpiry(lots, warningDays, today);
  const dated = groups.filter((group) => group.date);
  const unknownLots = groups.filter((group) => !group.date).flatMap((group) => group.lots);
  const pending = groups.filter((group) => group.status === "pending").reduce((sum, group) => sum + group.quantity, 0);
  const unknownQuantity = unknownLots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
  const displayGroups: ExpiryGroup[] = [...dated];
  if (unknownQuantity > 0) displayGroups.push({ key: "undated", date: null, status: "untracked", quantity: unknownQuantity, lots: unknownLots });
  return {
    groups, displayGroups, dated, unknownLots, pending, unknownQuantity,
    datedQuantity: dated.reduce((sum, group) => sum + group.quantity, 0),
    status: dated[0]?.status ?? (pending > 0 ? "pending" : "untracked") as ExpiryStatus,
  };
}

export function expiryDateLabel(value: string | null) {
  if (!value) return "Chưa xác định";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
