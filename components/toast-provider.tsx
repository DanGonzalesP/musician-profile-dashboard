"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, XCircle } from "lucide-react"

type ToastVariant = "success" | "error"

type Toast = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS: Record<ToastVariant, number> = {
  success: 3200,
  error: 5000,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = idRef.current++
      setToasts((current) => [...current, { id, message, variant }])
      setTimeout(() => dismiss(id), DURATION_MS[variant])
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md"
            >
              {toast.variant === "success" ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="size-5 shrink-0 text-destructive" />
              )}
              <p className="text-sm font-medium leading-snug text-foreground">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Fallback a alert() nativo solo por seguridad si algo se renderiza fuera
 * del ToastProvider raíz (no debería pasar en la práctica).
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      showToast: (message) => window.alert(message),
    }
  }
  return ctx
}
