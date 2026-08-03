import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { Database, Json } from "../types/database";

export type CashDrawerCheck = Database["public"]["Tables"]["cash_drawer_checks"]["Row"];

export type CashDrawerSession = {
  id: string;
  cashier_id: string;
  cashier_name: string;
  expected_opening_cash: number;
  opening_cash: number;
  opening_variance: number;
  opening_note: string | null;
  cash_sales: number;
  transfer_sales: number;
  expected_cash: number;
  counted_cash: number | null;
  variance: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  close_note: string | null;
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
  ready: boolean;
};

export async function fetchCheckoutShiftStatus(): Promise<CheckoutShiftStatus> {
  requireSupabaseConfig();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw authError ?? new Error("Phiên đăng nhập đã hết hạn.");
  }

  const [attendanceResult, drawerResult] = await Promise.all([
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

  if (attendanceResult.error) throw attendanceResult.error;
  if (drawerResult.error) throw drawerResult.error;

  const hasActiveAttendance = Boolean(attendanceResult.data?.length);
  const hasOpenCashDrawer = Boolean(drawerResult.data?.length);
  return {
    hasActiveAttendance,
    hasOpenCashDrawer,
    ready: hasActiveAttendance && hasOpenCashDrawer,
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

export async function openCashDrawer(openingCash: number, openingNote: string | null) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("open_cash_drawer", {
    opening_cash_input: Math.max(openingCash, 0),
    opening_note_input: openingNote,
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
    .select("actual_cash, reason, checked_at")
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

  await openCashDrawer(Number(latestCheck.actual_cash), latestCheck.reason ?? null);
}

export async function closeCashDrawer(
  sessionId: string,
  countedCash: number,
  closeNote: string | null
) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc("close_cash_drawer", {
    close_note_input: closeNote,
    counted_cash_input: Math.max(countedCash, 0),
    session_id_input: sessionId,
  });

  if (error) throw error;
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
  return (data ?? []) as CashDrawerCheck[];
}
