import fs from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";
import { createInitialState } from "./app/core.mjs";

const state = createInitialState(APP_DATA);
state.scenarioName = "권역별_API_검증";
const gangnam = APP_DATA.regions.find((region) => region.sido === "서울특별시" && region.name === "강남구");
state.assignments[gangnam.id] = "t_kim_jeonghun";

const response = await fetch("http://127.0.0.1:4318/export-territories-xlsx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(state),
});
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.length < 10000 || String.fromCharCode(...bytes.slice(0, 2)) !== "PK") {
  throw new Error("유효한 권역별 XLSX 파일이 반환되지 않았습니다.");
}
const outputDir = "./outputs/019f5a05-370a-7170-9645-d7d1496c726d";
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/territory-endpoint-test.xlsx`, bytes);
console.log(JSON.stringify({ status: response.status, bytes: bytes.length, type: response.headers.get("content-type") }));
