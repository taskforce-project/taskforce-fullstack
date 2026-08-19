import { redirect } from "next/navigation";

/**
 * Racine d'un workspace (`/{slug}`) — il n'existe aucune page à ce niveau (seulement `/dashboard`,
 * `/projects`, …). Sans ce fichier, `/{slug}` renvoie un 404. On redirige donc vers l'accueil réel du
 * workspace, le tableau de bord. Couvre les arrivées directes sur `/{slug}` : lien externe, retour
 * navigateur, ou clic sur le fil d'Ariane de l'espace.
 */
export default async function WorkspaceRootPage({
  params,
}: {
  readonly params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  redirect(`/${workspace}/dashboard`);
}
