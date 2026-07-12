"use client"

import { Dialog } from "@base-ui/react/dialog"
import { useState } from "react"
import { Calendar, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { LessonPlan, LessonsBlock } from "@/lib/artist-data"

function BookingDialog({ plan }: { plan: LessonPlan }) {
  const [submitted, setSubmitted] = useState(false)

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) setSubmitted(false)
      }}
    >
      <Dialog.Trigger
        render={
          <Button
            variant={plan.highlighted ? "default" : "outline"}
            size="lg"
            className="w-full"
          />
        }
      >
        <Calendar />
        Book {plan.title}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl transition-all data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Close
            render={
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              />
            }
          >
            <X className="size-4" />
          </Dialog.Close>

          {submitted ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
                <Check className="size-6" />
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold text-foreground">
                Request sent
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Thanks for booking! Elena will reach out within 48 hours to
                confirm your {plan.title.toLowerCase()}.
              </p>
              <Dialog.Close render={<Button className="mt-6" />}>
                Done
              </Dialog.Close>
            </div>
          ) : (
            <>
              <Dialog.Title className="font-display text-xl font-semibold text-foreground">
                Book {plan.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                ${plan.price} {plan.cadence}. Fill in your details and Elena
                will confirm your session.
              </Dialog.Description>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setSubmitted(true)
                }}
                className="mt-5 flex flex-col gap-4"
              >
                <Field label="Full name" htmlFor="booking-name">
                  <input
                    id="booking-name"
                    required
                    autoComplete="name"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </Field>
                <Field label="Email" htmlFor="booking-email">
                  <input
                    id="booking-email"
                    type="email"
                    required
                    autoComplete="email"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </Field>
                <Field label="What do you want to work on?" htmlFor="booking-goal">
                  <textarea
                    id="booking-goal"
                    rows={3}
                    placeholder="Songwriting, guitar technique, home recording…"
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </Field>
                <Button type="submit" size="lg" className="mt-1 w-full">
                  Request booking
                </Button>
              </form>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function PlanCard({ plan }: { plan: LessonPlan }) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6",
        plan.highlighted
          ? "border-primary/60 bg-primary/[0.06]"
          : "border-border bg-card",
      )}
    >
      {plan.highlighted ? (
        <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          Popular
        </span>
      ) : null}
      <h3 className="font-display text-lg font-semibold text-foreground">
        {plan.title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums text-foreground">
          ${plan.price}
        </span>
        <span className="text-sm text-muted-foreground">{plan.cadence}</span>
      </div>

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-2.5 text-sm text-muted-foreground"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <BookingDialog plan={plan} />
      </div>
    </div>
  )
}

export function LessonsSection({ block }: { block: LessonsBlock }) {
  return (
    <section aria-labelledby="lessons-heading" className="scroll-mt-20">
      <div className="mb-5">
        <h2
          id="lessons-heading"
          className="font-display text-2xl font-semibold text-foreground sm:text-3xl"
        >
          {block.title}
        </h2>
        {block.subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{block.subtitle}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-background p-5 sm:p-8">
        <p className="max-w-2xl text-pretty leading-relaxed text-muted-foreground">
          {block.intro}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {block.plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </section>
  )
}
