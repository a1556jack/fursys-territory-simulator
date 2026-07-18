import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const COLORS = {
  navy: "#183B66",
  blue: "#2F6FED",
  paleBlue: "#E9F0FF",
  paleGray: "#F2F5F8",
  line: "#D9E1EA",
  ink: "#142033",
  muted: "#68758A",
  green: "#247A4B",
  paleGreen: "#E7F5ED",
  orange: "#B8640A",
  paleOrange: "#FFF4DD",
};

const moneyFormat = "#,##0";
const percentFormat = "0.0%";

export async function createScenarioWorkbook(data, state) {
  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("권역 요약");
  const detail = workbook.worksheets.add("지역별 상세");
  const unresolvedSheet = workbook.worksheets.add("미연결 데이터");

  const territoryRows = buildTerritoryRows(data, state);
  const detailRows = buildDetailRows(data, state, territoryRows);
  const unresolvedRows = data.unresolved.map((item) => [
    item.name,
    item.sales,
    item.installCost,
    (item.candidateLabels || []).join(", ") || "후보 없음",
  ]);

  populateDetailSheet(detail, detailRows);
  populateUnresolvedSheet(unresolvedSheet, unresolvedRows);
  populateSummarySheet(summary, state, territoryRows, detailRows.length, unresolvedRows.length);

  return workbook;
}

