package com.taskforce.tf_api.core.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.AiGenerationKind;
import com.taskforce.tf_api.core.enums.AiGenerationSignal;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Une generation IA capturee a un point human-in-the-loop (data flywheel).
 *
 * <p>Enregistre le quintuplet {requete, contexte Brain OS servi, draft propose, final retenu,
 * signal de preference} pour un {@link AiGenerationKind}. Corpus <b>par workspace</b>, jamais
 * cross-tenant. Ecrit <b>best-effort</b> par {@code AiGenerationService.record} : ne casse jamais
 * le flux metier appelant. Voir {@code taskforce-docs/v1/road_to_v2/Data_Flywheel_et_Apprentissage.md}.
 *
 * <p>{@code final} et {@code kind} sont volontairement extensibles (JSONB / VARCHAR) pour accueillir,
 * en V2, l'outcome d'execution d'un agent (PR acceptee/reecrite, temps gagne) sans migration.
 */
@Entity
@Table(name = "ai_generations", indexes = {
    @Index(name = "idx_ai_generations_ws_kind_created", columnList = "workspace_id, kind, created_at")
})
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiGeneration extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private AiGenerationKind kind;

    /** Objet vise (cle d'issue, id de priorite...) - sert a retrouver et finaliser la ligne ouverte. */
    @Column(name = "request_ref", length = 128)
    private String requestRef;

    /** Ids des nodes Brain OS servis par le RAG (contexte retrieved). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "context_refs", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<Long> contextRefs = new ArrayList<>();

    /** Ce que l'IA a propose. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> draft = new HashMap<>();

    /** Ce que l'humain a retenu (null tant que la decision n'est pas prise). Colonne SQL {@code final}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "final", columnDefinition = "jsonb")
    private Map<String, Object> finalValue;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private AiGenerationSignal signal;

    /** Levenshtein(draft, final) pour les kinds texte (SPEC) ; null sinon. */
    @Column(name = "edit_distance")
    private Integer editDistance;

    @Column(length = 64)
    private String model;

    @Column(name = "latency_ms")
    private Integer latencyMs;
}
