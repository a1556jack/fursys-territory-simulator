import fs from "node:fs/promises";
import { SpreadsheetFile } from "@oai/artifact-tool";
import { APP_DATA } from "./app/data.mjs";
import { createInitialState } from "./app/core.mjs";
import { createTerritoryWorkbook } from "./export_scenario_workbook.mjs";

const outputDir = "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/outputs/019f5a05-370a-7170-9645-d7d1496c726d";
await fs.mkdir(outputDir, { recursive: true });

const state = createInitialState(APP_DATA);
state.scenarioName = "권역별_일괄_샘플";
const gangnam = APP_DATA.regions.find((region) => region.sido === "서울특별시" && region.name === "강남구");
state.assignments[gangnam.id] = "t_kim_jeonghun";

const workbook = await createTerritoryWorkbook(APP_DATA, state);
const summaryInspect = await workbook.inspect({
  kind: "table",
  range: "권역별 요약!A1:K14",
  include: "values,formulas",
  tableMaxRows: 14,
  tableMaxCols: 11,
});
console.log(summaryInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "territory export formula error scan",
});
console.log(errors.ndjson);

const sheetNames = ["권역별 요약", "01_김용훈", "02_김정훈", "03_김현섭", "04_손대만", "05_신승현", "06_이정일", "07_이현석"];
for (let index = 0; index < sheetNames.length; index += 1) {
  const sheetName = sheetNames[index];
  const preview = await workbook.render({
    sheetName,
    range: sheetName === "권역별 요약" ? "A1:K14" : "A1:I22",
    scale: 1.2,
    format: "png",
  });
  await fs.writeFile(`${outputDir}/territory-export-${String(index).padStart(2, "0")}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const outputPath = `${outputDir}/퍼시스_권역별자료_샘플.xlsx`;
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ output: outputPath, sheets: sheetNames.length }));
