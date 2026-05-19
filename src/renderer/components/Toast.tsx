import { createPortal } from 'react-dom'
import { X, AlertCircle, CheckCircle } from 'lucide-react'
import type { Toast as ToastData } from '../hooks/useToast'

export function ToastContainer({ toasts, removeToast }: {
  toasts: ToastData[]
  removeToast: (id: number) => void
}) {
  if (toasts.length === 0) return null

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-3 py-2 rounded-md shadow-lg border text-xs font-medium max-w-sm modal-animate-in ${
            toast.type === 'error'
              ? 'bg-danger-subtle border-danger/30 text-danger'
              : 'bg-success-subtle border-success/30 text-success'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
