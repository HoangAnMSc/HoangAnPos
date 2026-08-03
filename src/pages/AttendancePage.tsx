import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileImage,
  FileSpreadsheet,
  Fingerprint,
  History,
  LocateFixed,
  LogOut,
  MapPin,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";
import { useAuth } from "../contexts/AuthContext";
import {
  downloadAttendanceExcel,
  downloadAttendanceImages,
} from "../lib/attendanceExport";
import { getErrorMessage } from "../lib/errors";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../lib/format";
import { normalizeNullableText } from "../lib/text";
import {
  closeCashDrawer,
  fetchCashDrawerSessions,
  type CashDrawerSession,
} from "../services/cashManagement";
import {
  clockInAttendance,
  clockOutAttendance,
  deleteAttendanceRecord,
  fetchAllAttendanceRecords,
  fetchAttendanceCashCheck,
  fetchAttendanceEmployees,
  fetchAttendanceRecords,
  fetchAttendanceRecordsForExport,
  fetchOpenAttendanceRecord,
  submitAttendanceCashCheck,
  type AttendanceCashCheck,
  type AttendanceEmployee,
  type AttendanceHistoryRecord,
  type AttendanceLocationInput,
  updateAttendanceRecord,
} from "../services/attendance";
import type { AttendanceRecord } from "../types";

type AttendanceTab = "clock" | "history" | "team-history";
type AttendanceExportFormat = "excel" | "image";

type AttendanceEditForm = {
  clockIn: string;
  clockOut: string;
};

type SelectedTeamAttendance = {
  employeeName: string;
  record: AttendanceHistoryRecord;
};

type AttendanceCashDetailProps = {
  cashCheck: AttendanceCashCheck | null;
  loading: boolean;
};

function AttendanceCashDetail({ cashCheck, loading }: AttendanceCashDetailProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-5 text-sm font-bold text-slate-500">
        <RotateCcw className="h-4 w-4 animate-spin" /> Đang tải đối soát tiền mặt...
      </div>
    );
  }

  if (!cashCheck) {
    return (
      <p className="rounded-2xl bg-slate-50 px-4 py-4 text-center text-sm font-semibold text-slate-500">
        Ca này không có dữ liệu đối soát tiền mặt.
      </p>
    );
  }

  const variance = cashCheck.actual_cash == null
    ? null
    : Number(cashCheck.actual_cash) - Number(cashCheck.expected_cash);
  const statusTone = cashCheck.is_match === true
    ? "bg-emerald-100 text-emerald-700"
    : cashCheck.is_match === false
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-moss-700" />
          <h4 className="text-sm font-extrabold text-slate-900">Đối soát tiền mặt đầu ca</h4>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone}`}>
          {cashCheck.is_match === true ? "Đã khớp" : cashCheck.is_match === false ? "Không khớp" : "Chờ xác nhận"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-slate-200">
        <div className="bg-white p-3">
          <dt className="text-[11px] font-bold text-slate-500">Tiền mặt hệ thống</dt>
          <dd className="mt-1 text-sm font-black tabular-nums text-slate-950">{formatCurrency(Number(cashCheck.expected_cash))}</dd>
        </div>
        <div className="bg-white p-3">
          <dt className="text-[11px] font-bold text-slate-500">Nhân viên thực đếm</dt>
          <dd className="mt-1 text-sm font-black tabular-nums text-slate-950">
            {cashCheck.actual_cash == null ? "Chưa xác nhận" : formatCurrency(Number(cashCheck.actual_cash))}
          </dd>
        </div>
      </dl>
      {variance !== null || cashCheck.reason ? (
        <div className="border-t border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">
          {variance !== null ? (
            <p>Chênh lệch: <strong className={variance === 0 ? "text-emerald-700" : "text-red-700"}>{formatCurrency(variance)}</strong></p>
          ) : null}
          {cashCheck.reason ? <p className="mt-1 leading-5 text-red-700">Lý do: {cashCheck.reason}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

const vietnamTimeZone = "Asia/Ho_Chi_Minh";

const clockTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: vietnamTimeZone,
});

const currentDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "full",
  timeZone: vietnamTimeZone,
});

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: vietnamTimeZone,
});

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: vietnamTimeZone,
});

const weekdayLabels = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const calendarWeekdayLabels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

function getVietnamMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone: vietnamTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? "01";

  return `${year}-${month}`;
}

function formatClockTime(date: Date) {
  return clockTimeFormatter.format(date).replace(":", ".");
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `Tháng ${Number(month)}/${year}`;
}

function getWorkDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatShortDate(value: string) {
  const date = getWorkDate(value);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${weekdayLabels[date.getUTCDay()]}, ${day}/${month}`;
}

function getMonthDays(monthKey: string) {
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  const year = Number.isFinite(yearValue) ? yearValue : new Date().getFullYear();
  const month = Number.isFinite(monthValue) ? monthValue : new Date().getMonth() + 1;
  const totalDays = new Date(year, month, 0).getDate();

  return Array.from({ length: totalDays }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${year}-${String(month).padStart(2, "0")}-${day}`;
  });
}

function getCalendarSlots(monthDays: string[]) {
  if (monthDays.length === 0) {
    return [];
  }

  const firstWeekday = getWorkDate(monthDays[0]).getUTCDay();
  const leadingEmptyDays = (firstWeekday + 6) % 7;

  return [
    ...Array.from({ length: leadingEmptyDays }, () => null),
    ...monthDays,
  ] as Array<string | null>;
}

function getDayKind(value: string): "weekday" | "saturday" | "sunday" {
  const weekday = getWorkDate(value).getUTCDay();
  if (weekday === 0) return "sunday";
  if (weekday === 6) return "saturday";
  return "weekday";
}

function getDayNumber(value: string) {
  return Number(value.slice(-2));
}

function getShortWeekday(value: string) {
  const weekday = getWorkDate(value).getUTCDay();
  return weekday === 0 ? "CN" : `T${weekday + 1}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return dateTimeFormatter.format(new Date(value));
}

function formatDateTimeLocalInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: vietnamTimeZone,
    year: "numeric",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart(
    "minute"
  )}`;
}

function vietnamDateTimeLocalToIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

function formatTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return timeFormatter.format(new Date(value));
}

function formatDurationFromMs(totalMs: number) {
  const safeMs = Math.max(totalMs, 0);
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h${minutes}m`;
}

function formatRecordDuration(record: AttendanceRecord, now: Date) {
  const start = new Date(record.clock_in_at).getTime();
  const end = record.clock_out_at ? new Date(record.clock_out_at).getTime() : now.getTime();

  return formatDurationFromMs(end - start);
}

function formatLocation(location?: AttendanceLocationInput | null) {
  if (!location) {
    return "--";
  }

  if (location.accuracy === null) {
    return "Đã lưu GPS";
  }

  return `+/- ${Math.round(location.accuracy)}m`;
}

function getClockInLocation(record?: AttendanceRecord | null): AttendanceLocationInput | null {
  if (record?.clock_in_latitude == null || record.clock_in_longitude == null) {
    return null;
  }

  return {
    accuracy: record.clock_in_accuracy_m,
    latitude: record.clock_in_latitude,
    longitude: record.clock_in_longitude,
  };
}

