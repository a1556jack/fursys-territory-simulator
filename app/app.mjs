import { APP_DATA } from "./data.mjs";
import { HAN_RIVER } from "./waterways.mjs";
import {
  UNASSIGNED_ID,
  aggregateRegions,
  capacityResult,
  cloneState,
  countCapacityRisks,
  countChangedRegions,
  createInitialState,
  getActiveTerritories,
  getInstallCostStaffAlerts,
  getTerritory,
  validateScenario,
} from "./core.mjs";

const STORAGE_KEY = "fursys-territory-simulator-scenarios-v1";
const NEW_COLORS = ["#1d4ed8", "#0f766e", "#b45309", "#be123c", "#6d28d9", "#0369a1", "#4d7c0f"];
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 900;
const IS_STATIC_HOST = location.hostname.endsWith("github.io");
const [minLon, minLat, maxLon, maxLat] = APP_DATA.metadata.bbox;
const regionById = new Map(APP_DATA.regions.map((region) => [region.id, region]));
const baselineTerritoryById = new Map(APP_DATA.territories.map((territory) => [territory.id, territory]));
const pathCache = new Map(APP_DATA.regions.map((region) => [region.id, geometryPath(region.geometry)]));

let state = createInitialState(APP_DATA);
let savedScenarios = readSavedScenarios();
let mapInitialized = false;
let mapView = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
let mapDrag = null;
let suppressMapClick = false;
let toastTimer;
let dialogResolve = null;
let dialogKind = "confirm";
let showOnlyUnassignedChanges = false;

const elements = {
  staffAlertBoard: document.querySelector("#staff-alert-board"),
  dataQualityBanner: document.querySelector("#data-quality-banner"),
  territoryList: document.querySelector("#territory-list"),
  territoryRegionList: document.querySelector("#territory-region-list"),
  territoryRegionFilter: document.querySelector("#territory-region-filter"),
  regionListTitle: document.querySelector("#region-list-title"),
  regionListCount: document.querySelector("#region-list-count"),
  map: document.querySelector("#territory-map"),
  mapRegions: document.querySelector("#map-regions"),
  mapWaterways: document.querySelector("#map-waterways"),
  mapTooltip: document.querySelector("#map-tooltip"),
  mapLegend: document.querySelector("#map-legend"),
  regionDetail: document.querySelector("#region-detail"),
  changeList: document.querySelector("#change-list"),
  changeCount: document.querySelector("#change-count"),
  changeFilterUnassigned: document.querySelector("#change-filter-unassigned"),
  salesChart: document.querySelector("#sales-chart"),
  installChart: document.querySelector("#install-chart"),
  capacityBody: document.querySelector("#capacity-body"),
  scenarioSelect: document.querySelector("#scenario-select"),
  regionSearch: document.querySelector("#region-search"),
  regionOptions: document.querySelector("#region-options"),
  mapModeControl: document.querySelector("#map-mode-control"),
  toast: document.querySelector("#toast"),
  dialog: document.querySelector("#app-dialog"),
  dialogForm: document.querySelector("#app-dialog-form"),
  dialogTitle: document.querySelector("#app-dialog-title"),
  dialogMessage: document.querySelector("#app-dialog-message"),
  dialogInput: document.querySelector("#app-dialog-input"),
  dialogCancel: document.querySelector("#app-dialog-cancel"),
  dialogConfirm: document.querySelector("#app-dialog-confirm"),
};

initializeStaticControls();
bindEvents();
renderAll();

function initializeStaticControls() {
  elements.regionOptions.innerHTML = APP_DATA.regions
    .map((region) => `<option value="${escapeHtml(`${region.sido} ${region.name}`)}"></option>`)
    .join("");
  applyMapView();
}

function bindEvents() {
  document.querySelector("#add-territory-button").addEventListener("click", addTerritory);
  document.querySelector("#reset-button").addEventListener("click", resetToBaseline);
  document.querySelector("#save-button").addEventListener("click", saveScenario);
  document.querySelector("#excel-export-button").addEventListener("click", exportExcel);
  document.querySelector("#territory-excel-export-button").addEventListener("click", exportTerritoryExcel);
  document.querySelector("#export-button").addEventListener("click", exportScenario);
  document.querySelector("#import-button").addEventListener("click", () => document.querySelector("#import-file").click());
  document.querySelector("#import-file").addEventListener("change", importScenario);
  document.querySelector("#zoom-in").addEventListener("click", () => zoomMap(1.45));
  document.querySelector("#zoom-out").addEventListener("click", () => zoomMap(1 / 1.45));
  document.querySelector("#zoom-reset").addEventListener("click", resetMapView);
  elements.map.addEventListener("wheel", handleMapWheel, { passive: false });
  elements.map.addEventListener("pointerdown", handleMapPointerDown);
  elements.map.addEventListener("pointermove", handleMapPointerMove);
  elements.map.addEventListener("pointerup", handleMapPointerEnd);
  elements.map.addEventListener("pointercancel", handleMapPointerCancel);

  elements.territoryList.addEventListener("click", handleTerritoryClick);
  elements.territoryList.addEventListener("change", handleTerritoryChange);
  elements.territoryRegionList.addEventListener("click", handleTerritoryRegionClick);
  elements.territoryRegionFilter.addEventListener("input", renderTerritoryRegions);
  elements.regionDetail.addEventListener("change", handleRegionDetailChange);
  elements.regionDetail.addEventListener("click", handleRegionDetailClick);
  elements.changeFilterUnassigned.addEventListener("click", toggleUnassignedChangeFilter);
  elements.changeList.addEventListener("click", handleChangeListClick);
  elements.changeList.addEventListener("change", handleChangeListChange);
  elements.capacityBody.addEventListener("input", handleCapacityInput);
  elements.capacityBody.addEventListener("change", handleCapacityChange);
  elements.mapModeControl.addEventListener("click", handleMapModeChange);
  elements.regionSearch.addEventListener("change", handleRegionSearch);
  elements.regionSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleRegionSearch();
  });
  elements.scenarioSelect.addEventListener("change", loadSelectedScenario);
  elements.dialogForm.addEventListener("submit", handleDialogSubmit);
  elements.dialogCancel.addEventListener("click", () => closeDialog(dialogKind === "text" ? null : false));
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog(dialogKind === "text" ? null : false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.dialog.hidden) closeDialog(dialogKind === "text" ? null : false);
  });
}

