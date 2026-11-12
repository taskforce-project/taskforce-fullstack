import type { Facts } from "./engine/rules-engine.js";

/**
 * Ce que la mission a déjà en main, pour le socle (R157, R158) : jamais à la fois un contenu non fiable, des données
 * sensibles et une écriture ou une sortie sans une personne. Le moteur en décide ; ce module produit ses faits.
 *
 * - `sensitive` : la mission travaille sur des données de l'entreprise, le code d'un dépôt privé (ou dont on ne sait pas
 *   s'il est public), les notes et issues d'un espace pour une tâche sans dépôt ;
 * - `untrusted` : la mission a pris un contenu venu de dehors, une page ou une recherche du web, dès que l'action qui le
 *   rapporte part ; ensuite, ça ne s'efface pas.
 *
 * Chaque action est celle d'un agent (`actor`) : Claude Code, ou TaskForce pour lui (pousser, ouvrir la pull request).
 */
export class Exposure {
  private outside = false;

  constructor(readonly sensitive: boolean) {}

  /** Une mission sur ce dépôt : sensible sauf sur un dépôt public ; une tâche sans dépôt lit les données de l'espace. */
  static forMission(repoFullName: string | null | undefined, visibility: "public" | "private" | null): Exposure {
    return new Exposure(!repoFullName || visibility !== "public");
  }

  get untrusted(): boolean {
    return this.outside;
  }

  /** Une action vient de partir : si elle rapporte un contenu de dehors (le web), la mission l'a désormais en main. */
  took(facts: Facts[]): void {
    if (facts.some((f) => f.action === "web.fetch" || f.action === "web.search")) this.outside = true;
  }

  /** Les faits du socle, à ajouter à ceux de chaque action. */
  facts(): Facts {
    return {
      actor: "agent",
      ...(this.sensitive ? { sensitive: "true" } : {}),
      ...(this.outside ? { untrusted: "true" } : {}),
    };
  }

  /** Les faits d'une action, avec ceux du socle. */
  with(facts: Facts[]): Facts[] {
    const session = this.facts();
    return facts.map((f) => ({ ...f, ...session }));
  }
}
