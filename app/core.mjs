export const UNASSIGNED_ID = "unassigned";
export const INSTALL_COST_PER_ADDITIONAL_STAFF = 50000000;

export function createInitialState(data) {
  return {
    version: 1,
    scenarioName: "작업 시나리오",
    territories: data.territories.map((territory) => ({ ...territory })),
    assignments: Object.fromEntries(
      data.regions.map((region) => [region.id, region.baselineTerritoryId]),
    ),
    selectedRegionId: null,
    selectedTerritoryId: data.territories.find((territory) => !territory.system)?.id || UNASSIGNED_ID,
    mapMode: "territory",
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function getActiveTerritories(state) {
  return state.territories.filter((territory) => territory.active);
}

export function getTerritory(state, territoryId) {
  return state.territories.find((territory) => territory.id === territoryId);
}

export function aggregateRegions(data, state, mode = "current") {
  const totals = new Map();
  const ensure = (territoryId) => {
    if (!totals.has(territoryId)) {
      totals.set(territoryId, {
        territoryId,
        regionCount: 0,
        dataRegionCount: 0,
        sales: 0,
        installCost: 0,
      });
    }
    return totals.get(territoryId);
  };
  for (const territory of state.territories) ensure(territory.id);
  for (const region of data.regions) {
    const territoryId = mode === "baseline"
      ? region.baselineTerritoryId
      : state.assignments[region.id] || UNASSIGNED_ID;
    const total = ensure(territoryId);
    total.regionCount += 1;
    if (region.sales !== null) {
      total.dataRegionCount += 1;
      total.sales += region.sales;
      total.installCost += region.installCost || 0;
    }
  }
  return totals;
}

export function countChangedRegions(data, state) {
  return data.regions.reduce(
    (count, region) => count + ((state.assignments[region.id] || UNASSIGNED_ID) !== region.baselineTerritoryId ? 1 : 0),
    0,
  );
}

export function getInstallCostStaffAlerts(data, state, unit = INSTALL_COST_PER_ADDITIONAL_STAFF) {
  const current = aggregateRegions(data, state, "current");
  const baseline = aggregateRegions(data, state, "baseline");
  return getActiveTerritories(state)
    .filter((territory) => !territory.system)
    .map((territory) => {
      const currentInstallCost = current.get(territory.id)?.installCost || 0;
      const baselineInstallCost = baseline.get(territory.id)?.installCost || 0;
      const increase = currentInstallCost - baselineInstallCost;
      return {
        territoryId: territory.id,
        territoryName: territory.name,
        increase,
        additionalStaff: increase > 0 ? Math.ceil(increase / unit) : 0,
      };
    })
    .filter((alert) => alert.increase > 0)
    .sort((a, b) => b.increase - a.increase || a.territoryName.localeCompare(b.territoryName, "ko"));
}

export function capacityResult(territory, metrics) {
  const staff = Number(territory.staff) || 0;
  const perPerson = Number(territory.capacityPerPerson) || 0;
  const metric = territory.capacityMetric === "installCost" ? "installCost" : "sales";
  const workload = metric === "sales" ? metrics.sales / 100000000 : metrics.installCost / 1000000;
  const capacity = staff * perPerson;
  const utilization = capacity > 0 ? workload / capacity : null;
  let status = "입력 필요";
  if (utilization !== null) {
    if (utilization > 1) status = "초과";
    else if (utilization >= 0.85) status = "주의";
    else status = "커버 가능";
  }
  return { metric, workload, capacity, utilization, status };
}

export function countCapacityRisks(data, state) {
  const current = aggregateRegions(data, state, "current");
  return getActiveTerritories(state)
    .filter((territory) => !territory.system)
    .reduce((count, territory) => {
      const result = capacityResult(territory, current.get(territory.id));
      return count + (result.status === "초과" ? 1 : 0);
    }, 0);
}

export function validateScenario(data, candidate) {
  if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.territories)) {
    throw new Error("지원하지 않는 시나리오 파일입니다.");
  }
  if (!candidate.assignments || typeof candidate.assignments !== "object") {
    throw new Error("지역 배정 정보가 없습니다.");
  }
  const activeIds = new Set(candidate.territories.filter((territory) => territory.active).map((territory) => territory.id));
  activeIds.add(UNASSIGNED_ID);
  for (const region of data.regions) {
    const territoryId = candidate.assignments[region.id];
    if (!activeIds.has(territoryId)) candidate.assignments[region.id] = UNASSIGNED_ID;
  }
  return candidate;
}
