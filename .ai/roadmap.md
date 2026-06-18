# Roadmap TaskForce — issue de la QA (`.ai/qa.md`) + CDC + grille RNCP

> Synthèse priorisée et **actionnable** de la QA pour exécution directe en session.
> Légende priorité : 🔴 critique · 🟠 haute · 🟡 moyenne · 🟢 basse · 💬 à décider avec l'utilisateur.
> Source de vérité détaillée : `.ai/qa.md`, `.ai/known-issues.md`, CDC `taskforce-docs/memoire/`.

---

## 0. Transverse / Layout (impacte toutes les pages)

- 🟡 **Layout cohérent** : toutes les pages doivent partager la même structure (même largeur/marges). Aujourd'hui ça alterne pleine largeur / centré. → Conteneur de page unifié (Cloudflare-like). *(Partiellement fait : surfaces principales migrées shadcn/SectionCard ; reste détail projet.)*
- 🟡 **Modales** : vérifier overlay (assombrissement) + focus trap + clic extérieur. Auditer tous les `Dialog`.
- 🟡 **« New project » sidebar** → ne pas ouvrir un form dédié ; rediriger vers `/projects` et **ouvrir le modal de création** automatiquement.
- 🟢 **Scrollbar sidebar** trop large → réduire (style discret).
- 🟡 **RBAC granulaire** (membres/teams/ressources) — sécurité + valeur. 💬 design à cadrer.
- 🟠 **RGPD / privacy / data retention / sécurité** — **obligatoire pour le mémoire** (cf. grille C11, C24). Bannière cookies, page politique de confidentialité, accès/suppression données, double opt-in, chiffrement données sensibles, rétention MinIO (actuellement `retention: none`, pas de legal hold/tags).
- 🟡 **Logs / audit / export CSV** — feeds entreprise (suivi, audit sécurité, export).
- 🟡 **Tests** (front Vitest/RTL + back JUnit) → **≥50% de couverture** exigée par la grille (C18, C25). Actuellement insuffisant.
- 🟡 **Monétisation** : peu d'incitation à payer. Stratégie : tout débloqué en dev, puis restreindre (IA, quotas workspace/membres/agents). 💬

## 1. Dashboard
- ✅ 500 `/analytics/insights` corrigé · ✅ KPIs en cartes à en-tête · ✅ needs-attention en carte.
- 🟢 Retirer le bandeau « All systems operational · vX » → le déplacer en **footer type Cloudflare** (Support, System status, Terms, Privacy…). Toast pour maintenances/events.
- 🟡 Retirer le badge « 1 critical » du header (alarmiste). 
- 🟡 **Système vivant** (retour QA UI/UX) : KPIs business + deltas/tendances + mini-sparklines (velocity 30j, burndown, tâches résolues). Bloc AI recommendations : remplacer la zone morte par des CTA d'onboarding.
- 🟡 Désambiguïser **agents = IA** (préfixe « AI » / icône) vs utilisateurs.

## 2. Workspaces
- 🟢 Création workspace même nom → renvoie **500 au lieu de 400** + message métier explicite (« nom déjà utilisé »).
- 🟡 Afficher **limites du plan** (nb workspaces restants + CTA upgrade).
- 🟡 Ajouter **suppression de workspace** (absente des settings).