function getLocationUrl(location: AttendanceLocationInput) {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      return "iPhone đang từ chối định vị. Vào Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị, bật Dịch vụ định vị; chọn Safari Websites → Khi dùng ứng dụng và bật Vị trí chính xác. Sau đó quay lại Safari, tải lại trang và thử lại.";
    }

    return "Quyền vị trí đang bị từ chối. Hãy mở cài đặt của trang web, chọn Vị trí → Cho phép, tải lại trang rồi chấm công lại.";
  }

  if (error.code === error.TIMEOUT) {
    return "Lấy vị trí quá lâu. Hãy thử lại ở nơi có tín hiệu tốt hơn.";
  }

  return "Không lấy được vị trí hiện tại.";
}

async function getCurrentAttendanceLocation(): Promise<AttendanceLocationInput> {
  if (!window.isSecureContext) {
    throw new Error("Định vị chỉ hoạt động trên kết nối HTTPS. Hãy mở trang bằng địa chỉ bắt đầu bằng https://.");
  }

  if (!navigator.geolocation) {
    throw new Error("Trình duyệt này không hỗ trợ định vị. Hãy mở trang trực tiếp bằng Chrome hoặc Safari, không dùng trình duyệt bên trong Zalo/Facebook.");
  }

  const policyDocument = document as Document & {
    permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
  };

  if (policyDocument.permissionsPolicy?.allowsFeature("geolocation") === false) {
    throw new Error("Định vị bị chặn bởi chính sách của trang. Hãy mở trang trực tiếp trên domain chính, không mở bên trong iframe hoặc ứng dụng khác.");
  }

  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        throw new Error(
          /iPhone|iPad|iPod/i.test(navigator.userAgent)
            ? "iPhone đang chặn quyền vị trí của Safari. Vào Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị → Safari Websites → Khi dùng ứng dụng, rồi bật Vị trí chính xác."
            : "Bạn đã chặn quyền vị trí cho domain này. Nhấn biểu tượng ổ khóa/cài đặt cạnh thanh địa chỉ, bật Vị trí, rồi tải lại trang."
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("quyền vị trí")) {
        throw error;
      }
    }
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          accuracy: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy * 100) / 100
            : null,
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
        });
      },
      (error) => reject(new Error(getGeolocationErrorMessage(error))),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      }
    );
  });
}

