import { useEffect, useRef } from 'react';
import { cn } from '../cn';

export interface MenuItem { label: string; onSelect: () => void; destructive?: boolean; disabled?: boolean; separatorBefore?: boolean }
// Right-click menu shown at the pointer; closes on outside click, Escape, scroll, or a choice.
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: Event) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key); window.addEventListener('blur', onClose);
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  // Keep the menu inside the window.
  const left = Math.min(x, window.innerWidth - 230); const top = Math.min(y, window.innerHeight - items.length * 30 - 24);
  return <div ref={menu} role="menu" style={{ left, top }} className="fixed z-[80] w-56 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-xl p-1 shadow-2xl text-xs">
    {items.map(item => <div key={item.label}>
      {item.separatorBefore && <div className="my-1 border-t border-[var(--border-subtle)]" />}
      <button role="menuitem" type="button" disabled={item.disabled} onClick={() => { onClose(); item.onSelect(); }}
        className={cn('w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-card)] focus:bg-[var(--bg-card)] focus:outline-none disabled:opacity-40', item.destructive ? 'text-rose-500' : 'text-[var(--text-primary)]')}>{item.label}</button>
    </div>)}
  </div>;
}
