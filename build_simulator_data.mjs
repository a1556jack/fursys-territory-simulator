import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Users/FURSYS/Downloads/시트 1 (55).xlsx";
const mapPath = "C:/Users/FURSYS/Downloads/소액권역_지도 (2).html";
const outputPath = "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/app/data.mjs";
const geoId = "geo_json_e3b5b4d43724e83a8136eb1ed3a15453";

const territoryDefinitions = [
  { id: "t_kim_yonghun", name: "김용훈", color: "#e63946" },
  { id: "t_kim_jeonghun", name: "김정훈", color: "#f4a261" },
  { id: "t_kim_hyeonseop", name: "김현섭", color: "#2a9d8f" },
  { id: "t_son_daeman", name: "손대만", color: "#9467bd" },
  { id: "t_shin_seunghyeon", name: "신승현", color: "#52b788" },
  { id: "t_lee_jeongil", name: "이정일", color: "#457b9d" },
  { id: "t_lee_hyeonseok", name: "이현석", color: "#e9c46a" },
];
const unassigned = {
  id: "unassigned",
  name: "미배정",
  color: "#c5cbd3",
  system: true,
};
const territoryIdByName = new Map(territoryDefinitions.map((item) => [item.name, item.id]));

const workbookBlob = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(workbookBlob);
const sheet = workbook.worksheets.getItemAt(0);
const values = sheet.getUsedRange(true).values;
const sourceRows = values
  .slice(3)
  .filter((row) => typeof row[2] === "string" && row[2].trim())
  .map((row) => ({
    district: row[2].trim(),
    sales: Number(row[3]) || 0,
    installCost: Number(row[4]) || 0,
  }));

const html = await fs.readFile(mapPath, "utf8");
const marker = `${geoId}_add(`;
const jsonStart = html.indexOf("{", html.indexOf(marker));
let depth = 0;
let inString = false;
let escaped = false;
let jsonEnd = -1;
for (let cursor = jsonStart; cursor < html.length; cursor += 1) {
  const ch = html[cursor];
  if (inString) {
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === '"') inString = false;
  } else if (ch === '"') inString = true;
  else if (ch === "{") depth += 1;
  else if (ch === "}" && --depth === 0) {
    jsonEnd = cursor + 1;
    break;
  }
}
if (jsonStart < 0 || jsonEnd < 0) throw new Error("지도 GeoJSON을 찾지 못했습니다.");
const geo = JSON.parse(html.slice(jsonStart, jsonEnd));
const propertyKeys = Object.keys(geo.features[0].properties);
const assigneeKey = propertyKeys[6];
const sidoKey = propertyKeys[7];

const regions = geo.features.map((feature) => {
  const properties = feature.properties;
  const assignee = properties[assigneeKey] || "";
  return {
    id: properties.SIG_CD,
    name: properties.SIG_KOR_NM,
    sido: properties[sidoKey],
    centroid: [properties.centroid_lon, properties.centroid_lat],
    geometry: feature.geometry,
    baselineTerritoryId: territoryIdByName.get(assignee) || unassigned.id,
    sales: null,
    installCost: null,
    dataStatus: "데이터 없음",
  };
});

const regionsByName = new Map();
for (const region of regions) {
  if (!regionsByName.has(region.name)) regionsByName.set(region.name, []);
  regionsByName.get(region.name).push(region);
}

