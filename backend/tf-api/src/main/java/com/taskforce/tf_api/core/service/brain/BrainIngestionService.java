package com.taskforce.tf_api.core.service.brain;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.dto.request.CreateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.dto.request.UpdateKnowledgeNodeRequest;
import com.taskforce.tf_api.core.enums.CycleStatus;
import com.taskforce.tf_api.core.enums.IssueStatusCategory;
import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.model.Cycle;
import com.taskforce.tf_api.core.model.CycleIssue;
import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.KnowledgeNode;
import com.taskforce.tf_api.core.repository.CycleIssueRepository;
import com.taskforce.tf_api.core.repository.CycleRepository;
import com.taskforce.tf_api.core.repository.KnowledgeNodeRepository;
import com.taskforce.tf_api.core.service.AiMeter;
import com.taskforce.tf_api.core.service.KnowledgeService;
import com.taskforce.tf_api.core.service.LlmClient;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * <b>Ingestion automatique de l'activité projet dans le Brain OS.</b> Le graphe ne se nourrissait
 * jusqu'ici que du seed, de la main de l'humain et de deux actions explicites (spec approuvée,
 * outil {@code create_note}) : rien de ce qui se passait dans les projets n'y laissait de trace.
 *
 * <p>Applique au produit le contrat qu'un agent suit quand il écrit dans le Brain OS
 * ({@code AGENTS.md} §2) :
 * <ul>
 *   <li><b>Ne rien inventer</b> — les faits sont collectés en base ; le LLM ne fait que les
 *       <i>rédiger</i>, et ne reçoit rien d'autre qu'eux. Le graphe est relu par le RAG : un fait
 *       inventé aujourd'hui deviendrait une vérité citée demain. C'est la règle qui commande les autres.</li>
 *   <li><b>MAJ la fiche, jamais un doc de plus</b> — upsert idempotent par {@code refType/refId} :
 *       <b>un node par cycle</b>, pas un node par événement (sinon le graphe explose).</li>
 *   <li><b>Grain = le lot</b> — le cycle. Une issue terminée rafraîchit le relevé du cycle en cours ;
 *       la rédaction IA n'a lieu qu'à la clôture, une fois.</li>
 *   <li><b>Format Obsidian</b> — {@code #tags} + {@code [[wikilinks]]} : {@link BrainLinkService}
 *       tisse les arêtes tout seul à l'écriture, le node rejoint le graphe au lieu d'être orphelin.</li>
 * </ul>
 *
 * <p><b>Découpage transactionnel</b> : l'orchestration vit dans {@link BrainIngestionListener}, et
 * chaque méthode publique ici porte une transaction <i>courte</i> — ou aucune pour
 * {@link #synthesize}. Un {@code @Transactional} englobant l'appel LLM immobiliserait une connexion
 * du pool pendant toute sa durée (Hibernate ne la relâche qu'en fin de transaction).
 *
 * <p><b>Hors périmètre</b> (→ roadmap) : les issues hors cycle, les commentaires et les PR.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class BrainIngestionService {

    private final CycleRepository          cycleRepository;
    private final CycleIssueRepository     cycleIssueRepository;
    private final KnowledgeNodeRepository  nodeRepository;
    private final KnowledgeService         knowledgeService;
    private final LlmClient                llm;
    private final AiMeter                  aiMeter;

    @Value("${ai.model.assistant:gateway-default}")
    private String model; // ignoré par l'AI Gateway (Ollama impose son modèle) ; utile si provider=groq

    /** Hub de domaine ciblé par un wikilink pour raccrocher la rétro au graphe (best-effort). */
    private static final String HISTORIQUE_HUB = "16 · Historique des actions";

    /** Plafond d'issues listées par section (au-delà de ~20 KB le contenu partirait sur MinIO). */
    static final int LIST_CAP = 50;

    private static final List<String> TAGS = List.of("cycle", "retro", "ingestion-auto");

    private static final String SYNTHESIS_SYSTEM = """
        Tu es l'analyste du Brain OS de TaskForce. On te donne les FAITS d'un cycle de développement,
        extraits de la base de données. Tu produis une courte synthèse en markdown français.

        RÈGLE ABSOLUE : n'ajoute AUCUN fait. Tu ne disposes que des faits fournis — ne suppose rien
        sur les causes, les personnes, le code ou le contexte, et n'écris aucun chiffre qui ne figure
        pas dans les faits. S'il te manque un élément pour conclure, dis-le au lieu de combler.

        Structure ta réponse exactement ainsi, et rien d'autre :
        ### Lecture des chiffres
        2 à 4 puces fondées UNIQUEMENT sur les faits fournis.

        ### Propositions pour le prochain cycle
        2 à 3 puces d'actions concrètes, formulées à l'infinitif. Ce sont des propositions soumises
        à l'équipe, pas des décisions actées.

        Pas de titre de niveau 1 ou 2, pas de préambule, pas de conclusion.
        """;

    // =========================================================================
    // 1. Les faits — collectés en base, jamais générés
    // =========================================================================

    /** Photographie factuelle d'un cycle. Tout ici vient de la base. */
    public record CycleFacts(
        Long cycleId,
        String cycleName,
        String projectName,
        String projectIdentifier,
        LocalDate startDate,
        LocalDate endDate,
        List<IssueFact> delivered,
        List<IssueFact> slipped,
        List<IssueFact> cancelled,
        Map<String, Integer> byType,
        Map<String, Integer> byAssignee,
        int pointsPlanned,
        int pointsDelivered
    ) {
        public int total() {
            return delivered.size() + slipped.size() + cancelled.size();
        }

        /** Part des issues du cycle effectivement livrées (0 si le cycle est vide). */
        public int completionRate() {
            return total() == 0 ? 0 : Math.round(delivered.size() * 100f / total());
        }
    }

    /** Une issue du cycle, réduite à ce qui est vérifiable en base. */
    public record IssueFact(Long issueId, String key, String title, String assignee, Integer points) {}

    /**
     * Collecte les faits d'un cycle. Transaction courte en lecture seule : les entités restent
     * dans la session le temps de résoudre les associations lazy, et n'en sortent que sous forme
     * de records (aucun proxy détaché ne fuit vers le thread appelant).
     *
     * @return les faits, ou {@code null} si le cycle a disparu entre-temps.
     */
    @Transactional(readOnly = true)
    public CycleFacts collectCycleFacts(Long cycleId) {
        Cycle cycle = cycleRepository.findById(cycleId).orElse(null);
        if (cycle == null) {
            log.warn("Ingestion Brain OS : cycle {} introuvable (supprimé entre-temps ?)", cycleId);
            return null;
        }
        return factsOf(cycle);
    }

    private CycleFacts factsOf(Cycle cycle) {
        List<IssueFact> delivered = new ArrayList<>();
        List<IssueFact> slipped   = new ArrayList<>();
        List<IssueFact> cancelled = new ArrayList<>();
        Map<String, Integer> byType     = new LinkedHashMap<>();
        Map<String, Integer> byAssignee = new LinkedHashMap<>();
        int pointsPlanned = 0;
        int pointsDelivered = 0;

        String identifier = cycle.getProject().getIdentifier();
        for (CycleIssue link : cycleIssueRepository.findByCycleId(cycle.getId())) {
            Issue issue = link.getIssue();
            if (issue == null) continue;

            String assignee = issue.getAssignee() != null ? issue.getAssignee().getDisplayName() : "Non assignée";
            Integer points  = issue.getStoryPoints();
            IssueFact fact  = new IssueFact(
                issue.getId(),
                identifier + "-" + issue.getSequenceNumber(),
                issue.getTitle(),
                assignee,
                points);

            IssueStatusCategory category = issue.getStatus() != null ? issue.getStatus().getCategory() : null;
            if (category == IssueStatusCategory.COMPLETED) {
                delivered.add(fact);
                if (points != null) pointsDelivered += points;
            } else if (category == IssueStatusCategory.CANCELLED) {
                cancelled.add(fact);
            } else {
                slipped.add(fact);
            }
            if (points != null) pointsPlanned += points;

            String type = issue.getType() != null ? issue.getType().getName() : "Sans type";
            byType.merge(type, 1, Integer::sum);
            byAssignee.merge(assignee, 1, Integer::sum);
        }

        return new CycleFacts(
            cycle.getId(), cycle.getName(),
            cycle.getProject().getName(), identifier,
            cycle.getStartDate(), cycle.getEndDate(),
            delivered, slipped, cancelled,
            byType, byAssignee,
            pointsPlanned, pointsDelivered);
    }

    /**
     * Cycle <b>actif</b> portant une issue, s'il existe. Une issue hors cycle actif n'alimente rien :
     * le grain d'ingestion est le lot, pas l'événement (hors périmètre assumé → roadmap).
     */
    @Transactional(readOnly = true)
    public Long findActiveCycleId(Long issueId) {
        return cycleIssueRepository.findByIssueId(issueId).stream()
            .map(CycleIssue::getCycle)
            .filter(c -> c.getStatus() == CycleStatus.ACTIVE)
            .map(Cycle::getId)
            .findFirst()
            .orElse(null);
    }

    // =========================================================================
    // 2. La rédaction — Qwen (tier fast), métrée, hors transaction, jamais bloquante
    // =========================================================================

    /**
     * Fait rédiger la lecture des faits par le LLM local. Métré via {@link AiMeter} (gate de quota
     * AVANT l'appel + comptage réel de la conso) : c'est le 7ᵉ chemin IA, il ne doit pas contourner
     * le plafond du compte.
     *
     * <p>Volontairement <b>sans {@code @Transactional}</b> : l'appel peut durer jusqu'à ~200 s.
     *
     * @return la synthèse markdown, ou {@code null} si indisponible (LLM absent, quota atteint,
     *         timeout, réponse vide) — l'appelant écrit alors les faits seuls.
     */
    public String synthesize(Long workspaceId, CycleFacts facts) {
        if (facts == null || facts.total() == 0) return null; // cycle vide : rien à lire, pas d'appel
        if (!llm.isConfigured()) return null;
        try {
            String out = aiMeter.metered(workspaceId, () ->
                llm.chatCompletion(model, SYNTHESIS_SYSTEM, synthesisPrompt(facts), false, "fast"));
            return out != null && !out.isBlank() ? out : null;
        } catch (Exception ex) {
            // Couvre le gate de quota (409) comme la panne LLM : la rétro sort quand même, en faits seuls.
            log.warn("Synthèse IA de rétro indisponible (cycle={}) : {}", facts.cycleId(), ex.getMessage());
            return null;
        }
    }

    /** Le LLM ne reçoit QUE des faits — c'est ce qui l'empêche d'en inventer. */
    private String synthesisPrompt(CycleFacts f) {
        StringBuilder sb = new StringBuilder("Faits du cycle « ").append(f.cycleName()).append(" » :\n");
        sb.append("- Projet : ").append(f.projectName()).append("\n");
        if (f.startDate() != null && f.endDate() != null) {
            sb.append("- Période : ").append(f.startDate()).append(" → ").append(f.endDate()).append("\n");
        }
        sb.append("- Issues : ").append(f.total()).append(" au total, ")
          .append(f.delivered().size()).append(" livrées, ")
          .append(f.slipped().size()).append(" non livrées, ")
          .append(f.cancelled().size()).append(" annulées (complétion ").append(f.completionRate()).append(" %)\n");
        sb.append("- Story points : ").append(f.pointsDelivered()).append(" livrés sur ")
          .append(f.pointsPlanned()).append(" planifiés\n");
        sb.append("- Répartition par type : ").append(flatten(f.byType())).append("\n");
        sb.append("- Répartition par assigné : ").append(flatten(f.byAssignee())).append("\n");
        if (!f.slipped().isEmpty()) {
            sb.append("- Non livrées : ").append(f.slipped().stream()
                .limit(LIST_CAP).map(i -> i.key() + " (" + i.title() + ")").toList()).append("\n");
        }
        return sb.toString();
    }

    private String flatten(Map<String, Integer> counts) {
        if (counts.isEmpty()) return "(aucune)";
        List<String> parts = new ArrayList<>();
        counts.forEach((key, count) -> parts.add(key + " ×" + count));
        return String.join(", ", parts);
    }

    // =========================================================================
    // 3. L'écriture — upsert idempotent (une fiche par cycle, pas un node par événement)
    // =========================================================================

    /**
     * Écrit (ou met à jour) <b>le</b> node du cycle. Transaction courte : la rédaction IA, elle, a
     * déjà eu lieu en dehors.
     *
     * <p>Débute par un <b>verrou pessimiste</b> sur la ligne du cycle. Sans lui, l'upsert est un
     * check-then-act : plusieurs issues terminées coup sur coup réveillent autant de listeners
     * {@code @Async}, qui lisent tous « aucun node » avant qu'aucun n'ait commité et insèrent chacun
     * le leur (constaté : 4 doublons en 240 ms). Le verrou les sérialise ; le second thread voit le
     * node du premier et le met à jour. L'index partiel {@code uq_knodes_cycle_ref} (V69) en est le
     * garde-fou côté schéma.
     *
     * <p>Les faits sont relus <b>sous le verrou</b> : le node reflète ainsi l'état le plus frais, et
     * non celui qu'aurait photographié le thread le plus lent.
     *
     * @param synthesis rédaction IA, ou {@code null} → seuls les faits sont consignés
     * @param closed    {@code true} à la clôture (rétro figée), {@code false} en cours de cycle (relevé vivant)
     */
    @Transactional
    public void writeCycleNode(String slug, Long workspaceId, Long userId,
                              Long cycleId, String synthesis, boolean closed) {
        Cycle cycle = cycleRepository.findByIdForUpdate(cycleId).orElse(null);
        if (cycle == null) {
            log.warn("Ingestion Brain OS : cycle {} introuvable à l'écriture", cycleId);
            return;
        }
        CycleFacts facts = factsOf(cycle);
        String content = renderFacts(facts, workspaceId, closed);
        if (synthesis != null) {
            content += "\n## Synthèse IA\n\n"
                + "> [!tip] Propositions à valider — rédigées à partir des faits ci-dessus, jamais actées automatiquement.\n\n"
                + synthesis.trim() + "\n";
        }
        content += footer(closed && synthesis == null);

        String title = truncate((closed ? "Rétro — " : "Cycle en cours — ")
            + facts.cycleName() + " (" + facts.projectIdentifier() + ")", 300);

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("cycleId", facts.cycleId());
        metadata.put("projectIdentifier", facts.projectIdentifier());
        // Appartenance projet (liste = une note peut être transverse à plusieurs projets ; ici le
        // cycle n'en a qu'un). Le graphe s'en sert pour dessiner les régions — cf. BrainGraph.
        metadata.put("projects", List.of(cycle.getProject().getId()));
        metadata.put("generatedBy", "ingestion-auto");
        metadata.put("mode", synthesis != null ? "generated" : "facts-only");
        metadata.put("closed", closed);
        metadata.put("totalIssues", facts.total());
        metadata.put("deliveredIssues", facts.delivered().size());
        metadata.put("completionRate", facts.completionRate());

        Optional<KnowledgeNode> existing = nodeRepository
            .findFirstByWorkspaceIdAndRefTypeAndRefId(workspaceId, NodeRefType.CYCLE, facts.cycleId());

        if (existing.isPresent()) {
            knowledgeService.updateNode(slug, existing.get().getId(), userId, UpdateKnowledgeNodeRequest.builder()
                .title(title)
                .content(content)
                .metadata(metadata)
                .tags(TAGS)
                .build());
        } else {
            knowledgeService.createNode(slug, userId, CreateKnowledgeNodeRequest.builder()
                .type("ACTION_OODA")
                .domain("HISTORIQUE")
                .title(title)
                .content(content)
                .refType("CYCLE")
                .refId(facts.cycleId())
                .tags(TAGS)
                .metadata(metadata)
                .build());
        }

        if (closed) {
            log.info("Brain OS ← rétro du cycle « {} » : {}/{} livrées, synthèse IA {}",
                facts.cycleName(), facts.delivered().size(), facts.total(),
                synthesis != null ? "OK" : "indisponible");
        } else {
            log.debug("Brain OS ← avancement du cycle « {} » : {}/{}",
                facts.cycleName(), facts.delivered().size(), facts.total());
        }
    }

    // =========================================================================
    // Le rendu déterministe — écrit dans tous les cas, LLM ou pas
    // =========================================================================

    private String renderFacts(CycleFacts f, Long workspaceId, boolean closed) {
        StringBuilder sb = new StringBuilder();
        sb.append(closed
            ? "> [!info] Rétro écrite automatiquement à la clôture du cycle. Faits extraits de la base.\n\n"
            : "> [!note] Cycle en cours — ce relevé se met à jour à chaque issue terminée.\n\n");

        sb.append("## Faits\n\n");
        sb.append("- **Cycle** : ").append(f.cycleName());
        if (f.startDate() != null || f.endDate() != null) {
            sb.append(" (").append(f.startDate() != null ? f.startDate() : "?")
              .append(" → ").append(f.endDate() != null ? f.endDate() : "?").append(")");
        }
        sb.append("\n- **Projet** : ").append(f.projectName()).append(" (`").append(f.projectIdentifier()).append("`)\n");
        sb.append("- **Périmètre** : ").append(f.total()).append(" issues — ")
          .append(f.delivered().size()).append(" livrées, ")
          .append(f.slipped().size()).append(" non livrées, ")
          .append(f.cancelled().size()).append(" annulées\n");
        sb.append("- **Complétion** : ").append(f.completionRate()).append(" %\n");
        sb.append("- **Effort** : ").append(f.pointsDelivered()).append(" points livrés sur ")
          .append(f.pointsPlanned()).append(" planifiés\n\n");

        appendIssueSection(sb, closed ? "Livrées" : "Terminées à ce stade", f.delivered(), workspaceId);
        appendIssueSection(sb, closed ? "Non livrées (reportées)" : "Restantes", f.slipped(), workspaceId);
        appendIssueSection(sb, "Annulées", f.cancelled(), workspaceId);

        appendCountTable(sb, "Répartition par type", "Type", f.byType());
        appendCountTable(sb, "Répartition par assigné", "Assigné", f.byAssignee());

        return sb.toString();
    }

    /**
     * Liste une section d'issues. Une issue qui possède déjà un node (sa spec approuvée) est citée
     * en {@code [[wikilink]]} → l'arête vers la spec se crée toute seule : la rétro se raccroche au
     * tissu existant du graphe au lieu de flotter à côté.
     */
    private void appendIssueSection(StringBuilder sb, String heading, List<IssueFact> issues, Long workspaceId) {
        if (issues.isEmpty()) return;
        sb.append("### ").append(heading).append("\n\n");
        int shown = Math.min(issues.size(), LIST_CAP);
        for (IssueFact issue : issues.subList(0, shown)) {
            sb.append("- `").append(issue.key()).append("` — ").append(issue.title());
            sb.append(" *(").append(issue.assignee());
            if (issue.points() != null) sb.append(", ").append(issue.points()).append(" pts");
            sb.append(")*");
            nodeRepository.findFirstByWorkspaceIdAndRefTypeAndRefId(workspaceId, NodeRefType.ISSUE, issue.issueId())
                .ifPresent(spec -> sb.append(" → [[").append(spec.getTitle()).append("]]"));
            sb.append("\n");
        }
        if (issues.size() > shown) {
            sb.append("- _… et ").append(issues.size() - shown).append(" autres (liste plafonnée à ")
              .append(LIST_CAP).append(")_\n");
        }
        sb.append("\n");
    }

    private void appendCountTable(StringBuilder sb, String heading, String column, Map<String, Integer> counts) {
        if (counts.isEmpty()) return;
        sb.append("### ").append(heading).append("\n\n");
        sb.append("| ").append(column).append(" | Issues |\n|---|---|\n");
        counts.forEach((key, count) -> sb.append("| ").append(key).append(" | ").append(count).append(" |\n"));
        sb.append("\n");
    }

    /** Wikilink vers le hub de domaine + tags : c'est ce qui insère le node dans le réseau. */
    private String footer(boolean synthesisMissing) {
        return "\n---\n\nRattaché à [[" + HISTORIQUE_HUB + "]]"
            + (synthesisMissing ? "\n\n_Synthèse IA indisponible — seuls les faits sont consignés._" : "")
            + "\n\n#cycle #retro #ingestion-auto\n";
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
    }
}
