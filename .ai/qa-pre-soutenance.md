# QA pré-soutenance — branche `fix/pre-soutenance-qa`

> Round de finition de l'app avant la soutenance (démo). Commits gérés par le user (« commiteur magique »).
> Tests CI (GitHub Actions) rouges = **problème de config CI**, pas le code : la suite front tourne **781/781 en local**.

## Backlog (dump user, pour ne rien perdre)

| # | Item | Statut |
|---|------|:--:|
| 1 | **Smart Assign « ne fonctionne plus »** (401 console) | ✅ session expirée (pas un bug) + fix timeout |
| 2 | UI/UX du bouton **Auto assign** (projet + sheet) | 🔲 |
| 3 | **PDP** cohérentes partout + **modif PDP profil KO** | 🔲 |
| 4 | Smart Assign — **paramètres d'analyse** (skill-up, outcomes projet, description issue) | ✅ vérifié + enhancement |
| 5 | **Teams** : dropdown des membres en `overflow-hidden` sous la card (invisible) | ✅ |
| 6 | **Intégrations** (modal settings) : retirer les 2 cards GitHub/Slack en bas, tab « connecté / pas connecté », garder Webhooks | 🔲 |
| — | (plus tard) seed propre démo (N users) pour un use-case Smart Assign au jury | 🔲 |
| — | (plus tard) tests back verts + CI GitHub Actions | 🔲 |

## MAJ 15/08 — Smart Assign (items 1 & 4)

**Diagnostic 401 (item 1) — PAS un bug.** Test bout-en-bout avec un token frais (login backend → `POST /api/workspaces/taskforce-demo/projects/1/issues/1/smart-assign`) → **HTTP 200**, vraie reco (Aïcha Diallo 61 %, `semanticScore` 80/95 → **le LLM tourne**). Les 401 du user = **session Keycloak expirée** (dump = 401 en continu sur toutes les ressources) → **re-login** suffit.

**Vrai problème trouvé (fix front).** L'appel a pris **29 s** ; le front appelait avec le **timeout par défaut 30 s** (pas `AI_TIMEOUT_MS`) → timeout intermittent « Impossible de générer », risque réel en démo (LLM froid / grosse équipe / bulk). Corrigé sur les **3 appels** LLM (`frontend/lib/api/issue-service.ts`) : `smartAssignIssue`, `smartAssignPreview`, `smartAssignBulk` → `{ timeout: AI_TIMEOUT_MS }`. Tests mis à jour (mock `AI_TIMEOUT_MS` + 3 assertions) → **`issue-service.test.ts` 37/37**, `tsc` 0.

