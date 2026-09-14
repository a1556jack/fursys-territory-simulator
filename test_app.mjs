import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";
import {
  UNASSIGNED_ID,
  aggregateRegions,
  capacityResult,
  countChangedRegions,
  createInitialState,
  getInstallCostStaffAlerts,
  validateScenario,
} from "./app/core.mjs";

assert.equal(APP_DATA.regions.length, 250, "전국 시군구 250개가 있어야 합니다.");
assert.equal(APP_DATA.metadata.sourceRows, 109, "원본 데이터 행 수가 일치해야 합니다.");
assert.equal(APP_DATA.metadata.linkedSourceRows, 107, "연결 데이터 행 수가 일치해야 합니다.");
assert.equal(APP_DATA.metadata.linkedSalesTotal + APP_DATA.metadata.unresolvedSalesTotal, APP_DATA.metadata.sourceSalesTotal, "매출 합계가 원본과 일치해야 합니다.");
assert.equal(APP_DATA.metadata.linkedInstallTotal + APP_DATA.metadata.unresolvedInstallTotal, APP_DATA.metadata.sourceInstallTotal, "시공비 합계가 원본과 일치해야 합니다.");

const expectedManualAllocations = new Map([
  ["11140", [2925437591, 125265339]],
  ["28110", [325048621, 13918371]],
  ["11500", [1318664990, 56255470]],
  ["28140", [30495000, 1334280]],
  ["28260", [546579900, 22403990]],
]);
for (const [regionId, [sales, installCost]] of expectedManualAllocations) {
  const region = APP_DATA.regions.find((item) => item.id === regionId);
  assert.ok(region, `Manual allocation region ${regionId} must exist.`);
  assert.equal(region.sales, sales, `Sales allocation for ${regionId} must match.`);
  assert.equal(region.installCost, installCost, `Install-cost allocation for ${regionId} must match.`);
}
assert.deepEqual(APP_DATA.unresolved.map((row) => row.name), ["고성군", "남구"], "Only genuinely ambiguous non-Gyeongin rows should remain unresolved.");

const state = createInitialState(APP_DATA);
assert.equal(state.territories.filter((territory) => territory.active && !territory.system).length, 7, "최초 권역은 7개여야 합니다.");
assert.equal(countChangedRegions(APP_DATA, state), 0, "초기 상태는 변경 지역이 없어야 합니다.");

const movable = APP_DATA.regions.find((region) => region.baselineTerritoryId !== UNASSIGNED_ID);
state.assignments[movable.id] = UNASSIGNED_ID;
assert.equal(countChangedRegions(APP_DATA, state), 1, "지역 이동이 변경 건수에 반영되어야 합니다.");

const aggregates = aggregateRegions(APP_DATA, state, "current");
const allocatedSales = [...aggregates.values()].reduce((sum, item) => sum + item.sales, 0);
assert.equal(allocatedSales, APP_DATA.metadata.linkedSalesTotal, "지역 이동 후에도 연결 매출 합계가 보존되어야 합니다.");

const capacity = capacityResult({ staff: 2, capacityPerPerson: 10, capacityMetric: "sales" }, { sales: 2500000000, installCost: 0 });
assert.equal(capacity.status, "초과", "업무량이 케파를 초과하면 초과로 표시되어야 합니다.");
assert.equal(capacity.utilization, 1.25);

const staffingState = createInitialState(APP_DATA);
const staffingRegion = APP_DATA.regions.find((region) => region.installCost > 0 && region.baselineTerritoryId !== UNASSIGNED_ID);
const staffingTarget = staffingState.territories.find((territory) => !territory.system && territory.id !== staffingRegion.baselineTerritoryId);
staffingState.assignments[staffingRegion.id] = staffingTarget.id;
const staffingAlerts = getInstallCostStaffAlerts(APP_DATA, staffingState);
const targetAlert = staffingAlerts.find((alert) => alert.territoryId === staffingTarget.id);
assert.equal(targetAlert.increase, staffingRegion.installCost, "이동한 지역의 정상시공비가 대상 권역 증가액으로 반영되어야 합니다.");
assert.equal(targetAlert.additionalStaff, Math.ceil(staffingRegion.installCost / 50000000), "정상시공비 5,000만원당 추가 인원 1명을 올림 계산해야 합니다.");
assert.ok(!staffingAlerts.some((alert) => alert.territoryId === staffingRegion.baselineTerritoryId), "정상시공비가 감소한 기존 권역은 증가 알림에서 제외해야 합니다.");

