package com.taskforce.tf_api.core.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** L'interrupteur de la banque d'un espace (V108) : sans ligne, elle est ouverte, un cas ne naissant que d'un geste. */
@Entity
@Table(name = "eval_bank_settings")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EvalBankSetting {

    @Id
    @Column(name = "workspace_id")
    private Long workspaceId;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
