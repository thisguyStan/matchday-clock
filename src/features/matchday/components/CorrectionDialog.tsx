import type {
  Dispatch,
  FormEventHandler,
  SetStateAction,
} from "react";
import {
  MATCH_PHASES,
  type MatchPhase,
} from "../../../utils/match-clock";
import {
  phaseLabel,
  phaseShortLabel,
} from "../../../utils/formatting";
import type {
  LocaleMessages,
  Translator,
} from "../../../utils/i18n";
import type { LocalizedMessage } from "../types";
import { ModalShell } from "../../../components/ui/ModalShell";

interface CorrectionDialogProps {
  phase: MatchPhase;
  setPhase: Dispatch<SetStateAction<MatchPhase>>;
  availablePhases: MatchPhase[];
  minutes: string;
  setMinutes: Dispatch<SetStateAction<string>>;
  seconds: string;
  setSeconds: Dispatch<SetStateAction<string>>;
  error: LocalizedMessage | null;
  setError: Dispatch<SetStateAction<LocalizedMessage | null>>;
  messages: LocaleMessages | null;
  t: Translator;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onLoadLiveTime: () => void;
}

export function CorrectionDialog({
  phase,
  setPhase,
  availablePhases,
  minutes,
  setMinutes,
  seconds,
  setSeconds,
  error,
  setError,
  messages,
  t,
  onClose,
  onSubmit,
  onLoadLiveTime,
}: CorrectionDialogProps) {
  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
      title={t("correctTime")}
    >
      <form className="modal-form" onSubmit={onSubmit}>
        <p className="modal-intro">
          {t("correctHelper", { phase: phaseLabel(phase, messages) })}
        </p>
        <label className="number-field">
          <span>{t("selectPeriod")}</span>
          <select
            className="preference-select"
            onChange={(event) => {
              const selectedPhase = MATCH_PHASES.find(
                (candidate) => candidate === event.currentTarget.value,
              );
              if (
                selectedPhase !== undefined &&
                availablePhases.includes(selectedPhase)
              ) {
                setPhase(selectedPhase);
                setError(null);
              }
            }}
            value={phase}
          >
            {availablePhases.map((option) => (
              <option key={option} value={option}>
                {phaseShortLabel(option, messages)} ·{" "}
                {phaseLabel(option, messages)}
              </option>
            ))}
          </select>
        </label>
        <div className="correction-tools">
          <span className="eyebrow">{t("quickAdjustment")}</span>
          <button
            aria-label={t("useLiveTimeAria")}
            className="text-button"
            onClick={onLoadLiveTime}
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
                setMinutes(event.currentTarget.value);
                setError(null);
              }}
              type="number"
              value={minutes}
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
                setSeconds(event.currentTarget.value);
                setError(null);
              }}
              type="number"
              value={seconds}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {t(error.key, error.parameters)}
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
            {t("apply")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
