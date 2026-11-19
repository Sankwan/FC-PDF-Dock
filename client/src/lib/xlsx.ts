import JSZip from "jszip";
import { cellKind, cellValue } from "./tables";

/**
 * A minimal, valid .xlsx writer: inline strings, real numbers and dates with
 * sensible formats (1,200 · 1,250.00 · 12.5% · 12/03/2025), and an optional
 * bold heading row that stays in view when scrolling.
 */

export interface Sheet { name: string; rows: string[][]; boldFirstRow?: boolean }

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // XML 1.0 forbids most control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colName = (i: number) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/** Excel sheet names: 31 characters, none of []:*?/\ and unique. */
export const safeSheetNames = (names: string[]) => {
  const used = new Set<string>();
  return names.map((n) => {
    const base = (n.replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);
    let name = base, i = 2;
    while (used.has(name.toLowerCase())) { const sfx = ` (${i++})`; name = base.slice(0, 31 - sfx.length) + sfx; }
    used.add(name.toLowerCase());
    return name;
  });
};

// Number formats, in the order of the cell styles below. 164 is our own date format.
const FORMATS = { plain: 0, thousands: 3, money: 4, percent: 10, date: 164 } as const;
const FORMAT_ORDER = Object.keys(FORMATS) as (keyof typeof FORMATS)[];
/** Style index: two per format, plain then bold. */
const styleOf = (format: keyof typeof FORMATS, bold: boolean) => FORMAT_ORDER.indexOf(format) * 2 + (bold ? 1 : 0);

const sheetXml = (sheet: Sheet) => {
  const width = Math.max(1, ...sheet.rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, c) => {
    const len = Math.max(6, ...sheet.rows.map((r) => (r[c] ?? "").length + (cellKind(r[c] ?? "").type === "number" ? 2 : 0)));
    return `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, len + 2)}" customWidth="1"/>`;
  }).join("");
  const rows = sheet.rows.map((r, ri) => {
    const cells = r.map((text, ci) => {
      if (!text) return "";
      const ref = `${colName(ci)}${ri + 1}`;
      const bold = !!sheet.boldFirstRow && ri === 0;
      const k = bold ? { type: "text" as const, value: text.trim() } : cellKind(text);
      const style = (f: keyof typeof FORMATS) => { const i = styleOf(f, bold); return i ? ` s="${i}"` : ""; };
      if (k.type === "number") return `<c r="${ref}"${style(k.format)}><v>${k.value}</v></c>`;
      if (k.type === "date") return `<c r="${ref}"${style("date")}><v>${k.value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style("plain")}><is><t xml:space="preserve">${esc(k.value)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const freeze = sheet.boldFirstRow && sheet.rows.length > 1
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
};

export async function writeXlsx(sheets: Sheet[]): Promise<Blob> {
  const list = sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
  const names = safeSheetNames(list.map((s) => s.name));
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  const xfs = FORMAT_ORDER.flatMap((f) => [0, 1].map((b) => `<xf numFmtId="${FORMATS[f]}" fontId="${b}" fillId="0" borderId="0" xfId="0"${FORMATS[f] ? ` applyNumberFormat="1"` : ""}${b ? ` applyFont="1"` : ""}/>`)).join("");
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${FORMAT_ORDER.length * 2}">${xfs}</cellXfs></styleSheet>`);
  list.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
}

/** CSV with Excel-friendly quoting and a BOM so Excel reads UTF-8 (₵, ɛ, ɔ) correctly. */
export const toCsv = (rows: string[][]) =>
  "\uFEFF" + rows.map((r) => r.map((raw) => {
    // Text from a PDF must never run as a spreadsheet formula.
    const c = /^[=+@\t\r]/.test(raw) || (/^-/.test(raw) && typeof cellValue(raw) !== "number") ? `'${raw}` : raw;
    return /[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  }).join(",")).join("\r\n");
