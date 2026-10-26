import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { APP_DATA } from "./app/data.mjs";
import {
  SAVE_KEYS,
  loadModeGame,
  saveModeGame,
  lastMode,
} from "./app/game-saves.mjs";
import {
  createGame,
  applyCommand,
  evaluateGame,
  resolveRound,
  undoCommand,
  restoreGame,
  advanceTutorial,
  retryRound,
  getObjectives,
  canResolveRound,
  getRoundEvent,
} from "./app/game-core.mjs";
const source = JSON.parse(
  await fs.readFile(
    new URL("./data/saved_scenarios.json", import.meta.url),
    "utf8",
  ),
)["권역조정4(8월 버전)"];
const original = JSON.stringify(source);
const support = { type: "staff", from: "t_lee_hyeonseok", to: "t_kim_yonghun" };
const transfer = { type: "region", regionId: "11410", to: "t_lee_hyeonseok" };

let open = createGame(APP_DATA, source, { mode: "open" });
assert.equal(open.points, null, "open mode must have unlimited commands");
for (let i = 0; i < 20; i++)
  open = applyCommand(
    APP_DATA,
    open,
    i % 2
      ? { type: "staff", from: "t_kim_yonghun", to: "t_lee_hyeonseok" }
      : support,
  );
assert.equal(open.points, null);
assert.equal(open.staff.t_kim_yonghun, 8);
for (let i = 0; i < 5; i++) open = resolveRound(APP_DATA, open);
assert.equal(open.round, 6);
assert.equal(open.finished, false);
assert.equal(getRoundEvent(open).tag, "경기 +10%");
assert.equal(restoreGame(APP_DATA, source, open).round, 6);

let tutorial = createGame(APP_DATA, source, { mode: "tutorial" });
assert.throws(() => advanceTutorial(tutorial));
assert.throws(() => applyCommand(APP_DATA, tutorial, transfer));
tutorial = applyCommand(APP_DATA, tutorial, support);
assert.equal(tutorial.tutorialStep, 1);
assert.throws(() => applyCommand(APP_DATA, tutorial, support));
assert.equal(undoCommand(tutorial).tutorialStep, 0);
tutorial = advanceTutorial(restoreGame(APP_DATA, source, tutorial));
assert.equal(tutorial.tutorialStep, 2);
assert.throws(() =>
  applyCommand(APP_DATA, tutorial, { ...transfer, regionId: "11110" }),
);
tutorial = applyCommand(APP_DATA, tutorial, transfer);
assert.equal(tutorial.tutorialStep, 3);
assert.equal(tutorial.assignments["11410"], "t_lee_hyeonseok");
tutorial = advanceTutorial(tutorial);
assert.equal(tutorial.finished, true);
assert.equal(tutorial.tutorialStep, 4);
assert.throws(() => resolveRound(APP_DATA, tutorial));
assert.equal(restoreGame(APP_DATA, source, tutorial).tutorialStep, 4);

let story = createGame(APP_DATA, source, { mode: "story" });
assert.equal(canResolveRound(APP_DATA, story), false);
assert.throws(() => resolveRound(APP_DATA, story), /목표/);
assert.equal(getObjectives(APP_DATA, story).length, 3);
const changed = applyCommand(APP_DATA, story, support);
assert.equal(
  getObjectives(APP_DATA, changed).find((o) => o.id === "support").passed,
  true,
);
assert.equal(
  getObjectives(APP_DATA, undoCommand(changed)).find((o) => o.id === "support")
    .passed,
  false,
);
const retried = retryRound(changed);
assert.deepEqual(retried.staff, story.staff);
assert.equal(retried.points, 6);
assert.equal(retried.actions.length, 0);
assert.equal(retried.undoStack.length, 0);