function renderAll() {
  renderStaffAlerts();
  renderDataQuality();
  renderTerritories();
  renderTerritoryRegions();
  renderMap();
  renderRegionDetail();
  renderChanges();
  renderComparisonCharts();
  renderCapacityTable();
  renderScenarioSelect();
}

function renderStaffAlerts() {
  const alerts = getInstallCostStaffAlerts(APP_DATA, state);
  const content = alerts.length
    ? `<div class="staff-alert-list">${alerts.map((alert) => {
      const territoryLabel = alert.territoryName.endsWith("권역") ? alert.territoryName : `${alert.territoryName}권역`;
      return `<div class="staff-alert-item"><span class="staff-alert-dot" aria-hidden="true"></span><span><strong>${escapeHtml(territoryLabel)}</strong> ${formatMillion(alert.increase)}백만원 정상 시공비 증가, <strong>추가 인원 ${alert.additionalStaff}명 필요</strong></span></div>`;
    }).join("")}</div>`
    : `<div class="staff-alert-empty">지역 조정에 따른 정상 시공비 증가 및 추가 인원 필요 권역이 없습니다.</div>`;
  elements.staffAlertBoard.innerHTML = `
    <div class="staff-alert-heading">
      <div><p class="eyebrow">STAFFING NOTICE</p><h2>권역 조정 알림판</h2></div>
      <span class="staff-alert-rule">정상 시공비 증가 5,000만원당 1명 · 올림 적용</span>
    </div>
    ${content}`;
}

function renderDataQuality() {
  const names = APP_DATA.unresolved.map((item) => item.name).join(", ");
  const hostingNotice = IS_STATIC_HOST
    ? ` <span class="hosting-notice">외부 공유 화면에서는 JSON 내보내기만 지원하며, 엑셀 추출은 로컬 실행판을 이용해 주세요.</span>`
    : "";
  elements.dataQualityBanner.innerHTML = `<strong>데이터 확인 필요</strong> · 시도 정보가 없는 동명 지역 ${APP_DATA.unresolved.length}개(${escapeHtml(names)})의 ${formatEok(APP_DATA.metadata.unresolvedSalesTotal)}억원은 권역 합계에 배분하지 않았습니다. 원본 전체 합계는 엑셀 추출의 권역 요약에 보존됩니다.${hostingNotice}`;
}

function renderTerritories() {
  const totals = aggregateRegions(APP_DATA, state, "current");
  const active = getActiveTerritories(state);
  elements.territoryList.innerHTML = active.map((territory) => {
    const metrics = totals.get(territory.id);
    const selected = territory.id === state.selectedTerritoryId ? "selected" : "";
    return `<article class="territory-card ${selected}" data-territory-id="${territory.id}">
      <div class="territory-card-top">
        <span class="color-dot" style="background:${territory.color}"></span>
        <span class="territory-name">${escapeHtml(territory.name)}</span>
        <div class="card-actions">
          ${territory.system ? "" : `<input class="territory-color-input" data-action="color" type="color" value="${territory.color}" title="색상 변경"><button class="tiny-button" data-action="rename" title="이름 변경">이름</button><button class="tiny-button" data-action="delete" title="권역 삭제">삭제</button>`}
        </div>
      </div>
      <div class="territory-mini"><span>${metrics.regionCount}개 지역</span><span>${formatEok(metrics.sales)}억원</span><span>시공비 ${formatMillion(metrics.installCost)}백만</span></div>
    </article>`;
  }).join("");
}

function renderTerritoryRegions() {
  const territory = getTerritory(state, state.selectedTerritoryId) || getTerritory(state, UNASSIGNED_ID);
  const query = elements.territoryRegionFilter.value.trim().toLowerCase();
  const regions = APP_DATA.regions
    .filter((region) => (state.assignments[region.id] || UNASSIGNED_ID) === territory.id)
    .filter((region) => !query || `${region.sido} ${region.name}`.toLowerCase().includes(query))
    .sort((a, b) => `${a.sido}${a.name}`.localeCompare(`${b.sido}${b.name}`, "ko"));
  elements.regionListTitle.textContent = territory.name;
  elements.regionListCount.textContent = regions.length;
  elements.territoryRegionList.innerHTML = regions.length ? regions.map((region) => `
    <div class="region-row" data-region-id="${region.id}">
      <span class="data-dot ${region.sales !== null ? "has-data" : ""}"></span>
      <span>${escapeHtml(region.sido)} ${escapeHtml(region.name)}</span>
      <button data-action="open">보기</button>
      ${territory.system ? "" : `<button data-action="remove">빼기</button>`}
    </div>`).join("") : `<div class="empty-state">조건에 맞는 지역이 없습니다.</div>`;
}

