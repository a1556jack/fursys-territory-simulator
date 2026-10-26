export const SOURCE_SCENARIO_NAME = "권역조정4(8월 버전)";
export const GAME_RULES = {
  commands: 6,
  rounds: 3,
  initialReserves: 3,
  totalPeople: 49,
};
export const ROUND_EVENTS = [
  {
    title: "균형의 출발",
    tag: "기본 수요",
    description:
      "8월 편성에서 시작합니다. 여유 인력과 과부하 권역을 함께 살펴보세요.",
    factor: () => 1,
  },
  {
    title: "서울의 수요 파동",
    tag: "서울 +12%",
    description:
      "훈련 사건: 서울 지역의 업무량이 12% 증가했습니다. 같은 인력으로 대응해 보세요.",
    factor: (r) => (r.sido === "서울특별시" ? 1.12 : 1),
  },
  {
    title: "경기의 집중 물량",
    tag: "경기 +10%",
    description:
      "훈련 사건: 서울의 수요는 원복되고 경기 지역 업무량이 10% 증가했습니다.",
    factor: (r) => (r.sido === "경기도" ? 1.1 : 1),
  },
];
const INITIAL_STAFF = {
  t_kim_yonghun: 8,
  t_kim_jeonghun: 10,
  t_kim_hyeonseop: 0,
  t_son_daeman: 0,
  t_shin_seunghyeon: 13,
  t_lee_jeongil: 2,
  t_lee_hyeonseok: 10,
  territory_1783995961112: 2,
  territory_1784971161587: 1,
};
export const GAME_MODES = {
  open: "오픈 모드",
  story: "스토리 모드",
  tutorial: "따라하기",
};
export const STORY_CHAPTERS = [
  {
    title: "첫 부임, 빈틈을 메우다",
    narrative:
      "총괄 운영자로 부임한 첫날입니다. 지원이 가능한 권역을 찾아 급한 불부터 끄세요.",
    hint: "이현석의 여유를 활용해 김용훈을 돕고, 예비 인력으로 이정일과 김정훈의 부담을 줄여 보세요.",
  },
  {
    title: "서울에 몰린 주문",
    narrative:
      "서울 업무가 12% 늘었습니다. 인력 지원에 지역 이관을 더해 새로운 수요를 흡수하세요.",
    hint: "서대문구를 이현석에게 맡기면 김정훈의 부담이 줄어듭니다. 이관 전에 받는 권역의 인력도 준비해 보세요.",
  },
  {
    title: "모두의 균형",
    narrative:
      "서울의 수요가 원복되고 경기 업무가 늘었습니다. 어떤 권역에도 감당하지 못하는 업무를 남기지 않는 것이 마지막 과제입니다.",
    hint: "인력 여유가 생긴 김정훈과 경기 업무가 늘어난 신승현의 가동률을 비교해 보세요. 앞선 선택에 따라 다른 해법도 가능합니다.",
  },
];
const copy = (value) => JSON.parse(JSON.stringify(value));
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const integer = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;
const clamp = (value) => Math.min(100, Math.max(0, value));
const commandSnapshot = (game) =>
  copy({
    assignments: game.assignments,
    staff: game.staff,
    reserves: game.reserves,
    points: game.points,
    log: game.log,
    actions: game.actions,
    tutorialStep: game.tutorialStep,
  });

export function createGame(
  data,
  scenario,
  { capacityPerPerson = 50_000_000, mode = "open" } = {},
) {
  check(Object.hasOwn(GAME_MODES, mode), "게임 모드를 확인해 주세요.");
  check(
    mode === "open" || capacityPerPerson === 50_000_000,
    "스토리와 따라하기는 연간 Capa 50백만원으로 진행합니다. 다른 가정은 오픈 모드에서 실험해 주세요.",
  );
  check(
    scenario?.scenarioName === SOURCE_SCENARIO_NAME,
    "8월 버전 시나리오가 필요합니다.",
  );
  check(
    Number.isFinite(capacityPerPerson) &&
      capacityPerPerson >= 1_000_000 &&
      capacityPerPerson <= 200_000_000,
    "1인당 연간 Capa는 1~200백만원 사이로 입력해 주세요.",
  );
  const territories = scenario.territories.filter((t) => t.active && !t.system);
  const regionIds = data.regions
    .filter((r) => scenario.assignments[r.id] !== "unassigned")
    .map((r) => r.id);
  check(
    regionIds.length === 85 && territories.length === 9,
    "시작 시나리오의 권역 구조가 변경되어 확인이 필요합니다.",
  );
  const game = {
    version: 2,
    mode,
    sourceName: SOURCE_SCENARIO_NAME,
    sourceScenario: copy(scenario),
    regionIds,
    territories: copy(territories),
    assignments: copy(scenario.assignments),
    staff: Object.fromEntries(
      territories.map((t) => [t.id, INITIAL_STAFF[t.id] || 0]),
    ),
    reserves: 3,
    capacityPerPerson,
    round: 1,
    points: mode === "open" ? null : 6,
    finished: false,
    reports: [],
    undoStack: [],
    actions: [],
    tutorialStep: mode === "tutorial" ? 0 : null,
    checkpoint: null,
    log: ["8월 편성의 85개 지역으로 작전을 시작했습니다."],
  };
  if (mode === "story") game.checkpoint = commandSnapshot(game);
  return game;
}

