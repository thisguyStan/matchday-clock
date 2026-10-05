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
  stopBreakClock,
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

  it("corrects the displayed time in a selected phase", () => {
    const settings = DEFAULT_SETTINGS;
    const secondHalf = selectPhase(createMatchClock(), "secondHalf");
    const corrected = setMatchTime(
      secondHalf,
      settings,
      "firstHalf",
      48 * 60_000 + 5_000,
      7_000,
    );

    expect(corrected).not.toBeNull();
    expect(corrected?.phase).toBe("firstHalf");
    expect(getMatchTimeMs(corrected!, settings, 7_000)).toBe(
      48 * 60_000 + 5_000,
    );
    expect(
      setMatchTime(secondHalf, settings, "secondHalf", 44 * 60_000, 7_000),
    ).toBeNull();
  });

  it("resets tracked lost time when correcting to a different phase", () => {
    const settings = DEFAULT_SETTINGS;
    const tracking = startTimeLostTracking(
      startClock(createMatchClock(), 1_000),
      2_000,
    );
    const corrected = setMatchTime(
      tracking,
      settings,
      "secondHalf",
      45 * 60_000,
      5_000,
    );

    expect(corrected?.timeLostMs).toBe(0);
    expect(corrected?.timeLostStartedAt).toBeNull();
    expect(getTimeLostMs(corrected!, 10_000)).toBe(0);
  });

  it("accumulates held time separately from the match clock", () => {
    const running = startClock(createMatchClock(), 1_000);
    const tracking = startTimeLostTracking(running, 3_000);

    expect(getTimeLostMs(tracking, 8_000)).toBe(5_000);
    expect(getPeriodElapsedMs(tracking, 8_000)).toBe(7_000);
  });

  it("advances to the next period and runs an independently stoppable break clock", () => {
    const settings = DEFAULT_SETTINGS;
    const running = startTimeLostTracking(
      startClock(createMatchClock(), 2_000),
      3_000,
    );
    const onBreak = stopClock(
      running,
      settings,
      true,
      45 * 60_000 + 2_000,
    );

    expect(onBreak.phase).toBe("secondHalf");
    expect(onBreak.status).toBe("break");
    expect(onBreak.elapsedMs).toBe(0);
    expect(onBreak.timeLostMs).toBe(0);
    expect(onBreak.timeLostStartedAt).toBeNull();
    expect(onBreak.pauseStartedAt).toBe(45 * 60_000 + 2_000);

    const stoppedBreak = stopBreakClock(onBreak, 47 * 60_000 + 2_000);
    expect(stoppedBreak.status).toBe("ready");
    expect(stoppedBreak.pauses.at(-1)).toMatchObject({
      phase: "firstHalf",
      matchTimeMs: 45 * 60_000,
      durationMs: 2 * 60_000,
    });
    expect(getMatchTimeMs(stoppedBreak, settings, 50 * 60_000)).toBe(
      45 * 60_000,
    );
  });

  it("advances without starting a break clock when break tracking is disabled", () => {
    const running = startClock(createMatchClock(), 2_000);
    const nextPeriod = stopClock(
      running,
      DEFAULT_SETTINGS,
      false,
      45 * 60_000 + 2_000,
    );

    expect(nextPeriod.phase).toBe("secondHalf");
    expect(nextPeriod.status).toBe("ready");
    expect(nextPeriod.pauseStartedAt).toBeNull();
    expect(nextPeriod.pauses).toHaveLength(0);
    expect(getMatchTimeMs(nextPeriod, DEFAULT_SETTINGS, 50 * 60_000)).toBe(
      45 * 60_000,
    );
  });

  it("stops permanently after the final configured period", () => {
    const running = startClock(createMatchClock(), 0);
    const firstHalf = stopClock(
      running,
      DEFAULT_SETTINGS,
      false,
      45 * 60_000,
    );
    const secondHalf = startClock(firstHalf, 50 * 60_000);
    const finished = stopClock(
      secondHalf,
      DEFAULT_SETTINGS,
      false,
      95 * 60_000,
    );

    expect(finished.status).toBe("stopped");
    expect(finished.phase).toBe("secondHalf");
    expect(getMatchTimeMs(finished, DEFAULT_SETTINGS, 120 * 60_000)).toBe(
      90 * 60_000,
    );
  });

  it("advances through both extra-time periods before finishing", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hasExtraTime: true,
      extraTimeLengthMinutes: 10,
    };
    let match = createMatchClock();
    const periodLengths = [45, 45, 10, 10];
    const phases = [
      "firstHalf",
      "secondHalf",
      "extraTimeFirst",
      "extraTimeSecond",
    ] as const;
    let now = 0;

    for (const [index, periodLength] of periodLengths.entries()) {
      match = startClock(match, now);
      now += periodLength * 60_000;
      match = stopClock(match, settings, false, now);
      expect(match.phase).toBe(phases[index + 1] ?? phases[index]);
    }

    expect(match.status).toBe("stopped");
    expect(match.phase).toBe("extraTimeSecond");
    expect(getMatchTimeMs(match, settings, now + 10_000)).toBe(
      110 * 60_000,
    );
  });

  it("formats total minutes without wrapping at an hour", () => {
    expect(formatClockTime(65 * 60_000 + 9_000)).toBe("65:09");
  });
});
