import {
  useEffect,
  useLayoutEffect,
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
import {
  DEFAULT_PREFERENCES,
  FALLBACK_MESSAGES,
  getIntlLocale,
  isLanguagePreference,
  isThemePreference,
  LANGUAGE_OPTIONS,
  loadLocaleMessages,
  readSavedPreferences,
  resolveSystemLocale,
  resolveTheme,
  translate,
  type LocaleMessages,
  type LocaleCode,
  type MessageKey,
  type MessageParameters,
  type ResolvedTheme,
  type UserPreferences,
} from "./lib/i18n";

const STORAGE_KEY = "matchday-clock:v1";
const RUNNING_NOTIFICATION_TAG = "matchday-clock-running";

interface SavedState {
  settings: MatchSettings;
  match: MatchClockState;
  preferences: UserPreferences;
  notice: MessageKey | null;
}

interface LocalizedMessage {
  key: MessageKey;
  parameters?: MessageParameters;
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
        preferences: DEFAULT_PREFERENCES,
        notice: null,
      };
    }

    const saved: unknown = JSON.parse(raw);
    if (
      isRecord(saved) &&
      isMatchSettings(saved.settings) &&
      isMatchClockState(saved.match)
    ) {
      const savedPreferences = readSavedPreferences(saved.preferences);
      if (savedPreferences.invalid) {
        console.warn("Saved display preferences are invalid; device settings are in use.");
      }
      return {
        settings: saved.settings,
        match: saved.match,
        preferences: savedPreferences.preferences,
        notice: savedPreferences.invalid ? "savedPreferenceInvalid" : null,
      };
    }

    console.warn("Saved match data is invalid; a fresh clock was loaded.");
    return {
      settings: DEFAULT_SETTINGS,
      match: createMatchClock(),
      preferences: DEFAULT_PREFERENCES,
      notice: "savedDataInvalid",
    };
  } catch (error) {
    console.error("Could not restore the saved match clock.", error);
    return {
      settings: DEFAULT_SETTINGS,
      match: createMatchClock(),
      preferences: DEFAULT_PREFERENCES,
      notice: "savedDataInvalid",
    };
  }
}

function useSavedState() {
  const [saved] = useState(readSavedState);
  const [settings, setSettings] = useState(saved.settings);
  const [match, setMatch] = useState(saved.match);
  const [preferences, setPreferences] = useState(saved.preferences);
  const [storageError, setStorageError] = useState(false);
  const [savedNotice, setSavedNotice] = useState(saved.notice);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ settings, match, preferences }),
      );
      setStorageError(false);
    } catch (error) {
      console.error("Could not save the match clock locally.", error);
      setStorageError(true);
    }
  }, [match, preferences, settings]);

  return {
    settings,
    setSettings,
    match,
    setMatch,
    preferences,
    setPreferences,
    storageError,
    savedNotice,
    setSavedNotice,
  };
}

function formatPauseDate(timestamp: number, locale: LocaleCode): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function phaseLabel(phase: MatchPhase, messages: LocaleMessages): string {
  switch (phase) {
    case "firstHalf":
      return translate(messages, "firstHalf");
    case "secondHalf":
      return translate(messages, "secondHalf");
    case "extraTimeFirst":
      return translate(messages, "extraTimeFirst");
    case "extraTimeSecond":
      return translate(messages, "extraTimeSecond");
  }
}

function phaseShortLabel(phase: MatchPhase, messages: LocaleMessages): string {
  switch (phase) {
    case "firstHalf":
      return "1";
    case "secondHalf":
      return "2";
    case "extraTimeFirst":
      return `${translate(messages, "extraShort")} 1`;
    case "extraTimeSecond":
      return `${translate(messages, "extraShort")} 2`;
  }
}

function pauseSummary(
  pauses: PauseRecord[],
  currentPauseMs: number | null,
  messages: LocaleMessages,
): string {
  const count = pauses.length + (currentPauseMs === null ? 0 : 1);
  if (count === 0) {
    return translate(messages, "noPauses");
  }
  const totalMs =
    pauses.reduce((total, pause) => total + pause.durationMs, 0) +
    (currentPauseMs ?? 0);
  return translate(messages, "pauseSummary", {
    count,
    current:
      currentPauseMs === null
        ? ""
        : ` · ${translate(messages, "currentPause")}`,
    time: formatClockTime(totalMs),
  });
}

