import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md' | 'lg'

const variantCls: Record<Variant, string> = {
  primary: 'bg-ck-blue text-white hover:bg-ck-blue-dark disabled:bg-ck-blue/50',
  outline: 'border border-ck-blue text-ck-blue bg-white hover:bg-ck-blue-light',
  ghost: 'text-ck-text hover:bg-black/5',
  danger: 'bg-ck-red text-white hover:bg-ck-red-dark',
  link: 'text-ck-blue hover:underline px-0',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
}

export function Button({
  variant = 'primary', size = 'md', className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-sm font-medium uppercase tracking-wide transition-colors disabled:cursor-not-allowed',
        variantCls[variant], variant !== 'link' && sizeCls[size], className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({ className, children, title, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      {...rest}
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-ck-muted transition-colors hover:bg-black/5 hover:text-ck-text disabled:opacity-40', className)}
    >
      {children}
    </button>
  )
}

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside, active])
}

export function Popover({
  trigger, children, align = 'left', width = 280, className,
}: {
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  width?: number
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <div ref={ref} className={cn('relative', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={cn('ck-fade-in absolute z-40 mt-1 rounded-sm border border-ck-border-light bg-white shadow-[0_4px_16px_rgba(0,0,0,0.12)]', align === 'right' ? 'right-0' : 'left-0')}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = 480 }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        className="ck-fade-in w-full rounded-sm bg-white shadow-2xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-ck-border-light px-6 py-4">
          <h2 className="text-lg font-normal">{title}</h2>
          <IconButton title="Close" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ck-border-light bg-ck-bg px-6 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
        className={cn('relative inline-block h-5 w-9 rounded-full transition-colors', checked ? 'bg-ck-blue' : 'bg-ck-border')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}

export function Avatar({ name, size = 32, className, src }: { name: string; size?: number; className?: string; src?: string | null }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  if (src) {
    return <img src={src} alt={name} referrerPolicy="no-referrer" className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 55% 50%)` }}
    >
      {initials || '?'}
    </span>
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'blue' | 'green' | 'orange' }) {
  const tones = {
    gray: 'bg-black/5 text-[#666]',
    blue: 'bg-ck-blue-light text-ck-blue-dark',
    green: 'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
  }
  return <span className={cn('inline-block rounded-sm px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}

export function ProjectDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="text-base font-medium text-[#666]">{title}</div>
      {hint && <div className="max-w-sm text-sm text-ck-muted">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-light text-[#666]">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-ck-border-light">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium uppercase tracking-wide transition-colors',
            value === t.id ? 'border-ck-blue text-ck-blue' : 'border-transparent text-ck-muted hover:text-ck-text',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