**Paramètres d'analyse (item 4) — vérifié dans `SmartAssignService.java`.**
- **Description d'issue** : ✅ **incluse** (`buildIssueText` = titre + description + labels → prompt LLM). N'influe qu'en mode LLM (en repli heuristique, seuls labels/charge/histo comptent).
- **Montée en compétence** : ✅ **paramètre présent** (`computeGrowthScore` + prompt `growthStretch` + bonus borné +15), **gardé** derrière `project.isGrowthMode()` + opt-in membre (`growth_enabled`/target skills).
- **Outcomes/contexte du PROJET** : ❌ **était absent** → **ajouté** : `fetchGroqScores(project, …)` injecte désormais `Project: <nom> — <description>` en tête du prompt + le system prompt demande de tenir compte du contexte/outcomes du projet. Test back mocke le LLM en `any()` (n'assert pas le prompt) + projet de test sans description (`null` géré) → non cassé. **Backend rebuild + vérifié LIVE** : `POST .../issues/1/smart-assign` → 200, reco Lina Park, raison LLM.

**Preuve que le fix timeout était critique** : au re-test l'appel LLM a pris **40 s** (> 30 s par défaut) → l'ancien front aurait **timeout**. Confirme item 1.

## MAJ 15/08 — Teams dropdown (item 5) ✅
- Cause : la card d'équipe (`project-teams-section.tsx`) était en **`overflow-hidden`** (pour arrondir les bandes internes) → le dropdown de recherche de membres (`absolute`, sous l'input) était **clippé sous la card** = invisible.
- Fix : `overflow-hidden` retiré de la card ; coins des bandes internes arrondis à la place (`rounded-b-xl` sur la barre d'actions quand repliée + sur la section membres). `tsc` 0 · `eslint` 0 · déployé.

## Intégrations (item 6) — analyse + plan
- **`IntegrationsCatalog`** (`components/integrations/integrations-catalog.tsx`, 536 l) a DÉJÀ : statut connecté par outil, compteur « N connecté(s) », **vue détail** (`ConnectorDetailView`), filtre par **catégorie**. GitHub/Slack y sont (OAuth dans le détail).
- **`IntegrationsPanel`** (`settings/page.tsx:870+`) empile : Catalogue + **2 grosses cards GitHub + Slack** (Connect + repo browser / channels) + Webhooks. Les 2 cards = le « 2 trucs en bas » redondant à retirer.
- **Plan** : retirer les 2 SectionCards GitHub/Slack ; ajouter un **filtre connecté / pas connecté** au catalogue ; garder Webhooks + Catalogue.
- **Décision user = A** : garder les managers **seulement quand connecté** (compact), pas de grosse card Connect.

### Fait (15/08) — option A
- `IntegrationsPanel` (`settings/page.tsx`) : les SectionCards **GitHub** et **Slack** ne s'affichent **que si `connected`** (managers : repo browser / canaux). Plus de card « Connect » redondante quand déconnecté → la connexion passe par le **Catalogue**. Webhooks + Catalogue inchangés. Nettoyage des handlers/states OAuth locaux + import `Link2` devenus inutiles. `tsc` 0 · `eslint` clean · déployé.
- **Reste sur l'item 6** : ajouter un **filtre « connecté / pas connecté »** sur le `IntegrationsCatalog` (aujourd'hui filtre par catégorie seulement ; le statut connecté est déjà affiché par card + compteur).

