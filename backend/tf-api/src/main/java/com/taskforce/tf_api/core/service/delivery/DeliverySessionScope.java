package com.taskforce.tf_api.core.service.delivery;

import java.util.List;
import java.util.Set;

/**
 * Périmètre d'une session déléguée (ADR-013) : ce qu'un agent peut atteindre le temps d'un run.
 *
 * <p>Deux bornes s'empilent. Le <b>plafond</b>, ce sont les droits du délégant : chaque appel est évalué
 * par les services comme s'il venait de lui, donc un projet privé qu'il ne voit pas reste invisible. La
 * session <b>resserre</b> ensuite ce plafond, ici :</p>
 * <ul>
 *   <li>un seul workspace, celui du run ;</li>
 *   <li>en <b>lecture</b>, une liste fermée de sous-arbres utiles au travail (projets, Brain OS, mes
 *       issues, analytics) ;</li>
 *   <li>en <b>écriture</b>, les issues du projet du run et rien d'autre ;</li>
 *   <li><b>jamais de suppression</b> : la décision destructive reste humaine (spec D6).</li>
 * </ul>
 *
 * <p>Liste <b>d'autorisation</b>, pas d'interdiction : tout chemin absent est refusé, y compris les futurs
 * endpoints. Un agent lit du texte écrit par d'autres (issues, notes) : une instruction glissée dans ce
 * texte ne doit pas pouvoir toucher un autre projet, les membres, la facturation ou les intégrations.</p>
 */
public final class DeliverySessionScope {

    /** Sous-arbres du workspace ouverts en lecture. */
    private static final List<String> READ_PREFIXES = List.of("projects", "brain", "my-issues", "analytics");

    /** Lectures portées par un POST (recherche sémantique : le corps est une requête, rien n'est écrit). */
    private static final Set<String> READ_ONLY_POSTS = Set.of("brain/search");

    private static final Set<String> READ_METHODS = Set.of("GET", "HEAD");
    private static final Set<String> WRITE_METHODS = Set.of("POST", "PATCH", "PUT");

    private DeliverySessionScope() {}

    /**
     * @param method        méthode HTTP
     * @param path          chemin brut de la requête ({@code getRequestURI})
     * @param workspaceSlug workspace de la session
     * @param projectId     projet de la session
     */
    public static boolean allows(String method, String path, String workspaceSlug, Long projectId) {
        if (method == null || path == null || workspaceSlug == null || workspaceSlug.isBlank() || projectId == null) {
            return false;
        }
        // Défense en profondeur (le pare-feu HTTP de Spring refuse déjà ces formes) : un slug et des ids
        // numériques n'ont jamais besoin d'encodage, donc tout chemin « exotique » est refusé d'office.
        if (path.contains("..") || path.contains("//") || path.contains(";")
            || path.contains("%") || path.contains("\\")) {
            return false;
        }
        String base = "/api/workspaces/" + workspaceSlug + "/";
        if (!path.startsWith(base)) {
            return false;
        }
        String rest = path.substring(base.length());
        String verb = method.toUpperCase();

        if (READ_METHODS.contains(verb)) {
            return READ_PREFIXES.stream().anyMatch(prefix -> isUnder(rest, prefix));
        }
        if ("POST".equals(verb) && READ_ONLY_POSTS.contains(rest)) {
            return true;
        }
        if (WRITE_METHODS.contains(verb)) {
            return isUnder(rest, "projects/" + projectId + "/issues");
        }
        return false; // DELETE, OPTIONS, TRACE... : jamais
    }

    /** {@code rest} est le préfixe lui-même ou l'un de ses descendants (segment entier, pas un préfixe de nom). */
    private static boolean isUnder(String rest, String prefix) {
        return rest.equals(prefix) || rest.startsWith(prefix + "/");
    }
}