export function AttendancePage() {
  const { canAccess, profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AttendanceTab>("clock");
  const [allHistoryEmployees, setAllHistoryEmployees] = useState<AttendanceEmployee[]>([]);
  const [allHistoryLoading, setAllHistoryLoading] = useState(false);
  const [allHistoryRecords, setAllHistoryRecords] = useState<AttendanceHistoryRecord[]>([]);
  const [cashActual, setCashActual] = useState("");
  const [cashCheck, setCashCheck] = useState<AttendanceCashCheck | null>(null);
  const [cashCheckError, setCashCheckError] = useState("");
  const [cashMismatch, setCashMismatch] = useState(false);
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashReason, setCashReason] = useState("");
  const [cashSaving, setCashSaving] = useState(false);
  const [confirmClockOutOpen, setConfirmClockOutOpen] = useState(false);
  const [clockOutCashActual, setClockOutCashActual] = useState("");
  const [clockOutCashNote, setClockOutCashNote] = useState("");
  const [clockOutCashSession, setClockOutCashSession] = useState<CashDrawerSession | null>(null);
  const [clockOutCashLoading, setClockOutCashLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState<AttendanceEditForm>({ clockIn: "", clockOut: "" });
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [error, setError] = useState("");
  const [exportEmployees, setExportEmployees] = useState<AttendanceEmployee[]>([]);
  const [exportError, setExportError] = useState("");
  const [exportFormat, setExportFormat] = useState<AttendanceExportFormat>("excel");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMonthKey, setExportMonthKey] = useState(() => getVietnamMonthKey());
  const [exporting, setExporting] = useState(false);
  const [selectedExportEmployeeIds, setSelectedExportEmployeeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [detailCashCheck, setDetailCashCheck] = useState<AttendanceCashCheck | null>(null);
  const [detailCashLoading, setDetailCashLoading] = useState(false);
  const [selectedHistoryAttendance, setSelectedHistoryAttendance] = useState<AttendanceRecord | null>(null);
  const [selectedTeamAttendance, setSelectedTeamAttendance] = useState<SelectedTeamAttendance | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [monthKey, setMonthKey] = useState(() => getVietnamMonthKey());
  const [now, setNow] = useState(() => new Date());
  const [openLoading, setOpenLoading] = useState(true);
  const [openRecord, setOpenRecord] = useState<AttendanceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const canClock = canAccess("attendance.clock");
  const canViewHistory = canAccess("attendance.history.view");
  const canViewAllHistory = canAccess("attendance.history.view-all");
  const canUpdateHistory = canAccess("attendance.history.update");
  const canDeleteHistory = canAccess("attendance.history.delete");
  const canExportAttendance = canAccess("attendance.export");
  const displayName = profile?.full_name || user?.email || "Nhân viên";
  const isClockedIn = Boolean(openRecord && !openRecord.clock_out_at);
  const isTodayCompleted = Boolean(openRecord?.clock_out_at);
  const clockInLocation = getClockInLocation(openRecord);
  const allExportEmployeesSelected =
    exportEmployees.length > 0 &&
    exportEmployees.every((employee) => selectedExportEmployeeIds.has(employee.id));

  const loadOpenRecord = useCallback(async () => {
    if (!user?.id || !canClock) {
      setOpenRecord(null);
      setOpenLoading(false);
      return;
    }

    setOpenLoading(true);

    try {
      const record = await fetchOpenAttendanceRecord(user.id);
      setOpenRecord(record);

      if (record) {
        const nextCashCheck = await fetchAttendanceCashCheck(record.id);
        setCashCheck(nextCashCheck);
        if (nextCashCheck && !nextCashCheck.checked_at) {
          setCashModalOpen(true);
        }
      } else {
        setCashCheck(null);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không tải được trạng thái chấm công."));
    } finally {
      setOpenLoading(false);
    }
  }, [canClock, user?.id]);

  const loadHistory = useCallback(async () => {
    if (!user?.id || !canViewHistory) {
      setHistoryRecords([]);
      return;
    }

    setHistoryLoading(true);

    try {
      setHistoryRecords(await fetchAttendanceRecords(user.id, monthKey));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không tải được lịch sử chấm công."));
    } finally {
      setHistoryLoading(false);
    }
  }, [canViewHistory, monthKey, user?.id]);

  const loadAllHistory = useCallback(async () => {
    if (!canViewAllHistory) {
      setAllHistoryEmployees([]);
      setAllHistoryRecords([]);
      return;
    }

    setAllHistoryLoading(true);
    try {
      const [records, employees] = await Promise.all([
        fetchAllAttendanceRecords(monthKey),
        fetchAttendanceEmployees(),
      ]);
      setAllHistoryRecords(records);
      setAllHistoryEmployees(employees);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không tải được lịch sử toàn bộ nhân viên."));
    } finally {
      setAllHistoryLoading(false);
    }
  }, [canViewAllHistory, monthKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadOpenRecord();
  }, [loadOpenRecord]);

  useEffect(() => {
    if (activeTab === "history") {
      void loadHistory();
    } else if (activeTab === "team-history") {
      void loadAllHistory();
    }
  }, [activeTab, loadAllHistory, loadHistory]);

  useEffect(() => {
    if (activeTab === "clock" && !canClock) {
      if (canViewHistory) {
        setActiveTab("history");
      } else if (canViewAllHistory) {
        setActiveTab("team-history");
      }
    }
  }, [activeTab, canClock, canViewAllHistory, canViewHistory]);

  const historySummary = useMemo(() => {
    const totalMs = historyRecords.reduce((total, record) => {
      const end = record.clock_out_at ? new Date(record.clock_out_at).getTime() : now.getTime();

      return total + (end - new Date(record.clock_in_at).getTime());
    }, 0);

    return {
      totalDuration: formatDurationFromMs(totalMs),
      totalShifts: historyRecords.length,
    };
  }, [historyRecords, now]);

  const monthDays = useMemo(() => getMonthDays(monthKey), [monthKey]);
  const calendarSlots = useMemo(() => getCalendarSlots(monthDays), [monthDays]);
  const historyByDay = useMemo(
    () => new Map(historyRecords.map((record) => [record.work_date, record])),
    [historyRecords]
  );
  const allHistoryMatrix = useMemo(() => {
    const employeeMap = new Map(
      allHistoryEmployees.map((employee) => [employee.id, employee.name] as const)
    );
    allHistoryRecords.forEach((record) => employeeMap.set(record.user_id, record.employee_name));
    const recordsByEmployee = new Map<string, Map<string, AttendanceHistoryRecord>>();
    allHistoryRecords.forEach((record) => {
      const employeeRecords = recordsByEmployee.get(record.user_id) ?? new Map();
      employeeRecords.set(record.work_date, record);
      recordsByEmployee.set(record.user_id, employeeRecords);
    });
    const normalizedSearch = employeeSearch.trim().toLocaleLowerCase("vi");

    return [...employeeMap.entries()]
      .sort((left, right) => left[1].localeCompare(right[1], "vi"))
      .filter(([, employeeName]) =>
        normalizedSearch ? employeeName.toLocaleLowerCase("vi").includes(normalizedSearch) : true
      )
      .map(([employeeId, employeeName]) => {
        const employeeRecords = recordsByEmployee.get(employeeId) ?? new Map();
        return {
          employeeId,
          employeeName,
          records: monthDays.map((workDate) => ({
            record: employeeRecords.get(workDate) ?? null,
            workDate,
          })),
          totalShifts: employeeRecords.size,
        };
      });
  }, [allHistoryEmployees, allHistoryRecords, employeeSearch, monthDays]);

  async function handleClockIn() {
    if (!canClock || !user?.id) {
      return;
    }

    if (isTodayCompleted) {
      setError("Hôm nay đã chấm công và tan làm. Không thể chấm công lần hai.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const location = await getCurrentAttendanceLocation();
      const record = await clockInAttendance({ location });
      setOpenRecord(record);
      try {
        const nextCashCheck = await fetchAttendanceCashCheck(record.id);
        setCashCheck(nextCashCheck);
        if (nextCashCheck && !nextCashCheck.checked_at) {
          setCashModalOpen(true);
          setCashMismatch(false);
          setCashActual("");
          setCashReason("");
        }
      } catch (cashCheckRequestError) {
        setError(
          getErrorMessage(
            cashCheckRequestError,
            "Đã chấm công nhưng chưa tải được bước xác nhận tiền két."
          )
        );
      }
      setSuccess(`Đã chấm công lúc ${formatDateTime(record.clock_in_at)}.`);

      if (canViewHistory) {
        await loadHistory();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Chấm công thất bại."));
    } finally {
      setSubmitting(false);
    }
  }

  async function openClockOutConfirmation() {
    setConfirmClockOutOpen(true);
    setClockOutCashActual("");
    setClockOutCashNote("");
    setClockOutCashSession(null);
    setClockOutCashLoading(true);
    try {
      const sessions = await fetchCashDrawerSessions(20);
      setClockOutCashSession(sessions.find((session) => session.status === "open") ?? null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không tải được số tiền két để chốt ca."));
      setConfirmClockOutOpen(false);
    } finally {
      setClockOutCashLoading(false);
    }
  }

  function closeClockOutConfirmation() {
    if (submitting) {
      return;
    }
    setConfirmClockOutOpen(false);
    setClockOutCashActual("");
    setClockOutCashNote("");
    setClockOutCashSession(null);
  }

  function handleClockButton() {
    if (!canClock || openLoading || submitting || isTodayCompleted) {
      return;
    }

    setError("");
    setSuccess("");

    if (isClockedIn) {
      void openClockOutConfirmation();
      return;
    }

    void handleClockIn();
  }

  async function handleConfirmClockOut() {
    if (!openRecord || !canClock) {
      return;
    }

    const actualCash = Number(clockOutCashActual);
    const expectedCash = Number(clockOutCashSession?.expected_cash ?? 0);
    if (clockOutCashSession && (!clockOutCashActual.trim() || !Number.isFinite(actualCash) || actualCash < 0)) {
      setError("Nhập số tiền thực tế đang có trong két.");
      return;
    }
    if (clockOutCashSession && actualCash !== expectedCash && !clockOutCashNote.trim()) {
      setError("Tiền thực tế đang lệch hệ thống. Hãy nhập lý do chênh lệch trước khi tan ca.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      if (clockOutCashSession) {
        await closeCashDrawer(
          clockOutCashSession.id,
          actualCash,
          normalizeNullableText(clockOutCashNote)
        );
      }
      let location: AttendanceLocationInput | null = null;

      try {
        location = await getCurrentAttendanceLocation();
      } catch {
        location = null;
      }

      const closedRecord = await clockOutAttendance(openRecord.id, location);
      setOpenRecord(null);
      setCashCheck(null);
      setConfirmClockOutOpen(false);
      setClockOutCashSession(null);
      setSuccess(`Đã tan làm lúc ${formatDateTime(closedRecord.clock_out_at)}.`);

      if (canViewHistory) {
        await loadHistory();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Tan làm thất bại."));
    } finally {
      setSubmitting(false);
    }
  }

  async function loadAttendanceCashDetail(recordId: string) {
    setDetailCashCheck(null);
    setDetailCashLoading(true);
    try {
      setDetailCashCheck(await fetchAttendanceCashCheck(recordId));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Không tải được thông tin đối soát tiền mặt."));
    } finally {
      setDetailCashLoading(false);
    }
  }

  function openHistoryAttendanceDetail(record: AttendanceRecord) {
    setSelectedTeamAttendance(null);
    setSelectedHistoryAttendance(record);
    void loadAttendanceCashDetail(record.id);
  }

  function openTeamAttendanceDetail(employeeName: string, record: AttendanceHistoryRecord) {
    setSelectedHistoryAttendance(null);
    setSelectedTeamAttendance({ employeeName, record });
    void loadAttendanceCashDetail(record.id);
  }

  function closeAttendanceDetail() {
    setSelectedHistoryAttendance(null);
    setSelectedTeamAttendance(null);
    setDetailCashCheck(null);
    setDetailCashLoading(false);
  }

  function openEditModal(record: AttendanceRecord) {
    if (!canUpdateHistory) {
      return;
    }

    setEditError("");
    setSelectedTeamAttendance(null);
    setDetailCashCheck(null);
    setEditingRecord(record);
    setEditForm({
      clockIn: formatDateTimeLocalInput(record.clock_in_at),
      clockOut: formatDateTimeLocalInput(record.clock_out_at),
    });
  }

  async function handleSaveEdit() {
    if (!editingRecord || !canUpdateHistory) {
      return;
    }

    setEditError("");

    if (!editForm.clockIn) {
      setEditError("Nhập giờ chấm công.");
      return;
    }

    const clockInAt = vietnamDateTimeLocalToIso(editForm.clockIn);
    const clockOutAt = editForm.clockOut ? vietnamDateTimeLocalToIso(editForm.clockOut) : null;

    if (clockOutAt && new Date(clockOutAt).getTime() < new Date(clockInAt).getTime()) {
      setEditError("Giờ tan làm phải sau giờ chấm công.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await updateAttendanceRecord(editingRecord.id, {
        clock_in_at: clockInAt,
        clock_out_at: clockOutAt,
      });
      setEditingRecord(null);
      setSuccess(
        !clockOutAt && editingRecord.clock_out_at
          ? "Đã khôi phục ca đang chạy. Nhân viên cần xác nhận lại tiền két trước khi thanh toán tại POS."
          : "Đã cập nhật lịch sử chấm công."
      );
      await Promise.all([loadOpenRecord(), loadHistory(), loadAllHistory()]);
    } catch (requestError) {
      setEditError(getErrorMessage(requestError, "Sửa lịch sử chấm công thất bại."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRecord(record: AttendanceRecord) {
    if (!canDeleteHistory) {
      return;
    }

    const confirmed = window.confirm(`Xóa ca chấm công ${formatShortDate(record.work_date)}?`);

    if (!confirmed) {
      return;
    }

    setDeletingId(record.id);
    setError("");
    setSuccess("");

    try {
      await deleteAttendanceRecord(record.id);
      setSelectedTeamAttendance(null);
      setSuccess("Đã xóa lịch sử chấm công.");
      await Promise.all([loadOpenRecord(), loadHistory(), loadAllHistory()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Xóa lịch sử chấm công thất bại."));
    } finally {
      setDeletingId("");
    }
  }

  async function openExportModal() {
    if (!canExportAttendance) {
      return;
    }

    setExportModalOpen(true);
    setExportError("");

    if (exportEmployees.length > 0) {
      return;
    }

    setExportLoading(true);
    try {
      const employees = await fetchAttendanceEmployees();
      setExportEmployees(employees);
      setSelectedExportEmployeeIds(new Set(employees.map((employee) => employee.id)));
    } catch (requestError) {
      setExportError(getErrorMessage(requestError, "Không tải được danh sách nhân viên."));
    } finally {
      setExportLoading(false);
    }
  }

  async function saveCashCheck(actualCash: number, reason: string | null) {
    if (!cashCheck || cashSaving) {
      return;
    }

    setCashSaving(true);
    setCashCheckError("");
    try {
      const savedCashCheck = await submitAttendanceCashCheck(
        cashCheck.attendance_record_id,
        actualCash,
        reason
      );
      setCashCheck(savedCashCheck);
      setCashModalOpen(false);
      setCashMismatch(false);
      setCashActual("");
      setCashReason("");
      setSuccess(
        actualCash === Number(cashCheck.expected_cash)
          ? "Đã xác nhận tiền trong két khớp với hệ thống."
          : "Đã ghi nhận số tiền thực tế và lý do chênh lệch."
      );
    } catch (requestError) {
      setCashCheckError(getErrorMessage(requestError, "Không lưu được đối soát tiền két."));
    } finally {
      setCashSaving(false);
    }
  }

  function handleConfirmCashMatches() {
    if (!cashCheck) {
      return;
    }

    void saveCashCheck(Number(cashCheck.expected_cash), null);
  }

  function handleSubmitCashMismatch() {
    if (!cashCheck) {
      return;
    }

    if (!cashActual) {
      setCashCheckError("Nhập số tiền thực tế đang có trong két.");
      return;
    }

    const actualCash = Number(cashActual);
    if (actualCash === Number(cashCheck.expected_cash)) {
      setCashCheckError("Số vừa nhập đang khớp với hệ thống; hãy chọn “Đúng”.");
      return;
    }

    if (!cashReason.trim()) {
      setCashCheckError("Nhập lý do khi số tiền trong két không khớp.");
      return;
    }

    void saveCashCheck(actualCash, normalizeNullableText(cashReason));
  }

  function toggleAllExportEmployees() {
    setSelectedExportEmployeeIds(
      allExportEmployeesSelected
        ? new Set()
        : new Set(exportEmployees.map((employee) => employee.id))
    );
  }

  function toggleExportEmployee(employeeId: string) {
    setSelectedExportEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }

  async function handleExportAttendance() {
    if (!canExportAttendance || selectedExportEmployeeIds.size === 0) {
      setExportError("Chọn ít nhất một nhân viên để xuất dữ liệu.");
      return;
    }

    setExporting(true);
    setExportError("");

    try {
      const selectedIds = [...selectedExportEmployeeIds];
      const selectedEmployees = exportEmployees
        .filter((employee) => selectedExportEmployeeIds.has(employee.id))
        .map((employee) => ({ id: employee.id, name: employee.name }));
      const records = await fetchAttendanceRecordsForExport(exportMonthKey, selectedIds);
      const exportInput = {
        employees: selectedEmployees,
        exportedAt: new Date(),
        monthKey: exportMonthKey,
        records,
      };

      if (exportFormat === "excel") {
        downloadAttendanceExcel(exportInput);
      } else {
        await downloadAttendanceImages(exportInput);
      }

      setExportModalOpen(false);
      setSuccess(
        `Đã xuất chấm công tháng ${exportMonthKey.split("-").reverse().join("/")} của ${
          selectedEmployees.length
        } nhân viên.`
      );
    } catch (requestError) {
      setExportError(getErrorMessage(requestError, "Không xuất được dữ liệu chấm công."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageContainer maxWidth="none">
        <ConfigNotice />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className={`grid w-full rounded-2xl bg-white p-1 shadow-soft ring-1 ring-coal/5 sm:w-auto ${
              canViewAllHistory ? "grid-cols-3" : "grid-cols-2"
            }`}
            role="tablist"
          >
            <button
              aria-selected={activeTab === "clock"}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:gap-2 sm:px-4 sm:text-sm ${
                activeTab === "clock" ? "bg-coal text-white" : "text-coal/60 hover:bg-coal/5"
              }`}
              disabled={!canClock}
              onClick={() => setActiveTab("clock")}
              role="tab"
              type="button"
            >
              <Clock className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Chấm</span>
              <span className="hidden sm:inline">Chấm công</span>
            </button>
            <button
              aria-selected={activeTab === "history"}
              className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:gap-2 sm:px-4 sm:text-sm ${
                activeTab === "history" ? "bg-coal text-white" : "text-coal/60 hover:bg-coal/5"
              }`}
              disabled={!canViewHistory}
              onClick={() => setActiveTab("history")}
              role="tab"
              type="button"
            >
              <History className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">Lịch sử</span>
            </button>
            {canViewAllHistory ? (
              <button
                aria-selected={activeTab === "team-history"}
                className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-xs font-extrabold transition sm:gap-2 sm:px-3 sm:text-sm ${
                  activeTab === "team-history"
                    ? "bg-coal text-white"
                    : "text-coal/60 hover:bg-coal/5"
                }`}
                onClick={() => setActiveTab("team-history")}
                role="tab"
                type="button"
              >
                <UsersRound className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Toàn bộ nhân viên</span>
                <span className="sm:hidden">Toàn bộ</span>
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {canExportAttendance ? (
              <Button className="w-full sm:w-auto" onClick={() => void openExportModal()} variant="secondary">
                <Download className="h-4 w-4" />
                Xuất chấm công
              </Button>
            ) : null}
            <div className="hidden min-w-0 truncate rounded-2xl bg-white px-4 py-3 text-sm font-bold text-coal/60 shadow-soft ring-1 ring-coal/5 sm:block">
              {displayName}
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-moss-200 bg-moss-50 px-5 py-4 text-sm font-bold text-moss-700">
            {success}
          </div>
        ) : null}

        {activeTab === "clock" ? (
          <section className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow-soft ring-1 ring-moss-100 sm:p-5">
            {openLoading ? (
              <Spinner label="Đang tải ca làm..." />
            ) : (
              <>
                <div className="flex justify-center pt-4">
                  <button
                    aria-label={isTodayCompleted ? "Đã tan làm" : isClockedIn ? "Tan làm" : "Chấm công"}
                    className={`flex h-44 w-44 flex-col items-center justify-center rounded-full text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isClockedIn
                        ? "bg-gradient-to-b from-red-500 to-red-800 shadow-[0_0_0_12px_rgba(239,68,68,0.16),0_22px_45px_rgba(127,29,29,0.24)]"
                        : "bg-gradient-to-b from-moss-400 to-moss-800 shadow-[0_0_0_12px_rgba(111,129,85,0.18),0_22px_45px_rgba(16,32,24,0.20)]"
                    }`}
                    disabled={!canClock || submitting || isTodayCompleted}
                    onClick={handleClockButton}
                    type="button"
                  >
                    {submitting ? (
                      <RotateCcw className="h-9 w-9 animate-spin" />
                    ) : isClockedIn || isTodayCompleted ? (
                      <LogOut className="h-10 w-10" />
                    ) : (
                      <Fingerprint className="h-10 w-10" />
                    )}
                    <span className="mt-3 text-lg font-extrabold">
                      {isTodayCompleted ? "Đã tan làm" : isClockedIn ? "Tan làm" : "Vào ca"}
                    </span>
                  </button>
                </div>

                <div className="mt-8 text-center">
                  <p className="text-3xl font-extrabold text-coal">{formatClockTime(now)}</p>
                  <p className="mt-2 text-xs font-bold capitalize text-coal/50">
                    {currentDateFormatter.format(now)}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-coal/45">
                    {isClockedIn
                      ? "Nhấn tan làm để kết thúc ca."
                      : isTodayCompleted
                        ? "Hôm nay đã hoàn thành ca."
                      : "Cần bật định vị để chấm công."}
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-4 gap-1 rounded-2xl bg-white p-3 shadow-sm">
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Vào ca</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {formatTime(openRecord?.clock_in_at)}
                    </p>
                  </div>
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Tan làm</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {formatTime(openRecord?.clock_out_at)}
                    </p>
                  </div>
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Thời gian</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {openRecord ? formatRecordDuration(openRecord, now) : "--"}
                    </p>
                  </div>
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Vị trí</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {formatLocation(clockInLocation)}
                    </p>
                  </div>
                </div>

                {openRecord ? (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-bold text-coal/65 shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-moss-50 text-moss-700">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-coal">
                        {isClockedIn ? "Đã lưu vị trí vào ca" : "Ca đã hoàn thành"}
                      </p>
                      {clockInLocation ? (
                        <a
                          className="mt-1 inline-flex items-center gap-1 text-xs font-extrabold text-moss-700"
                          href={getLocationUrl(clockInLocation)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Mở vị trí
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {cashCheck && !cashCheck.checked_at ? (
                  <button
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-sm font-bold text-amber-900 transition hover:bg-amber-100"
                    onClick={() => setCashModalOpen(true)}
                    type="button"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700">
                      <Banknote className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold">Cần xác nhận tiền trong két</span>
                      <span className="mt-1 block text-xs font-semibold text-amber-800/75">
                        Số hệ thống: {formatCurrency(Number(cashCheck.expected_cash))}
                      </span>
                    </span>
                  </button>
                ) : cashCheck ? (
                  <section className={`mt-4 overflow-hidden rounded-2xl border ${cashCheck.is_match ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <div className="flex items-center gap-3 px-3 py-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ${cashCheck.is_match ? "text-emerald-700" : "text-red-700"}`}>
                        <Banknote className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`font-extrabold ${cashCheck.is_match ? "text-emerald-950" : "text-red-950"}`}>
                          {cashCheck.is_match ? "Đã xác nhận tiền két khớp" : "Đã xác nhận tiền két không khớp"}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-coal/50">Tiền mặt đã đối soát trong ca hiện tại</p>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-px bg-white/70">
                      <div className="p-3">
                        <dt className="text-[11px] font-bold text-coal/45">Số hệ thống</dt>
                        <dd className="mt-1 text-sm font-black tabular-nums text-coal">{formatCurrency(Number(cashCheck.expected_cash))}</dd>
                      </div>
                      <div className="p-3">
                        <dt className="text-[11px] font-bold text-coal/45">Số đã xác nhận</dt>
                        <dd className="mt-1 text-sm font-black tabular-nums text-coal">{formatCurrency(Number(cashCheck.actual_cash ?? 0))}</dd>
                      </div>
                    </dl>
                    {cashCheck.reason ? <p className="border-t border-red-200 px-3 py-2.5 text-xs font-semibold leading-5 text-red-800">Lý do: {cashCheck.reason}</p> : null}
                  </section>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="mx-auto w-full max-w-7xl rounded-[2rem] bg-white p-4 shadow-soft ring-1 ring-coal/5 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-extrabold text-coal">Lịch sử chấm công</h3>
                <p className="mt-1 text-xs font-bold text-coal/45">
                  {monthDays.length} ngày · {historySummary.totalShifts} ca · {historySummary.totalDuration}
                </p>
              </div>
              <label className="relative">
                <span className="sr-only">Chọn tháng</span>
                <input
                  className="w-36 rounded-full border border-coal/20 bg-white px-3 py-2 text-xs font-extrabold text-coal outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
                  onChange={(event) => setMonthKey(event.target.value || getVietnamMonthKey())}
                  type="month"
                  value={monthKey}
                />
                <span className="pointer-events-none absolute -bottom-5 right-1 hidden text-[10px] font-bold text-coal/35 sm:block">
                  {formatMonthLabel(monthKey)}
                </span>
              </label>
            </div>

            {historyLoading ? (
              <Spinner label="Đang tải lịch sử..." />
            ) : (
              <div className="mt-5 space-y-3">
                <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-coal">{displayName}</p>
                    <p className="mt-0.5 text-xs font-semibold text-coal/45">Tổng quan ca làm trong {formatMonthLabel(monthKey).toLocaleLowerCase("vi")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-coal/60">
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" />Trong tuần</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-200" />Thứ 7</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-200" />Chủ nhật</span>
                    <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Có ca</span>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
                  <div className="grid grid-cols-7 gap-px text-center text-[10px] font-black uppercase sm:text-xs">
                    {calendarWeekdayLabels.map((label, index) => (
                      <div
                        className={index === 5 ? "bg-sky-700 px-1 py-2.5 text-white" : index === 6 ? "bg-rose-700 px-1 py-2.5 text-white" : "bg-zinc-600 px-1 py-2.5 text-white"}
                        key={label}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px">
                    {calendarSlots.map((workDate, index) => {
                      if (!workDate) {
                        return <div className="min-h-24 bg-slate-50 sm:min-h-32" key={`empty-${index}`} />;
                      }

                      const record = historyByDay.get(workDate) ?? null;
                      const dayKind = getDayKind(workDate);
                      const dayTone = dayKind === "saturday" ? "bg-sky-50" : dayKind === "sunday" ? "bg-rose-50" : "bg-white";

                      return (
                        <article className={`group relative min-h-24 p-1.5 sm:min-h-32 sm:p-2 ${dayTone}`} key={workDate}>
                          <div className="flex items-center gap-1">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black sm:h-7 sm:w-7 ${dayKind === "saturday" ? "bg-sky-200 text-sky-900" : dayKind === "sunday" ? "bg-rose-200 text-rose-900" : "bg-slate-100 text-slate-700"}`}>
                              {getDayNumber(workDate)}
                            </span>
                          </div>

                          {record ? (
                            <button
                              aria-label={`Xem ca ngày ${getDayNumber(workDate)}, vào ${formatTime(record.clock_in_at)}, tan ${formatTime(record.clock_out_at)}`}
                              className={`mt-1.5 w-full rounded-lg px-0.5 py-1.5 text-center text-[10px] font-black leading-4 tabular-nums transition hover:-translate-y-0.5 hover:shadow-sm sm:px-1.5 sm:text-xs ${record.clock_out_at ? "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-200" : "bg-amber-100 text-amber-950 ring-1 ring-amber-200"}`}
                              onClick={() => openHistoryAttendanceDetail(record)}
                              type="button"
                            >
                              <span className="block whitespace-nowrap">{formatTime(record.clock_in_at)}</span>
                              <span className="block whitespace-nowrap opacity-70">{record.clock_out_at ? formatTime(record.clock_out_at) : "Đang chạy"}</span>
                            </button>
                          ) : (
                            <p className="mt-4 text-center text-[9px] font-semibold text-coal/25 sm:text-[10px]">Không có ca</p>
                          )}

                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "team-history" && canViewAllHistory ? (
          <section className="mx-auto w-full rounded-2xl bg-white p-3 shadow-soft ring-1 ring-coal/5 sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-coal sm:text-xl">Lịch sử toàn bộ nhân viên</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-coal/45">
                  Đang hiện {allHistoryMatrix.length}/{allHistoryEmployees.length} nhân viên · {allHistoryRecords.length} ca · {monthDays.length} ngày
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative block sm:w-64">
                  <span className="sr-only">Tìm nhân viên</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-coal/35" />
                  <input
                    className="h-10 w-full rounded-full border border-coal/20 bg-white pl-9 pr-4 text-xs font-bold text-coal outline-none transition placeholder:text-coal/35 focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Tìm theo tên nhân viên"
                    type="search"
                    value={employeeSearch}
                  />
                </label>
                <label className="relative">
                  <span className="sr-only">Chọn tháng toàn bộ nhân viên</span>
                  <input
                    className="h-10 w-full rounded-full border border-coal/20 bg-white px-3 text-xs font-extrabold text-coal outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100 sm:w-36"
                    onChange={(event) => setMonthKey(event.target.value || getVietnamMonthKey())}
                    type="month"
                    value={monthKey}
                  />
                </label>
              </div>
            </div>

            {allHistoryLoading ? (
              <Spinner label="Đang tải lịch sử toàn bộ nhân viên..." />
            ) : (
              <div className="mt-4 space-y-3 sm:mt-5">
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-coal/60 sm:gap-3">
                  <span>Chú giải:</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" />Trong tuần</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-sky-200" />Thứ 7</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-200" />Chủ nhật</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Hoàn thành ca</span>
                  <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Đang trong ca</span>
                </div>

              <div className="max-h-[68dvh] overflow-auto rounded-xl border border-coal/10 sm:rounded-2xl">
                <table className="w-max min-w-full border-separate border-spacing-0 text-center text-xs">
                  <thead className="sticky top-0 z-20 font-extrabold text-white">
                    <tr>
                      <th className="sticky left-0 z-30 min-w-[132px] border-b border-r border-zinc-500 bg-zinc-700 px-3 py-3 text-left sm:min-w-48 sm:px-4">Nhân viên</th>
                      {monthDays.map((workDate) => {
                        const dayKind = getDayKind(workDate);
                        return (
                          <th
                            className={`w-12 min-w-12 border-b border-r px-1 py-2 sm:w-[54px] sm:min-w-[54px] ${dayKind === "saturday" ? "border-sky-600 bg-sky-700" : dayKind === "sunday" ? "border-rose-600 bg-rose-700" : "border-zinc-500 bg-zinc-600"}`}
                            key={workDate}
                            title={formatShortDate(workDate)}
                          >
                            <span className="block text-[9px] opacity-80">{getShortWeekday(workDate)}</span>
                            <span className="mt-0.5 block text-sm">{getDayNumber(workDate)}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {allHistoryMatrix.map((employee) => (
                      <tr className="group" key={employee.employeeId}>
                        <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-3 text-left shadow-[4px_0_8px_rgba(15,23,42,0.04)] group-hover:bg-moss-50 sm:px-4">
                          <span className="block max-w-[108px] truncate text-sm font-extrabold text-coal sm:max-w-40" title={employee.employeeName}>{employee.employeeName}</span>
                          <span className="mt-0.5 block text-[10px] font-bold text-coal/40">{employee.totalShifts} ca trong tháng</span>
                        </th>
                        {employee.records.map(({ record, workDate }) => {
                          const dayKind = getDayKind(workDate);
                          const cellTone = dayKind === "saturday" ? "bg-sky-50" : dayKind === "sunday" ? "bg-rose-50" : "bg-white";
                          return (
                            <td
                              className={`h-[58px] w-12 min-w-12 border-b border-r border-slate-200 p-1 align-middle sm:h-[62px] sm:w-[54px] sm:min-w-[54px] ${cellTone}`}
                              key={workDate}
                              title={record ? `${employee.employeeName} · ${formatShortDate(workDate)} · ${formatTime(record.clock_in_at)}–${formatTime(record.clock_out_at)}` : `${employee.employeeName} · ${formatShortDate(workDate)} · Không có ca`}
                            >
                              {record ? (
                                <button
                                  aria-label={`Xem chi tiết ca của ${employee.employeeName} ngày ${getDayNumber(workDate)}`}
                                  className={`w-full rounded-md px-0.5 py-1 text-[9px] font-black leading-3.5 transition hover:-translate-y-0.5 hover:shadow-md ${record.clock_out_at ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200" : "bg-amber-100 text-amber-900 ring-1 ring-amber-200"}`}
                                  onClick={() => openTeamAttendanceDetail(employee.employeeName, record)}
                                  type="button"
                                >
                                  <span className="block">{formatTime(record.clock_in_at)}</span>
                                  <span className="block opacity-70">{record.clock_out_at ? formatTime(record.clock_out_at) : "Đang chạy"}</span>
                                </button>
                              ) : (
                                <span className="text-coal/20">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!allHistoryMatrix.length ? (
                      <tr>
                        <td className="px-4 py-10 text-center font-semibold text-coal/50" colSpan={monthDays.length + 1}>
                          {employeeSearch ? "Không tìm thấy nhân viên phù hợp." : "Chưa có nhân viên để hiển thị."}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </section>
        ) : null}
      <Modal
        footer={<Button onClick={closeAttendanceDetail} variant="secondary">Đóng</Button>}
        onClose={closeAttendanceDetail}
        open={Boolean(selectedHistoryAttendance)}
        size="sm"
        title="Chi tiết ca chấm công"
      >
        {selectedHistoryAttendance ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/40">Nhân viên</p>
              <p className="mt-1 text-lg font-black text-coal">{displayName}</p>
              <p className="mt-1 text-sm font-bold text-coal/55">{formatShortDate(selectedHistoryAttendance.work_date)}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-emerald-50 p-3">
                <dt className="text-[11px] font-bold text-emerald-700">Vào ca</dt>
                <dd className="mt-1 font-black text-emerald-950">{formatTime(selectedHistoryAttendance.clock_in_at)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-bold text-slate-500">Tan làm</dt>
                <dd className={`mt-1 font-black ${selectedHistoryAttendance.clock_out_at ? "text-slate-950" : "text-amber-700"}`}>
                  {selectedHistoryAttendance.clock_out_at ? formatTime(selectedHistoryAttendance.clock_out_at) : "Ca đang chạy"}
                </dd>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <dt className="text-[11px] font-bold text-blue-700">Thời gian</dt>
                <dd className="mt-1 font-black text-blue-950">{formatRecordDuration(selectedHistoryAttendance, now)}</dd>
              </div>
            </dl>
            <AttendanceCashDetail cashCheck={detailCashCheck} loading={detailCashLoading} />
          </div>
        ) : null}
      </Modal>
      <Modal
        footer={
          selectedTeamAttendance ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button onClick={closeAttendanceDetail} variant="secondary">Đóng</Button>
              {canUpdateHistory ? (
                <Button onClick={() => openEditModal(selectedTeamAttendance.record)}>
                  <Edit3 className="h-4 w-4" /> Chỉnh sửa
                </Button>
              ) : null}
              {canDeleteHistory ? (
                <Button
                  isLoading={deletingId === selectedTeamAttendance.record.id}
                  onClick={() => void handleDeleteRecord(selectedTeamAttendance.record)}
                  variant="danger"
                >
                  <Trash2 className="h-4 w-4" /> Xóa
                </Button>
              ) : null}
            </div>
          ) : null
        }
        onClose={closeAttendanceDetail}
        open={Boolean(selectedTeamAttendance)}
        size="sm"
        title="Chi tiết chấm công nhân viên"
      >
        {selectedTeamAttendance ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 px-4 py-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-coal/40">Nhân viên</p>
              <p className="mt-1 text-lg font-black text-coal">{selectedTeamAttendance.employeeName}</p>
              <p className="mt-1 text-sm font-bold text-coal/55">{formatShortDate(selectedTeamAttendance.record.work_date)}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-emerald-50 p-3">
                <dt className="text-[11px] font-bold text-emerald-700">Vào ca</dt>
                <dd className="mt-1 font-black text-emerald-950">{formatTime(selectedTeamAttendance.record.clock_in_at)}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-[11px] font-bold text-slate-500">Kết thúc</dt>
                <dd className={`mt-1 font-black ${selectedTeamAttendance.record.clock_out_at ? "text-slate-950" : "text-amber-700"}`}>
                  {selectedTeamAttendance.record.clock_out_at ? formatTime(selectedTeamAttendance.record.clock_out_at) : "Ca đang chạy"}
                </dd>
              </div>
              <div className="rounded-xl bg-blue-50 p-3">
                <dt className="text-[11px] font-bold text-blue-700">Thời gian</dt>
                <dd className="mt-1 font-black text-blue-950">{formatRecordDuration(selectedTeamAttendance.record, now)}</dd>
              </div>
            </dl>
            <AttendanceCashDetail cashCheck={detailCashCheck} loading={detailCashLoading} />
            {getClockInLocation(selectedTeamAttendance.record) ? (
              <a
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-moss-50 px-4 py-3 text-sm font-extrabold text-moss-800 ring-1 ring-moss-200 transition hover:bg-moss-100"
                href={getLocationUrl(getClockInLocation(selectedTeamAttendance.record)!)}
                rel="noreferrer"
                target="_blank"
              >
                <LocateFixed className="h-4 w-4" /> Xem vị trí chấm công
              </a>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-500">Ca này không có dữ liệu vị trí.</p>
            )}
          </div>
        ) : null}
      </Modal>
      <Modal
        footer={
          cashMismatch ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button
                disabled={cashSaving}
                onClick={() => {
                  setCashMismatch(false);
                  setCashCheckError("");
                }}
                variant="secondary"
              >
                Quay lại
              </Button>
              <Button isLoading={cashSaving} onClick={handleSubmitCashMismatch}>
                <Save className="h-4 w-4" /> Lưu đối soát
              </Button>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button
                disabled={cashSaving}
                onClick={() => {
                  setCashMismatch(true);
                  setCashCheckError("");
                }}
                variant="secondary"
              >
                Không đúng
              </Button>
              <Button isLoading={cashSaving} onClick={handleConfirmCashMatches}>
                <CheckCircle2 className="h-4 w-4" /> Đúng
              </Button>
            </div>
          )
        }
        onClose={() => {
          if (!cashSaving) {
            setCashModalOpen(false);
          }
        }}
        open={Boolean(cashCheck && cashModalOpen)}
        size="sm"
        title="Xác nhận tiền trong két"
      >
        {cashCheck ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-moss-50 px-4 py-5 text-center ring-1 ring-moss-100">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-moss-700 shadow-sm">
                <Banknote className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-bold text-coal/60">Tiền mặt trong két hiện có phải là</p>
              <p className="mt-1 text-3xl font-black tabular-nums text-coal">
                {formatCurrency(Number(cashCheck.expected_cash))}
              </p>
              <p className="mt-2 text-xs font-semibold text-coal/45">
                Chỉ đối chiếu tiền mặt, không bao gồm tiền chuyển khoản
              </p>
            </div>

            {cashMismatch ? (
              <div className="space-y-4">
                <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Nhập đúng số tiền đã đếm trong két và lý do chênh lệch.
                </div>
                <Input
                  className="text-base font-extrabold tabular-nums"
                  inputMode="numeric"
                  label="Số tiền thực tế trong két"
                  onChange={(event) =>
                    setCashActual(normalizeIntegerInput(event.target.value))
                  }
                  placeholder="Nhập số tiền thực tế"
                  value={formatIntegerInput(cashActual)}
                />
                <Textarea
                  label="Lý do không khớp"
                  onChange={(event) => setCashReason(event.target.value)}
                  placeholder="Ví dụ: thiếu tiền lẻ bàn giao, chi phí chưa ghi nhận..."
                  rows={3}
                  value={cashReason}
                />
              </div>
            ) : (
              <p className="text-center text-sm font-semibold leading-6 text-coal/60">
                Hãy đếm tiền mặt thực tế trong két rồi chọn câu trả lời bên dưới.
              </p>
            )}

            {cashCheckError ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {cashCheckError}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={exporting}
              onClick={() => setExportModalOpen(false)}
              variant="secondary"
            >
              Hủy
            </Button>
            <Button
              disabled={selectedExportEmployeeIds.size === 0 || exportLoading}
              isLoading={exporting}
              onClick={() => void handleExportAttendance()}
            >
              <Download className="h-4 w-4" />
              Xuất dữ liệu
            </Button>
          </div>
        }
        onClose={() => {
          if (!exporting) {
            setExportModalOpen(false);
          }
        }}
        open={exportModalOpen}
        size="lg"
        title="Xuất dữ liệu chấm công"
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-extrabold text-coal">Tháng cần xuất</span>
              <input
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-coal outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
                onChange={(event) =>
                  setExportMonthKey(event.target.value || getVietnamMonthKey())
                }
                type="month"
                value={exportMonthKey}
              />
            </label>
            <div>
              <p className="mb-2 text-sm font-extrabold text-coal">Định dạng file</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-extrabold transition ${
                    exportFormat === "excel"
                      ? "border-moss-600 bg-moss-50 text-moss-800 ring-2 ring-moss-100"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => setExportFormat("excel")}
                  type="button"
                >
                  <FileSpreadsheet className="h-5 w-5" />
                  Excel (.xls)
                </button>
                <button
                  className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-extrabold transition ${
                    exportFormat === "image"
                      ? "border-moss-600 bg-moss-50 text-moss-800 ring-2 ring-moss-100"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  onClick={() => setExportFormat("image")}
                  type="button"
                >
                  <FileImage className="h-5 w-5" />
                  Ảnh
                </button>
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 font-extrabold text-slate-950">
                  <UsersRound className="h-4 w-4" />
                  Chọn nhân viên
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedExportEmployeeIds.size}/{exportEmployees.length} người được chọn
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-extrabold text-slate-700">
                <input
                  checked={allExportEmployeesSelected}
                  className="h-4 w-4 rounded border-slate-300 accent-moss-700"
                  disabled={exportLoading || exportEmployees.length === 0}
                  onChange={toggleAllExportEmployees}
                  type="checkbox"
                />
                Tất cả
              </label>
            </div>

            {exportLoading ? (
              <Spinner label="Đang tải nhân viên..." />
            ) : exportEmployees.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Không có nhân viên để xuất.
              </p>
            ) : (
              <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
                {exportEmployees.map((employee) => (
                  <label
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
                    key={employee.id}
                  >
                    <input
                      checked={selectedExportEmployeeIds.has(employee.id)}
                      className="h-4 w-4 flex-none rounded border-slate-300 accent-moss-700"
                      onChange={() => toggleExportEmployee(employee.id)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                      {employee.name}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                        employee.isActive
                          ? "bg-moss-100 text-moss-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {employee.isActive ? "Đang hoạt động" : "Đã khóa"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          {exportError ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {exportError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={submitting || clockOutCashLoading}
              onClick={() => setEditingRecord(null)}
              type="button"
              variant="secondary"
            >
              Hủy
            </Button>
            <Button isLoading={submitting} onClick={() => void handleSaveEdit()} type="button">
              <Save className="h-4 w-4" />
              Lưu
            </Button>
          </div>
        }
        onClose={() => {
          if (!submitting) {
            setEditingRecord(null);
          }
        }}
        open={Boolean(editingRecord)}
        size="sm"
        title="Sửa lịch sử chấm công"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-coal">Giờ chấm công</span>
            <input
              className="w-full rounded-2xl border border-coal/10 bg-white px-4 py-3 text-sm font-bold text-coal outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
              onChange={(event) =>
                setEditForm((current) => ({ ...current, clockIn: event.target.value }))
              }
              type="datetime-local"
              value={editForm.clockIn}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-coal">Giờ tan làm</span>
            <input
              className="w-full rounded-2xl border border-coal/10 bg-white px-4 py-3 text-sm font-bold text-coal outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100"
              onChange={(event) =>
                setEditForm((current) => ({ ...current, clockOut: event.target.value }))
              }
              type="datetime-local"
              value={editForm.clockOut}
            />
          </label>
          {editError ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {editError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={submitting}
              onClick={closeClockOutConfirmation}
              type="button"
              variant="secondary"
            >
              Hủy
            </Button>
            <Button disabled={clockOutCashLoading} isLoading={submitting} onClick={() => void handleConfirmClockOut()} type="button" variant="danger">
              <CheckCircle2 className="h-4 w-4" />
              Xác nhận tan làm
            </Button>
          </div>
        }
        onClose={closeClockOutConfirmation}
        open={confirmClockOutOpen}
        size="sm"
        title="Xác nhận tan làm"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Bạn có chắc muốn kết thúc ca làm hiện tại?
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <dt className="font-bold text-coal/45">Chấm công</dt>
              <dd className="mt-1 font-extrabold text-coal">
                {formatDateTime(openRecord?.clock_in_at)}
              </dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <dt className="font-bold text-coal/45">Thời gian hiện tại</dt>
              <dd className="mt-1 font-extrabold text-coal">{formatDateTime(now.toISOString())}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <dt className="font-bold text-coal/45">Tổng giờ tạm tính</dt>
              <dd className="mt-1 font-extrabold text-coal">
                {openRecord ? formatRecordDuration(openRecord, now) : "--"}
              </dd>
            </div>
          </dl>
          {clockOutCashLoading ? (
            <Spinner label="Đang đối chiếu tiền két..." />
          ) : clockOutCashSession ? (
            <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-amber-950">Chốt két bàn giao</h4>
                  <p className="mt-0.5 text-xs font-semibold text-amber-700">Số thực đếm sẽ được nhân viên ca sau đối chiếu khi vào ca.</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-amber-700">Hệ thống</p>
                  <p className="font-black tabular-nums text-amber-950">{formatCurrency(Number(clockOutCashSession.expected_cash))}</p>
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-extrabold text-coal">Tiền thực tế trong két</span>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-amber-200 bg-white px-3 pr-10 text-right text-lg font-black tabular-nums outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                    inputMode="numeric"
                    onChange={(event) => setClockOutCashActual(normalizeIntegerInput(event.target.value))}
                    placeholder="0"
                    type="text"
                    value={formatIntegerInput(clockOutCashActual)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">đ</span>
                </div>
              </label>
              {clockOutCashActual.trim() ? (
                <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold ${Number(clockOutCashActual) === Number(clockOutCashSession.expected_cash) ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  <span>Chênh lệch</span>
                  <span className="font-black tabular-nums">{formatCurrency(Number(clockOutCashActual) - Number(clockOutCashSession.expected_cash))}</span>
                </div>
              ) : null}
              {clockOutCashActual.trim() && Number(clockOutCashActual) !== Number(clockOutCashSession.expected_cash) ? (
                <Textarea label="Lý do chênh lệch" onChange={(event) => setClockOutCashNote(event.target.value)} placeholder="Bắt buộc khi tiền thực tế không khớp hệ thống" value={clockOutCashNote} />
              ) : null}
            </section>
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">Ca này không có phiên két đang mở.</p>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
}
