import { GAME_MODES, restoreGame } from "./game-core.mjs";

export const SAVE_KEYS = {
  legacy: "fursys-territory-command-v1",
  open: "fursys-territory-command-v2-open",
  story: "fursys-territory-command-v2-story",
  tutorial: "fursys-territory-command-v2-tutorial",
  lastMode: "fursys-territory-command-last-mode",
  welcome: "fursys-territory-command-welcome-v2",
};

export function loadModeGame(
  data,
  source,
  mode,
  storage = globalThis.localStorage,
) {
  if (!Object.hasOwn(GAME_MODES, mode))
    throw new Error("게임 모드를 확인해 주세요.");
  const current = storage.getItem(SAVE_KEYS[mode]);
  const legacy =
    !current && mode === "open" ? storage.getItem(SAVE_KEYS.legacy) : null;
  if (!current && !legacy) return null;
  try {
    const game = restoreGame(data, source, JSON.parse(current || legacy));
    if (game.mode !== mode) throw new Error("저장 모드가 일치하지 않습니다.");
    if (legacy) storage.setItem(SAVE_KEYS.open, JSON.stringify(game));
    return game;
  } catch (error) {
    // Keep unreadable progress recoverable before a user starts a replacement game.
    try {
      storage.setItem(`${SAVE_KEYS[mode]}-recovery`, current || legacy);
    } catch {}
    throw error;
  }
}

export function saveModeGame(game, storage = globalThis.localStorage) {
  storage.setItem(SAVE_KEYS[game.mode], JSON.stringify(game));
  storage.setItem(SAVE_KEYS.lastMode, game.mode);
}

export function lastMode(storage = globalThis.localStorage) {
  try {
    const mode = storage.getItem(SAVE_KEYS.lastMode);
    return Object.hasOwn(GAME_MODES, mode) ? mode : "open";
  } catch {
    return "open";
  }
}
