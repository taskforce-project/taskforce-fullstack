"use client"

import { useState, type FormEvent } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProjectObjective } from "@/lib/api/project-service"
import { fillText } from "@/lib/delivery/result-card"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useProjectStore } from "@/lib/store/project-store"

/** Les bornes du serveur : le but, un critère, le nombre de critères. */
export const GOAL_MAX = 280
export const CRITERION_MAX = 200
export const CRITERIA_MAX = 5

/** Ce que le dialogue envoie : les textes sans leurs blancs, les critères vides retirés ; null tant qu'il manque l'essentiel. */
export function objectivePayload(goal: string, targetDate: string, criteria: readonly string[]) {
  const kept = criteria.map((c) => c.trim()).filter(Boolean)
  const text = goal.trim()
  if (!text || text.length > GOAL_MAX || kept.length === 0 || kept.length > CRITERIA_MAX) return null
  if (kept.some((c) => c.length > CRITERION_MAX)) return null
  return { goal: text, targetDate: targetDate || null, criteria: kept }
}

/** Ce qui manque pour enregistrer, en mots ; null quand rien ne manque (les longueurs, les champs les bornent). */
export function objectiveMissing(
  goal: string, criteria: readonly string[], t: { needGoal: string; needCriterion: string },
): string | null {
  if (!goal.trim()) return t.needGoal
  if (!criteria.some((c) => c.trim())) return t.needCriterion
  return null
}

/**
 * « Add an objective » (séance n°25, §3) : un dialogue de 560 px, d'une colonne, les libellés au-dessus des champs, une
 * action principale en bas à droite. Le but en une phrase, la date visée, de un à cinq critères ; rien n'est inventé ni
 * proposé. Un objectif posé se change ici, et se retire. Le serveur décide de qui le peut, et le dit s'il refuse.
 */
export function ObjectiveDialog({ slug, projectId, objective, open, onOpenChange }: Readonly<{
  slug: string
  projectId: number
  objective: ProjectObjective | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {/* Le formulaire renaît à chaque ouverture : il reprend l'objectif tel qu'il est alors. */}
        {open && <ObjectiveForm slug={slug} projectId={projectId} objective={objective} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ObjectiveForm({ slug, projectId, objective, onDone }: Readonly<{
  slug: string
  projectId: number
  objective: ProjectObjective | undefined
  onDone: () => void
}>) {
  const t = usePreferencesStore((s) => s.t.workflow.objective)
  const saveObjective = useProjectStore((s) => s.saveObjective)
  const clearObjective = useProjectStore((s) => s.clearObjective)
  const existing = Boolean(objective?.goal)
  const [goal, setGoal] = useState(objective?.goal ?? "")
  const [targetDate, setTargetDate] = useState(objective?.targetDate ?? "")
  const [criteria, setCriteria] = useState<string[]>(objective?.criteria.length ? objective.criteria : [""])
  const [busy, setBusy] = useState<"save" | "remove" | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const payload = objectivePayload(goal, targetDate, criteria)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    // « Save » ne grise pas sans raison : il dit ce qui manque.
    if (!payload) {
      setFailed(objectiveMissing(goal, criteria, t) ?? t.failed)
      return
    }
    setBusy("save")
    setFailed(null)
    const saved = await saveObjective(slug, projectId, payload)
    setBusy(null)
    if (saved) {
      toast.success(t.saved)
      onDone()
    } else {
      setFailed(useProjectStore.getState().objectiveError || t.failed)
    }
  }

  async function remove() {
    if (busy) return
    // Ce qui était posé, pour le remettre si la personne se ravise.
    const previous = objective?.goal
      ? { goal: objective.goal, targetDate: objective.targetDate ?? null, criteria: [...objective.criteria] }
      : null
    setBusy("remove")
    const ok = await clearObjective(slug, projectId)
    setBusy(null)
    if (ok) {
      // « Undo » remet l'objectif tel qu'il était ; s'il n'y parvient pas, il le dit (R159, N5).
      const undo = async (objective: NonNullable<typeof previous>) => {
        if (!(await saveObjective(slug, projectId, objective))) toast.error(t.undoFailed)
      }
      toast.success(t.removed, previous ? { action: { label: t.undo, onClick: () => void undo(previous) } } : undefined)
      onDone()
    } else {
      setFailed(t.removeFailed)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{t.dialogTitle}</DialogTitle>
        <DialogDescription>{t.dialogDescription}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="objective-goal">{t.goalLabel}</Label>
        <Input
          id="objective-goal"
          value={goal}
          maxLength={GOAL_MAX}
          autoFocus
          onChange={(event) => setGoal(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="objective-date">{t.dateLabel}</Label>
        <Input
          id="objective-date"
          type="date"
          min="2000-01-01"
          max="2100-12-31"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          className="w-44"
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium leading-none">{t.criteriaLabel}</legend>
        <p id="objective-criteria-help" className="text-xs text-muted-foreground">{t.criteriaHelp}</p>
        <ol className="flex flex-col gap-2">
          {criteria.map((criterion, index) => {
            const number = index + 1
            return (
              <li key={index} className="flex items-center gap-2">
                <Input
                  aria-label={fillText(t.criterionLabel, { number })}
                  aria-describedby="objective-criteria-help"
                  value={criterion}
                  maxLength={CRITERION_MAX}
                  onChange={(event) => setCriteria((was) => was.map((c, i) => (i === index ? event.target.value : c)))}
                />
                {criteria.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setCriteria((was) => was.filter((_, i) => i !== index))}
                    aria-label={fillText(t.removeCriterion, { number })}
                    title={fillText(t.removeCriterion, { number })}
                    className="flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ol>
        {criteria.length < CRITERIA_MAX && (
          <button
            type="button"
            onClick={() => setCriteria((was) => [...was, ""])}
            className="flex h-8 w-fit items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.addCriterion}
          </button>
        )}
      </fieldset>

      {failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}

      <DialogFooter className="sm:items-center">
        {existing && (
          <Button type="button" variant="ghost" className="sm:mr-auto" disabled={busy !== null} onClick={() => void remove()}>
            {busy === "remove" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : t.remove}
          </Button>
        )}
        <Button type="submit" disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : t.save}
        </Button>
      </DialogFooter>
    </form>
  )
}