## 3. Operations (projects) + détail projet
- 🟡 « Edit operation » ouvre les settings du projet → préférer un **modal** d'édition des infos globales, garder les settings techniques dans la page interne. 💬
- 🟡 Modal de création : permettre **icône + upload + couleur** ; **templates de projet** (réutiliser structure, façon GitHub).
- 🟡 Identifier non modifiable ? 💬
- ✅ Onglets dynamiques (Signals/My Queue faits) — 🟡 **onglets du détail projet** (Board/List/Backlog…) encore en routes → rendre client-side.
- 🟠 **Barre de filtres réelle** sur le Board (par agent, type, priorité…) + filtres personnalisés. *(Filtre basique posé ; à enrichir.)* Idem autres onglets.
- 🟡 **Templates de board** (sauvegarder structure colonnes/list) + 💬 templates méthodo (kanban/scrum/waterfall) au choix à la création.
- 🟠→🔴 **Issue (panneau)** : affichage peu clair, scroll-X dans Details à retirer, clarifier « points » ; **mettre le smart-assign en avant** (différenciateur) — l'exposer aussi **à la création** d'issue.
- 🟡 Issue : **supprimer/archiver**, **sous-tâches**, **liens entre tâches**, **checklist**. 💬 (voir Linear/GitHub).
- 🟡 **Cycles** : clarifier à quoi ça correspond ; inciter à y mettre une issue si vide.
- 🟡→🟠 **Pages = Brain OS branché** (détails du brain : étapes, décisions, actions). 💬 technique (doc par projet dans l'app vs Obsidian local).
- 🟡 **Invitation membre projet** : recherche dynamique (email/username, 5 résultats), multi-ajout, choix du rôle, inviter directement depuis le projet. *(Recherche+rôle posés côté workspace ; à étendre.)*
- 🟡 **Settings projet** façon GitHub (sidebar) ; intégrations/API/MCP.
- 🟠→🟡 **Intégration GitHub** (wrapper : issues/PR/commits/comments/membres + smart-assign + agents). Feature à forte valeur.

## 4. Agents
- 🟢 Bandeau « Agent Suite » noir → flat.
- 🟠 **Paramétrage des agents** (outils/links, compétences, tâches) — config par défaut = Brain OS (bos-landing). 💬 UX.
- 🟠 **UX du chat agents** : un chat global orchestrateur ? multi-agents ? innovant ? 💬 (avantage compétitif).
- 🟡 **Créer un agent** personnalisé.

## 5. Members / Teams
- 🟡 Owner sans contrôle sur la page Members → permettre gérer/inviter/supprimer/changer rôles. *(Backend invite+rôle fait ; câbler l'UI complète.)*
- 🟡 CTA inviter selon le plan.
- 🟢 **Photos de profil incohérentes** entre pages/users → uniformiser (Dicebear formes géométriques par défaut, stockée en DB, modifiable en settings).
- 🟡 **Teams ambigu** : « Manage members » et « Settings » ouvrent la même fenêtre. Clarifier ; associer une team à une/plusieurs opérations depuis la page Teams (et inversement). 💬 (cliquer une team pour détails ?)
- 🟡 New team : nom + icône + couleur.

## 6. Messages / Discussions
- 🟠 **Messages** : innover (≠ chat classique). 💬 ; 🟡→🟠 connexion **Slack** (recevoir/envoyer, comme GitHub).
- 🟡→🟠 **Discussions** : clarifier le rôle (annonces/releases, Q&A, show & tell, idées). **Pin/Lock ne fonctionnent pas** → à réparer. 💬

## 7. Analytics (Intelligence)
- ✅ migré shadcn/SectionCard. 🟡 clarifier **ce qu'on analyse** (global ? par projet/agent/type/cycle ?) + filtres + 1ère analyse guidée. Valeur du passage Pro à expliciter.

## 8. Settings / Help
- 🟡 Settings façon GitHub (sidebar) ; vérifier que tout fonctionne (pdp Dicebear OK).
- 🟡 **Help** : doc complète (next steps, ce qui manque — couvrir 100% de l'app) ; 🟠 **agent IA chat dans le header** (permanent, contextuel) façon Cloudflare « Ask AI ».

## 9. Inbox / My Work
- 🟢 Pertinence des sous-routes (Mentions/Alerts/Assigned ; Issues/Sprints/Pages) vs tout sur une page filtrée. 💬 *(My Queue déjà regroupé en 1 carte + sous-sections.)*

---

## Conformité grille RNCP (mémoire) — manques prioritaires
À traiter en priorité car **évalués en soutenance** (détail dans `Grille_evaluation_TaskForce_REMPLIE_DFS_25-26.xlsx`) :
1. 🔴 **C11 RGPD** (cookies, confidentialité, accès/suppression données, double opt-in).
2. 🟠 **C18 / C25 tests ≥50%** (front + back).
3. 🟠 **C6 wireframes** formels + **C7/C8 STB/UML** (cas d'usage, classes, MCD).
4. 🟡 **C19 / C26 CI** (lint/tests/build/scan automatisés).
5. 🟡 **C20 SEO** (sur la landing) + **C3/C4** planning/budget/agile formalisés.
