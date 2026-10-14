import { useEffect, useId, useRef } from 'react';
import { cn } from '../cn';

// A small modal for decisions that change or remove data. The safe choice has focus.
export function ConfirmDialog({ open, title, message, confirmLabel, destructive = false, onConfirm, onCancel, children }: {
  open: boolean; title: string; message: React.ReactNode; confirmLabel: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void; children?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId(); const bodyId = useId();
  useEffect(() => { const node = dialog.current; if (!node) return; if (open && !node.open) node.showModal(); if (!open && node.open) node.close(); }, [open]);
  return <dialog ref={dialog} role="alertdialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={event => { event.preventDefault(); onCancel(); }}
    className="m-auto w-full max-w-sm rounded-2xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-5 backdrop:bg-black/60 text-xs">
    <h3 id={titleId} className="font-semibold text-sm text-balance">{title}</h3>
    <div id={bodyId} className="text-[11px] text-pretty text-[var(--text-muted)] mt-2 leading-relaxed">{message}</div>
    {children && <div className="mt-3">{children}</div>}
    <div className="flex justify-end gap-2 mt-5">
      <button type="button" autoFocus onClick={onCancel} className="px-3.5 py-1.5 rounded-full border border-[var(--border-interactive)] hover:bg-[var(--bg-card)]">Cancel</button>
      <button type="button" onClick={onConfirm} className={cn('px-3.5 py-1.5 rounded-full font-medium', destructive ? 'bg-rose-600 text-white hover:bg-rose-500' : 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:opacity-90')}>{confirmLabel}</button>
    </div>
  </dialog>;
}
