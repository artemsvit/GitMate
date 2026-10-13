import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption { value: string; label: string; group?: string; disabled?: boolean }
export function Dropdown({ label, value, options, onChange, multiple = false, placeholder = 'Choose…' }: {
  label: string; value: string | string[]; options: DropdownOption[]; onChange: (value: string) => void; multiple?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = Array.isArray(value) ? value : [value];
  const selectedSet = new Set(selected);
  const text = multiple ? (selected.length ? `${selected.length} destination${selected.length === 1 ? '' : 's'}` : placeholder) : options.find(option => option.value === value)?.label || placeholder;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    root.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="relative min-w-0" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
    if (event.key === 'Tab') setOpen(false);
  }}>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }} className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-[33px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] transition focus-visible:outline-2 focus-visible:outline-[var(--accent-violet)]">
      <span className="truncate">{text}</span><ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id={id} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} className="absolute top-full left-0 min-w-full w-max max-w-[min(36rem,80vw)] max-h-72 overflow-y-auto mt-1 z-50 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl p-1.5 shadow-none">
      {!options.length && <p className="p-2 text-xs text-[var(--text-muted)]">No destinations configured</p>}
      {options.map((option, index) => <React.Fragment key={option.value}>
        {option.group && option.group !== options[index - 1]?.group && <p className="px-2.5 pt-2 pb-1 text-[10px] font-mono text-[var(--text-muted)]">{option.group}</p>}
        <button role="option" aria-selected={selectedSet.has(option.value)} disabled={option.disabled} type="button" onClick={() => { onChange(option.value); if (!multiple) close(); }} className="w-full flex items-start gap-2 px-2.5 py-2 rounded-xl text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-card)] focus:bg-[var(--bg-card)] focus:outline-none disabled:opacity-40">
          <span className="w-3.5 shrink-0">{selectedSet.has(option.value) && <Check className="w-3.5 h-3.5 text-[var(--accent-violet)]" />}</span><span className="break-all">{option.label}</span>
        </button>
      </React.Fragment>)}
    </div>}
  </div>;
}
