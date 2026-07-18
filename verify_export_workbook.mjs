import assert from "node:assert/strict";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/outputs/019f5a05-370a-7170-9645-d7d1496c726d/endpoint-export-test.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const summary = workbook.worksheets.getItem("권역 요약");
const detail = workbook.worksheets.getItem("지역별 상세");
const unresolved = workbook.worksheets.getItem("미연결 데이터");

const summaryValues = summary.getRange("A1:O16").values;
const detailValues = detail.getRange("A5:K254").values;
const detailTotal = detail.getRange("A255:K255").values[0];
const unresolvedTotal = unresolved.getRange("A7:D7").values[0];

assert.equal(summaryValues[7][0], "김용훈");
assert.equal(summaryValues[7][4], 5);
assert.equal(summaryValues[7][7], 5039932723);
assert.equal(summaryValues[8][0], "김정훈");
assert.equal(summaryValues[8][4], 17);
assert.equal(summaryValues[8][7], 14558739879);
assert.equal(summaryValues[15][6], 51171516208);
assert.equal(summaryValues[15][7], 51171516208);
assert.equal(detailTotal[5], 51171516208);
assert.equal(detailTotal[6], 2203546543);
assert.equal(unresolvedTotal[1], 42767000);
assert.equal(unresolvedTotal[2], 2033840);

const expectedRegions = new Map([
  ["서울특별시 중구", [2925437591, 125265339]],
  ["인천광역시 중구", [325048621, 13918371]],
  ["서울특별시 강서구", [1318664990, 56255470]],
  ["인천광역시 동구", [30495000, 1334280]],
  ["인천광역시 서구", [546579900, 22403990]],
]);
for (const [label, [sales, installCost]] of expectedRegions) {
  const row = detailValues.find((item) => `${item[3]} ${item[4]}` === label);
  assert.ok(row, `${label} must exist in the detail sheet.`);
  assert.equal(row[5], sales, `${label} sales must match.`);
  assert.equal(row[6], installCost, `${label} install cost must match.`);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

console.log(JSON.stringify({
  tests: "PASS",
  sheets: [summary.name, detail.name, unresolved.name],
  detailRegions: 250,
  linkedResultTotal: detailTotal[5],
  linkedNormalCostTotal: detailTotal[6],
  unresolvedResultTotal: unresolvedTotal[1],
  formulaScan: errors.ndjson,
}));
