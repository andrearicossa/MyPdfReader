import { useLayoutEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** Dialogo nativo: focus trap, Escape e sfondo inerte senza librerie aggiuntive. */
export function ReaderDialog({
  open,
  title,
  onClose,
  children,
  className = '',
  id,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ComponentChildren;
  className?: string;
  id: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement>();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement as HTMLElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true });
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      class={`reader-dialog ${className}`}
      aria-label={title}
      data-testid={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Tab') return;
        const dialog = e.currentTarget;
        const items = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex]',
          ),
        ].filter(
          (el) => !el.matches(':disabled, [tabindex="-1"]') && el.getClientRects().length > 0,
        );
        const first = items[0],
          last = items.at(-1);
        if (
          (e.shiftKey && document.activeElement === first) ||
          (!e.shiftKey && document.activeElement === last)
        ) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <div class="reader-panel-heading">
        <h2>{title}</h2>
        <button
          type="button"
          class="reader-icon"
          aria-label={`Chiudi ${title.toLowerCase()}`}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div class="reader-dialog-content">{children}</div>
    </dialog>
  );
}