function waitForServiceWorkerControl(): Promise<void> {
  if (!("serviceWorker" in navigator) || navigator.serviceWorker.controller) {
    return Promise.resolve();
  }

  const serviceWorker = navigator.serviceWorker;
  return new Promise((resolve) => {
    let timeoutId: number | undefined;
    const finish = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      serviceWorker.removeEventListener("controllerchange", finish);
      resolve();
    };

    serviceWorker.addEventListener("controllerchange", finish, { once: true });
    timeoutId = window.setTimeout(finish, 3000);
    if (serviceWorker.controller) {
      finish();
    }
  });
}

function App() {
  const {
    settings,
    setSettings,
    match,
    setMatch,
    preferences,
    setPreferences,
    storageError,
    savedNotice,
    setSavedNotice,
  } = useSavedState();
  const [systemLocale, setSystemLocale] = useState<LocaleCode>(() =>
    resolveSystemLocale(
      navigator.languages.length > 0 ? navigator.languages : [navigator.language],
    ),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const locale =
    preferences.language === "system" ? systemLocale : preferences.language;
  const [messages, setMessages] =
    useState<LocaleMessages>(FALLBACK_MESSAGES);
  const [messagesLocale, setMessagesLocale] = useState<LocaleCode>("en-GB");
  const displayLocale = messagesLocale === locale ? locale : "en-GB";
  const displayMessages =
    messagesLocale === locale ? messages : FALLBACK_MESSAGES;
  const theme = resolveTheme(preferences.theme, systemTheme);
  const t = (key: MessageKey, parameters?: MessageParameters) =>
    translate(displayMessages, key, parameters);
  const [now, setNow] = useState(() => Date.now());
  const [wakeStatus, setWakeStatus] = useState<MessageKey>("wakeIdle");
  const [feedback, setFeedback] = useState<LocalizedMessage | null>(null);
  const [correctionMinutes, setCorrectionMinutes] = useState(() =>
    String(Math.floor(getMatchTimeMs(match, settings, Date.now()) / 60_000)),
  );
  const [correctionSeconds, setCorrectionSeconds] = useState(() =>
    String(Math.floor(getMatchTimeMs(match, settings, Date.now()) / 1_000) % 60),
  );
  const [correctionError, setCorrectionError] =
    useState<LocalizedMessage | null>(null);
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
    const updateSystemLocale = () => {
      setSystemLocale(
        resolveSystemLocale(
          navigator.languages.length > 0
            ? navigator.languages
            : [navigator.language],
        ),
      );
    };
    window.addEventListener("languagechange", updateSystemLocale);
    return () => window.removeEventListener("languagechange", updateSystemLocale);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void waitForServiceWorkerControl()
      .then(() => {
        if (cancelled) {
          return null;
        }
        return loadLocaleMessages(locale);
      })
      .then((loadedMessages) => {
        if (cancelled || loadedMessages === null) {
          return;
        }
        setMessages(loadedMessages);
        setMessagesLocale(locale);
        setFeedback((current) =>
          current?.key === "localeLoadFailed" ? null : current,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error(`Could not load locale messages for ${locale}.`, error);
        setMessages(FALLBACK_MESSAGES);
        setMessagesLocale("en-GB");
        const languageLabel =
          LANGUAGE_OPTIONS.find((option) => option.code === locale)?.label ??
          locale;
        setFeedback({
          key: "localeLoadFailed",
          parameters: { language: languageLabel },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () =>
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateSystemTheme);
      return () => mediaQuery.removeEventListener("change", updateSystemTheme);
    }
    mediaQuery.addListener(updateSystemTheme);
    return () => mediaQuery.removeListener(updateSystemTheme);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = getIntlLocale(displayLocale);
    document.documentElement.dataset.theme = theme;
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (themeColor) {
      themeColor.content = theme === "light" ? "#f2f6f1" : "#0b1510";
    }
  }, [displayLocale, theme]);

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
          ? "wakeIdle"
          : "wakeOff",
      );
      return;
    }

    let canceled = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquireWakeLock = async () => {
      if (!("wakeLock" in navigator)) {
        setWakeStatus("wakeUnsupported");
        return;
      }

      try {
        const lock = await navigator.wakeLock.request("screen");
        if (canceled) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setWakeStatus("wakeActive");
        lock.addEventListener(
          "release",
          () => {
            if (sentinel !== lock) {
              return;
            }
            sentinel = null;
            if (!canceled && !document.hidden) {
              setWakeStatus("wakeRetry");
              void acquireWakeLock();
            }
          },
          { once: true },
        );
      } catch (error) {
        console.error("Could not acquire the screen wake lock.", error);
        setWakeStatus("wakeFailed");
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
      setFeedback({ key: "notificationUnsupported" });
      return;
    }

    try {
      let permission = Notification.permission;
      if (permission === "default" && requestPermission) {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setFeedback(
          {
            key:
              permission === "denied"
                ? "notificationDenied"
                : "notificationPermission",
          },
        );
        return;
      }
      if (!("serviceWorker" in navigator)) {
        setFeedback({ key: "notificationNoServiceWorker" });
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setFeedback({ key: "notificationNoRegistration" });
        return;
      }

      await registration.showNotification(t("notificationTitle"), {
        body: t("notificationBody"),
        icon: "/pwa-192x192.png",
        badge: "/pwa-192x192.png",
        tag: RUNNING_NOTIFICATION_TAG,
        silent: true,
      });
      setFeedback({ key: "notificationSent" });
    } catch (error) {
      console.error("Could not show the running notification.", error);
      setFeedback({ key: "notificationFailed" });
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
      setFeedback({ key: "notificationCloseFailed" });
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
  }, [displayLocale, messages, match.status, settings.showRunningNotification]);

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
    if (!window.confirm(t("stopConfirm"))) {
      return;
    }
    setMatch((current) => stopClock(current, Date.now()));
    setFeedback({ key: "stoppedFeedback" });
  }

  function handleReset() {
    if (!window.confirm(t("resetConfirm"))) {
      return;
    }
    setMatch(resetClock());
    setCorrectionMinutes("0");
    setCorrectionSeconds("0");
    setCorrectionError(null);
    setFeedback({ key: "resetFeedback" });
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
      setCorrectionError({ key: "invalidCorrection" });
      return;
    }

    const corrected = setMatchTime(
      match,
      settings,
      (minutes * 60 + seconds) * 1_000,
      Date.now(),
    );
    if (corrected === null) {
      const phaseStart = formatClockTime(getPhaseBaselineMs(match.phase, settings));
      setCorrectionError({
        key: "beforePhase",
        parameters: {
          phase: phaseLabel(match.phase, displayMessages),
          time: phaseStart,
        },
      });
      return;
    }

    setMatch(corrected);
    setCorrectionError(null);
    setFeedback({ key: "correctedFeedback" });
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

  function updatePreferences(patch: Partial<UserPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
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
    ready: t("ready"),
    running: t("running"),
    paused: t("paused"),
    stopped: t("stopped"),
  };
  const pauseDurationNow =
    match.status === "paused" && match.pauseStartedAt !== null
      ? Math.max(0, now - match.pauseStartedAt)
      : null;
  const correctionCanBeApplied = match.status !== "stopped";
  const settingsSummary = settings.hasExtraTime
    ? t("settingsExtra", {
        half: settings.halfLengthMinutes,
        extra: settings.extraTimeLengthMinutes,
      })
    : t("settingsNoExtra", { half: settings.halfLengthMinutes });

  return (
    <div className="app-shell min-h-dvh bg-[#0b1510] text-[#eff5ef]">
      <header className="app-header mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-7 sm:py-5">
        <a className="brand-lockup" href="/" aria-label={t("homeAria")}>
          <img src="/pwa-icon.svg" alt="" className="brand-icon" />
          <span>
            <strong>MATCHDAY</strong>
            <small>{t("appSubtitle")}</small>
          </span>
        </a>
        <div className="flex items-center gap-2">
          <span className="local-badge">
            <span className="local-badge-dot" />
            {storageError ? t("notSaving") : t("saved")}
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] gap-4 px-4 pb-8 sm:gap-6 sm:px-7 sm:pb-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
        <section className="clock-card" aria-labelledby="clock-heading">
          <div className="clock-card-top">
            <div>
              <p className="eyebrow">{t("timer")}</p>
              <h1 id="clock-heading" className="clock-phase-title">
                {phaseLabel(match.phase, displayMessages)}
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
              aria-label={`${phaseLabel(match.phase, displayMessages)}, ${formatClockTime(matchTimeMs)}${stoppageTime ? `, ${t("stoppage")}` : ""}`}
              aria-live="off"
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
                      match.phase.startsWith("extraTime")
                        ? settings.extraTimeLengthMinutes * 60_000
                        : settings.halfLengthMinutes * 60_000,
                    ),
                  })}
                </span>
              )}
              <span className="elapsed-caption">
                {match.status === "paused" && pauseDurationNow !== null
                  ? t("pausedFor", { time: formatClockTime(pauseDurationNow) })
                  : t("thisPeriod", { time: formatClockTime(periodElapsedMs) })}
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
                      ? t("timeLostTracking")
                      : t("timeLostHold")}
                  </strong>
                  <small>
                    {t("timeLostTotal", { time: formatClockTime(timeLostMs) })}
                  </small>
                </span>
                <span className="hold-value">{formatClockTime(timeLostMs)}</span>
              </button>
            )}

          <div className="clock-controls" aria-label={t("controlsAria")}>
            <button
              type="button"
              className="control-button control-start"
              onClick={handleStart}
              disabled={running || match.status === "stopped"}
            >
              <span className="button-symbol" aria-hidden="true">
                {match.status === "paused" ? "▶" : "▶"}
              </span>
              <span>{match.status === "paused" ? t("resume") : t("start")}</span>
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
              <span>{t("pause")}</span>
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
              <span>{t("stop")}</span>
            </button>
            <button
              type="button"
              className="control-button control-reset"
              onClick={handleReset}
            >
              <span className="button-symbol" aria-hidden="true">
                ↺
              </span>
              <span>{t("reset")}</span>
            </button>
          </div>

          <div className="clock-footer">
            <div className="wake-status" aria-live="polite">
              <span className={`wake-icon${running && settings.keepScreenAwake ? " wake-active" : ""}`}>
                ◉
              </span>
              <span>{t(wakeStatus)}</span>
            </div>
            <div className="match-total">
              {pauseSummary(match.pauses, pauseDurationNow, displayMessages)}
            </div>
          </div>
        </section>

        <aside className="side-column">
          <section className="panel period-panel" aria-labelledby="period-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t("matchFlow")}</p>
                <h2 id="period-heading">{t("selectPeriod")}</h2>
              </div>
              <span className="panel-heading-note">{settingsSummary}</span>
            </div>
            <div className="phase-switcher" role="group" aria-label={t("selectPeriod")}>
              {availablePhases.map((phase) => (
                <button
                  key={phase}
                  type="button"
                  className={`phase-button${match.phase === phase ? " is-selected" : ""}`}
                  aria-pressed={match.phase === phase}
                  disabled={running || match.status === "stopped"}
                  onClick={() => handlePhaseSelect(phase)}
                >
                  <span>{phaseShortLabel(phase, displayMessages)}</span>
                  <small>{phaseLabel(phase, displayMessages)}</small>
                </button>
              ))}
            </div>
            <p className="helper-copy">
              {t("periodHelp")}
            </p>
          </section>

          <section className="panel correction-panel" aria-labelledby="correction-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t("quickAdjustment")}</p>
                <h2 id="correction-heading">{t("correctTime")}</h2>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={loadCurrentTimeIntoCorrection}
                aria-label={t("useLiveTimeAria")}
              >
                {t("useLiveTime")}
              </button>
            </div>
            <p className="helper-copy correction-helper">
              {t("correctHelper", {
                phase: phaseLabel(match.phase, displayMessages),
              })}
            </p>
            <div className="time-adjust-row">
              <label className="number-field">
                <span>{t("minutes")}</span>
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
                <span>{t("seconds")}</span>
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
                {t("apply")}
              </button>
            </div>
            {correctionError && (
              <p className="form-error" role="alert">
                {t(correctionError.key, correctionError.parameters)}
              </p>
            )}
          </section>

          <details className="panel setup-panel" open>
            <summary className="setup-summary">
              <span>
                <span className="eyebrow">{t("personalize")}</span>
                <strong>{t("setup")}</strong>
              </span>
              <span className="summary-meta">{settingsSummary}</span>
            </summary>
            <div className="setup-content">
              <div className="setup-period-fields">
                <label className="number-field">
                  <span>{t("eachHalf")}</span>
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
                    <small>{t("minUnit")}</small>
                  </span>
                </label>
                <label className="number-field">
                  <span>{t("extraPeriods")}</span>
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
                    <small>{t("minUnit")}</small>
                  </span>
                </label>
              </div>
              <label className="setting-toggle">
                <span>
                  <strong>{t("extra")}</strong>
                  <small>{t("extraHelp")}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.hasExtraTime}
                  disabled={!settingsEditable}
                  onChange={(event) => handleExtraTimeChange(event.currentTarget.checked)}
                />
              </label>
              <div className="settings-divider" />
              <div className="preference-fields">
                <label className="number-field preference-field">
                  <span>{t("language")}</span>
                  <select
                    className="preference-select"
                    value={preferences.language}
                    onChange={(event) => {
                      const language = event.currentTarget.value;
                      if (isLanguagePreference(language)) {
                        updatePreferences({ language });
                      }
                    }}
                  >
                    <option value="system">{t("system")}</option>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="number-field preference-field">
                  <span>{t("appearance")}</span>
                  <select
                    className="preference-select"
                    value={preferences.theme}
                    onChange={(event) => {
                      const selectedTheme = event.currentTarget.value;
                      if (isThemePreference(selectedTheme)) {
                        updatePreferences({ theme: selectedTheme });
                      }
                    }}
                  >
                    <option value="system">{t("system")}</option>
                    <option value="light">{t("light")}</option>
                    <option value="dark">{t("dark")}</option>
                  </select>
                </label>
              </div>
              <div className="settings-divider" />
              <label className="setting-toggle">
                <span>
                  <strong>{t("keepAwake")}</strong>
                  <small>{t("keepAwakeHelp")}</small>
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
                  <strong>{t("runningNotification")}</strong>
                  <small>{t("notificationHelp")}</small>
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
                  <strong>{t("trackLost")}</strong>
                  <small>{t("trackHelp")}</small>
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
                {t("setupNote")}
              </p>
            </div>
          </details>

          <details className="panel pause-panel">
            <summary className="log-summary">
              <span>
                <span className="eyebrow">{t("matchLog")}</span>
                <strong>{t("pauseTimes")}</strong>
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
                <p className="empty-log">{t("pauseEmpty")}</p>
              ) : (
                <ol className="pause-list">
                  {match.pauses.map((pause, index) => (
                    <li key={`${pause.startedAt}-${index}`}>
                      <span className="pause-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="pause-detail">
                        <strong>{phaseLabel(pause.phase, displayMessages)}</strong>
                        <small>
                          {t("atTime", {
                            time: formatClockTime(pause.matchTimeMs),
                            date: formatPauseDate(pause.startedAt, displayLocale),
                          })}
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
                        <strong>{t("currentPause")}</strong>
                        <small>
                          {t("startedAt", {
                            time: formatPauseDate(
                              match.pauseStartedAt ?? now,
                              displayLocale,
                            ),
                          })}
                        </small>
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
                  <span>{t("totalPauseTime")}</span>
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
              {t("platformNote")}
            </p>
          </div>
        </aside>
      </main>

      {(savedNotice || storageError || feedback) && (
        <div className="message-stack" aria-live="polite">
          {savedNotice && (
            <p className="message message-warning">
              <span>{t(savedNotice)}</span>
              <button
                type="button"
                onClick={() => setSavedNotice(null)}
                aria-label={t("dismissSaved")}
                className="message-close"
              >
                ×
              </button>
            </p>
          )}
          {storageError && (
            <p className="message message-warning">{t("storageError")}</p>
          )}
          {feedback && (
            <p className="message">
              <span>{t(feedback.key, feedback.parameters)}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label={t("dismissMessage")}
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