export function getRoundEvent(game) {
  return ROUND_EVENTS[
    game.mode === "open"
      ? (game.round - 1) % ROUND_EVENTS.length
      : game.round - 1
  ];
}

export function getObjectives(data, game) {
  const m = evaluateGame(data, game);
  const objective = (id, label, value, passed) => ({
    id,
    label,
    value,
    passed,
  });
  const covered = (target) =>
    objective(
      "coverage",
      `업무 커버율 ${target}% 이상`,
      `${m.coverage.toFixed(1)}%`,
      m.coverage >= target - 1e-9,
    );
  const balanced = objective(
    "balance",
    "인력 균형 90점 이상",
    `${m.balance.toFixed(1)}점`,
    m.balance >= 90,
  );
  if (game.mode === "story" && game.round === 1)
    return [
      objective(
        "support",
        "권역 간 인력 지원 1회",
        `${game.actions.filter((a) => a === "support").length}회`,
        game.actions.includes("support"),
      ),
      covered(98),
      objective(
        "overload",
        "과부하 권역 1개 이하",
        `${m.overloaded}개`,
        m.overloaded <= 1,
      ),
    ];
  if (game.mode === "story" && game.round === 2)
    return [
      objective(
        "region",
        "지역 이관 1회",
        `${game.actions.filter((a) => a === "region").length}회`,
        game.actions.includes("region"),
      ),
      covered(99),
      balanced,
    ];
  return [
    covered(100),
    objective(
      "overload",
      "과부하 권역 0개",
      `${m.overloaded}개`,
      !m.overloaded,
    ),
    balanced,
  ];
}

export function canResolveRound(data, game) {
  return (
    !game.finished &&
    game.mode !== "tutorial" &&
    (game.mode === "open" || getObjectives(data, game).every((o) => o.passed))
  );
}

export function advanceTutorial(game) {
  check(
    game.mode === "tutorial" && [1, 3].includes(game.tutorialStep),
    "안내된 행동을 먼저 직접 완료해 주세요.",
  );
  const next = copy(game);
  next.tutorialStep++;
  if (next.tutorialStep === 4) next.finished = true;
  return next;
}

export function retryRound(game) {
  check(
    game.mode === "story" && !game.finished,
    "진행 중인 스토리 턴만 다시 시작할 수 있습니다.",
  );
  const next = copy(game);
  Object.assign(next, commandSnapshot(game.checkpoint));
  next.undoStack = [];
  return next;
}

