import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";
import {
  createGame,
  evaluateGame,
  applyCommand,
  undoCommand,
  resolveRound,
  restoreGame,
  exportTrainingScenario,
} from "./app/game-core.mjs";

const scenarios = JSON.parse(
  await fs.readFile(
    new URL("./data/saved_scenarios.json", import.meta.url),
    "utf8",
  ),
);
const source = scenarios["권역조정4(8월 버전)"];
const untouched = JSON.stringify(source);
const game = createGame(APP_DATA, source, { mode: "story" });
assert.equal(game.regionIds.length, 85);
assert.equal(
  Object.values(game.staff).reduce((a, b) => a + b, 0),
  46,
);
assert.equal(game.reserves, 3);
assert.equal(game.points, 6);
assert.equal(game.capacityPerPerson, 50_000_000);
const metrics = evaluateGame(APP_DATA, game);
assert.equal(
  metrics.territories.find((t) => t.id === "t_kim_yonghun").workload,
  459085529,
);
assert.equal(
  metrics.territories.find((t) => t.id === "t_kim_yonghun").capacity,
  400000000,
);
assert.equal(metrics.overloaded, 3);
assert.ok(metrics.coverage < 100);

const moved = applyCommand(APP_DATA, game, {
  type: "staff",
  from: "t_lee_hyeonseok",
  to: "t_kim_yonghun",
});
assert.equal(moved.staff.t_lee_hyeonseok, 9);
assert.equal(moved.staff.t_kim_yonghun, 9);
assert.equal(moved.points, 5);
assert.equal(
  game.staff.t_kim_yonghun,
  8,
  "commands must not mutate their input",
);
assert.equal(evaluateGame(APP_DATA, moved).totalStaff, 46);
assert.equal(undoCommand(moved).staff.t_kim_yonghun, 8);
assert.equal(undoCommand(moved).points, 6);

const hired = applyCommand(APP_DATA, game, {
  type: "staff",
  from: "reserve",
  to: "t_lee_jeongil",
});
assert.equal(hired.reserves, 2);
assert.equal(hired.staff.t_lee_jeongil, 3);
assert.equal(evaluateGame(APP_DATA, hired).totalStaff + hired.reserves, 49);
assert.throws(() =>
  applyCommand(APP_DATA, game, {
    type: "staff",
    from: "t_kim_hyeonseop",
    to: "t_kim_yonghun",
  }),
);
assert.throws(() =>
  applyCommand(APP_DATA, game, {
    type: "region",
    regionId: "11110",
    to: "unassigned",
  }),
);
assert.throws(() =>
  applyCommand(APP_DATA, game, {
    type: "region",
    regionId: "50110",
    to: "t_kim_yonghun",
  }),
);
const reassigned = applyCommand(APP_DATA, game, {
  type: "region",
  regionId: "11110",
  to: "t_lee_hyeonseok",
});
assert.equal(reassigned.assignments["11110"], "t_lee_hyeonseok");
assert.equal(
  evaluateGame(APP_DATA, reassigned).totalWorkload,
  metrics.totalWorkload,
);
assert.equal(Object.keys(reassigned.assignments).length, 250);
assert.throws(() =>
  applyCommand(
    APP_DATA,
    { ...game, points: 0 },
    { type: "staff", from: "reserve", to: "t_kim_yonghun" },
  ),
);

assert.throws(() => resolveRound(APP_DATA, moved), /목표/);
const freeGame = createGame(APP_DATA, source, { mode: "open" });
const next = resolveRound(APP_DATA, freeGame);
assert.equal(next.round, 2);
assert.equal(next.points, null);
assert.equal(next.reports.length, 1);
assert.equal(next.undoStack.length, 0);
assert.ok(evaluateGame(APP_DATA, next).totalWorkload > metrics.totalWorkload);
const continuing = resolveRound(APP_DATA, resolveRound(APP_DATA, next));
assert.equal(continuing.finished, false);
assert.equal(continuing.reports.length, 3);
assert.equal(continuing.round, 4);
assert.equal(
  restoreGame(APP_DATA, source, JSON.parse(JSON.stringify(moved))).staff
    .t_kim_yonghun,
  9,
);
const pollutedUndo = JSON.parse(JSON.stringify(moved));
pollutedUndo.undoStack[0].round = 99;
const safeUndo = undoCommand(restoreGame(APP_DATA, source, pollutedUndo));
assert.equal(
  safeUndo.round,
  1,
  "unvalidated snapshot keys must never overwrite game state",
);
assert.equal(evaluateGame(APP_DATA, safeUndo).totalStaff, 46);
assert.throws(() => restoreGame(APP_DATA, source, { ...game, reserves: -1 }));
assert.throws(() =>
  restoreGame(APP_DATA, source, {
    ...game,
    staff: { ...game.staff, t_kim_yonghun: 99 },
  }),
);
assert.throws(() =>
  restoreGame(APP_DATA, source, {
    ...game,
    assignments: { ...game.assignments, 11110: "unknown" },
  }),
);
assert.throws(() =>
  restoreGame(APP_DATA, source, { ...game, capacityPerPerson: Infinity }),
);

const exported = exportTrainingScenario(hired);
assert.equal(exported.version, 1);
assert.equal(
  exported.territories.find((t) => t.id === "t_lee_jeongil").staff,
  3,
);
assert.equal(
  exported.territories.find((t) => t.id === "t_lee_jeongil").capacityMetric,
  "installCost",
);
assert.equal(
  exported.territories.find((t) => t.id === "t_lee_jeongil").capacityPerPerson,
  50,
);
assert.equal(
  JSON.stringify(source),
  untouched,
  "source scenario must remain untouched",
);
console.log(
  JSON.stringify({
    tests: "PASS",
    suite: "territory-command",
    scope: 85,
    baselineOverloaded: metrics.overloaded,
  }),
);
