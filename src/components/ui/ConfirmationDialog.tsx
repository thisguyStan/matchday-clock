import { ModalShell } from "./ModalShell";

interface ConfirmationDialogProps {
  cancelLabel: string;
  closeLabel: string;
  confirmLabel: string;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
}

export function ConfirmationDialog({
  cancelLabel,
  closeLabel,
  confirmLabel,
  message,
  onClose,
  onConfirm,
  title,
}: ConfirmationDialogProps) {
  return (
    <ModalShell
      closeLabel={closeLabel}
      descriptionId="confirmation-description"
      onClose={onClose}
      title={title}
    >
      <div className="confirmation-content">
        <p className="modal-intro" id="confirmation-description">
          {message}
        </p>
        <div className="modal-actions">
          <button
            className="secondary-modal-button"
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="destructive-modal-button"
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
