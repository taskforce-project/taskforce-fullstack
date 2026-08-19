# C2 — Audit fonctionnel écran par écran

> But : garantir que **chaque contrôle cliquable par le jury en démo est soit fonctionnel, soit retiré / marqué « bientôt »** (C13/C15). Alimente la passe UI/UX (C1) et le scénario de démo.
> Réalisé le **04/08/2026** par **lecture du code** (pane navigateur trop instable pour un clic fiable), 5 zones en parallèle, **50 écrans** couverts. Contrôles marqués ✅ = re-vérifiés à la main.

## Verdict d'ensemble
- **Différenciateur (smart-assign / redistribution) : ✅ fonctionnel de bout en bout** — l'essentiel pour la démo est solide.
- L'app est très majoritairement câblée (les passes anti-mock ont déjà assaini le gros). Les contrôles morts restants sont **peu nombreux et localisés**.
- **Aucun bloquant rouge.** Tout se règle en masquant / câblant quelques contrôles + une checklist de démo.

## ✅ Smart-assign / redistribution — câblé sur 4 points d'entrée
1. **Panneau « Smart assign »** sur une issue → `smart-assign-panel.tsx:152` → `smartAssignIssue` (`issue-service.ts:391`) → route `SMART_ASSIGN`. Best match + score (sémantique / charge / dispo) + alternatives ; Assign → `callUpdate({assigneeId})`.
2. **« Suggest assignee »** à la création (dry-run) → `create-issue-dialog.tsx:378` → `smartAssignPreview`.
3. **« Auto-assign (N) »** en lot (vue board) → `bulk-assign-dialog.tsx` → `smartAssignBulk`.
4. **« Rééquilibrer la charge »** (redistribution, manager-only) → `redistribution-dialog.tsx` : preview → le manager décoche → apply. + onglet **Spec IA** « Assigner automatiquement ».

Rien de décoratif dans la chaîne. Seule réserve : dépendance IA live (voir Pièges).

## Légende exposition
**Exposé** = sur un chemin de démo probable · **Secondaire** = atteignable mais peu probable · **Orphelin** = page/route non liée, atteignable seulement par URL directe.

## Contrôles morts (décoratifs — cliquables, ne font rien)
| Écran | Contrôle | Exposition | Fichier:ligne | ✅ |
|---|---|---|---|:--:|
| projects/[id]/issues | Menu **Sort** (4 entrées, aucun onClick) | Exposé | `issues/page.tsx:353-356` | ✅ |
| dashboard (palette Cmd+K) | **Go to Discussions** → route inexistante (404) | Exposé | `command-palette.tsx:139` | ✅ |
| auth/login | bouton social **Google** (toast « bientôt ») | Exposé | `auth-social-buttons.tsx:117` + `compose:248` | ✅ |
| /roadmap (workspace) | bouton **Add item** | Exposé | `roadmap-gantt.tsx:373` | ✅ |
| projects/[id]/members | ⋯ **Changer le rôle** (toast « prochainement ») | Exposé | `members/page.tsx:178` | |
| profile | 3 **compteurs** stylés en boutons | Secondaire | `profile/page.tsx:241-253` | |
| members/[id] | lignes **« Issues récentes »** (affordance clic morte) | Secondaire | `members/[id]/page.tsx:70-81` | |
| /issues (globale) | **Edit** + **Assign to me** (menu ligne) | Orphelin | `issues/page.tsx:223-224` | |

