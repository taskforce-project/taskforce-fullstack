package com.taskforce.tf_api.modules.ged.dto.response;

/**
 * Le nombre de pièces jointes (les « documents ») d'une issue, tel que la vue du workflow le montre sur chacune (lot W1).
 *
 * @param issueId l'issue
 * @param count   son nombre de pièces jointes, un au moins : une issue sans pièce jointe n'a pas de ligne
 */
public record IssueAttachmentCount(Long issueId, long count) {}
