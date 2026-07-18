import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/FURSYS/Downloads/시트 1 (55).xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sheet = workbook.worksheets.getItemAt(0);
const used = sheet.getUsedRange(true);
const values = used.values;

console.log(JSON.stringify({
  sheetName: sheet.name,
  rowCount: values.length,
  columnCount: Math.max(...values.map((row) => row.length)),
  preview: values.slice(0, 10),
}, null, 2));
