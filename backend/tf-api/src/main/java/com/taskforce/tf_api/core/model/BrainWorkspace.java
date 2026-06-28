package com.taskforce.tf_api.core.model;

import com.taskforce.tf_api.core.enums.BrainTemplateType;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Brain OS d'un workspace : la mémoire de connaissance de l'entreprise/produit.
 * 1 workspace = 1 brain (contrainte d'unicité sur workspace_id).
 */
@Entity
@Table(name = "brain_workspaces")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BrainWorkspace extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false, unique = true)
    private Workspace workspace;

    @Enumerated(EnumType.STRING)
    @Column(name = "template_type", nullable = false, length = 40)
    @Builder.Default
    private BrainTemplateType templateType = BrainTemplateType.BLANK;

    @Column(name = "version_label", nullable = false, length = 20)
    @Builder.Default
    private String versionLabel = "v1";
}
