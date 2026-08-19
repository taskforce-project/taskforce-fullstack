import { redirect } from "next/navigation"

/**
 * La vue « page pleine » d'une issue a été retirée (redondante avec le sheet latéral).
 * On garde toutefois la route en REDIRECTION vers le board, sheet ouvert (`?issue=`), afin que
 * les anciens liens directs / bookmarks vers `/projects/:id/issues/:issueId` ne renvoient pas 404.
 * Le lien partageable canonique reste `…/projects/:id?issue=:issueId`.
 */
export default async function IssueRedirectPage({
  params,
}: Readonly<{ params: Promise<{ workspace: string; id: string; issueId: string }> }>) {
  const { workspace, id, issueId } = await params
  redirect(`/${workspace}/projects/${id}?issue=${issueId}`)
}
