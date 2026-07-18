import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "C:/Users/FURSYS/Downloads/시트 1 (55).xlsx";
const mapPath = "C:/Users/FURSYS/Downloads/소액권역_지도 (2).html";
const outputPath = "C:/Users/FURSYS/Documents/권역 지도 시뮬레이션/퍼시스_2025_매출_시공비_연동지도.html";
const geoId = "geo_json_e3b5b4d43724e83a8136eb1ed3a15453";

const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
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

let html = await fs.readFile(mapPath, "utf8");
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
const byDistrict = new Map();
for (const feature of geo.features) {
  const district = feature.properties.SIG_KOR_NM;
  if (!byDistrict.has(district)) byDistrict.set(district, []);
  byDistrict.get(district).push(feature);
  Object.assign(feature.properties, {
    "퍼시스매출_2025": null,
    "퍼시스시공비_2025": null,
    "시공비율": null,
    "매출매칭상태": "데이터 없음",
    "미배분합산매출": null,
    "미배분합산시공비": null,
  });
}

const ambiguousRows = [];
const unmatchedRows = [];
const directDistricts = [];
let linkedSourceRows = 0;
for (const row of sourceRows) {
  if (row.district === "부천시" || row.district.startsWith("부천시 ")) continue;
  const candidates = byDistrict.get(row.district) ?? [];
  if (candidates.length === 1) {
    const props = candidates[0].properties;
    props["퍼시스매출_2025"] = row.sales;
    props["퍼시스시공비_2025"] = row.installCost;
    props["시공비율"] = row.sales ? row.installCost / row.sales : null;
    props["매출매칭상태"] = "연결 완료";
    directDistricts.push(row.district);
    linkedSourceRows += 1;
  } else if (candidates.length > 1) {
    ambiguousRows.push(row);
    for (const candidate of candidates) {
      candidate.properties["매출매칭상태"] = "시도 확인 필요";
      candidate.properties["미배분합산매출"] = row.sales;
      candidate.properties["미배분합산시공비"] = row.installCost;
    }
  } else {
    unmatchedRows.push(row);
  }
}

const bucheonRows = sourceRows.filter((row) => row.district === "부천시" || row.district.startsWith("부천시 "));
const bucheonFeatures = byDistrict.get("부천시") ?? [];
if (bucheonRows.length && bucheonFeatures.length === 1) {
  const sales = bucheonRows.reduce((sum, row) => sum + row.sales, 0);
  const installCost = bucheonRows.reduce((sum, row) => sum + row.installCost, 0);
  const props = bucheonFeatures[0].properties;
  props["퍼시스매출_2025"] = sales;
  props["퍼시스시공비_2025"] = installCost;
  props["시공비율"] = sales ? installCost / sales : null;
  props["매출매칭상태"] = "부천시 및 3개 구 합산";
  linkedSourceRows += bucheonRows.length;
}

const salesTotal = sourceRows.reduce((sum, row) => sum + row.sales, 0);
const installTotal = sourceRows.reduce((sum, row) => sum + row.installCost, 0);
const linkedFeatures = geo.features.filter((feature) => feature.properties["퍼시스매출_2025"] !== null).length;

html = html.slice(0, jsonStart) + JSON.stringify(geo) + html.slice(jsonEnd);

const tooltipStart = html.indexOf(`${geoId}.bindTooltip(`);
const tooltipEnd = html.indexOf(`${geoId}.addTo`, tooltipStart);
if (tooltipStart < 0 || tooltipEnd < 0) throw new Error("지도 툴팁 코드를 찾지 못했습니다.");
const tooltipCode = `${geoId}.bindTooltip(
function(layer){
  const p = layer.feature.properties;
  const fmtWon = value => value === null || value === undefined ? "-" : Number(value).toLocaleString("ko-KR") + "원";
  const fmtPct = value => value === null || value === undefined ? "-" : (Number(value) * 100).toFixed(2) + "%";
  const rows = [
    ["시도", p["${sidoKey}"] || "-"],
    ["시군구", p["SIG_KOR_NM"] || "-"],
    ["담당자", p["${assigneeKey}"] || "미배정"],
    ["2025 퍼시스 매출", fmtWon(p["퍼시스매출_2025"])],
    ["2025 퍼시스 시공비", fmtWon(p["퍼시스시공비_2025"])],
    ["시공비율", fmtPct(p["시공비율"])],
    ["데이터 상태", p["매출매칭상태"] || "-"],
  ];
  if (p["매출매칭상태"] === "시도 확인 필요") {
    rows.push(["엑셀 합산 매출(미배분)", fmtWon(p["미배분합산매출"])]);
    rows.push(["엑셀 합산 시공비(미배분)", fmtWon(p["미배분합산시공비"])]);
  }
  const div = L.DomUtil.create("div");
  div.innerHTML = '<table>' + rows.map(([label,value]) =>
    '<tr><th style="padding-right:12px;white-space:nowrap">' + label + '</th><td style="text-align:right;white-space:nowrap">' + value + '</td></tr>'
  ).join('') + '</table>';
  return div;
}, {"sticky": true, "className": "foliumtooltip"});

            `;
