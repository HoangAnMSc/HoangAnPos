import type { AttendanceRecord } from "../types";

export type AttendanceExportEmployee = {
  id: string;
  name: string;
};

type AttendanceExportInput = {
  employees: AttendanceExportEmployee[];
  exportedAt?: Date;
  monthKey: string;
  records: AttendanceRecord[];
};

type AttendanceExportRow = {
  clockIn: string;
  clockOut: string;
  durationMinutes: number;
  employeeName: string;
  status: "Đang làm" | "Hoàn thành";
  workDate: string;
};

const vietnamTimeZone = "Asia/Ho_Chi_Minh";
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: vietnamTimeZone,
});
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: vietnamTimeZone,
});

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getDurationMinutes(record: AttendanceRecord, exportedAt: Date) {
  const startedAt = new Date(record.clock_in_at).getTime();
  const endedAt = record.clock_out_at
    ? new Date(record.clock_out_at).getTime()
    : exportedAt.getTime();

  return Math.max(0, Math.floor((endedAt - startedAt) / 60_000));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} giờ ${String(remainingMinutes).padStart(2, "0")} phút`;
}

function getLocalExcelDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: vietnamTimeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart(
    "hour"
  )}:${getPart("minute")}:${getPart("second")}.000`;
}

function createExportRows({
  employees,
  exportedAt = new Date(),
  records,
}: AttendanceExportInput) {
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));

  return [...records]
    .sort((first, second) => {
      const firstName = employeeNames.get(first.user_id) ?? "Chưa có tên";
      const secondName = employeeNames.get(second.user_id) ?? "Chưa có tên";
      return (
        firstName.localeCompare(secondName, "vi") ||
        first.work_date.localeCompare(second.work_date) ||
        first.clock_in_at.localeCompare(second.clock_in_at)
      );
    })
    .map(
      (record): AttendanceExportRow => ({
        clockIn: record.clock_in_at,
        clockOut: record.clock_out_at ?? "",
        durationMinutes: getDurationMinutes(record, exportedAt),
        employeeName: employeeNames.get(record.user_id) ?? "Chưa có tên",
        status: record.clock_out_at ? "Hoàn thành" : "Đang làm",
        workDate: record.work_date,
      })
    );
}