## Item 7 — consolider `/profile` dans le modal ✅ (décision user = tout dans le modal)
- **Page `/profile` supprimée** → devient un **ouvreur** (redirige vers le modal, section Profil, par-dessus le dashboard). Plus de page standalone.
- **Aperçu extrait** en composant `components/profile/profile-overview.tsx` (stats + heatmap de contributions + activité récente, autonome via `useWorkspaceStore`) → monté dans la section **Profil** du modal (sous le formulaire d'édition).
- **Nouvelle section « Compétences »** dans le modal (`CompetencesPanel` = `MemberSkillsCard` + `MemberAvailabilityCard`, `canEdit`) → ajoutée à `SettingsSection`/`SECTIONS`/`SECTION_GROUPS`/`SettingsPanels` (groupe Personal, après Account, icône `Zap`).
- **Abandonné** (redondant ailleurs) : bouton « Modifier le profil » (on EST dans les réglages), carte forfait (→ `/billing`), liste projets (→ page projets), compteurs follow.
- **Entrées recâblées** : `nav-user` « Account » → `openSettings("profile")` (au lieu de `push(/profile)`) ; `command-palette` garde `go("/profile")` → ouvreur (cohérent avec `go("/settings")`).
- `tsc` 0 · `eslint` clean · déployé · routes 200/200.

## MAJ 15/08 — fin du round (items 6-fin, 2, 3)
- **Item 6 (fin)** ✅ — filtre **« Toutes / Connectées / Non connectées »** ajouté en tête du `IntegrationsCatalog` (state `statusFilter` + filtrage + pills réutilisant `CatPill` + message vide adapté). `tsc` 0 · `eslint` clean.
- **Item 2 (Auto-assign UI)** ✅ — le bouton **du sheet** (`smart-assign-panel.tsx`) passe d'un `<button>` brut à un **`Button` shadcn** (cohérent avec le bouton board `bulk-assign-dialog`, déjà shadcn) en gardant son look primary doux. *(Amélioration « cohérence » ; l'item était subjectif/non vérifiable à l'aveugle — à re-challenger à l'œil si besoin.)*
- **Item 3 (PDP)** ✅ (upload) — root cause : `handleFileChange` (ProfilePanel) ne mettait à jour que l'état LOCAL du formulaire ; le backend `POST /users/me/avatar` **persiste pourtant** l'avatar. Sans resync, la photo ne se propageait nulle part → « ça marche pas ». Fix : **`await refreshUser()`** après upload + reset du formulaire gardé sur **`user.id`** (sinon uploader effacerait un nom en cours d'édition).
- **Cohérence avatars (diagnostic)** : `UserAvatar` = DiceBear **seedé sur l'EMAIL** (stable). MAIS `TeamMemberResponse` (back) **n'expose pas d'email** → `project-teams-section` passe `email={m.displayName}` → seed ≠ → avatar différent pour le même user dans les équipes. **Fix proposé (non fait)** : ajouter `email` à `TeamMemberResponse` (back, rebuild) + passer `email={m.email}` front. Petit, cosmétique.

## MAJ 15/08 (bis) — Smart Assign LENT : diagnostic complet + optimisation
- **Toast « impossible de générer » non-interactif** ✅ — 1 seul Toaster global (`(protected)/layout.tsx`). Quand un sheet Radix modal est ouvert → `body { pointer-events:none }` → portail sonner non cliquable. Fix : `toastOptions={{ className: "pointer-events-auto" }}` dans `components/ui/sonner.tsx`.
- **« Tourne dans le vide puis erreur »** = **bundle navigateur périmé** : le fix timeout (200s) EST déployé (vérifié dans le conteneur), mais sans hard-refresh le navigateur garde le vieux bundle (30s) → coupe à 30s alors que le LLM met >30s. → hard-refresh.
- **Groq = faux départ** : l'ai-service (`ollama_gateway.py`) est **Ollama-only** ; les vars `GROQ_*` sont vestigiales (clé morte = 403, mais **jamais utilisée**). Le routeur est **correct** : `resolve_tier("fast") → qwen3:8b, /no_think` (vérifié, JSON propre, pas de raisonnement).
- **Vraie cause de la lenteur** : mesures — Ollama 8b **GPU + chaud + petit prompt = 8s** (~47 tok/s, GPU modeste) ; **smart-assign complet chaud = 34s** ; **froid (8b évincé par un appel 14b) = 53s**. Le modèle scorait **TOUS les membres du workspace** (projet public → beaucoup de candidats) → prompt/génération longs.
- **Fix (rebuild en cours)** : `SmartAssignService` — **pré-filtre heuristique `preScore` → shortlist top `SHORTLIST_SIZE=8`** envoyée au LLM (au lieu de tous). Le LLM ne rerank qu'une shortlist → prompt + génération bien plus courts. Test ≤8 candidats → shortlist = tous → non cassé.
- **Reste côté user (perf démo)** : garder **qwen3:8b chaud** — il est évincé quand une tâche 14b tourne (assistant/analyse). `OLLAMA_KEEP_ALIVE` long + `OLLAMA_MAX_LOADED_MODELS=2` (si la VRAM tient 8b≈5.3GB + 14b≈9GB) évite le rechargement (+20s).
- **Lot 1 shortlist (rebuild vérifié)** : `SHORTLIST_SIZE=8` → **53→24s à chaud** (49s à froid).
- **Lot 2** : `SHORTLIST_SIZE=5` (= la sortie top+4alt) — gardé.
- **⚡ VRAIE CAUSE (mesures Ollama directes)** : le problème n'était NI les tokens NI le pré-filtre. **(a)** `json_mode` (`response_format:json_object`) sur Ollama = génération contrainte par grammaire → gonfle le prompt à ~2500 tokens + très lent (52s). **(b)** `qwen3:8b` est un **modèle de RAISONNEMENT** → verbeux/lent même avec `/no_think` (1583 tokens sans json_mode). **`qwen2.5:7b-instruct`** (installé, instruct pur) fait la MÊME tâche en **~2.4s à chaud** (77 tokens, JSON propre).
- **FIX = router le tier « fast » sur `qwen2.5:7b-instruct`** : `docker-compose.dev.yml:199` `OLLAMA_MODEL_FAST` (+ défaut `ai-service/app/config.py`). Recréé le conteneur `ai-service` (`docker compose -p taskforce-app up -d --force-recreate --no-deps ai-service`). **Résultat vérifié : 53s → 2.2-2.9s (~20×).** Affecte tout le tier fast (smart-assign + petites actions) ; le tier deep (14b, analyse) inchangé.
- **Revert du « single reason »** : maintenant que c'est rapide, plus besoin ; et il donnait la raison au *meilleur LLM* ≠ top final (mêlé heuristiques) → le recommandé retombait sur la raison Java. Retour à **une raison LLM par candidat** (max 12 mots). **Vérifié : ~4s à chaud (6.6s à froid), recommandé = phrase IA** (« React experience, low open issues… »).
- **`json_mode` toujours `true`** dans l'appel smart-assign (`chatCompletion(...true...)`) — laissé tel quel car qwen2.5 est rapide même avec ; à retirer si on veut grappiller (optionnel).

## MAJ 15/08 (ter) — UI/UX Smart Assign (sheet + modal bulk)

Retour user : (a) modal bulk propose 6× la même personne = **problème de seed** (peu de tâches, 1 profil compétent gagne) → **différé** (seed réaliste « plus tard ») ; (b) le trigger du sheet fait « toute la largeur de la sidebar », devrait être **taille input** → **le mettre dans l'input avec une étoile IA**.

- **Sheet (`smart-assign-panel.tsx` + `issue-sheet.tsx`)** : le bouton pleine largeur « Smart assign » **supprimé**. Le trigger devient une **étoile IA (`Sparkles`) `size-8`** posée **à droite du Select Assignee** (même hauteur que l'input). Sans assigné → elle « brille » (primary + `ring-primary/15`) comme CTA ; avec assigné → discrète (re-analyse). Le panneau devient **contrôlé** (`open`/`onOpenChange`/`runToken`) : clic étoile = ouvre **et** lance l'analyse (jeton `smartRun` bumpé → `useEffect([runToken])` via `analyzeRef`), re-clic = ferme. `defaultOpen` retiré ; `smartOpen` réinitialisé dans l'effet `[issue]` (pas de fuite d'une issue à l'autre).
- **Modal bulk (`bulk-assign-dialog.tsx`)** : barre d'outils **« Tout cocher/décocher »** (case tri-état via `Minus`) + **résumé** `X/Y · N personne(s)` (rend visible le cas « tout à la même personne » sans le cacher) ; lignes = **flèche `issue → personne`** + **score coloré par confiance** (`scoreTone` : vert ≥70 / ambre ≥50 / neutre) ; loader avec libellé « Analyse de l'équipe… » ; `title=factors` au survol.
- **Vérif** : `tsc --noEmit` clean, `eslint` clean (les 2 warnings `set-state-in-effect` d'`issue-sheet` sont **préexistants**, effet reset/commentaires). Front recompile « ✓ Ready ». **Vérif visuelle in-app browser bloquée** (panneau masqué + l'API n'est pas joignable *depuis ce panneau* — la session Brave du user marche) → contrôle à l'œil laissé à la QA live.

## MAJ 15/08 (quater) — Create-issue dialog : carte Suggest-assignee + pastille labels

- **Carte « Suggest assignee » (`create-issue-dialog.tsx`) peu lisible** (« je vois pas grand chose ») : tout en `[10px]`, avatar `size-6`, alternatives = minuscules chips texte. → **agrandi** : `p-3`, avatar `size-7`, nom `text-sm`, méta `[11px]`, **score `text-sm` bold à droite** ; **alternatives = pills avec mini-avatars** (`size-4` + prénom + score) sous un libellé « Autres candidats » (au lieu de « Omar · 62% » illisible). Bouton Assign `h-7 text-xs`.
- **Pastille de label blanche quand sélectionné** : dans le picker du dialog, sélectionner remplit le bouton de `label.color` + texte blanc, mais la pastille gardait `label.color` → **invisible**. → pastille `#ffffff` quand `isSelected`. *(Le picker du **sheet** utilise un ✓ sur fond neutre, pas de remplissage couleur → non concerné.)*
- Vérif : `tsc`/`eslint` clean, front recompilé.

## MAJ 15/08 (5) — « tout dans profil » : Compétences repliées dans Profile

Retour user : la section **« Compétences »** du menu Settings faisait doublon → **tout dans Profile**.
- `settings/page.tsx` : retiré `"skills"` du **type** `SettingsSection`, de `SECTIONS`, de `SECTION_GROUPS` (Personal) et du **dispatcher** `SettingsPanels`. `CompetencesPanel` **conservé** mais rendu désormais **dans `ProfilePanel`** (après « Save profile », avant `ProfileOverview`) : identité → **Compétences + Disponibilité** (cartes membre, `canEdit`) → aperçu (stats + heatmap).
- Aucun deep-link vers `skills` (grep) → un `?section=skills` résiduel retombe proprement sur `profile` (validation `SECTIONS.some` côté modal + page). `Zap` encore utilisé (UsagePanel).
- **Vérifié LIVE (in-app browser)** : menu = Profile/Account/Appearance/Notifications/Security/Privacy (+ Workspace) ; panneau Profile contient bien « Compétences · utilisées par le Smart Assign » + « Disponibilité » + stats/activité. `tsc`/`eslint` clean.

## MAJ 15/08 (6) — Profil : « Activité récente » retirée + sécurité (à trancher)

- **`profile-overview.tsx`** : bloc **« Activité récente » supprimé** (retour user « on s'en fiche ») → ne reste que **stats + heatmap**. Nettoyé le code mort (`ACTIVITY_META`, `ACTIVITY_FALLBACK`, `relativeDate`, imports `Calendar`/`Users`, `activity` du store). tsc/eslint clean.
- **Export données** : bien dans **Privacy & Data** (`PrivacyPanel`, RGPD Art. 20). ✅
- **Delete account DUPLIQUÉ** → **RÉSOLU** (choix user « Privacy & Data seul ») : danger zone **retirée d'`AccountPanel`** (+ `handleDelete`/`deleting` supprimés). Account = **Email + Langue** + un **renvoi cliquable** vers Privacy & Data (`setSection("privacy")`). La suppression + l'export restent dans `PrivacyPanel` (RGPD Art. 17/20). **Vérifié LIVE** : Account n'a plus de bouton Delete, le lien « Privacy & Data » s'affiche. tsc/eslint clean.
- **Sécurité** → **DÉCISION user = garder tel quel** (option B). On NE touche PAS au `SecurityPanel` : texte honnête « auth déléguée à Keycloak (OIDC) ; mot de passe / 2FA / sessions gérés dans la console compte Keycloak ». **Pas de lien in-app, pas de passkey** pour l'instant. (Rappel pour plus tard si besoin : realm `taskforce-dev`, console = `${KEYCLOAK_URL}/realms/taskforce-dev/account` ; passkey = activer WebAuthn dans le realm ; nécessiterait un `NEXT_PUBLIC_KEYCLOAK_*` côté front.)

## MAJ 16/08 — Visite guidée (product tour) : logique de re-déclenchement

Retour user : (a) **terminée** → bloquée à vie ; (b) **fermée tôt SANS cocher** → revient au prochain accès ; (c) **fermée tôt AVEC « ne plus afficher »** → bloquée à vie. La case était **à créer**.
- **Bug d'origine** : toute fermeture faisait `close(true)` → `hasSeen` posé → jamais de retour ; **et** boucle intra-session possible (le déclencheur dashboard rescheduld dès que `isActive` repasse à false).
- **`tour-store.ts`** : ajout d'un flag **`dismissed` éphémère** (non persisté). `close(markSeen)` pose toujours `dismissed=true` + `hasSeen` seulement si `markSeen`. `start()` remet `dismissed=false` (rejeu depuis l'aide).
- **`dashboard/page.tsx`** : le déclencheur skip si `hasSeen || dismissed` (au lieu de `hasSeen` seul) → plus de boucle intra-session, mais retour au prochain **chargement** (dismissed repart à false).
- **`product-tour.tsx`** : case **« Ne plus afficher cette visite »** dans le pied (masquée sur la dernière étape = complétion). Croix + Échap → `close(dontShowAgain)` ; « Terminer »/upgrade → `close(true)`. Reset de la case à chaque (ré)ouverture.
- **Vérifié LIVE (JS)** : (1) fermer sans cocher → `hasSeen:false`, **revient au reload** ✅ ; (2) cocher + fermer → `hasSeen:true`, **ne revient plus** ✅ ; pas de boucle.

## État « gestion de projet complète ? » (16/08)
- **UI/fonctionnel** (pages, cycles, settings, teams, smart-assign, profil/settings) : alignés DA + revus lors des passes précédentes.
- **Seed compétences** : **rempli** (`dev_seed.sql` : `member_skill_profiles` — 6 skillsets, `capacity_hours_per_week`, `seniority`, `growth_enabled`). Labels issues ↔ skills OK.
- **⚠️ Gaps seed pour une démo jury qui claque** : (1) **`member_leaves` NON semé** → « Disponibilité » plate (tout le monde pareil, « aucune indispo ») ; (2) skillsets **round-robin** (`v_skillsets[1+(j%6)]`) + charges similaires → **scores smart-assign resserrés** (~60 %, pas de best-match évident). = l'item « seed réaliste » déféré. **À proposer : seed curé (personas distincts + quelques congés) pour un best-match net.**

## MAJ 16/08 — SEED CURÉ pour une démo Smart Assign qui claque (choix user)

**Constat** : les 8 membres nommés ont DÉJÀ des skills distincts/curés (Sarah react/ts LEAD, Marcus java, Tom devops, Nina data…). Le round-robin ne concerne que les figurants « solo ». La vraie cause du clustering ~60 % = **charge** (spécialistes peu chargés → gonflés hors-domaine) + **dispo à plat** (congés jamais semés). **Découverte clé** : `SmartAssignService` calcule `availability = 100 - openPoints*loadFactor` → la « dispo » vient de la CHARGE, **pas** de `member_leaves` (qui n'avait AUCUN effet sur la reco).

**Seed (`dev_seed.sql`)** :
- **10b. Charge par domaine** : assigné les issues ouvertes API/OPS aux spécialistes (Marcus API-4/5/8, Omar API-6, Tom OPS-4/5/6) → ils sont « occupés » → ne remontent plus sur les issues WEB (React). Les issues WEB restent surtout non assignées → un dev React dispo gagne net.
- **10c. `member_leaves`** (US-006) : Lina VACATION (aujourd'hui), Marcus SICK (aujourd'hui), Nina REMOTE (présent), Tom VACATION (future). Dates relatives à CURRENT_DATE. Peuple la carte « Disponibilité » du profil + sert la reco (cf. code ci-dessous).
- **Hero WEB-5** relabellisé `react`+`typescript` (au lieu de react+ui) → Aïcha (react/ts, 2 matches) gagne nettement.

**Code (`SmartAssignService`)** : les congés étaient cosmétiques. **Wiring** : `resolveCandidates` **exclut du vivier** les membres en **VACATION/SICK chevauchant aujourd'hui** (REMOTE = présent, conservé) via `onLeaveUserIds()` (JdbcTemplate, cohérent avec le reste). Un cap sur `availability` avait été tenté d'abord mais **insuffisant** (le `workloadScore` d'un absent à 0 issue restait à 100 → il gagnait quand même) → exclusion = règle métier correcte + robuste. Test : stub `queryForList(member_leaves)` → `List.of()` ajouté au setUp (sinon NPE sur le mock).

**Vérifié LIVE (avant le wiring exclusion)** : WEB-5 → **Aïcha 68 « react,typescript expertise »** (gagnante nette), Sarah la lead rétrogradée (surchargée, avail 0), warm ~2.8s. ⏳ Re-test après rebuild pour valider l'exclusion des congés (WEB-7 ne doit plus recommander Lina absente).

**Bulk toujours clusterisé (test après seed)** : le multi-assign donnait encore Omar (QA, 0 skill) 4/6 — la plainte d'origine PAS résolue par le seed seul. Cause = **scoring** : `labelScore` (skill déterministe) pesait 0.08 vs charge/dispo 0.32 + un sémantique LLM local (qwen) trop généreux (0.45, qui note un QA ~0.6 sur une issue React) → la personne la moins chargée mais NON qualifiée raflait tout.

**Rééquilibrage du score final (`rankCandidates`, 16/08)** — j'avais d'abord dit « je ne touche pas », mais le test bulk prouve que c'est nécessaire pour l'objectif user (« corrige si nécessaire »). Nouveaux poids (∑=1.0) : **semantic 0.45→0.40, labelScore 0.08→0.22, workloadScore 0.22→0.16, historical 0.15→0.14, availability 0.10→0.08**. Le sémantique peut TOUJOURS dominer (test « score sémantique élevé fait remonter un sans-skill » OK), mais le fit métier compte enfin. **Pré-validé par calcul** puis **`it.ps1 -Test SmartAssignServiceTest` = 35/35 PASS** (dont les tests d'ordre : skill-first, surchargé-derrière-libre, redistribution bulk).

**Vérifié LIVE après rebuild** ✅ : WEB-5 → Aïcha 66% (Omar QA tombe 57→**49%**). **BULK 6 issues → Sarah 2 · Aïcha 2 · Omar 2** (avant Omar 4/6) : WEB-1(react+ui)→Sarah, WEB-5(react+ts)→Aïcha, WEB-7(ui, Lina exclue)→Sarah, +1 react→Aïcha ; les 2 restantes = issues SANS label (« Itération #NN » générées) → Omar (le moins chargé), normal (aucun skill à matcher). **Plainte d'origine « 6× la même personne » = résolue** pour les issues réelles (labellisées). NB démo : bulk-assigner des issues labellisées (pas les filler sans label). Full suite `it.ps1 -Test ALL` non relancée (changement circonscrit à SmartAssignService, couvert par sa classe de test ; suite complète = « plus tard » côté user).

## Round QA — TERMINÉ (items 1-7). Reste optionnel :
- Cohérence avatars équipes (ajout `email` au DTO back) si le user le veut.
- Seed démo propre (N users) pour le use-case Smart Assign au jury — item « plus tard » (rend aussi le modal bulk plus réaliste : plusieurs personnes distinctes).
- Tests back verts + CI GitHub Actions — item « plus tard ».

## Reste (prochains items QA)
- Intégrations : filtre connecté/pas-connecté (item 6, fin). Consolider `/profile` (item 7). Auto-assign UI (item 2). PDP profil + cohérence avatars (item 3).
