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

    /**
     * Un node à créer lors de l'amorçage. {@code system=true} = node du noyau (kernel) :
     * lu par l'agent, masqué de l'explorateur utilisateur par défaut (expertise/moat).
     */
    public record SeedNode(NodeDomain domain, NodeType type, String title, String content, boolean system,
                           Long projectRefId, String key, String parentKey) {
        public SeedNode(NodeDomain domain, NodeType type, String title, String content) {
            this(domain, type, title, content, false, null, null, null);
        }
        public SeedNode(NodeDomain domain, NodeType type, String title, String content, boolean system) {
            this(domain, type, title, content, system, null, null, null);
        }
        public SeedNode(NodeDomain domain, NodeType type, String title, String content, boolean system, Long projectRefId) {
            this(domain, type, title, content, system, projectRefId, null, null);
        }
    }

    /** Référence légère vers un projet du workspace (+ titres d'issues réelles pour densifier). */
    public record ProjectRef(Long id, String name, List<String> issues) {
        public ProjectRef(Long id, String name) { this(id, name, List.of()); }
    }

    /** Retourne les nodes d'amorçage pour un gabarit donné. */
    public List<SeedNode> nodesFor(BrainTemplateType template) {
        List<SeedNode> nodes = new ArrayList<>(blankScaffold());
        switch (template) {
            case SAAS        -> nodes.addAll(saasExpert());
            case ECOMMERCE   -> nodes.addAll(ecommerceExpert());
            case MARKETPLACE -> nodes.addAll(marketplaceExpert());
            case AGENTIC     -> nodes.addAll(agenticExpert());
            case TASKFORCE   -> nodes.addAll(taskforceSeed());
            case BLANK       -> { /* scaffolding seul */ }
        }
        return nodes;
    }

    /**
     * Variante rangée <b>par projet</b> : 1 cluster = 1 projet (TaskForce-spécifique).
     * Le hub central « Brain OS » porte le contexte global ; chaque projet a son README + ses notes
     * (backlog, fait, problèmes, décisions, archi, runbook) rattachées via {@code refId}.
     */
    public List<SeedNode> nodesFor(BrainTemplateType template, List<ProjectRef> projects) {
        if (template == BrainTemplateType.TASKFORCE && projects != null && !projects.isEmpty()) {
            return taskforceProjectSeed(projects);
        }
        return nodesFor(template);
    }

    // =========================================================================
    // TASKFORCE (par projet) — Brain OS global + 1 cluster de notes par projet
    // =========================================================================

    private List<SeedNode> taskforceProjectSeed(List<ProjectRef> projects) {
        List<SeedNode> n = new ArrayList<>();
        String agentsTitle = "AGENTS — contrat d'agent";

        // ── Hub global : contexte workspace + un lien par projet ─────────────────
        StringBuilder hub = new StringBuilder();
        hub.append("# 🧠 Brain OS — TaskForce\n\n")
           .append("Mémoire vivante du workspace. Le **contexte global** est ici ; chaque **projet** ouvre sa propre dimension.\n\n")
           .append("> [!tip] Méthode\n> Règles de tenue dans [[").append(agentsTitle).append("]] (appliquées par l'agent IA).\n\n")
           .append("## Global\n")
           .append("- [[Charte & conventions]]\n- [[Architecture transverse]]\n- [[Sécurité — politique]]\n")
           .append("- [[Stack & infra commune]]\n- [[Roadmap workspace]]\n\n")
           .append("## Projets\n");
        for (ProjectRef p : projects) hub.append("- [[").append(p.name()).append("]]\n");
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, "Brain OS", hub.toString(), false));
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.SOP, agentsTitle, agentsContract(), true));

        // ── Docs globaux (refId null → cluster « global » autour du hub) ─────────
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.DOC, "Charte & conventions", """
            # Charte & conventions #convention

            Monorepo `taskforce-fullstack` : `backend/tf-api` (Spring Boot, couches `shared ← core ← modules`),
            `frontend` (Next.js App Router, Zustand), `ai-service`. Règles d'or dans `CLAUDE.md`.

            - API versionnée sous `/api`, enveloppe `ApiResponse<T>` (lecture `data.data`).
            - DB = migrations Flyway `V{n}__…` ; `ddl-auto=validate`.
            - Pas de mock, TS strict, un store Zustand par domaine.

            Hub : [[Brain OS]] · Règles : [[%s]]""".formatted(agentsTitle)));
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC, "Architecture transverse", """
            # Architecture transverse #archi

            Services joints par nom Docker (`http://backend:8080`). Postgres + pgvector(384) pour le Brain OS.
            Auth JWT, autorisation au niveau service (`WorkspaceMember`/`ProjectMember`).

            Voir aussi : [[Stack & infra commune]] · [[Sécurité — politique]]"""));
        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.SOP, "Sécurité — politique", """
            # Sécurité — politique #securite

            Secrets via variables d'env (jamais en dur). Validation `@Valid` (back) / Zod (front).
            Revue de sécurité avant release. Voir [[Architecture transverse]]."""));
        n.add(new SeedNode(NodeDomain.INFRA, NodeType.DOC, "Stack & infra commune", """
            # Stack & infra commune #infra

            Docker Compose (dev) : `backend`, `frontend`, `postgres`, `minio`, `ai-service`.
            MinIO pour les pièces jointes. Voir [[Architecture transverse]]."""));
        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC, "Roadmap workspace", """
            # Roadmap workspace #roadmap

            Jalons transverses. Le détail par projet vit dans chaque dimension projet.
            Hub : [[Brain OS]]"""));

        // ── Un ARBRE récursif par projet (système → sous-système → … → notes). ───
        for (ProjectRef p : projects) n.addAll(projectTree(p));
        return n;
    }

    /** Système de niveau 2 d'un projet + ses sous-systèmes. */
    private record Sys(String name, NodeDomain domain, List<String> subs) {}

    /**
     * Arbre récursif d'un projet : galaxie (README) → systèmes (Produit/Eng/Ops/Finance/Marketing)
     * → sous-systèmes → feuilles, avec une branche plus profonde (Finance › Budget › trimestres › lignes)
     * et des wikilinks transverses inter-branches (le "chaos" qui crée les insights).
     */
    private List<SeedNode> projectTree(ProjectRef p) {
        Long id = p.id();
        String name = p.name();
        String rootKey = "p" + id;
        List<SeedNode> n = new ArrayList<>();
        List<String> subTitles = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, name,
            "# " + name + "\n\nGalaxie du projet **" + name + "**. Systèmes : Produit · Engineering · Ops · Finance · Marketing."
            + "\n\nWorkspace : [[Brain OS]]", false, id, rootKey, null));

        List<Sys> systems = List.of(
            new Sys("Produit", NodeDomain.PRODUIT, List.of("Recherche", "Design", "Roadmap")),
            new Sys("Engineering", NodeDomain.ENGINEERING, List.of("Frontend", "Backend", "API", "Tests")),
            new Sys("Ops", NodeDomain.OPERATIONS, List.of("Infra", "Sécurité", "Runbooks", "Monitoring")),
            new Sys("Finance", NodeDomain.DECISIONS, List.of("Budget", "Coûts", "Facturation")),
            new Sys("Marketing", NodeDomain.PRODUIT, List.of("Contenu", "SEO", "Growth")));

        for (Sys s : systems) {
            String sysKey = rootKey + ":" + s.name();
            String sysTitle = name + " › " + s.name();
            n.add(new SeedNode(s.domain(), NodeType.DOC, sysTitle,
                "# " + sysTitle + " #systeme\n\nSystème **" + s.name() + "** du projet **" + name + "**.",
                false, id, sysKey, rootKey));
            for (String sub : s.subs()) {
                String subKey = sysKey + ":" + sub;
                String subTitle = sysTitle + " › " + sub;
                subTitles.add(subTitle);
                n.add(new SeedNode(s.domain(), NodeType.DOC, subTitle,
                    "# " + subTitle + " #soussysteme\n\nSous-système **" + sub + "** de " + s.name() + ".",
                    false, id, subKey, sysKey));
                for (int i = 1; i <= 7; i++) {
                    NodeType lt = switch (i % 4) {
                        case 0 -> NodeType.ADR; case 1 -> NodeType.FINDING; case 2 -> NodeType.SPEC; default -> NodeType.DOC;
                    };
                    String tag = switch (i % 4) {
                        case 0 -> "#decision"; case 1 -> "#probleme"; case 2 -> "#spec"; default -> "#note";
                    };
                    String leafTitle = subTitle + " · " + i;
                    String cross = subTitles.size() > 3 ? "\n\nLié à [[" + subTitles.get((i * 7 + sub.length()) % subTitles.size()) + "]]." : "";
                    n.add(new SeedNode(s.domain(), lt, leafTitle, "# " + leafTitle + " " + tag + cross,
                        false, id, subKey + ":" + i, subKey));
                }
            }
        }

        // Branche plus profonde : Finance › Budget › trimestre › lignes (démontre "et ainsi de suite").
        String budgetKey = rootKey + ":Finance:Budget";
        for (String q : List.of("Q1", "Q2", "Q3", "Q4")) {
            String qKey = budgetKey + ":" + q;
            String qTitle = name + " › Finance › Budget › " + q;
            n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DOC, qTitle, "# " + qTitle + " #budget", false, id, qKey, budgetKey));
            for (int i = 1; i <= 4; i++)
                n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DOC, qTitle + " · ligne " + i,
                    "# Ligne budgétaire " + i + " #finance", false, id, qKey + ":" + i, qKey));
        }

        // Vraies issues → feuilles sous Engineering › Backend.
        String backendKey = rootKey + ":Engineering:Backend";
        int k = 0;
        for (String raw : p.issues()) {
            String t = raw == null ? "" : (raw.length() > 60 ? raw.substring(0, 59) + "…" : raw);
            if (t.isBlank()) continue;
            k++;
            n.add(new SeedNode(NodeDomain.ENGINEERING, NodeType.DOC, name + " › issue · " + k + " " + t,
                "# " + t + " #issue #backlog", false, id, backendKey + ":i" + k, backendKey));
        }
        return n;
    }

    /** Le paquet de notes d'un projet (README hub + backlog/fait/problèmes/décisions/archi/runbook). */
    private List<SeedNode> projectCluster(ProjectRef p) {
        Long id = p.id();
        String name = p.name();
        List<SeedNode> n = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, name, ("""
            # %s

            README du projet. Tout ce qui concerne **%s** vit dans cette dimension.

            ## Sommaire
            - [[%s — Architecture]]
            - [[%s — Backlog]]
            - [[%s — Fait / livré]]
            - [[%s — Problèmes connus]]
            - [[%s — Décisions (ADR)]]
            - [[%s — Runbook]]

            ---
            Workspace : [[Brain OS]]""").formatted(name, name, name, name, name, name, name, name),
            false, id));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC, name + " — Architecture", ("""
            # %s — Architecture #archi

            Vue technique du projet : composants, dépendances, points d'intégration.
            Décisions structurantes → [[%s — Décisions (ADR)]]. Cf. [[Architecture transverse]].""").formatted(name, name),
            false, id));

        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC, name + " — Backlog", ("""
            # %s — Backlog #backlog

            Travaux à venir, priorisés. Ce qui passe en cours/fait migre vers [[%s — Fait / livré]].""").formatted(name, name),
            false, id));

        n.add(new SeedNode(NodeDomain.HISTORIQUE, NodeType.DOC, name + " — Fait / livré", ("""
            # %s — Fait / livré #done

            Historique des livraisons et travaux terminés du projet.""").formatted(name),
            false, id));

        n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING, name + " — Problèmes connus", ("""
            # %s — Problèmes connus #probleme

            Bugs et limites identifiés, avec contournement. Une décision de fond → [[%s — Décisions (ADR)]].""").formatted(name, name),
            false, id));

        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.ADR, name + " — Décisions (ADR)", ("""
            # %s — Décisions (ADR) #decision

            Décisions d'architecture du projet : Contexte · Options · Décision · Conséquences.
            Référence l'[[%s — Architecture]].""").formatted(name, name),
            false, id));

        n.add(new SeedNode(NodeDomain.RUNBOOKS, NodeType.RUNBOOK, name + " — Runbook", ("""
            # %s — Runbook #runbook

            Procédures d'exploitation : build, déploiement, incidents. Cf. [[Stack & infra commune]].""").formatted(name),
            false, id));

        // ── Stubs denses (refs/tags + wikilinks croisés) : réseau transverse riche. ──
        int k = 0;
        String lastIssue = "";
        for (String raw : p.issues()) {
            String t = raw == null ? "" : (raw.length() > 60 ? raw.substring(0, 59) + "…" : raw);
            if (t.isBlank()) continue;
            // Les issues se chaînent entre elles + au backlog → réseau dense.
            String prev = k > 0 ? "\n\nSuit [[" + name + " · #" + k + " " + lastIssue + "]]." : "";
            n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC, name + " · #" + (k + 1) + " " + t,
                "# " + t + " #issue #backlog\n\nItem du projet **" + name + "**. Rattaché au [[" + name + " — Backlog]]." + prev,
                false, id));
            lastIssue = t; k++;
        }
        String[] adr = { "Choix de pile technique", "Stratégie de tests", "Gestion des erreurs",
            "Modèle de données", "Stratégie de cache", "Versionnement d'API" };
        for (int i = 0; i < adr.length; i++) n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.ADR, name + " · ADR — " + adr[i],
            "# ADR — " + adr[i] + " #decision #archi\n\nContexte · Options · Décision · Conséquences (projet **" + name + "**)."
            + "\n\nVoir [[" + name + " — Décisions (ADR)]] · [[" + name + " — Architecture]] · [[Architecture transverse]].",
            false, id));
        String[] pb = { "Latence intermittente", "Dette technique", "Couverture de tests faible",
            "Fuite mémoire suspectée", "Flakiness CI", "Documentation obsolète" };
        for (int i = 0; i < pb.length; i++) n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING, name + " · Pb — " + pb[i],
            "# " + pb[i] + " #probleme\n\nObservé sur le projet **" + name + "**."
            + "\n\nVoir [[" + name + " — Problèmes connus]] · décision liée [[" + name + " · ADR — " + adr[i % adr.length] + "]].",
            false, id));
        String[] concepts = { "Performance", "Observabilité", "Qualité", "Scalabilité", "Sécurité applicative" };
        for (String c : concepts) n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC, name + " · Concept — " + c,
            "# " + c + " #concept\n\nAxe transverse du projet **" + name + "**."
            + "\n\nRelie [[" + name + " — Architecture]] · [[" + name + " — Problèmes connus]] · [[Architecture transverse]].",
            false, id));

        // ── Masse de stubs (×5) : chaque note rattachée à une section → réseau dense. ──
        for (int i = 1; i <= 40; i++) n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC, name + " · Tâche-" + i,
            "# Tâche " + i + " #task #backlog\n\nProjet **" + name + "**. Rattaché au [[" + name + " — Backlog]].", false, id));
        for (int i = 1; i <= 24; i++) n.add(new SeedNode(NodeDomain.API, NodeType.SPEC, name + " · Spec-" + i,
            "# Spec " + i + " #spec\n\nProjet **" + name + "**. Voir [[" + name + " — Architecture]].", false, id));
        for (int i = 1; i <= 18; i++) n.add(new SeedNode(NodeDomain.AUDITS, NodeType.DOC, name + " · Test-" + i,
            "# Test " + i + " #test\n\nProjet **" + name + "**. Couvre [[" + name + " — Problèmes connus]].", false, id));
        for (int i = 1; i <= 14; i++) n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DOC, name + " · Réunion-" + i,
            "# Réunion " + i + " #meeting\n\nProjet **" + name + "**. Acte [[" + name + " — Décisions (ADR)]].", false, id));
        for (int i = 1; i <= 24; i++) n.add(new SeedNode(NodeDomain.PRODUIT, NodeType.DOC, name + " · Doc-" + i,
            "# Doc " + i + " #doc\n\nProjet **" + name + "**. Décrit [[" + name + " — Architecture]].", false, id));

        return n;
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

        // Titres des READMEs (utilisés pour les [[wikilinks]] depuis le hub).
        Map<NodeDomain, String> readmeTitle = new LinkedHashMap<>();
        purpose.keySet().forEach(d -> readmeTitle.put(d, d.getCode() + " · " + readableName(d)));

        String agentsTitle = "AGENTS — contrat d'agent";

        List<SeedNode> nodes = new ArrayList<>();

        // ── Hub (VISIBLE) : sommaire qui lie toute l'architecture ────────────────
        StringBuilder hub = new StringBuilder();
        hub.append("# 🧠 Brain OS\n\n")
           .append("Mémoire de connaissance vivante de ce workspace. Point d'entrée unique : tout part d'ici.\n\n")
           .append("> [!tip] Méthode\n")
           .append("> Les règles de remplissage, mise à jour, versionnement et archivage sont décrites dans ")
           .append("[[").append(agentsTitle).append("]]. L'agent IA les applique automatiquement.\n\n")
           .append("## Domaines\n");
        readmeTitle.values().forEach(t -> hub.append("- [[").append(t).append("]]\n"));
        nodes.add(new SeedNode(NodeDomain.PROJET, NodeType.README, "Brain OS", hub.toString(), false));

        // ── AGENTS (SYSTÈME, caché) : le contrat d'agent = l'expertise (moat) ────
        nodes.add(new SeedNode(NodeDomain.PROJET, NodeType.SOP, agentsTitle, agentsContract(), true));

        // ── READMEs de domaine (VISIBLES), avec backlinks vers le hub ────────────
        purpose.forEach((domain, text) -> nodes.add(new SeedNode(
            domain, NodeType.README,
            readmeTitle.get(domain),
            "# " + domain.getCode() + " — " + readableName(domain) + "\n\n" + text
            + "\n\n> Domaine vide. Les notes (note, ADR, SOP…) apparaîtront ici."
            + "\n\n---\nHub : [[Brain OS]] · Règles : [[" + agentsTitle + "]]"
        )));
        return nodes;
    }

    /** Contrat d'agent : règles de tenue du cerveau (remplir / mettre à jour / versionner / archiver). */
    private String agentsContract() {
        return """
            # AGENTS — contrat d'agent du Brain OS

            Règles que l'agent IA (et l'humain) suivent pour garder ce cerveau **propre, daté, fiable**.
            Ce node est système : lu par l'agent, masqué de l'explorateur par défaut.

            ## Principes
            - **Réalité, pas intention** : chaque note est datée et vérifiable. Le contexte ne ment jamais à l'IA.
            - **Une note = une idée**, titre clair et court.
            - **Lier plutôt que dupliquer** : `[[wikilinks]]` entre notes connexes + `#tags` transverses.

            ## Remplir
            - Choisir le bon **domaine** (01→16) et le bon **type** (ADR, DECISION, RUNBOOK, SOP, FINDING, SPEC, DOC…).
            - Une **décision** → node `DECISION`/`ADR` dans `12-décisions` : Contexte · Options · Décision · Conséquences.
            - Relier la note à son contexte avec `[[Titre exact]]` et la classer avec `#tags`.

            ## Mettre à jour
            - **Éditer** la note existante plutôt que créer un quasi-doublon.
            - Si une décision en **remplace** une autre : nouvelle note + relation `SUPERSEDES` vers l'ancienne
              (on ne réécrit pas l'histoire).

            ## Versionner
            - `versionLabel` : `v1` (actuel) / `v2` (cible). Garder `v1` jusqu'à bascule effective.
            - Changement notable → entrée datée dans `16-historique` (boucle OODA) + `CHANGELOG`.

            ## Supprimer / archiver
            - **Rien ne se supprime de l'historique** : on **archive** (status `ARCHIVED`, domaine `20-archive`).
            - La suppression dure est réservée aux brouillons / erreurs manifestes.

            ## Boucle OODA (action de l'agent)
            **Observe** (contexte récupéré) → **Orient** (options) → **Decide** (relier à une `DECISION`) →
            **Act** (exécuter, idéalement réversible + validation humaine si impact) → **consigner le résultat**
            (succès / obstacles / apprentissages) en mémoire.
            """;
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
    // TASKFORCE — brain pré-rempli avec la vraie histoire du produit (démo)
    // =========================================================================

    private List<SeedNode> taskforceSeed() {
        List<SeedNode> n = new ArrayList<>();

        // ── 01 · Projet ──────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.DOC,
            "TaskForce — charte de projet",
            """
            # TaskForce — charte de projet

            **TaskForce** est un SaaS de gestion de projet **multi-tenant** (style Linear/Jira) avec
            features **IA natives**, construit par une petite équipe produit/agence. #produit

            ## Pourquoi plusieurs projets
            Le code est un **polyrepo-in-a-monorepo** : 4 apps déployables + l'infra. Chaque app = un
            « projet » avec sa stack et son cycle :
            - [[Web Application (frontend)]] · [[API Platform (backend)]] · [[AI Service]] · [[Landing]] · [[Identity & Infra]]

            ## Objectif
            Un outil où la donnée de projet (issues, cycles, décisions) **et** la mémoire (Brain OS)
            vivent ensemble, lisibles par l'humain et par l'IA. #vision
            """));

        // ── 02 · Produit ─────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.PRODUIT, NodeType.DOC,
            "État du produit — features",
            """
            # État du produit

            Workspaces → projets → issues/cycles, plus : chat temps réel, discussions, pages wiki,
            analytics, **assistant IA + smart-assign**, billing Stripe, intégrations GitHub/Slack,
            et le **[[Brain OS]]** (graphe de connaissance). #produit

            > [!note] Réalité, pas intention
            > Cette fiche décrit ce qui marche aujourd'hui. Les manques sont tracés en
            > [[Audit PM — issues connues]] et [[Dette technique]].
            """));

        // ── 03 · Architecture (vue + ADR + projets) ──────────────────────────
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC,
            "Architecture système — vue d'ensemble",
            """
            # Architecture système

            ```
            Browser → Frontend (Next.js :3000) → Backend (Spring Boot :8080) → PostgreSQL 18 + pgvector
                                   │  WS/STOMP via RabbitMQ        │→ MinIO (fichiers) · Groq (LLM) · Stripe
                                   └→ Keycloak (OIDC, :8180)       │→ SMTP/Mailtrap · GitHub/Slack
            ```
            4 apps déployables + infra. Détail des briques : [[Web Application (frontend)]],
            [[API Platform (backend)]], [[AI Service]], [[Landing]], [[Identity & Infra]]. #architecture

            Backend en couches **shared ← core ← modules** (jamais l'inverse). Voir [[Conventions de code (règles d'or)]].
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.ADR,
            "ADR-001 — Stack technique",
            """
            # ADR-001 — Stack

            **Décision** : Next.js 16 / React 19 / TS / Tailwind 4 (front) · Spring Boot 4 / Java 21 (back) ·
            PostgreSQL 18 + **pgvector** · Keycloak (OIDC) · Docker Compose.
            **Conséquences** : polyrepo-in-monorepo, CI par app, `ddl-auto=validate` + Flyway. #decision #architecture
            Lié à : [[DEC — pgvector pour les embeddings]].
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.ADR,
            "ADR-002 — Temps réel via RabbitMQ (STOMP)",
            """
            # ADR-002 — Temps réel

            **Décision** : WebSocket STOMP relayé par **RabbitMQ** (`/topic`,`/queue`,`/user`), fallback
            `SimpleBroker` en mémoire si Rabbit down. Front via `@stomp/stompjs` (+ SockJS).
            **Pourquoi** : scaler le fan-out hors JVM. #decision #infra #realtime
            """));

        // Projets = apps/repos
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC,
            "Web Application (frontend)",
            """
            # Projet — Web Application (frontend) #frontend

            Next.js 16 (App Router) · React 19 · Zustand (1 store/domaine) · shadcn/Radix · Axios
            (`res.data.data`, 401→refresh→retry). Routes scopées `app/(protected)/[workspace]/…`.
            Repo logique : `frontend/`. Lié : [[Design system — shadcn + Tailwind]], [[Conventions de code (règles d'or)]].
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC,
            "API Platform (backend)",
            """
            # Projet — API Platform (backend) #backend

            Spring Boot 4 · Java 21 · Maven. `core` (≈18 controllers, ≈25 services, ≈35 entités) +
            `modules` (chat, ged/MinIO, sales) + `shared`. Persistance Flyway (`V1…V55`), `ddl-auto=validate`.
            Enveloppe `ApiResponse<T>`. Repo logique : `backend/tf-api/`.
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC,
            "AI Service",
            """
            # Projet — AI Service #ai

            `ai-service/` (FastAPI) — **l'unique chemin LLM** : le Java l'appelle via `AiGatewayClient`,
            il route vers **notre modèle local** (Ollama) et fournit les **embeddings** du Brain OS.
            Historique : d'abord un **stub** (vecteurs hash), puis un temps un appel **Groq en direct**
            depuis Java — supprimé le 16/07 (bloqué réseau, et son client ne comptait pas les tokens).
            Voir [[DEC — embedding lexical maison]].
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC,
            "Landing",
            """
            # Projet — Landing #frontend

            Site vitrine **Astro 5** (`landing-page/`), déployé séparément (dev :18081).
            """));

        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC,
            "Identity & Infra",
            """
            # Projet — Identity & Infra #infra #security

            Keycloak (OIDC, realm custom), Docker Compose (dev/prod), PostgreSQL 18 + pgvector, **MinIO**
            (S3), **RabbitMQ** (STOMP), Nginx (prod), SigNoz (observabilité optionnelle).
            Voir [[Stack Docker (dev/prod)]], [[Auth — Keycloak OIDC + tokens HS512 (dev)]].
            """));

        // ── 04 · Engineering ─────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.ENGINEERING, NodeType.SOP,
            "Conventions de code (règles d'or)",
            """
            # Conventions de code — règles d'or #backend #frontend

            1. Tout contrôleur porte `/api`. 2. Routes front dans `lib/config/api-routes.ts` → service `lib/api/*`.
            3. Client : `import { apiClient }`. 4. Lire `res.data.data`. 5. Couches `shared ← core ← modules`.
            6. Changement DB = migration Flyway `V{n}__…`. 7. TS strict, 0 `any`, 1 store Zustand/domaine, 0 mock.
            8. `@Valid` / Zod ; secrets en env. 9. Docker : nom de service, pas `localhost`.
            """));

        n.add(new SeedNode(NodeDomain.ENGINEERING, NodeType.SOP,
            "Workflow Git & CI",
            """
            # Git & CI #devops

            Branches depuis `dev` (`feature/*`,`fix/*`). Commits `type(scope): description`. PR = 1 label
            `release:{major|minor|patch}`. CI par app (`backend-tests`, `frontend-tests`, `landing-tests`),
            `release.yml` (images GHCR), `version-management.yml` (semver).
            """));

        // ── 05 · API ─────────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.API, NodeType.SPEC,
            "Contrats d'API — enveloppe ApiResponse",
            """
            # Contrats d'API #backend

            Toutes les réponses : `ApiResponse<T> = { success, data, message, statusCode }`.
            Erreurs normalisées par `GlobalExceptionHandler`. Auth : Bearer JWT. Routes publiques :
            `/api/auth/**`, `/api/files/**`, `/api/stripe/**`, `/api/sales/**`, callbacks d'intégration.
            """));

        // ── 06 · Infra ───────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.INFRA, NodeType.DOC,
            "Stack Docker (dev/prod)",
            """
            # Stack Docker #infra

            `docker-compose.dev.yml` : postgres(pgvector), keycloak(build), backend(hot reload),
            frontend, ai-service, landing, rabbitmq, minio, pgadmin. `prod.yml` + nginx. `tools.yml` :
            SigNoz + scanners (trivy/semgrep). Orchestration : `tf.ps1`, `scripts/*.ps1`, `Makefile`.
            Runbooks : [[Runbook — rebuild backend / frontend]], [[Runbook — recharger le seed (UTF-8 safe)]].
            """));

        // ── 07 · Sécurité ────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.ADR,
            "Auth — Keycloak OIDC + tokens HS512 (dev)",
            """
            # Auth #security #decision

            **Prod** : Keycloak OIDC, backend = resource server JWT. **Dev local** : `keycloak.enabled=false`
            + tokens **HS512** émis par `/api/auth/login` (décodeur `NimbusJwtDecoder.withSecretKey`).
            > [!warning] Piège
            > Les tokens Keycloak RS256 sont **rejetés** par le décodeur HS512 en dev — utiliser `/api/auth/login`.
            """));

        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.FINDING,
            "Sécurité — CSP, RGPD, secrets",
            """
            # Sécurité transverse #security

            CSP stricte (front `next.config.ts` ; API `default-src 'none'`). RGPD : export/effacement
            (module GDPR). Secrets en env (`.env.dev`), jamais en dur. Fichiers servis par proxy MinIO
            (clé UUID), avatars + pièces jointes Brain OS publics par clé.
            """));

        // ── 08 · Opérations ──────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.OPERATIONS, NodeType.DOC,
            "Observabilité (OpenTelemetry / SigNoz)",
            """
            # Observabilité #devops

            Agent Java OTel (traces/métriques/logs) → collector SigNoz (profil `observability`, désactivé
            par défaut via `OTEL_SDK_DISABLED`). Healthchecks Docker sur chaque service.
            """));

        // ── 09 · Audits (problèmes rencontrés — réels) ───────────────────────
        n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING,
            "Audit PM — issues connues",
            """
            # Audit — issues connues (KI) #problem

            Audit produit (juin 2026). Top P0/P1 :
            - **KI-001** 🔴 5 contrôleurs sans préfixe `/api` → Cycles/Teams/Pages/Discussions/Chat en 404.
            - **KI-002** 🟠 constantes de routes front manquantes → Messages/Integrations/Attachments/Roadmap crash.
            - **KI-004** 🟠 refresh de token cassé → re-login forcé. **KI-005** 🟠 webhooks Stripe stubbés.
            - **KI-007/009** assistant : streaming simulé, pas de cache insights. **KI-010** tests à faire.
            Détail/correctifs : [[Dette technique]]. #backlog
            """));

        n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING,
            "Dette technique",
            """
            # Dette technique (TD) #problem

            TD-001 (`/api` manquant), TD-002 (routes front), TD-004/007 (refresh/logout), TD-005 (Stripe
            lifecycle), TD-008 (streaming simulé), TD-010 (`ai-service` stub superseded par Groq-direct),
            TD-016/017/018 (cache insights, garde quota Groq, feature flags IA). #backlog
            """));

        n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING,
            "Problème — corruption UTF-8 du seed (PowerShell)",
            """
            # Problème résolu — UTF-8 cassé #problem

            **Symptôme** : `Itération` → `It??ration`, emojis `????` en base. **Cause** : chargement du
            seed via `Get-Content | psql` (PowerShell ré-encode en codepage OEM → octet `0x3f`).
            **Fix** : loader durci (`docker cp` + `psql -f`, zéro pipe hôte). Voir [[Runbook — recharger le seed (UTF-8 safe)]].
            """));

        n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING,
            "Problème — réseau du poste corrompt npm/pip",
            """
            # Problème ouvert — proxy corrompt les téléchargements #problem

            **Symptôme** : `npm install` / `pip install` échouent (« PACKAGES DO NOT MATCH THE HASHES »).
            **Impact** : `tiptap`, `shiki`, `prompt-kit`, `fastembed` non installables ; **Groq 403** réseau.
            **Contournement** : composants UI **vendus à la main** + embedding lexical maison.
            Voir [[DEC — composants UI vendus à la main]], [[DEC — embedding lexical maison]].
            """));

        n.add(new SeedNode(NodeDomain.AUDITS, NodeType.FINDING,
            "Problème — assistant IA (Groq) : 3 bugs",
            """
            # Problèmes résolus — assistant Groq #problem #ai

            1. **500 systématique** : `AssistantService.chat()` lisait des associations lazy hors session →
               fix `@Transactional(readOnly=true)`.
            2. **Clé vidée** : `environment: GROQ_API_KEY: ${GROQ_API_KEY:-}` écrasait `env_file` → ligne retirée.
            3. **Accents cassés** : réponse Groq lue en `String` via `StringHttpMessageConverter` (ISO-8859-1)
               → forcé **UTF-8** sur `groqRestTemplate`.
            Reste : 403 réseau (clé/poste) — externe.
            """));

        // ── 10 · Runbooks ────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.RUNBOOKS, NodeType.RUNBOOK,
            "Runbook — recharger le seed (UTF-8 safe)",
            """
            # Runbook — reseed UTF-8 #devops

            1. `.\\scripts\\db.ps1 seed` (ou `make seed`) — fait `docker cp` du `dev_seed.sql` puis
               `psql -f` **dans** le conteneur (`PGCLIENTENCODING=UTF8`).
            2. Ne **jamais** faire `Get-Content seed.sql | psql` (corrompt l'UTF-8).
            """));

        n.add(new SeedNode(NodeDomain.RUNBOOKS, NodeType.RUNBOOK,
            "Runbook — rebuild backend / frontend",
            """
            # Runbook — rebuild #devops

            Backend : `docker compose -f docker-compose.dev.yml build backend && … up -d backend`
            (ou `make dev-rebuild-be`). Frontend hot-reload ; `next.config.ts` modifié → **restart** du conteneur.
            """));

        // ── 12 · Décisions (ADR réels de la construction) ────────────────────
        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DECISION,
            "DEC — pgvector pour les embeddings",
            """
            # DEC — pgvector (vs Pinecone/Weaviate) #decision #ai

            **Décision** : `vector(384)` dans PostgreSQL + index **HNSW** cosine. **Pourquoi** : pas de
            service vectoriel externe, `all-MiniLM-L6-v2` = 384d (4× plus léger qu'OpenAI). Migration V52.
            """));

        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DECISION,
            "DEC — embedding lexical maison",
            """
            # DEC — embedding lexical offline #decision #ai

            **Contexte** : [[Problème — réseau du poste corrompt npm/pip]] bloque `fastembed`.
            **Décision** : repli **feature-hashing** (tokens + trigrammes, tf-log, L2) dans `ai-service` →
            similarité cosinus réellement pertinente, **sans dépendance**. Drop-in `fastembed` sur réseau propre.
            """));

        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DECISION,
            "DEC — composants UI vendus à la main",
            """
            # DEC — UI no-dep #decision #frontend

            **Contexte** : réseau bloque `tiptap`/`shiki`/`prompt-kit`. **Décision** : éditeur markdown,
            renderer (callouts/code/images), loader, kit chat agentique **écrits à la main** (cva+lucide+
            framer-motion déjà présents). Swappables vers les vrais paquets sur réseau propre.
            """));

        n.add(new SeedNode(NodeDomain.DECISIONS, NodeType.DECISION,
            "DEC — Brain OS : noyau caché (moat)",
            """
            # DEC — noyau Brain OS #decision

            **Décision** : hub + READMEs **visibles** (« give the knowledge ») ; **AGENTS** (règles de tenue
            du cerveau) **caché** (`system`), lu par l'agent (« sell the implementation »). L'architecture est
            **liée d'office** via `[[wikilinks]]` au seed.
            """));

        // ── 13 · Roadmap ─────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC,
            "Roadmap — fait / en cours / backlog",
            """
            # Roadmap #roadmap

            > [!success] Fait
            > Cœur PM (workspaces/projets/issues/cycles), temps réel, billing Stripe, intégrations,
            > IA (smart-assign/assistant/insights), **Brain OS** (graphe, éditeur riche, recherche
            > sémantique, MinIO, kit chat agentique), QA encodage/archive-pin/UI.

            > [!warning] Backlog v2
            > Deep-path agentique (tool-calling), tiptap réel, tests (couverture), feature flags IA,
            > Stripe lifecycle complet, refresh token, cache insights. Voir [[Dette technique]].
            """));

        // ── 14 · Design ──────────────────────────────────────────────────────
        n.add(new SeedNode(NodeDomain.DESIGN, NodeType.DOC,
            "Design system — shadcn + Tailwind",
            """
            # Design system #design

            shadcn/ui (Radix) + Tailwind 4. Thème clair/sombre via tokens CSS. Composants dans `components/ui/`.
            """));

        // ── 16 · Historique (TIMELINE) ───────────────────────────────────────
        n.add(new SeedNode(NodeDomain.HISTORIQUE, NodeType.ACTION_OODA,
            "Timeline — Déc. 2025 → Juin 2026",
            """
            # Timeline #historique

            - **Déc. 2025** — Kickoff. [[ADR-001 — Stack technique]], monorepo, schéma initial (Flyway V1+), auth.
            - **Janv. 2026** — Cœur : workspaces/projets/issues, board/list/backlog.
            - **Févr. 2026** — Cycles, teams, **temps réel** ([[ADR-002 — Temps réel via RabbitMQ (STOMP)]]).
            - **Mars 2026** — Billing Stripe, intégrations GitHub/Slack, GED/MinIO.
            - **Avr. 2026** — IA : smart-assign, assistant, insights (Groq-direct). Analytics.
            - **Mai 2026** — Audit PM ([[Audit PM — issues connues]]), correctifs P0/P1.
            - **Juin 2026** — QA finale ; **Brain OS** (graphe neural, éditeur, recherche, MinIO) ;
              correctifs encodage ([[Problème — corruption UTF-8 du seed (PowerShell)]],
              [[Problème — assistant IA (Groq) : 3 bugs]]) ; contraintes réseau ([[DEC — composants UI vendus à la main]]).
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
