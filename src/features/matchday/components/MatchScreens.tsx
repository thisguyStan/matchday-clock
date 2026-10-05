import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  formatClockTime,
  getPhaseBaselineMs,
  type ClockStatus,
  type MatchClockState,
  type MatchSettings,
} from "../../../utils/match-clock";
import {
  phaseLabel,
  pauseSummary,
} from "../../../utils/formatting";
import type {
  LocaleMessages,
  MessageKey,
  Translator,
} from "../../../utils/i18n";

interface MatchScreensProps {
  hasMatch: boolean;
  settings: MatchSettings;
  match: MatchClockState;
  settingsSummary: string;
  statusLabel: Record<ClockStatus, string>;
  messages: LocaleMessages | null;
  t: Translator;
  matchTimeMs: number;
  periodElapsedMs: number;
  timeLostMs: number;
  stoppageTime: boolean;
  running: boolean;
  breakRunning: boolean;
  activeClock: boolean;
  pauseDurationNow: number | null;
  wakeStatus: MessageKey;
  presetCount: number;
  onOpenPresetPicker: () => void;
  onUseLastSettings: () => void;
  onOpenSetup: () => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onCorrectTime: () => void;
  onBeginTracking: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEndTracking: () => void;
  onTrackingKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onTrackingKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

export function MatchScreens({
  hasMatch,
  settings,
  match,
  settingsSummary,
  statusLabel,
  messages,
  t,
  matchTimeMs,
  periodElapsedMs,
  timeLostMs,
  stoppageTime,
  running,
  breakRunning,
  activeClock,
  pauseDurationNow,
  wakeStatus,
  presetCount,
  onOpenPresetPicker,
  onUseLastSettings,
  onOpenSetup,
  onStart,
  onPause,
  onStop,
  onReset,
  onCorrectTime,
  onBeginTracking,
  onEndTracking,
  onTrackingKeyDown,
  onTrackingKeyUp,
}: MatchScreensProps) {
  return (
    <main
      className={`app-main mx-auto w-full max-w-[1120px] px-4 pb-8 sm:px-7 sm:pb-10${hasMatch ? " is-clock" : " is-launch"}`}
    >
      {!hasMatch ? (
        <section className="launch-panel panel" aria-labelledby="launch-title">
          <div className="launch-copy">
            <p className="eyebrow">{t("appSubtitle")}</p>
            <h1 id="launch-title">{t("launchTitle")}</h1>
            <p>{t("launchDescription")}</p>
          </div>
          <div className="launch-actions">
            <div className="split-start">
              <button
                aria-haspopup="dialog"
                aria-label={t("choosePreset")}
                className="preset-dropdown-trigger"
                onClick={onOpenPresetPicker}
                title={t("choosePreset")}
                type="button"
              >
                <span aria-hidden="true">⌄</span>
              </button>
              <button
                className="primary-start-button"
                onClick={onUseLastSettings}
                type="button"
              >
                <span>{t("useLastSettings")}</span>
                <small>{settingsSummary}</small>
              </button>
            </div>
            <button
              className="secondary-start-button"
              onClick={onOpenSetup}
              type="button"
            >
              <span aria-hidden="true">＋</span>
              {t("setUpMatch")}
            </button>
          </div>
          {presetCount > 0 && (
            <p className="saved-preset-count">
              {t("savedPresetCount", { count: presetCount })}
            </p>
          )}
        </section>
      ) : (
        <section className="clock-card active-match" aria-labelledby="clock-heading">
          <div className="clock-card-top">
            <div>
              <p className="eyebrow">{t("timer")}</p>
              <h1 id="clock-heading" className="clock-phase-title">
                {phaseLabel(match.phase, messages)}
              </h1>
            </div>
            <span className={`status-pill status-${match.status}`}>
              <span className="status-dot" />
              {statusLabel[match.status]}
            </span>
          </div>

          <div className="clock-readout-wrap">
            <div
              aria-label={`${phaseLabel(match.phase, messages)}, ${formatClockTime(matchTimeMs)}${stoppageTime ? `, ${t("stoppage")}` : ""}`}
              aria-live="off"
              className={`clock-readout${stoppageTime ? " is-stoppage" : ""}`}
              role="timer"
            >
              {formatClockTime(matchTimeMs)}
            </div>
            <div className="clock-meta-row">
              {stoppageTime ? (
                <span className="stoppage-indicator">
                  <span className="stoppage-dot" />
                  {t("stoppage")}
                </span>
              ) : (
                <span className="period-limit">
                  {t("periodLimit", {
                    time: formatClockTime(
                      getPhaseBaselineMs(match.phase, settings) +
                        (match.phase.startsWith("extraTime")
                          ? settings.extraTimeLengthMinutes
                          : settings.halfLengthMinutes) *
                          60_000 -
                        getPhaseBaselineMs(match.phase, settings),
                    ),
                  })}
                </span>
              )}
              <span className="elapsed-caption">
                {match.status === "paused" && pauseDurationNow !== null
                  ? t("pausedFor", {
                      time: formatClockTime(pauseDurationNow),
                    })
                  : t("thisPeriod", {
                      time: formatClockTime(periodElapsedMs),
                    })}
              </span>
            </div>
          </div>

          {breakRunning && pauseDurationNow !== null && (
            <div className="break-clock" role="timer">
              <span>{t("breakTime")}</span>
              <strong>{formatClockTime(pauseDurationNow)}</strong>
            </div>
          )}

          {running && settings.trackStoppageTime && (
            <button
              aria-label={`${t("timeLostHold")}: ${formatClockTime(timeLostMs)}`}
              aria-pressed={match.timeLostStartedAt !== null}
              className={`hold-tracker${match.timeLostStartedAt !== null ? " is-tracking" : ""}`}
              onBlur={onEndTracking}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={onTrackingKeyDown}
              onKeyUp={onTrackingKeyUp}
              onLostPointerCapture={onEndTracking}
              onPointerCancel={onEndTracking}
              onPointerDown={onBeginTracking}
              onPointerUp={onEndTracking}
              type="button"
            >
              <span aria-hidden="true" className="hold-icon">
                {match.timeLostStartedAt !== null ? "●" : "◉"}
              </span>
              <span className="hold-copy">
                <strong>
                  {match.timeLostStartedAt !== null
                    ? t("timeLostTracking")
                    : t("timeLostHold")}
                </strong>
                <small>
                  {t("timeLostTotal", { time: formatClockTime(timeLostMs) })}
                </small>
              </span>
              <span aria-hidden="true" className="hold-value">
                {formatClockTime(timeLostMs)}
              </span>
            </button>
          )}

          <div aria-label={t("controlsAria")} className="clock-controls">
            <button
              aria-label={
                running
                  ? t("pause")
                  : t(match.status === "paused" ? "resume" : "start")
              }
              className="control-button control-start"
              disabled={match.status === "stopped"}
              onClick={running ? onPause : onStart}
              type="button"
            >
              <span aria-hidden="true" className="button-symbol">
                {running ? "Ⅱ" : "▶"}
              </span>
              <span className="button-label">
                {running
                  ? t("pause")
                  : t(match.status === "paused" ? "resume" : "start")}
              </span>
            </button>
            <button
              aria-label={breakRunning ? t("stopBreak") : t("stop")}
              className="control-button control-stop"
              disabled={match.status === "ready" || match.status === "stopped"}
              onClick={onStop}
              type="button"
            >
              <span aria-hidden="true" className="button-symbol">
                ■
              </span>
              <span className="button-label">
                {breakRunning ? t("stopBreak") : t("stop")}
              </span>
            </button>
            <button
              aria-label={t("reset")}
              className="control-button control-reset"
              onClick={onReset}
              type="button"
            >
              <span aria-hidden="true" className="button-symbol">
                ↺
              </span>
              <span className="button-label">{t("reset")}</span>
            </button>
          </div>

          <div className="clock-utilities">
            <button
              className="text-button correction-trigger"
              onClick={onCorrectTime}
              type="button"
            >
              <span aria-hidden="true">✎</span>
              {t("correctTime")}
            </button>
          </div>

          <div className="clock-footer">
            <div className="wake-status" aria-live="polite">
              <span
                className={`wake-icon${activeClock && settings.keepScreenAwake ? " wake-active" : ""}`}
              >
                ◉
              </span>
              <span>{t(wakeStatus)}</span>
            </div>
            <div className="match-total">
              {pauseSummary(match.pauses, pauseDurationNow, messages)}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
