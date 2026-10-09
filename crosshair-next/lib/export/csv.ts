import "server-only";
import Papa from "papaparse";
import { EXPORT_COLUMNS, type ExportRow } from "./rows";

/** UTF-8 BOM so Excel renders accents and symbols correctly. */
const BOM = "﻿";

export function toCsv(rows: ExportRow[]): string {
  const csv = Papa.unparse(
    {
      fields: EXPORT_COLUMNS.map((c) => c.header),
      data: rows.map((r) => EXPORT_COLUMNS.map((c) => r[c.key])),
    },
    { quotes: true, newline: "\r\n" },
  );
  return BOM + csv;
}