export function evaluateGame(data, game) {
  const scoped = new Set(game.regionIds);
  const event = getRoundEvent(game);
  const rows = new Map(
    game.territories.map((t) => [
      t.id,
      {
        ...t,
        staff: game.staff[t.id],
        workload: 0,
        baseWorkload: 0,
        sales: 0,
        regionCount: 0,
      },
    ]),
  );
  for (const region of data.regions) {
    if (!scoped.has(region.id)) continue;
    const row = rows.get(game.assignments[region.id]);
    row.regionCount++;
    row.baseWorkload += region.installCost || 0;
    row.workload += Math.round(
      (region.installCost || 0) * event.factor(region),
    );
    row.sales += region.sales || 0;
  }
  const territories = [...rows.values()].map((row) => {
    const capacity = row.staff * game.capacityPerPerson;
    return {
      ...row,
      capacity,
      utilization: capacity
        ? row.workload / capacity
        : row.workload > 0
          ? Infinity
          : 0,
      covered: Math.min(row.workload, capacity),
      gap: row.workload - capacity,
    };
  });
  const totalWorkload = territories.reduce((s, t) => s + t.workload, 0);
  const totalStaff = territories.reduce((s, t) => s + t.staff, 0);
  const totalCapacity = totalStaff * game.capacityPerPerson;
  const coverage = totalWorkload
    ? (territories.reduce((s, t) => s + t.covered, 0) / totalWorkload) * 100
    : 100;
  const average = totalCapacity ? totalWorkload / totalCapacity : 0;
  // Absolute deviation counts both spare staff and unstaffed work; moving a region cannot erase its workload.
  const deviation = territories.reduce(
    (s, t) => s + Math.abs(t.workload - t.capacity * average),
    0,
  );
  const balance = totalWorkload
    ? clamp(100 * (1 - deviation / (2 * totalWorkload)))
    : 100;
  const efficiency = totalCapacity
    ? Math.min(1, totalWorkload / totalCapacity) * 100
    : 0;
  const score = Math.round(
    clamp(coverage * 0.45 + balance * 0.35 + efficiency * 0.2),
  );
  return {
    territories,
    totalWorkload,
    totalStaff,
    totalCapacity,
    coverage,
    balance,
    efficiency,
    score,
    overloaded: territories.filter((t) => t.workload > t.capacity).length,
    average,
  };
}

export function applyCommand(data, game, command) {
  check(!game.finished, "이번 원정은 종료되었습니다. 새 작전을 시작해 주세요.");
  check(
    game.mode === "open" || game.points > 0,
    "이번 분기의 명령을 모두 사용했습니다. 분기 결산으로 넘어가세요.",
  );
  if (game.mode === "tutorial") {
    const support =
      game.tutorialStep === 0 &&
      command.type === "staff" &&
      command.from === "t_lee_hyeonseok" &&
      command.to === "t_kim_yonghun";
    const region =
      game.tutorialStep === 2 &&
      command.type === "region" &&
      command.regionId === "11410" &&
      command.to === "t_lee_hyeonseok";
    check(
      support || region,
      "따라하기 안내에 표시된 인력 지원 또는 서대문구 이관을 진행해 주세요.",
    );
  }
  const next = copy(game);
  const territoryIds = new Set(game.territories.map((t) => t.id));
  const name = (id) =>
    id === "reserve"
      ? "예비 인력"
      : game.territories.find((t) => t.id === id)?.name;
  let message;
  if (command.type === "staff") {
    check(command.from !== command.to, "서로 다른 권역을 선택해 주세요.");
    check(
      territoryIds.has(command.from) || command.from === "reserve",
      "지원 권역이 올바르지 않습니다.",
    );
    check(
      territoryIds.has(command.to) || command.to === "reserve",
      "배치 권역이 올바르지 않습니다.",
    );
    check(
      (command.from === "reserve" ? next.reserves : next.staff[command.from]) >
        0,
      "보낼 수 있는 인원이 없습니다.",
    );
    if (command.from === "reserve") next.reserves--;
    else next.staff[command.from]--;
    if (command.to === "reserve") next.reserves++;
    else next.staff[command.to]++;
    message = `${name(command.from)} → ${name(command.to)} · 1명 재배치`;
  } else if (command.type === "region") {
    check(
      game.regionIds.includes(command.regionId),
      "이번 훈련 범위의 지역을 선택해 주세요.",
    );
    check(territoryIds.has(command.to), "지역을 받을 권역을 선택해 주세요.");
    check(
      next.assignments[command.regionId] !== command.to,
      "이미 같은 권역에 속한 지역입니다.",
    );
    const region = data.regions.find((r) => r.id === command.regionId);
    message = `${region.sido} ${region.name} · ${name(next.assignments[command.regionId])} → ${name(command.to)}`;
    next.assignments[command.regionId] = command.to;
  } else throw new Error("지원하지 않는 작전입니다.");
  next.undoStack.push(commandSnapshot(game));
  next.undoStack = next.undoStack.slice(game.mode === "open" ? -30 : -6);
  if (game.mode !== "open") next.points--;
  next.actions = [
    ...game.actions,
    command.type === "region"
      ? "region"
      : command.from === "reserve" || command.to === "reserve"
        ? "reserve"
        : "support",
  ].slice(-30);
  if (game.mode === "tutorial") next.tutorialStep++;
  next.log = [message, ...next.log].slice(0, 30);
  return next;
}

