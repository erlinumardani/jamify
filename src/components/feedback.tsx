import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { Button, Modal } from './ui'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  /** label of the confirming button; name the action ("Delete project"), not "OK" */
  confirmLabel?: string
  cancelLabel?: string
  /** red confirm button for destructive actions */
  danger?: boolean
}

export interface ToastOptions {
  tone?: 'success' | 'error' | 'info'
  /** e.g. { label: 'Undo', onClick: restore } */
  action?: { label: string; onClick: () => void }
  /** ms before it disappears; defaults to 4s, or 6s when there is an action */
  duration?: number
}

interface FeedbackApi {
  /** Styled replacement for window.confirm(); resolves true when confirmed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Short message at the bottom of the screen; replaces alert() and silent successes. */
  notify: (message: string, options?: ToastOptions) => void
}

interface ToastItem { id: number; message: string; options: ToastOptions }

const FeedbackContext = createContext<FeedbackApi | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })), [])
  const notify = useCallback((message: string, options: ToastOptions = {}) => {
    const id = ++nextId.current
    // keep at most three on screen
    setToasts((ts) => [...ts.slice(-2), { id, message, options }])
  }, [])
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const answer = (ok: boolean) => {
    dialog?.resolve(ok)
    setDialog(null)
  }

  const api = useMemo(() => ({ confirm, notify }), [confirm, notify])

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Modal
        open={!!dialog}
        onClose={() => answer(false)}
        title={dialog?.title ?? ''}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => answer(false)}>{dialog?.cancelLabel ?? 'Cancel'}</Button>
            <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => answer(true)} autoFocus>
              {dialog?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {dialog?.message && <div className="text-sm leading-relaxed text-[#555]">{dialog.message}</div>}
      </Modal>
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => <Toast key={t.id} toast={t} onDone={() => dismiss(t.id)} />)}
      </div>
    </FeedbackContext.Provider>
  )
}

const TONE_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info }
const TONE_CLS = { success: 'text-green-300', error: 'text-red-300', info: 'text-sky-300' }

function Toast({ toast, onDone }: { toast: ToastItem; onDone: () => void }) {
  const { message, options } = toast
  const Icon = TONE_ICON[options.tone ?? 'success']
  useEffect(() => {
    const id = window.setTimeout(onDone, options.duration ?? (options.action ? 6000 : 4000))
    return () => window.clearTimeout(id)
    // one timer per toast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div role={options.tone === 'error' ? 'alert' : 'status'} className="ck-fade-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-sm bg-[#323232] py-2.5 pl-4 pr-2 text-sm text-white shadow-lg">
      <Icon size={17} className={`shrink-0 ${TONE_CLS[options.tone ?? 'success']}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      {options.action && (
        <button
          type="button"
          className="rounded-sm px-2 py-1 text-xs font-medium uppercase tracking-wide text-sky-300 hover:bg-white/10"
          onClick={() => { options.action!.onClick(); onDone() }}
        >
          {options.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" onClick={onDone}>
        <X size={15} />
      </button>
    </div>
  )
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider')
  return ctx
}
