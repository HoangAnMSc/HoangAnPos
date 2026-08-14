export type InventoryCountMap = Record<string, string>;

export type InventoryAuditLine = {
  counted: number;
  ean13: string;
  productId: string | null;
  productName: string;
  systemStock: number | null;
};

export type InventoryAuditSession = {
  createdAt: string;
  id: string;
  lines: InventoryAuditLine[];
  staffName: string;
};

export type InventoryDifferenceStatus = "matched" | "over" | "short";

export function hasInventoryCount(value?: string) {
  return value !== undefined && value.trim() !== "";
}

export function parseInventoryCount(value?: string) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export function getInventoryDifferenceStatus(difference: number): InventoryDifferenceStatus {
  if (difference < 0) {
    return "short";
  }

  if (difference > 0) {
    return "over";
  }

  return "matched";
}