## À cadrer (partiel / trompeur / à masquer)
| Écran | Sujet | Exposition | Fichier:ligne | ✅ |
|---|---|---|---|:--:|
| /issues (globale) | **Page entière non fonctionnelle** : lignes non cliquables, « New issue » jamais soumettable (pas de projectId) | Orphelin | `issues/page.tsx:142,373` | |
| cycles · my-work/sprints · roadmap | **Progress % et X/N figés à 0** (l'endpoint liste ne renvoie que `issueCount`) | Exposé | `my-work-view.tsx:275-277` · `roadmap-gantt.tsx:200` | |
| settings (Account) | **Fuseau + « Save changes »** : toast succès mais réglage jamais appliqué (dates en dur) | Secondaire | `settings/page.tsx:312-315,355-366` | |
| roadmap | **Timeline 100 % lecture seule** (le hover invite au clic, rien ne s'ouvre / rien de déplaçable) | Exposé | `roadmap-gantt.tsx:515` | |
| pages (docs projet) | **Suppression injoignable** (back prêt + testé, aucun appelant UI) | Secondaire | `page-store.ts:86` | ✅ |
| payment/cancel | « Continuer en gratuit » ne force pas `planType=FREE` → peut reboucler sur un paiement | Secondaire | `payment/cancel/page.tsx:21-23` | |
| payment/success | bouton « Aller au dashboard » (branche erreur) navigue vers /auth/login | Rare | `payment/success/page.tsx:125` | |
| settings (Integrations) | connecteurs génériques « Connecté » sans sync (sauf GitHub/Slack/Plane) — disclosé par bandeau | Secondaire | `integrations-catalog.tsx:285` | |
| issue-sheet | dropdown statut, branche de secours (statuts non chargés → toast sans persister) | Cas-limite | `issue-sheet.tsx:1353-1367` | |

## Pièges de démo (pas des contrôles morts)
- **IA live** : smart-assign / redistribution / spec IA appellent le backend IA en direct (timeouts longs). Si le service IA (Ollama) n'est pas up le jour J → spinner puis erreur, **sur le cœur de la démo**. Vérifier la santé IA avant.
- **Seed** : dashboard / analytics / inbox / my-work rendent des données réelles ; sans seed riche l'atterrissage paraît vide. Vérifier `dev_seed.sql` chargé (`db.ps1 seed`).
- **Découvrabilité membres projet** : `/members` fonctionnelle mais **absente de la barre d'onglets** projet (accès via Settings → Gérer les membres). Un jury peut croire la feature absente → envisager un onglet « Membres ».
- **Topbar auth « Retour au site » / logo** → `NEXT_PUBLIC_SITE_URL` (localhost:4321, vitrine Astro). Si la vitrine n'est pas servie en démo, ces liens sont injoignables.

## Parcours de démo sûr (évite tous les contrôles morts)
1. Connexion (GitHub ou classique) → onboarding (validé). *Éviter le bouton Google.*
2. Dashboard → cartes + Analytics. *Ne pas taper « Discussions » dans Cmd+K.*
3. Projet → board → créer une issue → **Smart assign** → Assign.
4. **Auto-assign en lot** + **Rééquilibrer la charge** (manager) → l'histoire « l'outil propose, le manager valide ».
5. Membres / équipes (via Settings) + invitation.

*Éviter : /roadmap « Add item », le menu Sort des issues, la page /issues globale, le fuseau dans Settings, les compteurs du profil ; ou cadrer les cycles à 0 % verbalement.*

## Plan C1 (correctifs) — avancement

Stratégie retenue (user, 04/08) : **câbler un maximum**. Front vérifié `tsc --noEmit` (0 erreur) + `eslint` (0 erreur, 0 nouveau warning ; les 3 `set-state-in-effect` restants sont préexistants).

### ✅ Appliqués — front, vagues 1-2 (05/08)
| Correctif | Fichier | Traitement |
|---|---|---|
| Tri des issues | `projects/[id]/issues/page.tsx` | tri client priorité / création / échéance / assigné + « Default order » |
| Palette « Discussions » | `command-palette.tsx` | entrée morte retirée (aucune route `discussions`) |
| Palette « Go to Issues » + « Créer une issue » | `command-palette.tsx` | repointées vers `/my-work/issues` et `/projects` → neutralise l'orphelin `/issues` |
| Bouton social Google | `docker-compose.dev.yml` | `AUTH_SOCIAL_PROVIDERS=github` (Google masqué tant que non câblé) |
| Onglet « Membres » projet | `projects/[id]/layout.tsx` | ajouté (page déjà fonctionnelle, juste absente des onglets) |
| Roadmap « Add item » | `roadmap-gantt.tsx` | bouton retiré (authoring roadmap = hors périmètre) |
| Compteurs profil | `profile/page.tsx` | → liens `/members`, `/projects`, `/cycles` |
| Lignes membre (issues récentes) | `members/[id]/page.tsx` | → liens vers l'issue |
| Suppression de page | `projects/[id]/pages/page.tsx` | menu ⋯ Supprimer + confirmation (back `deletePage` déjà prêt) |
| payment/cancel « gratuit » | `payment/cancel/page.tsx` | force `planType=FREE` avant la vérification |
| payment/success (branche erreur) | `payment/success/page.tsx` | libellé « Aller à la connexion » (au lieu de « tableau de bord ») |

⚠️ **À faire par le user pour voir le live** (HMR cassé + Docker injoignable depuis l'agent) :
`docker restart taskforce-frontend-dev` **puis** `docker compose -f docker-compose.dev.yml up -d --force-recreate frontend` (pour relire la config Google).

### ✅ Appliqués — vague 3 (05/08), selon la décision user validée
| Item | Traitement |
|---|---|
| **Vrai % de complétion des cycles** (cycles + my-work sprints + roadmap, figés à 0 %) | **Backend** : `CycleResponse.completedCount` + requêtes `countCompletedByCycleId(s)` (`CycleIssueRepository`, catégorie `COMPLETED`) ; `toResponse` + ses 6 points d'appel. **Front** : `Cycle.completedCount` + 3 mappeurs (`cycles/page`, `my-work-view`, `roadmap-gantt`) → vrai %. **Tests** : 2 cas d'intégration (par cycle + groupé) dans `CycleServiceIntegrationTest`. |
| **Rôle des membres projet** (« Changer le rôle » mort) | Item **retiré** du menu (`projects/[id]/members/page.tsx`) — endpoint RBAC projet hors périmètre clôture. |
| **Fuseau horaire** (settings, faux succès) | Sélecteur **retiré** + bouton « Save changes » du panneau Compte retiré (il ne sauvegardait plus rien : langue appliquée en direct, email en lecture seule). |

✅ **Validé et déployé (05/08)** : `it.ps1 -Test ALL` → **846 tests, 0 échec, 1 ignoré** (dont les 2 nouveaux). Backend rebuild (`docker.ps1 rebuild backend`, sain en 16 s, validate OK) + front recréé (`up -d --force-recreate --no-deps frontend`). Vérifs : login 200, bouton **Google absent** du HTML rendu, backend *healthy*.

> **Piège corrigé — JPQL vs PostgreSQL named-enum.** Premier jet : `... category = com.taskforce…IssueStatusCategory.COMPLETED` (littéral d'enum Java). La colonne `IssueStatus.category` est un **`@JdbcTypeCode(NAMED_ENUM)`** → Hibernate générait un cast vers un type PG `issuestatuscategory` inexistant → `PSQLException`, cassant du même coup `getCycle`/`listCycles`/`updateCycle` (tous passent par la requête). **Correctif** : comparer à un **littéral chaîne** `= 'COMPLETED'` (motif déjà éprouvé dans `IssueRepository` : `category NOT IN ('COMPLETED','CANCELLED')`), jamais au littéral d'enum Java. La suite complète l'a attrapé — le run ciblé seul ne l'aurait pas vu.

## Décisions actées (04/08)
- **Session unique par utilisateur** = choix assumé (résout la question ouverte de MAJ `C10`). Ne plus traiter comme un bug ; défendable à l'oral (sécurité).
- **E9 (C11)** : à confirmer avec l'école — le référentiel (p.8) exige un **site marchand externe fourni, hors fil rouge** ; le faire sur TaskForce risque les 4 sous-critères. Réclamer le sujet avant d'investir.
