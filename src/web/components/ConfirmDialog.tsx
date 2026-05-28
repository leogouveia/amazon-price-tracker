import type { ComponentChildren } from "preact";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmClassName?: string;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ComponentChildren;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmClassName = "btn-primary",
  loading = false,
  loadingLabel = "Aguarde...",
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <dialog
      className={`modal ${open ? "modal-open" : ""}`}
      onClose={onCancel}
    >
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold">{title}</h3>

        {children}

        {description && (
          <p className="mt-4 text-sm text-base-content/70">{description}</p>
        )}

        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className={`btn ${confirmClassName}`}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-xs" />
                {loadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onCancel}>
          fechar
        </button>
      </form>
    </dialog>
  );
}
