"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DeliveryRun, DeliveryRunApproval } from "@/lib/api/delivery-service"
import { requestWant } from "@/lib/delivery/mission-sequence"
import { fillText } from "@/lib/delivery/result-card"
import { obligationWords } from "@/lib/rules/rule-words"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useUserStore } from "@/lib/store/user-store"
import { momentWords } from "@/lib/workflow/sentence"

/** La raison d'une décision, au plus, comme le serveur la borne. */
export const REASON_MAX = 500

/**
 * Décider (séance n°25, §6.1), là où l'on voit, la règle sur la décision : « Approve {what}? », la règle et sa phrase, les
 * signatures qu'elle demande, l'échéance et ce qui suit, la signification de la signature, une raison facultative, puis
 * « Refuse » et « Approve » en bas à droite ; « This can't be undone. » quand l'accord engage. Jamais un « Approve » nu. La
 * décision passe par la route qui existe, déjà jugée par les règles et entrée au dossier ; la raison y entre avec elle. Un
 * accord donné ici vaut une fois. Pour qui ne peut pas décider : qui l'on attend, sans bouton.
 */
export function DecisionPanel({ slug, projectId, run, approval, now }: Readonly<{
  slug: string
  projectId: number
  run: DeliveryRun
  approval: DeliveryRunApproval
  now: Date
}>) {
  const t = usePreferencesStore((s) => s.t.workflow.decide)
  const sequence = usePreferencesStore((s) => s.t.missionSequence)
  const rulesText = usePreferencesStore((s) => s.t.rules)
  const person = useUserStore((s) => s.user?.displayName?.trim() || s.user?.email || "")
  const decide = useDeliveryStore((s) => s.decideApproval)
  const fetchProjectRun = useDeliveryStore((s) => s.fetchProjectRun)
  const [why, setWhy] = useState("")
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null)

  const what = requestWant(approval, run, sequence)
  const reason = approval.reason?.trim()
  const obligations = obligationWords(approval, rulesText)
  const fieldId = `decide-why-${approval.id}`
  const title = fillText(t.title, { what })

  if (!approval.canDecide) {
    const who = obligations.length > 0 ? obligations.join(" ").replace(/\.$/, "") : (run.startedByName?.trim() || t.someone)
    return <p className="text-sm text-muted-foreground">{fillText(t.notYours, { who })}</p>
  }

  async function onDecide(allow: boolean) {
    setBusy(allow ? "allow" : "deny")
    const ok = await decide(slug, run.id, approval.id, allow, false, why)
    setBusy(null)
    if (ok) {
      const multi = allow && (approval.signatures ?? 1) > 1
      toast.success(allow ? (multi ? t.signed : t.approved) : t.refused)
      // La ligne de la mission se relit tout de suite : le nœud quitte « Needs you » sans attendre le topic.
      void fetchProjectRun(slug, projectId, run.id)
    } else {
      toast.error(t.failed)
    }
  }

  return (
    <section aria-label={title} className="flex flex-col gap-3 border border-border bg-card p-3">
      <h4 className="text-base font-[550] leading-snug text-foreground">{title}</h4>
      <div className="flex flex-col gap-1 text-[13px] leading-5 text-foreground">
        <p>{reason ? fillText(t.rule, { sentence: reason }) : t.noRule}</p>
        {obligations.map((line) => <p key={line} className="text-muted-foreground">{line}</p>)}
        {approval.expiresAt && (
          <p className="text-muted-foreground">{fillText(t.expires, { time: momentWords(approval.expiresAt, now), then: t.then })}</p>
        )}
        <p className="text-muted-foreground">{fillText(t.signingAs, { name: person, meaning: t.meaning.approval })}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId} className="text-xs">{t.why}</Label>
        <Input id={fieldId} value={why} maxLength={REASON_MAX} onChange={(event) => setWhy(event.target.value)} className="h-8 text-sm" />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {approval.binding && <p className="mr-auto text-xs text-muted-foreground">{t.final}</p>}
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void onDecide(false)}>
          {busy === "deny" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : t.refuse}
        </Button>
        <Button size="sm" disabled={busy !== null} onClick={() => void onDecide(true)}>
          {busy === "allow" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : t.approve}
        </Button>
      </div>
    </section>
  )
}
