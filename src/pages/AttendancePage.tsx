import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
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
  Trash2,
  UsersRound,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { PageContainer } from "../components/ui/Page";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import {
  downloadAttendanceExcel,
  downloadAttendanceImages,
} from "../lib/attendanceExport";
import { getErrorMessage } from "../lib/errors";
import {
  clockInAttendance,
  clockOutAttendance,
  deleteAttendanceRecord,
  fetchAttendanceEmployees,
  fetchAttendanceRecords,
  fetchAttendanceRecordsForExport,
  fetchOpenAttendanceRecord,
  type AttendanceEmployee,
  type AttendanceLocationInput,
  updateAttendanceRecord,
} from "../services/attendance";
import type { AttendanceRecord } from "../types";

type AttendanceTab = "clock" | "history";
type AttendanceExportFormat = "excel" | "image";

type AttendanceEditForm = {
  clockIn: string;
  clockOut: string;
};

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
  return new Date(`${value}T00:00:00+07:00`);
}

function formatShortDate(value: string) {
  const date = getWorkDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${weekdayLabels[date.getDay()]}, ${day}/${month}`;
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
    return "Trình duyệt đang chặn định vị. Hãy cho phép truy cập vị trí để chấm công.";
  }

  if (error.code === error.TIMEOUT) {
    return "Lấy vị trí quá lâu. Hãy thử lại ở nơi có tín hiệu tốt hơn.";
  }

  return "Không lấy được vị trí hiện tại.";
}

async function getCurrentAttendanceLocation(): Promise<AttendanceLocationInput> {
  if (!navigator.geolocation) {
    throw new Error("Trình duyệt không hỗ trợ định vị.");
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
  const [confirmClockOutOpen, setConfirmClockOutOpen] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [editError, setEditError] = useState("");
  const [editForm, setEditForm] = useState<AttendanceEditForm>({ clockIn: "", clockOut: "" });
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
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
  const canUpdateHistory = canAccess("attendance.history.update");
  const canDeleteHistory = canAccess("attendance.history.delete");
  const canExportAttendance = canAccess("attendance.export");
  const displayName = profile?.full_name || user?.email || "Nhân viên";
  const isClockedIn = Boolean(openRecord && !openRecord.clock_out_at);
  const isTodayCompleted = Boolean(openRecord?.clock_out_at);
  const clockInLocation = getClockInLocation(openRecord);
  const canManageHistory = canUpdateHistory || canDeleteHistory;
  const historyGridColumns = canManageHistory
    ? "grid-cols-[1.25fr_0.85fr_0.85fr_0.85fr_5rem]"
    : "grid-cols-[1.35fr_0.9fr_0.9fr_0.95fr]";
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
      setOpenRecord(await fetchOpenAttendanceRecord(user.id));
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
    }
  }, [activeTab, loadHistory]);

  useEffect(() => {
    if (activeTab === "clock" && !canClock && canViewHistory) {
      setActiveTab("history");
    }
  }, [activeTab, canClock, canViewHistory]);

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

  function handleClockButton() {
    if (!canClock || openLoading || submitting || isTodayCompleted) {
      return;
    }

    setError("");
    setSuccess("");

    if (isClockedIn) {
      setConfirmClockOutOpen(true);
      return;
    }

    void handleClockIn();
  }

  async function handleConfirmClockOut() {
    if (!openRecord || !canClock) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      let location: AttendanceLocationInput | null = null;

      try {
        location = await getCurrentAttendanceLocation();
      } catch {
        location = null;
      }

      const closedRecord = await clockOutAttendance(openRecord.id, location);
      setOpenRecord(null);
      setConfirmClockOutOpen(false);
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

  function openEditModal(record: AttendanceRecord) {
    if (!canUpdateHistory) {
      return;
    }

    setEditError("");
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
      setSuccess("Đã cập nhật lịch sử chấm công.");
      await Promise.all([loadOpenRecord(), loadHistory()]);
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
      setSuccess("Đã xóa lịch sử chấm công.");
      await Promise.all([loadOpenRecord(), loadHistory()]);
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
    <PageContainer maxWidth="5xl">
        <ConfigNotice />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="grid w-full grid-cols-2 rounded-2xl bg-white p-1 shadow-soft ring-1 ring-coal/5 sm:w-auto"
            role="tablist"
          >
            <button
              aria-selected={activeTab === "clock"}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${
                activeTab === "clock" ? "bg-coal text-white" : "text-coal/60 hover:bg-coal/5"
              }`}
              disabled={!canClock}
              onClick={() => setActiveTab("clock")}
              role="tab"
              type="button"
            >
              <Clock className="h-4 w-4" />
              Chấm công
            </button>
            <button
              aria-selected={activeTab === "history"}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${
                activeTab === "history" ? "bg-coal text-white" : "text-coal/60 hover:bg-coal/5"
              }`}
              disabled={!canViewHistory}
              onClick={() => setActiveTab("history")}
              role="tab"
              type="button"
            >
              <History className="h-4 w-4" />
              Lịch sử
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {canExportAttendance ? (
              <Button onClick={() => void openExportModal()} variant="secondary">
                <Download className="h-4 w-4" />
                Xuất chấm công
              </Button>
            ) : null}
            <div className="min-w-0 truncate rounded-2xl bg-white px-4 py-3 text-sm font-bold text-coal/60 shadow-soft ring-1 ring-coal/5">
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
                    className={`flex h-44 w-44 flex-col items-center justify-center rounded-full text-white shadow-[0_0_0_12px_rgba(111,129,85,0.18),0_22px_45px_rgba(16,32,24,0.20)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isClockedIn
                        ? "bg-gradient-to-b from-moss-500 to-moss-900"
                        : "bg-gradient-to-b from-moss-400 to-moss-800"
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
              </>
            )}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="mx-auto max-w-4xl rounded-[2rem] bg-white p-4 shadow-soft ring-1 ring-coal/5 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-extrabold text-coal">Lịch sử chấm công</h3>
                <p className="mt-1 text-xs font-bold text-coal/45">
                  {historySummary.totalShifts} ca - {historySummary.totalDuration}
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
            ) : historyRecords.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  description="Tháng này chưa có ca chấm công nào."
                  icon={CalendarDays}
                  title="Chưa có dữ liệu"
                />
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-coal/10">
                <div
                  className={`grid ${historyGridColumns} bg-zinc-500 px-3 py-3 text-xs font-extrabold text-white sm:px-5`}
                >
                  <span>Ngày</span>
                  <span>Vào ca</span>
                  <span>Tan làm</span>
                  <span>Thời gian</span>
                  {canManageHistory ? <span className="text-right">Sửa/Xóa</span> : null}
                </div>
                {historyRecords.map((record) => {
                  const location = getClockInLocation(record);

                  return (
                    <div
                      className={`grid ${historyGridColumns} items-center border-t border-coal/8 px-3 py-3 text-xs font-bold text-coal sm:px-5 sm:text-sm`}
                      key={record.id}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{formatShortDate(record.work_date)}</span>
                        {location ? (
                          <a
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-extrabold text-moss-700"
                            href={getLocationUrl(location)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <LocateFixed className="h-3 w-3" />
                            GPS
                          </a>
                        ) : null}
                      </span>
                      <span>{formatTime(record.clock_in_at)}</span>
                      <span>{formatTime(record.clock_out_at)}</span>
                      <span>{formatRecordDuration(record, now)}</span>
                      {canManageHistory ? (
                        <span className="flex justify-end gap-1">
                          {canUpdateHistory ? (
                            <button
                              aria-label="Sửa ca chấm công"
                              className="flex h-8 w-8 items-center justify-center rounded-xl bg-coal/5 text-white transition hover:bg-coal hover:text-white"
                              onClick={() => openEditModal(record)}
                              type="button"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                          ) : null}
                          {canDeleteHistory ? (
                            <button
                              aria-label="Xóa ca chấm công"
                              className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-700 transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={deletingId === record.id}
                              onClick={() => void handleDeleteRecord(record)}
                              type="button"
                            >
                              {deletingId === record.id ? (
                                <RotateCcw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
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
              disabled={submitting}
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
              onClick={() => setConfirmClockOutOpen(false)}
              type="button"
              variant="secondary"
            >
              Hủy
            </Button>
            <Button isLoading={submitting} onClick={() => void handleConfirmClockOut()} type="button">
              <CheckCircle2 className="h-4 w-4" />
              Xác nhận tan làm
            </Button>
          </div>
        }
        onClose={() => {
          if (!submitting) {
            setConfirmClockOutOpen(false);
          }
        }}
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
        </div>
      </Modal>
    </PageContainer>
  );
}
