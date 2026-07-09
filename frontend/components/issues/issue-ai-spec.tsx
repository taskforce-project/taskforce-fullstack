"use client"

import { useState } from "react"
import { Sparkles, Copy, Check, RefreshCw, BrainCircuit, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  generateIssueSpec,
  approveIssueSpec,
  type IssueSpecDraft,
} from "@/lib/api/issue-service"

interface IssueAiSpecPanelProps {
  workspaceSlug: string
  projectId: number
  issueId: number
}

/**
 * Onglet « Spec IA » d'une issue — le cœur du flux « le projet avance tout seul » :
 * l'IA propose une spec + un prompt d'exécution (prêt à coller dans Claude Code) + un découpage,
 * avec les notes proches du Brain OS (« déjà vu ? »). L'humain édite, copie le prompt, puis
 * approuve → la spec est écrite dans le Brain OS (write-back), liée à l'issue.
 */
export function IssueAiSpecPanel({ workspaceSlug, projectId, issueId }: Readonly<IssueAiSpecPanelProps>) {
  const [draft, setDraft] = useState<IssueSpecDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  // Champs éditables (human-in-the-loop)
  const [spec, setSpec] = useState("")
  const [prompt, setPrompt] = useState("")
  const [breakdown, setBreakdown] = useState("")
  const [addChecklist, setAddChecklist] = useState(true)

  const applyDraft = (d: IssueSpecDraft) => {
    setDraft(d)
    setSpec(d.spec ?? "")
    setPrompt(d.executionPrompt ?? "")
    setBreakdown((d.breakdown ?? []).join("\n"))
    setSaved(false)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const d = await generateIssueSpec(workspaceSlug, projectId, issueId)
      applyDraft(d)
    } catch {
      toast.error("Échec de la génération de la spec")
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success("Prompt copié — collez-le dans Claude Code")
    } catch {
      toast.error("Copie impossible")
    }
  }

  const handleApprove = async () => {
    setApproving(true)
    try {
      const steps = breakdown.split("\n").map((s) => s.trim()).filter(Boolean)
      const node = await approveIssueSpec(workspaceSlug, projectId, issueId, {
        spec,
        executionPrompt: prompt,
        breakdown: steps,
        addChecklist: addChecklist && steps.length > 0,
      })
      setSaved(true)
      toast.success(
        addChecklist && steps.length > 0
          ? `Spec enregistrée + ${steps.length} tâche(s) en checklist`
          : `Spec enregistrée dans le Brain OS — ${node.title}`
      )
    } catch {
      toast.error("Échec de l'enregistrement dans le Brain OS")
    } finally {
      setApproving(false)
    }
  }

  // ── État initial : invitation à générer ──────────────────────────────────
  if (!draft && !generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-6 text-primary" />
        </div>
        <div className="max-w-xs">
          <p className="text-sm font-medium">Spécification assistée par l'IA</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Génère une spec, un prompt d'exécution prêt à coller dans Claude Code, et un découpage —
            fondés sur le contexte réel de ton Brain OS.
          </p>
        </div>
        <Button size="sm" onClick={handleGenerate} className="gap-1.5">
          <Sparkles className="size-3.5" />
          Générer la spec IA
        </Button>
      </div>
    )
  }

  // ── Génération en cours (LLM local ~ quelques dizaines de secondes) ───────
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm font-medium">L'IA rédige la spec…</p>
        <p className="text-xs text-muted-foreground">
          Retrieval Brain OS + génération locale — cela peut prendre quelques secondes.
        </p>
      </div>
    )
  }

  // ── Brouillon éditable ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pb-2">
      {/* En-tête : mode + régénérer */}
      <div className="flex items-center justify-between">
        <Badge variant={draft?.mode === "generated" ? "default" : "secondary"} className="gap-1">
          <Sparkles className="size-3" />
          {draft?.mode === "generated" ? "Généré par l'IA" : "Brouillon (LLM indisponible)"}
        </Badge>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={handleGenerate} disabled={generating}>
          <RefreshCw className="size-3.5" />
          Régénérer
        </Button>
      </div>

      {/* « Déjà vu ? » — notes proches du Brain OS */}
      {draft && draft.similar.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BrainCircuit className="size-3.5" />
            Déjà vu ? Notes proches dans le Brain OS
          </div>
          <ul className="flex flex-col gap-1">
            {draft.similar.map((s) => (
              <li key={s.nodeId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{s.title}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {s.domain && <span className="text-muted-foreground/70">{s.domain.toLowerCase()}</span>}
                  {typeof s.score === "number" && (
                    <span className="tabular-nums text-muted-foreground">{Math.round(s.score * 100)}%</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Spec (éditable) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Spécification</span>
        <Textarea
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          rows={10}
          className="resize-y font-mono text-xs leading-relaxed"
        />
      </label>

      {/* Prompt d'exécution (le wow) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Prompt d'exécution (Claude Code)</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleCopy}
            disabled={!prompt.trim()}
          >
            {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            {copied ? "Copié" : "Copier"}
          </Button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          className="resize-y border-primary/30 bg-primary/[0.03] font-mono text-xs leading-relaxed"
        />
      </div>

      {/* Découpage (éditable, une tâche par ligne) */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Découpage (une sous-tâche par ligne)</span>
        <Textarea
          value={breakdown}
          onChange={(e) => setBreakdown(e.target.value)}
          rows={5}
          className="resize-y text-xs leading-relaxed"
        />
      </label>

      {/* Option suivi : découpage → checklist de l'issue */}
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          checked={addChecklist}
          onCheckedChange={(v) => setAddChecklist(v === true)}
        />
        Ajouter le découpage en checklist de l'issue (suivi d'avancement)
      </label>

      {/* Approbation → write-back Brain OS */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        {saved && (
          <span className="mr-auto flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500">
            <Check className="size-3.5" />
            Enregistrée dans le Brain OS
          </span>
        )}
        <Button
          size="sm"
          className={cn("gap-1.5", saved && "opacity-60")}
          onClick={handleApprove}
          disabled={approving || !spec.trim()}
        >
          {approving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {saved ? "Ré-enregistrer" : "Enregistrer dans le Brain OS"}
        </Button>
      </div>
    </div>
  )
}
