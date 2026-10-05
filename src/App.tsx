import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
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
  setMatchTime,
  startClock,
  startTimeLostTracking,
  stopBreakClock,
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
  type LocaleCode,
  type LocaleMessages,
  type MessageKey,
  type MessageParameters,
  type ResolvedTheme,
  type UserPreferences,
} from "./lib/i18n";

const STORAGE_KEY = "matchday-clock:v1";
const RUNNING_NOTIFICATION_TAG = "matchday-clock-running";

interface MatchConfiguration {
  halfLengthMinutes: number;
  hasExtraTime: boolean;
  extraTimeLengthMinutes: number;
}

interface MatchPreset extends MatchConfiguration {
  id: string;
  name: string;
}

type PresetDraft = Omit<MatchPreset, "id"> & { id: string | null };

interface SavedState {
  settings: MatchSettings;
  match: MatchClockState;
  preferences: UserPreferences;
  presets: MatchPreset[];
  hasMatch: boolean;
  pauseClockEnabled: boolean;
  notice: MessageKey | null;
}

interface LocalizedMessage {
  key: MessageKey;
  parameters?: MessageParameters;
}

type ActiveModal =
  | "settings"
  | "setup"
  | "presetPicker"
  | "presetEditor"
  | "correction"
  | "about"
  | "installHelp";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface ModalShellProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  size?: "regular" | "wide";
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

function readSavedState(): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
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
        presets: presetsValid ? (saved.presets as MatchPreset[] | undefined) ?? [] : [],
        hasMatch:
          saved.hasMatch === true || saved.match.status !== "ready",
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
    return {
      settings: DEFAULT_SETTINGS,
      match: createMatchClock(),
      preferences: DEFAULT_PREFERENCES,
      presets: [],
      hasMatch: false,
      pauseClockEnabled: true,
      notice: "savedDataInvalid",
    };
  } catch (error) {
    console.error("Could not restore the saved match clock.", error);
    return {
      settings: DEFAULT_SETTINGS,
      match: createMatchClock(),
      preferences: DEFAULT_PREFERENCES,
      presets: [],
      hasMatch: false,
      pauseClockEnabled: true,
      notice: "savedDataInvalid",
    };
  }
}