function renderMap() {
  ensureMapInitialized();
  const activeTerritoryById = new Map(getActiveTerritories(state).map((territory) => [territory.id, territory]));
  const ratios = APP_DATA.regions.filter((region) => region.sales > 0).map((region) => (region.installCost || 0) / region.sales);
  const maxSales = Math.max(...APP_DATA.regions.map((region) => region.sales || 0), 1);
  const maxRatio = Math.max(...ratios, .05);
  for (const path of elements.mapRegions.querySelectorAll("path")) {
    const region = regionById.get(path.dataset.regionId);
    const territoryId = state.assignments[region.id] || UNASSIGNED_ID;
    const territory = activeTerritoryById.get(territoryId) || activeTerritoryById.get(UNASSIGNED_ID);
    path.setAttribute("fill", mapFill(region, territory, maxSales, maxRatio));
    path.classList.toggle("selected", region.id === state.selectedRegionId);
  }
  for (const button of elements.mapModeControl.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.mode === state.mapMode);
  }
  renderMapLegend(activeTerritoryById);
}

function ensureMapInitialized() {
  if (mapInitialized) return;
  elements.mapRegions.innerHTML = APP_DATA.regions.map((region) => `<path class="region-shape" data-region-id="${region.id}" d="${pathCache.get(region.id)}"></path>`).join("");
  const hanRiverPath = lineGeometryPath(HAN_RIVER);
  elements.mapWaterways.innerHTML = `
    <path class="han-river-casing" d="${hanRiverPath}"></path>
    <path class="han-river-line" d="${hanRiverPath}"></path>`;
  for (const path of elements.mapRegions.querySelectorAll("path")) {
    path.addEventListener("click", (event) => {
      if (suppressMapClick) {
        event.preventDefault();
        return;
      }
      selectRegion(path.dataset.regionId, true);
    });
    path.addEventListener("pointermove", (event) => showMapTooltip(event, path.dataset.regionId));
    path.addEventListener("pointerleave", hideMapTooltip);
  }
  mapInitialized = true;
}

function mapFill(region, territory, maxSales, maxRatio) {
  if (state.mapMode === "territory") return territory?.color || "#c5cbd3";
  if (region.sales === null) return "#d5dbe2";
  if (state.mapMode === "sales") {
    const score = Math.log1p(region.sales) / Math.log1p(maxSales);
    return rampColor(score, ["#dbeafe", "#93c5fd", "#3b82f6", "#1e3a8a"]);
  }
  const ratio = region.sales > 0 ? (region.installCost || 0) / region.sales : 0;
  return rampColor(Math.min(ratio / maxRatio, 1), ["#dcfce7", "#fde68a", "#fb923c", "#b91c1c"]);
}

function renderMapLegend(activeTerritoryById) {
  const riverLegend = `<div class="legend-item waterway-legend"><span class="river-legend-line"></span>한강</div>`;
  if (state.mapMode === "territory") {
    elements.mapLegend.innerHTML = `<strong>현재 권역</strong>${[...activeTerritoryById.values()].map((territory) => `<div class="legend-item"><span class="legend-swatch" style="background:${territory.color}"></span>${escapeHtml(territory.name)}</div>`).join("")}${riverLegend}`;
    return;
  }
  const labels = state.mapMode === "sales"
    ? [["#dbeafe", "낮음"], ["#93c5fd", "중하"], ["#3b82f6", "중상"], ["#1e3a8a", "높음"]]
    : [["#dcfce7", "낮음"], ["#fde68a", "보통"], ["#fb923c", "높음"], ["#b91c1c", "매우 높음"]];
  elements.mapLegend.innerHTML = `<strong>${state.mapMode === "sales" ? "2025 매출" : "시공비율"}</strong>${labels.map(([color, label]) => `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span>${label}</div>`).join("")}<div class="legend-item"><span class="legend-swatch" style="background:#d5dbe2"></span>데이터 없음</div>${riverLegend}`;
}

function renderRegionDetail() {
  const region = regionById.get(state.selectedRegionId);
  if (!region) {
    elements.regionDetail.className = "region-detail empty-state";
    elements.regionDetail.innerHTML = "지도나 지역 목록에서 지역을 선택하세요.";
    return;
  }
  elements.regionDetail.className = "region-detail";
  const currentId = state.assignments[region.id] || UNASSIGNED_ID;
  const currentTerritory = getTerritory(state, currentId);
  const baselineTerritory = baselineTerritoryById.get(region.baselineTerritoryId);
  const activeTerritories = getActiveTerritories(state);
  const ratio = region.sales > 0 ? (region.installCost || 0) / region.sales : null;
  const baselineAvailable = activeTerritories.some((territory) => territory.id === region.baselineTerritoryId);
  elements.regionDetail.innerHTML = `
    <div class="detail-title"><div><p class="eyebrow">${escapeHtml(region.sido)}</p><h3>${escapeHtml(region.name)}</h3></div><span class="status-chip">${escapeHtml(region.dataStatus)}</span></div>
    <div class="detail-metrics">
      <div class="detail-metric"><span>2025 매출</span><strong>${region.sales === null ? "-" : `${formatEok(region.sales)}억원`}</strong></div>
      <div class="detail-metric"><span>2025 시공비</span><strong>${region.installCost === null ? "-" : `${formatMillion(region.installCost)}백만원`}</strong></div>
      <div class="detail-metric"><span>시공비율</span><strong>${ratio === null ? "-" : formatPercent(ratio)}</strong></div>
      <div class="detail-metric"><span>최초 권역</span><strong>${escapeHtml(baselineTerritory?.name || "미배정")}</strong></div>
    </div>
    <label class="field-group">현재 권역
      <select id="region-territory-select">${activeTerritories.map((territory) => `<option value="${territory.id}" ${territory.id === currentId ? "selected" : ""}>${escapeHtml(territory.name)}</option>`).join("")}</select>
    </label>
    <div class="detail-actions">
      <button class="button ghost" data-action="baseline" ${baselineAvailable ? "" : "disabled"}>최초 권역 복원</button>
      <button class="button secondary" data-action="focus-territory">${escapeHtml(currentTerritory?.name || "미배정")} 목록 보기</button>
    </div>`;
}

