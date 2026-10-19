package com.taskforce.tf_api.core.service.delivery;

import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.Workspace;

/**
 * Pour qui et où une délégation se ferait (OSS-5.7) : la personne qui délègue, son workspace, et le projet de
 * l'issue ({@code null} quand on liste les agents pour tout le workspace, depuis les réglages).
 */
public record DeliveryContext(Long userId, Workspace workspace, Project project) {}
