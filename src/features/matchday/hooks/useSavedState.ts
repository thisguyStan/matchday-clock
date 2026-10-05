import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  MATCH_PHASES,
  createMatchClock,
  type MatchClockState,
  type MatchPhase,
  type MatchSettings,
  type PauseRecord,
} from "../../../utils/match-clock";
import {
  DEFAULT_PREFERENCES,
  readSavedPreferences,
  type MessageKey,
  type UserPreferences,
} from "../../../utils/i18n";
import type { MatchPreset, PersistedMatchdayState } from "../types";

const STORAGE_KEY = "matchday-clock:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function isMatchPhase(value: unknown): value is MatchPhase {
  return (
    typeof value === "string" &&
    MATCH_PHASES.some((phase) => phase === value)
  );
}

function isPauseRecord(value: unknown): value is PauseRecord {
  return (
    isRecord(value) &&
    isMatchPhase(value.phase) &&
    typeof value.matchTimeMs === "number" &&
    Number.isFinite(value.matchTimeMs) &&
    value.matchTimeMs >= 0 &&
    typeof value.startedAt === "number" &&
    Number.isFinite(value.startedAt) &&
    value.startedAt >= 0 &&
    typeof value.endedAt === "number" &&
    Number.isFinite(value.endedAt) &&
    value.endedAt >= value.startedAt &&
    typeof value.durationMs === "number" &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0
  );
}

function isMatchSettings(value: unknown): value is MatchSettings {
  return (
    isRecord(value) &&
    typeof value.halfLengthMinutes === "number" &&
    Number.isInteger(value.halfLengthMinutes) &&
    value.halfLengthMinutes >= 1 &&
    value.halfLengthMinutes <= 180 &&
    typeof value.hasExtraTime === "boolean" &&
    typeof value.extraTimeLengthMinutes === "number" &&
    Number.isInteger(value.extraTimeLengthMinutes) &&
    value.extraTimeLengthMinutes >= 1 &&
    value.extraTimeLengthMinutes <= 180 &&
    typeof value.keepScreenAwake === "boolean" &&
    typeof value.trackStoppageTime === "boolean" &&
    typeof value.showRunningNotification === "boolean"
  );
}

function isMatchPreset(value: unknown): value is MatchPreset {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.halfLengthMinutes === "number" &&
    Number.isInteger(value.halfLengthMinutes) &&
    value.halfLengthMinutes >= 1 &&
    value.halfLengthMinutes <= 180 &&
    typeof value.hasExtraTime === "boolean" &&
    typeof value.extraTimeLengthMinutes === "number" &&
    Number.isInteger(value.extraTimeLengthMinutes) &&
    value.extraTimeLengthMinutes >= 1 &&
    value.extraTimeLengthMinutes <= 180
  );
}

function isMatchClockState(value: unknown): value is MatchClockState {
  if (
    !isRecord(value) ||
    !isMatchPhase(value.phase) ||
    (value.status !== "ready" &&
      value.status !== "running" &&
      value.status !== "paused" &&
      value.status !== "break" &&
      value.status !== "stopped") ||
    typeof value.elapsedMs !== "number" ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    !isNumberOrNull(value.startedAt) ||
    !isNumberOrNull(value.pauseStartedAt) ||
    !isNumberOrNull(value.pauseMatchTimeMs) ||
    (value.pausePhase !== null && !isMatchPhase(value.pausePhase)) ||
    !Array.isArray(value.pauses) ||
    !value.pauses.every(isPauseRecord) ||
    typeof value.timeLostMs !== "number" ||
    !Number.isFinite(value.timeLostMs) ||
    value.timeLostMs < 0 ||
    !isNumberOrNull(value.timeLostStartedAt)
  ) {
    return false;
  }

  if (
    (value.status === "running" && value.startedAt === null) ||
    (value.status !== "running" && value.startedAt !== null) ||
    ((value.status === "paused" || value.status === "break") &&
      (value.pauseStartedAt === null ||
        value.pauseMatchTimeMs === null ||
        value.pausePhase === null)) ||
    (value.status !== "paused" &&
      value.status !== "break" &&
      (value.pauseStartedAt !== null ||
        value.pauseMatchTimeMs !== null ||
        value.pausePhase !== null)) ||
    (value.timeLostStartedAt !== null && value.status !== "running")
  ) {
    return false;
  }

  return true;
}

function emptySavedState(): PersistedMatchdayState {
  return {
    settings: DEFAULT_SETTINGS,
    match: createMatchClock(),
    preferences: DEFAULT_PREFERENCES,
    presets: [],
    hasMatch: false,
    pauseClockEnabled: true,
    notice: null,
  };
}

function readSavedState(): PersistedMatchdayState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return emptySavedState();
    }

    const saved: unknown = JSON.parse(raw);
    if (
      isRecord(saved) &&
      isMatchSettings(saved.settings) &&
      isMatchClockState(saved.match)
    ) {
      const savedPreferences = readSavedPreferences(saved.preferences);
      const presetsValid =
        saved.presets === undefined ||
        (Array.isArray(saved.presets) && saved.presets.every(isMatchPreset));
      if (savedPreferences.invalid) {
        console.warn(
          "Saved display preferences are invalid; device settings are in use.",
        );
      }
      if (!presetsValid) {
        console.warn("Saved presets are invalid; no presets were restored.");
      }
      return {
        settings: saved.settings,
        match: saved.match,
        preferences: savedPreferences.preferences,
        presets: presetsValid
          ? (saved.presets as MatchPreset[] | undefined) ?? []
          : [],
        hasMatch: saved.hasMatch === true || saved.match.status !== "ready",
        pauseClockEnabled:
          typeof saved.pauseClockEnabled === "boolean"
            ? saved.pauseClockEnabled
            : true,
        notice: savedPreferences.invalid
          ? "savedPreferenceInvalid"
          : presetsValid
            ? null
            : "savedDataInvalid",
      };
    }

    console.warn("Saved match data is invalid; a fresh clock was loaded.");
    return { ...emptySavedState(), notice: "savedDataInvalid" };
  } catch (error) {
    console.error("Could not restore the saved match clock.", error);
    return { ...emptySavedState(), notice: "savedDataInvalid" };
  }
}

export function useSavedState() {
  const [saved] = useState(readSavedState);
  const [settings, setSettings] = useState(saved.settings);
  const [match, setMatch] = useState(saved.match);
  const [preferences, setPreferences] = useState<UserPreferences>(
    saved.preferences,
  );
  const [presets, setPresets] = useState(saved.presets);
  const [hasMatch, setHasMatch] = useState(saved.hasMatch);
  const [pauseClockEnabled, setPauseClockEnabled] = useState(
    saved.pauseClockEnabled,
  );
  const [storageError, setStorageError] = useState(false);
  const [savedNotice, setSavedNotice] = useState<MessageKey | null>(
    saved.notice,
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          settings,
          match,
          preferences,
          presets,
          hasMatch,
          pauseClockEnabled,
        }),
      );
      setStorageError(false);
    } catch (error) {
      console.error("Could not save the match clock locally.", error);
      setStorageError(true);
    }
  }, [
    hasMatch,
    match,
    pauseClockEnabled,
    preferences,
    presets,
    settings,
  ]);

  return {
    settings,
    setSettings,
    match,
    setMatch,
    preferences,
    setPreferences,
    presets,
    setPresets,
    hasMatch,
    setHasMatch,
    pauseClockEnabled,
    setPauseClockEnabled,
    storageError,
    savedNotice,
    setSavedNotice,
  };
}
