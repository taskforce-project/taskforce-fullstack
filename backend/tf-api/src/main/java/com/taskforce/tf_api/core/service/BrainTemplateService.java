package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.enums.BrainTemplateType;
import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeType;

/**
 * Fournit le jeu de nodes d'amorçage d'un Brain OS selon le gabarit choisi.
 *
 * <p>Tout brain part des 16 READMEs de domaine ({@link #blankScaffold()}). Les gabarits
 * sectoriels (SaaS, Ecommerce, Marketplace, Agentic) ajoutent par-dessus des nodes experts
 * (ADR, SOP, findings, specs) qui constituent une architecture de connaissance de haut niveau,
 * prête à être éditée par l'humain comme par l'IA.
 */
@Service
public class BrainTemplateService {

    /** Un node à créer lors de l'amorçage. */
    public record SeedNode(NodeDomain domain, NodeType type, String title, String content) {}

    /** Retourne les nodes d'amorçage pour un gabarit donné. */
    public List<SeedNode> nodesFor(BrainTemplateType template) {
        List<SeedNode> nodes = new ArrayList<>(blankScaffold());
        switch (template) {
            case SAAS        -> nodes.addAll(saasExpert());
            case ECOMMERCE   -> nodes.addAll(ecommerceExpert());
            case MARKETPLACE -> nodes.addAll(marketplaceExpert());
            case AGENTIC     -> nodes.addAll(agenticExpert());
            case BLANK       -> { /* scaffolding seul */ }
        }
        return nodes;
    }

    // =========================================================================
    // BLANK — 16 READMEs de domaine (architecture vierge)
    // =========================================================================

    private List<SeedNode> blankScaffold() {
        Map<NodeDomain, String> purpose = new LinkedHashMap<>();
        purpose.put(NodeDomain.PROJET,
            "Raison d'être du projet, parties prenantes, objectifs, contraintes, glossaire. "
            + "Le point d'entrée : quelqu'un qui arrive doit comprendre *pourquoi* ce projet existe.");
        purpose.put(NodeDomain.PRODUIT,
            "Vision produit, personas, proposition de valeur, périmètre fonctionnel, état des features. "
            + "La réalité de ce que fait le produit aujourd'hui (pas l'intention).");
        purpose.put(NodeDomain.ARCHITECTURE,
            "Vue d'ensemble technique : composants, flux, choix structurants. "
            + "Les ADR (Architecture Decision Records) vivent ici ou en 12-decisions.");
        purpose.put(NodeDomain.ENGINEERING,
            "Conventions de code, standards, outils, workflow git, definition of done. "
            + "Le dev qui arrive trouve ici *comment on travaille*.");
        purpose.put(NodeDomain.API,
            "Contrats d'API (endpoints, schémas, versionnement, auth). La source de vérité d'intégration.");
        purpose.put(NodeDomain.INFRA,
            "Topologie de déploiement, environnements, IaC, réseaux, secrets, coûts cloud.");
        purpose.put(NodeDomain.SECURITE,
            "Modèle de menace, contrôles, conformité (RGPD…), gestion des secrets, revues de sécurité.");
        purpose.put(NodeDomain.OPERATIONS,
            "Observabilité, SLO/SLI, alerting, astreinte, processus de release.");
        purpose.put(NodeDomain.AUDITS,
            "Constats : dette technique, problèmes connus, résultats d'audits. Daté et vérifiable.");
        purpose.put(NodeDomain.RUNBOOKS,
            "Procédures exécutables pas-à-pas (incident, rotation de secret, restauration…).");
        purpose.put(NodeDomain.PCA_PRA,
            "Plan de continuité / reprise d'activité : RTO, RPO, sauvegardes, scénarios de désastre.");
        purpose.put(NodeDomain.DECISIONS,
            "Journal des décisions (ADR business & tech), daté, avec contexte/option/conséquence. "
            + "Le 'pourquoi on a fait ça'. Relié par SUPERSEDES quand une décision en remplace une autre.");
        purpose.put(NodeDomain.ROADMAP,
            "Backlog, jalons, cycles, vision v1 → v2 → v3. Ce qui est prévu et pourquoi.");
        purpose.put(NodeDomain.DESIGN,
            "Système de design, maquettes, parcours utilisateur, recherche UX.");
        purpose.put(NodeDomain.UTILISATEUR,
            "Documentation utilisateur, release notes, support, FAQ.");
        purpose.put(NodeDomain.HISTORIQUE,
            "Historique des actions importantes (boucles OODA, post-mortems). La mémoire vivante.");
        purpose.put(NodeDomain.ARCHIVE,
            "Contenu obsolète conservé pour traçabilité. Rien ne se supprime, tout s'archive.");

        List<SeedNode> nodes = new ArrayList<>();
        purpose.forEach((domain, text) -> nodes.add(new SeedNode(
            domain, NodeType.README,
            domain.getCode() + " · " + readableName(domain),
            "# " + domain.getCode() + " — " + readableName(domain) + "\n\n" + text
            + "\n\n> Domaine vide. Ajoutez ici vos premiers nodes (note, ADR, SOP…)."
        )));
        return nodes;
    }

