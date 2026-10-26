# Game onboarding and modes

Implement the user's requested continuation of the playable prototype without an additional approval pause.

## Behavior

- First-visit introduction explains overload, workload, staff, and the two decisions in plain Korean, with a follow-along or direct mode selection action.
- Tutorial uses a separate fixed 50m annual capacity practice state: support 1 person from 이현석 to 김용훈, inspect before/after, transfer 서대문구 from 김정훈 to 이현석, inspect before/after, then choose a mode. Actual game controls execute the moves; instructions and highlights track completion and persist.
- Open mode has unlimited commands and turns, cycles the three demand conditions on request, and provides suggested rather than required goals.
- Story mode has three chapters, six commands per turn, concrete objectives, objective-gated advancement, hints, retry of the current chapter, and a final report.
- Chapter 1: support at least once, cover >=98%, overload <=1. Chapter 2: transfer a region at least once, cover >=99%, balance >=90. Chapter 3: cover100%, overload0, balance>=90.
- Open, story and tutorial use separate version-2 browser save keys; preserve and migrate the original version-1 game to open mode without deleting its storage or physical assignments/staff. Work scenarios remain untouched.
- Retry restores a beginning-of-chapter checkpoint, undo restores objective actions and tutorial stage, corrupt snapshots cannot overwrite unrelated fields.
- Fixed training assumptions in story/tutorial keep missions feasible; open mode retains editable capacity.

## Execution and verification

- [x] Add and run failing engine tests for open freedom, tutorial sequencing, story gates/retry, complete feasible story path, legacy migration and malformed saves.
- [x] Implement mode engine and separate persistence with tests green.
- [x] Add first-visit guide, mode chooser, tutorial coach/highlights, chapter briefs/objectives/retry and updated rules.
- [x] Verify real browser first visit, skip/replay tutorial, reload mid-tutorial, both guided commands, mode isolation, story objectives/retry and open fourth turn, narrow layout and console.
- [ ] Independent review, relevant regression tests, commit/push and public Pages verification.

## Evidence and review

- Engine and save tests: test_game.mjs and test_game_modes.mjs PASS. Source scenario remains unchanged. Real command path solves all three chapters.
- Browser: introduction/skip/replay, tutorial support and transfer, mid-tutorial reload, open 8 commands and 5 turns, chapter gates, hints, retry, three-chapter completion, separate mode saves and mobile dialogs PASS. Console: zero errors/warnings.
- Fresh gpt-6-astra review found malformed restored report objectives could break the final dialog. Regression observed RED (missing expected exception), then validation implemented and tests GREEN.
- Minor deferred: tutorial save stages are range-checked but not exhaustively reconciled with historic commands; open save rounds have a generous finite bound of 100000. Neither affects the verified normal-play flows.
- Review set aside visual/mobile behavior (verified separately above) and universal feasibility from every possible prior-chapter solution. Current chapters have a proven real-command solution, configurable hints, current-chapter retries and a full story restart.
