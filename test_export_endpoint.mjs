import fs from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";
import { createInitialState } from "./app/core.mjs";

const state = createInitialState(APP_DATA);
state.scenarioName = "API_검증";
const gangnam = APP_DATA.regions.find((region) => region.sido === "서울특별시" && region.name === "강남구");
state.assignments[gangnam.id] = "t_kim_jeonghun";

const response = await fetch("http://127.0.0.1:4318/export-xlsx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(state),
});
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.length < 10000 || String.fromCharCode(...bytes.slice(0, 2)) !== "PK") {
  throw new Error("유효한 XLSX 파일이 반환되지 않았습니다.");
}
await fs.mkdir("./outputs", { recursive: true });
await fs.mkdir("./outputs/019f5a05-370a-7170-9645-d7d1496c726d", { recursive: true });
await fs.writeFile("./outputs/019f5a05-370a-7170-9645-d7d1496c726d/endpoint-export-test.xlsx", bytes);
console.log(JSON.stringify({ status: response.status, bytes: bytes.length, type: response.headers.get("content-type") }));
