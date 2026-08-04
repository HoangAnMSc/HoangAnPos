import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { Database, Json } from "../types/database";

export type CashDrawerCheck = Database["public"]["Tables"]["cash_drawer_checks"]["Row"];

function normalizeCashDrawerCheck(check: CashDrawerCheck): CashDrawerCheck {
  return { ...check, evidence_urls: check.evidence_urls ?? [] };
}

export type CashDrawerSession = {
  id: string;
  cashier_id: string;
  cashier_name: string;
  expected_opening_cash: number;
  opening_cash: number;
  opening_variance: number;
  opening_evidence_urls: string[];
  cash_sales: number;
  transfer_sales: number;
  expected_cash: number;
  counted_cash: number | null;
  variance: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  close_evidence_urls: string[];
};

export type CashDrawerHandover = {
  expected_opening_cash: number;
  has_open_session: boolean;
  is_first_session: boolean;
  open_cashier_name: string | null;
};

export type CheckoutShiftStatus = {
  hasActiveAttendance: boolean;
  hasOpenCashDrawer: boolean;
  requiresCashReconciliation: boolean;
  ready: boolean;
};

export async function fetchCheckoutShiftStatus(): Promise<CheckoutShiftStatus> {
  requireSupabaseConfig();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw authError ?? new Error("Phiên đăng nhập đã hết hạn.");
  }

  const [requirementResult, attendanceResult, drawerResult] = await Promise.all([
    supabase.rpc("requires_cash_reconciliation", { user_id: authData.user.id }),
    supabase
      .from("attendance_records")
      .select("id")
      .eq("user_id", authData.user.id)
      .is("clock_out_at", null)
      .limit(1),
    supabase
      .from("cash_drawer_sessions")
      .select("id")
      .eq("cashier_id", authData.user.id)
      .eq("status", "open")
      .limit(1),
  ]);

  if (requirementResult.error) throw requirementResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (drawerResult.error) throw drawerResult.error;

  const requiresCashReconciliation = requirementResult.data === true;
  const hasActiveAttendance = Boolean(attendanceResult.data?.length);
  const hasOpenCashDrawer = Boolean(drawerResult.data?.length);
  return {
    hasActiveAttendance,
    hasOpenCashDrawer,
    requiresCashReconciliation,
    ready: !requiresCashReconciliation || (hasActiveAttendance && hasOpenCashDrawer),
  };
}

export type OrderAuditEvent = {
  id: number;
  order_id: string;
  actor_id: string | null;
  event_type: "created" | "cancelled" | "printed" | "deleted";
  reason: string | null;
  details: Json;
  created_at: string;
};

export async function fetchCashDrawerSessions(limit = 500) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("list_cash_drawer_sessions", {
    limit_input: limit,
  });

  if (error) throw error;
  return (data ?? []) as CashDrawerSession[];
}

export async function fetchOwnOpenCashDrawerSession() {
  requireSupabaseConfig();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw authError ?? new Error("Phiên đăng nhập đã hết hạn.");
  }

  const sessions = await fetchCashDrawerSessions();
  return sessions.find(
    (session) => session.cashier_id === authData.user.id && session.status === "open"
  ) ?? null;
}

export async function fetchRequiresCashReconciliation(userId: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("requires_cash_reconciliation", { user_id: userId });
  if (error) throw error;
  return data === true;
}

export async function fetchCashDrawerHandover() {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("get_cash_drawer_handover");

  if (error) throw error;
  return (data?.[0] ?? {
    expected_opening_cash: 0,
    has_open_session: false,
    is_first_session: true,
    open_cashier_name: null,
  }) as CashDrawerHandover;
}

export async function openCashDrawer(openingCash: number, evidenceUrls: string[] = []) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("open_cash_drawer", {
    opening_cash_input: Math.max(openingCash, 0),
    evidence_urls_input: evidenceUrls,
  });

  if (error) throw error;
  return data;
}

export async function ensureCashDrawerSessionForCheckout() {
  requireSupabaseConfig();

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw authError ?? new Error("Phiên đăng nhập đã hết hạn.");
  }

  const { data: openSessions, error: sessionError } = await supabase
    .from("cash_drawer_sessions")
    .select("id")
    .eq("cashier_id", authData.user.id)
    .eq("status", "open")
    .limit(1);

  if (sessionError) {
    throw sessionError;
  }

  if (openSessions && openSessions.length > 0) {
    return;
  }

  const { data: latestCheck, error: checkError } = await supabase
    .from("cash_drawer_checks")
    .select("actual_cash, evidence_urls, checked_at")
    .eq("employee_id", authData.user.id)
    .not("checked_at", "is", null)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (checkError) {
    throw checkError;
  }

  if (!latestCheck || latestCheck.actual_cash == null) {
    throw new Error(
      "Chưa có xác nhận tiền két để mở phiên bán hàng. Hãy chấm công và xác nhận tiền két trước khi thanh toán."
    );
  }

  await openCashDrawer(Number(latestCheck.actual_cash), latestCheck.evidence_urls ?? []);
}

export async function closeCashDrawer(
  sessionId: string,
  countedCash: number,
  evidenceUrls: string[]
) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("close_cash_drawer", {
    evidence_urls_input: evidenceUrls,
    counted_cash_input: Math.max(countedCash, 0),
    session_id_input: sessionId,
  });

  if (error) {
    if (/best candidate function|close_note_input|function overloading/i.test(error.message)) {
      throw new Error("Supabase còn hàm chốt két cũ. Hãy chạy lại toàn bộ supabase/schema.sql rồi thử tan làm lại.");
    }
    throw error;
  }
  return data;
}

export async function fetchOrderAuditEvents(limit = 100) {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("order_audit_events")
    .select("*")
    .in("event_type", ["cancelled", "deleted"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as OrderAuditEvent[];
}

export async function fetchCashDrawerChecks(limit = 500) {
  requireSupabaseConfig();
  const { data, error } = await supabase
    .from("cash_drawer_checks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as CashDrawerCheck[]).map(normalizeCashDrawerCheck);
}

export async function updateCashReconciliation(
  checkId: string,
  actualCash: number,
  evidenceUrls: string[]
) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("update_cash_reconciliation", {
    actual_cash_input: Math.max(actualCash, 0),
    check_id_input: checkId,
    evidence_urls_input: evidenceUrls,
  });
  if (error) throw error;
  return normalizeCashDrawerCheck(data as CashDrawerCheck);
}

export async function deleteCashReconciliation(checkId: string) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc("delete_cash_reconciliation", {
    check_id_input: checkId,
  });
  if (error) throw error;
}

export async function adjustCashDrawerBalance(cashAmount: number) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc("adjust_cash_drawer_balance", {
    cash_amount_input: Math.max(cashAmount, 0),
  });
  if (error) {
    if (/close the open cash drawer/i.test(error.message)) throw new Error("Hãy chốt ca và hoàn tất đối soát két trước khi điều chỉnh quỹ.");
    throw error;
  }
}
