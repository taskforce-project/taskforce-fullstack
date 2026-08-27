package com.taskforce.tf_api.core.dto.response;

import java.util.List;

/** Une issue avec son détail complet pour l'export : commentaires + historique d'activité. */
public record IssueExport(
    IssueResponse issue,
    List<IssueCommentResponse> comments,
    List<IssueActivityResponse> activity
) {}
