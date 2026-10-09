import "server-only";
import ExcelJS from "exceljs";
import { EXPORT_COLUMNS, type ExportRow } from "./rows";

export async function toXlsx(rows: ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Crosshair";
  wb.created = new Date();

  const ws = wb.addWorksheet("Leads", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = EXPORT_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2433" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  for (const row of rows) ws.addRow(row);

  // Wrap the long free-text columns so the sheet stays readable.
  const wrapped = new Set(["painReason", "fitReason", "triggerReason", "day0", "day3", "day7"]);
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: "top" };
    for (const col of EXPORT_COLUMNS) {
      if (wrapped.has(col.key)) {
        ws.getCell(i, EXPORT_COLUMNS.indexOf(col) + 1).alignment = {
          vertical: "top",
          wrapText: true,
        };
      }
    }
  });

  ws.autoFilter = { from: "A1", to: { row: 1, column: EXPORT_COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
