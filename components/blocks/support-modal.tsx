"use client"

import { useState } from "react"
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

  const amount = customAmount.trim() !== "" ? Number(customAmount) : selected ?? 0
  const isValid = amount > 0

  function handleConfirm() {
    if (!isValid) return
    onConfirm(amount)
    setConfirmed(true)
    setTimeout(onClose, 1400)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <Heart className="size-5 text-primary" />
            {t("modal_title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common_close")}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {confirmed ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Heart className="size-6" />
            </span>
            <p className="text-sm font-medium text-foreground">{t("modal_thanks_title")}</p>
            <p className="text-xs text-muted-foreground">{t("modal_thanks_sub")}</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t("modal_intro")}</p>

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
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
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
                min="1"
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
    </div>
  )
}
