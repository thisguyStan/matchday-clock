import {
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  createMatchClock,
  finishTimeLostTracking,
  formatClockTime,
  getAvailablePhases,
  getMatchTimeMs,
  getPhaseBaselineMs,
  pauseClock,
  setMatchTime,
  startClock,
  startTimeLostTracking,
  stopBreakClock,
  stopClock,
  type ClockStatus,
  type MatchSettings,
} from "./utils/match-clock";
import type { MessageKey, UserPreferences } from "./utils/i18n";
import { phaseLabel } from "./utils/formatting";
import { MatchScreens } from "./features/matchday/components/MatchScreens";
import { SetupDialog } from "./features/matchday/components/SetupDialog";
import { useSavedState } from "./features/matchday/hooks/useSavedState";
import { SettingsDialog } from "./features/settings/components/SettingsDialog";
import { CorrectionDialog } from "./features/matchday/components/CorrectionDialog";
import {
  AboutDialog,
  InstallHelpDialog,
} from "./features/settings/components/InformationDialogs";
import {
  PresetEditorDialog,
  PresetPickerDialog,
} from "./features/presets/components/PresetDialogs";
import { useLocalization } from "./features/settings/hooks/useLocalization";
import { useClockRuntime } from "./features/matchday/hooks/useClockRuntime";
import { usePwaInstall } from "./features/matchday/hooks/usePwaInstall";
import { ConfirmationDialog } from "./components/ui/ConfirmationDialog";
import type {
  ActiveModal,
  LocalizedMessage,
  MatchConfiguration,
  MatchPreset,
  PresetDraft,
} from "./features/matchday/types";

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

