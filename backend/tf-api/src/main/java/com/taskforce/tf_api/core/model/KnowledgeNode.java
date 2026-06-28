package com.taskforce.tf_api.core.model;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.taskforce.tf_api.core.enums.NodeDomain;
import com.taskforce.tf_api.core.enums.NodeRefType;
import com.taskforce.tf_api.core.enums.NodeStatus;
import com.taskforce.tf_api.core.enums.NodeType;
import com.taskforce.tf_api.shared.audit.AuditableEntity;

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
 * Node de connaissance dans le Brain OS d'un workspace.
 *
 * <p>Peut être autonome (ADR, SOP, runbook, finding…) ou pointer vers une entité
 * TaskForce via {@code refType}/{@code refId} (ex. une issue qui porte son contexte de décision).
 * Le contenu markdown vit dans {@code content} ; au-delà de ~20 KB il est déporté sur MinIO
 * et {@code contentUrl} prend le relais (géré en Phase 1).
 */
@Entity
@Table(name = "knowledge_nodes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class KnowledgeNode extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Identifiant externe stable (liens inter-nodes, export Obsidian). */
    @Column(name = "uuid", nullable = false, unique = true, columnDefinition = "uuid")
    @Builder.Default
    private UUID uuid = UUID.randomUUID();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "brain_id")
    private BrainWorkspace brain;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 40)
    private NodeType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "domain", nullable = false, length = 40)
    private NodeDomain domain;

    @Column(name = "title", nullable = false, length = 300)
    private String title;

    @Column(name = "content", columnDefinition = "text")
    private String content;

    @Column(name = "content_url", length = 1000)
    private String contentUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private NodeStatus status = NodeStatus.ACTIVE;

    @Column(name = "version_label", nullable = false, length = 20)
    @Builder.Default
    private String versionLabel = "v1";

    /** Lien optionnel vers une entité TaskForce. */
    @Enumerated(EnumType.STRING)
    @Column(name = "ref_type", length = 20)
    private NodeRefType refType;

    @Column(name = "ref_id")
    private Long refId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = new HashMap<>();
}
