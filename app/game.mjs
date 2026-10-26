import { APP_DATA } from "./data.mjs";
import { HAN_RIVER } from "./waterways.mjs";
import {
  SOURCE_SCENARIO_NAME,
  GAME_MODES,
  STORY_CHAPTERS,
  getRoundEvent,
  getObjectives,
  canResolveRound,
  advanceTutorial,
  retryRound,
  createGame,
  evaluateGame,
  applyCommand,
  undoCommand,
  resolveRound,
  exportTrainingScenario,
} from "./game-core.mjs";
import {
  SAVE_KEYS,
  loadModeGame,
  saveModeGame,
  lastMode,
} from "./game-saves.mjs";
import {
  welcomeMarkup,
  modePickerMarkup,
  learningMarkup,
  chapterBriefMarkup,
  rulesMarkup,
} from "./game-experience.mjs";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const million = (value) =>
  (value / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const percent = (value) =>
  Number.isFinite(value) ? `${Math.round(value * 100)}%` : "인력 없음";
const COLORS = [
  "#c2a267",
  "#77a5a3",
  "#57978c",
  "#9b87a8",
  "#5c917d",
  "#a092b4",
  "#b98166",
  "#8caa63",
  "#6f9fac",
];
const svg = $("#game-map");
const dialog = $("#game-dialog");
let game,
  source,
  metrics,
  baseline,
  selectedTerritory = "t_kim_yonghun",
  selectedRegion = "11680";
let regionTarget = "",
  staffDonor = "",
  mapMode = "territory",
  view = { x: 0, y: 0, w: 1000, h: 740 },
  drag,
  suppressClick = false,
  toastTimer;
let scopedRegions = [],
  paths = new Map(),
  project,
  colorById;

init().catch((error) => {
  $("#loading").innerHTML =
    `<div class="empty-error"><strong>작전 지도를 불러오지 못했습니다.</strong><p>${esc(error.message)}</p><a href="./index.html">업무 시뮬레이터로 돌아가기 →</a></div>`;
});

async function init() {
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const response = await fetch(
    local ? "/api/scenarios" : "./saved_scenarios.json",
    { cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(
      "시나리오 백업에 연결할 수 없습니다. 서버 또는 배포 상태를 확인해 주세요.",
    );
  source = (await response.json())[SOURCE_SCENARIO_NAME];
  game = createGame(APP_DATA, source, { mode: lastMode() });
  try {
    game = loadModeGame(APP_DATA, source, game.mode) || game;
  } catch {
    notify("이전 게임 저장값을 읽지 못해 새 작전을 열었습니다.");
  }
  scopedRegions = APP_DATA.regions.filter((r) => game.regionIds.includes(r.id));
  colorById = new Map(game.territories.map((t, i) => [t.id, COLORS[i]]));
  setupProjection();
  bindEvents();
  $("#loading").hidden = true;
  $("#game-shell").hidden = false;
  prepareTutorial();
  render();
  try {
    if (!localStorage.getItem(SAVE_KEYS.welcome)) {
      showWelcome();
      localStorage.setItem(SAVE_KEYS.welcome, "seen");
    }
  } catch {
    showWelcome();
  }
}

function setupProjection() {
  // Fit the operational mainland. Remote islands remain accessible by search and the full-map button.
  const cx = 127.05,
    cy = 37.35,
    scale = 305;
  project = ([lon, lat]) => [
    500 + (lon - cx) * scale * 0.87 + (lat - cy) * scale * 0.1,
    365 - (lat - cy) * scale * 0.79 + (lon - cx) * scale * 0.09,
  ];
  paths = new Map(scopedRegions.map((r) => [r.id, geometryPath(r.geometry)]));
}

function ringPath(ring, close = true) {
  let last;
  const points = ring.map(project).filter((p, i, all) => {
    if (
      !last ||
      i === all.length - 1 ||
      Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.4
    ) {
      last = p;
      return true;
    }
    return false;
  });
  return (
    points
      .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join("") + (close ? "Z" : "")
  );
}
function geometryPath(geometry) {
  if (geometry.type === "Polygon")
    return geometry.coordinates.map((r) => ringPath(r)).join("");
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates
      .flatMap((p) => p.map((r) => ringPath(r)))
      .join("");
  if (geometry.type === "LineString")
    return ringPath(geometry.coordinates, false);
  if (geometry.type === "MultiLineString")
    return geometry.coordinates.map((r) => ringPath(r, false)).join("");
  return "";
}

function render() {
  metrics = evaluateGame(APP_DATA, game);
  const original = createGame(APP_DATA, source, {
    capacityPerPerson: game.capacityPerPerson,
    mode: game.mode,
  });
  original.round = game.round;
  baseline = evaluateGame(APP_DATA, original);
  $("#campaign-mode-label").textContent =
    `${GAME_MODES[game.mode]} · ${game.mode === "story" ? "균형의 기술" : game.mode === "open" ? "자유로운 실험" : "두 가지 명령 배우기"}`;
  $("#round-label").textContent =
    game.mode === "tutorial"
      ? game.finished
        ? "연습 완료"
        : "따라하기"
      : game.finished
        ? "원정 완료"
        : `${game.mode === "story" ? "제" : ""}${game.round}${game.mode === "story" ? "장" : "턴"}`;
  $("#event-tag").textContent = getRoundEvent(game).tag;
  $("#score-value").innerHTML = `${metrics.score}<small>/100</small>`;
  const delta = metrics.score - baseline.score;
  $("#score-delta").textContent =
    `시작 편성 대비 ${delta >= 0 ? "+" : ""}${delta}점`;
  $("#score-delta").className = delta >= 0 ? "positive" : "";
  $("#coverage-value").innerHTML =
    `${metrics.coverage.toFixed(1)}<small>%</small>`;
  $("#coverage-bar").style.width = `${metrics.coverage}%`;
  $("#overload-value").innerHTML = `${metrics.overloaded}<small>개</small>`;
  $("#reserve-value").innerHTML = `${game.reserves}<small>명</small>`;
  $("#commands-label").textContent =
    game.mode === "open"
      ? "자유로운 명령"
      : game.mode === "tutorial"
        ? "안내 따라 진행"
        : "이번 턴 남은 명령";
  $("#points-label").textContent =
    game.mode === "open" ? "무제한 ∞" : `${game.points} / 6`;
  $("#command-pips").innerHTML = Array.from(
    { length: 6 },
    (_, i) =>
      `<i class="${game.mode === "open" || i < game.points ? "on" : ""}"></i>`,
  ).join("");
  $("#resolve-round").innerHTML =
    game.mode === "tutorial"
      ? "안내를 따라 연습 중"
      : game.finished
        ? "작전 결과 보기 <span>↗</span>"
        : game.mode === "open"
          ? "다음 수요 상황 <span>→</span>"
          : canResolveRound(APP_DATA, game)
            ? "목표 달성 · 결산 <span>→</span>"
            : "목표를 달성해 주세요";
  $("#resolve-round").disabled =
    game.mode === "tutorial" ||
    (!game.finished && !canResolveRound(APP_DATA, game));
  $("#undo-game").disabled = game.finished || !game.undoStack.length;
  $("#event-heading").textContent = getRoundEvent(game).title;
  $("#event-description").textContent = getRoundEvent(game).description;
  $("#latest-order").textContent = game.log[0];
  $("#mission-heading").textContent =
    game.mode === "open"
      ? "참고 목표 · 자유롭게 실험하세요"
      : game.mode === "tutorial"
        ? "연습 후 확인할 지표"
        : "이번 장의 필수 목표";
  $("#mission-list").innerHTML = getObjectives(APP_DATA, game)
    .map(
      ({ passed, label, value }) =>
        `<li class="${passed ? "done" : ""}"><span>${passed ? "✓" : "○"} ${esc(label)}</span><b>${esc(value)}</b></li>`,
    )
    .join("");
  renderRoster();
  renderMap();
  renderOrders();
  renderAdvisor();
  renderExperience();
  save();
}

function renderRoster() {
  $("#commander-list").innerHTML = metrics.territories
    .map(
      (t) =>
        `<button class="commander-card ${t.id === selectedTerritory ? "selected" : ""}" data-territory="${t.id}" aria-pressed="${t.id === selectedTerritory}" style="--color:${colorById.get(t.id)}"><div class="commander-top"><span class="commander-avatar" aria-hidden="true">${esc(t.name.slice(0, 1))}</span><span class="commander-name">${esc(t.name)}<small>${t.regionCount}개 지역 · ${t.staff}명</small></span><span class="commander-rate ${t.utilization > 1 ? "over" : ""} ${!t.regionCount ? "empty" : ""}">${!t.regionCount && !t.staff ? "대기" : percent(t.utilization)}</span></div><div class="load-track"><i class="${t.utilization > 1 ? "over" : ""}" style="width:${Math.min(100, t.utilization * 80)}%"></i></div></button>`,
    )
    .join("");
}

function renderMap() {
  const totals = new Map(metrics.territories.map((t) => [t.id, t]));
  const ordered = [...scopedRegions].sort(
    (a, b) => b.centroid[1] - a.centroid[1],
  );
  const tiles = ordered
    .map((r) => {
      const owner = totals.get(game.assignments[r.id]);
      const color =
        mapMode === "load"
          ? owner.utilization > 1
            ? "#b66f58"
            : owner.utilization >= 0.85
              ? "#b7a66a"
              : "#5b9682"
          : colorById.get(owner.id);
      return `<g class="region-tile ${r.id === selectedRegion ? "selected" : ""}" data-region="${r.id}" tabindex="0" role="button" aria-label="${esc(`${r.sido} ${r.name}, ${owner.name} 권역`)}"><title>${esc(r.name)} · ${esc(owner.name)}</title><path class="region-side" transform="translate(0,13)" d="${paths.get(r.id)}"/><path class="region-top" fill="${color}" fill-rule="evenodd" d="${paths.get(r.id)}"/></g>`;
    })
    .join("");
  const markers = metrics.territories
    .filter((t) => t.regionCount > 0)
    .map((t) => {
      const regions = scopedRegions.filter(
        (r) => game.assignments[r.id] === t.id,
      );
      const sum = regions.reduce(
        (n, r) => n + Math.max(1, r.installCost || 0),
        0,
      );
      const center = [0, 1].map(
        (i) =>
          regions.reduce(
            (n, r) => n + r.centroid[i] * Math.max(1, r.installCost || 0),
            0,
          ) / sum,
      );
      const [x, y] = project(center);
      const labels = {
        t_kim_yonghun: [35, 36],
        t_kim_jeonghun: [48, -39],
        t_shin_seunghyeon: [56, 26],
        t_lee_jeongil: [31, -15],
        t_lee_hyeonseok: [-63, -19],
        territory_1783995961112: [46, -28],
        territory_1784971161587: [-27, 29],
      };
      const [dx, dy] = labels[t.id] || [20, -20];
      const label = t.name === "B2C 통합시공 이관" ? "B2C 이관" : t.name;
      return `<g class="hq-marker" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${view.w / 1000})"><ellipse cx="2" cy="9" rx="13" ry="5" fill="#07231f70"/><path d="M-7 0L1 -5L10 0L2 5Z" fill="#dfcf9c"/><path d="M-7 0V10L2 15V5Z" fill="#6c7453"/><path d="M2 5L10 0V10L2 15Z" fill="#405e47"/><path d="M1 -5V-30" stroke="#f3d99a" stroke-width="1.5"/><path d="M2 -29L18 -24L2 -18Z" fill="${colorById.get(t.id)}" stroke="#eddeb3" stroke-width=".5"/><path d="M4 -12L${dx} ${dy}" fill="none" stroke="#dfd49b75" stroke-width=".7"/><text x="${dx}" y="${dy}" text-anchor="${dx < 0 ? "end" : "start"}" class="hq-name">${esc(label)}</text></g>`;
    })
    .join("");
  const labels =
    view.w < 300
      ? scopedRegions
          .filter((r) => r.sido === "서울특별시")
          .map((r) => {
            const [x, y] = project(r.centroid);
            return `<text class="region-label" style="font-size:${(9 * view.w) / 1000}px;stroke-width:${(2 * view.w) / 1000}px" x="${x}" y="${y}" text-anchor="middle">${esc(r.name)}</text>`;
          })
          .join("")
      : "";
  svg.innerHTML = `<defs><filter id="land-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="8" dy="19" stdDeviation="13" flood-color="#031a1c" flood-opacity=".65"/></filter></defs><g filter="url(#land-shadow)">${tiles}</g><path class="water-line" d="${geometryPath(HAN_RIVER)}"/>${labels}${markers}`;
  setView();
}

function optionList(exclude, includeReserve = false, selected = "") {
  return `${includeReserve ? `<option value="reserve" ${selected === "reserve" ? "selected" : ""}>예비 인력 · ${game.reserves}명</option>` : ""}${metrics.territories
    .filter((t) => t.id !== exclude)
    .map(
      (t) =>
        `<option value="${t.id}" ${selected === t.id ? "selected" : ""}>${esc(t.name)} · ${t.staff}명 / ${percent(t.utilization)}</option>`,
    )
    .join("")}`;
}
function renderOrders() {
  const territory = metrics.territories.find((t) => t.id === selectedTerritory);
  const disabled = game.finished || (game.mode !== "open" && !game.points);
  const donors = metrics.territories
    .filter((t) => t.id !== territory.id && t.staff > 0)
    .sort((a, b) => b.capacity - b.workload - (a.capacity - a.workload));
  if (
    !staffDonor ||
    staffDonor === territory.id ||
    !game.territories.some((t) => t.id === staffDonor)
  )
    staffDonor = donors[0]?.id || "reserve";
  $("#staff-orders").innerHTML =
    `<div class="order-kicker"><span>01 · 인력 재배치</span><b>각 명령 1회</b></div><h3 class="order-title"><i class="order-dot" style="--color:${colorById.get(territory.id)}"></i>${esc(territory.name)}</h3><div class="order-stats"><div><span>배치 인원</span><strong>${territory.staff}명</strong></div><div><span>가동률</span><strong class="${territory.utilization > 1 ? "is-over" : ""}">${percent(territory.utilization)}</strong></div><div><span>월 환산 업무</span><strong>${million(territory.workload / 12)}백만</strong></div></div><div class="order-actions"><button class="action-button gold" data-command="reserve-in" ${disabled || !game.reserves ? "disabled" : ""}>＋ 예비 1명 투입</button><button class="action-button" data-command="reserve-out" ${disabled || !territory.staff ? "disabled" : ""}>− 1명 회수</button></div><label for="staff-donor">다른 권역에서 지원받기</label><select id="staff-donor" ${disabled ? "disabled" : ""}>${optionList(territory.id, false, staffDonor)}</select><button class="action-button block" data-command="support" ${disabled || !game.staff[staffDonor] ? "disabled" : ""}>선택 권역에서 1명 지원받기 →</button><p class="small-note">연간 업무 ${million(territory.workload)}백만 / Capa ${million(territory.capacity)}백만 · 지원한 권역의 부담도 함께 변합니다.</p>`;
  const region = scopedRegions.find((r) => r.id === selectedRegion);
  if (!region) {
    $("#region-orders").innerHTML =
      `<div class="order-kicker"><span>02 · 지역 이관</span><b>명령 1회</b></div><p class="region-selection-prompt">지도에서 지역을 클릭해 주세요.</p>`;
    return;
  }
  const owner = metrics.territories.find(
    (t) => t.id === game.assignments[region.id],
  );
  if (
    !regionTarget ||
    regionTarget === owner.id ||
    !game.territories.some((t) => t.id === regionTarget)
  )
    regionTarget =
      selectedTerritory !== owner.id
        ? selectedTerritory
        : metrics.territories
            .filter((t) => t.staff && t.id !== owner.id)
            .sort((a, b) => a.utilization - b.utilization)[0]?.id;
  $("#region-orders").innerHTML =
    `<div class="order-kicker"><span>02 · 지역 이관</span><b>명령 1회</b></div><label for="game-region-search">작전 지역 선택 · 지도에서도 선택 가능</label><select id="game-region-search">${[
      ...scopedRegions,
    ]
      .sort((a, b) =>
        `${a.sido} ${a.name}`.localeCompare(`${b.sido} ${b.name}`, "ko"),
      )
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === selectedRegion ? "selected" : ""}>${esc(r.sido)} ${esc(r.name)}</option>`,
      )
      .join(
        "",
      )}</select><h3 class="order-title">${esc(region.name)} <small style="font:10px var(--sans);color:#7b998b">${esc(owner.name)} 담당</small></h3><div class="region-money"><span>2025 정상 시공비</span><strong>${million(region.installCost)}백만원 / 년</strong></div><label for="region-target">이 지역을 맡길 권역</label><select id="region-target" ${disabled ? "disabled" : ""}>${optionList(owner.id, false, regionTarget)}</select><p id="region-preview" class="preview-note"></p><button class="action-button block gold" data-command="transfer" ${disabled ? "disabled" : ""}>${esc(region.name)} 이관하기 →</button>`;
  renderPreview();
}
function renderPreview() {
  if (game.finished || (game.mode !== "open" && !game.points)) {
    $("#region-preview").textContent =
      "결산 후 다음 작전을 진행할 수 있습니다.";
    return;
  }
  try {
    const next = evaluateGame(
      APP_DATA,
      applyCommand(APP_DATA, game, {
        type: "region",
        regionId: selectedRegion,
        to: regionTarget,
      }),
    );
    const delta = next.score - metrics.score;
    $("#region-preview").textContent =
      `예상 변화: 운영 점수 ${delta >= 0 ? "+" : ""}${delta} · 과부하 ${metrics.overloaded} → ${next.overloaded}개`;
  } catch {
    $("#region-preview").textContent =
      game.mode === "tutorial"
        ? "위쪽 따라하기 안내의 순서대로 진행해 주세요."
        : "이관할 권역을 선택해 주세요.";
  }
}
function renderAdvisor() {
  const worst = metrics.territories
    .filter((t) => t.gap > 0)
    .sort((a, b) => b.gap - a.gap)[0];
  if (!worst) {
    $("#advisor-text").textContent =
      "모든 권역의 업무를 커버하고 있습니다. 인력이 넉넉한 곳과 빠듯한 곳의 가동률을 비교하며 균형을 다듬어 보세요.";
    return;
  }
  const donor = metrics.territories
    .filter((t) => t.id !== worst.id && t.staff > 1)
    .sort((a, b) => b.capacity - b.workload - (a.capacity - a.workload))[0];
  $("#advisor-text").textContent =
    `${worst.name}의 업무가 연간 Capa보다 ${million(worst.gap)}백만원 많습니다. ${donor ? `${donor.name}의 가동률 ${percent(donor.utilization)}와 비교해 지원` : "예비 인력 투입"} 또는 지역 이관을 검토해 보세요. 선택 전후의 두 권역을 함께 보세요.`;
}

function renderExperience() {
  const panel = $("#learning-panel");
  panel.className = `learning-panel mode-${game.mode}`;
  panel.innerHTML = learningMarkup(APP_DATA, game, metrics);
  document
    .querySelectorAll(".tutorial-highlight")
    .forEach((el) => el.classList.remove("tutorial-highlight"));
  if (game.mode !== "tutorial") return;
  const allowed =
    game.tutorialStep === 0
      ? "support"
      : game.tutorialStep === 2
        ? "transfer"
        : null;
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.disabled = button.disabled || button.dataset.command !== allowed;
  });
  const highlights =
    game.tutorialStep === 0
      ? ["#staff-donor", "[data-command='support']"]
      : game.tutorialStep === 2
        ? ["#game-region-search", "#region-target", "[data-command='transfer']"]
        : [];
  highlights.forEach((selector) =>
    $(selector)?.classList.add("tutorial-highlight"),
  );
}

function prepareTutorial(focus = false) {
  if (game.mode !== "tutorial") return;
  if (game.tutorialStep < 2) {
    selectedTerritory = "t_kim_yonghun";
    staffDonor = "t_lee_hyeonseok";
  } else {
    selectedTerritory = "t_kim_jeonghun";
    selectedRegion = "11410";
    regionTarget = "t_lee_hyeonseok";
    if (focus) {
      const [x, y] = project(
        scopedRegions.find((r) => r.id === "11410").centroid,
      );
      view = { x: x - 135, y: y - 100, w: 270, h: 199.8 };
    }
  }
}

function resetView() {
  selectedTerritory = "t_kim_yonghun";
  selectedRegion = "11680";
  regionTarget = "";
  staffDonor = "";
  view = { x: 0, y: 0, w: 1000, h: 740 };
  prepareTutorial();
}

function activateMode(mode, restart = false) {
  try {
    let stored;
    try {
      stored = loadModeGame(APP_DATA, source, mode);
    } catch {
      notify("이전 저장값은 복구용 사본으로 보관하고 새 게임을 준비했습니다.");
    }
    game =
      !restart && stored
        ? stored
        : createGame(APP_DATA, source, {
            mode,
            capacityPerPerson:
              mode === "open"
                ? stored?.capacityPerPerson || 50_000_000
                : 50_000_000,
          });
    resetView();
    render();
    if (mode === "story" && ((!stored && !game.finished) || restart))
      openDialog(chapterBriefMarkup(APP_DATA, game));
  } catch (error) {
    notify(`진행을 불러오지 못했습니다. ${error.message}`);
  }
}

function showModes() {
  const saves = {};
  for (const mode of Object.keys(GAME_MODES)) {
    try {
      saves[mode] = loadModeGame(APP_DATA, source, mode);
    } catch {
      saves[mode] = null;
    }
  }
  openDialog(modePickerMarkup(saves), true);
}

function showWelcome() {
  openDialog(welcomeMarkup(), true);
}

function showRetry() {
  openDialog(
    `<span class="overline">RETRY CHAPTER ${game.round}</span><h2 id="dialog-title">이번 턴을 다시 풀어볼까요?</h2><p>현재 ${game.round}장의 시작 편성으로 돌아가고 명령 6회를 다시 받습니다. 이미 완료한 이전 장의 결과와 다른 모드의 진행은 유지됩니다.</p><div class="dialog-actions"><button class="action-button" data-dialog-action="close">계속 고민하기</button><button class="gold-button" data-dialog-action="retry">이번 턴 다시 시작 →</button></div>`,
  );
}

function bindEvents() {
  $("#mode-button").addEventListener("click", showModes);
  $("#learn-button").addEventListener("click", showWelcome);
  $("#learning-panel").addEventListener("click", (event) => {
    const action = event.target.closest("[data-learning-action]")?.dataset
      .learningAction;
    if (action === "modes") showModes();
    if (action === "hint")
      openDialog(
        `<span class="overline">ADVISOR’S HINT · 제${game.round}장</span><h2 id="dialog-title">다음 한 수의 실마리</h2><p>${esc(STORY_CHAPTERS[game.round - 1].hint)}</p><p class="rules-detail">하나의 예시입니다. 다른 편성으로도 목표를 달성할 수 있어요. 행동 전후 두 권역의 가동률을 비교해 보세요.</p><div class="dialog-actions"><button class="gold-button" data-dialog-action="close">직접 풀어보기 →</button></div>`,
      );
    if (action === "retry") showRetry();
    if (action === "next") {
      try {
        game = advanceTutorial(game);
        prepareTutorial(true);
        render();
      } catch (e) {
        notify(e.message);
      }
    }
    if (
      action === "focus" ||
      (action === "next" && game.mode === "tutorial" && game.tutorialStep === 2)
    ) {
      prepareTutorial(true);
      render();
      $(
        game.tutorialStep === 0
          ? "[data-command='support']"
          : "[data-command='transfer']",
      )?.scrollIntoView({ block: "nearest" });
    }
  });
  for (const [id, mode] of [
    ["territory-view", "territory"],
    ["load-view", "load"],
  ]) {
    $(`#${id}`).addEventListener("click", () => {
      mapMode = mode;
      for (const other of ["territory-view", "load-view"]) {
        $(`#${other}`).classList.toggle("active", other === id);
        $(`#${other}`).setAttribute("aria-pressed", String(other === id));
      }
      renderMap();
    });
  }
  $("#commander-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-territory]");
    if (!button) return;
    selectedTerritory = button.dataset.territory;
    staffDonor = "";
    renderRoster();
    renderOrders();
    renderExperience();
  });
  $(".orders-panel").addEventListener("change", (event) => {
    if (event.target.id === "staff-donor") {
      staffDonor = event.target.value;
      renderOrders();
      renderExperience();
    }
    if (event.target.id === "region-target") {
      regionTarget = event.target.value;
      renderPreview();
    }
    if (event.target.id === "game-region-search")
      selectRegion(event.target.value, true);
  });
  $(".orders-panel").addEventListener("click", (event) => {
    const type = event.target.closest("[data-command]")?.dataset.command;
    if (!type) return;
    const commands = {
      "reserve-in": { type: "staff", from: "reserve", to: selectedTerritory },
      "reserve-out": { type: "staff", from: selectedTerritory, to: "reserve" },
      support: { type: "staff", from: staffDonor, to: selectedTerritory },
      transfer: { type: "region", regionId: selectedRegion, to: regionTarget },
    };
    try {
      const before = metrics.score;
      game = applyCommand(APP_DATA, game, commands[type]);
      render();
      notify(
        `${game.log[0]} · 운영 점수 ${metrics.score - before >= 0 ? "+" : ""}${metrics.score - before}`,
      );
    } catch (error) {
      notify(error.message);
    }
  });
  $("#undo-game").addEventListener("click", () => {
    try {
      game = undoCommand(game);
      render();
      notify("이전 명령과 명령 횟수를 복원했습니다.");
    } catch (e) {
      notify(e.message);
    }
  });
  $("#resolve-round").addEventListener("click", () => {
    if (game.finished) {
      showReport(game.reports.at(-1));
      return;
    }
    try {
      game = resolveRound(APP_DATA, game);
      render();
      showReport(game.reports.at(-1));
    } catch (e) {
      notify(e.message);
    }
  });
  $("#rules-button").addEventListener("click", showRules);
  $("[data-show-rules]").addEventListener("click", showRules);
  $("#restart-game").addEventListener("click", () => showRestart(game.mode));
  $("#export-game").addEventListener("click", exportGame);
  $("#close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("click", (event) => {
    const action = event.target.closest("[data-dialog-action]")?.dataset
      .dialogAction;
    const mode = event.target.closest("[data-mode]")?.dataset.mode;
    const freshMode =
      event.target.closest("[data-fresh-mode]")?.dataset.freshMode;
    const restartMode = event.target.closest("[data-restart-mode]")?.dataset
      .restartMode;
    if (mode) {
      dialog.close();
      activateMode(mode);
    }
    if (freshMode) showRestart(freshMode);
    if (restartMode) {
      dialog.close();
      activateMode(restartMode, true);
    }
    if (action === "modes") showModes();
    if (action === "chapter") openDialog(chapterBriefMarkup(APP_DATA, game));
    if (action === "learn") {
      let finished = false;
      try {
        finished = Boolean(
          loadModeGame(APP_DATA, source, "tutorial")?.finished,
        );
      } catch {}
      dialog.close();
      activateMode("tutorial", finished);
    }
    if (action === "retry") {
      game = retryRound(game);
      resetView();
      render();
      dialog.close();
      notify("이번 장의 시작 편성으로 돌아왔습니다.");
    }
    if (action === "close") dialog.close();
    if (action === "restart") {
      startNewGame(game.capacityPerPerson);
      dialog.close();
      notify("8월 편성에서 새 작전을 시작했습니다.");
    }
    if (action === "export") exportGame();
  });
  dialog.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      startNewGame(Number($("#capacity-assumption").value) * 1_000_000);
      dialog.close();
      notify("새 Capa 가정으로 작전을 시작했습니다.");
    } catch (e) {
      notify(e.message);
    }
  });
  svg.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const id = event.target.closest("[data-region]")?.dataset.region;
    if (id) selectRegion(id);
  });
  svg.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      const id = event.target.closest("[data-region]")?.dataset.region;
      if (id) {
        event.preventDefault();
        selectRegion(id);
      }
    }
  });
  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(event.deltaY > 0 ? 1.12 : 0.89, event.clientX, event.clientY);
    },
    { passive: false },
  );
  svg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = {
      x: event.clientX,
      y: event.clientY,
      view: { ...view },
      moved: false,
      target: event.target.closest("[data-region]")?.dataset.region,
    };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (event) => {
    if (drag) {
      const rect = svg.getBoundingClientRect();
      const ratio = Math.max(view.w / rect.width, view.h / rect.height);
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5)
        drag.moved = true;
      if (drag.moved) {
        view.x = drag.view.x - (event.clientX - drag.x) * ratio;
        view.y = drag.view.y - (event.clientY - drag.y) * ratio;
        setView();
        $("#map-tooltip").hidden = true;
      }
      return;
    }
    const regionId = event.target.closest("[data-region]")?.dataset.region;
    const region = scopedRegions.find((r) => r.id === regionId);
    if (!region) {
      $("#map-tooltip").hidden = true;
      return;
    }
    const owner = metrics.territories.find(
      (t) => t.id === game.assignments[regionId],
    );
    const rect = $("#game-map-stage").getBoundingClientRect();
    $("#map-tooltip").innerHTML =
      `<strong>${esc(region.sido)} ${esc(region.name)}</strong><small>${esc(owner.name)} · 연 정상시공비 ${million(region.installCost)}백만</small>`;
    $("#map-tooltip").style.left =
      `${Math.max(8, Math.min(rect.width - 215, event.clientX - rect.left + 12))}px`;
    $("#map-tooltip").style.top =
      `${Math.max(35, event.clientY - rect.top - 58)}px`;
    $("#map-tooltip").hidden = false;
  });
  const finishDrag = (event) => {
    const gesture = drag;
    drag = null;
    svg.classList.remove("dragging");
    if (!gesture || event.type === "pointercancel") return;
    suppressClick = gesture.moved || Boolean(gesture.target);
    if (!gesture.moved && gesture.target) selectRegion(gesture.target);
  };
  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointercancel", finishDrag);
  svg.addEventListener("pointerleave", () => {
    $("#map-tooltip").hidden = true;
  });
  $("#map-zoom-in").addEventListener("click", () => zoom(0.8));
  $("#map-zoom-out").addEventListener("click", () => zoom(1.25));
  $("#map-home").addEventListener("click", () => {
    view = { x: -220, y: -70, w: 1280, h: 947 };
    renderMap();
  });
  $("#map-seoul").addEventListener("click", () => {
    const [x, y] = project([126.98, 37.55]);
    view = { x: x - 110, y: y - 81.4, w: 220, h: 162.8 };
    renderMap();
  });
}

