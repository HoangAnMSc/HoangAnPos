import { requireSupabaseConfig, supabase } from "../lib/supabase";
import type { AttendanceRecord } from "../types";
import type { Database } from "../types/database";

export type AttendanceCashCheck = Database["public"]["Tables"]["cash_drawer_checks"]["Row"];

function normalizeAttendanceCashCheck(check: AttendanceCashCheck | null) {
  return check ? { ...check, evidence_urls: check.evidence_urls ?? [] } : null;
}

export type AttendanceHistoryRecord = AttendanceRecord & {
  employee_name: string;
};

export type AttendanceLocationInput = {
  accuracy: number | null;
  latitude: number;
  longitude: number;
};

export type ClockInAttendanceInput = {
  location: AttendanceLocationInput;
};

export type AttendanceUpdateInput = {
  clock_in_at: string;
  clock_out_at: string | null;
};

export type AttendanceEmployee = {
  id: string;
  isActive: boolean;
  name: string;
};

type SupabaseErrorLike = {
  code?: string;
  details?: string;
  message?: string;
};

function createAttendanceError(error: SupabaseErrorLike) {
  const message = [error.message, error.details].filter(Boolean).join(" ");

  if (/employee already has another active attendance/i.test(message)) {
    return new Error("Nhân viên đang có một ca khác chưa kết thúc.");
  }

  if (/close cash drawer before clocking out/i.test(message)) {
    return new Error("Hãy chốt phiên két của bạn trước khi tan làm.");
  }

  if (/previous cash drawer session must be closed before reconciliation/i.test(message)) {
    return new Error("Két đang thuộc ca của nhân viên khác. Hãy chốt ca và bàn giao két trước khi nhân viên mới đối soát.");
  }

  if (/cash drawer is already open/i.test(message)) {
    return new Error("Két đã có ca đang mở. Hãy tải lại trang; nếu là ca của người khác, cần chốt bàn giao trước.");
  }

  if (
    error.code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("clock_in_attendance")
  ) {
    return new Error(
      "Supabase chưa có hàm chấm công mới. Hãy chạy lại supabase/schema.sql trong Supabase SQL Editor."
    );
  }

  return error instanceof Error ? error : new Error(error.message || "Yeu cau chấm công thất bại.");
}

function getMonthRange(monthKey: string) {
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const padMonth = (value: number) => String(value).padStart(2, "0");

  return {
    end: `${nextYear}-${padMonth(nextMonth)}-01`,
    start: `${year}-${padMonth(month)}-01`,
  };
}

function getVietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export async function fetchOpenAttendanceRecord(userId: string) {
  requireSupabaseConfig();

  const openRequest = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openRequest.error) {
    throw openRequest.error;
  }

  if (openRequest.data) {
    return openRequest.data;
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .eq("work_date", getVietnamDateKey())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function fetchAttendanceRecords(userId: string, monthKey: string) {
  requireSupabaseConfig();

  const range = getMonthRange(monthKey);
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", userId)
    .gte("work_date", range.start)
    .lt("work_date", range.end)
    .order("clock_in_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchAllAttendanceRecords(monthKey: string) {
  requireSupabaseConfig();

  const range = getMonthRange(monthKey);
  const { data, error } = await supabase.rpc("list_attendance_history", {
    month_start_input: range.start,
  });

  if (error) {
    throw createAttendanceError(error);
  }

  return (data ?? []) as AttendanceHistoryRecord[];
}

export async function fetchAttendanceCashCheck(attendanceRecordId: string) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("get_attendance_cash_check", {
    attendance_record_id_input: attendanceRecordId,
  });

  if (error) {
    if (/schema cache|could not find the function|get_attendance_cash_check/i.test(error.message)) {
      const fallback = await supabase.from("cash_drawer_checks").select("*").eq("attendance_record_id", attendanceRecordId).limit(1).maybeSingle();
      if (fallback.error) throw fallback.error;
      return normalizeAttendanceCashCheck(fallback.data as AttendanceCashCheck | null);
    }
    throw error;
  }

  return normalizeAttendanceCashCheck(data as AttendanceCashCheck | null);
}

export async function submitAttendanceCashCheck(
  attendanceRecordId: string,
  actualCash: number,
  evidenceUrls: string[]
) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("submit_attendance_cash_check", {
    actual_cash_input: Math.max(actualCash, 0),
    attendance_record_id_input: attendanceRecordId,
    evidence_urls_input: evidenceUrls,
  });

  if (error) {
    throw createAttendanceError(error);
  }

  return normalizeAttendanceCashCheck(data as AttendanceCashCheck) as AttendanceCashCheck;
}

export async function fetchAttendanceEmployees(): Promise<AttendanceEmployee[]> {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,is_active")
    .order("full_name", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((profile) => ({
    id: profile.id,
    isActive: profile.is_active,
    name: profile.full_name?.trim() || `Nhân viên ${profile.id.slice(0, 8)}`,
  }));
}

export async function fetchAttendanceRecordsForExport(monthKey: string, userIds: string[]) {
  requireSupabaseConfig();

  if (userIds.length === 0) {
    return [];
  }

  const range = getMonthRange(monthKey);
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .in("user_id", userIds)
    .gte("work_date", range.start)
    .lt("work_date", range.end)
    .order("clock_in_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function clockInAttendance(input: ClockInAttendanceInput) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("clock_in_attendance", {
    accuracy_input: input.location.accuracy,
    latitude_input: input.location.latitude,
    longitude_input: input.location.longitude,
  });

  if (error) {
    throw createAttendanceError(error);
  }

  return data as AttendanceRecord;
}

export async function clockOutAttendance(
  recordId: string,
  location?: AttendanceLocationInput | null
) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("clock_out_attendance", {
    accuracy_input: location?.accuracy ?? null,
    latitude_input: location?.latitude ?? null,
    longitude_input: location?.longitude ?? null,
    record_id_input: recordId,
  });

  if (error) {
    throw createAttendanceError(error);
  }

  return data as AttendanceRecord;
}

export async function updateAttendanceRecord(recordId: string, input: AttendanceUpdateInput) {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc("update_attendance_record", {
    clock_in_at_input: input.clock_in_at,
    clock_out_at_input: input.clock_out_at,
    record_id_input: recordId,
  });

  if (error) {
    throw createAttendanceError(error);
  }

  return data as AttendanceRecord;
}

export async function deleteAttendanceRecord(recordId: string) {
  requireSupabaseConfig();

  const { error } = await supabase.rpc("delete_attendance_record", {
    record_id_input: recordId,
  });

  if (error) {
    throw createAttendanceError(error);
  }
}
