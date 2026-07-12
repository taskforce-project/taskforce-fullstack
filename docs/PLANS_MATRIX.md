# Forfaits TaskForce — permissions, accès & upsell

Tarification **par membre / mois**. Rang : **Free < Basic < Business < Enterprise**.
Source de vérité code : `PlanType`, `WorkspaceService` (workspaces), `ProjectService` (collab. projet privé),
`AiUsageService.limitFor` (tokens), `PlanFeatureService.MATRIX` (features), `plan-gate.tsx` (gating front). Prix = **placeholders**.

> **Modèle « membres » (façon Linear + GitHub).** Les membres sont **illimités sur tous les forfaits**
> (tarification par siège, comme Linear). Le seul plafond « type membre » porte sur le **nombre de
> collaborateurs d'un projet _privé_ en Free** (façon GitHub : dépôt privé = collaborateurs limités).
> Un projet **public** (visible par tout le workspace) n'a jamais de plafond.

## 1. Tarifs & souscription

| | **Free** | **Basic** | **Business** | **Enterprise** |
|---|---|---|---|---|
| Prix | 0 € | **10 € / membre / mois** | **16 € / membre / mois** | Sur devis |
| Souscription | — | Self‑service (Stripe) | Self‑service (Stripe) | Contact commercial |
| Facturation | — | Par siège (nb de membres) | Par siège (nb de membres) | Annuelle / négociée |

## 2. Limites (quotas)

| Limite | Free | Basic | Business | Enterprise | Appliqué par |
|---|---|---|---|---|---|
| Workspaces | **2** | **5** | ∞ | ∞ | `WorkspaceService.workspaceLimitFor` ✅ *enforced* |
| Membres (workspace) | ∞ | ∞ | ∞ | ∞ | per‑seat, aucun plafond ✅ (comme Linear) |
| Collaborateurs / projet **privé** | **5** | ∞ | ∞ | ∞ | `ProjectService.enforcePrivateProjectSeatLimit` ✅ *enforced (409)* |
| Collaborateurs / projet **public** | ∞ | ∞ | ∞ | ∞ | visible par tout le workspace ✅ |
| Issues | 250 *(indicatif)* | ∞ | ∞ | ∞ | affiché, **pas encore enforced** ⚠️ |
| Tokens IA Cortex / mois | **100 000** | **500 000** | **2 000 000** | ∞ | `AiUsageService.limitFor` ✅ *enforced (quota compte)* |

## 3. Fonctionnalités & accès (`PlanFeatureService` / `plan-gate`)

| Fonctionnalité | Free | Basic | Business | Enterprise |
|---|:---:|:---:|:---:|:---:|
| Board / List / Cycles | ✅ | ✅ | ✅ | ✅ |
| Smart Assign (IA) `AI_SMART_ASSIGN` | ✅ | ✅ | ✅ | ✅ |
| Uploads de fichiers illimités | — | ✅ | ✅ | ✅ |
| Rôles administrateur | — | ✅ | ✅ | ✅ |
| Projets privés — plafond collaborateurs (façon GitHub) | ✅ *5 collab. max* | ✅ | ✅ | ✅ |
| Analytics avancées + burndown `ADVANCED_ANALYTICS` | — | — | ✅ | ✅ |
| Insights IA `AI_INSIGHTS` | — | — | ✅ | ✅ |
| Assistant/Décisions IA `AI_ASSISTANT` | — | — | ✅ | ✅ |
| Intégration GitHub `INTEGRATIONS` | — | — | ✅ | ✅ |
| Historique illimité `UNLIMITED_HISTORY` | — | — | ✅ | ✅ |
| SSO / SAML / SCIM | — | — | — | ✅ |
| Contrôles admin granulaires | — | — | — | ✅ |
| Audit & conformité RGPD | — | — | — | ✅ |
| Déploiement on‑premise | — | — | — | ✅ |
| Support prioritaire / accompagnement | — | — | prioritaire | dédié |

> Côté back, la matrice `PlanFeatureService` n'a que 2 niveaux effectifs : **{Free, Basic} = smart‑assign uniquement**,
> **{Business, Enterprise} = toutes les features**. Les distinctions Basic (uploads/rôles) et Enterprise
> (SSO/audit/on‑premise) sont **produit/UI** ; les enforcer finement = ajouter des clés `PlanFeature`.
>
> Le plafond « collaborateurs sur projet privé » n'est **pas** une clé `PlanFeature` mais une **limite
> numérique** enforced dans `ProjectService.enforcePrivateProjectSeatLimit` (Free = 5, payant = ∞).
> *Caveat 1* : le plafond compte les `ProjectMember` ajoutés **directement** ; attacher une **équipe** entière
> à un projet privé contourne le décompte (à durcir plus tard si besoin).
>
> ✅ *Visibilité projet privé — cœur enforced* (`TF-PROJECT-VISIBILITY`) : `ProjectService` filtre désormais la
> **liste** et le **détail** projet (+ membres/labels/activité/équipes) — un projet privé est visible si
> `is_public OR ProjectMember OR OWNER/ADMIN`, sinon **404**. ⚠️ *Reste à durcir (2ᵉ passe)* : les **vues agrégées
> d'issues** (My Queue, Signals, recherche, analytics) ne filtrent pas encore par visibilité projet → un projet
> privé est masqué, mais ses **issues** peuvent transparaître dans ces flux transverses.

## 4. Points d'upsell (où proposer le passage au tier supérieur)

| Déclencheur (dans l'app) | Vers | Message type | Où c'est câblé |
|---|---|---|---|
| 2ᵉ workspace créé (Free) / 5ᵉ (Basic) → limite atteinte | Basic → Business | « Workspaces illimités en Business » | `WorkspaceService.checkWorkspaceLimit` (409) → CTA front |
| Jauge Cortex ≥ 70 % / 90 % (popover, page Facturation) | tier supérieur | « Plus de tokens Cortex » | `CortexUsage` (amber/rose) + `/billing` |
| Ouvrir **Analytics avancées** en Free/Basic | Business | « Débloquez l'analytics avancée » | `PlanGate minPlan="BUSINESS"` / `analytics/page` (`isPro`) |
| Tenter **Décisions / Insights IA** en Free/Basic | Business | « Passez à Business pour l'IA » | `plan-features` (`AI_INSIGHTS`, `AI_ASSISTANT`) |
| **6ᵉ collaborateur sur un projet privé** (Free) | Free → payant | « Projets privés limités à 5 collab. — rendez‑le public, ou passez à un forfait payant » | `enforcePrivateProjectSeatLimit` (409) → toast CTA dans `project-invite-dialog` ✅ |
| Besoin **SSO / audit / on‑premise** | Enterprise | « Parlons‑en » → `mailto:sales@` | carte Enterprise `/billing` |
| Menu utilisateur / bouton « Améliorer » (Cortex) | `/billing` | grille complète | `useUpgradeStore` → `UpgradeDialog` → `/billing` |

## 5. Migration & états

- Anciens comptes **PRO → Business** (migration `V68`).
- `plan_status` (Stripe) : `TRIALING / ACTIVE / PAST_DUE / CANCELED …` — orthogonal au `plan_type`.
- Gating front « payant » (`isPro`) = **Business ou Enterprise** (Basic = payant mais pas « pro features »).