type PendingConfirmation =
  | { kind: "deletePreset"; preset: MatchPreset }
  | { kind: "reset" };

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
  const [feedback, setFeedback] = useState<LocalizedMessage | null>(null);
  const [modal, setModal] = useState<ActiveModal | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
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
  const {
    messages,
    displayLocale,
    t,
    localeLoadError,
  } = useLocalization(preferences, setFeedback);
  const {
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
  } = useClockRuntime(
    match,
    setMatch,
    settings,
    messages,
    displayLocale,
    t,
    setFeedback,
  );
  const {
    standalone,
    installDismissed,
    setInstallDismissed,
    installPlatform,
    handleInstall,
  } = usePwaInstall(() => setModal("installHelp"), setFeedback);
  const availablePhases = useMemo(
    () => getAvailablePhases(settings),
    [settings],
  );
  const displayMessages = messages;
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
    setPendingConfirmation({ kind: "deletePreset", preset });
    setModal("confirmation");
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
    setPendingConfirmation({ kind: "reset" });
    setModal("confirmation");
  }

  function cancelPendingConfirmation() {
    const returnToSettings = pendingConfirmation?.kind === "deletePreset";
    setPendingConfirmation(null);
    setModal(returnToSettings ? "settings" : null);
  }

  function confirmPendingAction() {
    if (pendingConfirmation === null) {
      return;
    }
    if (pendingConfirmation.kind === "deletePreset") {
      setPresets((current) =>
        current.filter((item) => item.id !== pendingConfirmation.preset.id),
      );
      setModal("settings");
      setFeedback({ key: "presetDeleted" });
    } else {
      setMatch(createMatchClock());
      setHasMatch(false);
      setModal(null);
      setFeedback({ key: "resetFeedback" });
    }
    setPendingConfirmation(null);
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

  function closePresetEditor() {
    setModal(presetEditorReturn ?? "settings");
  }

  const installInstructionsKey: MessageKey =
    installPlatform === "ios"
      ? "installInstructionsIOS"
      : installPlatform === "android"
        ? "installInstructionsAndroid"
        : "installInstructionsOther";
  if (messages === null) {
    return (
      <main
        aria-busy={!localeLoadError}
        aria-live="polite"
        className="app-shell min-h-dvh bg-[#0b1510] text-[#eff5ef]"
        role={localeLoadError ? "alert" : "status"}
      >
        <p className="p-6">
          {localeLoadError
            ? "Matchday Clock could not load its language data. Check your connection and reload the app."
            : "Loading Matchday Clock…"}
        </p>
        {localeLoadError && (
          <button
            className="primary-modal-button mx-6"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload app
          </button>
        )}
      </main>
    );
  }

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

      <MatchScreens
        hasMatch={hasMatch}
        settings={settings}
        match={match}
        settingsSummary={settingsSummary}
        statusLabel={statusLabel}
        messages={displayMessages}
        t={t}
        matchTimeMs={matchTimeMs}
        periodElapsedMs={periodElapsedMs}
        timeLostMs={timeLostMs}
        stoppageTime={stoppageTime}
        running={running}
        breakRunning={breakRunning}
        activeClock={activeClock}
        pauseDurationNow={pauseDurationNow}
        wakeStatus={wakeStatus}
        presetCount={presets.length}
        onOpenPresetPicker={() => setModal("presetPicker")}
        onUseLastSettings={() => startNewMatch(getConfiguration(settings))}
        onOpenSetup={openSetup}
        onStart={handleStart}
        onPause={handlePause}
        onStop={handleStop}
        onReset={handleReset}
        onCorrectTime={openCorrection}
        onBeginTracking={beginTracking}
        onEndTracking={endTracking}
        onTrackingKeyDown={handleTrackingKeyDown}
        onTrackingKeyUp={handleTrackingKeyUp}
      />

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
        <SettingsDialog
          settings={settings}
          preferences={preferences}
          presets={presets}
          match={match}
          pauseClockEnabled={pauseClockEnabled}
          pauseDurationNow={pauseDurationNow}
          now={now}
          displayLocale={displayLocale}
          messages={displayMessages}
          t={t}
          onClose={() => setModal(null)}
          onOpenAbout={() => setModal("about")}
          onOpenPresetEditor={openPresetEditor}
          onDeletePreset={deletePreset}
          onUpdatePreferences={updatePreferences}
          onUpdateSettings={updateSettings}
          onNotificationSetting={handleNotificationSetting}
          onPauseClockSetting={handlePauseClockSetting}
        />
      )}
      {modal === "setup" && (
        <SetupDialog
          draft={setupDraft}
          setDraft={setSetupDraft}
          saveAsPreset={setupSaveAsPreset}
          setSaveAsPreset={setSetupSaveAsPreset}
          presetName={setupPresetName}
          setPresetName={setSetupPresetName}
          error={setupError}
          setError={setSetupError}
          t={t}
          onClose={() => setModal(null)}
          onSubmit={handleSetupSubmit}
        />
      )}
      {modal === "presetPicker" && (
        <PresetPickerDialog
          presets={presets}
          t={t}
          onClose={() => setModal(null)}
          onOpenSetup={openSetup}
          onSelectPreset={startNewMatch}
        />
      )}
      {modal === "presetEditor" && presetDraft !== null && (
        <PresetEditorDialog
          draft={presetDraft}
          setDraft={setPresetDraft}
          error={presetError}
          t={t}
          onClose={closePresetEditor}
          onSave={savePresetDraft}
          onClearError={() => setPresetError(null)}
        />
      )}
      {modal === "correction" && (
        <CorrectionDialog
          phase={correctionPhase}
          setPhase={setCorrectionPhase}
          availablePhases={availablePhases}
          minutes={correctionMinutes}
          setMinutes={setCorrectionMinutes}
          seconds={correctionSeconds}
          setSeconds={setCorrectionSeconds}
          error={correctionError}
          setError={setCorrectionError}
          messages={displayMessages}
          t={t}
          onClose={() => setModal(null)}
          onSubmit={handleApplyCorrection}
          onLoadLiveTime={loadCurrentTimeIntoCorrection}
        />
      )}
      {modal === "about" && (
        <AboutDialog t={t} onClose={() => setModal("settings")} />
      )}
      {modal === "installHelp" && (
        <InstallHelpDialog
          t={t}
          instructionsKey={installInstructionsKey}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "confirmation" && pendingConfirmation !== null && (
        <ConfirmationDialog
          cancelLabel={t("cancel")}
          closeLabel={t("close")}
          confirmLabel={t(
            pendingConfirmation.kind === "deletePreset" ? "delete" : "reset",
          )}
          message={
            pendingConfirmation.kind === "deletePreset"
              ? t("deletePresetConfirm", {
                  name: pendingConfirmation.preset.name,
                })
              : t("resetConfirm")
          }
          onClose={cancelPendingConfirmation}
          onConfirm={confirmPendingAction}
          title={t(
            pendingConfirmation.kind === "deletePreset" ? "delete" : "reset",
          )}
        />
      )}
    </div>
  );
}

export default App;
