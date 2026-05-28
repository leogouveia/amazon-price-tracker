import { ConfirmDialog } from "./ConfirmDialog";

type DeleteProductDialogProps = {
  open: boolean;
  loading?: boolean;
  title: string | null;
  asin: string;
  imageUrl: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteProductDialog({
  open,
  loading = false,
  title,
  asin,
  imageUrl,
  onConfirm,
  onCancel,
}: DeleteProductDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Remover produto?"
      description="O produto será removido do monitoramento. O histórico de preços permanece salvo no banco."
      confirmLabel="Sim, remover"
      cancelLabel="Cancelar"
      confirmClassName="btn-error"
      loading={loading}
      loadingLabel="Removendo..."
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="mt-4 flex gap-4">
        <img
          src={imageUrl ?? "https://placehold.co/80"}
          alt={title ?? asin}
          className="h-20 w-20 shrink-0 rounded-lg object-cover"
        />

        <div className="min-w-0">
          <p className="font-medium leading-snug">
            {title ?? "Produto sem título"}
          </p>
          <p className="mt-1 text-sm text-base-content/60">{asin}</p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