const invalidTarget = structuredClone(state);
invalidTarget.assignments[movable.id] = "deleted-territory";
validateScenario(APP_DATA, invalidTarget);
assert.equal(invalidTarget.assignments[movable.id], UNASSIGNED_ID, "존재하지 않는 권역 배정은 미배정으로 이동해야 합니다.");

const [appSource, appHtml] = await Promise.all([
  readFile(new URL("./app/app.mjs", import.meta.url), "utf8"),
  readFile(new URL("./app/index.html", import.meta.url), "utf8"),
]);
assert.doesNotMatch(appSource, /window\.(prompt|confirm|alert)\s*\(/, "Codex 브라우저에서 지원하지 않는 기본 대화상자를 사용하면 안 됩니다.");
assert.match(appHtml, /id="app-dialog"/, "권역 생성·삭제용 앱 내부 대화상자가 있어야 합니다.");
assert.match(appSource, /openTextDialog/, "권역 이름 입력 대화상자가 연결되어야 합니다.");
assert.match(appSource, /openConfirmDialog/, "삭제·복원 확인 대화상자가 연결되어야 합니다.");
assert.match(appSource, /addEventListener\("wheel", handleMapWheel, \{ passive: false \}\)/, "지도 휠이 페이지 대신 지도 확대·축소를 처리해야 합니다.");
assert.match(appSource, /addEventListener\("pointerdown", handleMapPointerDown\)/, "지도 왼쪽 드래그 이동이 연결되어야 합니다.");
assert.match(appSource, /setPointerCapture/, "지도 밖으로 끌어도 드래그가 이어져야 합니다.");
assert.match(appSource, /suppressMapClick/, "지도 드래그 뒤 지역 클릭이 오작동하지 않아야 합니다.");
assert.match(appHtml, /id="change-list"[^>]*tabindex="0"[^>]*aria-label="변경 내역 목록"/, "변경 내역 목록은 독립적으로 스크롤 가능한 영역이어야 합니다.");
assert.match(appHtml, /id="change-filter-unassigned"[^>]*aria-pressed="false"/, "변경 내역에 미배정 전용 필터가 있어야 합니다.");
assert.match(appSource, /showOnlyUnassignedChanges/, "미배정 변경 내역 필터 상태가 관리되어야 합니다.");
assert.match(appSource, /data-action="quick-assign"/, "미배정 지역을 목록에서 즉시 배정할 수 있어야 합니다.");
assert.match(appSource, /handleChangeListChange/, "빠른 권역 배정 이벤트가 연결되어야 합니다.");

const appCss = await readFile(new URL("./app/styles.css", import.meta.url), "utf8");
assert.match(appCss, /\.change-list\s*\{[^}]*max-height:\s*clamp\(/s, "변경 내역 목록 높이가 화면에 맞게 제한되어야 합니다.");
assert.match(appCss, /\.change-list\s*\{[^}]*overflow-y:\s*auto/s, "변경 내역 목록에 세로 스크롤이 있어야 합니다.");
assert.match(appCss, /\.change-list\s*\{[^}]*overscroll-behavior:\s*contain/s, "변경 내역 스크롤이 전체 페이지로 전파되면 안 됩니다.");
assert.match(appCss, /\.change-filter-button\.active\s*\{/, "미배정 필터의 활성 상태가 시각적으로 구분되어야 합니다.");
assert.match(appCss, /\.change-quick-assign\s*\{/, "빠른 권역 배정 컨트롤의 레이아웃이 정의되어야 합니다.");

const waterwaysSource = await readFile(new URL("./app/waterways.mjs", import.meta.url), "utf8");
assert.match(appHtml, /id="map-waterways"/, "지도에 한강 수계 레이어가 있어야 합니다.");
assert.match(appSource, /lineGeometryPath\(HAN_RIVER\)/, "한강 실제 좌표가 지도 좌표계로 투영되어야 합니다.");
assert.match(appCss, /\.han-river-line\s*\{[^}]*stroke:\s*#38a9df/s, "한강 수계가 구분되는 파란색으로 표시되어야 합니다.");
assert.match(waterwaysSource, /127\.310514,37\.524873/, "한강 팔당측 시작 좌표가 보존되어야 합니다.");
assert.match(waterwaysSource, /126\.413576,37\.844704/, "한강 하구측 끝 좌표가 보존되어야 합니다.");
assert.match(appHtml, /id="excel-export-button"[^>]*>엑셀 추출</, "현재 시나리오 엑셀 추출 버튼이 있어야 합니다.");
assert.match(appSource, /fetch\("\/export-xlsx"/, "엑셀 추출 버튼이 로컬 서버의 XLSX 생성 기능과 연결되어야 합니다.");
assert.match(appSource, /IS_STATIC_HOST/, "GitHub Pages 정적 배포 환경을 구분해야 합니다.");
assert.match(appSource, /외부 공유 화면에서는 엑셀 추출을 지원하지 않습니다/, "정적 배포에서는 서버 전용 엑셀 기능을 안내해야 합니다.");
assert.match(appHtml, /id="territory-excel-export-button"[^>]*>권역별 엑셀</, "권역별 엑셀 일괄 추출 버튼이 있어야 합니다.");
assert.match(appSource, /fetch\("\/export-territories-xlsx"/, "권역별 엑셀 버튼이 전용 XLSX 생성 기능과 연결되어야 합니다.");
assert.match(appSource, /features\?\.includes\("territory-xlsx"\)/, "권역별 엑셀 추출 전에 서버 기능 버전을 확인해야 합니다.");
assert.match(appSource, /실행 중인 서버가 이전 버전입니다/, "이전 서버가 실행 중이면 재실행 방법을 안내해야 합니다.");
assert.match(appHtml, /id="staff-alert-board"/, "상단에 권역 조정 알림판이 있어야 합니다.");
assert.doesNotMatch(appHtml, /id="kpi-grid"/, "기존 핵심 지표 카드는 제거되어야 합니다.");
assert.match(appSource, /getInstallCostStaffAlerts\(APP_DATA, state\)/, "알림판은 현재 시나리오의 정상시공비 증가를 계산해야 합니다.");
assert.match(appSource, /추가 인원 \$\{alert\.additionalStaff\}명 필요/, "알림 문구에 필요한 추가 인원 수가 표시되어야 합니다.");

const serverSource = await readFile(new URL("./server.mjs", import.meta.url), "utf8");
assert.match(serverSource, /requestUrl\.pathname === "\/export-xlsx"/, "서버에 XLSX 생성 엔드포인트가 있어야 합니다.");
assert.match(serverSource, /createScenarioWorkbookBytes/, "서버가 시나리오 워크북 생성기를 호출해야 합니다.");
assert.match(serverSource, /requestUrl\.pathname === "\/export-territories-xlsx"/, "서버에 권역별 XLSX 생성 엔드포인트가 있어야 합니다.");
assert.match(serverSource, /createTerritoryWorkbookBytes/, "서버가 권역별 워크북 생성기를 호출해야 합니다.");
assert.match(serverSource, /features: \["territory-xlsx"\]/, "서버 상태 응답에 권역별 엑셀 기능 버전이 표시되어야 합니다.");

console.log(JSON.stringify({
  tests: "PASS",
  regions: APP_DATA.regions.length,
  sourceSalesTotal: APP_DATA.metadata.sourceSalesTotal,
  linkedSalesTotal: APP_DATA.metadata.linkedSalesTotal,
  unresolvedSalesTotal: APP_DATA.metadata.unresolvedSalesTotal,
}));
