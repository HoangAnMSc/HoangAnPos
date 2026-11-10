import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Spinner } from "../ui/Spinner";
import { getErrorMessage } from "../../lib/errors";
import { formatCurrency, formatIntegerInput, normalizeIntegerInput } from "../../lib/format";
import { createPayrollPng, createPayrollSlip, downloadPayrollPng } from "../../lib/payrollExport";
import { fetchAttendanceRecordsForExport, type AttendanceEmployee } from "../../services/attendance";
import type { AttendanceRecord } from "../../types";

type DeductionDraft = { id: string; name: string; amount: string };
type PayrollDraft = { dailyRate: string; deductions: DeductionDraft[] };

type Props = {
  employees: AttendanceEmployee[];
  initialMonthKey: string;
  initialEmployeeId: string;
  onClose: () => void;
  onExported: () => void;
};

export function PayrollExportModal({ employees, initialMonthKey, initialEmployeeId, onClose, onExported }: Props) {
  const [monthKey, setMonthKey] = useState(initialMonthKey);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [drafts, setDrafts] = useState<Record<string, PayrollDraft>>({});
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ slip: object; imageUrl: string } | null>(null);
  const [imageError, setImageError] = useState("");
  const employee = employees.find((item) => item.id === employeeId);
  const draftKey = `${monthKey}:${employeeId}`;
  const draft = useMemo(() => drafts[draftKey] ?? { dailyRate: "200000", deductions: [] }, [draftKey, drafts]);
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey);

  useEffect(() => {
    let active = true;
    setRecords(null);
    setError("");
    if (!employeeId || !validMonth) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAttendanceRecordsForExport(monthKey, [employeeId])
      .then((data) => { if (active) setRecords(data); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "Không tải được chấm công để tính lương.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeId, monthKey, validMonth]);

  const calculation = useMemo(() => {
    if (!records || !employee) return { slip: null, error: "" };
    try {
      if (!draft.dailyRate) throw new Error("Nhập lương/ngày trước khi xuất phiếu.");
      const slip = createPayrollSlip({
        employeeId, employeeName: employee.name, monthKey, dailyRate: Number(draft.dailyRate), records,
        deductions: draft.deductions.map((item) => {
          if (!item.amount) throw new Error("Nhập số tiền cho từng khoản trừ.");
          return { name: item.name, amount: Number(item.amount) };
        }),
      });
      return { slip, error: "" };
    } catch (calculationError) {
      return { slip: null, error: getErrorMessage(calculationError, "Không tính được lương.") };
    }
  }, [records, employee, employeeId, monthKey, draft]);

  useEffect(() => {
    let active = true;
    setImageError("");
    if (!calculation.slip) return;
    const slip = calculation.slip;
    createPayrollPng(slip)
      .then((imageUrl) => { if (active) setPreview({ slip, imageUrl }); })
      .catch((renderError) => { if (active) setImageError(getErrorMessage(renderError, "Không tạo được ảnh phiếu lương.")); });
    return () => { active = false; };
  }, [calculation.slip]);

  function updateDraft(next: PayrollDraft) {
    setDrafts((current) => ({ ...current, [draftKey]: next }));
  }

  function updateDeduction(id: string, values: Partial<DeductionDraft>) {
    updateDraft({ ...draft, deductions: draft.deductions.map((item) => item.id === id ? { ...item, ...values } : item) });
  }

  const readyPreview = calculation.slip && preview?.slip === calculation.slip ? preview.imageUrl : null;
  const displayedError = error || calculation.error || imageError || (!validMonth ? "Chọn tháng lương hợp lệ." : "");

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Xuất phiếu lương PNG"
      footer={<>
        <Button onClick={onClose} variant="secondary">Đóng</Button>
        <Button disabled={loading || !readyPreview || Boolean(displayedError)} onClick={() => {
          if (!readyPreview || !calculation.slip) return;
          downloadPayrollPng(readyPreview, calculation.slip);
          onExported();
        }}><Download className="h-4 w-4" />Tải phiếu lương PNG</Button>
      </>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <Input label="Tháng lương" type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} />
          <Select label="Nhân viên" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="" disabled>Chọn nhân viên</option>
            {employees.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : " (Đã khóa)"}</option>)}
          </Select>
          <Input label="Lương/ngày (đ)" inputMode="numeric" value={formatIntegerInput(draft.dailyRate)} onChange={(event) => updateDraft({ ...draft, dailyRate: normalizeIntegerInput(event.target.value) })} />
          <p className="text-xs font-semibold leading-5 text-slate-500">Lương tháng = số ngày chấm công × lương/ngày. Nhiều ca cùng ngày tính 1 ngày; ca qua đêm tính theo ngày vào ca.</p>
          <section className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold">Các khoản trừ</h3>
              <Button variant="secondary" onClick={() => updateDraft({ ...draft, deductions: [...draft.deductions, { id: crypto.randomUUID(), name: "", amount: "" }] })}><Plus className="h-4 w-4" />Thêm</Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">Nhập riêng tên và số tiền mỗi khoản, ví dụ tạm ứng lần 1. Các khoản trừ áp dụng cho lần xuất này.</p>
            {draft.deductions.map((item, index) => <div className="space-y-2 rounded-lg bg-slate-50 p-3" key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500">Khoản trừ {index + 1}</span>
                <button className="rounded-lg p-1 text-red-600 hover:bg-red-50" type="button" aria-label={`Xóa khoản trừ ${index + 1}`} onClick={() => updateDraft({ ...draft, deductions: draft.deductions.filter((entry) => entry.id !== item.id) })}><Trash2 className="h-4 w-4" /></button>
              </div>
              <Input label={`Tên khoản trừ ${index + 1}`} maxLength={120} value={item.name} onChange={(event) => updateDeduction(item.id, { name: event.target.value })} />
              <Input label={`Số tiền khoản trừ ${index + 1} (đ)`} inputMode="numeric" value={formatIntegerInput(item.amount)} onChange={(event) => updateDeduction(item.id, { amount: normalizeIntegerInput(event.target.value) })} />
            </div>)}
          </section>
          {calculation.slip ? <dl className="space-y-2 rounded-xl bg-moss-50 p-4 text-sm">
            <div className="flex justify-between gap-2"><dt>Số ngày làm</dt><dd className="font-bold">{calculation.slip.workDays} ngày</dd></div>
            <div className="flex justify-between gap-2"><dt>Lương kỳ này</dt><dd className="font-bold">{formatCurrency(calculation.slip.grossPay)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Tổng khoản trừ</dt><dd className="font-bold">{formatCurrency(calculation.slip.totalDeductions)}</dd></div>
            <div className="flex justify-between gap-2 border-t border-moss-200 pt-2 font-extrabold"><dt>Thực nhận</dt><dd>{formatCurrency(calculation.slip.netPay)}</dd></div>
          </dl> : null}
          {displayedError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{displayedError}</p> : null}
        </div>
        <div className="min-w-0 rounded-xl bg-slate-100 p-3">
          <p className="mb-3 text-xs font-bold text-slate-500">Xem trước phiếu lương</p>
          {loading ? <Spinner label="Đang tải chấm công..." /> : readyPreview && !displayedError ? <img alt={`Phiếu lương tháng ${monthKey} của ${employee?.name}`} className="h-auto w-full bg-white shadow-sm" src={readyPreview} /> : !displayedError && calculation.slip ? <Spinner label="Đang tạo phiếu lương..." /> : <p className="p-5 text-center text-sm text-slate-500">Nhập đầy đủ thông tin để xem trước phiếu lương.</p>}
        </div>
      </div>
    </Modal>
  );
}
