"use client"

import { Check, Circle, Loader2, X } from "lucide-react"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * Stepper vertical pour suivre le déroulé de réflexion d'un agent (OODA, plan d'exécution).
 * Animé (framer-motion) : entrée décalée, transition d'icône de statut, pulse sur l'étape active,
 * connecteur qui se remplit à mesure que les étapes sont terminées.
 */
export type StepStatus = "pending" | "active" | "done" | "error"

export interface Step {
  title: string
  description?: string
  status?: StepStatus
}

export interface StepsProps {
  steps: Step[]
  className?: string
}

const reduce =
  typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, x: reduce ? 0 : -8 },
  visible: { opacity: 1, x: 0, transition: { type: reduce ? "tween" : "spring", stiffness: 500, damping: 30 } },
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <Check className="size-3.5 text-emerald-500" />
  if (status === "active") return <Loader2 className="size-3.5 animate-spin text-amber-500" />
  if (status === "error") return <X className="size-3.5 text-destructive" />
  return <Circle className="size-3 text-muted-foreground/40" />
}

export function Steps({ steps, className }: StepsProps) {
  return (
    <motion.ol
      className={cn("my-2 space-y-0", className)}
      variants={listVariants}
      initial="hidden"
      animate="visible"
    >
      {steps.map((s, i) => {
        const status = s.status ?? "pending"
        const isLast = i === steps.length - 1
        const done = status === "done"
        return (
          <motion.li key={`${i}-${s.title}`} className="flex gap-3" variants={itemVariants}>
            <div className="flex flex-col items-center">
              <div className="relative flex size-6 items-center justify-center rounded-full border bg-background">
                {status === "active" && !reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-amber-500/25"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <AnimatePresence mode="wait">
                  <motion.span
                    key={status}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2 }}
                    className="relative inline-flex"
                  >
                    <StepIcon status={status} />
                  </motion.span>
                </AnimatePresence>
              </div>
              {!isLast && (
                <div className="relative w-px flex-1 bg-border">
                  <motion.div
                    className="absolute inset-0 origin-top bg-emerald-500/60"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: done ? 1 : 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
            <div className={cn("pb-3", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm leading-tight",
                  status === "pending" ? "text-muted-foreground" : "font-medium",
                  status === "error" && "text-destructive"
                )}
              >
                {s.title}
              </p>
              {s.description && <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>}
            </div>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}
