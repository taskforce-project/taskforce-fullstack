package com.taskforce.tf_api.core.dto.response;

/**
 * Une issue trouvée par ce qu'on a écrit dessous (Ctrl+K, R141, séance n°20) : de quoi la reconnaître et l'ouvrir dans le
 * volet, et les mots du commentaire autour de ce qu'on cherche.
 *
 * @param key     la clé de l'issue (« OPS-35 »)
 * @param excerpt le passage du commentaire qui répond, en texte brut
 */
public record IssueCommentHitResponse(Long issueId, Long projectId, String key, String title, String excerpt) {}
