import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  finishTimeLostTracking,
  getMatchTimeMs,
  getPeriodElapsedMs,
  getTimeLostMs,
  isStoppageTime,
  type MatchClockState,
  type MatchSettings,
} from "../../../utils/match-clock";
import type {
  LocaleCode,
  LocaleMessages,
  MessageKey,
  Translator,
} from "../../../utils/i18n";
import type { LocalizedMessage } from "../types";

const RUNNING_NOTIFICATION_TAG = "matchday-clock-running";
const NOTIFICATION_PERMISSION_NOTICE_STORAGE_KEY =
  "matchday-clock:notification-permission-notice-date";

interface UseClockRuntimeResult {
  now: number;
  wakeStatus: MessageKey;
  running: boolean;
  breakRunning: boolean;
  activeClock: boolean;
  periodElapsedMs: number;
  matchTimeMs: number;
  timeLostMs: number;
  stoppageTime: boolean;
  pauseDurationNow: number | null;
  showRunningNotification: (
    requestPermission: boolean,
    forceEnabled?: boolean,
  ) => Promise<void>;
}

export function useClockRuntime(
  match: MatchClockState,
  setMatch: Dispatch<SetStateAction<MatchClockState>>,
  settings: MatchSettings,
  messages: LocaleMessages | null,
  displayLocale: LocaleCode,
  t: Translator,
  setFeedback: Dispatch<SetStateAction<LocalizedMessage | null>>,
): UseClockRuntimeResult {
  const [now, setNow] = useState(() => Date.now());
  const [wakeStatus, setWakeStatus] = useState<MessageKey>("wakeIdle");
  const notificationPermissionNoticeDate = useRef<string | null>(null);
  const running = match.status === "running";
  const breakRunning = match.status === "break";
  const activeClock = running || breakRunning;
  const periodElapsedMs = getPeriodElapsedMs(match, now);
  const matchTimeMs = getMatchTimeMs(match, settings, now);
  const timeLostMs = getTimeLostMs(match, now);
  const stoppageTime = isStoppageTime(match, settings, now);
  const pauseDurationNow =
    (match.status === "paused" || match.status === "break") &&
    match.pauseStartedAt !== null
      ? Math.max(0, now - match.pauseStartedAt)
      : null;

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

  const showNotificationPermissionNotice = useCallback(
    (key: "notificationDenied" | "notificationPermission") => {
      const date = new Date();
      const today = [
        String(date.getFullYear()).padStart(4, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      if (notificationPermissionNoticeDate.current === today) {
        return;
      }

      try {
        if (
          window.localStorage.getItem(
            NOTIFICATION_PERMISSION_NOTICE_STORAGE_KEY,
          ) === today
        ) {
          notificationPermissionNoticeDate.current = today;
          return;
        }
        window.localStorage.setItem(
          NOTIFICATION_PERMISSION_NOTICE_STORAGE_KEY,
          today,
        );
      } catch (error) {
        console.error(
          "Could not persist the daily notification permission notice.",
          error,
        );
      }

      notificationPermissionNoticeDate.current = today;
      setFeedback({ key });
    },
    [setFeedback],
  );

  useEffect(() => {
    if (!activeClock || !settings.keepScreenAwake) {
      setWakeStatus(settings.keepScreenAwake ? "wakeIdle" : "wakeOff");
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

  const showRunningNotification = useCallback(
    async (requestPermission: boolean, forceEnabled = false) => {
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
          showNotificationPermissionNotice(
            permission === "denied"
              ? "notificationDenied"
              : "notificationPermission",
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
      } catch (error) {
        console.error("Could not show a running notification.", error);
        setFeedback({ key: "notificationFailed" });
      }
    },
    [
      settings.showRunningNotification,
      setFeedback,
      showNotificationPermissionNotice,
      t,
    ],
  );

  const closeRunningNotification = useCallback(async () => {
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
  }, [setFeedback]);

  useEffect(() => {
    if (messages === null) {
      return;
    }
    if (activeClock && settings.showRunningNotification) {
      if ("Notification" in window && Notification.permission === "granted") {
        void showRunningNotification(false);
      }
      return;
    }
    void closeRunningNotification();
  }, [
    activeClock,
    closeRunningNotification,
    displayLocale,
    messages,
    settings.showRunningNotification,
    showRunningNotification,
  ]);

  return {
    now,
    wakeStatus,
    running,
    breakRunning,
    activeClock,
    periodElapsedMs,
    matchTimeMs,
    timeLostMs,
    stoppageTime,
    pauseDurationNow,
    showRunningNotification,
  };
}
