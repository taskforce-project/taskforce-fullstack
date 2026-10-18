package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeType;

/**
 * Fournit le jeu de nodes d'amorçage d'un Brain OS : la hiérarchie de containment Brain OS > espace >
 * (socle transverse + un dossier par projet > notes), prête à être éditée par l'humain comme par l'IA.
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

    /** Nodes d'amorçage d'un workspace : containment Brain OS > espace > projets existants > notes. */
    public List<SeedNode> nodesFor(List<ProjectRef> projects, String workspaceName) {
        return blankContainmentSeed(projects, workspaceName);
    }

    // =========================================================================
    // Containment : Brain OS > espace > (socle transverse + projets > notes)
    // =========================================================================

    /**
     * Gabarit de containment GENERIQUE d'un compte reel : la hierarchie {@code parentKey -> parentNodeId}
     * EST le modele. Brain OS (racine) abrite le <b>dossier d'espace</b> ; l'espace abrite un <b>socle
     * transverse</b> (notes utiles au niveau espace) et <b>un dossier par projet</b>, chaque projet
     * abritant ses notes. Des notes benefiques a CHAQUE niveau, pas une liste plate a la racine.
     */
    private List<SeedNode> blankContainmentSeed(List<ProjectRef> projects, String workspaceName) {
        List<SeedNode> n = new ArrayList<>();
        String agentsTitle = "AGENTS - contrat d'agent";
        String wsName = (workspaceName != null && !workspaceName.isBlank()) ? workspaceName.trim() : "Workspace";
        String transverseTitle = "Socle transverse";

        // Racine : Brain OS (hub visible).
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, "Brain OS", ("""
            # 🧠 Brain OS

            Memoire de connaissance vivante du compte. Chaque **espace de travail** ouvre sa propre
            dimension ; ici, [[%s]].

            > [!tip] Methode
            > Les regles de tenue (remplissage, mise a jour, archivage) vivent dans [[%s]], appliquees
            > automatiquement par l'agent IA.""").formatted(wsName, agentsTitle),
            false, null, "hub", null));
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.SOP, agentsTitle, agentsContract(), true));

        // Dossier d'espace (enfant de la racine) : la « home » de l'espace.
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, wsName, ("""
            # %s

            Espace de travail. Le **socle transverse** (docs communs a tous les projets) est dans
            [[%s]] ; chaque **projet** a son propre dossier, visible juste en dessous.""")
            .formatted(wsName, transverseTitle),
            false, null, "ws", "hub"));

        // Socle transverse de l'espace + ses notes (niveau ESPACE).
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.README, transverseTitle, ("""
            # Socle transverse

            Commun a tous les projets de **%s** : conventions, architecture, securite, roadmap.

            - [[Charte & conventions]] · [[Architecture transverse]] · [[Politique de securite]] · [[Roadmap de l'espace]]""")
            .formatted(wsName),
            false, null, "ws:transverse", "ws"));
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.DOC, "Charte & conventions",
            "# Charte & conventions #convention\n\nComment l'equipe travaille : conventions de code, workflow git, Definition of Done. Socle : [[" + transverseTitle + "]].",
            false, null, "g:charte", "ws:transverse"));
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC, "Architecture transverse",
            "# Architecture transverse #archi\n\nVue d'ensemble technique commune aux projets : composants, flux, choix structurants. Voir [[Politique de securite]].",
            false, null, "g:archi", "ws:transverse"));
        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.SOP, "Politique de securite",
            "# Politique de securite #securite\n\nSecrets via variables d'env, validation des entrees, revue de securite avant release. Voir [[Architecture transverse]].",
            false, null, "g:secu", "ws:transverse"));
        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC, "Roadmap de l'espace",
            "# Roadmap de l'espace #roadmap\n\nJalons transverses. Le detail par projet vit dans chaque dossier projet.",
            false, null, "g:roadmap", "ws:transverse"));

        // Un dossier par projet + ses notes (niveau PROJET), enfants du dossier d'espace.
        if (projects != null) for (ProjectRef p : projects) n.addAll(projectFolderNested(p, wsName));
        return n;
    }

    /**
     * Dossier d'un projet (enfant du dossier d'espace « ws ») + son paquet de notes utiles, nichees
     * dessous.
     */
    private List<SeedNode> projectFolderNested(ProjectRef p, String wsName) {
        Long id = p.id();
        String name = p.name();
        String pk = "p" + id;
        List<SeedNode> n = new ArrayList<>();

        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, name, ("""
            # %s

            Dossier du projet. Tout ce qui concerne **%s** vit ici. Espace : [[%s]].

            ## Notes
            - [[%s - Architecture]] · [[%s - Backlog]] · [[%s - Fait & livre]]
            - [[%s - Problemes connus]] · [[%s - Decisions (ADR)]] · [[%s - Runbook]]""")
            .formatted(name, name, wsName, name, name, name, name, name, name),
            false, id, pk, "ws"));

        record Note(String suffix, NodeDomain domain, NodeType type, String body) {}
        List<Note> notes = List.of(
            new Note("Architecture", NodeDomain.ARCHITECTURE, NodeType.DOC, "Vue technique du projet : composants, dependances, points d'integration. Decisions structurantes -> [[%s - Decisions (ADR)]]."),
            new Note("Backlog", NodeDomain.ROADMAP, NodeType.DOC, "Travaux a venir, priorises. Ce qui est livre migre vers [[%s - Fait & livre]]."),
            new Note("Fait & livre", NodeDomain.HISTORIQUE, NodeType.DOC, "Historique des livraisons et travaux termines du projet **%s**."),
            new Note("Problemes connus", NodeDomain.AUDITS, NodeType.FINDING, "Bugs et limites identifies, avec contournement. Une decision de fond -> [[%s - Decisions (ADR)]]."),
            new Note("Decisions (ADR)", NodeDomain.DECISIONS, NodeType.ADR, "Decisions d'architecture : Contexte, Options, Decision, Consequences. Reference [[%s - Architecture]]."),
            new Note("Runbook", NodeDomain.RUNBOOKS, NodeType.RUNBOOK, "Procedures d'exploitation du projet **%s** : build, deploiement, incidents."));
        for (Note note : notes) {
            String title = name + " - " + note.suffix();
            n.add(new SeedNode(note.domain(), note.type(), title,
                "# " + title + "\n\n" + note.body().formatted(name),
                false, id, pk + ":" + note.suffix(), pk));
        }
        return n;
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
}
