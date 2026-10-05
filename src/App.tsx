import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  DEFAULT_SETTINGS,
  MATCH_PHASES,
  createMatchClock,
  finishTimeLostTracking,
  formatClockTime,
  getAvailablePhases,
  getMatchTimeMs,
  getPeriodElapsedMs,
  getPhaseBaselineMs,
  getPhaseLabel,
  getTimeLostMs,
  isStoppageTime,
  pauseClock,
  resetClock,
  selectPhase,
  setMatchTime,
  startClock,
  startTimeLostTracking,
  stopClock,
  type ClockStatus,
  type MatchClockState,
  type MatchPhase,
  type MatchSettings,
  type PauseRecord,
} from "./lib/match-clock";

const STORAGE_KEY = "matchday-clock:v1";
const RUNNING_NOTIFICATION_TAG = "matchday-clock-running";

interface SavedState {
  settings: MatchSettings;
  match: MatchClockState;
  notice: string | null;
}

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

function isMatchClockState(value: unknown): value is MatchClockState {
  if (
    !isRecord(value) ||
    !isMatchPhase(value.phase) ||
    (value.status !== "ready" &&
      value.status !== "running" &&
      value.status !== "paused" &&
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
    (value.status === "paused" &&
      (value.pauseStartedAt === null ||
        value.pauseMatchTimeMs === null ||
        value.pausePhase === null)) ||
    (value.status !== "paused" &&
      (value.pauseStartedAt !== null ||
        value.pauseMatchTimeMs !== null ||
        value.pausePhase !== null)) ||
    (value.timeLostStartedAt !== null && value.status !== "running")
  ) {
    return false;
  }

  return true;
}

function readSavedState(): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return {
        settings: DEFAULT_SETTINGS,
        match: createMatchClock(),
        notice: null,
      };
    }

    const saved: unknown = JSON.parse(raw);
    if (
      isRecord(saved) &&
      isMatchSettings(saved.settings) &&
      isMatchClockState(saved.match)
    ) {
      return {
        settings: saved.settings,
        match: saved.match,
        notice: null,
      };
    }

    console.warn("Saved match data is invalid; a fresh clock was loaded.");
    return {
      settings: DEFAULT_SETTINGS,
      match: createMatchClock(),
      notice: "Saved match data could not be read, so a fresh clock was loaded.",
    };
  } catch (error) {
    console.error("Could not restore the saved match clock.", error);
    return {
      settings: DEFAULT_SETTINGS,
      match: createMatchClock(),
      notice: "Saved match data could not be read, so a fresh clock was loaded.",
    };
  }
}

function useSavedState() {
  const [saved] = useState(readSavedState);
  const [settings, setSettings] = useState(saved.settings);
  const [match, setMatch] = useState(saved.match);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(saved.notice);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, match }),
      );
      setStorageError(null);
    } catch (error) {
      console.error("Could not save the match clock locally.", error);
      setStorageError(
        "This browser could not save your match locally. Avoid refreshing or closing the app.",
      );
    }
  }, [match, settings]);

  return {
    settings,
    setSettings,
    match,
    setMatch,
    storageError,
    savedNotice,
    setSavedNotice,
  };
}

function formatPauseDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function phaseShortLabel(phase: MatchPhase): string {
  switch (phase) {
    case "firstHalf":
      return "1H";
    case "secondHalf":
      return "2H";
    case "extraTimeFirst":
      return "ET 1";
    case "extraTimeSecond":
      return "ET 2";
  }
}

function pauseSummary(
  pauses: PauseRecord[],
  currentPauseMs: number | null,
): string {
  const count = pauses.length + (currentPauseMs === null ? 0 : 1);
  if (count === 0) {
    return "No pauses recorded";
  }
  const totalMs =
    pauses.reduce((total, pause) => total + pause.durationMs, 0) +
    (currentPauseMs ?? 0);
  return `${count} ${count === 1 ? "pause" : "pauses"}${currentPauseMs === null ? " recorded" : " · 1 current"} · ${formatClockTime(totalMs)} paused`;
}

