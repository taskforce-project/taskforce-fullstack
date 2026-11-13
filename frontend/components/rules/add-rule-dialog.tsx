"use client"

import { useState } from "react"
import { CircleCheck, CircleX, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { CandidateRule, RuleApprover, RuleCaseView, RuleDraft, RulePerson, RuleScope } from "@/lib/api/rules-service"
import { fill, problemWords, ruleSentence, type RulesTexts } from "@/lib/rules/rule-words"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useRulesStore } from "@/lib/store/rules-store"
import { RuleCaseList } from "./rule-case-list"

/** Où la règle s'applique, dans le choix du dialogue : `workspace`, `role:MEMBER`, `role:ADMIN`, `person`. */
type Where = "workspace" | "role:MEMBER" | "role:ADMIN" | "person"

/** Les personnes qu'une règle peut désigner pour accorder, quand TaskForce ne les a pas trouvées dans les mots. */
const ROLE_APPROVERS = ["role:admin", "role:owner", "project-lead"] as const

/** La traduction avec, sur chaque règle qui demande, la personne choisie pour accorder. */
function withApprover(rules: CandidateRule[], approver: string): CandidateRule[] {
  return rules.map((rule) => rule.effect === "ask"
    ? { ...rule, require: { ...(rule.require ?? {}), approvers: [approver] } }
    : rule)
}

/** Un cas joué a-t-il cassé ? Un des cas de la règle, ou un cas d'une règle déjà là, qu'elle changerait. */
export function caseBroke(draft: Pick<RuleDraft, "cases" | "broken">): boolean {
  return draft.cases.some((c) => !c.passed) || draft.broken.length > 0
}

/** Faut-il demander à la personne qui accorde ? Le modèle ne l'a pas trouvée, ou il en a nommé une qui n'existe pas. */
function needsApprover(draft: RuleDraft): boolean {
  return Boolean(draft.approverNeeded) || draft.problems.some((p) => p.code === "badApprover" || p.code === "notAMember")
}

/**
 * « Add a rule » (R94, R98 ; une colonne, 560 px) : la règle en mots, puis « Check the rule » : TaskForce la traduit avec
 * le modèle de l'espace, la vérifie sans lui et rend ce qu'il a compris en phrases, avec ses cas. Elle n'entre que si
 * tout tient ; le format de la règle reste à un clic de plus.
 */