const unresolved = [];
const regionById = new Map(regions.map((region) => [region.id, region]));
const manualAllocations = new Map([
  ["\uac15\uc11c\uad6c", [
    { regionId: "11500", share: 1, status: "\uacbd\uc778 \ub370\uc774\ud130 \uae30\uc900 \uc11c\uc6b8\ud2b9\ubcc4\uc2dc \uac15\uc11c\uad6c \uc5f0\uacb0" },
  ]],
  ["\ub3d9\uad6c", [
    { regionId: "28140", share: 1, status: "\uacbd\uc778 \ub370\uc774\ud130 \uae30\uc900 \uc778\ucc9c\uad11\uc5ed\uc2dc \ub3d9\uad6c \uc5f0\uacb0" },
  ]],
  ["\uc11c\uad6c", [
    { regionId: "28260", share: 1, status: "\uacbd\uc778 \ub370\uc774\ud130 \uae30\uc900 \uc778\ucc9c\uad11\uc5ed\uc2dc \uc11c\uad6c \uc5f0\uacb0" },
  ]],
  ["\uc911\uad6c", [
    { regionId: "11140", share: 0.9, status: "\uc911\uad6c \uc6d0\ubcf8 9:1 \ubd84\ubc30 (\uc11c\uc6b8 90%)" },
    { regionId: "28110", share: 0.1, status: "\uc911\uad6c \uc6d0\ubcf8 9:1 \ubd84\ubc30 (\uc778\ucc9c 10%)" },
  ]],
]);
let linkedSourceRows = 0;
for (const row of sourceRows) {
  if (row.district === "부천시" || row.district.startsWith("부천시 ")) continue;
  const allocation = manualAllocations.get(row.district);
  if (allocation) {
    let remainingSales = row.sales;
    let remainingInstallCost = row.installCost;
    allocation.forEach((rule, index) => {
      const region = regionById.get(rule.regionId);
      if (!region) throw new Error(`Manual allocation target not found: ${rule.regionId}`);
      const isLast = index === allocation.length - 1;
      const sales = isLast ? remainingSales : Math.round(row.sales * rule.share);
      const installCost = isLast ? remainingInstallCost : Math.round(row.installCost * rule.share);
      region.sales = (region.sales || 0) + sales;
      region.installCost = (region.installCost || 0) + installCost;
      region.dataStatus = rule.status;
      remainingSales -= sales;
      remainingInstallCost -= installCost;
    });
    linkedSourceRows += 1;
    continue;
  }
  const candidates = regionsByName.get(row.district) || [];
  if (candidates.length === 1) {
    const region = candidates[0];
    region.sales = row.sales;
    region.installCost = row.installCost;
    region.dataStatus = "연결 완료";
    linkedSourceRows += 1;
  } else if (candidates.length > 1) {
    unresolved.push({
      name: row.district,
      sales: row.sales,
      installCost: row.installCost,
      candidateRegionIds: candidates.map((region) => region.id),
      candidateLabels: candidates.map((region) => `${region.sido} ${region.name}`),
    });
    for (const region of candidates) region.dataStatus = "시도 확인 필요";
  } else {
    unresolved.push({
      name: row.district,
      sales: row.sales,
      installCost: row.installCost,
      candidateRegionIds: [],
      candidateLabels: [],
    });
  }
}

const bucheonRows = sourceRows.filter(
  (row) => row.district === "부천시" || row.district.startsWith("부천시 "),
);
const bucheonCandidates = regionsByName.get("부천시") || [];
if (bucheonRows.length && bucheonCandidates.length === 1) {
  const region = bucheonCandidates[0];
  region.sales = bucheonRows.reduce((sum, row) => sum + row.sales, 0);
  region.installCost = bucheonRows.reduce((sum, row) => sum + row.installCost, 0);
  region.dataStatus = "부천시 및 3개 구 합산";
  linkedSourceRows += bucheonRows.length;
}

const sourceSalesTotal = sourceRows.reduce((sum, row) => sum + row.sales, 0);
const sourceInstallTotal = sourceRows.reduce((sum, row) => sum + row.installCost, 0);
const linkedSalesTotal = regions.reduce((sum, region) => sum + (region.sales || 0), 0);
const linkedInstallTotal = regions.reduce((sum, region) => sum + (region.installCost || 0), 0);
const unresolvedSalesTotal = unresolved.reduce((sum, row) => sum + row.sales, 0);
const unresolvedInstallTotal = unresolved.reduce((sum, row) => sum + row.installCost, 0);

if (linkedSalesTotal + unresolvedSalesTotal !== sourceSalesTotal) {
  throw new Error("매출 합계가 원본과 일치하지 않습니다.");
}
if (linkedInstallTotal + unresolvedInstallTotal !== sourceInstallTotal) {
  throw new Error("시공비 합계가 원본과 일치하지 않습니다.");
}

const appData = {
  metadata: {
    generatedAt: new Date().toISOString(),
    sourceWorkbook: "시트 1 (55).xlsx",
    sourceMap: "소액권역_지도 (2).html",
    sourceRows: sourceRows.length,
    linkedSourceRows,
    regionCount: regions.length,
    linkedRegionCount: regions.filter((region) => region.sales !== null).length,
    sourceSalesTotal,
    sourceInstallTotal,
    linkedSalesTotal,
    linkedInstallTotal,
    unresolvedSalesTotal,
    unresolvedInstallTotal,
    bbox: geo.bbox,
  },
  territories: [unassigned, ...territoryDefinitions].map((territory) => ({
    ...territory,
    staff: territory.system ? 0 : 0,
    capacityPerPerson: territory.system ? 0 : 0,
    capacityMetric: "sales",
    active: true,
  })),
  regions,
  unresolved,
};

await fs.mkdir(new URL("./app/", import.meta.url), { recursive: true });
await fs.writeFile(outputPath, `export const APP_DATA = ${JSON.stringify(appData)};\n`, "utf8");
console.log(JSON.stringify(appData.metadata));
