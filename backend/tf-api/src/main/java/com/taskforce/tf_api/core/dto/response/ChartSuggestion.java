package com.taskforce.tf_api.core.dto.response;

/**
 * Une reformulation proposée quand une demande de graphe n'est pas satisfiable telle quelle :
 * {@code label} = texte du bouton, {@code prompt} = la demande à relancer (répondable, elle).
 */
public record ChartSuggestion(String label, String prompt) {}