function useSavedState() {
  const [saved] = useState(readSavedState);
  const [settings, setSettings] = useState(saved.settings);
  const [match, setMatch] = useState(saved.match);
  const [preferences, setPreferences] = useState(saved.preferences);
  const [presets, setPresets] = useState(saved.presets);
  const [hasMatch, setHasMatch] = useState(saved.hasMatch);
  const [pauseClockEnabled, setPauseClockEnabled] = useState(
    saved.pauseClockEnabled,
  );
  const [storageError, setStorageError] = useState(false);
  const [savedNotice, setSavedNotice] = useState(saved.notice);

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

function getConfiguration(settings: MatchSettings): MatchConfiguration {
  return {
    halfLengthMinutes: settings.halfLengthMinutes,
    hasExtraTime: settings.hasExtraTime,
    extraTimeLengthMinutes: settings.extraTimeLengthMinutes,
  };
}

function createPresetId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

function isStandaloneDisplay(): boolean {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function getInstallPlatform(): "ios" | "android" | "other" {
  const userAgent = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) {
    return "ios";
  }
  return /Android/i.test(userAgent) ? "android" : "other";
}

function ModalShell({
  title,
  closeLabel,
  onClose,
  children,
  size = "regular",
}: ModalShellProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || dialog === null) {
        return;
      }

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeRef.current();
        }
      }}
    >
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal-dialog modal-${size}`}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            aria-label={closeLabel}
            className="icon-button modal-close"
            onClick={() => closeRef.current()}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function App() {
  const {
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
  } = useSavedState();
  const [systemLocale, setSystemLocale] = useState<LocaleCode>(() =>
    resolveSystemLocale(
      navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language],
    ),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [messages, setMessages] = useState<LocaleMessages>(FALLBACK_MESSAGES);
  const [messagesLocale, setMessagesLocale] = useState<LocaleCode>("en-GB");
  const [now, setNow] = useState(() => Date.now());
  const [wakeStatus, setWakeStatus] = useState<MessageKey>("wakeIdle");
  const [feedback, setFeedback] = useState<LocalizedMessage | null>(null);
  const [modal, setModal] = useState<ActiveModal | null>(null);
  const [setupDraft, setSetupDraft] = useState<MatchConfiguration>(() =>
    getConfiguration(settings),
  );
  const [setupSaveAsPreset, setSetupSaveAsPreset] = useState(false);
  const [setupPresetName, setSetupPresetName] = useState("");
  const [setupError, setSetupError] = useState<MessageKey | null>(null);
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);
  const [presetError, setPresetError] = useState<MessageKey | null>(null);
  const [presetEditorReturn, setPresetEditorReturn] =
    useState<ActiveModal | null>(null);
  const [correctionPhase, setCorrectionPhase] = useState(match.phase);
  const [correctionMinutes, setCorrectionMinutes] = useState(() =>
    String(Math.floor(getMatchTimeMs(match, settings, Date.now()) / 60_000)),
  );
  const [correctionSeconds, setCorrectionSeconds] = useState(() =>
    String(
      Math.floor(getMatchTimeMs(match, settings, Date.now()) / 1_000) % 60,
    ),
  );
  const [correctionError, setCorrectionError] =
    useState<LocalizedMessage | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(isStandaloneDisplay);
  const [installDismissed, setInstallDismissed] = useState(false);
  const availablePhases = useMemo(
    () => getAvailablePhases(settings),
    [settings],
  );
  const locale =
    preferences.language === "system" ? systemLocale : preferences.language;
  const displayLocale = messagesLocale === locale ? locale : "en-GB";
  const displayMessages =
    messagesLocale === locale ? messages : FALLBACK_MESSAGES;
  const theme = resolveTheme(preferences.theme, systemTheme);
  const t = (key: MessageKey, parameters?: MessageParameters) =>
    translate(displayMessages, key, parameters);
  const periodElapsedMs = getPeriodElapsedMs(match, now);
  const matchTimeMs = getMatchTimeMs(match, settings, now);
  const timeLostMs = getTimeLostMs(match, now);
  const stoppageTime = isStoppageTime(match, settings, now);
  const running = match.status === "running";
  const breakRunning = match.status === "break";
  const activeClock = running || breakRunning;
  const pauseDurationNow =
    (match.status === "paused" || match.status === "break") &&
    match.pauseStartedAt !== null
      ? Math.max(0, now - match.pauseStartedAt)
      : null;
  const settingsSummary = settings.hasExtraTime
    ? t("settingsExtra", {
        half: settings.halfLengthMinutes,
        extra: settings.extraTimeLengthMinutes,
      })
    : t("settingsNoExtra", { half: settings.halfLengthMinutes });
  const statusLabel: Record<ClockStatus, string> = {
    ready: t("ready"),
    running: t("running"),
    paused: t("paused"),
    break: t("breakRunning"),
    stopped: t("finished"),
  };
  const installPlatform = getInstallPlatform();

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
    if (
      match.status !== "running" &&
      match.status !== "paused" &&
      match.status !== "break"
    ) {
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
  }, [match.status, setMatch]);

  useEffect(() => {
    if (!activeClock || !settings.keepScreenAwake) {
      setWakeStatus(
        settings.keepScreenAwake ? "wakeIdle" : "wakeOff",
      );
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquireWakeLock = async () => {
      if (!("wakeLock" in navigator)) {
        setWakeStatus("wakeUnsupported");
        return;
      }

      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
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
            if (!cancelled && !document.hidden) {
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
      if (!document.hidden && sentinel === null && !cancelled) {
        void acquireWakeLock();
      }
    };

    void acquireWakeLock();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel !== null) {
        const lock = sentinel;
        sentinel = null;
        void lock.release().catch((error: unknown) => {
          console.error("Could not release the screen wake lock.", error);
        });
      }
    };
  }, [activeClock, settings.keepScreenAwake]);

  async function showRunningNotification(
    requestPermission: boolean,
    forceEnabled = false,
  ) {
    if (!settings.showRunningNotification && !forceEnabled) {
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
        setFeedback({
          key:
            permission === "denied"
              ? "notificationDenied"
              : "notificationPermission",
        });
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
      console.error("Could not show a running notification.", error);
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
    if (activeClock && settings.showRunningNotification) {
      if ("Notification" in window && Notification.permission === "granted") {
        void showRunningNotification(false);
      }
      return;
    }
    void closeRunningNotification();
  }, [
    activeClock,
    displayLocale,
    messages,
    settings.showRunningNotification,
  ]);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const updateStandalone = () => setStandalone(isStandaloneDisplay());
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      setInstallDismissed(true);
    };

    if (typeof displayMode.addEventListener === "function") {
      displayMode.addEventListener("change", updateStandalone);
    } else {
      displayMode.addListener(updateStandalone);
    }
    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      if (typeof displayMode.removeEventListener === "function") {
        displayMode.removeEventListener("change", updateStandalone);
      } else {
        displayMode.removeListener(updateStandalone);
      }
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function updateSettings(patch: Partial<MatchSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function updatePreferences(patch: Partial<UserPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
  }

  function openSetup() {
    setSetupDraft(getConfiguration(settings));
    setSetupSaveAsPreset(false);
    setSetupPresetName("");
    setSetupError(null);
    setModal("setup");
  }

  function startNewMatch(configuration: MatchConfiguration) {
    setSettings((current) => ({ ...current, ...configuration }));
    setMatch(createMatchClock());
    setHasMatch(true);
    setModal(null);
    setFeedback(null);
  }

  function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (setupSaveAsPreset) {
      const name = setupPresetName.trim();
      if (name.length === 0) {
        setSetupError("presetNameRequired");
        return;
      }
      if (presets.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
        setSetupError("presetNameExists");
        return;
      }
      setPresets((current) => [
        ...current,
        { id: createPresetId(), name, ...setupDraft },
      ]);
    }
    startNewMatch(setupDraft);
  }

  function openPresetEditor(preset: MatchPreset | null) {
    setPresetDraft(
      preset
        ? { ...preset }
        : { id: null, name: "", ...getConfiguration(settings) },
    );
    setPresetError(null);
    setPresetEditorReturn("settings");
    setModal("presetEditor");
  }

  function savePresetDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (presetDraft === null) {
      return;
    }

    const name = presetDraft.name.trim();
    if (name.length === 0) {
      setPresetError("presetNameRequired");
      return;
    }
    if (
      presets.some(
        (preset) =>
          preset.id !== presetDraft.id &&
          preset.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setPresetError("presetNameExists");
      return;
    }

    const presetId = presetDraft.id;
    if (presetId === null) {
      const nextPreset: MatchPreset = {
        ...presetDraft,
        id: createPresetId(),
        name,
      };
      setPresets((current) => [...current, nextPreset]);
    } else {
      const nextPreset: MatchPreset = { ...presetDraft, id: presetId, name };
      setPresets((current) =>
        current.map((preset) =>
          preset.id === nextPreset.id ? nextPreset : preset,
        ),
      );
    }
    setModal(presetEditorReturn ?? "settings");
    setFeedback({
      key: presetDraft.id === null ? "presetSaved" : "presetUpdated",
    });
  }

  function deletePreset(preset: MatchPreset) {
    if (!window.confirm(t("deletePresetConfirm", { name: preset.name }))) {
      return;
    }
    setPresets((current) => current.filter((item) => item.id !== preset.id));
    setFeedback({ key: "presetDeleted" });
  }

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
    const currentTime = Date.now();
    if (match.status === "break") {
      setMatch((current) => stopBreakClock(current, currentTime));
      return;
    }
    const next = stopClock(match, settings, pauseClockEnabled, currentTime);
    setMatch(next);
    if (next.status === "stopped") {
      setFeedback({ key: "matchFinished" });
    }
  }

  function handleReset() {
    if (!window.confirm(t("resetConfirm"))) {
      return;
    }
    setMatch(createMatchClock());
    setHasMatch(false);
    setModal(null);
    setFeedback({ key: "resetFeedback" });
  }

  function openCorrection() {
    setCorrectionPhase(match.phase);
    setCorrectionMinutes(String(Math.floor(matchTimeMs / 60_000)));
    setCorrectionSeconds(String(Math.floor(matchTimeMs / 1_000) % 60));
    setCorrectionError(null);
    setModal("correction");
  }

  function handleApplyCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      correctionPhase,
      (minutes * 60 + seconds) * 1_000,
      Date.now(),
    );
    if (corrected === null) {
      setCorrectionError({
        key: "beforePhase",
        parameters: {
          phase: phaseLabel(correctionPhase, displayMessages),
          time: formatClockTime(
            getPhaseBaselineMs(correctionPhase, settings),
          ),
        },
      });
      return;
    }

    setMatch(corrected);
    setCorrectionError(null);
    setModal(null);
    setFeedback({ key: "correctedFeedback" });
  }

  function loadCurrentTimeIntoCorrection() {
    setCorrectionPhase(match.phase);
    setCorrectionMinutes(String(Math.floor(matchTimeMs / 60_000)));
    setCorrectionSeconds(String(Math.floor(matchTimeMs / 1_000) % 60));
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

  function handleNotificationSetting(enabled: boolean) {
    updateSettings({ showRunningNotification: enabled });
    if (enabled && activeClock) {
      void showRunningNotification(true, true);
    }
  }

  function handlePauseClockSetting(enabled: boolean) {
    setPauseClockEnabled(enabled);
    if (!enabled && breakRunning) {
      setMatch((current) => stopBreakClock(current, Date.now()));
    }
  }

  async function handleInstall() {
    if (installPrompt === null) {
      setModal("installHelp");
      return;
    }

    try {
      const prompt = installPrompt;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setInstallDismissed(true);
      }
    } catch (error) {
      console.error("Could not open the PWA installation prompt.", error);
      setFeedback({ key: "installFailed" });
    }
  }

  function closePresetEditor() {
    setModal(presetEditorReturn ?? "settings");
  }

  const installInstructionsKey: MessageKey =
    installPlatform === "ios"
      ? "installInstructionsIOS"
      : installPlatform === "android"
        ? "installInstructionsAndroid"
        : "installInstructionsOther";
  const selectedPauseRecords = match.pauses;

  return (
    <div className="app-shell min-h-dvh bg-[#0b1510] text-[#eff5ef]">
      <header className="app-header mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-4 py-4 sm:px-7 sm:py-5">
        <a className="brand-lockup" href="/" aria-label={t("homeAria")}>
          <img src="/pwa-icon.svg" alt="" className="brand-icon" />
          <span>
            <strong>MATCHDAY</strong>
            <small>{t("appSubtitle")}</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="local-badge">
            <span className="local-badge-dot" />
            {storageError ? t("notSaving") : t("saved")}
          </span>
          <button
            aria-label={t("openSettings")}
            className="icon-button settings-button"
            onClick={() => setModal("settings")}
            title={t("openSettings")}
            type="button"
          >
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>

      {!standalone && !installDismissed && (
        <section className="install-banner mx-auto" aria-label={t("installBanner")}>
          <div className="install-copy">
            <span aria-hidden="true" className="install-icon">
              ⇧
            </span>
            <p>{t("installBanner")}</p>
          </div>
          <button className="install-button" onClick={() => void handleInstall()} type="button">
            {t("installApp")}
          </button>
          <button
            aria-label={t("dismissInstall")}
            className="icon-button install-dismiss"
            onClick={() => setInstallDismissed(true)}
            type="button"
          >
            ×
          </button>
        </section>
      )}

      <main className={`app-main mx-auto w-full max-w-[1120px] px-4 pb-8 sm:px-7 sm:pb-10${hasMatch ? " is-clock" : " is-launch"}`}>
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
                  onClick={() => setModal("presetPicker")}
                  title={t("choosePreset")}
                  type="button"
                >
                  <span aria-hidden="true">⌄</span>
                </button>
                <button
                  className="primary-start-button"
                  onClick={() => startNewMatch(getConfiguration(settings))}
                  type="button"
                >
                  <span>{t("useLastSettings")}</span>
                  <small>{settingsSummary}</small>
                </button>
              </div>
              <button className="secondary-start-button" onClick={openSetup} type="button">
                <span aria-hidden="true">＋</span>
                {t("setUpMatch")}
              </button>
            </div>
            {presets.length > 0 && (
              <p className="saved-preset-count">
                {t("savedPresetCount", { count: presets.length })}
              </p>
            )}
          </section>
        ) : (
          <section className="clock-card active-match" aria-labelledby="clock-heading">
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
                aria-label={`${phaseLabel(match.phase, displayMessages)}, ${formatClockTime(matchTimeMs)}${stoppageTime ? `, ${t("stoppage")}` : ""}`}
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
                onBlur={endTracking}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={handleTrackingKeyDown}
                onKeyUp={handleTrackingKeyUp}
                onLostPointerCapture={endTracking}
                onPointerCancel={endTracking}
                onPointerDown={beginTracking}
                onPointerUp={endTracking}
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
                  <small>{t("timeLostTotal", { time: formatClockTime(timeLostMs) })}</small>
                </span>
                <span aria-hidden="true" className="hold-value">
                  {formatClockTime(timeLostMs)}
                </span>
              </button>
            )}

            <div aria-label={t("controlsAria")} className="clock-controls">
              <button
                aria-label={running ? t("pause") : t(match.status === "paused" ? "resume" : "start")}
                className="control-button control-start"
                disabled={match.status === "stopped"}
                onClick={running ? handlePause : handleStart}
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
                disabled={
                  match.status === "ready" || match.status === "stopped"
                }
                onClick={handleStop}
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
                onClick={handleReset}
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
                onClick={openCorrection}
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
                {pauseSummary(match.pauses, pauseDurationNow, displayMessages)}
              </div>
            </div>
          </section>
        )}
      </main>

      {(savedNotice || storageError || feedback) && (
        <div aria-live="polite" className="message-stack">
          {savedNotice && (
            <p className="message message-warning">
              <span>{t(savedNotice)}</span>
              <button
                aria-label={t("dismissSaved")}
                className="message-close"
                onClick={() => setSavedNotice(null)}
                type="button"
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
                aria-label={t("dismissMessage")}
                className="message-close"
                onClick={() => setFeedback(null)}
                type="button"
              >
                ×
              </button>
            </p>
          )}
        </div>
      )}

      {modal === "settings" && (
        <ModalShell
          closeLabel={t("close")}
          onClose={() => setModal(null)}
          size="wide"
          title={t("settingsTitle")}
        >
          <div className="settings-modal-grid">
            <section className="modal-section" aria-labelledby="display-settings-heading">
              <h3 id="display-settings-heading">{t("displaySettings")}</h3>
              <div className="preference-fields modal-preferences">
                <label className="number-field preference-field">
                  <span>{t("language")}</span>
                  <select
                    className="preference-select"
                    onChange={(event) => {
                      const language = event.currentTarget.value;
                      if (isLanguagePreference(language)) {
                        updatePreferences({ language });
                      }
                    }}
                    value={preferences.language}
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
                    onChange={(event) => {
                      const selectedTheme = event.currentTarget.value;
                      if (isThemePreference(selectedTheme)) {
                        updatePreferences({ theme: selectedTheme });
                      }
                    }}
                    value={preferences.theme}
                  >
                    <option value="system">{t("system")}</option>
                    <option value="light">{t("light")}</option>
                    <option value="dark">{t("dark")}</option>
                  </select>
                </label>
              </div>
              <label className="setting-toggle">
                <span>
                  <strong>{t("keepAwake")}</strong>
                  <small>{t("keepAwakeHelp")}</small>
                </span>
                <input
                  checked={settings.keepScreenAwake}
                  onChange={(event) =>
                    updateSettings({
                      keepScreenAwake: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
              </label>
              <label className="setting-toggle">
                <span>
                  <strong>{t("runningNotification")}</strong>
                  <small>{t("notificationHelp")}</small>
                </span>
                <input
                  checked={settings.showRunningNotification}
                  onChange={(event) =>
                    handleNotificationSetting(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
              </label>
              <label className="setting-toggle">
                <span>
                  <strong>{t("trackLost")}</strong>
                  <small>{t("trackHelp")}</small>
                </span>
                <input
                  checked={settings.trackStoppageTime}
                  onChange={(event) =>
                    updateSettings({
                      trackStoppageTime: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
              </label>
              <label className="setting-toggle">
                <span>
                  <strong>{t("pauseClock")}</strong>
                  <small>{t("pauseClockHelp")}</small>
                </span>
                <input
                  checked={pauseClockEnabled}
                  onChange={(event) =>
                    handlePauseClockSetting(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
              </label>
            </section>

            <section className="modal-section" aria-labelledby="presets-heading">
              <div className="section-heading">
                <h3 id="presets-heading">{t("savedPresets")}</h3>
                <button
                  className="small-secondary-button"
                  onClick={() => openPresetEditor(null)}
                  type="button"
                >
                  <span aria-hidden="true">＋</span>
                  {t("newPreset")}
                </button>
              </div>
              {presets.length === 0 ? (
                <p className="empty-presets">{t("noPresets")}</p>
              ) : (
                <ul className="preset-management-list">
                  {presets.map((preset) => (
                    <li className="preset-management-item" key={preset.id}>
                      <div className="preset-management-copy">
                        <strong>{preset.name}</strong>
                        <small>
                          {preset.hasExtraTime
                            ? t("settingsExtra", {
                                half: preset.halfLengthMinutes,
                                extra: preset.extraTimeLengthMinutes,
                              })
                            : t("settingsNoExtra", {
                                half: preset.halfLengthMinutes,
                              })}
                        </small>
                      </div>
                      <div className="preset-item-actions">
                        <button
                          className="text-button"
                          onClick={() => openPresetEditor(preset)}
                          type="button"
                        >
                          {t("edit")}
                        </button>
                        <button
                          className="text-button destructive-text"
                          onClick={() => deletePreset(preset)}
                          type="button"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {selectedPauseRecords.length > 0 || pauseDurationNow !== null ? (
            <details className="modal-section pause-log-section">
              <summary>
                <span>{t("pauseTimes")}</span>
                <span className="pause-log-count">
                  {selectedPauseRecords.length +
                    (pauseDurationNow === null ? 0 : 1)}
                  <span aria-hidden="true">⌄</span>
                </span>
              </summary>
              <ol className="pause-list">
                {selectedPauseRecords.map((pause, index) => (
                  <li key={`${pause.startedAt}-${index}`}>
                    <span className="pause-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
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
                {pauseDurationNow !== null && (
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
              <div className="pause-total">
                <span>{t("totalPauseTime")}</span>
                <strong>
                  {formatClockTime(
                    selectedPauseRecords.reduce(
                      (total, pause) => total + pause.durationMs,
                      0,
                    ) + (pauseDurationNow ?? 0),
                  )}
                </strong>
              </div>
            </details>
          ) : null}

          <section className="about-entry">
            <div>
              <h3>{t("about")}</h3>
              <p>{t("aboutShort")}</p>
            </div>
            <button
              className="small-secondary-button"
              onClick={() => setModal("about")}
              type="button"
            >
              {t("about")}
            </button>
          </section>
        </ModalShell>
      )}

      {modal === "setup" && (
        <ModalShell
          closeLabel={t("close")}
          onClose={() => setModal(null)}
          title={t("setUpMatch")}
        >
          <form className="modal-form" onSubmit={handleSetupSubmit}>
            <p className="modal-intro">{t("setupDescription")}</p>
            <div className="setup-period-fields modal-period-fields">
              <label className="number-field">
                <span>{t("eachHalf")}</span>
                <span className="input-with-unit">
                  <input
                    inputMode="numeric"
                    max="180"
                    min="1"
                    onChange={(event) => {
                      const halfLengthMinutes =
                        event.currentTarget.valueAsNumber;
                      if (
                        Number.isInteger(halfLengthMinutes) &&
                        halfLengthMinutes >= 1 &&
                        halfLengthMinutes <= 180
                      ) {
                        setSetupDraft((current) => ({
                          ...current,
                          halfLengthMinutes,
                        }));
                      }
                    }}
                    step="1"
                    type="number"
                    value={setupDraft.halfLengthMinutes}
                  />
                  <small>{t("minUnit")}</small>
                </span>
              </label>
              <label className="number-field">
                <span>{t("extraPeriods")}</span>
                <span className="input-with-unit">
                  <input
                    disabled={!setupDraft.hasExtraTime}
                    inputMode="numeric"
                    max="180"
                    min="1"
                    onChange={(event) => {
                      const extraTimeLengthMinutes =
                        event.currentTarget.valueAsNumber;
                      if (
                        Number.isInteger(extraTimeLengthMinutes) &&
                        extraTimeLengthMinutes >= 1 &&
                        extraTimeLengthMinutes <= 180
                      ) {
                        setSetupDraft((current) => ({
                          ...current,
                          extraTimeLengthMinutes,
                        }));
                      }
                    }}
                    step="1"
                    type="number"
                    value={setupDraft.extraTimeLengthMinutes}
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
                checked={setupDraft.hasExtraTime}
                onChange={(event) => {
                  const hasExtraTime = event.currentTarget.checked;
                  setSetupDraft((current) => ({
                    ...current,
                    hasExtraTime,
                  }));
                }}
                type="checkbox"
              />
            </label>
            <label className="setting-toggle save-preset-toggle">
              <span>
                <strong>{t("saveAsPreset")}</strong>
                <small>{t("saveAsPresetHelp")}</small>
              </span>
              <input
                checked={setupSaveAsPreset}
                onChange={(event) => {
                  setSetupSaveAsPreset(event.currentTarget.checked);
                  setSetupError(null);
                }}
                type="checkbox"
              />
            </label>
            {setupSaveAsPreset && (
              <label className="number-field preset-name-field">
                <span>{t("presetName")}</span>
                <input
                  autoComplete="off"
                  maxLength={40}
                  onChange={(event) => {
                    setSetupPresetName(event.currentTarget.value);
                    setSetupError(null);
                  }}
                  value={setupPresetName}
                />
              </label>
            )}
            {setupError && (
              <p className="form-error" role="alert">
                {t(setupError)}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary-modal-button"
                onClick={() => setModal(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button className="primary-modal-button" type="submit">
                {t("continueToClock")}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal === "presetPicker" && (
        <ModalShell
          closeLabel={t("close")}
          onClose={() => setModal(null)}
          title={t("choosePreset")}
        >
          {presets.length === 0 ? (
            <div className="empty-preset-picker">
              <p>{t("noPresets")}</p>
              <button
                className="primary-modal-button"
                onClick={() => {
                  setModal(null);
                  openSetup();
                }}
                type="button"
              >
                {t("setUpMatch")}
              </button>
            </div>
          ) : (
            <ul className="preset-picker-list">
              {presets.map((preset) => (
                <li key={preset.id}>
                  <button
                    className="preset-picker-item"
                    onClick={() => startNewMatch(preset)}
                    type="button"
                  >
                    <span>
                      <strong>{preset.name}</strong>
                      <small>
                        {preset.hasExtraTime
                          ? t("settingsExtra", {
                              half: preset.halfLengthMinutes,
                              extra: preset.extraTimeLengthMinutes,
                            })
                          : t("settingsNoExtra", {
                              half: preset.halfLengthMinutes,
                            })}
                      </small>
                    </span>
                    <span aria-hidden="true" className="preset-picker-arrow">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ModalShell>
      )}

      {modal === "presetEditor" && presetDraft !== null && (
        <ModalShell
          closeLabel={t("close")}
          onClose={closePresetEditor}
          title={t(presetDraft.id === null ? "newPreset" : "editPreset")}
        >
          <form className="modal-form" onSubmit={savePresetDraft}>
            <label className="number-field preset-name-field">
              <span>{t("presetName")}</span>
              <input
                autoComplete="off"
                maxLength={40}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setPresetDraft((current) =>
                    current === null
                      ? current
                      : { ...current, name },
                  );
                  setPresetError(null);
                }}
                value={presetDraft.name}
              />
            </label>
            <div className="setup-period-fields modal-period-fields">
              <label className="number-field">
                <span>{t("eachHalf")}</span>
                <span className="input-with-unit">
                  <input
                    inputMode="numeric"
                    max="180"
                    min="1"
                    onChange={(event) => {
                      const halfLengthMinutes =
                        event.currentTarget.valueAsNumber;
                      if (
                        Number.isInteger(halfLengthMinutes) &&
                        halfLengthMinutes >= 1 &&
                        halfLengthMinutes <= 180
                      ) {
                        setPresetDraft((current) =>
                          current === null
                            ? current
                            : { ...current, halfLengthMinutes },
                        );
                      }
                    }}
                    step="1"
                    type="number"
                    value={presetDraft.halfLengthMinutes}
                  />
                  <small>{t("minUnit")}</small>
                </span>
              </label>
              <label className="number-field">
                <span>{t("extraPeriods")}</span>
                <span className="input-with-unit">
                  <input
                    disabled={!presetDraft.hasExtraTime}
                    inputMode="numeric"
                    max="180"
                    min="1"
                    onChange={(event) => {
                      const extraTimeLengthMinutes =
                        event.currentTarget.valueAsNumber;
                      if (
                        Number.isInteger(extraTimeLengthMinutes) &&
                        extraTimeLengthMinutes >= 1 &&
                        extraTimeLengthMinutes <= 180
                      ) {
                        setPresetDraft((current) =>
                          current === null
                            ? current
                            : { ...current, extraTimeLengthMinutes },
                        );
                      }
                    }}
                    step="1"
                    type="number"
                    value={presetDraft.extraTimeLengthMinutes}
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
                checked={presetDraft.hasExtraTime}
                onChange={(event) => {
                  const hasExtraTime = event.currentTarget.checked;
                  setPresetDraft((current) =>
                    current === null
                      ? current
                      : {
                          ...current,
                          hasExtraTime,
                        },
                  );
                }}
                type="checkbox"
              />
            </label>
            {presetError && (
              <p className="form-error" role="alert">
                {t(presetError)}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary-modal-button"
                onClick={closePresetEditor}
                type="button"
              >
                {t("cancel")}
              </button>
              <button className="primary-modal-button" type="submit">
                {t("save")}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal === "correction" && (
        <ModalShell
          closeLabel={t("close")}
          onClose={() => setModal(null)}
          title={t("correctTime")}
        >
          <form className="modal-form" onSubmit={handleApplyCorrection}>
            <p className="modal-intro">
              {t("correctHelper", {
                phase: phaseLabel(correctionPhase, displayMessages),
              })}
            </p>
            <label className="number-field">
              <span>{t("selectPeriod")}</span>
              <select
                className="preference-select"
                onChange={(event) => {
                  const selectedPhase = event.currentTarget.value;
                  if (
                    MATCH_PHASES.some((phase) => phase === selectedPhase) &&
                    availablePhases.includes(selectedPhase as MatchPhase)
                  ) {
                    setCorrectionPhase(selectedPhase as MatchPhase);
                    setCorrectionError(null);
                  }
                }}
                value={correctionPhase}
              >
                {availablePhases.map((phase) => (
                  <option key={phase} value={phase}>
                    {phaseShortLabel(phase, displayMessages)} ·{" "}
                    {phaseLabel(phase, displayMessages)}
                  </option>
                ))}
              </select>
            </label>
            <div className="correction-tools">
              <span className="eyebrow">{t("quickAdjustment")}</span>
              <button
                className="text-button"
                onClick={loadCurrentTimeIntoCorrection}
                type="button"
              >
                {t("useLiveTime")}
              </button>
            </div>
            <div className="correction-time-grid">
              <label className="number-field">
                <span>{t("minutes")}</span>
                <input
                  inputMode="numeric"
                  max="999"
                  min="0"
                  onChange={(event) => {
                    setCorrectionMinutes(event.currentTarget.value);
                    setCorrectionError(null);
                  }}
                  type="number"
                  value={correctionMinutes}
                />
              </label>
              <span aria-hidden="true" className="time-colon">
                :
              </span>
              <label className="number-field">
                <span>{t("seconds")}</span>
                <input
                  inputMode="numeric"
                  max="59"
                  min="0"
                  onChange={(event) => {
                    setCorrectionSeconds(event.currentTarget.value);
                    setCorrectionError(null);
                  }}
                  type="number"
                  value={correctionSeconds}
                />
              </label>
            </div>
            {correctionError && (
              <p className="form-error" role="alert">
                {t(correctionError.key, correctionError.parameters)}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="secondary-modal-button"
                onClick={() => setModal(null)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button className="primary-modal-button" type="submit">
                {t("apply")}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {modal === "about" && (
        <ModalShell
          closeLabel={t("close")}
          onClose={() => setModal("settings")}
          title={t("about")}
        >
          <div className="about-content">
            <p>{t("aboutDescription")}</p>
            <div className="about-platform-note">
              <span aria-hidden="true">ⓘ</span>
              <p>{t("platformNote")}</p>
            </div>
            <section className="license-info">
              <h3>{t("licenses")}</h3>
              <p>{t("licenseDescription")}</p>
              <a href="/licenses/DSEG-OFL-1.1.txt" rel="noreferrer" target="_blank">
                {t("fontLicense")}
              </a>
            </section>
          </div>
          <div className="modal-actions">
            <button
              className="primary-modal-button"
              onClick={() => setModal("settings")}
              type="button"
            >
              {t("close")}
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "installHelp" && (
        <ModalShell
          closeLabel={t("close")}
          onClose={() => setModal(null)}
          title={t("installInstructionsTitle")}
        >
          <p className="install-instructions">{t(installInstructionsKey)}</p>
          <div className="modal-actions">
            <button
              className="primary-modal-button"
              onClick={() => setModal(null)}
              type="button"
            >
              {t("close")}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default App;
