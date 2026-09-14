import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_DATA } from "./app/data.mjs";
import { createInitialState } from "./app/core.mjs";

const port = 4329;
const storePath = path.resolve(".test-data", "saved_scenarios.json");
await fs.rm(path.dirname(storePath), { recursive: true, force: true });

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), SCENARIO_STORE_PATH: storePath },
  stdio: "ignore",
});

try {
  await waitForHealth();
  const state = createInitialState(APP_DATA);
  state.scenarioName = "복구 테스트";
  const moved = APP_DATA.regions.find((region) => region.baselineTerritoryId !== "unassigned");
  state.assignments[moved.id] = "unassigned";

  const saved = await fetch(`http://127.0.0.1:${port}/api/scenarios`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: state.scenarioName, state }),
  });
  assert.equal(saved.status, 200);

  const loaded = await fetch(`http://127.0.0.1:${port}/api/scenarios`).then((response) => response.json());
  assert.equal(loaded["복구 테스트"].assignments[moved.id], "unassigned");
  assert.equal(loaded["복구 테스트"].scenarioName, "복구 테스트");
  console.log(JSON.stringify({ tests: "PASS", scenarios: Object.keys(loaded) }));
} finally {
  child.kill();
  await fs.rm(path.dirname(storePath), { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("테스트 서버가 시작되지 않았습니다.");
}
