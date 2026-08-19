package com.taskforce.tf_api.core.service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PreDestroy;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Suggestion de compétences à partir d'un rôle, pour l'onboarding (étape 2).
 *
 * <p>Le rôle saisi à l'étape 1 est envoyé au LLM local (Qwen via {@link AiGatewayClient}), qui propose
 * une liste de tags pertinents. L'appel est <b>offert</b> ({@link AiMeter#complimentary}) : il passe
 * par le gate de quota du compte (au-dessus du plafond, on ne lance pas le LLM), mais sa consommation
 * n'est <b>pas décomptée</b>. Motif : l'onboarding est une courtoisie de pré-activation, il ne doit pas
 * grignoter le quota avant que la personne ait commencé à se servir de l'outil (revue UI/UX, item
 * « tokens onboarding »).</p>
 *
 * <p><b>Dégradation gracieuse</b> : si le LLM est indisponible ou le quota atteint, on renvoie une
 * liste déterministe déduite de mots-clés du rôle. La suggestion n'est jamais bloquante pour
 * l'onboarding — au pire elle est moins fine, jamais absente. Même philosophie que les autres agents.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SkillSuggestionService {

    private static final int MAX_SUGGESTIONS = 12;
    private static final int MAX_TAG_LENGTH = 60;

    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceMemberRepository workspaceMemberRepository;
    private final AiMeter aiMeter;
    private final LlmClient llm;
    private final ObjectMapper objectMapper;

    /**
     * Attente maximale de la génération LLM avant de rendre le repli. Volontairement courte :
     * l'onboarding ne doit jamais attendre le 14B local (qui peut prendre des minutes). Surchargeable
     * sans rebuild via {@code AI_SKILL_SUGGESTION_TIMEOUT_SECONDS}.
     */
    @Value("${ai.skill-suggestion.timeout-seconds:8}")
    private long timeoutSeconds;

    /**
     * Petit pool démon pour borner l'appel LLM dans le temps sans bloquer le thread de la requête.
     * L'appel HTTP sous-jacent garde son timeout long (client IA) mais on cesse de l'attendre : le
     * thread se libère de lui-même. L'onboarding étant rare, un pool étroit suffit.
     */
    private final ExecutorService executor = Executors.newFixedThreadPool(3, r -> {
        Thread t = new Thread(r, "skill-suggest");
        t.setDaemon(true);
        return t;
    });

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }

    /**
     * Propose des compétences pour {@code role}, en excluant celles déjà retenues. Ne lève que sur
     * workspace introuvable / accès refusé ; toute défaillance IA retombe sur le repli déterministe.
     */
    public List<String> suggest(String slug, String role, List<String> existing, Long requesterId) {
        Workspace workspace = workspaceRepository.findBySlug(slug)
            .orElseThrow(() -> new ResourceNotFoundException("Workspace introuvable"));
        if (!workspaceMemberRepository.existsByWorkspaceIdAndUserId(workspace.getId(), requesterId)) {
            throw new ForbiddenException("Accès refusé au workspace");
        }
        List<String> already = existing == null ? List.of() : existing;
        Long workspaceId = workspace.getId();
        try {
            // Attente BORNÉE : au-delà de `timeoutSeconds`, on cesse d'attendre le LLM et on rend le
            // repli déterministe. Le travail IA continue en tâche de fond mais n'est plus attendu —
            // l'onboarding reste réactif quelle que soit la lenteur du modèle.
            return CompletableFuture
                .supplyAsync(() -> complimentarySuggest(workspaceId, role, already), executor)
                .get(timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            String cause = e instanceof TimeoutException
                ? timeoutSeconds + "s dépassées"
                : e.getClass().getSimpleName();
            log.info("Suggestion de compétences : LLM non abouti ({}), repli déterministe", cause);
            return fallback(role, already);
        }
    }

    /** Appel LLM <b>offert</b> (gate quota mais non décompté) ; toute défaillance (quota atteint, erreur gateway) retombe sur le repli. */
    private List<String> complimentarySuggest(Long workspaceId, String role, List<String> already) {
        try {
            return aiMeter.complimentary(workspaceId, () -> viaLlm(role, already));
        } catch (Exception e) {
            log.warn("Appel LLM de suggestion en échec ({})", e.getClass().getSimpleName());
            return fallback(role, already);
        }
    }

    private List<String> viaLlm(String role, List<String> already) {
        String system = """
            Tu aides à décrire les compétences d'un membre d'équipe dans un outil de gestion de projet.
            On te donne un rôle. Réponds STRICTEMENT en JSON de la forme {"skills":["tag1","tag2",...]}.
            8 à 12 compétences courtes (1 à 3 mots) : langages, frameworks, outils, savoir-faire concrets
            et pertinents pour ce rôle. Pas de phrase, pas de numérotation, pas de doublon.
            """;
        StringBuilder user = new StringBuilder("Rôle : ").append(role);
        if (!already.isEmpty()) {
            user.append(". Déjà sélectionnées (ne pas les répéter) : ").append(String.join(", ", already));
        }
        String content = llm.chatCompletion(null, system, user.toString(), true);
        return dedupeCap(parse(content), already);
    }

    /** Extrait le tableau {@code skills} de la réponse JSON du LLM ; liste vide si illisible. */
    private List<String> parse(String content) {
        List<String> out = new ArrayList<>();
        try {
            JsonNode skills = objectMapper.readTree(content).path("skills");
            if (skills.isArray()) {
                for (JsonNode n : skills) {
                    String tag = n.asText("").strip();
                    if (!tag.isEmpty()) {
                        out.add(tag);
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Réponse LLM de suggestion illisible : {}", e.getMessage());
        }
        return out;
    }

    /** Retire les doublons (vs déjà-choisies et entre elles), borne longueur et nombre. */
    private List<String> dedupeCap(List<String> proposed, List<String> already) {
        Set<String> seen = new LinkedHashSet<>();
        for (String a : already) {
            if (a != null) {
                seen.add(a.strip().toLowerCase());
            }
        }
        List<String> out = new ArrayList<>();
        for (String s : proposed) {
            if (s == null) {
                continue;
            }
            String tag = s.strip();
            if (tag.isEmpty() || tag.length() > MAX_TAG_LENGTH) {
                continue;
            }
            if (seen.add(tag.toLowerCase())) {
                out.add(tag);
            }
            if (out.size() >= MAX_SUGGESTIONS) {
                break;
            }
        }
        return out;
    }

    /** Repli déterministe par mots-clés du rôle, quand le LLM n'est pas disponible. */
    private List<String> fallback(String role, List<String> already) {
        String r = role == null ? "" : role.toLowerCase();
        List<String> base;
        if (r.matches(".*(front|react|ui|web).*")) {
            base = List.of("React", "TypeScript", "CSS", "Next.js", "Accessibilité", "Tests E2E", "Design system");
        } else if (r.matches(".*(back|api|java|spring).*")) {
            base = List.of("Java", "Spring Boot", "REST", "SQL", "Tests unitaires", "Sécurité", "Docker");
        } else if (r.matches(".*(full ?stack|dev|ingénieur|engineer|développe).*")) {
            base = List.of("TypeScript", "Java", "React", "SQL", "Git", "Tests", "CI/CD", "Docker");
        } else if (r.matches(".*(devops|sre|infra|cloud).*")) {
            base = List.of("Docker", "Kubernetes", "CI/CD", "Terraform", "Observabilité", "Linux", "Cloud");
        } else if (r.matches(".*(design|ux|produit|product).*")) {
            base = List.of("Figma", "UX Research", "Prototypage", "Design system", "Accessibilité", "Wireframing");
        } else if (r.matches(".*(qa|test|quality).*")) {
            base = List.of("Playwright", "Cypress", "Tests unitaires", "Tests E2E", "Automatisation", "CI/CD");
        } else if (r.matches(".*(data|ml|ia|ai|analyst).*")) {
            base = List.of("SQL", "Python", "Data viz", "ETL", "Analyse", "Machine Learning");
        } else if (r.matches(".*(pm|chef|manager|lead|scrum|owner|projet).*")) {
            base = List.of("Agile", "Roadmap", "Priorisation", "Communication", "Gestion des risques", "Stakeholders");
        } else {
            base = List.of("Communication", "Organisation", "Collaboration", "Documentation", "Résolution de problèmes");
        }
        return dedupeCap(base, already);
    }
}
