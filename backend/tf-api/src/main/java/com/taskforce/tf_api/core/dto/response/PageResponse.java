package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

import com.taskforce.tf_api.core.model.Page;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class PageResponse {

    private Long          id;
    private String        title;
    private String        emoji;
    private String        excerpt;
    private String        content;
    private String        createdByName;
    private String        createdByInitials;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static PageResponse from(Page page) {
        String authorName     = page.getCreatedBy() != null
            ? page.getCreatedBy().getDisplayName()
            : "Unknown";
        String authorInitials = page.getCreatedBy() != null
            ? initials(page.getCreatedBy().getDisplayName())
            : "?";
        String excerpt = buildExcerpt(page.getContent());

        return PageResponse.builder()
            .id(page.getId())
            .title(page.getTitle())
            .emoji(page.getEmoji())
            .excerpt(excerpt)
            .content(page.getContent())
            .createdByName(authorName)
            .createdByInitials(authorInitials)
            .createdAt(page.getCreatedAt())
            .updatedAt(page.getUpdatedAt())
            .build();
    }

    private static String initials(String displayName) {
        if (displayName == null || displayName.isBlank()) return "?";
        String[] parts = displayName.trim().split("\\s+");
        if (parts.length == 1) return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        return (String.valueOf(parts[0].charAt(0)) + String.valueOf(parts[parts.length - 1].charAt(0))).toUpperCase();
    }

    /** Extrait les 150 premiers caractères du contenu (HTML ou texte brut). */
    private static String buildExcerpt(String content) {
        if (content == null || content.isBlank()) return "No content yet.";
        // Supprime les balises HTML de base pour l'aperçu
        String plain = content.replaceAll("<[^>]*>", "").replaceAll("\\s+", " ").trim();
        return plain.length() > 150 ? plain.substring(0, 150) + "…" : plain;
    }
}
