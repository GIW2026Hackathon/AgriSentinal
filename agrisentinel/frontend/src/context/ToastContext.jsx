import { createContext, useCallback, useContext, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '../lib/utils'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const TONES = {
  success: 'bg-forest-900 text-cream-50',
  error: 'bg-[#5c2119] text-cream-50',
  warning: 'bg-[#6b4a16] text-cream-50',
  info: 'bg-forest-800 text-cream-50',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (options) => {
      const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: 'success',
        duration: 4600,
        ...(typeof options === 'string' ? { title: options } : options),
      }
      setToasts((list) => [...list.slice(-3), item])
      if (item.duration > 0) {
        setTimeout(() => dismiss(item.id), item.duration)
      }
      return item.id
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-end gap-2 p-4 sm:p-6">
        {toasts.map((item) => {
          const Icon = ICONS[item.type] || Info
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto animate-rise flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3.5 shadow-lift',
                TONES[item.type] || TONES.info,
              )}
              role="status"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-agri-lime" strokeWidth={2.2} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{item.title}</p>
                {item.message ? <p className="mt-1 text-xs leading-relaxed opacity-75">{item.message}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-full p-1 opacity-60 transition hover:bg-white/10 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