function renderChanges() {
  const changes = APP_DATA.regions.filter((region) => (state.assignments[region.id] || UNASSIGNED_ID) !== region.baselineTerritoryId);
  const visibleChanges = showOnlyUnassignedChanges
    ? changes.filter((region) => (state.assignments[region.id] || UNASSIGNED_ID) === UNASSIGNED_ID)
    : changes;
  const assignableTerritories = getActiveTerritories(state).filter((territory) => !territory.system);
  elements.changeCount.textContent = showOnlyUnassignedChanges ? `${visibleChanges.length}/${changes.length}` : changes.length;
  elements.changeFilterUnassigned.classList.toggle("active", showOnlyUnassignedChanges);
  elements.changeFilterUnassigned.setAttribute("aria-pressed", String(showOnlyUnassignedChanges));
  elements.changeFilterUnassigned.textContent = showOnlyUnassignedChanges ? "전체 변경" : "미배정만";
  elements.changeList.innerHTML = visibleChanges.length ? visibleChanges.map((region) => {
    const before = baselineTerritoryById.get(region.baselineTerritoryId)?.name || "미배정";
    const currentId = state.assignments[region.id] || UNASSIGNED_ID;
    const after = getTerritory(state, currentId)?.name || "미배정";
    const quickAssign = currentId === UNASSIGNED_ID
      ? `<label class="change-quick-assign">빠른 권역 배정
          <select class="change-quick-select" data-action="quick-assign" data-region-id="${region.id}" aria-label="${escapeHtml(`${region.sido} ${region.name} 빠른 권역 배정`)}">
            <option value="">권역 선택...</option>
            ${assignableTerritories.map((territory) => `<option value="${territory.id}">${escapeHtml(territory.name)}</option>`).join("")}
          </select>
        </label>`
      : "";
    return `<div class="change-row ${currentId === UNASSIGNED_ID ? "is-unassigned" : ""}" data-region-id="${region.id}">
      <div class="change-row-summary"><div><strong>${escapeHtml(region.sido)} ${escapeHtml(region.name)}</strong><span>${escapeHtml(before)}</span></div><span class="change-arrow">→ ${escapeHtml(after)}</span></div>
      ${quickAssign}
    </div>`;
  }).join("") : `<div class="empty-state">${showOnlyUnassignedChanges ? "현재 미배정 변경 지역이 없습니다." : "기준안과 동일합니다."}</div>`;
}

function toggleUnassignedChangeFilter() {
  showOnlyUnassignedChanges = !showOnlyUnassignedChanges;
  renderChanges();
}

function handleChangeListClick(event) {
  if (event.target.closest("select")) return;
  const row = event.target.closest(".change-row[data-region-id]");
  if (!row) return;
  selectRegion(row.dataset.regionId, true);
}

function handleChangeListChange(event) {
  const select = event.target.closest('select[data-action="quick-assign"]');
  if (!select || !select.value) return;
  const region = regionById.get(select.dataset.regionId);
  const territory = getTerritory(state, select.value);
  if (!region || !territory || territory.system) return;
  state.assignments[region.id] = territory.id;
  state.selectedRegionId = region.id;
  state.selectedTerritoryId = territory.id;
  showToast(`${region.sido} ${region.name}을(를) ${territory.name}(으)로 배정했습니다.`);
  renderAll();
}

function renderComparisonCharts() {
  renderComparisonChart(elements.salesChart, "sales", 100000000, 1);
  renderComparisonChart(elements.installChart, "installCost", 1000000, 0);
}

function renderComparisonChart(container, field, divisor, decimals) {
  const baseline = aggregateRegions(APP_DATA, state, "baseline");
  const current = aggregateRegions(APP_DATA, state, "current");
  const baselineIds = APP_DATA.territories.filter((territory) => !territory.system).map((territory) => territory.id);
  const currentIds = getActiveTerritories(state).filter((territory) => !territory.system).map((territory) => territory.id);
  const ids = [...new Set([...baselineIds, ...currentIds, UNASSIGNED_ID])];
  const maxValue = Math.max(...ids.flatMap((id) => [baseline.get(id)?.[field] || 0, current.get(id)?.[field] || 0]), 1);
  container.innerHTML = `<div class="chart-legend"><span>━ 기준안</span><span style="color:#2f6fed">━ 변경안</span></div>` + ids.map((id) => {
    const territory = getTerritory(state, id) || baselineTerritoryById.get(id);
    const base = baseline.get(id)?.[field] || 0;
    const now = current.get(id)?.[field] || 0;
    const delta = now - base;
    const label = territory?.active === false ? `${territory.name}(삭제)` : territory?.name || "미배정";
    return `<div class="chart-row">
      <div class="chart-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
      <div class="bar-pair"><div class="bar-track"><div class="bar baseline" style="width:${base / maxValue * 100}%"></div></div><div class="bar-track"><div class="bar current" style="width:${now / maxValue * 100}%"></div></div></div>
      <div class="chart-value">${formatFixed(now / divisor, decimals)}<br><span class="delta ${delta > 0 ? "positive" : delta < 0 ? "negative" : ""}">${formatSigned(delta / divisor, decimals)}</span></div>
    </div>`;
  }).join("");
}

