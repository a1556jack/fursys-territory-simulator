import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { APP_DATA } from "./app/data.mjs";
import { validateScenario } from "./app/core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "app");
const port = Number(process.env.PORT) || 4317;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (requestUrl.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, version: 2, features: ["territory-xlsx"] }));
      return;
    }
    if (requestUrl.pathname === "/export-xlsx" && request.method === "POST") {
      const candidate = await readJsonBody(request);
      const state = validateScenario(APP_DATA, candidate);
      const { createScenarioWorkbookBytes } = await import("./export_scenario_workbook.mjs");
      const bytes = await createScenarioWorkbookBytes(APP_DATA, state);
      const fileName = `퍼시스_권역시나리오_${sanitizeFilename(state.scenarioName || "현재안")}.xlsx`;
      response.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "content-length": bytes.length,
        "cache-control": "no-store",
      });
      response.end(Buffer.from(bytes));
      return;
    }
    if (requestUrl.pathname === "/export-territories-xlsx" && request.method === "POST") {
      const candidate = await readJsonBody(request);
      const state = validateScenario(APP_DATA, candidate);
      const { createTerritoryWorkbookBytes } = await import("./export_scenario_workbook.mjs");
      const bytes = await createTerritoryWorkbookBytes(APP_DATA, state);
      const fileName = `퍼시스_권역별자료_${sanitizeFilename(state.scenarioName || "현재안")}.xlsx`;
      response.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "content-length": bytes.length,
        "cache-control": "no-store",
      });
      response.end(Buffer.from(bytes));
      return;
    }
    const pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) && target !== root) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const body = await fs.readFile(target);
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.code === "ENOENT" ? "Not Found" : "Server Error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`퍼시스 권역 시뮬레이터: http://127.0.0.1:${port}`);
});

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new Error("시나리오 데이터가 너무 큽니다.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sanitizeFilename(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "_");
}
