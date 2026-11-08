package com.taskforce.tf_api.core.service;

import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.service.ai.AiProviderConfig;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelChoice;
import com.taskforce.tf_api.core.service.ai.ModelGateway;

import lombok.extern.slf4j.Slf4j;

/**
 * État de l'IA de l'instance : le fournisseur répond-il, quels modèles servent, gardé en cache 30 s. La passerelle de
 * modèles ({@link ModelGateway}) lit la liste des modèles du fournisseur ; les modèles que les réglages ne nomment pas
 * y sont choisis ({@link ModelChoice}).
 *
 * <p>Sert à échouer tout de suite quand l'IA n'est pas disponible (IA coupée, fournisseur injoignable, modèle absent)
 * au lieu d'attendre le délai d'expiration à chaque appel, et à afficher l'état « IA non configurée » dans l'interface
 * ({@code GET /api/ai/status}). Un changement de fournisseur dans l'app desktop rend le cache caduc.</p>
 */
@Service
@Slf4j
public class AiStatusService {

    /**
     * État de l'IA. Les noms de modèles sont {@code null} quand on ne sait pas lesquels serviraient.
     * {@code contextWindow} et {@code fastContextWindow} : la plus grande fenêtre de contexte, en jetons, que la
     * passerelle donne à chacun des deux modèles sur Ollama, qui la taille à chaque requête ; {@code null} ailleurs, où
     * le fournisseur la tient.
     */
    public record AiStatus(boolean configured, boolean chatAvailable, String chatModel, String fastModel,
                           boolean embeddingsAvailable, String embeddingModel, Integer contextWindow,
                           Integer fastContextWindow) {
        public static final AiStatus UNREACHABLE = new AiStatus(false, false, null, null, false, null);

        /** Sans fenêtre connue : l'IA coupée ou injoignable, ou un autre fournisseur qu'Ollama. */
        public AiStatus(boolean configured, boolean chatAvailable, String chatModel, String fastModel,
                        boolean embeddingsAvailable, String embeddingModel) {
            this(configured, chatAvailable, chatModel, fastModel, embeddingsAvailable, embeddingModel, null, null);
        }
    }

    /**
     * Ce que la passerelle voit chez les fournisseurs, avec les réglages qui l'ont produit : les appels s'y tiennent,
     * pour qu'un modèle choisi pour un fournisseur ne parte pas chez un autre. Jamais rendu tel quel par une API : les
     * réglages portent les clés.
     *
     * @param reachable   la conversation répond
     * @param models      les modèles qu'elle annonce
     * @param embedModels les modèles qu'annonce le fournisseur des vecteurs
     */
    public record Snapshot(AiProviderSettings settings, AiStatus status, boolean reachable, List<String> models,
                           List<String> embedModels) {
    }

    private static final long TTL_MS = 30_000;

    private final ModelGateway gateway;
    private final AiProviderConfig config;

    private record Cached(Snapshot snapshot, long at, long version) {
    }

    private volatile Cached cached;

    public AiStatusService(ModelGateway gateway, AiProviderConfig config) {
        this.gateway = gateway;
        this.config = config;
    }

    /** État courant, relu au plus toutes les 30 s, et tout de suite après un changement de réglages. */
    public AiStatus current() {
        return snapshot().status();
    }

    /** L'état et les réglages qui l'ont produit. */
    public Snapshot snapshot() {
        Cached entry = cached;
        if (fresh(entry)) {
            return entry.snapshot();
        }
        synchronized (this) {
            entry = cached;
            if (!fresh(entry)) {
                long version = config.version();
                entry = new Cached(compute(config.current()), System.currentTimeMillis(), version);
                cached = entry;
            }
            return entry.snapshot();
        }
    }

    /**
     * Ce que la fiche d'un modèle dit de lui chez le fournisseur de maintenant (Ollama seulement), pour la table des
     * capacités tant qu'il n'est pas mesuré (R125) ; vide ailleurs.
     */
    public Optional<ModelGateway.ModelCard> describe(String model) {
        return gateway.describe(snapshot().settings(), model);
    }

    /** Oublie l'état en cache : le prochain appel relit le fournisseur (après un échec d'appel au modèle). */
    public void invalidate() {
        cached = null;
    }

    private boolean fresh(Cached entry) {
        return entry != null && entry.version() == config.version() && System.currentTimeMillis() - entry.at() < TTL_MS;
    }

    private Snapshot compute(AiProviderSettings settings) {
        if (!settings.enabled()) {
            return new Snapshot(settings, new AiStatus(false, false, null, null, false, null), false, List.of(), List.of());
        }
        Optional<List<String>> chat = gateway.chatModels(settings);
        Optional<List<String>> embed = settings.sameEmbedEndpoint() ? chat : gateway.embedModels(settings);
        ModelChoice.Models models = ModelChoice.resolve(settings, chat.orElse(null), embed.orElse(null));
        // Un modèle choisi mais absent de la liste ne répondrait pas : on le dit au lieu d'échouer à chaque appel.
        boolean chatAvailable = chat.isPresent()
            && ModelChoice.listed(chat.get(), models.chat()) && ModelChoice.listed(chat.get(), models.fast());
        boolean embedAvailable = embed.isPresent() && ModelChoice.listed(embed.get(), models.embed());
        if (chat.isEmpty()) {
            log.warn("AI provider unreachable ({})", settings.describe());
        }
        // La fenêtre que reçoit chaque modèle (Ollama seulement) : le maximum du modèle est lu une fois par la passerelle.
        Integer window = chatAvailable ? gateway.contextWindow(settings, models.chat()).orElse(null) : null;
        Integer fastWindow = !chatAvailable ? null
            : models.fast().equals(models.chat()) ? window : gateway.contextWindow(settings, models.fast()).orElse(null);
        AiStatus status = new AiStatus(true, chatAvailable, models.chat(), models.fast(), embedAvailable, models.embed(),
            window, fastWindow);
        return new Snapshot(settings, status, chat.isPresent(), chat.orElse(List.of()), embed.orElse(List.of()));
    }
}
