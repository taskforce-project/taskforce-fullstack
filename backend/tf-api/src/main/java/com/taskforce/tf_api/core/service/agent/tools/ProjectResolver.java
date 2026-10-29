package com.taskforce.tf_api.core.service.agent.tools;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.taskforce.tf_api.core.dto.response.ProjectResponse;
import com.taskforce.tf_api.core.service.ProjectService;
import com.taskforce.tf_api.core.service.agent.AgentContext;

import lombok.RequiredArgsConstructor;

/**
 * Le projet d'une demande à Cortex, par sa clé ou par son nom, résolu par le code parmi ceux que la personne voit. Le
 * modèle ne passe jamais d'identifiant : un numéro deviné avait créé une issue dans un autre projet (R48, séance n°8).
 * Inconnu ou ambigu, le résultat porte les choix possibles, que Cortex propose à la personne au lieu d'en prendre un.
 */
@Component
@RequiredArgsConstructor
public class ProjectResolver {

    /** Au-delà, la liste des choix rendue au modèle est coupée : elle doit rester lisible. */
    private static final int MAX_CHOICES = 20;

    private final ProjectService projectService;

    /** Le projet trouvé, ou ce qu'il faut dire au modèle quand il n'y en a pas exactement un. */
    public record Resolution(ProjectResponse project, String problem) {
        public boolean found() {
            return project != null;
        }
    }

    /** Les projets que la personne voit dans l'espace. */
    public List<ProjectResponse> visible(AgentContext ctx) {
        return projectService.listProjects(ctx.slug(), ctx.userId());
    }

    /** Par la clé exacte, puis le nom exact, puis une partie du nom si elle désigne un seul projet. */
    public Resolution resolve(Object requested, AgentContext ctx) {
        List<ProjectResponse> projects = visible(ctx);
        if (projects.isEmpty()) {
            return new Resolution(null, "There is no project in this workspace yet: one must be created first.");
        }
        String query = requested == null ? "" : requested.toString().trim();
        if (query.isEmpty()) {
            return new Resolution(null, "The project is missing. " + choices(projects));
        }
        List<ProjectResponse> byKey = projects.stream().filter(p -> query.equalsIgnoreCase(p.getIdentifier())).toList();
        if (byKey.size() == 1) return new Resolution(byKey.get(0), null);
        List<ProjectResponse> byName = projects.stream().filter(p -> query.equalsIgnoreCase(p.getName())).toList();
        if (byName.size() == 1) return new Resolution(byName.get(0), null);
        String part = query.toLowerCase(Locale.ROOT);
        List<ProjectResponse> byPart = projects.stream()
            .filter(p -> p.getName() != null && p.getName().toLowerCase(Locale.ROOT).contains(part))
            .toList();
        if (byName.isEmpty() && byPart.size() == 1) return new Resolution(byPart.get(0), null);
        List<ProjectResponse> several = byName.size() > 1 ? byName : byPart;
        if (several.size() > 1) {
            return new Resolution(null, "Several projects match \"" + query + "\": " + names(several)
                + ". Ask the person which one; do not pick one yourself.");
        }
        return new Resolution(null, "No project matches \"" + query + "\". " + choices(projects));
    }

    private static String choices(List<ProjectResponse> projects) {
        return "The projects are: " + names(projects) + ". Use the key or the name of one of them; if the request does "
            + "not say which, ask the person.";
    }

    private static String names(List<ProjectResponse> projects) {
        String listed = projects.stream().limit(MAX_CHOICES)
            .map(p -> p.getIdentifier() + " (" + p.getName() + ")")
            .collect(Collectors.joining(", "));
        return projects.size() > MAX_CHOICES ? listed + " and " + (projects.size() - MAX_CHOICES) + " more" : listed;
    }
}
