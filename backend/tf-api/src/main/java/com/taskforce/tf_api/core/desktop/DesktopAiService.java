package com.taskforce.tf_api.core.desktop;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.taskforce.tf_api.core.dto.response.DesktopAiStateResponse;
import com.taskforce.tf_api.core.service.AiStatusService;
import com.taskforce.tf_api.core.service.AiStatusService.AiStatus;
import com.taskforce.tf_api.core.service.ai.AiProviderConfig;
import com.taskforce.tf_api.core.service.ai.AiProviderSettings;
import com.taskforce.tf_api.core.service.ai.ModelGateway;
import com.taskforce.tf_api.shared.exception.BusinessException;
import com.taskforce.tf_api.shared.exception.ForbiddenException;

/**
 * Le fournisseur d'IA de l'app desktop, réglé par la coque (desktop/src/ai.ts). Au lancement, la coque le passe par les
 * variables d'un serveur ({@code AI_PROVIDER}, {@code AI_API_KEY}...) ; quand la personne en change dans ses réglages,
 * elle l'envoie ici, et la passerelle de modèles s'en sert dès l'appel suivant, sans redémarrer le backend : un
 * redémarrage couperait l'interface, le temps réel et une mission du runner en cours, pour un changement qui se résume
 * à remplacer des réglages en mémoire.
 *
 * <p>Seule la coque peut le faire : il faut le secret qu'elle tire à chaque lancement ({@code desktop.shell-secret}),
 * en plus du jeton de lancement, que la fenêtre connaît aussi : un script de la page ne peut pas envoyer les
 * conversations de la personne vers un autre serveur. La clé d'API reste en mémoire : ni en base, ni dans un fichier,
 * ni dans un journal.</p>
 */
@Service
@Profile("desktop")
public class DesktopAiService {

    private final AiProviderConfig config;
    private final AiStatusService status;
    private final byte[] shellSecret;

    public DesktopAiService(AiProviderConfig config, AiStatusService status,
                            @Value("${desktop.shell-secret:}") String shellSecret) {
        this.config = config;
        this.status = status;
        this.shellSecret = shellSecret == null ? new byte[0] : shellSecret.getBytes(StandardCharsets.UTF_8);
    }

    /** L'état de l'IA pour l'écran de réglages ; {@code fresh} relit le fournisseur sans attendre le cache. */
    public DesktopAiStateResponse state(String shell, boolean fresh) {
        requireShell(shell);
        if (fresh) {
            status.invalidate();
        }
        return view(status.snapshot());
    }

    /** Remplace le fournisseur et les modèles ; l'état rendu est relu chez le nouveau fournisseur. */
    public DesktopAiStateResponse apply(String shell, Map<String, String> variables) {
        requireShell(shell);
        for (String name : variables.keySet()) {
            if (!AiProviderSettings.VARIABLES.contains(name)) {
                throw new BusinessException("Unknown AI setting: " + name);
            }
        }
        config.replace(variables);
        status.invalidate();
        return view(status.snapshot());
    }

    /** Comparaison en temps constant ; sans secret posé, personne n'y a droit. */
    private void requireShell(String given) {
        boolean valid = shellSecret.length > 0 && given != null
            && MessageDigest.isEqual(shellSecret, given.getBytes(StandardCharsets.UTF_8));
        if (!valid) {
            throw new ForbiddenException("Only the TaskForce app can change its AI provider");
        }
    }

    private static DesktopAiStateResponse view(AiStatusService.Snapshot snapshot) {
        AiStatus s = snapshot.status();
        return new DesktopAiStateResponse(s.configured(), snapshot.reachable(), snapshot.models(), snapshot.embedModels(),
            new DesktopAiStateResponse.Chat(s.chatModel(), s.fastModel(), s.chatAvailable()),
            new DesktopAiStateResponse.Embeddings(s.embeddingModel(), ModelGateway.EMBEDDING_DIM, s.embeddingsAvailable()));
    }
}
