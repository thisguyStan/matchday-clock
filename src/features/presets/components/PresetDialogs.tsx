import type {
  Dispatch,
  FormEventHandler,
  SetStateAction,
} from "react";
import type { MessageKey, Translator } from "../../../utils/i18n";
import type { MatchPreset, PresetDraft } from "../../matchday/types";
import { ModalShell } from "../../../components/ui/ModalShell";

interface PresetPickerDialogProps {
  presets: MatchPreset[];
  t: Translator;
  onClose: () => void;
  onOpenSetup: () => void;
  onSelectPreset: (preset: MatchPreset) => void;
}

export function PresetPickerDialog({
  presets,
  t,
  onClose,
  onOpenSetup,
  onSelectPreset,
}: PresetPickerDialogProps) {
  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
      title={t("choosePreset")}
    >
      {presets.length === 0 ? (
        <div className="empty-preset-picker">
          <p>{t("noPresets")}</p>
          <button
            className="primary-modal-button"
            onClick={onOpenSetup}
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
                onClick={() => onSelectPreset(preset)}
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
  );
}

interface PresetEditorDialogProps {
  draft: PresetDraft;
  setDraft: Dispatch<SetStateAction<PresetDraft | null>>;
  error: MessageKey | null;
  t: Translator;
  onClose: () => void;
  onSave: FormEventHandler<HTMLFormElement>;
  onClearError: () => void;
}

export function PresetEditorDialog({
  draft,
  setDraft,
  error,
  t,
  onClose,
  onSave,
  onClearError,
}: PresetEditorDialogProps) {
  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
      title={t(draft.id === null ? "newPreset" : "editPreset")}
    >
      <form className="modal-form" onSubmit={onSave}>
        <label className="number-field preset-name-field">
          <span>{t("presetName")}</span>
          <input
            autoComplete="off"
            maxLength={40}
            onChange={(event) => {
              const name = event.currentTarget.value;
              setDraft((current) =>
                current === null ? current : { ...current, name },
              );
              onClearError();
            }}
            value={draft.name}
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
                  const halfLengthMinutes = event.currentTarget.valueAsNumber;
                  if (
                    Number.isInteger(halfLengthMinutes) &&
                    halfLengthMinutes >= 1 &&
                    halfLengthMinutes <= 180
                  ) {
                    setDraft((current) =>
                      current === null
                        ? current
                        : { ...current, halfLengthMinutes },
                    );
                  }
                }}
                step="1"
                type="number"
                value={draft.halfLengthMinutes}
              />
              <small>{t("minUnit")}</small>
            </span>
          </label>
          <label className="number-field">
            <span>{t("extraPeriods")}</span>
            <span className="input-with-unit">
              <input
                disabled={!draft.hasExtraTime}
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
                    setDraft((current) =>
                      current === null
                        ? current
                        : { ...current, extraTimeLengthMinutes },
                    );
                  }
                }}
                step="1"
                type="number"
                value={draft.extraTimeLengthMinutes}
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
            checked={draft.hasExtraTime}
            onChange={(event) => {
              const hasExtraTime = event.currentTarget.checked;
              setDraft((current) =>
                current === null ? current : { ...current, hasExtraTime },
              );
            }}
            type="checkbox"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="secondary-modal-button"
            onClick={onClose}
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
  );
}
