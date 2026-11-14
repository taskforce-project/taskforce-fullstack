package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * Une version publiée d'un processus (ADR-027, point 7) : son modèle, l'empreinte calculée sur ce modèle, son auteur et
 * sa date. Une version ne se modifie jamais, et ne s'efface pas seule (la base le refuse, V132) : on en publie une
 * nouvelle, numérotée à la suite dans sa définition. Une instance tournera sur sa version (W3).
 */
@Entity
@Table(name = "process_versions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProcessVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "definition_id", nullable = false)
    private ProcessDefinition definition;

    @Column(name = "version", nullable = false)
    private int version;

    /** Le nom du processus dans cette version, pour les listes. */
    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** Le modèle du processus, tel que {@code core/process/ProcessJson} l'écrit. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "model", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> model;

    /** {@code sha256:} et le SHA-256 du JSON canonique du modèle ({@code core/process/ProcessFingerprint}). */
    @Column(name = "digest", nullable = false, length = 71)
    private String digest;

    /** Qui a publié cette version ; nul si son compte a été supprimé depuis. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
