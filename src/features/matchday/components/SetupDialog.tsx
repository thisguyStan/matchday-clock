import type {
  Dispatch,
  FormEventHandler,
  SetStateAction,
} from "react";
import type { MessageKey, Translator } from "../../../utils/i18n";
import type { MatchConfiguration } from "../types";
import { ModalShell } from "../../../components/ui/ModalShell";

interface SetupDialogProps {
  draft: MatchConfiguration;
  setDraft: Dispatch<SetStateAction<MatchConfiguration>>;
  saveAsPreset: boolean;
  setSaveAsPreset: Dispatch<SetStateAction<boolean>>;
  presetName: string;
  setPresetName: Dispatch<SetStateAction<string>>;
  error: MessageKey | null;
  setError: Dispatch<SetStateAction<MessageKey | null>>;
  t: Translator;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function SetupDialog({
  draft,
  setDraft,
  saveAsPreset,
  setSaveAsPreset,
  presetName,
  setPresetName,
  error,
  setError,
  t,
  onClose,
  onSubmit,
}: SetupDialogProps) {
  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
      title={t("setUpMatch")}
    >
      <form className="modal-form" onSubmit={onSubmit}>
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
                  const halfLengthMinutes = event.currentTarget.valueAsNumber;
                  if (
                    Number.isInteger(halfLengthMinutes) &&
                    halfLengthMinutes >= 1 &&
                    halfLengthMinutes <= 180
                  ) {
                    setDraft((current) => ({
                      ...current,
                      halfLengthMinutes,
                    }));
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
                    setDraft((current) => ({
                      ...current,
                      extraTimeLengthMinutes,
                    }));
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
              setDraft((current) => ({ ...current, hasExtraTime }));
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
            checked={saveAsPreset}
            onChange={(event) => {
              setSaveAsPreset(event.currentTarget.checked);
              setError(null);
            }}
            type="checkbox"
          />
        </label>
        {saveAsPreset && (
          <label className="number-field preset-name-field">
            <span>{t("presetName")}</span>
            <input
              autoComplete="off"
              maxLength={40}
              onChange={(event) => {
                setPresetName(event.currentTarget.value);
                setError(null);
              }}
              value={presetName}
            />
          </label>
        )}
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
            {t("continueToClock")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
