import { redirect } from "next/navigation"

/**
 * La vue « page pleine » d'une issue a été retirée : l'issue s'ouvre dans le volet de la fenêtre, par-dessus le
 * tableau de son projet (R120). On garde la route en REDIRECTION vers le board, l'issue ouverte (`?issue=`), afin que
 * les anciens liens directs / bookmarks vers `/projects/:id/issues/:issueId` ne renvoient pas 404.
 * Le lien partageable canonique reste `…/projects/:id?issue=:issueId`.
 */
export default async function IssueRedirectPage({
  params,
}: Readonly<{ params: Promise<{ workspace: string; id: string; issueId: string }> }>) {
  const { workspace, id, issueId } = await params
  redirect(`/${workspace}/projects/${id}?issue=${issueId}`)
}
