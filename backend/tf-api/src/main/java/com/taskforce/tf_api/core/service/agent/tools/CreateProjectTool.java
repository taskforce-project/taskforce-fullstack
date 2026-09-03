package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.request.CreateProjectRequest;
import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;
import com.taskforce.tf_api.core.service.agent.AgentTool;

import lombok.RequiredArgsConstructor;

/**
 * Outil interne d'écriture (TF-MCP-03 / fondation TF-MCP-04) : crée un projet <b>natif</b> TaskForce.
 * C'est la cible d'accueil quand on veut <b>importer un projet externe</b> (ex. « importe mon projet
 * Linear ici ») : Cortex crée le projet, puis y ajoute les issues via {@code create_issue}.
 */
@Component
@RequiredArgsConstructor
public class CreateProjectTool implements AgentTool {

    private final ProjectService projectService;

    @Override public String name() { return "create_project"; }

    @Override public String description() {
        return "Crée un projet TaskForce. Requiert name. identifier (préfixe d'issue, 2-10 car., ex. WEB) "
            + "est dérivé du nom si absent. Optionnel : description. Utile notamment pour accueillir un "
            + "projet importé d'un outil externe.";
    }

    @Override public Map<String, Object> parametersSchema() {
        return Map.of(
            "type", "object",
            "properties", Map.of(
                "name",        Map.of("type", "string", "description", "Nom du projet"),
                "identifier",  Map.of("type", "string", "description", "Préfixe d'issue 2-10 car. (optionnel, dérivé du nom sinon)"),
                "description", Map.of("type", "string", "description", "Description (optionnel)")
            ),
            "required", List.of("name")
        );
    }

    @Override public String execute(Map<String, Object> args, AgentContext ctx) {
        String name = args.get("name") != null ? String.valueOf(args.get("name")).trim() : "";
        if (name.isEmpty()) return "name manquant : impossible de créer un projet sans nom.";

        CreateProjectRequest req = new CreateProjectRequest();
        req.setName(name);
        String id = args.get("identifier") != null ? String.valueOf(args.get("identifier")).trim() : "";
        req.setIdentifier(id.isEmpty() ? deriveIdentifier(name) : id.toUpperCase());
        if (args.get("description") != null) req.setDescription(String.valueOf(args.get("description")));

        ProjectResponse project = projectService.createProject(ctx.slug(), ctx.userId(), req);
        return "Projet créé dans TaskForce : " + project.getIdentifier() + " « " + project.getName()
            + " » (id " + project.getId() + ").";
    }

    /** Préfixe d'issue depuis le nom : alphanumérique en majuscules, 2-10 car. ; « PRJ » en dernier recours. */
    private static String deriveIdentifier(String name) {
        String base = name.toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (base.length() < 2) return "PRJ";
        return base.substring(0, Math.min(10, base.length()));
    }
}
