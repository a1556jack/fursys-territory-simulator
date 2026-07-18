import assert from "node:assert/strict";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = process.argv[2] || "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/outputs/019f5a05-370a-7170-9645-d7d1496c726d/퍼시스_권역별자료_샘플.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheetNames = ["권역별 요약", "01_김용훈", "02_김정훈", "03_김현섭", "04_손대만", "05_신승현", "06_이정일", "07_이현석"];
for (const sheetName of sheetNames) assert.ok(workbook.worksheets.getItem(sheetName), `${sheetName} sheet must exist.`);

const summary = workbook.worksheets.getItem("권역별 요약");
const summaryValues = summary.getRange("A1:K14").values;
assert.equal(summaryValues[6][0], "김용훈");
assert.equal(summaryValues[6][2], 5);
assert.equal(summaryValues[6][5], 5039932723);
assert.equal(summaryValues[6][8], 214432740);
assert.equal(summaryValues[6][10], 0);
assert.equal(summaryValues[7][0], "김정훈");
assert.equal(summaryValues[7][2], 17);
assert.equal(summaryValues[7][5], 14558739879);
assert.equal(summaryValues[7][8], 630647652);
assert.equal(summaryValues[7][9], 244652789);
assert.equal(summaryValues[7][10], 5);
assert.equal(summaryValues[13][5], 50386094518);
assert.equal(summaryValues[13][8], 2167953633);

const kimJeonghun = workbook.worksheets.getItem("02_김정훈");
const kimValues = kimJeonghun.getRange("A1:I26").values;
assert.equal(kimValues[3][1], 17);
assert.equal(kimValues[3][3], 14558739879);
assert.equal(kimValues[3][5], 630647652);
assert.equal(kimValues[5][7], 244652789);
assert.ok(kimValues.some((row) => row[0] === "서울특별시" && row[1] === "강남구" && row[4] === "변경"));

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final territory workbook formula error scan",
});

console.log(JSON.stringify({
  tests: "PASS",
  sheets: sheetNames.length,
  currentSalesTotal: summaryValues[13][5],
  currentNormalCostTotal: summaryValues[13][8],
  kimJeonghunAdditionalStaff: summaryValues[7][10],
  formulaScan: errors.ndjson,
}));
