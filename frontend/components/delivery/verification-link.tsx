"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Unavailable } from "@/components/delivery/verification-view"
import { useDeliveryStore } from "@/lib/store/delivery-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { verificationPath } from "@/lib/window/address"

/** L'identifiant d'un lien du témoin : 128 bits tirés au hasard, en hexadécimal. */
const LINK_ID = /^[0-9a-f]{32}$/

/**
 * Le lien que le témoin d'un dossier écrit dans sa pull request, `/verify/<id>` (R159, second tour de #551, M-b) : un
 * identifiant opaque du dossier, qui ne nomme ni l'espace ni la mission. La page demande au serveur où il mène, avec les
 * contrôles d'accès du dossier, puis ouvre sa page de vérification. Un lien qui ne mène à rien, ou à un dossier que la
 * personne ne peut pas lire, se dit du même message neutre que la page (R159 P2), jamais d'un renvoi muet vers l'accueil.
 */
export function VerificationLink({ id }: Readonly<{ id: string }>) {
  const router = useRouter()
  const t = usePreferencesStore((s) => s.t.verification)
  const link = useDeliveryStore((s) => s.evidenceLinks[id])
  const fetchEvidenceLink = useDeliveryStore((s) => s.fetchEvidenceLink)
  const valid = LINK_ID.test(id)
  const [failed, setFailed] = useState(false)

  const read = useCallback(() => {
    if (!valid) return () => {}
    let current = true
    void fetchEvidenceLink(id).then((found) => {
      if (!current) return
      if (found) router.replace(verificationPath(found.workspace, found.runId))
      else setFailed(true)
    })
    return () => {
      current = false
    }
  }, [id, valid, fetchEvidenceLink, router])

  useEffect(() => read(), [read])

  const home = (
    <Link href="/" className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">{t.home}</Link>
  )
  if (!valid || link === null) return <Unavailable title={t.title} message={t.denied} hint={t.deniedHint} back={home} />
  if (failed && link === undefined) {
    return (
      <Unavailable title={t.title} message={t.failed} hint={t.failedHint} back={home}
        action={(
          <button type="button" onClick={() => { setFailed(false); read() }}
            className="w-fit border border-border px-2 py-1 text-xs text-foreground hover:bg-muted">{t.tryAgain}</button>
        )} />
    )
  }
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t.loading}
    </p>
  )
}