function renderCapacityTable() {
  const current = aggregateRegions(APP_DATA, state, "current");
  const territories = getActiveTerritories(state).filter((territory) => !territory.system);
  elements.capacityBody.innerHTML = territories.map((territory) => {
    const result = capacityResult(territory, current.get(territory.id));
    const unit = result.metric === "sales" ? "억원" : "백만원";
    const className = result.status === "초과" ? "danger" : result.status === "주의" ? "warn" : result.status === "커버 가능" ? "ok" : "empty";
    return `<tr data-territory-id="${territory.id}">
      <td class="territory-cell"><span class="color-dot" style="display:inline-block;background:${territory.color};vertical-align:-2px;margin-right:6px"></span>${escapeHtml(territory.name)}</td>
      <td><select data-field="capacityMetric"><option value="sales" ${result.metric === "sales" ? "selected" : ""}>매출·억원</option><option value="installCost" ${result.metric === "installCost" ? "selected" : ""}>시공비·백만원</option></select></td>
      <td><input data-field="staff" type="number" min="0" step="1" value="${Number(territory.staff) || 0}"></td>
      <td><input data-field="capacityPerPerson" type="number" min="0" step="0.1" value="${Number(territory.capacityPerPerson) || 0}"></td>
      <td data-output="workload">${formatFixed(result.workload, 1)} ${unit}</td>
      <td data-output="capacity">${formatFixed(result.capacity, 1)} ${unit}</td>
      <td data-output="utilization">${result.utilization === null ? "-" : formatPercent(result.utilization)}</td>
      <td><span data-output="status" class="capacity-status ${className}">${result.status}</span></td>
    </tr>`;
  }).join("");
}

