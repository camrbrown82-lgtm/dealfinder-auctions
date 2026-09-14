function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetName(value: string) {
  return xml(value.replace(/[:\\/?*\[\]]/g, " ").trim().slice(0, 31) || "Sheet");
}

function cell(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return `<Cell><Data ss:Type="String"></Data></Cell>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xml(String(value))}</Data></Cell>`;
}

export type SpreadsheetSheet = {
  name: string;
  rows: Array<Array<string | number | null | undefined>>;
};

export function spreadsheetXml(sheets: SpreadsheetSheet[]) {
  const worksheets = sheets
    .map((sheet) => {
      const rows = sheet.rows
        .map((row) => `<Row>${row.map((value) => cell(value)).join("")}</Row>`)
        .join("");
      return `<Worksheet ss:Name="${sheetName(sheet.name)}"><Table>${rows}</Table></Worksheet>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets}
</Workbook>`;
}
