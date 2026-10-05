import type { MessageKey, Translator } from "../../../utils/i18n";
import { ModalShell } from "../../../components/ui/ModalShell";

interface AboutDialogProps {
  t: Translator;
  onClose: () => void;
}

export function AboutDialog({ t, onClose }: AboutDialogProps) {
  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
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
          onClick={onClose}
          type="button"
        >
          {t("close")}
        </button>
      </div>
    </ModalShell>
  );
}

interface InstallHelpDialogProps {
  t: Translator;
  instructionsKey: MessageKey;
  onClose: () => void;
}

export function InstallHelpDialog({
  t,
  instructionsKey,
  onClose,
}: InstallHelpDialogProps) {
  return (
    <ModalShell
      closeLabel={t("close")}
      onClose={onClose}
      title={t("installInstructionsTitle")}
    >
      <p className="install-instructions">{t(instructionsKey)}</p>
      <div className="modal-actions">
        <button
          className="primary-modal-button"
          onClick={onClose}
          type="button"
        >
          {t("close")}
        </button>
      </div>
    </ModalShell>
  );
}
