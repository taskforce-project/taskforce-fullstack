package com.taskforce.tf_api.core.dto.response;

import java.time.LocalDateTime;

public record GitHubLinkResponse(
    Long id,
    String linkType,      // PR | COMMIT
    String repoFullName,
    Integer prNumber,
    String prUrl,
    String commitSha,
    String commitUrl,
    String title,
    String status,        // OPEN | MERGED | CLOSED
    LocalDateTime linkedAt
) {}
