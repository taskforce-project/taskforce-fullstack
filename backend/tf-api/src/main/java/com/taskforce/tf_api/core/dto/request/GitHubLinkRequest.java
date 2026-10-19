package com.taskforce.tf_api.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record GitHubLinkRequest(
    @NotBlank @Pattern(regexp = "PR|COMMIT", message = "linkType must be PR or COMMIT")
    String linkType,

    @NotBlank @Size(max = 255)
    @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}", message = "repoFullName must be owner/name")
    String repoFullName,

    @Positive
    Integer prNumber,

    @Size(max = 512) @Pattern(regexp = "https://github\\.com/.+", message = "prUrl must be a github.com link")
    String prUrl,

    @Pattern(regexp = "[0-9a-fA-F]{7,40}", message = "commitSha must be a commit hash")
    String commitSha,

    @Size(max = 512) @Pattern(regexp = "https://github\\.com/.+", message = "commitUrl must be a github.com link")
    String commitUrl,

    @Size(max = 500)
    String title
) {}