export function undoCommand(game) {
  check(!game.finished && game.undoStack.length > 0, "되돌릴 명령이 없습니다.");
  const next = copy(game);
  Object.assign(next, commandSnapshot(next.undoStack.pop()));
  return next;
}

export function resolveRound(data, game) {
  check(!game.finished, "이미 마지막 분기를 결산했습니다.");
  check(game.mode !== "tutorial", "따라하기는 안내된 두 행동을 완료해 주세요.");
  check(
    canResolveRound(data, game),
    "이번 턴의 목표를 먼저 달성해 주세요. 명령이 부족하면 이번 턴을 다시 시도할 수 있습니다.",
  );
  const metrics = evaluateGame(data, game);
  const next = copy(game);
  next.reports.push({
    round: game.round,
    score: metrics.score,
    coverage: metrics.coverage,
    balance: metrics.balance,
    efficiency: metrics.efficiency,
    overloaded: metrics.overloaded,
    objectives: getObjectives(data, game),
  });
  next.reports = next.reports.slice(-30);
  next.undoStack = [];
  next.actions = [];
  if (game.mode === "story" && game.round === 3) {
    next.finished = true;
    next.points = 0;
  } else {
    next.round++;
    next.points = game.mode === "open" ? null : 6;
    next.log = [
      `${next.round}턴 · ${getRoundEvent(next).description}`,
      ...next.log,
    ].slice(0, 30);
    if (game.mode === "story") next.checkpoint = commandSnapshot(next);
  }
  return next;
}

