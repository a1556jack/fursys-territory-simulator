import fs from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";
import { createInitialState } from "./app/core.mjs";
import { createScenarioWorkbook, createScenarioWorkbookBytes } from "./export_scenario_workbook.mjs";

const outputDir = "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/outputs/019f5a05-370a-7170-9645-d7d1496c726d";
const state = createInitialState(APP_DATA);
state.scenarioName = "강남구_이동_샘플";
const gangnam = APP_DATA.regions.find((region) => region.sido === "서울특별시" && region.name === "강남구");
state.assignments[gangnam.id] = "t_kim_jeonghun";

const workbook = await createScenarioWorkbook(APP_DATA, state);
await fs.mkdir(outputDir, { recursive: true });

const summaryCheck = await workbook.inspect({
  kind: "table",
  range: "권역 요약!A1:O16",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 15,
});
console.log(summaryCheck.ndjson);

const errorCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errorCheck.ndjson);

for (const [sheetName, range, fileName] of [
  ["권역 요약", "A1:O16", "export-summary.png"],
  ["지역별 상세", "A1:K22", "export-detail.png"],
  ["미연결 데이터", "A1:D12", "export-unresolved.png"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.5, format: "png" });
  await fs.writeFile(`${outputDir}/${fileName}`, new Uint8Array(await preview.arrayBuffer()));
}

const bytes = await createScenarioWorkbookBytes(APP_DATA, state);
await fs.writeFile(`${outputDir}/퍼시스_권역시나리오_샘플.xlsx`, bytes);
console.log(JSON.stringify({ output: `${outputDir}/퍼시스_권역시나리오_샘플.xlsx`, bytes: bytes.length }));
