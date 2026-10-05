export const MATCH_PHASES = [
  "firstHalf",
  "secondHalf",
  "extraTimeFirst",
  "extraTimeSecond",
] as const;

export type MatchPhase = (typeof MATCH_PHASES)[number];
export type ClockStatus = "ready" | "running" | "paused" | "stopped";

export interface MatchSettings {
  halfLengthMinutes: number;
  hasExtraTime: boolean;
  extraTimeLengthMinutes: number;
  keepScreenAwake: boolean;
  trackStoppageTime: boolean;
  showRunningNotification: boolean;
}

export interface PauseRecord {
  phase: MatchPhase;
  matchTimeMs: number;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface MatchClockState {
  phase: MatchPhase;
  status: ClockStatus;
  elapsedMs: number;
  startedAt: number | null;
  pauseStartedAt: number | null;
  pauseMatchTimeMs: number | null;
  pausePhase: MatchPhase | null;
  pauses: PauseRecord[];
  timeLostMs: number;
  timeLostStartedAt: number | null;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  halfLengthMinutes: 45,
  hasExtraTime: false,
  extraTimeLengthMinutes: 15,
  keepScreenAwake: true,
  trackStoppageTime: false,
  showRunningNotification: true,
};

export function createMatchClock(): MatchClockState {
  return {
    phase: "firstHalf",
    status: "ready",
    elapsedMs: 0,
    startedAt: null,
    pauseStartedAt: null,
    pauseMatchTimeMs: null,
    pausePhase: null,
    pauses: [],
    timeLostMs: 0,
    timeLostStartedAt: null,
  };
}

export function getAvailablePhases(settings: MatchSettings): MatchPhase[] {
  return settings.hasExtraTime
    ? [...MATCH_PHASES]
    : ["firstHalf", "secondHalf"];
}

export function getPhaseLabel(phase: MatchPhase): string {
  switch (phase) {
    case "firstHalf":
      return "First half";
    case "secondHalf":
      return "Second half";
    case "extraTimeFirst":
      return "Extra time 1";
    case "extraTimeSecond":
      return "Extra time 2";
  }
}

export function getPhaseLengthMs(
  phase: MatchPhase,
  settings: MatchSettings,
): number {
  return (phase === "extraTimeFirst" || phase === "extraTimeSecond"
    ? settings.extraTimeLengthMinutes
    : settings.halfLengthMinutes) * 60_000;
}

export function getPhaseBaselineMs(
  phase: MatchPhase,
  settings: MatchSettings,
): number {
  switch (phase) {
    case "firstHalf":
      return 0;
    case "secondHalf":
      return settings.halfLengthMinutes * 60_000;
    case "extraTimeFirst":
      return settings.halfLengthMinutes * 2 * 60_000;
    case "extraTimeSecond":
      return (
        settings.halfLengthMinutes * 2 + settings.extraTimeLengthMinutes
      ) * 60_000;
  }
}

export function getPeriodElapsedMs(
  state: MatchClockState,
  now: number,
): number {
  const runningMs =
    state.status === "running" && state.startedAt !== null
      ? Math.max(0, now - state.startedAt)
      : 0;
  return state.elapsedMs + runningMs;
}

export function getMatchTimeMs(
  state: MatchClockState,
  settings: MatchSettings,
  now: number,
): number {
  return getPhaseBaselineMs(state.phase, settings) + getPeriodElapsedMs(state, now);
}

export function isStoppageTime(
  state: MatchClockState,
  settings: MatchSettings,
  now: number,
): boolean {
  return getPeriodElapsedMs(state, now) >= getPhaseLengthMs(state.phase, settings);
}

export function getTimeLostMs(state: MatchClockState, now: number): number {
  const activeTime =
    state.timeLostStartedAt === null
      ? 0
      : Math.max(0, now - state.timeLostStartedAt);
  return state.timeLostMs + activeTime;
}

export function startClock(state: MatchClockState, now: number): MatchClockState {
  if (state.status === "running" || state.status === "stopped") {
    return state;
  }

  if (state.status === "paused") {
    const pauseRecord =
      state.pauseStartedAt !== null &&
      state.pauseMatchTimeMs !== null &&
      state.pausePhase !== null
        ? [
            {
              phase: state.pausePhase,
              matchTimeMs: state.pauseMatchTimeMs,
              startedAt: state.pauseStartedAt,
              endedAt: Math.max(now, state.pauseStartedAt),
              durationMs: Math.max(0, now - state.pauseStartedAt),
            },
          ]
        : [];

    return {
      ...state,
      status: "running",
      startedAt: now,
      pauseStartedAt: null,
      pauseMatchTimeMs: null,
      pausePhase: null,
      pauses: [...state.pauses, ...pauseRecord],
    };
  }

  return { ...state, status: "running", startedAt: now };
}

export function pauseClock(
  state: MatchClockState,
  settings: MatchSettings,
  now: number,
): MatchClockState {
  if (state.status !== "running") {
    return state;
  }

  const elapsedMs = getPeriodElapsedMs(state, now);
  return {
    ...state,
    status: "paused",
    elapsedMs,
    startedAt: null,
    pauseStartedAt: now,
    pauseMatchTimeMs: getPhaseBaselineMs(state.phase, settings) + elapsedMs,
    pausePhase: state.phase,
    timeLostMs: getTimeLostMs(state, now),
    timeLostStartedAt: null,
  };
}

export function stopClock(
  state: MatchClockState,
  now: number,
): MatchClockState {
  if (state.status === "ready" || state.status === "stopped") {
    return state;
  }

  const elapsedMs = getPeriodElapsedMs(state, now);
  const pauseRecord =
    state.status === "paused" &&
    state.pauseStartedAt !== null &&
    state.pauseMatchTimeMs !== null &&
    state.pausePhase !== null
      ? [
          {
            phase: state.pausePhase,
            matchTimeMs: state.pauseMatchTimeMs,
            startedAt: state.pauseStartedAt,
            endedAt: Math.max(now, state.pauseStartedAt),
            durationMs: Math.max(0, now - state.pauseStartedAt),
          },
        ]
      : [];

  return {
    ...state,
    status: "stopped",
    elapsedMs,
    startedAt: null,
    pauseStartedAt: null,
    pauseMatchTimeMs: null,
    pausePhase: null,
    pauses: [...state.pauses, ...pauseRecord],
    timeLostMs: getTimeLostMs(state, now),
    timeLostStartedAt: null,
  };
}

export function resetClock(): MatchClockState {
  return createMatchClock();
}

export function selectPhase(
  state: MatchClockState,
  phase: MatchPhase,
): MatchClockState {
  if (state.status === "running" || state.status === "stopped") {
    return state;
  }
  return { ...state, phase, elapsedMs: 0, startedAt: null };
}

export function setMatchTime(
  state: MatchClockState,
  settings: MatchSettings,
  matchTimeMs: number,
  now: number,
): MatchClockState | null {
  const elapsedMs = matchTimeMs - getPhaseBaselineMs(state.phase, settings);
  if (!Number.isFinite(matchTimeMs) || elapsedMs < 0) {
    return null;
  }

  return {
    ...state,
    elapsedMs,
    startedAt: state.status === "running" ? now : null,
  };
}

export function startTimeLostTracking(
  state: MatchClockState,
  now: number,
): MatchClockState {
  if (state.status !== "running" || state.timeLostStartedAt !== null) {
    return state;
  }
  return { ...state, timeLostStartedAt: now };
}

export function finishTimeLostTracking(
  state: MatchClockState,
  now: number,
): MatchClockState {
  if (state.timeLostStartedAt === null) {
    return state;
  }
  return {
    ...state,
    timeLostMs: getTimeLostMs(state, now),
    timeLostStartedAt: null,
  };
}

export function formatClockTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