function selectRegion(id, focus = false) {
  selectedRegion = id;
  regionTarget = "";
  if (focus) {
    const [x, y] = project(scopedRegions.find((r) => r.id === id).centroid);
    view = { x: x - 210, y: y - 155.4, w: 420, h: 310.8 };
  }
  renderMap();
  renderOrders();
  renderExperience();
}
function startNewGame(capacityPerPerson) {
  game = createGame(APP_DATA, source, { capacityPerPerson, mode: game.mode });
  resetView();
  render();
}
function setView() {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}
function zoom(factor, clientX, clientY) {
  const width = Math.min(1650, Math.max(140, view.w * factor));
  let anchor = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  if (clientX !== undefined) {
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
    anchor = point;
  }
  const ratio = width / view.w;
  view = {
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
    w: width,
    h: width * 0.74,
  };
  renderMap();
}
function save() {
  try {
    saveModeGame(game);
    $("#save-status").textContent =
      `✓ ${GAME_MODES[game.mode]} 자동 저장 · 모드별 별도 보관`;
  } catch {
    $("#save-status").textContent =
      "저장 공간을 사용할 수 없습니다 · 훈련안을 내보내 보관하세요";
  }
}
function notify(message) {
  clearTimeout(toastTimer);
  $("#game-toast").textContent = message;
  $("#game-toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("#game-toast").hidden = true;
  }, 3600);
}
function openDialog(content, wide = false) {
  dialog.classList.toggle("wide-dialog", wide);
  $("#dialog-content").innerHTML = content;
  if (!dialog.open) dialog.showModal();
}
function showRestart(mode = game.mode) {
  openDialog(
    `<span class="overline">NEW GAME · ${GAME_MODES[mode]}</span><h2 id="dialog-title">${GAME_MODES[mode]}를 새로 시작할까요?</h2><p>이 모드의 진행을 초기화하고 8월 편성부터 시작합니다. 다른 모드와 업무 시나리오는 그대로 보관됩니다.</p><div class="dialog-actions"><button class="action-button" data-dialog-action="modes">모드 선택으로</button><button class="gold-button" data-restart-mode="${mode}">새 작전 시작 →</button></div>`,
  );
}
function showRules() {
  openDialog(rulesMarkup(game));
}
function showReport(report) {
  const finished = game.finished;
  const free = game.mode === "open";
  const averageScore = Math.round(
    game.reports.reduce((s, r) => s + r.score, 0) / game.reports.length,
  );
  const badge =
    averageScore >= 96
      ? "균형의 명장"
      : averageScore >= 90
        ? "노련한 운영가"
        : averageScore >= 80
          ? "성장하는 전략가"
          : "다음 한 수를 준비하는 지휘관";
  openDialog(
    `<span class="overline">${finished ? "STORY COMPLETE" : free ? "OPEN PLAY · EXPERIMENT LOG" : `CHAPTER ${report.round} COMPLETE`}</span><h2 id="dialog-title">${finished ? "세 번의 선택, 하나의 운영 철학" : free ? `${report.round}턴 자유 실험 기록` : `${report.round}장 목표 달성`}</h2><div class="report-score"><strong>${finished ? averageScore : report.score}</strong><span>${finished ? "3개 장 평균 운영 점수" : "이번 턴 운영 점수"}</span></div>${finished ? `<div class="result-badge">✦ ${badge} ✦</div>` : ""}<div class="report-columns"><div><span>업무 커버율</span><strong>${report.coverage.toFixed(1)}%</strong></div><div><span>인력 균형</span><strong>${report.balance.toFixed(0)}점</strong></div><div><span>과부하 권역</span><strong>${report.overloaded}개</strong></div></div>${!free && report.objectives ? `<div class="report-objectives">${report.objectives.map((o) => `<span>✓ ${esc(o.label)}</span>`).join("")}</div>` : ""}<p class="report-note">${report.overloaded ? `아직 ${report.overloaded}개 권역에 Capa를 넘는 업무가 있습니다. 전체 인원이 충분해도 배치가 고르지 않으면 감당하지 못하는 일이 생깁니다.` : "모든 권역의 업무를 커버했습니다. 인력 여유와 가동률을 함께 보며 다음 수요 변화에 대비하세요."}</p>${finished ? `<p class="score-breakdown">${game.reports.map((r) => `${r.round}장 ${r.score}점`).join(" · ")}<br>이 결과는 게임 가정에 따른 훈련 결과입니다.</p>` : `<p>${free ? "다음 수요 상황" : "다음 장의 수요"}: <b>${esc(getRoundEvent(game).title)}</b><br>${esc(getRoundEvent(game).description)}</p>`}<div class="dialog-actions">${finished ? `<button class="action-button" data-dialog-action="export">훈련안 내보내기</button><button class="gold-button" data-dialog-action="close">결과 지도 살펴보기 →</button>` : free ? `<button class="gold-button" data-dialog-action="close">계속 자유롭게 실험하기 →</button>` : `<button class="gold-button" data-dialog-action="chapter">다음 장 브리핑 →</button>`}</div>`,
  );
}
function exportGame() {
  const scenario = exportTrainingScenario(game);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${scenario.scenarioName}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(
    "훈련안을 내보냈습니다. 업무 시뮬레이터의 불러오기에서 열 수 있습니다.",
  );
}
