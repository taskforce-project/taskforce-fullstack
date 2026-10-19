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

    /** Titre du socle transverse de l'espace : repris tel quel par l'ingestion (wikilink du dossier d'espace). */
    public static final String SHARED_FOUNDATION_TITLE = "Shared foundation";

    /**
     * Notes initiales d'un projet, nichées sous son dossier. Les suffixes forment les titres
     * (« Projet - Backlog »…) : l'ingestion d'un projet créé plus tard réutilise exactement la même liste.
     */
    public static final List<String> PROJECT_NOTE_SUFFIXES = List.of(
        "Architecture", "Backlog", "Done & shipped", "Known issues", "Decisions (ADR)", "Runbook");

    /**
     * Gabarit de containment GENERIQUE d'un compte reel : la hierarchie {@code parentKey -> parentNodeId}
     * EST le modele. Brain OS (racine) abrite le <b>dossier d'espace</b> ; l'espace abrite un <b>socle
     * transverse</b> (notes utiles au niveau espace) et <b>un dossier par projet</b>, chaque projet
     * abritant ses notes. Des notes benefiques a CHAQUE niveau, pas une liste plate a la racine.
     */
    private List<SeedNode> blankContainmentSeed(List<ProjectRef> projects, String workspaceName) {
        List<SeedNode> n = new ArrayList<>();
        String agentsTitle = "AGENTS - agent contract";
        String wsName = (workspaceName != null && !workspaceName.isBlank()) ? workspaceName.trim() : "Workspace";
        String transverseTitle = SHARED_FOUNDATION_TITLE;

        // Racine : Brain OS (hub visible).
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, "Brain OS", ("""
            # 🧠 Brain OS

            The living knowledge base of this account. Each **workspace** opens its own space; here,
            [[%s]].

            > [!tip] How it works
            > The upkeep rules (what to write, when to update, how to archive) live in [[%s]] and are
            > applied by the AI agent.""").formatted(wsName, agentsTitle),
            false, null, "hub", null));
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.SOP, agentsTitle, agentsContract(), true));

        // Dossier d'espace (enfant de la racine) : la « home » de l'espace.
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.README, wsName, ("""
            # %s

            Workspace. The **shared foundation** (documents common to every project) is in [[%s]];
            each **project** has its own folder, right below.""")
            .formatted(wsName, transverseTitle),
            false, null, "ws", "hub"));

        // Socle transverse de l'espace + ses notes (niveau ESPACE).
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.README, transverseTitle, ("""
            # Shared foundation

            Common to every project of **%s**: conventions, architecture, security, roadmap.

            - [[Charter & conventions]] · [[Shared architecture]] · [[Security policy]] · [[Workspace roadmap]]""")
            .formatted(wsName),
            false, null, "ws:transverse", "ws"));
        n.add(new SeedNode(NodeDomain.PROJET, NodeType.DOC, "Charter & conventions",
            "# Charter & conventions #convention\n\nHow the team works: code conventions, git workflow, Definition of Done. Foundation: [[" + transverseTitle + "]].",
            false, null, "g:charte", "ws:transverse"));
        n.add(new SeedNode(NodeDomain.ARCHITECTURE, NodeType.DOC, "Shared architecture",
            "# Shared architecture #archi\n\nTechnical overview common to the projects: components, flows, structural choices. See [[Security policy]].",
            false, null, "g:archi", "ws:transverse"));
        n.add(new SeedNode(NodeDomain.SECURITE, NodeType.SOP, "Security policy",
            "# Security policy #security\n\nSecrets in environment variables, input validation, security review before each release. See [[Shared architecture]].",
            false, null, "g:secu", "ws:transverse"));
        n.add(new SeedNode(NodeDomain.ROADMAP, NodeType.DOC, "Workspace roadmap",
            "# Workspace roadmap #roadmap\n\nMilestones across projects. Each project folder holds its own details.",
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

            Project folder. Everything about **%s** lives here. Workspace: [[%s]].

            ## Notes
            - [[%s - Architecture]] · [[%s - Backlog]] · [[%s - Done & shipped]]
            - [[%s - Known issues]] · [[%s - Decisions (ADR)]] · [[%s - Runbook]]""")
            .formatted(name, name, wsName, name, name, name, name, name, name),
            false, id, pk, "ws"));

        record Note(String suffix, NodeDomain domain, NodeType type, String body) {}
        List<Note> notes = List.of(
            new Note(PROJECT_NOTE_SUFFIXES.get(0), NodeDomain.ARCHITECTURE, NodeType.DOC, "Technical view of the project: components, dependencies, integration points. Structural decisions go to [[%s - Decisions (ADR)]]."),
            new Note(PROJECT_NOTE_SUFFIXES.get(1), NodeDomain.ROADMAP, NodeType.DOC, "Upcoming work, prioritized. What ships moves to [[%s - Done & shipped]]."),
            new Note(PROJECT_NOTE_SUFFIXES.get(2), NodeDomain.HISTORIQUE, NodeType.DOC, "History of the deliveries and finished work of **%s**."),
            new Note(PROJECT_NOTE_SUFFIXES.get(3), NodeDomain.AUDITS, NodeType.FINDING, "Known bugs and limits, with their workaround. A deeper decision goes to [[%s - Decisions (ADR)]]."),
            new Note(PROJECT_NOTE_SUFFIXES.get(4), NodeDomain.DECISIONS, NodeType.ADR, "Architecture decisions: Context, Options, Decision, Consequences. See [[%s - Architecture]]."),
            new Note(PROJECT_NOTE_SUFFIXES.get(5), NodeDomain.RUNBOOKS, NodeType.RUNBOOK, "How to run **%s**: build, deployment, incidents."));
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
            # AGENTS: the Brain OS agent contract

            Rules the AI agent (and people) follow to keep this knowledge base **clean, dated and reliable**.
            This page belongs to the core: the agent reads it, the explorer hides it by default.

            ## Principles
            - **Reality, not intention**: every note is dated and checkable. The context never lies to the AI.
            - **One note, one idea**, with a short and clear title.
            - **Link rather than duplicate**: `[[wikilinks]]` between related notes, `#tags` across topics.

            ## Writing
            - Pick the right **domain** (01 to 16) and **type** (ADR, DECISION, RUNBOOK, SOP, FINDING, SPEC, DOC…).
            - A **decision** becomes a `DECISION` or `ADR` page in `12-decisions`: Context · Options · Decision · Consequences.
            - Link the note to its context with `[[Exact title]]` and file it with `#tags`.

            ## Updating
            - **Edit** the existing note rather than creating a near duplicate.
            - When a decision **replaces** another: a new note with a `SUPERSEDES` relation to the old one
              (history is not rewritten).

            ## Versions
            - `versionLabel`: `v1` (current) or `v2` (target). Keep `v1` until the switch actually happens.
            - A notable change gets a dated entry in `16-history` (OODA loop) and in the `CHANGELOG`.

            ## Deleting and archiving
            - **Nothing leaves the history**: notes are **archived** (status `ARCHIVED`, domain `20-archive`).
            - Hard deletion is for drafts and plain mistakes only.

            ## OODA loop (agent actions)
            **Observe** (gather the context), **Orient** (list the options), **Decide** (link to a `DECISION`),
            **Act** (ideally reversible, with human approval when it matters), then **record the outcome**
            (success, obstacles, lessons) in memory.
            """;
    }
}
