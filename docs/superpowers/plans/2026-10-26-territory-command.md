# Territory Command prototype implementation plan

> **For agentic workers:** Implement inline under the user's explicit request to make a first playable game. This is a prototype; do not pause for another design approval.

**Goal:** Train workload and staff balancing using 권역조정4(8월 버전).

**Architecture:** A separate game.html entry preserves the existing simulator. A pure game-core module consumes the published scenario, calculates scores, validates commands, and serializes game progress; an SVG renderer projects real regions into a 2.5D board with generated decorative art.

**Tech Stack:** Existing native JavaScript modules, SVG, CSS; no additional runtime dependencies.

**Spec:** User request in this conversation, 2026-10-26: balance territory workload and staff, make a game based on the August scenario, preferably 2.5D using another model.

## Global constraints

- Annual 2025 normal installation cost is the workload proxy, not order counts or observed monthly demand.
- Default annual capacity per person is an editable training assumption of 50 million KRW, not an established staffing standard.
- Start with 46 simulated assigned staff and 3 reserves; 3 rounds, 6 commands each.
- Play only the 85 assigned regions; 165 unassigned regions remain outside the training scope.
- Preserve original scenarios and source money amounts. Browser game saves use a separate storage key.
- Publish through the configured GitHub Pages workflow after verification.

## Review focus

- Invalid commands cannot spend points or corrupt assignments.
- All commands conserve total staff including reserves; occupied territories with zero staff produce zero coverage.
- Reloaded saves must have valid territory IDs, finite numeric values, original scope, and a valid round.
- Export restores the simulator's version-1 scenario contract and marks training assumptions.
- A finished campaign cannot spend commands or resolve a fourth round.

### Task 1: Pure training engine

Files: app/game-core.mjs, test_game.mjs.

Interfaces: createGame(data, scenario, options), evaluateGame(data, game), applyCommand(data, game, command), resolveRound(data, game), restoreGame(data, scenario, saved), exportTrainingScenario(game).

- [x] Add behavior tests for known capacity/coverage arithmetic, staff conservation, assignment conservation, point limits, undo, rounds, malformed saves, and export contract; run RED.
- [x] Implement immutable engine and run GREEN, plus existing app tests.

### Task 2: Playable 2.5D experience

Files: app/game.html, app/game.css, app/game.mjs, app/assets/territory-command.png, app/index.html.

- [x] Build a responsive command room with real SVG region boundaries, height/shadow, map pan/zoom, commander roster, region transfer and staffing actions.
- [x] Add visible assumptions, advisor explanations, turn report, undo, browser save/resume, training JSON export, and accessible dialogs.
- [x] Link the mode from the original simulator; keep original scenario state isolated.

### Task 3: Verify and ship

- [x] Run engine and existing app/storage tests. Verify real UI gameplay, reload, dialog, map, report and export on desktop and narrow viewport.
- [x] Obtain a fresh review, fix important findings, and document art provenance and assumptions.
- [x] Commit, fast-forward main, push, confirm Pages deployment and external game route.

## Verification record

- `node test_game.mjs`, `node test_app.mjs`, and `node test_scenario_storage_endpoint.mjs`: PASS.
- Browser: native map selection, panning without selection, heatmap toggle, support transfer, save/reload, undo, region transfer, rules dialog, three-round campaign, JSON download, and 390px horizontal layout: PASS. Console: zero errors/warnings.
- Downloaded training JSON passes original simulator validateScenario with 250 assignments and 10 territories. Source saved_scenarios.json unchanged.
- Fresh gpt-6-astra review: two confirmed important issues (heatmap handler and untrusted undo fields) and one pointer-capture concern. Fixed all three. Undo regression observed RED (round 99), then GREEN. Real captured pointer and heatmap interaction observed failing before fixes and passing after.
- Review set aside visual/mobile, live deployment, and actual staffing accuracy. Visual/mobile verified by the implementer in the real browser; live deployment is the final delivery check; staffing accuracy remains explicitly a training assumption in the UI.
- Delivery: implementation commit ecbb114 pushed to main. GitHub Pages run 40266094224 completed successfully. Public game.html and generated art returned HTTP 200; real public-browser staffing command, save/reload, undo, heatmap, and all 85 regions passed; console had zero errors/warnings.
