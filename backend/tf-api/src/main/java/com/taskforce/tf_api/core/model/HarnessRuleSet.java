package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.RuleScope;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Une version d'une couche des règles de l'entreprise (R157), au format des règles de {@code taskforce-rules/1} :
 * l'organisation, un projet, un processus, un rôle ou une personne. Une version ne se modifie jamais (la base le refuse,
 * V125) : on en écrit une nouvelle, numérotée à la suite dans l'espace, avec son auteur, sa date et son empreinte.
 */
@Entity
@Table(name = "harness_rule_sets")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HarnessRuleSet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "version", nullable = false)
    private int version;

    /** La couche que cette version écrit. */
    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, length = 16)
    @Builder.Default
    private RuleScope scope = RuleScope.WORKSPACE;

    /** Le projet d'une couche {@code PROJECT}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /** La clé du processus d'une couche {@code PROCESS}. */
    @Column(name = "process_key", length = 80)
    private String processKey;

    /** Le rôle de l'espace d'une couche {@code ROLE} : {@code OWNER}, {@code ADMIN} ou {@code MEMBER}. */
    @Column(name = "role", length = 16)
    private String role;

    /** La personne d'une couche {@code PERSON}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User person;

    /**
     * Les règles de la couche, chacune avec son propriétaire, sa raison, sa date de revue, la phrase de la personne qui
     * l'a écrite et ses cas (R98) ; les cas restent ici, le paquet remis aux agents ne les porte pas.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rules", nullable = false, columnDefinition = "jsonb")
    private List<Map<String, Object>> rules;

    /** L'empreinte de ces règles : {@code sha256:} et le SHA-256 de leur JSON canonique. */
    @Column(name = "digest", length = 71)
    private String digest;

    /** Qui a écrit cette version ; nul si son compte a été supprimé depuis. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
