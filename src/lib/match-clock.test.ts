import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  createMatchClock,
  formatClockTime,
  getMatchTimeMs,
  getPhaseBaselineMs,
  getPeriodElapsedMs,
  getTimeLostMs,
  isStoppageTime,
  pauseClock,
  selectPhase,
  setMatchTime,
  startClock,
  startTimeLostTracking,
  stopClock,
} from "./match-clock";

describe("match clock periods", () => {
  it("uses configured period lengths to calculate cumulative baselines", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      halfLengthMinutes: 40,
      hasExtraTime: true,
      extraTimeLengthMinutes: 10,
    };

    expect(getPhaseBaselineMs("firstHalf", settings)).toBe(0);
    expect(getPhaseBaselineMs("secondHalf", settings)).toBe(40 * 60_000);
    expect(getPhaseBaselineMs("extraTimeFirst", settings)).toBe(80 * 60_000);
    expect(getPhaseBaselineMs("extraTimeSecond", settings)).toBe(90 * 60_000);
  });

  it("continues beyond a period limit without stopping and marks stoppage time", () => {
    const settings = { ...DEFAULT_SETTINGS, halfLengthMinutes: 40 };
    const started = startClock(createMatchClock(), 1_000);
    const limit = 40 * 60_000;

    expect(isStoppageTime(started, settings, 1_000 + limit - 1)).toBe(false);
    expect(isStoppageTime(started, settings, 1_000 + limit)).toBe(true);
    expect(getPeriodElapsedMs(started, 1_000 + limit + 5_000)).toBe(
      limit + 5_000,
    );
  });

  it("starts a selected next period at its cumulative baseline", () => {
    const settings = { ...DEFAULT_SETTINGS, halfLengthMinutes: 40 };
    const secondHalf = selectPhase(createMatchClock(), "secondHalf");

    expect(getMatchTimeMs(secondHalf, settings, 0)).toBe(40 * 60_000);
  });

  it("freezes during pauses, logs the pause, and resumes from the saved elapsed time", () => {
    const settings = { ...DEFAULT_SETTINGS, halfLengthMinutes: 40 };
    const started = startClock(createMatchClock(), 10_000);
    const paused = pauseClock(started, settings, 25_000);

    expect(getPeriodElapsedMs(paused, 90_000)).toBe(15_000);

    const resumed = startClock(paused, 55_000);
    expect(resumed.pauses).toEqual([
      {
        phase: "firstHalf",
        matchTimeMs: 15_000,
        startedAt: 25_000,
        endedAt: 55_000,
        durationMs: 30_000,
      },
    ]);
    expect(getPeriodElapsedMs(resumed, 60_000)).toBe(20_000);
  });

  it("corrects displayed match time without changing the selected phase", () => {
    const settings = DEFAULT_SETTINGS;
    const secondHalf = selectPhase(createMatchClock(), "secondHalf");
    const corrected = setMatchTime(secondHalf, settings, 48 * 60_000 + 5_000, 7_000);

    expect(corrected).not.toBeNull();
    expect(getMatchTimeMs(corrected!, settings, 7_000)).toBe(
      48 * 60_000 + 5_000,
    );
    expect(
      setMatchTime(secondHalf, settings, 44 * 60_000, 7_000),
    ).toBeNull();
  });

  it("accumulates held time separately from the match clock", () => {
    const running = startClock(createMatchClock(), 1_000);
    const tracking = startTimeLostTracking(running, 3_000);

    expect(getTimeLostMs(tracking, 8_000)).toBe(5_000);
    expect(getPeriodElapsedMs(tracking, 8_000)).toBe(7_000);
  });

  it("stops at the current match time and keeps the final elapsed time", () => {
    const running = startClock(createMatchClock(), 2_000);
    const stopped = stopClock(running, 8_000);

    expect(stopped.status).toBe("stopped");
    expect(stopped.elapsedMs).toBe(6_000);
    expect(getPeriodElapsedMs(stopped, 30_000)).toBe(6_000);
  });

  it("formats total minutes without wrapping at an hour", () => {
    expect(formatClockTime(65 * 60_000 + 9_000)).toBe("65:09");
  });
});
