import type { AttendanceRecord } from "../types";

export type PayrollDeduction = {
  name: string;
  amount: number;
};

export type PayrollSlip = {
  employeeId: string;
  employeeName: string;
  monthKey: string;
  periodStart: string;
  periodEnd: string;
  workDays: number;
  dailyRate: number;
  grossPay: number;
  deductions: PayrollDeduction[];
  totalDeductions: number;
  netPay: number;
};

const currency = new Intl.NumberFormat("vi-VN");

export function createPayrollSlip(input: {
  employeeId: string;
  employeeName: string;
  monthKey: string;
  dailyRate: number;
  deductions: PayrollDeduction[];
  records: AttendanceRecord[];
}): PayrollSlip {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.monthKey)) throw new Error("Chọn tháng lương hợp lệ.");
  if (!input.employeeId || !input.employeeName.trim()) throw new Error("Chọn nhân viên cần xuất lương.");
  if (!Number.isSafeInteger(input.dailyRate) || input.dailyRate < 0) throw new Error("Nhập lương/ngày bằng số tiền nguyên không âm.");
  const [year, month] = input.monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodStart = `${input.monthKey}-01`;
  const periodEnd = `${input.monthKey}-${String(lastDay).padStart(2, "0")}`;
  const workDates = new Set(input.records.filter((record) => record.user_id === input.employeeId
    && record.work_date >= periodStart && record.work_date <= periodEnd).map((record) => record.work_date));
  const deductions = input.deductions.map((deduction) => {
    const name = deduction.name.trim();
    if (!name) throw new Error("Nhập tên cho từng khoản trừ.");
    if (!Number.isSafeInteger(deduction.amount) || deduction.amount < 0) throw new Error(`Nhập số tiền hợp lệ cho khoản trừ “${name}”.`);
    return { name, amount: deduction.amount };
  });
  const grossPay = workDates.size * input.dailyRate;
  const totalDeductions = deductions.reduce((total, deduction) => total + deduction.amount, 0);
  const netPay = grossPay - totalDeductions;
  if (![grossPay, totalDeductions, netPay].every(Number.isSafeInteger)) throw new Error("Số tiền quá lớn để tính lương chính xác.");
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName.trim(),
    monthKey: input.monthKey,
    periodStart,
    periodEnd,
    workDays: workDates.size,
    dailyRate: input.dailyRate,
    grossPay,
    deductions,
    totalDeductions,
    netPay,
  };
}

function formatMoney(amount: number) {
  return `${currency.format(amount)}đ`;
}

function formatDate(date: string) {
  return date.split("-").reverse().join("/");
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  // Split oversized words too, so a long deduction name never overlaps money.
  for (const word of text.trim().split(/\s+/)) {
    if (current && context.measureText(`${current} ${word}`).width <= maxWidth) {
      current += ` ${word}`;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    for (const character of word) {
      if (current && context.measureText(current + character).width > maxWidth) {
        lines.push(current);
        current = "";
      }
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

type SlipRow = {
  label: string;
  value: string;
  bold?: boolean;
  shaded?: boolean;
  detail?: boolean;
};

export function renderPayrollCanvas(slip: PayrollSlip) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Trình duyệt không thể tạo ảnh phiếu lương.");

  const width = 1080;
  const left = 64;
  const right = width - left;
  const divider = 635;
  const font = (size: number, bold = false) => `${bold ? 700 : 400} ${size}px Arial, sans-serif`;
  context.font = font(40, true);
  const employeeLines = wrapText(context, `Nhân viên: ${slip.employeeName}`, right - left - 8);
  const tableTop = 470 + (employeeLines.length - 1) * 52;
  const rows: SlipRow[] = [
    { label: "Nội dung", value: "Chi tiết", bold: true, shaded: true },
    { label: "Từ", value: formatDate(slip.periodStart) },
    { label: "Đến", value: formatDate(slip.periodEnd) },
    { label: "Số ngày làm", value: `${slip.workDays} ngày` },
    { label: "Lương/ngày", value: formatMoney(slip.dailyRate) },
    { label: "Lương kỳ này", value: formatMoney(slip.grossPay) },
    { label: "Tổng khoản trừ", value: formatMoney(slip.totalDeductions), bold: true },
    ...slip.deductions.map((deduction) => ({ label: deduction.name, value: formatMoney(deduction.amount), detail: true })),
    { label: "Thực nhận", value: formatMoney(slip.netPay), bold: true, shaded: true },
  ];
  const measured = rows.map((row) => {
    const size = row.detail ? 29 : 36;
    context.font = font(size, row.bold);
    const lines = wrapText(context, row.label, divider - left - 48);
    return { ...row, size, lines, height: Math.max(row.detail ? 76 : 90, lines.length * (size + 12) + 36) };
  });
  const height = Math.max(1448, tableTop + measured.reduce((total, row) => total + row.height, 0) + 100);
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#111111";
  context.lineWidth = 3;
  context.strokeRect(36, 38, width - 72, height - 76);

  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = font(68, true);
  context.fillText("PHIẾU LƯƠNG", width / 2, 146);
  context.font = font(40);
  const [year, month] = slip.monthKey.split("-");
  context.fillText(`Tháng ${Number(month)}/${year}`, width / 2, 242);
  context.beginPath();
  context.moveTo(left, 310);
  context.lineTo(right, 310);
  context.stroke();

  context.textAlign = "left";
  context.font = font(40, true);
  employeeLines.forEach((line, index) => context.fillText(line, left + 4, 380 + index * 52));

  let top = tableTop;
  measured.forEach((row, index) => {
    if (row.shaded) {
      context.fillStyle = "#eeeeee";
      context.fillRect(left, top, right - left, row.height);
    }
    context.strokeStyle = "#111111";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(left, top);
    context.lineTo(right, top);
    context.stroke();
    context.fillStyle = "#000000";
    context.font = font(row.size, row.bold);
    context.textAlign = "left";
    const textTop = top + row.height / 2 - ((row.lines.length - 1) * (row.size + 12)) / 2;
    row.lines.forEach((line, lineIndex) => context.fillText(line, left + (row.detail ? 34 : 22), textTop + lineIndex * (row.size + 12)));
    context.textAlign = index === 0 ? "left" : "right";
    // Monetary columns stay readable for large totals without crossing borders.
    const valueWidth = right - divider - 48;
    let valueSize = row.size;
    while (context.measureText(row.value).width > valueWidth && valueSize > 20) {
      valueSize -= 1;
      context.font = font(valueSize, row.bold);
    }
    context.fillText(row.value, index === 0 ? divider + 34 : right - 24, top + row.height / 2);
    top += row.height;
  });
  context.lineWidth = 3;
  context.strokeRect(left, tableTop, right - left, top - tableTop);
  context.beginPath();
  context.moveTo(divider, tableTop);
  context.lineTo(divider, top);
  context.stroke();
  return canvas;
}

export async function createPayrollPng(slip: PayrollSlip) {
  await document.fonts?.ready;
  return renderPayrollCanvas(slip).toDataURL("image/png");
}

export function downloadPayrollPng(imageUrl: string, slip: PayrollSlip) {
  const link = document.createElement("a");
  const employeeName = slip.employeeName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "nhan-vien";
  link.download = `phieu-luong-${slip.monthKey}-${employeeName}-${slip.employeeId.slice(0, 8)}.png`;
  link.href = imageUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