function renderScenarioSelect() {
  const currentValue = elements.scenarioSelect.value;
  elements.scenarioSelect.innerHTML = `<option value="">선택</option>${Object.keys(savedScenarios).sort((a, b) => a.localeCompare(b, "ko")).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  if (savedScenarios[currentValue]) elements.scenarioSelect.value = currentValue;
}

function handleTerritoryClick(event) {
  const actionButton = event.target.closest("button[data-action]");
  const card = event.target.closest("[data-territory-id]");
  if (!card) return;
  const territoryId = card.dataset.territoryId;
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "rename") renameTerritory(territoryId);
    if (action === "delete") deleteTerritory(territoryId);
    return;
  }
  if (event.target.matches("input[type=color]")) return;
  state.selectedTerritoryId = territoryId;
  elements.territoryRegionFilter.value = "";
  renderTerritories();
  renderTerritoryRegions();
}

function handleTerritoryChange(event) {
  if (!event.target.matches("input[data-action=color]")) return;
  const territoryId = event.target.closest("[data-territory-id]").dataset.territoryId;
  getTerritory(state, territoryId).color = event.target.value;
  renderTerritories();
  renderMap();
  renderCapacityTable();
}

function handleTerritoryRegionClick(event) {
  const row = event.target.closest("[data-region-id]");
  if (!row) return;
  const regionId = row.dataset.regionId;
  if (event.target.dataset.action === "remove") {
    state.assignments[regionId] = UNASSIGNED_ID;
    state.selectedRegionId = regionId;
    showToast("지역을 미배정으로 이동했습니다.");
    renderAll();
    return;
  }
  selectRegion(regionId, true);
}

function handleRegionDetailChange(event) {
  if (event.target.id !== "region-territory-select") return;
  const region = regionById.get(state.selectedRegionId);
  state.assignments[region.id] = event.target.value;
  state.selectedTerritoryId = event.target.value;
  showToast(`${region.sido} ${region.name}의 권역을 변경했습니다.`);
  renderAll();
}

function handleRegionDetailClick(event) {
  const action = event.target.dataset.action;
  const region = regionById.get(state.selectedRegionId);
  if (!region || !action) return;
  if (action === "baseline") {
    state.assignments[region.id] = region.baselineTerritoryId;
    state.selectedTerritoryId = region.baselineTerritoryId;
    showToast("최초 권역으로 복원했습니다.");
    renderAll();
  }
  if (action === "focus-territory") {
    state.selectedTerritoryId = state.assignments[region.id] || UNASSIGNED_ID;
    renderTerritories();
    renderTerritoryRegions();
  }
}

function handleCapacityChange(event) {
  const row = event.target.closest("[data-territory-id]");
  const field = event.target.dataset.field;
  if (!row || !field) return;
  const territory = getTerritory(state, row.dataset.territoryId);
  territory[field] = field === "capacityMetric" ? event.target.value : Math.max(0, Number(event.target.value) || 0);
  renderStaffAlerts();
  renderCapacityTable();
}

function handleCapacityInput(event) {
  const row = event.target.closest("[data-territory-id]");
  const field = event.target.dataset.field;
  if (!row || !field || field === "capacityMetric") return;
  const territory = getTerritory(state, row.dataset.territoryId);
  territory[field] = Math.max(0, Number(event.target.value) || 0);
  updateCapacityRow(row, territory);
  renderStaffAlerts();
}

function updateCapacityRow(row, territory) {
  const current = aggregateRegions(APP_DATA, state, "current");
  const result = capacityResult(territory, current.get(territory.id));
  const unit = result.metric === "sales" ? "억원" : "백만원";
  const className = result.status === "초과" ? "danger" : result.status === "주의" ? "warn" : result.status === "커버 가능" ? "ok" : "empty";
  row.querySelector('[data-output="workload"]').textContent = `${formatFixed(result.workload, 1)} ${unit}`;
  row.querySelector('[data-output="capacity"]').textContent = `${formatFixed(result.capacity, 1)} ${unit}`;
  row.querySelector('[data-output="utilization"]').textContent = result.utilization === null ? "-" : formatPercent(result.utilization);
  const status = row.querySelector('[data-output="status"]');
  status.textContent = result.status;
  status.className = `capacity-status ${className}`;
}

function handleMapModeChange(event) {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  state.mapMode = button.dataset.mode;
  renderMap();
}

function handleRegionSearch() {
  const query = elements.regionSearch.value.trim();
  if (!query) return;
  const region = APP_DATA.regions.find((item) => `${item.sido} ${item.name}` === query)
    || APP_DATA.regions.find((item) => item.name === query)
    || APP_DATA.regions.find((item) => `${item.sido} ${item.name}`.includes(query));
  if (!region) {
    showToast("검색한 지역을 찾지 못했습니다.");
    return;
  }
  selectRegion(region.id, true);
}

function selectRegion(regionId, focus = false) {
  const region = regionById.get(regionId);
  state.selectedRegionId = regionId;
  state.selectedTerritoryId = state.assignments[regionId] || UNASSIGNED_ID;
  if (focus) focusMapOnRegion(region);
  renderTerritories();
  renderTerritoryRegions();
  renderMap();
  renderRegionDetail();
}

async function addTerritory() {
  const name = (await openTextDialog({
    title: "새 권역 만들기",
    message: "새로 편성할 권역 이름을 입력하세요.",
    defaultValue: `신규 권역 ${getActiveTerritories(state).length}`,
    confirmText: "권역 만들기",
  }))?.trim();
  if (!name) return;
  const id = `territory_${Date.now()}`;
  state.territories.push({
    id,
    name,
    color: NEW_COLORS[(state.territories.length - 1) % NEW_COLORS.length],
    system: false,
    staff: 0,
    capacityPerPerson: 0,
    capacityMetric: "sales",
    active: true,
  });
  state.selectedTerritoryId = id;
  showToast(`${name} 권역을 만들었습니다.`);
  renderAll();
}

async function renameTerritory(territoryId) {
  const territory = getTerritory(state, territoryId);
  const name = (await openTextDialog({
    title: "권역 이름 변경",
    message: `${territory.name} 권역의 새 이름을 입력하세요.`,
    defaultValue: territory.name,
    confirmText: "이름 변경",
  }))?.trim();
  if (!name || name === territory.name) return;
  territory.name = name;
  renderAll();
}

async function deleteTerritory(territoryId) {
  const territory = getTerritory(state, territoryId);
  if (!territory || territory.system) return;
  const confirmed = await openConfirmDialog({
    title: "권역 삭제",
    message: `${territory.name} 권역을 삭제하시겠습니까? 포함 지역은 모두 미배정으로 이동합니다.`,
    confirmText: "삭제",
    danger: true,
  });
  if (!confirmed) return;
  territory.active = false;
  for (const [regionId, assignedId] of Object.entries(state.assignments)) {
    if (assignedId === territoryId) state.assignments[regionId] = UNASSIGNED_ID;
  }
  state.selectedTerritoryId = UNASSIGNED_ID;
  showToast(`${territory.name} 권역을 삭제했습니다.`);
  renderAll();
}

async function resetToBaseline() {
  const confirmed = await openConfirmDialog({
    title: "기준안 복원",
    message: "현재 변경 내용과 케파 입력을 모두 지우고 최초 편성으로 돌아가시겠습니까?",
    confirmText: "기준안 복원",
  });
  if (!confirmed) return;
  state = createInitialState(APP_DATA);
  mapInitialized = false;
  elements.mapRegions.innerHTML = "";
  resetMapView();
  showToast("최초 편성으로 복원했습니다.");
  renderAll();
}

async function saveScenario() {
  const name = (await openTextDialog({
    title: "시나리오 저장",
    message: "현재 권역 편성과 케파 입력을 저장할 이름을 입력하세요.",
    defaultValue: state.scenarioName || "새 시나리오",
    confirmText: "저장",
  }))?.trim();
  if (!name) return;
  state.scenarioName = name;
  savedScenarios[name] = cloneState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedScenarios));
  renderScenarioSelect();
  elements.scenarioSelect.value = name;
  showToast(`${name} 시나리오를 저장했습니다.`);
}

function loadSelectedScenario() {
  const name = elements.scenarioSelect.value;
  if (!name || !savedScenarios[name]) return;
  state = validateScenario(APP_DATA, cloneState(savedScenarios[name]));
  mapInitialized = false;
  elements.mapRegions.innerHTML = "";
  renderAll();
  showToast(`${name} 시나리오를 불러왔습니다.`);
}

function exportScenario() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(state.scenarioName || "권역_시나리오")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("현재 시나리오를 내보냈습니다.");
}

async function exportExcel() {
  if (IS_STATIC_HOST) {
    showToast("외부 공유 화면에서는 엑셀 추출을 지원하지 않습니다. 로컬 실행판을 이용해 주세요.");
    return;
  }
  const button = document.querySelector("#excel-export-button");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "엑셀 생성 중…";
  showToast("권역·지역별 엑셀 파일을 생성하고 있습니다.");
  try {
    const response = await fetch("/export-xlsx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cloneState(state)),
    });
    if (!response.ok) throw new Error(await response.text() || "엑셀 파일을 만들지 못했습니다.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `퍼시스_권역시나리오_${sanitizeFilename(state.scenarioName || "현재안")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("권역 시나리오 엑셀 파일을 내보냈습니다.");
  } catch (error) {
    showToast(error.message || "엑셀 파일을 만들지 못했습니다.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function exportTerritoryExcel() {
  if (IS_STATIC_HOST) {
    showToast("외부 공유 화면에서는 권역별 엑셀을 지원하지 않습니다. 로컬 실행판을 이용해 주세요.");
    return;
  }
  const button = document.querySelector("#territory-excel-export-button");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "권역별 생성 중…";
  showToast("모든 활성 권역의 개별 시트를 한 번에 생성하고 있습니다.");
  try {
    const healthResponse = await fetch("/health", { cache: "no-store" });
    const health = healthResponse.ok ? await healthResponse.json() : null;
    if (!health?.features?.includes("territory-xlsx")) {
      throw new Error("실행 중인 서버가 이전 버전입니다. 검은 서버 창을 닫고 시뮬레이터_실행.cmd를 다시 실행해주세요.");
    }
    const response = await fetch("/export-territories-xlsx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cloneState(state)),
    });
    if (response.status === 404) {
      throw new Error("권역별 엑셀 기능을 사용하려면 서버를 다시 실행해야 합니다.");
    }
    if (!response.ok) throw new Error(await response.text() || "권역별 엑셀 파일을 만들지 못했습니다.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `퍼시스_권역별자료_${sanitizeFilename(state.scenarioName || "현재안")}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("권역별 엑셀 자료를 한 파일로 내보냈습니다.");
  } catch (error) {
    showToast(error.message || "권역별 엑셀 파일을 만들지 못했습니다.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function importScenario(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const candidate = JSON.parse(await file.text());
    state = validateScenario(APP_DATA, candidate);
    mapInitialized = false;
    elements.mapRegions.innerHTML = "";
    renderAll();
    showToast("시나리오를 불러왔습니다.");
  } catch (error) {
    showToast(error.message || "시나리오 파일을 읽지 못했습니다.");
  } finally {
    event.target.value = "";
  }
}

function openTextDialog({ title, message, defaultValue = "", confirmText = "확인" }) {
  dialogKind = "text";
  elements.dialogTitle.textContent = title;
  elements.dialogMessage.textContent = message;
  elements.dialogInput.hidden = false;
  elements.dialogInput.required = true;
  elements.dialogInput.value = defaultValue;
  elements.dialogConfirm.textContent = confirmText;
  elements.dialogConfirm.className = "button primary";
  elements.dialog.hidden = false;
  requestAnimationFrame(() => {
    elements.dialogInput.focus();
    elements.dialogInput.select();
  });
  return new Promise((resolve) => { dialogResolve = resolve; });
}

function openConfirmDialog({ title, message, confirmText = "확인", danger = false }) {
  dialogKind = "confirm";
  elements.dialogTitle.textContent = title;
  elements.dialogMessage.textContent = message;
  elements.dialogInput.hidden = true;
  elements.dialogInput.required = false;
  elements.dialogConfirm.textContent = confirmText;
  elements.dialogConfirm.className = `button ${danger ? "danger" : "primary"}`;
  elements.dialog.hidden = false;
  requestAnimationFrame(() => elements.dialogConfirm.focus());
  return new Promise((resolve) => { dialogResolve = resolve; });
}

function handleDialogSubmit(event) {
  event.preventDefault();
  if (!dialogResolve) return;
  if (dialogKind === "text") {
    const value = elements.dialogInput.value.trim();
    if (!value) {
      elements.dialogInput.focus();
      return;
    }
    closeDialog(value);
    return;
  }
  closeDialog(true);
}

function closeDialog(value) {
  if (!dialogResolve) return;
  const resolve = dialogResolve;
  dialogResolve = null;
  elements.dialog.hidden = true;
  resolve(value);
}

function readSavedScenarios() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function showMapTooltip(event, regionId) {
  const region = regionById.get(regionId);
  const territory = getTerritory(state, state.assignments[regionId] || UNASSIGNED_ID);
  const ratio = region.sales > 0 ? (region.installCost || 0) / region.sales : null;
  elements.mapTooltip.innerHTML = `<strong>${escapeHtml(region.sido)} ${escapeHtml(region.name)}</strong><div class="tooltip-grid"><span>현재 권역</span><span>${escapeHtml(territory?.name || "미배정")}</span><span>매출</span><span>${region.sales === null ? "-" : `${formatEok(region.sales)}억원`}</span><span>시공비</span><span>${region.installCost === null ? "-" : `${formatMillion(region.installCost)}백만원`}</span><span>시공비율</span><span>${ratio === null ? "-" : formatPercent(ratio)}</span><span>데이터</span><span>${escapeHtml(region.dataStatus)}</span></div>`;
  const rect = elements.map.closest(".map-stage").getBoundingClientRect();
  elements.mapTooltip.style.left = `${Math.min(event.clientX - rect.left + 14, rect.width - 230)}px`;
  elements.mapTooltip.style.top = `${Math.max(8, event.clientY - rect.top - 22)}px`;
  elements.mapTooltip.hidden = false;
}

function hideMapTooltip() { elements.mapTooltip.hidden = true; }

function project([lon, lat]) {
  return [
    (lon - minLon) / (maxLon - minLon) * MAP_WIDTH,
    (maxLat - lat) / (maxLat - minLat) * MAP_HEIGHT,
  ];
}

function geometryPath(geometry) {
  const polygonPath = (polygon) => polygon.map((ring) => ring.map((coordinate, index) => {
    const [x, y] = project(coordinate);
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z").join(" ");
  if (geometry.type === "Polygon") return polygonPath(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.map(polygonPath).join(" ");
  return "";
}

function lineGeometryPath(geometry) {
  const lines = geometry.type === "LineString"
    ? [geometry.coordinates]
    : geometry.type === "MultiLineString" ? geometry.coordinates : [];
  return lines.map((line) => line.map((coordinate, index) => {
    const [x, y] = project(coordinate);
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ")).join(" ");
}

function focusMapOnRegion(region) {
  const [x, y] = project(region.centroid);
  mapView = { x: Math.max(0, x - 150), y: Math.max(0, y - 135), width: 300, height: 270 };
  clampMapView();
  applyMapView();
}

function zoomMap(factor, anchorX = .5, anchorY = .5) {
  const fixedX = mapView.x + mapView.width * anchorX;
  const fixedY = mapView.y + mapView.height * anchorY;
  const width = Math.min(MAP_WIDTH, Math.max(120, mapView.width / factor));
  const height = width * .9;
  mapView = { x: fixedX - width * anchorX, y: fixedY - height * anchorY, width, height };
  clampMapView();
  applyMapView();
}

function handleMapWheel(event) {
  event.preventDefault();
  const rect = elements.map.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const anchorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const anchorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const factor = Math.max(.72, Math.min(1.38, Math.exp(-event.deltaY * .0018)));
  zoomMap(factor, anchorX, anchorY);
  hideMapTooltip();
}

function handleMapPointerDown(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  mapDrag = {
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
  };
  elements.map.setPointerCapture(event.pointerId);
  elements.map.classList.add("is-dragging");
  document.body.classList.add("map-dragging");
  hideMapTooltip();
}

function handleMapPointerMove(event) {
  if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
  event.preventDefault();
  const rect = elements.map.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const deltaX = event.clientX - mapDrag.lastX;
  const deltaY = event.clientY - mapDrag.lastY;
  mapDrag.lastX = event.clientX;
  mapDrag.lastY = event.clientY;
  if (Math.hypot(event.clientX - mapDrag.originX, event.clientY - mapDrag.originY) > 3) mapDrag.moved = true;
  mapView.x -= deltaX * mapView.width / rect.width;
  mapView.y -= deltaY * mapView.height / rect.height;
  clampMapView();
  applyMapView();
  hideMapTooltip();
}

function handleMapPointerEnd(event) {
  if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
  const wasMoved = mapDrag.moved;
  if (elements.map.hasPointerCapture(event.pointerId)) elements.map.releasePointerCapture(event.pointerId);
  finishMapDrag();
  if (wasMoved) {
    suppressMapClick = true;
    setTimeout(() => { suppressMapClick = false; }, 0);
  }
}

function handleMapPointerCancel(event) {
  if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
  finishMapDrag();
}

function finishMapDrag() {
  mapDrag = null;
  elements.map.classList.remove("is-dragging");
  document.body.classList.remove("map-dragging");
}

function resetMapView() {
  mapView = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
  applyMapView();
}

function clampMapView() {
  mapView.width = Math.min(mapView.width, MAP_WIDTH);
  mapView.height = Math.min(mapView.height, MAP_HEIGHT);
  mapView.x = Math.max(0, Math.min(mapView.x, MAP_WIDTH - mapView.width));
  mapView.y = Math.max(0, Math.min(mapView.y, MAP_HEIGHT - mapView.height));
}

function applyMapView() {
  elements.map.setAttribute("viewBox", `${mapView.x} ${mapView.y} ${mapView.width} ${mapView.height}`);
}

function rampColor(score, colors) {
  const index = Math.min(colors.length - 1, Math.floor(Math.max(0, score) * colors.length));
  return colors[index];
}

function zoomMapToTerritory(territoryId) {
  const regions = APP_DATA.regions.filter((region) => (state.assignments[region.id] || UNASSIGNED_ID) === territoryId);
  if (!regions.length) return;
  const points = regions.map((region) => project(region.centroid));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(220, maxX - minX + 120);
  const height = Math.max(200, maxY - minY + 110);
  mapView = { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
  clampMapView();
  applyMapView();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2200);
}

function formatEok(value) { return (Number(value || 0) / 100000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 }); }
function formatMillion(value) { return (Number(value || 0) / 1000000).toLocaleString("ko-KR", { maximumFractionDigits: 1 }); }
function formatPercent(value) { return `${(Number(value || 0) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`; }
function formatFixed(value, decimals) { return Number(value || 0).toLocaleString("ko-KR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function formatSigned(value, decimals) { const number = Number(value || 0); return `${number > 0 ? "+" : ""}${formatFixed(number, decimals)}`; }
function sanitizeFilename(value) { return value.replace(/[\\/:*?"<>|]/g, "_"); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

// Exposed for automated verification only.
window.__APP__ = {
  getState: () => cloneState(state),
  getSummary: () => ({
    changedRegions: countChangedRegions(APP_DATA, state),
    activeTerritories: getActiveTerritories(state).filter((territory) => !territory.system).length,
    capacityRisks: countCapacityRisks(APP_DATA, state),
  }),
  assignRegion: (regionId, territoryId) => {
    state.assignments[regionId] = territoryId;
    renderAll();
  },
  addTerritory: (territory) => {
    state.territories.push({ staff: 0, capacityPerPerson: 0, capacityMetric: "sales", active: true, system: false, ...territory });
    renderAll();
  },
};