export async function createScenarioWorkbookBytes(data, state) {
  const workbook = await createScenarioWorkbook(data, state);
  const blob = await SpreadsheetFile.exportXlsx(workbook);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fursys-territory-export-"));
  const tempFile = path.join(tempDir, "scenario.xlsx");
  try {
    await blob.save(tempFile);
    return new Uint8Array(await fs.readFile(tempFile));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function createTerritoryWorkbook(data, state) {
  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("권역별 요약");
  const activeTerritories = state.territories.filter((territory) => territory.active && !territory.system);
  const baselineTerritoryById = new Map(data.territories.map((territory) => [territory.id, territory]));
  const usedSheetNames = new Set(["권역별 요약"]);

  const territoryExports = activeTerritories.map((territory, index) => {
    const sheetName = createUniqueSheetName(index, territory.name, usedSheetNames);
    const sheet = workbook.worksheets.add(sheetName);
    const regions = data.regions
      .filter((region) => (state.assignments[region.id] || "unassigned") === territory.id)
      .sort((a, b) => `${a.sido}${a.name}`.localeCompare(`${b.sido}${b.name}`, "ko"));
    const detailRows = regions.map((region) => {
      const baselineTerritory = baselineTerritoryById.get(region.baselineTerritoryId);
      return [
        region.sido,
        region.name,
        territory.name,
        baselineTerritory?.name || "미배정",
        region.baselineTerritoryId === territory.id ? "유지" : "변경",
        region.sales,
        region.installCost,
        null,
        region.dataStatus,
      ];
    });
    const baselineRegions = data.regions.filter((region) => region.baselineTerritoryId === territory.id);
    const baseline = {
      regionCount: baselineRegions.length,
      sales: baselineRegions.reduce((sum, region) => sum + (region.sales || 0), 0),
      installCost: baselineRegions.reduce((sum, region) => sum + (region.installCost || 0), 0),
    };
    populateTerritoryExportSheet(sheet, state, territory, detailRows, baseline);
    return { territory, sheetName, baseline };
  });

  populateTerritoryExportSummary(summary, state, territoryExports);
  return workbook;
}

export async function createTerritoryWorkbookBytes(data, state) {
  const workbook = await createTerritoryWorkbook(data, state);
  const blob = await SpreadsheetFile.exportXlsx(workbook);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fursys-territory-batch-export-"));
  const tempFile = path.join(tempDir, "territories.xlsx");
  try {
    await blob.save(tempFile);
    return new Uint8Array(await fs.readFile(tempFile));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function populateTerritoryExportSummary(sheet, state, territoryExports) {
  const headerRow = 6;
  const firstRow = 7;
  const lastDataRow = Math.max(firstRow, firstRow + territoryExports.length - 1);
  const totalRow = lastDataRow + 1;

  sheet.showGridLines = false;
  sheet.mergeCells("A1:K1");
  sheet.getRange("A1").values = [["퍼시스 권역별 엑셀 일괄 자료"]];
  sheet.getRange("A1:K1").format = titleFormat();
  sheet.getRange("A1:K1").format.rowHeight = 30;
  sheet.getRange("A2:F2").values = [[
    "시나리오", state.scenarioName || "현재 시나리오",
    "내보낸 시각", new Date(),
    "기준", "2025년",
  ]];
  sheet.getRange("D2").format.numberFormat = "yyyy-mm-dd hh:mm";
  sheet.getRange("A2:F2").format = {
    fill: COLORS.paleGray,
    font: { color: COLORS.ink },
    borders: { preset: "outside", style: "thin", color: COLORS.line },
  };
  sheet.getRange("A4:B4").values = [["추가 인원 1명 기준 정상시공비", 50000000]];
  sheet.getRange("A4:B4").format = {
    fill: COLORS.paleOrange,
    font: { bold: true, color: COLORS.orange },
    borders: { preset: "all", style: "thin", color: "#E8C58D" },
  };
  sheet.getRange("B4").format.numberFormat = moneyFormat;

  const headers = [
    "현재 권역", "기존 지역수", "현재 지역수", "지역수 증감",
    "기존 시공결과금액", "현재 시공결과금액", "금액 증감",
    "기존 정상시공비", "현재 정상시공비", "정상시공비 증감", "추가 인원",
  ];
  sheet.getRange(`A${headerRow}:K${headerRow}`).values = [headers];
  sheet.getRange(`A${headerRow}:K${headerRow}`).format = headerFormat();

  if (territoryExports.length) {
    sheet.getRange(`A${firstRow}:K${firstRow + territoryExports.length - 1}`).values = territoryExports.map(({ territory, baseline }) => [
      territory.name,
      baseline.regionCount,
      null,
      null,
      baseline.sales,
      null,
      null,
      baseline.installCost,
      null,
      null,
      null,
    ]);
    territoryExports.forEach(({ sheetName }, index) => {
      const row = firstRow + index;
      const ref = escapeSheetName(sheetName);
      sheet.getRange(`C${row}`).formulas = [[`='${ref}'!B4`]];
      sheet.getRange(`D${row}`).formulas = [[`=C${row}-B${row}`]];
      sheet.getRange(`F${row}`).formulas = [[`='${ref}'!D4`]];
      sheet.getRange(`G${row}`).formulas = [[`=F${row}-E${row}`]];
      sheet.getRange(`I${row}`).formulas = [[`='${ref}'!F4`]];
      sheet.getRange(`J${row}`).formulas = [[`=I${row}-H${row}`]];
      sheet.getRange(`K${row}`).formulas = [[`=IF(J${row}>0,ROUNDUP(J${row}/$B$4,0),0)`]];
    });
  }

  sheet.getRange(`A${totalRow}:K${totalRow}`).values = [["전체 합계", null, null, null, null, null, null, null, null, null, null]];
  for (const column of ["B", "C", "E", "F", "H", "I", "K"]) {
    sheet.getRange(`${column}${totalRow}`).formulas = [[`=SUM(${column}${firstRow}:${column}${lastDataRow})`]];
  }
  sheet.getRange(`D${totalRow}`).formulas = [[`=C${totalRow}-B${totalRow}`]];
  sheet.getRange(`G${totalRow}`).formulas = [[`=F${totalRow}-E${totalRow}`]];
  sheet.getRange(`J${totalRow}`).formulas = [[`=I${totalRow}-H${totalRow}`]];
  sheet.getRange(`A${totalRow}:K${totalRow}`).format = totalFormat();
  sheet.getRange(`B${firstRow}:D${totalRow}`).format.numberFormat = "#,##0";
  sheet.getRange(`E${firstRow}:J${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`K${firstRow}:K${totalRow}`).format.numberFormat = "#,##0\"명\"";
  sheet.getRange(`A${firstRow}:K${totalRow}`).format.borders = { preset: "inside", style: "thin", color: "#E7ECF1" };
  sheet.getRange(`J${firstRow}:J${lastDataRow}`).conditionalFormats.add("cellIs", {
    operator: "greaterThan",
    formula: 0,
    format: { fill: COLORS.paleOrange, font: { color: COLORS.orange, bold: true } },
  });
  setColumnWidths(sheet, totalRow, [31, 22, 13, 13, 20, 20, 18, 18, 18, 18, 13]);
  sheet.freezePanes.freezeRows(headerRow);
}

function populateTerritoryExportSheet(sheet, state, territory, rows, baseline) {
  const headerRow = 8;
  const firstRow = 9;
  const dataRowCount = Math.max(rows.length, 1);
  const lastDataRow = firstRow + dataRowCount - 1;
  const totalRow = lastDataRow + 1;

  sheet.showGridLines = false;
  sheet.mergeCells("A1:I1");
  sheet.getRange("A1").values = [[`${territory.name} 권역 지역별 현황`]];
  sheet.getRange("A1:I1").format = titleFormat();
  sheet.getRange("A1:I1").format.rowHeight = 30;
  sheet.mergeCells("A2:I2");
  sheet.getRange("A2").values = [[`시나리오: ${state.scenarioName || "현재 시나리오"} · 기준: 2025년 · 현재 배정 지역 기준`]];
  sheet.getRange("A2:I2").format = { fill: COLORS.paleGray, font: { color: COLORS.muted } };

  sheet.getRange("A4:H4").values = [[
    "현재 지역수", null,
    "현재 시공결과금액", null,
    "현재 정상시공비", null,
    "현재 정상시공비율", null,
  ]];
  sheet.getRange("B4").formulas = [[`=COUNTA(B${firstRow}:B${lastDataRow})`]];
  sheet.getRange("D4").formulas = [[`=SUM(F${firstRow}:F${lastDataRow})`]];
  sheet.getRange("F4").formulas = [[`=SUM(G${firstRow}:G${lastDataRow})`]];
  sheet.getRange("H4").formulas = [["=IFERROR(F4/D4,0)"]];
  sheet.getRange("A4:H4").format = {
    fill: COLORS.paleBlue,
    font: { bold: true, color: COLORS.navy },
    borders: { preset: "all", style: "thin", color: "#C9D8F4" },
    wrapText: true,
  };
  sheet.getRange("A4:H4").format.rowHeight = 34;
  sheet.getRange("B4").format.numberFormat = "#,##0";
  sheet.getRange("D4:F4").format.numberFormat = moneyFormat;
  sheet.getRange("H4").format.numberFormat = percentFormat;

  sheet.getRange("A6:H6").values = [[
    "기존 지역수", baseline.regionCount,
    "기존 시공결과금액", baseline.sales,
    "기존 정상시공비", baseline.installCost,
    "정상시공비 증감", null,
  ]];
  sheet.getRange("H6").formulas = [["=F4-F6"]];
  sheet.getRange("A6:H6").format = {
    fill: COLORS.paleGray,
    font: { color: COLORS.ink },
    borders: { preset: "all", style: "thin", color: COLORS.line },
    wrapText: true,
  };
  sheet.getRange("A6:H6").format.rowHeight = 34;
  sheet.getRange("B6").format.numberFormat = "#,##0";
  sheet.getRange("D6:H6").format.numberFormat = moneyFormat;

  const headers = ["시도", "시군구", "현재 권역", "기존 권역", "변경여부", "시공결과금액", "정상시공비", "정상시공비율", "데이터상태"];
  sheet.getRange(`A${headerRow}:I${headerRow}`).values = [headers];
  sheet.getRange(`A${headerRow}:I${headerRow}`).format = headerFormat();
  if (rows.length) {
    sheet.getRange(`A${firstRow}:I${firstRow + rows.length - 1}`).values = rows;
    sheet.getRange(`H${firstRow}`).formulas = [[`=IFERROR(G${firstRow}/F${firstRow},0)`]];
    sheet.getRange(`H${firstRow}:H${firstRow + rows.length - 1}`).fillDown();
  } else {
    sheet.getRange(`A${firstRow}:I${firstRow}`).values = [["-", null, territory.name, "-", "배정 없음", null, null, null, "현재 배정 지역 없음"]];
  }

  sheet.getRange(`A${totalRow}:I${totalRow}`).values = [["권역 합계", null, territory.name, "-", "합계", null, null, null, "현재 배정 기준"]];
  sheet.getRange(`F${totalRow}`).formulas = [[`=SUM(F${firstRow}:F${lastDataRow})`]];
  sheet.getRange(`G${totalRow}`).formulas = [[`=SUM(G${firstRow}:G${lastDataRow})`]];
  sheet.getRange(`H${totalRow}`).formulas = [[`=IFERROR(G${totalRow}/F${totalRow},0)`]];
  sheet.getRange(`A${totalRow}:I${totalRow}`).format = totalFormat();
  sheet.getRange(`F${firstRow}:G${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`H${firstRow}:H${totalRow}`).format.numberFormat = percentFormat;
  sheet.getRange(`A${firstRow}:I${totalRow}`).format.borders = { preset: "inside", style: "thin", color: "#E7ECF1" };
  sheet.getRange(`E${firstRow}:E${lastDataRow}`).conditionalFormats.add("containsText", {
    text: "변경",
    format: { fill: COLORS.paleOrange, font: { color: COLORS.orange, bold: true } },
  });
  setColumnWidths(sheet, totalRow, [16, 18, 18, 18, 12, 20, 18, 15, 28]);
  sheet.freezePanes.freezeRows(headerRow);
}

function createUniqueSheetName(index, territoryName, used) {
  const prefix = `${String(index + 1).padStart(2, "0")}_`;
  const cleaned = String(territoryName || "권역").replace(/[\\/?*:[\]]/g, "_").trim() || "권역";
  let candidate = `${prefix}${cleaned}`.slice(0, 31);
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = `_${suffix}`;
    candidate = `${prefix}${cleaned}`.slice(0, 31 - tail.length) + tail;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function escapeSheetName(value) {
  return String(value).replace(/'/g, "''");
}

function buildTerritoryRows(data, state) {
  const baselineById = new Map(data.territories.map((territory) => [territory.id, territory]));
  const currentById = new Map(state.territories.map((territory) => [territory.id, territory]));
  const assignedIds = new Set(Object.values(state.assignments));
  const orderedIds = [];
  const add = (id) => {
    if (id && id !== "unassigned" && !orderedIds.includes(id)) orderedIds.push(id);
  };

  for (const territory of state.territories) {
    if (territory.active && !territory.system) add(territory.id);
  }
  for (const territory of data.territories) {
    if (!territory.system) add(territory.id);
  }
  for (const territory of state.territories) {
    if (territory.active || assignedIds.has(territory.id)) add(territory.id);
  }
  orderedIds.push("unassigned");

  return orderedIds.map((id) => {
    const baseline = baselineById.get(id);
    const current = currentById.get(id);
    const active = current?.active || id === "unassigned";
    let type = "신규 권역";
    if (id === "unassigned") type = "미배정";
    else if (baseline && active) type = "기존 권역";
    else if (baseline && !active) type = "삭제 권역";
    return {
      id,
      currentName: active ? (current?.name || baseline?.name || id) : "(삭제)",
      baselineName: baseline?.name || "-",
      type,
    };
  });
}

function buildDetailRows(data, state, territoryRows) {
  const summaryOrder = new Map(territoryRows.map((territory, index) => [territory.id, index]));
  const currentById = new Map(state.territories.map((territory) => [territory.id, territory]));
  const baselineById = new Map(data.territories.map((territory) => [territory.id, territory]));
  return data.regions
    .map((region) => {
      const currentId = state.assignments[region.id] || "unassigned";
      const baselineId = region.baselineTerritoryId || "unassigned";
      const current = currentById.get(currentId) || currentById.get("unassigned") || baselineById.get("unassigned");
      const baseline = baselineById.get(baselineId);
      return {
        currentId,
        baselineId,
        sort: summaryOrder.get(currentId) ?? 999,
        values: [
          current?.name || "미배정",
          baseline?.name || "미배정",
          currentId === baselineId ? "유지" : "변경",
          region.sido,
          region.name,
          region.sales,
          region.installCost,
          null,
          region.dataStatus,
          currentId,
          baselineId,
        ],
      };
    })
    .sort((a, b) => a.sort - b.sort
      || String(a.values[3]).localeCompare(String(b.values[3]), "ko")
      || String(a.values[4]).localeCompare(String(b.values[4]), "ko"))
    .map((item) => item.values);
}

function populateSummarySheet(sheet, state, territoryRows, detailCount, unresolvedCount) {
  const detailFirst = 5;
  const detailLast = detailFirst + detailCount - 1;
  const unresolvedFirst = 5;
  const unresolvedLast = Math.max(unresolvedFirst, unresolvedFirst + unresolvedCount - 1);
  const headerRow = 7;
  const firstRow = headerRow + 1;
  const lastDataRow = firstRow + territoryRows.length - 1;
  const totalRow = lastDataRow + 1;

  sheet.showGridLines = false;
  sheet.mergeCells("A1:O1");
  sheet.getRange("A1").values = [["퍼시스 권역 시나리오 결과"]];
  sheet.getRange("A1:O1").format = titleFormat();
  sheet.getRange("A1:O1").format.rowHeight = 30;

  sheet.getRange("A2:F2").values = [[
    "시나리오", state.scenarioName || "현재 시나리오",
    "내보낸 시각", new Date(),
    "기준", "2025년",
  ]];
  sheet.getRange("D2").format.numberFormat = "yyyy-mm-dd hh:mm";
  sheet.getRange("A2:F2").format = {
    fill: COLORS.paleGray,
    font: { color: COLORS.ink },
    borders: { preset: "outside", style: "thin", color: COLORS.line },
  };

  sheet.getRange("A4:H4").values = [[
    "지도 연결 시공결과금액", null,
    "미연결 시공결과금액", null,
    "원본 전체 시공결과금액", null,
    "원본 전체 정상시공비", null,
  ]];
  sheet.getRange("B4").formulas = [[`=SUM('지역별 상세'!$F$${detailFirst}:$F$${detailLast})`]];
  sheet.getRange("D4").formulas = [[`=SUM('미연결 데이터'!$B$${unresolvedFirst}:$B$${unresolvedLast})`]];
  sheet.getRange("F4").formulas = [["=B4+D4"]];
  sheet.getRange("H4").formulas = [[`=SUM('지역별 상세'!$G$${detailFirst}:$G$${detailLast})+SUM('미연결 데이터'!$C$${unresolvedFirst}:$C$${unresolvedLast})`]];
  sheet.getRange("A4:H4").format = {
    fill: COLORS.paleBlue,
    font: { bold: true, color: COLORS.navy },
    borders: { preset: "all", style: "thin", color: "#C9D8F4" },
    wrapText: true,
  };
  for (const cell of ["B4", "D4", "F4", "H4"]) sheet.getRange(cell).format.numberFormat = moneyFormat;

  sheet.mergeCells("A5:O5");
  sheet.getRange("A5").values = [["기존 권역 매출액은 원본의 시공결과금액을 최초 권역 기준으로 집계한 값입니다. 미연결 동명 지역은 별도 시트에 보존됩니다."]];
  sheet.getRange("A5:O5").format = { fill: "#FFF8E8", font: { color: "#70430E" }, wrapText: true };

  const headers = [
    "현재 권역", "기존 권역", "권역 구분", "기존 지역수", "현재 지역수", "지역수 증감",
    "기존 권역 매출액", "현재 시공결과금액", "금액 증감", "증감률",
    "기존 정상시공비", "현재 정상시공비", "정상시공비 증감", "현재 정상시공비율", "권역ID",
  ];
  sheet.getRange(`A${headerRow}:O${headerRow}`).values = [headers];
  sheet.getRange(`A${headerRow}:O${headerRow}`).format = headerFormat();
  sheet.getRange(`A${firstRow}:O${lastDataRow}`).values = territoryRows.map((territory) => [
    territory.currentName, territory.baselineName, territory.type,
    null, null, null, null, null, null, null, null, null, null, null, territory.id,
  ]);

  for (let row = firstRow; row <= lastDataRow; row += 1) {
    sheet.getRange(`D${row}`).formulas = [[`=COUNTIF('지역별 상세'!$K$${detailFirst}:$K$${detailLast},$O${row})`]];
    sheet.getRange(`E${row}`).formulas = [[`=COUNTIF('지역별 상세'!$J$${detailFirst}:$J$${detailLast},$O${row})`]];
    sheet.getRange(`F${row}`).formulas = [[`=E${row}-D${row}`]];
    sheet.getRange(`G${row}`).formulas = [[`=SUMIF('지역별 상세'!$K$${detailFirst}:$K$${detailLast},$O${row},'지역별 상세'!$F$${detailFirst}:$F$${detailLast})`]];
    sheet.getRange(`H${row}`).formulas = [[`=SUMIF('지역별 상세'!$J$${detailFirst}:$J$${detailLast},$O${row},'지역별 상세'!$F$${detailFirst}:$F$${detailLast})`]];
    sheet.getRange(`I${row}`).formulas = [[`=H${row}-G${row}`]];
    sheet.getRange(`J${row}`).formulas = [[`=IFERROR(I${row}/G${row},0)`]];
    sheet.getRange(`K${row}`).formulas = [[`=SUMIF('지역별 상세'!$K$${detailFirst}:$K$${detailLast},$O${row},'지역별 상세'!$G$${detailFirst}:$G$${detailLast})`]];
    sheet.getRange(`L${row}`).formulas = [[`=SUMIF('지역별 상세'!$J$${detailFirst}:$J$${detailLast},$O${row},'지역별 상세'!$G$${detailFirst}:$G$${detailLast})`]];
    sheet.getRange(`M${row}`).formulas = [[`=L${row}-K${row}`]];
    sheet.getRange(`N${row}`).formulas = [[`=IFERROR(L${row}/H${row},0)`]];
  }

  sheet.getRange(`A${totalRow}:O${totalRow}`).values = [["전체 합계", "-", "합계", null, null, null, null, null, null, null, null, null, null, null, "TOTAL"]];
  for (const column of ["D", "E", "G", "H", "K", "L"]) {
    sheet.getRange(`${column}${totalRow}`).formulas = [[`=SUM(${column}${firstRow}:${column}${lastDataRow})`]];
  }
  sheet.getRange(`F${totalRow}`).formulas = [[`=E${totalRow}-D${totalRow}`]];
  sheet.getRange(`I${totalRow}`).formulas = [[`=H${totalRow}-G${totalRow}`]];
  sheet.getRange(`J${totalRow}`).formulas = [[`=IFERROR(I${totalRow}/G${totalRow},0)`]];
  sheet.getRange(`M${totalRow}`).formulas = [[`=L${totalRow}-K${totalRow}`]];
  sheet.getRange(`N${totalRow}`).formulas = [[`=IFERROR(L${totalRow}/H${totalRow},0)`]];
  sheet.getRange(`A${totalRow}:O${totalRow}`).format = totalFormat();

  sheet.getRange(`D${firstRow}:I${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`D${firstRow}:F${totalRow}`).format.numberFormat = "#,##0";
  sheet.getRange(`G${firstRow}:I${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`J${firstRow}:J${totalRow}`).format.numberFormat = percentFormat;
  sheet.getRange(`K${firstRow}:M${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`N${firstRow}:N${totalRow}`).format.numberFormat = percentFormat;
  sheet.getRange(`A${firstRow}:O${totalRow}`).format.borders = { preset: "inside", style: "thin", color: "#E7ECF1" };

  setColumnWidths(sheet, totalRow, [18, 18, 13, 20, 11, 11, 19, 19, 17, 11, 18, 18, 18, 16, 22]);
  sheet.freezePanes.freezeRows(headerRow);
}

function populateDetailSheet(sheet, rows) {
  const headerRow = 4;
  const firstRow = 5;
  const lastDataRow = firstRow + rows.length - 1;
  const totalRow = lastDataRow + 1;
  sheet.showGridLines = false;
  sheet.mergeCells("A1:K1");
  sheet.getRange("A1").values = [["지역별 권역 배정 및 시공 금액"]];
  sheet.getRange("A1:K1").format = titleFormat();
  sheet.mergeCells("A2:K2");
  sheet.getRange("A2").values = [["금액이 없는 지역은 원본 데이터가 연결되지 않은 지역입니다. 변경여부는 최초 권역과 현재 시나리오 권역을 비교합니다."]];
  sheet.getRange("A2:K2").format = { fill: COLORS.paleGray, font: { color: COLORS.muted }, wrapText: true };

  const headers = ["현재 권역", "기존 권역", "변경여부", "시도", "시군구", "시공결과금액", "정상시공비", "정상시공비율", "데이터상태", "현재권역ID", "기존권역ID"];
  sheet.getRange(`A${headerRow}:K${headerRow}`).values = [headers];
  sheet.getRange(`A${headerRow}:K${headerRow}`).format = headerFormat();
  sheet.getRange(`A${firstRow}:K${lastDataRow}`).values = rows;
  sheet.getRange(`H${firstRow}`).formulas = [[`=IFERROR(G${firstRow}/F${firstRow},0)`]];
  sheet.getRange(`H${firstRow}:H${lastDataRow}`).fillDown();

  sheet.getRange(`A${totalRow}:K${totalRow}`).values = [["지도 연결 합계", "-", "합계", "-", "-", null, null, null, "연결 지역 합계", "TOTAL", "TOTAL"]];
  sheet.getRange(`F${totalRow}`).formulas = [[`=SUM(F${firstRow}:F${lastDataRow})`]];
  sheet.getRange(`G${totalRow}`).formulas = [[`=SUM(G${firstRow}:G${lastDataRow})`]];
  sheet.getRange(`H${totalRow}`).formulas = [[`=IFERROR(G${totalRow}/F${totalRow},0)`]];
  sheet.getRange(`A${totalRow}:K${totalRow}`).format = totalFormat();

  sheet.getRange(`F${firstRow}:G${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`H${firstRow}:H${totalRow}`).format.numberFormat = percentFormat;
  sheet.getRange(`A${firstRow}:K${totalRow}`).format.borders = { preset: "inside", style: "thin", color: "#E7ECF1" };
  sheet.getRange(`C${firstRow}:C${lastDataRow}`).conditionalFormats.add("containsText", {
    text: "변경",
    format: { fill: COLORS.paleOrange, font: { color: COLORS.orange, bold: true } },
  });
  setColumnWidths(sheet, totalRow, [18, 18, 11, 15, 18, 18, 18, 14, 23, 22, 22]);
  sheet.freezePanes.freezeRows(headerRow);
}

function populateUnresolvedSheet(sheet, rows) {
  const headerRow = 4;
  const firstRow = 5;
  const lastDataRow = Math.max(firstRow, firstRow + rows.length - 1);
  const totalRow = lastDataRow + 1;
  sheet.showGridLines = false;
  sheet.mergeCells("A1:D1");
  sheet.getRange("A1").values = [["미연결 원본 데이터"]];
  sheet.getRange("A1:D1").format = titleFormat();
  sheet.mergeCells("A2:D2");
  sheet.getRange("A2").values = [["시도 정보가 없어 동명 시군구 중 하나로 확정할 수 없는 데이터입니다. 권역 합계에는 배분하지 않고 원본 전체 합계에만 포함합니다."]];
  sheet.getRange("A2:D2").format = { fill: "#FFF8E8", font: { color: "#70430E" }, wrapText: true };
  sheet.getRange(`A${headerRow}:D${headerRow}`).values = [["지역명", "시공결과금액", "정상시공비", "후보 지역"]];
  sheet.getRange(`A${headerRow}:D${headerRow}`).format = headerFormat();
  if (rows.length) sheet.getRange(`A${firstRow}:D${lastDataRow}`).values = rows;
  sheet.getRange(`A${totalRow}:D${totalRow}`).values = [["미연결 합계", null, null, "-"]];
  sheet.getRange(`B${totalRow}`).formulas = [[`=SUM(B${firstRow}:B${lastDataRow})`]];
  sheet.getRange(`C${totalRow}`).formulas = [[`=SUM(C${firstRow}:C${lastDataRow})`]];
  sheet.getRange(`A${totalRow}:D${totalRow}`).format = totalFormat();
  sheet.getRange(`B${firstRow}:C${totalRow}`).format.numberFormat = moneyFormat;
  sheet.getRange(`A${firstRow}:D${totalRow}`).format.borders = { preset: "inside", style: "thin", color: "#E7ECF1" };
  setColumnWidths(sheet, totalRow, [18, 20, 18, 58]);
  sheet.freezePanes.freezeRows(headerRow);
}

function titleFormat() {
  return {
    fill: COLORS.navy,
    font: { bold: true, color: "#FFFFFF" },
    verticalAlignment: "center",
  };
}

function headerFormat() {
  return {
    fill: COLORS.navy,
    font: { bold: true, color: "#FFFFFF" },
    borders: { preset: "all", style: "thin", color: "#FFFFFF" },
    wrapText: true,
    verticalAlignment: "center",
  };
}

function totalFormat() {
  return {
    fill: COLORS.paleGreen,
    font: { bold: true, color: COLORS.green },
    borders: { preset: "doubleBottom", style: "medium", color: COLORS.green },
  };
}

function setColumnWidths(sheet, lastRow, widths) {
  widths.forEach((width, index) => {
    const column = columnLetter(index + 1);
    sheet.getRange(`${column}1:${column}${lastRow}`).format.columnWidth = width;
  });
}

function columnLetter(number) {
  let value = number;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}
