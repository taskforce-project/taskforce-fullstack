package com.taskforce.tf_api.core.dto.response;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SmartAssignCandidateResponse {

    private Long userId;
    private String email;
    private String displayName;
    private String avatarUrl;

    private Integer score;
    private Integer semanticScore;
    private Integer historicalScore;
    private Integer workloadScore;
    private Integer availability;
    private Integer openIssues;
    private Integer labelMatchCount;

    private List<String> factors;

    /** Explication en langage naturel (Groq), ou synthèse Java en repli. */
    private String reason;
    /** Compétences du membre qui recoupent les labels de l'issue (le « pourquoi » concret). */
    private List<String> matchedSkills;
}