function createTextCell(value: string, style = "Text") {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function createNumberCell(value: number, style = "Number") {
  return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${value}</Data></Cell>`;
}

export function createAttendanceExcelXml(input: AttendanceExportInput) {
  const exportedAt = input.exportedAt ?? new Date();
  const rows = createExportRows({ ...input, exportedAt });
  const recordsByEmployee = new Map<string, AttendanceRecord[]>();

  input.records.forEach((record) => {
    const employeeRecords = recordsByEmployee.get(record.user_id) ?? [];
    employeeRecords.push(record);
    recordsByEmployee.set(record.user_id, employeeRecords);
  });

  const summaryRows = input.employees
    .map((employee) => {
      const employeeRecords = recordsByEmployee.get(employee.id) ?? [];
      const totalMinutes = employeeRecords.reduce(
        (total, record) => total + getDurationMinutes(record, exportedAt),
        0
      );
      const completed = employeeRecords.filter((record) => record.clock_out_at).length;

      return `<Row>${createTextCell(employee.name)}${createNumberCell(
        employeeRecords.length
      )}${createNumberCell(totalMinutes / 1440, "Duration")}${createNumberCell(
        completed
      )}${createNumberCell(employeeRecords.length - completed)}</Row>`;
    })
    .join("");

  const detailRows = rows
    .map(
      (row, index) =>
        `<Row>${createNumberCell(index + 1)}${createTextCell(row.employeeName)}<Cell ss:StyleID="Date"><Data ss:Type="DateTime">${row.workDate}T00:00:00.000</Data></Cell><Cell ss:StyleID="Time"><Data ss:Type="DateTime">${getLocalExcelDateTime(
          row.clockIn
        )}</Data></Cell>${
          row.clockOut
            ? `<Cell ss:StyleID="Time"><Data ss:Type="DateTime">${getLocalExcelDateTime(
                row.clockOut
              )}</Data></Cell>`
            : createTextCell("")
        }${createNumberCell(row.durationMinutes / 1440, "Duration")}${createTextCell(
          row.status,
          row.status === "Hoàn thành" ? "StatusDone" : "StatusOpen"
        )}</Row>`
    )
    .join("");

  const monthLabel = input.monthKey.split("-").reverse().join("/");
  const exportedAtLabel = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: vietnamTimeZone,
  }).format(exportedAt);

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Báo cáo chấm công tháng ${escapeXml(monthLabel)}</Title>
  <Author>BABYBOO POS</Author>
  <Created>${exportedAt.toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Title"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#25201C" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Meta"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#475569"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#697A4D" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#52603D"/></Borders></Style>
  <Style ss:ID="Text"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders></Style>
  <Style ss:ID="Number"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><NumberFormat ss:Format="0"/></Style>
  <Style ss:ID="Date"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><NumberFormat ss:Format="dd/mm/yyyy"/></Style>
  <Style ss:ID="Time"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><NumberFormat ss:Format="hh:mm"/></Style>
  <Style ss:ID="Duration"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders><NumberFormat ss:Format="[h]:mm"/></Style>
  <Style ss:ID="StatusDone"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Color="#166534" ss:Bold="1"/><Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/></Style>
  <Style ss:ID="StatusOpen"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:Color="#92400E" ss:Bold="1"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Tổng hợp">
  <Table>
   <Column ss:Width="210"/><Column ss:Width="75"/><Column ss:Width="95"/><Column ss:Width="95"/><Column ss:Width="85"/>
   <Row ss:Height="34"><Cell ss:MergeAcross="4" ss:StyleID="Title"><Data ss:Type="String">BÁO CÁO CHẤM CÔNG THÁNG ${escapeXml(
     monthLabel
   )}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="4" ss:StyleID="Meta"><Data ss:Type="String">Xuất lúc ${escapeXml(
     exportedAtLabel
   )} · ${input.employees.length} nhân viên · ${rows.length} ca</Data></Cell></Row>
   <Row ss:Height="26">${["Nhân viên", "Số ca", "Tổng giờ", "Hoàn thành", "Đang làm"]
     .map((value) => createTextCell(value, "Header"))
     .join("")}</Row>
   ${summaryRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>3</SplitHorizontal><TopRowBottomPane>3</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>
 </Worksheet>
 <Worksheet ss:Name="Chi tiết">
  <Table>
   <Column ss:Width="45"/><Column ss:Width="190"/><Column ss:Width="90"/><Column ss:Width="75"/><Column ss:Width="75"/><Column ss:Width="90"/><Column ss:Width="90"/>
   <Row ss:Height="34"><Cell ss:MergeAcross="6" ss:StyleID="Title"><Data ss:Type="String">CHI TIẾT CHẤM CÔNG THÁNG ${escapeXml(
     monthLabel
   )}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="6" ss:StyleID="Meta"><Data ss:Type="String">Dữ liệu theo giờ Việt Nam (UTC+7)</Data></Cell></Row>
   <Row ss:Height="26">${[
     "STT",
     "Nhân viên",
     "Ngày",
     "Vào ca",
     "Tan làm",
     "Tổng giờ",
     "Trạng thái",
   ]
     .map((value) => createTextCell(value, "Header"))
     .join("")}</Row>
   ${detailRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>3</SplitHorizontal><TopRowBottomPane>3</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadAttendanceExcel(input: AttendanceExportInput) {
  const xml = createAttendanceExcelXml(input);
  downloadBlob(
    new Blob([`\ufeff${xml}`], { type: "application/vnd.ms-excel;charset=utf-8" }),
    `cham-cong-${input.monthKey}.xls`
  );
}

function drawCellText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  align: CanvasTextAlign = "left"
) {
  context.textAlign = align;
  context.fillText(value, x, y, maxWidth);
}

export async function downloadAttendanceImages(input: AttendanceExportInput) {
  await document.fonts?.ready;
  const rows = createExportRows(input);
  const rowsPerPage = 38;
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const scale = 2;
  const width = 1500;
  const headerHeight = 230;
  const rowHeight = 54;
  const monthLabel = input.monthKey.split("-").reverse().join("/");

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageRows = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    const height = headerHeight + Math.max(pageRows.length, 1) * rowHeight + 42;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Trình duyệt không thể tạo ảnh báo cáo.");
    }

    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#25201c";
    context.fillRect(0, 0, width, 135);
    context.fillStyle = "#ffffff";
    context.font = '800 36px "Be Vietnam Pro", Arial';
    context.textAlign = "left";
    context.fillText(`BÁO CÁO CHẤM CÔNG THÁNG ${monthLabel}`, 40, 58);
    context.font = '600 18px "Be Vietnam Pro", Arial';
    context.fillText(
      `${input.employees.length} nhân viên · ${rows.length} ca · Trang ${
        pageIndex + 1
      }/${pageCount}`,
      40,
      96
    );

    const columns = [
      { label: "Nhân viên", width: 410 },
      { label: "Ngày", width: 210 },
      { label: "Vào ca", width: 170 },
      { label: "Tan làm", width: 170 },
      { label: "Tổng giờ", width: 250 },
      { label: "Trạng thái", width: 210 },
    ];
    let currentX = 30;
    context.fillStyle = "#697a4d";
    context.fillRect(30, 165, width - 60, 48);
    context.fillStyle = "#ffffff";
    context.font = '800 15px "Be Vietnam Pro", Arial';
    columns.forEach((column) => {
      drawCellText(context, column.label, currentX + 12, 196, column.width - 24);
      currentX += column.width;
    });

    if (pageRows.length === 0) {
      context.fillStyle = "#64748b";
      context.font = '600 18px "Be Vietnam Pro", Arial';
      context.fillText("Không có ca chấm công trong phạm vi đã chọn.", 42, 260);
    }

    pageRows.forEach((row, rowIndex) => {
      const y = 213 + rowIndex * rowHeight;
      context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
      context.fillRect(30, y, width - 60, rowHeight);
      context.strokeStyle = "#e2e8f0";
      context.beginPath();
      context.moveTo(30, y + rowHeight);
      context.lineTo(width - 30, y + rowHeight);
      context.stroke();
      context.fillStyle = "#0f172a";
      context.font = '700 15px "Be Vietnam Pro", Arial';

      const values = [
        row.employeeName,
        dateFormatter.format(new Date(`${row.workDate}T00:00:00+07:00`)),
        timeFormatter.format(new Date(row.clockIn)),
        row.clockOut ? timeFormatter.format(new Date(row.clockOut)) : "--",
        formatDuration(row.durationMinutes),
        row.status,
      ];
      currentX = 30;
      values.forEach((value, columnIndex) => {
        drawCellText(
          context,
          value,
          currentX + 12,
          y + 33,
          columns[columnIndex].width - 24
        );
        currentX += columns[columnIndex].width;
      });
    });

    const link = document.createElement("a");
    link.download = `cham-cong-${input.monthKey}-trang-${pageIndex + 1}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