html = html.slice(0, tooltipStart) + tooltipCode + html.slice(tooltipEnd);

const formatEok = (value) => (value / 100000000).toFixed(1);
const ambiguousNames = ambiguousRows.map((row) => row.district).join(", ");
const summaryPanel = `
<div id="sales-summary-panel" style="
  position:fixed;top:15px;left:55px;z-index:1000;
  width:310px;background:rgba(255,255,255,0.97);padding:14px 16px;
  border-radius:12px;border:1px solid #d9e1ea;box-shadow:0 2px 12px rgba(0,0,0,0.14);
  font-family:'Noto Sans KR','맑은 고딕',sans-serif;color:#152238;">
  <div style="font-size:11px;color:#637083;font-weight:800;letter-spacing:.7px">2025 퍼시스 지역 실적</div>
  <div style="font-size:18px;font-weight:900;margin:3px 0 10px">매출 · 시공비 연동 지도</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px">
    <div style="background:#f3f7fb;border-radius:8px;padding:8px"><div style="font-size:10px;color:#6b7788">전체 매출</div><div style="font-size:15px;font-weight:800">${formatEok(salesTotal)}억원</div></div>
    <div style="background:#f3f7fb;border-radius:8px;padding:8px"><div style="font-size:10px;color:#6b7788">전체 시공비</div><div style="font-size:15px;font-weight:800">${formatEok(installTotal)}억원</div></div>
  </div>
  <div style="font-size:11px;line-height:1.65;color:#425066">
    정확 연결 <b>${linkedSourceRows}/${sourceRows.length}행</b> · 지도 권역 <b>${linkedFeatures}개</b><br>
    시공비율 <b>${(installTotal / salesTotal * 100).toFixed(2)}%</b><br>
    <span style="color:#b45309">확인 필요: ${ambiguousNames}</span>
  </div>
</div>`;
html = html.replace("<div class=\"folium-map\"", summaryPanel + "\n    <div class=\"folium-map\"");

await fs.writeFile(outputPath, html, "utf8");
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .join("\n");
new Function(inlineScripts);
const attachedFeatures = geo.features.filter((feature) => feature.properties["퍼시스매출_2025"] !== null);
const attachedNames = new Set(attachedFeatures.map((feature) => feature.properties.SIG_KOR_NM));
const directMissingFromFeatures = directDistricts.filter((district) => !attachedNames.has(district));
const attachedSales = attachedFeatures.reduce((sum, feature) => sum + feature.properties["퍼시스매출_2025"], 0);
const attachedInstall = attachedFeatures.reduce((sum, feature) => sum + feature.properties["퍼시스시공비_2025"], 0);
const ambiguousSales = ambiguousRows.reduce((sum, row) => sum + row.sales, 0);
const ambiguousInstall = ambiguousRows.reduce((sum, row) => sum + row.installCost, 0);
console.log(JSON.stringify({
  outputPath,
  sourceRows: sourceRows.length,
  linkedSourceRows,
  linkedFeatures,
  ambiguous: ambiguousRows.map((row) => row.district),
  unmatched: unmatchedRows.map((row) => row.district),
  salesTotal,
  installTotal,
  attachedSales,
  attachedInstall,
  ambiguousSales,
  ambiguousInstall,
  salesReconciles: attachedSales + ambiguousSales === salesTotal,
  installReconciles: attachedInstall + ambiguousInstall === installTotal,
  directDistricts: directDistricts.length,
  directMissingFromFeatures,
  javascriptSyntax: "PASS",
  outputBytes: (await fs.stat(outputPath)).size,
}));
