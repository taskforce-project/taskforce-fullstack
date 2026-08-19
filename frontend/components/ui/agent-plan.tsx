"use client"

import { useState } from "react"
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react"
import { motion, AnimatePresence, LayoutGroup, type Variants } from "framer-motion"

// ─────────────────────────────────────────────────────────────────────────────
// Types (exportés) — pilotés par le backend (workflow IA) : statut mis à jour en
// direct via STOMP. Composant purement **présentation** (pas de mutation locale).
// ─────────────────────────────────────────────────────────────────────────────

export type PlanStatus = "completed" | "in-progress" | "pending" | "need-help" | "failed"

export interface PlanSubtask {
  id: string
  title: string
  description: string
  status: PlanStatus
  priority?: string
  /** Outils MCP / capacités mobilisés par l'étape. */
  tools?: string[]
}

export interface PlanTask {
  id: string
  title: string
  description: string
  status: PlanStatus
  priority?: string
  level?: number
  dependencies?: string[]
  subtasks: PlanSubtask[]
}

function StatusIcon({ status, size }: Readonly<{ status: PlanStatus; size: string }>) {
  if (status === "completed") return <CheckCircle2 className={`${size} text-emerald-500`} />
  if (status === "in-progress") return <CircleDotDashed className={`${size} text-blue-500`} />
  if (status === "need-help") return <CircleAlert className={`${size} text-amber-500`} />
  if (status === "failed") return <CircleX className={`${size} text-rose-500`} />
  return <Circle className={`${size} text-muted-foreground`} />
}

const STATUS_BADGE: Record<PlanStatus, string> = {
  completed:     "bg-emerald-500/15 text-emerald-500",
  "in-progress": "bg-blue-500/15 text-blue-500",
  "need-help":   "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  failed:        "bg-rose-500/15 text-rose-500",
  pending:       "bg-muted text-muted-foreground",
}

const prefersReducedMotion =
  typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false

const taskVariants: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -5 },
  visible: { opacity: 1, y: 0, transition: { type: prefersReducedMotion ? "tween" : "spring", stiffness: 500, damping: 30 } },
  exit: { opacity: 0, y: prefersReducedMotion ? 0 : -5, transition: { duration: 0.15 } },
}
const subtaskListVariants: Variants = {
  hidden: { opacity: 0, height: 0, overflow: "hidden" },
  visible: { height: "auto", opacity: 1, overflow: "visible", transition: { duration: 0.25, staggerChildren: prefersReducedMotion ? 0 : 0.05, when: "beforeChildren", ease: [0.2, 0.65, 0.3, 0.9] } },
  exit: { height: 0, opacity: 0, overflow: "hidden", transition: { duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] } },
}
const subtaskVariants: Variants = {
  hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -10 },
  visible: { opacity: 1, x: 0, transition: { type: prefersReducedMotion ? "tween" : "spring", stiffness: 500, damping: 25 } },
  exit: { opacity: 0, x: prefersReducedMotion ? 0 : -10, transition: { duration: 0.15 } },
}
const subtaskDetailsVariants: Variants = {
  hidden: { opacity: 0, height: 0, overflow: "hidden" },
  visible: { opacity: 1, height: "auto", overflow: "visible", transition: { duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] } },
}

/**
 * Arbre de plan d'un workflow IA : tâches → sous-tâches, statut en direct, dépliable.
 * Read-only : reçoit `tasks` en props (source = backend), gère juste le pli/dépli local.
 */
export function AgentPlan({ tasks }: Readonly<{ tasks: PlanTask[] }>) {
  const [expandedTasks, setExpandedTasks] = useState<string[]>(() =>
    tasks.filter((t) => t.status === "in-progress").map((t) => t.id),
  )
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({})

  const toggleTask = (taskId: string) =>
    setExpandedTasks((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]))
  const toggleSubtask = (taskId: string, subtaskId: string) =>
    setExpandedSubtasks((prev) => ({ ...prev, [`${taskId}-${subtaskId}`]: !prev[`${taskId}-${subtaskId}`] }))

  return (
    <div className="overflow-auto bg-background p-1 text-foreground">
      <LayoutGroup>
        <ul className="space-y-1 overflow-hidden">
          {tasks.map((task, index) => {
            const isExpanded = expandedTasks.includes(task.id)
            const isCompleted = task.status === "completed"
            return (
              <motion.li key={task.id} className={index !== 0 ? "mt-1 pt-1" : ""} initial="hidden" animate="visible" variants={taskVariants}>
                {/* Ligne tâche */}
                <div className="group flex items-center rounded-md px-2 py-1.5 hover:bg-muted/40">
                  <span className="mr-2 flex-shrink-0">
                    <AnimatePresence mode="wait">
                      <motion.span key={task.status} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }} className="inline-flex">
                        <StatusIcon status={task.status} size="h-4 w-4" />
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <button type="button" className="flex min-w-0 flex-grow cursor-pointer items-center justify-between text-left" onClick={() => toggleTask(task.id)}>
                    <span className={`mr-2 flex-1 truncate text-sm ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</span>
                    <span className="flex flex-shrink-0 items-center gap-2 text-xs">
                      {task.dependencies && task.dependencies.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {task.dependencies.map((dep) => (
                            <span key={dep} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{dep}</span>
                          ))}
                        </span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[task.status]}`}>{task.status}</span>
                    </span>
                  </button>
                </div>

                {/* Sous-tâches */}
                <AnimatePresence mode="wait">
                  {isExpanded && task.subtasks.length > 0 && (
                    <motion.div className="relative overflow-hidden" variants={subtaskListVariants} initial="hidden" animate="visible" exit="hidden" layout>
                      <div className="absolute bottom-0 left-[19px] top-0 border-l-2 border-dashed border-muted-foreground/25" />
                      <ul className="mb-1.5 ml-3 mr-2 mt-1 space-y-0.5">
                        {task.subtasks.map((subtask) => {
                          const key = `${task.id}-${subtask.id}`
                          const isSubExpanded = expandedSubtasks[key]
                          return (
                            <motion.li key={subtask.id} className="group flex flex-col py-0.5 pl-6" variants={subtaskVariants} initial="hidden" animate="visible" exit="exit" layout>
                              <button type="button" className="flex flex-1 items-center rounded-md p-1 text-left hover:bg-muted/40" onClick={() => toggleSubtask(task.id, subtask.id)}>
                                <span className="mr-2 flex-shrink-0">
                                  <AnimatePresence mode="wait">
                                    <motion.span key={subtask.status} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.2 }} className="inline-flex">
                                      <StatusIcon status={subtask.status} size="h-3.5 w-3.5" />
                                    </motion.span>
                                  </AnimatePresence>
                                </span>
                                <span className={`text-[13px] ${subtask.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}>{subtask.title}</span>
                              </button>

                              <AnimatePresence mode="wait">
                                {isSubExpanded && (
                                  <motion.div className="ml-1.5 mt-1 overflow-hidden border-l border-dashed border-foreground/20 pl-5 text-xs text-muted-foreground" variants={subtaskDetailsVariants} initial="hidden" animate="visible" exit="hidden" layout>
                                    <p className="py-1">{subtask.description}</p>
                                    {subtask.tools && subtask.tools.length > 0 && (
                                      <div className="mb-1 mt-0.5 flex flex-wrap items-center gap-1.5">
                                        <span className="font-medium text-muted-foreground">Outils :</span>
                                        {subtask.tools.map((tool) => (
                                          <span key={tool} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{tool}</span>
                                        ))}
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.li>
                          )
                        })}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            )
          })}
        </ul>
      </LayoutGroup>
    </div>
  )
}

export default AgentPlan