function App() {
  const {
    settings,
    setSettings,
    match,
    setMatch,
    storageError,
    savedNotice,
    setSavedNotice,
  } = useSavedState();
  const [now, setNow] = useState(() => Date.now());
  const [wakeStatus, setWakeStatus] = useState("Screen stay-awake is idle.");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [correctionMinutes, setCorrectionMinutes] = useState(() =>
    String(Math.floor(getMatchTimeMs(match, settings, Date.now()) / 60_000)),
  );
  const [correctionSeconds, setCorrectionSeconds] = useState(() =>
    String(Math.floor(getMatchTimeMs(match, settings, Date.now()) / 1_000) % 60),
  );
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const availablePhases = useMemo(
    () => getAvailablePhases(settings),
    [settings],
  );
  const periodElapsedMs = getPeriodElapsedMs(match, now);
  const matchTimeMs = getMatchTimeMs(match, settings, now);
  const timeLostMs = getTimeLostMs(match, now);
  const stoppageTime = isStoppageTime(match, settings, now);
  const running = match.status === "running";
  const settingsEditable =
    match.status === "ready" &&
    match.elapsedMs === 0 &&
    match.pauses.length === 0 &&
    match.timeLostMs === 0;

  useEffect(() => {
    if (match.status !== "running" && match.status !== "paused") {
      return;
    }

    const updateNow = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (document.hidden) {
        setMatch((current) => finishTimeLostTracking(current, currentTime));
      }
    };
    updateNow();
    const interval = window.setInterval(updateNow, 1_000);
    document.addEventListener("visibilitychange", updateNow);
    window.addEventListener("pagehide", updateNow);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateNow);
      window.removeEventListener("pagehide", updateNow);
    };
  }, [match.status]);

  useEffect(() => {
    if (match.status !== "running" || !settings.keepScreenAwake) {
      setWakeStatus(
        settings.keepScreenAwake
          ? "Screen stay-awake is idle."
          : "Screen stay-awake is off in settings.",
      );
      return;
    }

    let canceled = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquireWakeLock = async () => {
      if (!("wakeLock" in navigator)) {
        setWakeStatus("This browser does not support keeping the screen awake.");
        return;
      }

      try {
        const lock = await navigator.wakeLock.request("screen");
        if (canceled) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setWakeStatus("Screen stay-awake is active while this app is visible.");
        lock.addEventListener(
          "release",
          () => {
            if (sentinel !== lock) {
              return;
            }
            sentinel = null;
            if (!canceled && !document.hidden) {
              setWakeStatus("Screen stay-awake was released; trying again.");
              void acquireWakeLock();
            }
          },
          { once: true },
        );
      } catch (error) {
        console.error("Could not acquire the screen wake lock.", error);
        setWakeStatus(
          "Could not keep the screen awake. The match clock will continue.",
        );
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden && sentinel === null && !canceled) {
        void acquireWakeLock();
      }
    };

    void acquireWakeLock();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      canceled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel !== null) {
        const lock = sentinel;
        sentinel = null;
        void lock.release().catch((error: unknown) => {
          console.error("Could not release the screen wake lock.", error);
        });
      }
    };
  }, [match.status, settings.keepScreenAwake]);

  async function showRunningNotification(requestPermission: boolean) {
    if (!settings.showRunningNotification) {
      return;
    }
    if (!("Notification" in window)) {
      setFeedback("This browser does not support running notifications.");
      return;
    }

    try {
      let permission = Notification.permission;
      if (permission === "default" && requestPermission) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setFeedback(
          permission === "denied"
            ? "Notifications are blocked. Allow them in browser settings to see running status."
            : "Allow notifications in browser settings to show running status.",
        );
        return;
      }
      if (!("serviceWorker" in navigator)) {
        setFeedback("This browser cannot show a background running notification.");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setFeedback(
          "Running notifications are available after the app has been installed or loaded from its hosted PWA.",
        );
        return;
      }

      await registration.showNotification("Matchday clock is running", {
        body: "The match clock is active. Return to Matchday Clock to control it.",
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        tag: RUNNING_NOTIFICATION_TAG,
        silent: true,
      });
      setFeedback("A running notification was sent where this platform supports it.");
    } catch (error) {
      console.error("Could not show the running notification.", error);
      setFeedback(
        "Could not show a running notification. Check this app's browser permissions.",
      );
    }
  }

  async function closeRunningNotification() {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const notifications = await registration?.getNotifications({
        tag: RUNNING_NOTIFICATION_TAG,
      });
      notifications?.forEach((notification) => notification.close());
    } catch (error) {
      console.error("Could not close the running notification.", error);
      setFeedback("The browser could not clear the running notification.");
    }
  }

  useEffect(() => {
    if (match.status === "running" && settings.showRunningNotification) {
      if (
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        void showRunningNotification(false);
      }
      return;
    }
    void closeRunningNotification();
  }, [match.status, settings.showRunningNotification]);

  function handleStart() {
    const next = startClock(match, Date.now());
    setMatch(next);
    if (next.status === "running") {
      void showRunningNotification(true);
    }
  }

  function handlePause() {
    setMatch((current) => pauseClock(current, settings, Date.now()));
  }

  function handleStop() {
    if (
      !window.confirm(
        "Stop this match and keep its final time visible? Reset is required before starting another match.",
      )
    ) {
      return;
    }
    setMatch((current) => stopClock(current, Date.now()));
    setFeedback("Match stopped. Its final time is saved on this device.");
  }

  function handleReset() {
    if (
      !window.confirm(
        "Reset the match clock, pause log, and tracked time lost? Match setup will be kept.",
      )
    ) {
      return;
    }
    setMatch(resetClock());
    setCorrectionMinutes("0");
    setCorrectionSeconds("0");
    setCorrectionError(null);
    setFeedback("Match clock reset. Match setup is unchanged.");
  }

  function handlePhaseSelect(phase: MatchPhase) {
    setMatch((current) => selectPhase(current, phase));
    const baselineMinutes = Math.floor(
      getPhaseBaselineMs(phase, settings) / 60_000,
    );
    setCorrectionMinutes(String(baselineMinutes));
    setCorrectionSeconds("0");
    setCorrectionError(null);
  }

  function handleApplyCorrection() {
    const minutes = Number(correctionMinutes);
    const seconds = Number(correctionSeconds);
    if (
      correctionMinutes.trim() === "" ||
      correctionSeconds.trim() === "" ||
      !Number.isInteger(minutes) ||
      minutes < 0 ||
      minutes > 999 ||
      !Number.isInteger(seconds) ||
      seconds < 0 ||
      seconds > 59
    ) {
      setCorrectionError("Enter non-negative whole minutes and 0–59 seconds.");
      return;
    }

    const corrected = setMatchTime(
      match,
      settings,
      (minutes * 60 + seconds) * 1_000,
      Date.now(),
    );
    if (corrected === null) {
      const phaseStart = formatClockTime(
        getPhaseBaselineMs(match.phase, settings),
      );
      setCorrectionError(
        `That time is before ${getPhaseLabel(match.phase)} starts (${phaseStart}).`,
      );
      return;
    }

    setMatch(corrected);
    setCorrectionError(null);
    setFeedback("Match time corrected.");
  }

  function loadCurrentTimeIntoCorrection() {
    const minutes = Math.floor(matchTimeMs / 60_000);
    const seconds = Math.floor(matchTimeMs / 1_000) % 60;
    setCorrectionMinutes(String(minutes));
    setCorrectionSeconds(String(seconds));
    setCorrectionError(null);
  }

  function beginTracking(event: PointerEvent<HTMLButtonElement>) {
    if (!running) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setMatch((current) => startTimeLostTracking(current, Date.now()));
  }

  function endTracking() {
    setMatch((current) => finishTimeLostTracking(current, Date.now()));
  }

  function handleTrackingKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      setMatch((current) => startTimeLostTracking(current, Date.now()));
    }
  }

  function handleTrackingKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      endTracking();
    }
  }

  function updateSettings(patch: Partial<MatchSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function handleExtraTimeChange(enabled: boolean) {
    updateSettings({ hasExtraTime: enabled });
    if (!enabled && match.phase.startsWith("extraTime")) {
      handlePhaseSelect("secondHalf");
    }
  }

  function handleNotificationSetting(enabled: boolean) {
    updateSettings({ showRunningNotification: enabled });
    if (enabled && running) {
      void showRunningNotification(true);
    }
  }

  const statusLabel: Record<ClockStatus, string> = {
    ready: "READY",
    running: "RUNNING",
    paused: "PAUSED",
    stopped: "STOPPED",
  };
  const pauseDurationNow =
    match.status === "paused" && match.pauseStartedAt !== null
      ? Math.max(0, now - match.pauseStartedAt)
      : null;
  const correctionCanBeApplied = match.status !== "stopped";
  const settingsSummary = settings.hasExtraTime
    ? `${settings.halfLengthMinutes} min halves · ${settings.extraTimeLengthMinutes} min extra-time periods`
    : `${settings.halfLengthMinutes} min halves · no extra time`;

  return (
    <div className="app-shell min-h-dvh bg-[#0b1510] text-[#eff5ef]">
      <header className="app-header mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 sm:py-5">
        <a className="brand-lockup" href="/" aria-label="Matchday Clock home">
          <img src="/pwa-icon.svg" alt="" className="brand-icon" />
          <span>
            <strong>MATCHDAY</strong>
            <small>FOOTBALL CLOCK</small>
          </span>
        </a>
        <div className="flex items-center gap-2">
          <span className="local-badge">
            <span className="local-badge-dot" />
            {storageError ? "NOT SAVING" : "SAVED ON DEVICE"}
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 pb-8 sm:gap-6 sm:px-7 sm:pb-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <section className="clock-card" aria-labelledby="clock-heading">
          <div className="clock-card-top">
            <div>
              <p className="eyebrow">MATCH TIMER</p>
              <h1 id="clock-heading" className="clock-phase-title">
                {getPhaseLabel(match.phase)}
              </h1>
            </div>
            <span className={`status-pill status-${match.status}`}>
              <span className="status-dot" />
              {statusLabel[match.status]}
            </span>
          </div>

          <div className="clock-readout-wrap">
            <div
              className={`clock-readout${stoppageTime ? " is-stoppage" : ""}`}
              role="timer"
              aria-label={`${getPhaseLabel(match.phase)}, ${formatClockTime(matchTimeMs)}${stoppageTime ? ", stoppage time" : ""}`}
              aria-live="off"
            >
              {formatClockTime(matchTimeMs)}
            </div>
            <div className="clock-meta-row">
              {stoppageTime ? (
                <span className="stoppage-indicator">
                  <span className="stoppage-dot" />
                  STOPPAGE TIME
                </span>
              ) : (
                <span className="period-limit">
                  PERIOD {formatClockTime(
                    match.phase.startsWith("extraTime")
                      ? settings.extraTimeLengthMinutes * 60_000
                      : settings.halfLengthMinutes * 60_000,
                  )}
                </span>
              )}
              <span className="elapsed-caption">
                {match.status === "paused" && pauseDurationNow !== null
                  ? `PAUSED ${formatClockTime(pauseDurationNow)}`
                  : `${formatClockTime(periodElapsedMs)} THIS PERIOD`}
              </span>
            </div>
          </div>

          {match.status === "running" &&
            settings.trackStoppageTime && (
              <button
                type="button"
                className={`hold-tracker${match.timeLostStartedAt !== null ? " is-tracking" : ""}`}
                aria-pressed={match.timeLostStartedAt !== null}
                onPointerDown={beginTracking}
                onPointerUp={endTracking}
                onPointerCancel={endTracking}
                onLostPointerCapture={endTracking}
                onKeyDown={handleTrackingKeyDown}
                onKeyUp={handleTrackingKeyUp}
                onBlur={endTracking}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span className="hold-icon" aria-hidden="true">
                  {match.timeLostStartedAt !== null ? "●" : "◉"}
                </span>
                <span className="hold-copy">
                  <strong>
                    {match.timeLostStartedAt !== null
                      ? "TRACKING TIME LOST"
                      : "HOLD TO TRACK TIME LOST"}
                  </strong>
                  <small>
                    Separate from the match clock · {formatClockTime(timeLostMs)} total
                  </small>
                </span>
                <span className="hold-value">{formatClockTime(timeLostMs)}</span>
              </button>
            )}

          <div className="clock-controls" aria-label="Match clock controls">
            <button
              type="button"
              className="control-button control-start"
              onClick={handleStart}
              disabled={running || match.status === "stopped"}
            >
              <span className="button-symbol" aria-hidden="true">
                {match.status === "paused" ? "▶" : "▶"}
              </span>
              <span>{match.status === "paused" ? "Resume" : "Start"}</span>
            </button>
            <button
              type="button"
              className="control-button control-pause"
              onClick={handlePause}
              disabled={!running}
            >
              <span className="button-symbol" aria-hidden="true">
                Ⅱ
              </span>
              <span>Pause</span>
            </button>
            <button
              type="button"
              className="control-button control-stop"
              onClick={handleStop}
              disabled={match.status === "ready" || match.status === "stopped"}
            >
              <span className="button-symbol" aria-hidden="true">
                ■
              </span>
              <span>Stop</span>
            </button>
            <button
              type="button"
              className="control-button control-reset"
              onClick={handleReset}
            >
              <span className="button-symbol" aria-hidden="true">
                ↺
              </span>
              <span>Reset</span>
            </button>
          </div>

          <div className="clock-footer">
            <div className="wake-status" aria-live="polite">
              <span className={`wake-icon${running && settings.keepScreenAwake ? " wake-active" : ""}`}>
                ◉
              </span>
              <span>{wakeStatus}</span>
            </div>
            <div className="match-total">
              {pauseSummary(match.pauses, pauseDurationNow)}
            </div>
          </div>
        </section>

        <aside className="side-column">
          <section className="panel period-panel" aria-labelledby="period-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">MATCH FLOW</p>
                <h2 id="period-heading">Select period</h2>
              </div>
              <span className="panel-heading-note">{settingsSummary}</span>
            </div>
            <div className="phase-switcher" role="group" aria-label="Match period">
              {availablePhases.map((phase) => (
                <button
                  key={phase}
                  type="button"
                  className={`phase-button${match.phase === phase ? " is-selected" : ""}`}
                  aria-pressed={match.phase === phase}
                  disabled={running || match.status === "stopped"}
                  onClick={() => handlePhaseSelect(phase)}
                >
                  <span>{phaseShortLabel(phase)}</span>
                  <small>{getPhaseLabel(phase)}</small>
                </button>
              ))}
            </div>
            <p className="helper-copy">
              A new period starts at its match-time mark. The clock keeps running
              past the limit and turns red for stoppage time.
            </p>
          </section>

          <section className="panel correction-panel" aria-labelledby="correction-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">QUICK ADJUSTMENT</p>
                <h2 id="correction-heading">Correct match time</h2>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={loadCurrentTimeIntoCorrection}
                aria-label="Load the currently displayed match time into the correction fields"
              >
                Use live time
              </button>
            </div>
            <p className="helper-copy correction-helper">
              Set the displayed match time for {getPhaseLabel(match.phase)}. This
              also works while the clock is running.
            </p>
            <div className="time-adjust-row">
              <label className="number-field">
                <span>Minutes</span>
                <input
                  type="number"
                  min="0"
                  max="999"
                  inputMode="numeric"
                  value={correctionMinutes}
                  onChange={(event) => setCorrectionMinutes(event.currentTarget.value)}
                />
              </label>
              <span className="time-colon" aria-hidden="true">
                :
              </span>
              <label className="number-field number-field-seconds">
                <span>Seconds</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  inputMode="numeric"
                  value={correctionSeconds}
                  onChange={(event) => setCorrectionSeconds(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                className="apply-button"
                disabled={!correctionCanBeApplied}
                onClick={handleApplyCorrection}
              >
                Apply
              </button>
            </div>
            {correctionError && (
              <p className="form-error" role="alert">
                {correctionError}
              </p>
            )}
          </section>

          <details className="panel setup-panel" open>
            <summary className="setup-summary">
              <span>
                <span className="eyebrow">PERSONALISE</span>
                <strong>Match setup</strong>
              </span>
              <span className="summary-meta">{settingsSummary}</span>
            </summary>
            <div className="setup-content">
              <div className="setup-period-fields">
                <label className="number-field">
                  <span>Each half</span>
                  <span className="input-with-unit">
                    <input
                      type="number"
                      min="1"
                      max="180"
                      step="1"
                      inputMode="numeric"
                      value={settings.halfLengthMinutes}
                      disabled={!settingsEditable}
                      onChange={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        if (Number.isInteger(value) && value >= 1 && value <= 180) {
                          updateSettings({ halfLengthMinutes: value });
                        }
                      }}
                    />
                    <small>MIN</small>
                  </span>
                </label>
                <label className="number-field">
                  <span>Extra-time periods</span>
                  <span className="input-with-unit">
                    <input
                      type="number"
                      min="1"
                      max="180"
                      step="1"
                      inputMode="numeric"
                      value={settings.extraTimeLengthMinutes}
                      disabled={!settingsEditable || !settings.hasExtraTime}
                      onChange={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        if (Number.isInteger(value) && value >= 1 && value <= 180) {
                          updateSettings({ extraTimeLengthMinutes: value });
                        }
                      }}
                    />
                    <small>MIN</small>
                  </span>
                </label>
              </div>
              <label className="setting-toggle">
                <span>
                  <strong>Extra time</strong>
                  <small>Two periods, using the length above</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.hasExtraTime}
                  disabled={!settingsEditable}
                  onChange={(event) => handleExtraTimeChange(event.currentTarget.checked)}
                />
              </label>
              <div className="settings-divider" />
              <label className="setting-toggle">
                <span>
                  <strong>Keep screen awake</strong>
                  <small>While the match clock is running</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.keepScreenAwake}
                  onChange={(event) =>
                    updateSettings({ keepScreenAwake: event.currentTarget.checked })
                  }
                />
              </label>
              <label className="setting-toggle">
                <span>
                  <strong>Running notification</strong>
                  <small>Best effort; permission and platform support required</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.showRunningNotification}
                  onChange={(event) =>
                    handleNotificationSetting(event.currentTarget.checked)
                  }
                />
              </label>
              <label className="setting-toggle advanced-toggle">
                <span>
                  <strong>Hold to track time lost</strong>
                  <small>Add a separate hold button to the clock</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.trackStoppageTime}
                  onChange={(event) =>
                    updateSettings({
                      trackStoppageTime: event.currentTarget.checked,
                    })
                  }
                />
              </label>
              <p className="setup-footnote">
                Settings and match data stay in this browser on this device. Period
                lengths can be changed after Reset.
              </p>
            </div>
          </details>

          <details className="panel pause-panel">
            <summary className="log-summary">
              <span>
                <span className="eyebrow">MATCH LOG</span>
                <strong>Pause times</strong>
              </span>
              <span className="log-count">
                {match.pauses.length + (pauseDurationNow === null ? 0 : 1)}
                <span className="chevron" aria-hidden="true">
                  ⌄
                </span>
              </span>
            </summary>
            <div className="pause-list-content">
              {match.pauses.length === 0 && match.status !== "paused" ? (
                <p className="empty-log">Pause the clock to start a pause log.</p>
              ) : (
                <ol className="pause-list">
                  {match.pauses.map((pause, index) => (
                    <li key={`${pause.startedAt}-${index}`}>
                      <span className="pause-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="pause-detail">
                        <strong>{getPhaseLabel(pause.phase)}</strong>
                        <small>
                          At {formatClockTime(pause.matchTimeMs)} ·{" "}
                          {formatPauseDate(pause.startedAt)}
                        </small>
                      </span>
                      <span className="pause-duration">
                        {formatClockTime(pause.durationMs)}
                      </span>
                    </li>
                  ))}
                  {match.status === "paused" && pauseDurationNow !== null && (
                    <li className="pause-current">
                      <span className="pause-index">··</span>
                      <span className="pause-detail">
                        <strong>Current pause</strong>
                        <small>Started at {formatPauseDate(match.pauseStartedAt ?? now)}</small>
                      </span>
                      <span className="pause-duration">
                        {formatClockTime(pauseDurationNow)}
                      </span>
                    </li>
                  )}
                </ol>
              )}
              {(match.pauses.length > 0 || pauseDurationNow !== null) && (
                <div className="pause-total">
                  <span>Total pause time</span>
                  <strong>
                    {formatClockTime(
                      match.pauses.reduce(
                        (total, pause) => total + pause.durationMs,
                        0,
                      ) + (pauseDurationNow ?? 0),
                    )}
                  </strong>
                </div>
              )}
            </div>
          </details>

          <div className="platform-note">
            <span aria-hidden="true">ⓘ</span>
            <p>
              A web app cannot guarantee background execution or notifications on
              every phone. The clock uses saved timestamps to recover elapsed time
              when you return.
            </p>
          </div>
        </aside>
      </main>

      {(savedNotice || storageError || feedback) && (
        <div className="message-stack" aria-live="polite">
          {savedNotice && (
            <p className="message message-warning">
              <span>{savedNotice}</span>
              <button
                type="button"
                onClick={() => setSavedNotice(null)}
                aria-label="Dismiss saved data warning"
                className="message-close"
              >
                ×
              </button>
            </p>
          )}
          {storageError && <p className="message message-warning">{storageError}</p>}
          {feedback && (
            <p className="message">
              <span>{feedback}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="Dismiss message"
                className="message-close"
              >
                ×
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
