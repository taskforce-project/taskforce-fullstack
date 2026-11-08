package com.taskforce.tf_api.core.service.ai;

/**
 * La fenêtre de contexte d'un modèle, ce sur quoi TaskForce compte pour une requête (TF-J1-13) : sur Ollama, celle que la
 * passerelle lui donne ; chez un fournisseur hébergé, celle qu'il dit dans sa liste de modèles ; sinon la valeur prudente
 * des réglages ({@code AI_DEFAULT_CONTEXT}), montrée comme une estimation, jamais comme un fait.
 *
 * @param model      le modèle dont on parle, tel que la passerelle l'appelle
 * @param tokens     la taille de la fenêtre, en jetons
 * @param estimated  personne ne l'a dite : c'est la valeur des réglages
 * @param answerRoom la place gardée pour la réponse
 */
public record ModelWindow(String model, int tokens, boolean estimated, int answerRoom) {

    /** Pour un appelant qui ne connaît pas de modèle (un client de test) : rien ne se compacte ni ne se coupe. */
    public static final ModelWindow UNBOUNDED = new ModelWindow(null, Integer.MAX_VALUE / 2, true, 2_048);
}
