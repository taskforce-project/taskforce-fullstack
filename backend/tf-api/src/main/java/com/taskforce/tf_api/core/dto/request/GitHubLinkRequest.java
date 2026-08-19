package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record GitHubLinkRequest(
    @NotBlank @Pattern(regexp = "PR|COMMIT", message = "linkType must be PR or COMMIT")
    String linkType,

    @NotBlank @Size(max = 255)
    String repoFullName,

    Integer prNumber,
    String prUrl,
    String commitSha,
    String commitUrl,

    @Size(max = 500)
    String title
) {}
