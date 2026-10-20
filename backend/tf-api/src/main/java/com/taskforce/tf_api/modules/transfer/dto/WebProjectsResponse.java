package com.taskforce.tf_api.modules.transfer.dto;

import java.util.List;

/**
 * Ce que l'app desktop montre avant de déplacer un projet : les espaces de la personne dans la webapp (où elle peut
 * envoyer un projet) et les projets qu'elle y voit (qu'elle peut apporter sur son ordinateur).
 */
public record WebProjectsResponse(List<WebWorkspace> workspaces) {

    /** Un espace de la webapp et ses projets visibles. */
    public record WebWorkspace(String slug, String name, List<WebProject> projects) {}

    /** Un projet de la webapp. */
    public record WebProject(Long id, String name, String identifier, int issueCount) {}
}