export function restoreGame(data, scenario, saved) {
  check(
    [1, 2].includes(saved?.version) &&
      saved.sourceName === SOURCE_SCENARIO_NAME,
    "저장된 게임 버전이 다릅니다.",
  );
  const legacy = saved.version === 1;
  const mode = legacy ? "open" : saved.mode;
  const fresh = createGame(data, scenario, {
    capacityPerPerson: saved.capacityPerPerson,
    mode,
  });
  if (legacy) {
    check(
      integer(saved.round, 1, 3) && typeof saved.finished === "boolean",
      "이전 게임의 진행 정보가 올바르지 않습니다.",
    );
    saved = {
      ...copy(saved),
      version: 2,
      mode,
      round: saved.round + (saved.finished ? 1 : 0),
      finished: false,
      points: null,
      actions: [],
      tutorialStep: null,
      checkpoint: null,
      undoStack: saved.undoStack.map((s) => ({
        ...s,
        points: null,
        actions: [],
        tutorialStep: null,
      })),
    };
  }
  check(
    integer(saved.round, 1, mode === "open" ? 100000 : 3) &&
      typeof saved.finished === "boolean",
    "게임 진행 정보가 올바르지 않습니다.",
  );
  check(mode !== "open" || !saved.finished, "오픈 모드는 종료 턴이 없습니다.");
  check(
    mode !== "story" || !saved.finished || saved.round === 3,
    "종료 분기가 올바르지 않습니다.",
  );
  if (mode === "tutorial")
    check(
      saved.round === 1 &&
        integer(saved.tutorialStep, 0, 4) &&
        saved.finished === (saved.tutorialStep === 4),
      "따라하기 단계가 올바르지 않습니다.",
    );
  else
    check(saved.tutorialStep === null, "따라하기 단계 정보가 잘못되었습니다.");
  const validateMutable = (mutable) => {
    check(
      (mode === "open"
        ? mutable.points === null
        : integer(mutable.points, 0, 6)) && integer(mutable.reserves, 0, 49),
      "인력 또는 명령 정보가 올바르지 않습니다.",
    );
    check(
      Array.isArray(mutable.actions) &&
        mutable.actions.length <= (mode === "open" ? 30 : 6) &&
        mutable.actions.every((a) =>
          ["support", "reserve", "region"].includes(a),
        ),
      "명령 기록이 올바르지 않습니다.",
    );
    if (mode === "tutorial")
      check(
        integer(mutable.tutorialStep, 0, 4),
        "따라하기 기록이 올바르지 않습니다.",
      );
    else
      check(
        mutable.tutorialStep === null,
        "모드의 명령 기록이 올바르지 않습니다.",
      );
    check(
      mutable.staff &&
        fresh.territories.every((t) => integer(mutable.staff[t.id], 0, 49)),
      "권역별 인원 정보가 올바르지 않습니다.",
    );
    check(
      Object.keys(mutable.staff).length === fresh.territories.length,
      "알 수 없는 권역 인원입니다.",
    );
    check(
      Object.values(mutable.staff).reduce((s, n) => s + n, mutable.reserves) ===
        49,
      "전체 인원 합계가 일치하지 않습니다.",
    );
    const ids = new Set(fresh.territories.map((t) => t.id));
    check(
      mutable.assignments && Object.keys(mutable.assignments).length === 250,
      "지역 배정 정보가 누락되었습니다.",
    );
    check(
      data.regions.every((r) =>
        fresh.regionIds.includes(r.id)
          ? ids.has(mutable.assignments[r.id])
          : mutable.assignments[r.id] === fresh.assignments[r.id],
      ),
      "지역 배정 범위가 올바르지 않습니다.",
    );
    check(
      Array.isArray(mutable.log) &&
        mutable.log.length <= 30 &&
        mutable.log.every((s) => typeof s === "string" && s.length < 300),
      "작전 기록이 올바르지 않습니다.",
    );
  };
  validateMutable(saved);
  check(
    Array.isArray(saved.reports) &&
      saved.reports.length ===
        (mode === "tutorial"
          ? 0
          : mode === "open"
            ? Math.min(30, saved.round - 1)
            : saved.finished
              ? 3
              : saved.round - 1),
    "분기 보고서 정보가 올바르지 않습니다.",
  );
  check(
    saved.reports.every(
      (r, i) =>
        r.round === (mode === "open" ? Math.max(1, saved.round - 30) : 1) + i &&
        [r.score, r.coverage, r.balance, r.efficiency].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 100,
        ) &&
        integer(r.overloaded, 0, 9),
    ),
    "보고서 수치가 올바르지 않습니다.",
  );
  check(
    saved.reports.every(
      (report) =>
        report.objectives === undefined ||
        (Array.isArray(report.objectives) &&
          report.objectives.length <= 6 &&
          report.objectives.every(
            (objective) =>
              objective &&
              typeof objective === "object" &&
              typeof objective.id === "string" &&
              objective.id.length <= 64 &&
              typeof objective.label === "string" &&
              objective.label.length <= 200 &&
              typeof objective.value === "string" &&
              objective.value.length <= 100 &&
              typeof objective.passed === "boolean",
          )),
    ),
    "보고서의 목표 정보가 올바르지 않습니다.",
  );
  check(
    Array.isArray(saved.undoStack) &&
      saved.undoStack.length <= (mode === "open" ? 30 : 6),
    "되돌리기 정보가 올바르지 않습니다.",
  );
  saved.undoStack.forEach(validateMutable);
  if (mode === "story") {
    check(
      saved.checkpoint &&
        saved.checkpoint.points === 6 &&
        saved.checkpoint.actions?.length === 0,
      "턴 시작 기록이 올바르지 않습니다.",
    );
    validateMutable(saved.checkpoint);
  } else check(saved.checkpoint === null, "턴 시작 기록이 올바르지 않습니다.");
  return {
    ...fresh,
    assignments: copy(saved.assignments),
    staff: copy(saved.staff),
    reserves: saved.reserves,
    points: saved.points,
    round: saved.round,
    finished: saved.finished,
    reports: copy(saved.reports),
    undoStack: saved.undoStack.map(commandSnapshot),
    log: [...saved.log],
    actions: [...saved.actions],
    tutorialStep: saved.tutorialStep,
    checkpoint: mode === "story" ? commandSnapshot(saved.checkpoint) : null,
  };
}

export function exportTrainingScenario(game) {
  const scenario = copy(game.sourceScenario);
  scenario.scenarioName = `권역지략_훈련안_${game.round}분기`;
  scenario.assignments = copy(game.assignments);
  scenario.territories = scenario.territories.map((t) =>
    t.system
      ? t
      : {
          ...t,
          staff: game.staff[t.id] || 0,
          capacityMetric: "installCost",
          capacityPerPerson: game.capacityPerPerson / 1_000_000,
        },
  );
  scenario.trainingNote =
    "게임에서 가정한 인원·연간 Capa를 적용한 훈련안입니다. 실제 운영 확정값이 아닙니다. 수요 사건은 원본 금액에 반영하지 않았습니다.";
  return scenario;
}
