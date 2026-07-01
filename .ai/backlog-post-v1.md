# Backlog post-V1 — « les plus » (après clôture V1 + soutenance)

> **But de ce fichier** : sortir du chemin critique tout ce qui n'est **ni exigé par le CDC**, **ni exigé par la
> grille RNCP (C1–C26)**. On y range les différenciateurs, les épics, les « niveau Plane/Linear », et tout le
> Brain OS au-delà de son socle. À reprendre **si le temps le permet** ou en V2.
>
> **Maj** : 2026-06-30 · Source : `.ai/roadmap.md` (AXE A) + `.ai/brain-os-roadmap.md`.
> Règle : un item n'est ici que s'il **n'empêche pas** de valider le CDC ou un critère RNCP.

---

## 1. Brain OS — mis en STAND-BY après son socle

> Le socle Brain OS (Phases 0→3 + deep-path agentique code-complet) est **fait**. Tout le reste est différé.
> Détail : `.ai/brain-os-roadmap.md`.

| Item | Origine | Note |
| --- | --- | --- |
| Phase 4 — Issues enrichies (decision log, « déjà vu ? » similarity, HITL approve/reject, code agent → PR draft) | brain-os-roadmap §5 P4 | Gros chantier produit, hors CDC |
| Phase 5 — Marketplace (Brain Packs, Agent Packs C-level OODA, pont Obsidian export/import, data mgmt) | brain-os-roadmap §5 P5 | Vision monétisation |
| tiptap WYSIWYG inline · viewer PDF in-app · wizard onboarding IA | brain-os-roadmap P3 futur | Bloqué réseau (npm proxy) pour tiptap |
| Graph expansion 1-hop dans le search · worker RabbitMQ async embeddings · A* context-walk | brain-os-roadmap P1/P2 | Optim scale |
| **Env-gated** : `fastembed` (sémantique réelle, réseau propre) · génération LLM + tool-calling + write-back (clé Groq/Anthropic) | brain-os-roadmap | Aucun code à écrire, juste config/clé |
| Partitionnement PG par workspace · float16 vecteurs · archivage cold >6 mois · virtualisation graphe SVG O(n²) | brain-os-roadmap §5bis | Scale >10M nodes |

**Reste avant stand-by complet** : tests + revue sécu du périmètre Brain OS (mutualisé avec le chantier Tests global).

---

## 2. Produit — « niveau Plane/Linear » (au-delà du CDC)

> Ambition « gérer un projet complet niveau marché ». **Aucun** n'est requis par le CDC.

| Item | ID roadmap | Prio |
| --- | --- | :--: |
| Modules (regroupement de features) — domaine entier BE+FE | matrice §2 | P3 |
| Views (vues sauvegardées + filtres persistés) | matrice §2 | P3 |
| Layouts Calendrier · Tableur (spreadsheet) · Gantt/Timeline complet | matrice §2 | P3 |
| Intake / triage de demandes externes | matrice §2 | P3 |
| Estimates (déjà story points partiels) · Templates issue/projet | matrice §2 / PROD-2.9 | P3 |
| Import / Export (CSV/JSON, import Jira/Plane) | matrice §2 | P3 |
| Sous-issues : hiérarchie parent/enfant complète (relations existent) | matrice §2 | P3 |
| PROD-2.9 Templates de projet/board · PROD-2.11 méthodo configurable (kanban/scrum) | PROD-2 | P3 (à discuter) |
| PROD-1.10 Liveness dashboard/analytics temps réel sous-seconde | PROD-1 | P3 |

---

## 3. RBAC avancé & entreprise (épics)

| Item | ID | Effort |
| --- | --- | :--: |
| RBAC granulaire façon GitHub (rôles custom, permissions par team/membre, matrice) | PROD-3.9 | ~5 j·h |
| Config entreprise / on-premise (realm Keycloak dédié, SSO/OIDC, provisioning, doc install) | PROD-3.10 | ~4 j·h |

> V1 = OWNER/ADMIN/MEMBER + `WorkspaceAccessInterceptor` (suffit pour CDC + C24).

---

## 4. Intégrations tierces (vision « wrapper »)

| Item | ID | Statut |
| --- | --- | --- |
| Slack messages bidirectionnels | PROD-5.2 | 🔒 coming-soon (dépend du chat/Messages) |
| Asana (nouveau provider OAuth + sync) | PROD-5.3 | P3 |
| Webhooks sortants configurables — UI de gestion | PROD-5.4 | P3 |
| GitHub wrapper : sync **write**/bidirectionnel, commits/membres, refresh auto | PROD-5.1 (suite) | read-sync livré ; write = plus |

> CDC ne demande que « API REST pour intégration Jira/Trello » → l'**API REST publique** suffit. Les wrappers = différenciateur produit.

---

## 5. IA & différenciateurs (PROD-6, ~10 j·h)

Agents C-level, insights avancés, exploitation worklogs comme signal Smart Assign, etc. Le Smart Assign de base
(cœur CDC) est **livré** ; tout l'enrichissement au-delà est un plus.

---

## 6. Chat / Discussions / Messages

Extra TaskForce (hors CDC). Actuellement **verrouillés « coming soon »**. À livrer proprement (sécurité STOMP OK)
puis déverrouiller — après la V1.

---

## 7. Divers plus

- PROD-4.x : polish limites teams/agents, CTA invite/analytics, cohérence copy pricing (storage/projets annoncés non enforced).
- Observabilité complète (au-delà du minimum C21) : dashboards Grafana métier, alerting.
- Landing : itérations design au-delà du seuil SEO C20.

---

> **Rappel de priorisation** : rien de ce fichier ne bloque la soutenance. Le chemin critique V1 vit dans
> `.ai/roadmap.md` (sections non-P3) et se résume à : **QA → Tests (C18/C25) → sécu finale/CVE → CI (C19/C26) →
> docs conception (C1–C12) → accessibilité (C13/C15) → SEO (C20) → PCA/PRA opérationnel → artefacts gestion de projet**.