export function AddRuleDialog({ open, onOpenChange, slug, projectId, members }: Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** Dans les réglages d'un projet : la règle va dans la couche de ce projet. */
  projectId?: number
  members: RulePerson[]
}>) {
  const t = usePreferencesStore((s) => s.t.rules)
  const draftRule = useRulesStore((s) => s.draftRule)
  const addRule = useRulesStore((s) => s.addRule)
  const [text, setText] = useState("")
  const [where, setWhere] = useState<Where>("workspace")
  const [person, setPerson] = useState<string>("")
  const [draft, setDraft] = useState<RuleDraft | null>(null)
  const [checkedText, setCheckedText] = useState<string | null>(null)
  const [approver, setApprover] = useState<string>("")
  const [busy, setBusy] = useState<"check" | "save" | null>(null)
  const [raw, setRaw] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const scope: RuleScope = projectId !== undefined ? "project" : where === "person" ? "person" : where.startsWith("role:") ? "role" : "workspace"
  const ref = projectId !== undefined ? String(projectId) : where === "person" ? person : where.startsWith("role:") ? where.slice(5) : null
  const fresh = draft !== null && checkedText === text.trim()
  const askApprover = fresh && needsApprover(draft) && !approver
  const canSave = fresh && draft.passed

  function reset() {
    setText("")
    setWhere("workspace")
    setPerson("")
    setDraft(null)
    setCheckedText(null)
    setApprover("")
    setRaw(false)
    setFailure(null)
  }

  async function check() {
    const words = text.trim()
    if (!words || (scope === "person" && !ref)) return
    setBusy("check")
    setFailure(null)
    // La personne choisie pour accorder : la même traduction, revérifiée, sans redemander au modèle.
    const again = fresh && draft && approver ? withApprover(draft.rules, approver) : undefined
    const result = await draftRule(slug, {
      text: words, scope, ref,
      ...(again ? { rules: again, cases: draft?.modelCases ?? [] } : {}),
    })
    setBusy(null)
    if (!result) {
      setFailure(useRulesStore.getState().error)
      return
    }
    setDraft(result)
    setCheckedText(words)
  }

  async function save() {
    if (!draft) return
    setBusy("save")
    setFailure(null)
    const result = await addRule(slug, { text: draft.text, scope, ref, rules: draft.rules, cases: draft.modelCases })
    setBusy(null)
    if (!result) {
      setFailure(useRulesStore.getState().error)
      return
    }
    if (!result.saved) {
      setDraft(result.draft)
      return
    }
    toast.success(t.add.added)
    reset()
    onOpenChange(false)
  }

  const primary = canSave
    ? <Button onClick={save} disabled={busy !== null}>{busy === "save" ? <><Loader2 className="size-4 animate-spin" />{t.add.saving}</> : t.add.save}</Button>
    : <Button onClick={check} disabled={busy !== null || !text.trim() || (scope === "person" && !ref) || askApprover}>
        {busy === "check" ? <><Loader2 className="size-4 animate-spin" />{t.add.checking}</> : fresh ? t.add.checkAgain : t.add.check}
      </Button>

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next) }}>
      <DialogContent size="md" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.add.title}</DialogTitle>
          <DialogDescription>{t.add.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {projectId === undefined && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-where">{t.add.whereLabel}</Label>
              <Select value={where} onValueChange={(value) => { setWhere(value as Where); setDraft(null) }}>
                <SelectTrigger id="rule-where" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">{t.add.whereWorkspace}</SelectItem>
                  <SelectItem value="role:MEMBER">{fill(t.add.whereRole, { role: t.roles.MEMBER })}</SelectItem>
                  <SelectItem value="role:ADMIN">{fill(t.add.whereRole, { role: t.roles.ADMIN })}</SelectItem>
                  <SelectItem value="person">{t.add.wherePerson}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {projectId === undefined && where === "person" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-person">{t.add.personLabel}</Label>
              <Select value={person} onValueChange={(value) => { setPerson(value); setDraft(null) }}>
                <SelectTrigger id="rule-person" className="w-full"><SelectValue placeholder={t.add.personPlaceholder} /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-text">{t.add.textLabel}</Label>
            <Textarea id="rule-text" value={text} rows={3} maxLength={500} placeholder={t.add.placeholder}
              onChange={(e) => setText(e.target.value)} />
            {draft !== null && !fresh && <p className="text-xs text-muted-foreground">{t.add.edited}</p>}
          </div>

          {fresh && draft && <DraftView draft={draft} t={t} members={members} raw={raw} onRaw={() => setRaw((v) => !v)} />}

          {askApprover && draft && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-approver">{fill(t.add.approverTitle, { words: draft.approverNeeded ?? "" })}</Label>
              <Select value={approver} onValueChange={setApprover}>
                <SelectTrigger id="rule-approver" className="w-full"><SelectValue placeholder={t.add.approverPlaceholder} /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={`person:${m.id}`}>{m.jobTitle ? `${m.name}, ${m.jobTitle}` : m.name}</SelectItem>
                  ))}
                  {ROLE_APPROVERS.map((ref) => (
                    <SelectItem key={ref} value={ref}>
                      {ref === "role:admin" ? t.add.approverAdmin : ref === "role:owner" ? t.add.approverOwner : t.add.approverLead}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {failure && <p className="text-sm text-destructive" role="alert">{failure}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={busy !== null}>{t.cancel}</Button>
          {primary}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Ce que TaskForce a compris de la règle, ses cas, et ce qui l'empêche d'entrer. */
function DraftView({ draft, t, members, raw, onRaw }: Readonly<{
  draft: RuleDraft; t: RulesTexts; members: RulePerson[]; raw: boolean; onRaw: () => void
}>) {
  // Qui TaskForce ne connaît pas se dit par les mots de la règle, jamais par sa référence brute (R161).
  const unknown = draft.approverNeeded ?? t.add.approverToChoose
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3" aria-live="polite">
      {draft.rules.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">{t.understood}</p>
          {draft.rules.map((rule, i) => (
            <p key={i} className="text-sm text-foreground">
              {ruleSentence({ when: rule.when, effect: rule.effect ?? "ask" }, t, {
                approvers: (rule.require?.approvers ?? []).map((ref) => namedApprover(ref, members, unknown)),
                signatures: rule.require?.signatures, separate: rule.require?.separate,
              })}
            </p>
          ))}
        </div>
      )}
      {draft.cases.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{t.casesTitle}</p>
          <RuleCaseList cases={draft.cases.map((c) => spokenCase(c, unknown))} t={t} />
        </div>
      )}
      {draft.broken.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">{t.add.breaks}</p>
          <RuleCaseList cases={draft.broken} t={t} />
        </div>
      )}
      {draft.problems.map((p, i) => (
        <p key={i} className="flex items-start gap-1.5 text-sm text-foreground">
          <CircleX className="mt-0.5 size-4 shrink-0 text-ink-red" aria-hidden="true" />
          <span>{problemWords(p, t)}</span>
        </p>
      ))}
      {draft.unclear && <p className="text-xs text-muted-foreground">{fill(t.add.unclear, { text: draft.unclear })}</p>}
      {/* « Un cas ne tient pas » seulement quand un cas a été joué et a cassé (R160) ; un refus pour une autre raison
          (personne pour accorder, une règle qui relâcherait le socle) finit sur cette raison. */}
      {(draft.passed || caseBroke(draft) || draft.problems.length === 0) && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
          {draft.passed
            ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ink-green" aria-hidden="true" />
            : <CircleX className="mt-0.5 size-4 shrink-0 text-ink-red" aria-hidden="true" />}
          <span>{draft.passed ? t.add.passes : t.add.fails}</span>
        </p>
      )}
      <div>
        <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          aria-expanded={raw} onClick={onRaw}>
          {raw ? t.hideFormat : t.showFormat}
        </button>
        {raw && (
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-muted px-2 py-1.5 font-mono text-[11px]">
            {JSON.stringify(draft.rules, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

/**
 * Une personne désignée, avec son nom quand elle est de l'espace ; un rôle reste sa référence, dite en mots ensuite.
 * Une référence que TaskForce ne connaît pas (« head-of-finance ») ne s'écrit jamais telle quelle : `unknown`, les mots
 * de la règle qui désignent la personne, la remplace (R161).
 */
function namedApprover(ref: string, members: RulePerson[], unknown: string): RuleApprover {
  const person = ref.startsWith("person:") ? members.find((m) => `person:${m.id}` === ref) : undefined
  if (person) return { ref, name: person.name, detail: person.jobTitle ?? null }
  return { ref, name: isRole(ref) ? null : unknown, detail: null }
}

/** Un rôle qu'une règle peut désigner : `approverName` le dit en mots. */
function isRole(ref: string): boolean {
  return (ROLE_APPROVERS as readonly string[]).includes(ref)
}

/** Un cas joué, dont les personnes que TaskForce ne connaît pas se disent par les mots de la règle (R161). */
function spokenCase(c: RuleCaseView, unknown: string): RuleCaseView {
  const spoken = (a: RuleApprover): RuleApprover => (a.name || isRole(a.ref) ? a : { ...a, name: unknown })
  return { ...c, decision: { ...c.decision, approvers: c.decision.approvers.map((set) => set.map(spoken)) },
    expectApprovers: c.expectApprovers?.map(spoken) ?? null }
}
