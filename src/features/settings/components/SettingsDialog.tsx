import {
  formatClockTime,
  type MatchClockState,
  type MatchSettings,
} from "../../../utils/match-clock";
import {
  isLanguagePreference,
  isThemePreference,
  LANGUAGE_OPTIONS,
  type LocaleCode,
  type LocaleMessages,
  type Translator,
  type UserPreferences,
} from "../../../utils/i18n";
import { formatPauseDate, phaseLabel } from "../../../utils/formatting";
import type { MatchPreset } from "../../matchday/types";
import { HourglassIcon } from "../../../components/ui/HourglassIcon";
import { ModalShell } from "../../../components/ui/ModalShell";

interface SettingsDialogProps {
  settings: MatchSettings;
  preferences: UserPreferences;
  presets: MatchPreset[];
  match: MatchClockState;
  pauseClockEnabled: boolean;
  pauseDurationNow: number | null;
  now: number;
  displayLocale: LocaleCode;
  messages: LocaleMessages | null;
  t: Translator;
  onClose: () => void;
  onOpenAbout: () => void;
  onOpenPresetEditor: (preset: MatchPreset | null) => void;
  onDeletePreset: (preset: MatchPreset) => void;
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void;
  onUpdateSettings: (patch: Partial<MatchSettings>) => void;
  onNotificationSetting: (enabled: boolean) => void;
  onPauseClockSetting: (enabled: boolean) => void;
}

export function SettingsDialog({
  settings,
  preferences,
  presets,
  match,
  pauseClockEnabled,
  pauseDurationNow,
  now,
  displayLocale,
  messages,
  t,
  onClose,
  onOpenAbout,
  onOpenPresetEditor,
  onDeletePreset,
  onUpdatePreferences,
  onUpdateSettings,
  onNotificationSetting,
  onPauseClockSetting,
}: SettingsDialogProps) {
  const pauses = match.pauses;

  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
      size="wide"
      title={t("settingsTitle")}
    >
      <div className="settings-modal-grid">
        <section
          className="modal-section"
          aria-labelledby="display-settings-heading"
        >
          <h3 id="display-settings-heading">{t("displaySettings")}</h3>
          <div className="preference-fields modal-preferences">
            <label className="number-field preference-field">
              <span>{t("language")}</span>
              <select
                className="preference-select"
                onChange={(event) => {
                  const language = event.currentTarget.value;
                  if (isLanguagePreference(language)) {
                    onUpdatePreferences({ language });
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
                    onUpdatePreferences({ theme: selectedTheme });
                  }
                }}
                value={preferences.theme}
              >
                <option value="system">{t("system")}</option>
                <option value="light">{t("light")}</option>
                <option value="dark">{t("dark")}</option>
                <option value="oled">OLED</option>
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
                onUpdateSettings({
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
                onNotificationSetting(event.currentTarget.checked)
              }
              type="checkbox"
            />
          </label>
          <label className="setting-toggle">
            <span>
              <span className="setting-toggle-heading">
                <HourglassIcon className="setting-hourglass-icon" />
                <strong>{t("trackLost")}</strong>
              </span>
              <small>{t("trackHelp")}</small>
            </span>
            <input
              checked={settings.trackStoppageTime}
              onChange={(event) =>
                onUpdateSettings({
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
                onPauseClockSetting(event.currentTarget.checked)
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
              onClick={() => onOpenPresetEditor(null)}
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
                      onClick={() => onOpenPresetEditor(preset)}
                      type="button"
                    >
                      {t("edit")}
                    </button>
                    <button
                      className="text-button destructive-text"
                      onClick={() => onDeletePreset(preset)}
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

      {pauses.length > 0 || pauseDurationNow !== null ? (
        <details className="modal-section pause-log-section">
          <summary>
            <span>{t("pauseTimes")}</span>
            <span className="pause-log-count">
              {pauses.length + (pauseDurationNow === null ? 0 : 1)}
              <span aria-hidden="true">⌄</span>
            </span>
          </summary>
          <ol className="pause-list">
            {pauses.map((pause, index) => (
              <li key={`${pause.startedAt}-${index}`}>
                <span className="pause-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="pause-detail">
                  <strong>{phaseLabel(pause.phase, messages)}</strong>
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
                pauses.reduce((total, pause) => total + pause.durationMs, 0) +
                  (pauseDurationNow ?? 0),
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
          onClick={onOpenAbout}
          type="button"
        >
          {t("about")}
        </button>
      </section>
    </ModalShell>
  );
}
