package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** DTO de réponse pour un node de connaissance du Brain OS. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeNodeResponse {

    private Long id;
    private String uuid;
    private String type;
    private String domain;
    private String domainCode;
    private String title;
    private String content;
    private String contentUrl;
    private String status;
    private String versionLabel;
    private String refType;
    private Long refId;
    private Long parentNodeId;
    private List<String> tags;
    /** Node du noyau (kernel : hub règles/AGENTS) — masqué de l'explorateur utilisateur par défaut. */
    private boolean system;
    private Map<String, Object> metadata;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String createdBy;
}
