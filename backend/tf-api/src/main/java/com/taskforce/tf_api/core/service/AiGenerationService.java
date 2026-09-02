package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.AiGenerationKind;
import com.taskforce.tf_api.core.enums.AiGenerationSignal;
import com.taskforce.tf_api.core.model.AiGeneration;
import com.taskforce.tf_api.core.repository.AiGenerationRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;

import lombok.Builder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Couche de capture du <b>data flywheel</b> : enregistre chaque generation IA a un point
 * human-in-the-loop (spec d'issue, priorite OODA, smart-assign) dans {@code ai_generations}.
 * C'est le plus haut levier de la V2 - sans elle, chaque interaction IA est de la donnee perdue.
 * Voir {@code taskforce-docs/v1/road_to_v2/Data_Flywheel_et_Apprentissage.md}.
 *
 * <p><b>Ne casse JAMAIS le flux metier appelant</b> : {@link #record} tourne en transaction
 * <b>separee</b> ({@link Propagation#REQUIRES_NEW}, pour qu'un echec SQL de capture ne marque pas
 * rollback-only la transaction metier) et avale toute exception (log). La capture est
 * <b>court-circuitee</b> si le workspace n'a pas active l'apprentissage
 * ({@code ai_learning_enabled = false}, opt-in RGPD). Strictement intra-workspace.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiGenerationService {

    private final AiGenerationRepository repository;
    private final WorkspaceRepository workspaceRepository;

    /** Borne le cout de l'edit distance sur de gros textes (une spec markdown peut faire plusieurs Ko). */
    static final int MAX_DISTANCE_LEN = 4000;

    /**
     * Parametres d'une capture. Selon la phase : draft seul (a la generation), finalisation
     * ({@code finalValue} + signal a la decision humaine), ou capture complete en un appel quand
     * draft et final sont connus ensemble (DECISION). Champs optionnels laisses a null.
     */
    @Builder
    public record Capture(
        Long workspaceId,
        AiGenerationKind kind,
        String requestRef,
        List<Long> contextRefs,
        Map<String, Object> draft,
        Map<String, Object> finalValue,
        AiGenerationSignal signal,
        Integer editDistance,
        String model,
        Integer latencyMs,
        Long userId,
        /** Ne créer AUCUNE ligne si aucune n'est ouverte à finaliser (ex. affectation hors smart-assign). */
        boolean finalizeOnly
    ) {}

    /**
     * Capture best-effort d'une generation IA. <b>NE JETTE JAMAIS.</b>
     *
     * <p>Sans {@code finalValue} : insere une ligne <i>ouverte</i> (le draft, a la generation).
     * Avec {@code finalValue} : <i>finalise</i> la derniere ligne ouverte du meme objet
     * ({@code workspace + kind + requestRef}) - sinon insere une ligne complete. Le {@code signal}
     * et l'{@code editDistance} sont pris de l'appelant s'il les fournit (DECISION, SMART_ASSIGN),
     * sinon derives du diff draft -> final (SPEC).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Capture c) {
        try {
            if (c == null || c.workspaceId() == null || c.kind() == null) return;
            if (!Boolean.TRUE.equals(workspaceRepository.findAiLearningEnabledById(c.workspaceId()).orElse(false))) {
                return; // opt-in : rien n'est capture tant que le workspace n'a pas active l'apprentissage
            }
            // Ligne OUVERTE (draft en attente de décision) seulement si l'appelant n'a ni final ni signal.
            // Un REJECTED (signal sans final, ex. priorité écartée) passe donc bien par la finalisation.
            if (c.finalValue() == null && c.signal() == null) {
                repository.save(stamp(newRow(c), c.userId()));
            } else {
                finalizeRow(c);
            }
        } catch (Exception ex) {
            log.warn("Capture ai_generations ignoree (ws={}, kind={}): {}",
                c != null ? c.workspaceId() : null, c != null ? c.kind() : null, ex.getMessage());
        }
    }

    /** Purge RGPD : efface tout le corpus d'un workspace. Best-effort ; renvoie le nombre de lignes. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public long purgeWorkspace(Long workspaceId) {
        try {
            return repository.deleteByWorkspaceId(workspaceId);
        } catch (Exception ex) {
            log.warn("Purge ai_generations ignoree (ws={}): {}", workspaceId, ex.getMessage());
            return 0L;
        }
    }

    // -------------------------------------------------------------------------

    private void finalizeRow(Capture c) {
        AiGeneration open = (c.requestRef() != null)
            ? repository.findFirstByWorkspaceIdAndKindAndRequestRefAndFinalValueIsNullOrderByCreatedAtDesc(
                  c.workspaceId(), c.kind(), c.requestRef()).orElse(null)
            : null;
        if (open == null && c.finalizeOnly()) return; // rien à finaliser : on ne crée pas de ligne parasite

        AiGeneration row = open != null ? open : newRow(c);
        row.setFinalValue(c.finalValue());
        row.setSignal(c.signal() != null ? c.signal() : deriveSignal(row.getDraft(), c.finalValue()));
        row.setEditDistance(c.editDistance() != null ? c.editDistance() : editDistance(row.getDraft(), c.finalValue()));
        repository.save(stamp(row, c.userId()));
    }

    private AiGeneration newRow(Capture c) {
        return AiGeneration.builder()
            .workspace(workspaceRepository.getReferenceById(c.workspaceId()))
            .kind(c.kind())
            .requestRef(c.requestRef())
            .contextRefs(c.contextRefs() != null ? c.contextRefs() : List.of())
            .draft(c.draft() != null ? c.draft() : Map.of())
            .model(c.model())
            .latencyMs(c.latencyMs())
            .build();
    }

    /** Renseigne l'utilisateur declencheur ({@code AuditableEntity.createdBy} - aucun AuditorAware configure). */
    private AiGeneration stamp(AiGeneration row, Long userId) {
        if (userId != null) row.setCreatedBy(String.valueOf(userId));
        return row;
    }

    // -------------------------------------------------------------------------
    // Signal derive (SPEC) : l'appelant ne connait pas le signal, on le lit du diff draft -> final.
    // -------------------------------------------------------------------------

    private AiGenerationSignal deriveSignal(Map<String, Object> draft, Map<String, Object> finalValue) {
        // Cas assignation (SMART_ASSIGN) : comparer l'id recommandé (draft) et l'id assigné (final).
        Object draftUser = draft != null ? draft.get("userId") : null;
        Object finalUser = finalValue != null ? finalValue.get("userId") : null;
        if (draftUser != null && finalUser != null) {
            return String.valueOf(draftUser).equals(String.valueOf(finalUser))
                ? AiGenerationSignal.ACCEPTED : AiGenerationSignal.REJECTED;
        }
        // Cas texte (SPEC) : EDITED si le texte a changé, sinon ACCEPTED.
        Integer d = editDistance(draft, finalValue);
        if (d == null) return AiGenerationSignal.ACCEPTED;
        return d == 0 ? AiGenerationSignal.ACCEPTED : AiGenerationSignal.EDITED;
    }

    /**
     * Levenshtein borne entre le texte du draft et du final. {@code null} si l'un n'a pas de texte
     * comparable (ex. SMART_ASSIGN, dont le "final" est un id d'assigne, pas du texte). Compare le
     * champ texte principal : "spec" (SPEC) sinon "text".
     */
    Integer editDistance(Map<String, Object> draft, Map<String, Object> finalValue) {
        String a = text(draft);
        String b = text(finalValue);
        if (a == null || b == null) return null;
        return levenshtein(cap(a), cap(b));
    }

    private static String text(Map<String, Object> m) {
        if (m == null) return null;
        Object v = m.containsKey("spec") ? m.get("spec") : m.get("text");
        return v instanceof String s ? s : null;
    }

    private static String cap(String s) {
        return s.length() > MAX_DISTANCE_LEN ? s.substring(0, MAX_DISTANCE_LEN) : s;
    }

    /** Distance de Levenshtein (DP deux lignes : O(n*m) temps, O(min(n,m)) espace). */
    static int levenshtein(String a, String b) {
        if (a.equals(b)) return 0;
        if (a.isEmpty()) return b.length();
        if (b.isEmpty()) return a.length();
        int[] prev = new int[b.length() + 1];
        int[] curr = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            curr[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev; prev = curr; curr = tmp;
        }
        return prev[b.length()];
    }
}
