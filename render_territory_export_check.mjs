import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/outputs/019f5a05-370a-7170-9645-d7d1496c726d";
const workbookPath = `${outputDir}/퍼시스_권역별자료_샘플.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const sheetNames = ["권역별 요약", "01_김용훈", "02_김정훈", "03_김현섭", "04_손대만", "05_신승현", "06_이정일", "07_이현석"];

for (let index = 0; index < sheetNames.length; index += 1) {
  const sheetName = sheetNames[index];
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(`${outputDir}/territory-final-${String(index).padStart(2, "0")}.png`, new Uint8Array(await preview.arrayBuffer()));
}

console.log(JSON.stringify({ renderedSheets: sheetNames.length }));
