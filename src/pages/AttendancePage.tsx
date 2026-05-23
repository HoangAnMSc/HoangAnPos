import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Edit3,
  Fingerprint,
  History,
  LocateFixed,
  LogOut,
  MapPin,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { ConfigNotice } from "../components/ui/ConfigNotice";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useAuth } from "../contexts/AuthContext";
import {
  clockInAttendance,
  clockOutAttendance,
  deleteAttendanceRecord,
  fetchAttendanceRecords,
  fetchOpenAttendanceRecord,
  type AttendanceLocationInput,
  updateAttendanceRecord,
} from "../services/attendance";
import type { AttendanceRecord } from "../types";

type AttendanceTab = "clock" | "history";

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

const weekdayLabels = ["Chu nhat", "Thu 2", "Thu 3", "Thu 4", "Thu 5", "Thu 6", "Thu 7"];

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
  return `This month - ${Number(month)}/${year}`;
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
    return "Da luu GPS";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Trinh duyet dang chan dinh vi. Hay cho phep Location de cham cong.";
  }

  if (error.code === error.TIMEOUT) {
    return "Lay dinh vi qua lau. Hay thu lai o noi co tin hieu tot hon.";
  }

  return "Khong lay duoc dinh vi hien tai.";
}

async function getCurrentAttendanceLocation(): Promise<AttendanceLocationInput> {
  if (!navigator.geolocation) {
    throw new Error("Trinh duyet khong ho tro dinh vi.");
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
  const displayName = profile?.full_name || user?.email || "Nhan vien";
  const isClockedIn = Boolean(openRecord && !openRecord.clock_out_at);
  const isTodayCompleted = Boolean(openRecord?.clock_out_at);
  const clockInLocation = getClockInLocation(openRecord);
  const canManageHistory = canUpdateHistory || canDeleteHistory;
  const historyGridColumns = canManageHistory
    ? "grid-cols-[1.25fr_0.85fr_0.85fr_0.85fr_5rem]"
    : "grid-cols-[1.35fr_0.9fr_0.9fr_0.95fr]";

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
      setError(getErrorMessage(requestError, "Khong tai duoc trang thai cham cong."));
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
      setError(getErrorMessage(requestError, "Khong tai duoc lich su cham cong."));
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
      setError("Hom nay da cham cong va tan lam. Khong the cham cong lan 2.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const location = await getCurrentAttendanceLocation();
      const record = await clockInAttendance({ location });
      setOpenRecord(record);
      setSuccess(`Da cham cong luc ${formatDateTime(record.clock_in_at)}.`);

      if (canViewHistory) {
        await loadHistory();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Cham cong that bai."));
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
      setSuccess(`Da tan lam luc ${formatDateTime(closedRecord.clock_out_at)}.`);

      if (canViewHistory) {
        await loadHistory();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Tan lam that bai."));
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
      setEditError("Nhap gio cham cong.");
      return;
    }

    const clockInAt = vietnamDateTimeLocalToIso(editForm.clockIn);
    const clockOutAt = editForm.clockOut ? vietnamDateTimeLocalToIso(editForm.clockOut) : null;

    if (clockOutAt && new Date(clockOutAt).getTime() < new Date(clockInAt).getTime()) {
      setEditError("Gio tan lam phai sau gio cham cong.");
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
      setSuccess("Da cap nhat lich su cham cong.");
      await Promise.all([loadOpenRecord(), loadHistory()]);
    } catch (requestError) {
      setEditError(getErrorMessage(requestError, "Sua lich su cham cong that bai."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRecord(record: AttendanceRecord) {
    if (!canDeleteHistory) {
      return;
    }

    const confirmed = window.confirm(`Xoa ca cham cong ${formatShortDate(record.work_date)}?`);

    if (!confirmed) {
      return;
    }

    setDeletingId(record.id);
    setError("");
    setSuccess("");

    try {
      await deleteAttendanceRecord(record.id);
      setSuccess("Da xoa lich su cham cong.");
      await Promise.all([loadOpenRecord(), loadHistory()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Xoa lich su cham cong that bai."));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-5">
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
              Cham cong
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
              Lich su
            </button>
          </div>
          <div className="truncate rounded-2xl bg-white px-4 py-3 text-sm font-bold text-coal/60 shadow-soft ring-1 ring-coal/5">
            {displayName}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-700">
            {success}
          </div>
        ) : null}

        {activeTab === "clock" ? (
          <section className="mx-auto max-w-md rounded-[2rem] bg-[#f6f6f6] p-4 shadow-soft ring-1 ring-coal/5 sm:p-5">
            {openLoading ? (
              <Spinner label="Dang tai ca lam..." />
            ) : (
              <>
                <div className="flex justify-center pt-4">
                  <button
                    aria-label={isTodayCompleted ? "Da tan lam" : isClockedIn ? "Tan lam" : "Cham cong"}
                    className={`flex h-44 w-44 flex-col items-center justify-center rounded-full text-white shadow-[0_0_0_12px_rgba(16,185,129,0.16),0_22px_45px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isClockedIn
                        ? "bg-gradient-to-b from-orange-500 to-red-700"
                        : "bg-gradient-to-b from-emerald-500 to-emerald-900"
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
                      {isTodayCompleted ? "Da tan lam" : isClockedIn ? "Tan lam" : "Clock In"}
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
                      ? "Nhan tan lam de ket thuc ca."
                      : isTodayCompleted
                        ? "Hom nay da hoan thanh ca."
                      : "Can bat dinh vi de cham cong."}
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-4 gap-1 rounded-2xl bg-white p-3 shadow-sm">
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Clock In</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {formatTime(openRecord?.clock_in_at)}
                    </p>
                  </div>
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Clock Out</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {formatTime(openRecord?.clock_out_at)}
                    </p>
                  </div>
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Work Hours</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {openRecord ? formatRecordDuration(openRecord, now) : "--"}
                    </p>
                  </div>
                  <div className="min-w-0 px-1">
                    <p className="truncate text-xs font-semibold text-coal/45">Vi tri</p>
                    <p className="mt-2 truncate text-sm font-extrabold text-coal">
                      {formatLocation(clockInLocation)}
                    </p>
                  </div>
                </div>

                {openRecord ? (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-bold text-coal/65 shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-coal">
                        {isClockedIn ? "Da luu dinh vi vao ca" : "Ca da hoan thanh"}
                      </p>
                      {clockInLocation ? (
                        <a
                          className="mt-1 inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700"
                          href={getLocationUrl(clockInLocation)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Mo vi tri
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
                <h3 className="text-xl font-extrabold text-coal">Attendance Log</h3>
                <p className="mt-1 text-xs font-bold text-coal/45">
                  {historySummary.totalShifts} ca - {historySummary.totalDuration}
                </p>
              </div>
              <label className="relative">
                <span className="sr-only">Chon thang</span>
                <input
                  className="w-36 rounded-full border border-coal/20 bg-white px-3 py-2 text-xs font-extrabold text-coal outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
              <Spinner label="Dang tai lich su..." />
            ) : historyRecords.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  description="Thang nay chua co ca cham cong nao."
                  icon={CalendarDays}
                  title="Chua co du lieu"
                />
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-coal/10">
                <div
                  className={`grid ${historyGridColumns} bg-zinc-500 px-3 py-3 text-xs font-extrabold text-white sm:px-5`}
                >
                  <span>Date</span>
                  <span>Clock In</span>
                  <span>Clock Out</span>
                  <span>Work Hours</span>
                  {canManageHistory ? <span className="text-right">Sua/Xoa</span> : null}
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
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700"
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
                              aria-label="Sua ca cham cong"
                              className="flex h-8 w-8 items-center justify-center rounded-xl bg-coal/5 text-coal transition hover:bg-coal hover:text-white"
                              onClick={() => openEditModal(record)}
                              type="button"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                          ) : null}
                          {canDeleteHistory ? (
                            <button
                              aria-label="Xoa ca cham cong"
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
      </div>

      <Modal
        footer={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button
              disabled={submitting}
              onClick={() => setEditingRecord(null)}
              type="button"
              variant="secondary"
            >
              Huy
            </Button>
            <Button isLoading={submitting} onClick={() => void handleSaveEdit()} type="button">
              <Save className="h-4 w-4" />
              Luu
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
        title="Sua lich su cham cong"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-coal">Gio cham cong</span>
            <input
              className="w-full rounded-2xl border border-coal/10 bg-white px-4 py-3 text-sm font-bold text-coal outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              onChange={(event) =>
                setEditForm((current) => ({ ...current, clockIn: event.target.value }))
              }
              type="datetime-local"
              value={editForm.clockIn}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-coal">Gio tan lam</span>
            <input
              className="w-full rounded-2xl border border-coal/10 bg-white px-4 py-3 text-sm font-bold text-coal outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
              Huy
            </Button>
            <Button isLoading={submitting} onClick={() => void handleConfirmClockOut()} type="button">
              <CheckCircle2 className="h-4 w-4" />
              Xac nhan tan lam
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
        title="Xac nhan tan lam"
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Ban co chac muon ket thuc ca lam hien tai?
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <dt className="font-bold text-coal/45">Cham cong</dt>
              <dd className="mt-1 font-extrabold text-coal">
                {formatDateTime(openRecord?.clock_in_at)}
              </dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <dt className="font-bold text-coal/45">Thoi gian hien tai</dt>
              <dd className="mt-1 font-extrabold text-coal">{formatDateTime(now.toISOString())}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <dt className="font-bold text-coal/45">Tong gio tam tinh</dt>
              <dd className="mt-1 font-extrabold text-coal">
                {openRecord ? formatRecordDuration(openRecord, now) : "--"}
              </dd>
            </div>
          </dl>
        </div>
      </Modal>
    </div>
  );
}
