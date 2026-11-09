"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Heart, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"

const SUGGESTED_AMOUNTS = [5, 10, 25, 50]

export function SupportModal({
  currency,
  onClose,
  onConfirm,
}: {
  currency: string
  onClose: () => void
  onConfirm: (amount: number) => void
}) {
  const { t } = useLocale()
  const [selected, setSelected] = useState<number | null>(SUGGESTED_AMOUNTS[1])
  const [customAmount, setCustomAmount] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const amount = customAmount.trim() !== "" ? Number(customAmount) : selected ?? 0
  const isValid = Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER / 100 && Number(amount.toFixed(2)) === amount

  function handleConfirm() {
    if (!isValid || confirmed) return
    onConfirm(amount)
    setConfirmed(true)
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/70">
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <Heart className="size-5 text-primary" />
            {t("modal_title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common_close")}
            autoFocus
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p id={descriptionId} className="mb-4 text-xs leading-relaxed text-muted-foreground">{t("modal_intro")}</p>

        {confirmed ? (
          <div role="status" className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Heart className="size-6" />
            </span>
            <p className="text-sm font-medium text-foreground">{t("modal_thanks_title")}</p>
            <p className="text-xs text-muted-foreground">{t("modal_thanks_sub")}</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("modal_choose_amount")}</p>
            <div className="mb-3 grid grid-cols-4 gap-2">
              {SUGGESTED_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSelected(value)
                    setCustomAmount("")
                  }}
                  aria-pressed={selected === value && customAmount.trim() === ""}
                  className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                    selected === value && customAmount.trim() === ""
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:bg-accent"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <label className="mb-4 block space-y-1.5">
              <span className="block text-xs font-medium text-muted-foreground">
                {t("modal_custom_amount", { currency })}
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value)
                  setSelected(null)
                }}
                placeholder={t("modal_placeholder")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>

            <button
              type="button"
              disabled={!isValid}
              onClick={handleConfirm}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Heart className="size-4" />
              {t("modal_confirm")}
              {isValid ? ` (${currency} ${amount})` : ""}
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}
