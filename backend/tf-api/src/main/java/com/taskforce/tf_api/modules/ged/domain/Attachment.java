package com.taskforce.tf_api.modules.ged.domain;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.taskforce.tf_api.core.model.Issue;
import com.taskforce.tf_api.core.model.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

@Entity
@Table(
    name = "attachments",
    indexes = {
        @Index(name = "idx_attachments_issue_id", columnList = "issue_id")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Attachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id", nullable = false)
    private Issue issue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by")
    private User uploadedBy;

    @Column(nullable = false, length = 255)
    private String originalName;

    /** Clé unique dans le bucket Minio (ex: "issues/42/uuid-filename.pdf") */
    @Column(nullable = false, length = 512, unique = true)
    private String storedKey;

    @Column(nullable = false, length = 128)
    private String contentType;

    @Column(nullable = false)
    private Long fileSize;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
