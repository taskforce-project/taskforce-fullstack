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

    private static final int EXCERPT_LENGTH = 150;

    /**
     * Extrait les 150 premiers caractères du contenu (HTML ou texte brut) : balises retirées, espaces regroupés. En une
     * passe et sans expression régulière : sur un contenu fait de « < » sans « > », le retrait des balises par
     * expression régulière prenait un temps quadratique (déni de service sur la liste des pages).
     */
    static String buildExcerpt(String content) {
        if (content == null || content.isBlank()) return "No content yet.";
        StringBuilder plain = new StringBuilder(EXCERPT_LENGTH + 1);
        boolean space = false;
        boolean tagsLeft = true;
        int i = 0;
        while (i < content.length() && plain.length() <= EXCERPT_LENGTH) {
            char c = content.charAt(i);
            if (c == '<' && tagsLeft) {
                int close = content.indexOf('>', i + 1);
                if (close >= 0) {
                    i = close + 1;
                    continue;
                }
                // Plus aucun « > » : les « < » qui restent sont du texte.
                tagsLeft = false;
            }
            if (c == ' ' || c == '\t' || c == '\n' || c == 0x0B || c == '\f' || c == '\r') {
                space = plain.length() > 0;
            } else {
                if (space) plain.append(' ');
                space = false;
                plain.append(c);
            }
            i++;
        }
        return plain.length() > EXCERPT_LENGTH ? plain.substring(0, EXCERPT_LENGTH) + "…" : plain.toString();
    }
}
