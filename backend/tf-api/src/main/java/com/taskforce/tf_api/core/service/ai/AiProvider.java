package com.taskforce.tf_api.core.service.ai;

/**
 * Les familles d'API que la passerelle de modèles sait joindre (R92, « aucun modèle imposé »). TaskForce ne gère pas
 * les modèles : l'instance, ou la personne dans l'app desktop, branche le sien.
 */
public enum AiProvider {

    /** Ollama, par son API compatible OpenAI ({@code /v1}) : seul fournisseur où le réglage natif du raisonnement est connu. */
    OLLAMA,

    /** Toute API compatible OpenAI : OpenAI, Groq, Mistral, OpenRouter, vLLM, LM Studio, le point d'accès d'une entreprise. */
    OPENAI,

    /** L'API Messages d'Anthropic. Elle n'a pas de vecteurs : la recherche sémantique passe par un autre fournisseur. */
    ANTHROPIC
}