    // =========================================================================
    // SAAS — architecture experte
    // =========================================================================

    private List<SeedNode> saasExpert() {
        List<SeedNode> n = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PRODUIT, NodeType.DOC,
            "Modèle SaaS — proposition de valeur & métriques North Star",
            """
            # Proposition de valeur SaaS

            ## North Star Metric
            Définir LA métrique qui capture la valeur livrée (ex. *weekly active teams*,
            *projects shipped/week*). Tout le reste en découle.

            ## Métriques pirates (AARRR)
            - **Acquisition** : CAC, canaux, taux de visite → signup.
            - **Activation** : time-to-value, *aha moment* (ex. 1er projet créé < 10 min).
            - **Rétention** : cohortes, churn logo & revenu, NRR (objectif > 100 %).
            - **Revenu** : MRR/ARR, ARPA, expansion vs new.
            - **Référence** : NPS, viralité (k-factor).

            ## Modèle de pricing
            Par siège / usage / hybride. Documenter les paliers, la logique de packaging
            (good-better-best) et les limites par plan dans 05-api & 01-projet.
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.ADR,
            "ADR-001 — Multi-tenancy : isolation des données",
            """
            # ADR-001 — Stratégie de multi-tenancy

            **Statut** : à décider · **Date** : à dater

            ## Contexte
            Un SaaS sert N clients sur une infra partagée. Le choix d'isolation conditionne
            sécurité, coût, conformité et scalabilité.

            ## Options
            1. **Shared schema** (colonne `tenant_id` partout) — moins cher, densité max,
               risque de fuite si un `WHERE tenant_id` est oublié.
            2. **Schema-per-tenant** — isolation forte, migrations plus lourdes.
            3. **DB-per-tenant** — isolation maximale, coût et ops élevés (clients enterprise).

            ## Recommandation
            Shared schema + Row-Level Security PostgreSQL pour le gros du parc ; offre
            DB dédiée en option enterprise. Tracer toute requête cross-tenant comme incident.

            ## Conséquences
            Tests d'isolation obligatoires ; index composites `(tenant_id, …)`.
            """));

        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.SOP,
            "SOP — Onboarding sécurité d'un nouveau tenant",
            """
            # SOP — Provisioning sécurisé d'un tenant

            1. Créer l'espace avec quotas par plan (anti-abus).
            2. Générer les secrets par tenant (jamais partagés).
            3. Activer RLS / vérifier le scoping `tenant_id`.
            4. Journaliser dans l'audit log (création, rôle owner).
            5. Envoyer l'email de bienvenue + checklist RGPD.
            """));

        n.add(new SeedNode(NodeDomain.OPERATIONS, NodeType.DOC,
            "SLO & observabilité SaaS",
            """
            # SLO / SLI

            | Service | SLI | SLO |
            | --- | --- | --- |
            | API | disponibilité | 99.9 % mensuel |
            | API | latence p95 | < 300 ms |
            | Jobs async | délai de traitement | < 60 s p95 |

            Error budget = 1 - SLO. Si épuisé → gel des features, focus fiabilité.
            Dashboards + alerting reliés à 08-operations et aux runbooks (10).
            """));

        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DECISION,
            "DEC-001 — Stratégie de facturation & gestion du churn",
            """
            # DEC-001 — Facturation

            **Contexte** : choisir le moteur de facturation et la politique de dunning.
            **Options** : Stripe Billing / maison / hybride.
            **Décision** : (à compléter) — privilégier Stripe pour le time-to-market.
            **Conséquences** : webhooks idempotents, réconciliation, gestion des impayés
            (relances J+1/J+3/J+7, grace period, downgrade auto vers FREE).
            """));

        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC,
            "Stratégie v1 → v2 (passage à l'échelle)",
            """
            # Évolution produit

            - **v1** : product-market fit, cœur métier, 1 persona.
            - **v2** : expansion (intégrations, API publique, RBAC fin, SSO).
            - **v3** : self-serve enterprise (audit, SCIM, résidence des données).

            Chaque incrément majeur = un ADR + une revue de dette (09-audits).
            """));

        return n;
    }

    // =========================================================================
    // ECOMMERCE — architecture experte
    // =========================================================================

    private List<SeedNode> ecommerceExpert() {
        List<SeedNode> n = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PRODUIT, NodeType.DOC,
            "Modèle e-commerce — funnel & métriques clés",
            """
            # Funnel e-commerce

            Visite → Produit → Panier → Checkout → Paiement → Livraison → Rétention.

            ## Métriques
            - Taux de conversion global & par étape (où ça fuit ?).
            - AOV (panier moyen), abandon de panier, CAC vs LTV.
            - Taux de retour, marge nette par SKU.

            Tout point de friction du funnel devient un FINDING (09-audits).
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.ADR,
            "ADR-001 — Catalogue, stock & cohérence des commandes",
            """
            # ADR-001 — Cohérence catalogue/stock/commande

            ## Contexte
            Survente = expérience client cassée. Le stock est une ressource concurrente.

            ## Options
            1. Décrément transactionnel à la commande (simple, contention en pic).
            2. **Réservation de stock** avec TTL au moment du panier/checkout.
            3. Event-sourcing du stock (audit complet, complexité ++).

            ## Recommandation
            Réservation avec TTL + idempotence des paiements. Saga pour
            commande↔paiement↔expédition. Stock = source de vérité unique.
            """));

        n.add(new SeedNode(NodeDomain.API, NodeType.SPEC,
            "Spec — Webhooks paiement & idempotence",
            """
            # Webhooks paiement

            - **Idempotence** : clé par événement, dédup en base.
            - **Vérification de signature** obligatoire (rejeter sinon).
            - **Réconciliation** : job qui compare commandes vs paiements (anti-drift).
            - États : `pending → paid → fulfilled → refunded`. Jamais de saut d'état.
            """));

        n.add(new SeedNode(NodeDomain.OPERATIONS, NodeType.RUNBOOK,
            "Runbook — Pic de charge (Black Friday)",
            """
            # Runbook — Évènement de forte charge

            **Avant** : load test, scaling pré-provisionné, CDN/cache produit chaud,
            gel des déploiements risqués.
            **Pendant** : surveiller checkout p95, taux d'erreur paiement, stock.
            File d'attente virtuelle si saturation.
            **Après** : post-mortem (16-historique), ajustement des seuils.
            """));

        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.FINDING,
            "Conformité PCI-DSS & données de paiement",
            """
            # PCI-DSS

            Ne JAMAIS stocker le PAN. Déléguer à un PSP (tokenisation).
            Réduire le scope PCI au maximum. Chiffrer les PII, journaliser les accès.
            RGPD : base légale, durée de conservation, droit à l'effacement.
            """));

        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC,
            "Leviers de croissance e-commerce",
            """
            # Croissance

            - Réduction de l'abandon de panier (relances, 1-click).
            - Upsell / cross-sell / bundles.
            - Programme de fidélité & rétention.
            - SEO produit + performance (Core Web Vitals = conversion).
            """));

        return n;
    }

    // =========================================================================
    // MARKETPLACE — architecture experte (two-sided)
    // =========================================================================

    private List<SeedNode> marketplaceExpert() {
        List<SeedNode> n = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PRODUIT, NodeType.DOC,
            "Modèle marketplace — offre, demande & liquidité",
            """
            # Marketplace bilatérale

            Le défi central : **la liquidité** (offre et demande qui se rencontrent vite).

            ## Problème de l'œuf et la poule
            Stratégies d'amorçage : *single-player mode*, concentration géographique/verticale,
            subvention d'un côté du marché au départ.

            ## Métriques
            - Liquidité (taux de match, time-to-match).
            - GMV, take rate, repeat rate par côté.
            - Ratio offre/demande par segment.
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.ADR,
            "ADR-001 — Matching, paiements & séquestre (escrow)",
            """
            # ADR-001 — Cœur transactionnel marketplace

            ## Contexte
            Trois acteurs : acheteur, vendeur, plateforme. La confiance est le produit.

            ## Décisions structurantes
            - **Escrow** : la plateforme retient les fonds jusqu'à validation (split payment).
            - **Matching** : moteur de pertinence (filtre + ranking, plus tard ML).
            - **Take rate** : prélèvement automatisé, traçable, réconcilié.
            - **Litiges** : workflow de dispute + remboursement.

            Utiliser un PSP gérant les comptes connectés (ex. Stripe Connect).
            """));

        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.SOP,
            "SOP — Trust & Safety (KYC, fraude, modération)",
            """
            # Trust & Safety

            1. **KYC/KYB** des vendeurs (vérification d'identité).
            2. **Détection de fraude** : scoring transactions, vélocité, signaux.
            3. **Modération** des annonces (auto + humain).
            4. **Système de réputation** : avis bilatéraux, anti-gaming.
            5. **Désescalade** : litiges, bannissement, remboursement.
            """));

        n.add(new SeedNode(NodeDomain.OPERATIONS, NodeType.DOC,
            "Mesure & pilotage de la liquidité",
            """
            # Pilotage liquidité

            Surveiller par segment : taux de match, délai de match, taux d'annulation,
            ratio offre/demande. Alerter quand un côté décroche. La supply et la demand
            se pilotent séparément (acquisition différenciée).
            """));

        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DECISION,
            "DEC-001 — Politique de take rate & subvention",
            """
            # DEC-001 — Take rate

            **Contexte** : fixer la commission sans tuer la liquidité naissante.
            **Décision** : (à compléter) — take rate progressif, subvention du côté rare au lancement.
            **Conséquences** : suivi marge vs croissance, révision trimestrielle.
            """));

        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC,
            "Expansion marketplace v1 → v2",
            """
            # Expansion

            - **v1** : une verticale, une géographie, liquidité prouvée.
            - **v2** : nouvelles verticales/géo, outils pro vendeurs, API.
            - **v3** : services additionnels (logistique, financement, assurance).
            """));

        return n;
    }

    // =========================================================================
    // AGENTIC — produit basé sur des agents IA
    // =========================================================================

    private List<SeedNode> agenticExpert() {
        List<SeedNode> n = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PRODUIT, NodeType.DOC,
            "Produit agentique — boucle de valeur & garde-fous",
            """
            # Produit basé sur des agents

            ## Boucle de valeur
            Perception (contexte) → Raisonnement (LLM) → Action (tools) → Observation →
            apprentissage. La valeur naît de l'**action fiable**, pas du chat.

            ## Garde-fous (non négociables)
            - **Human-in-the-loop** sur les actions à fort impact.
            - **Traçabilité** : chaque action de l'agent est journalisée (16-historique).
            - **Réversibilité** : préférer les actions annulables.
            - **Budget** : plafonds de coût/tokens par tâche.
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.ADR,
            "ADR-001 — Orchestration & routing de modèles (fast/deep)",
            """
            # ADR-001 — Orchestration agentique

            ## Contexte
            Coût et latence explosent si tout passe par un gros modèle.

            ## Décision
            **Router** fast/deep : classifier l'intention avec un petit modèle (cheap),
            router les requêtes simples vers un modèle rapide et les tâches décisionnelles
            vers un modèle de raisonnement. Tool-calling maison plutôt qu'un framework lourd.

            ## Conséquences
            Observabilité des coûts par route ; fallback gracieux si un provider est indisponible.
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.SPEC,
            "Spec — RAG & mémoire (retrieval + write-back)",
            """
            # RAG & mémoire

            - **Ingestion** : chunking, embeddings, index vectoriel (pgvector).
            - **Retrieval** : top-k + expansion de graphe + reranking sous budget de tokens.
            - **Write-back** : l'agent écrit ses conclusions en mémoire → le système apprend.
            - **Évaluation** : jeux de tests, mesure de la pertinence du retrieval (pas que le LLM).
            """));

        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.FINDING,
            "Sécurité LLM — prompt injection & exfiltration",
            """
            # Menaces spécifiques LLM

            - **Prompt injection** (directe & indirecte via contenu récupéré).
            - **Exfiltration de données** via les outils.
            - **Sur-permission** des agents (principe du moindre privilège pour les tools).
            - **Hallucination** sur actions critiques → validation humaine.

            Mitigations : allow-list d'outils, sandboxing, validation de sortie, audit complet.
            """));

        n.add(new SeedNode(NodeDomain.OPERATIONS, NodeType.DOC,
            "Évaluation & observabilité des agents",
            """
            # Eval & observabilité

            - **Traces** : entrée, contexte récupéré, décisions, appels d'outils, sortie.
            - **Eval offline** : datasets, LLM-as-judge, régression à chaque changement de prompt.
            - **Eval online** : feedback utilisateur, taux d'intervention humaine, coût/tâche.
            """));

        n.add(new SeedNode(NodeDomain.HISTORIQUE, NodeType.ACTION_OODA,
            "Boucle OODA — gabarit d'action agentique",
            """
            # OODA — <titre de l'action>

            - **Observe** : signaux, contexte récupéré.
            - **Orient** : hypothèses, options.
            - **Decide** : option retenue + pourquoi (relier à une DECISION).
            - **Act** : actions exécutées (+ validation humaine si impact).
            - **Résultat** : succès/obstacles/apprentissages → write-back mémoire.
            """));

        return n;
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String readableName(NodeDomain d) {
        return switch (d) {
            case PROJET       -> "Projet";
            case PRODUIT      -> "Produit";
            case ARCHITECTURE -> "Architecture";
            case ENGINEERING  -> "Engineering";
            case API          -> "API";
            case INFRA        -> "Infrastructure";
            case SECURITE     -> "Sécurité";
            case OPERATIONS   -> "Opérations";
            case AUDITS       -> "Audits";
            case RUNBOOKS     -> "Runbooks";
            case PCA_PRA      -> "PCA / PRA";
            case DECISIONS    -> "Décisions";
            case ROADMAP      -> "Roadmap";
            case DESIGN       -> "Design";
            case UTILISATEUR  -> "Utilisateur";
            case HISTORIQUE   -> "Historique des actions";
            case ARCHIVE      -> "Archive";
        };
    }
}