const staff = (from, to) => ({ type: "staff", from, to });
const play = (commands) => {
  for (const command of commands)
    story = applyCommand(APP_DATA, story, command);
};
play([
  support,
  staff("reserve", "t_kim_yonghun"),
  staff("reserve", "t_lee_jeongil"),
  staff("reserve", "t_kim_jeonghun"),
]);
assert.equal(
  canResolveRound(APP_DATA, story),
  true,
  "chapter1 must be achievable through real commands",
);
story = resolveRound(APP_DATA, story);
assert.equal(story.round, 2);
assert.equal(story.points, 6);
const checkpoint = structuredClone(story);
play([
  staff("t_shin_seunghyeon", "t_lee_hyeonseok"),
  transfer,
  staff("t_shin_seunghyeon", "t_kim_jeonghun"),
]);
assert.equal(
  canResolveRound(APP_DATA, story),
  true,
  "chapter2 must be achievable through real commands",
);
assert.deepEqual(retryRound(story).staff, checkpoint.staff);
story = resolveRound(APP_DATA, story);
play([staff("t_kim_jeonghun", "t_shin_seunghyeon")]);
assert.equal(
  canResolveRound(APP_DATA, story),
  true,
  "chapter3 must be achievable through real commands",
);
assert.equal(evaluateGame(APP_DATA, story).overloaded, 0);
story = resolveRound(APP_DATA, story);
assert.equal(story.finished, true);
assert.equal(story.reports.length, 3);
assert.ok(story.reports.every((r) => r.objectives.every((o) => o.passed)));
assert.throws(() => applyCommand(APP_DATA, story, support));
assert.equal(restoreGame(APP_DATA, source, story).finished, true);
const brokenReport = structuredClone(story);
brokenReport.reports[2].objectives = {};
assert.throws(() => restoreGame(APP_DATA, source, brokenReport), /목표/);
brokenReport.reports[2].objectives = [null];
assert.throws(() => restoreGame(APP_DATA, source, brokenReport), /목표/);

const legacy = createGame(APP_DATA, source, { mode: "open" });
legacy.version = 1;
delete legacy.mode;
legacy.round = 2;
legacy.points = 5;
legacy.finished = false;
legacy.staff.t_kim_yonghun++;
legacy.staff.t_lee_hyeonseok--;
legacy.reports = [
  {
    round: 1,
    score: 92,
    coverage: 92.7,
    balance: 90,
    efficiency: 94,
    overloaded: 3,
  },
];
legacy.undoStack = [];
const migrated = restoreGame(APP_DATA, source, legacy);
assert.equal(migrated.mode, "open");
assert.equal(migrated.points, null);
assert.equal(migrated.staff.t_kim_yonghun, 9);
assert.equal(migrated.reports.length, 1);
const storage = {
  values: new Map(),
  getItem(key) {
    return this.values.get(key) ?? null;
  },
  setItem(key, value) {
    this.values.set(key, String(value));
  },
};
const legacyJson = JSON.stringify(legacy);
storage.setItem(SAVE_KEYS.legacy, legacyJson);
assert.equal(
  loadModeGame(APP_DATA, source, "open", storage).staff.t_kim_yonghun,
  9,
);
assert.equal(
  storage.getItem(SAVE_KEYS.legacy),
  legacyJson,
  "migration must preserve the old save verbatim",
);
saveModeGame(story, storage);
saveModeGame(tutorial, storage);
assert.equal(lastMode(storage), "tutorial");
assert.equal(
  loadModeGame(APP_DATA, source, "open", storage).staff.t_kim_yonghun,
  9,
  "story/tutorial must not overwrite open progress",
);
assert.equal(loadModeGame(APP_DATA, source, "story", storage).finished, true);
assert.equal(
  loadModeGame(APP_DATA, source, "tutorial", storage).tutorialStep,
  4,
);
storage.setItem(SAVE_KEYS.story, "{broken-save");
assert.throws(() => loadModeGame(APP_DATA, source, "story", storage));
assert.equal(
  storage.getItem(`${SAVE_KEYS.story}-recovery`),
  "{broken-save",
  "invalid save must remain recoverable",
);
storage.setItem(SAVE_KEYS.lastMode, "constructor");
assert.equal(lastMode(storage), "open");
assert.throws(() =>
  restoreGame(APP_DATA, source, { ...tutorial, tutorialStep: 99 }),
);
assert.throws(() =>
  restoreGame(APP_DATA, source, { ...open, mode: "unknown" }),
);
assert.throws(() =>
  restoreGame(APP_DATA, source, {
    ...story,
    checkpoint: { ...story.checkpoint, reserves: 99 },
  }),
);
assert.equal(JSON.stringify(source), original);
console.log(
  JSON.stringify({
    tests: "PASS",
    suite: "game-modes",
    storyChapters: 3,
    tutorialActions: 2,
    openTurns: 6,
  }),
);
