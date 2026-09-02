# QA — Tour 2 (fil rouge)

> Démarré le 27/06/2026. Issu de la session de QA de Pierre. Statuts : ⬜ à faire · 🔶 en cours · ✅ fait · ⏸ bloqué/à discuter.
> Règle projet : pas de mock front, données via `dev_seed.sql` (cf. mémoire). Lecture des réponses via `response.data.data`.

## Lot 1 — Quick wins front (texte / ordre / taille)

| ID | Item | Fichier | Prio | Statut |
|----|------|---------|------|--------|
| Q-01 | Pages : erreur 500 Tiptap SSR → `immediatelyRender: false` | `components/editor/tiptap-editor.tsx` | critique | ✅ |
| Q-02 | Sidebar : "All" → "All my queues" (EN + FR) | `lib/constants_en.ts`, `lib/constants_fr.ts` | basse | ✅ |
| Q-03 | Roadmap : onglet projet en 3e position | `app/(protected)/[workspace]/projects/[id]/layout.tsx` | basse | ✅ |
| Q-04 | Pages d'erreur : logo TaskForce trop petit | `app/error.tsx`, `app/not-found.tsx` | basse | ✅ |

## Lot 2 — Tableaux & listes

| ID | Item | Prio | Statut |
|----|------|------|--------|
| Q-05 | "All signals" : fond du tableau = même couleur que "My Queues" | basse | ✅ (fond `bg-card` uniforme, non-lu = barre + dot) |
| Q-06 | Pagination + skeleton loader sur TOUS les tableaux (load rapide) | haute | ✅ Members, Operations (liste+cards), Issues, Discussions. Backlog = infinite-scroll conservé. Spinners pages conso → `<Spinner>` |
| Q-07 | Operations : affichage en cards par défaut | moyenne | ✅ |
| Q-08 | Projet > liste : menus repliables (backlog & autres) | moyenne | ✅ |
| Q-09 | Backlog : pas de header de tableau + retirer l'icône "grab" sur chaque ligne | moyenne | ✅ |
| Q-10 | Membres : lignes tassées → étaler, plus de colonnes (pagination via Q-06) | moyenne | ✅ |

## Lot 3 — Roadmap

| ID | Item | Prio | Statut |
|----|------|------|--------|
| Q-11 | Roadmap : pas assez de détails | moyenne | ✅ dates + % progression par ligne, compteur + % par groupe projet |
| Q-12 | Roadmap : légende des couleurs incorrecte | moyenne | ✅ légende refaite : couleur = projet, barre = durée, remplissage clair = progression, losange = jalon |

## Lot 4 — Erreurs 500 backend (investigation déléguée)

| ID | Item | Prio | Statut |
|----|------|------|--------|
| Q-13 | Intelligence : 500 sur `/analytics/kpis` et `/analytics/burndown` | haute | 🔶 fix code, à rebuild |
| Q-14 | Profil : 500 sur `/profile` (`getProfile` profile-service.ts:41) | haute | 🔶 fix code, à rebuild |

**Cause racine Q-13/Q-14 (confirmée via logs backend) :** `CycleRepository` inlinait un littéral enum (`...CycleStatus.ACTIVE/.COMPLETED`) → Hibernate générait un cast `'COMPLETED'::CycleStatus` (= type pg `cyclestatus`) alors que le vrai type est `cycle_status`. `ERROR: type "cyclestatus" does not exist`. Fix : SpEL `:#{T(...).ACTIVE}` (paramètre lié, pas de littéral inliné), zéro changement côté appelants. Touche kpis + burndown + profile.
| Q-15 | Intelligence : cards pas au même style que le dashboard | moyenne | ⬜ |

## Lot 5 — Settings & intégrations

| ID | Item | Prio | Statut |
|----|------|------|--------|
| Q-16 | Settings : menu latéral séparé (style GitHub), **fixed** pas scrollé | moyenne | ✅ nav `sticky top-0 self-start` |
| Q-17 | Settings : vérifier que TOUS les settings fonctionnent | moyenne | ✅ audit panel par panel + recâblage : Account (langue **live** via i18n, timezone/notifs persistés, delete réel), Appearance (thème **réel** next-themes, densité fantôme retirée), Notifications (persistance localStorage), Security (placeholders/fausses sessions retirés → honnête Keycloak). Profile/Workspace/Integrations/Privacy/Status déjà réels |
| Q-18 | Doc : comment configurer GitHub pour que l'intégration marche | moyenne | ✅ [docs/integrations-github.md](../docs/integrations-github.md) — clés OAuth en placeholder dans .env.dev = cause du non-fonctionnement |
| Q-19 | Billing & Plan : vérifier infos correctes + fonctionnel | moyenne | ✅ panel réel (plan via user.planType, portail Stripe, upgrade). **Date de renouvellement codée en dur « Jan 15 2026 » remplacée** par la vraie date `getSubscriptionInfo().currentPeriodEnd` (+ état annulation) |
| Q-20 | Panneau "Incident en cours" (statuts services) chelou → revoir | moyenne | ✅ probe API robuste (retry → plus de faux incident), STOMP/Groq libellés honnêtement |

## Lot 6 — Teams & Help

| ID | Item | Prio | Statut |
|----|------|------|--------|
| Q-21 | Teams : affichage à moderniser/upgrader | moyenne | ✅ cartes modernisées (tuile icône, badge Associée, pile avatars +N, barre d'actions) — `components/projects/project-teams-section.tsx` |
| Q-22 | Help : vraie doc en markdown (pas une FAQ vulgaire) | moyenne | ✅ FAQ accordéon → doc continue avec sommaire latéral sticky + recherche. Rendu markdown live (Brain OS/Obsidian) = chantier séparé avec renderer, reporté |

## Lot 7 — Idées liées (reportées, viennent avec la "prochaine idée")

| ID | Item | Statut |
|----|------|--------|
| Q-23 | Ask AI ne fonctionne pas | ⏸ (prochaine idée — `useAIStream` est un mock dans command-palette) |
| Q-24 | Search Ctrl+K fonctionnel | ✅ bug = navigation non scopée workspace ; `go()` préfixe `/{slug}`. (Assistant palette = code mort, pas de conflit) |
| Q-25 | Brain OS / Obsidian dans Help (idée complexe à détailler) | ⏸ (à détailler) |

## Note — Composant loader (réponse à la question)

Voir réponse dans le chat. Résumé : il existe `components/ui/spinner.tsx` (Spinner) et `components/ui/skeleton.tsx` (Skeleton), mais **la majorité des écrans importent `Loader2Icon` de lucide directement avec `animate-spin`** au lieu d'utiliser `<Spinner>`. Donc pas de point unique « one-shot » aujourd'hui → à consolider (chantier lié à Q-06).
