package com.taskforce.tf_api.core.service.agent;

import java.util.List;

import com.taskforce.tf_api.core.service.ai.AttachedFile;
import com.taskforce.tf_api.core.service.ai.TurnHistory;

/**
 * Ce qu'un tour de Cortex reçoit du compositeur (R123, R134, R135).
 *
 * @param message      la demande
 * @param memory       l'historique que le budget de la requête laissera partir (TF-J1-13)
 * @param screen       ce que la personne voit : il renseigne Cortex, il ne décide plus du projet
 * @param attached     ce qu'elle a joint : des issues et des projets
 * @param files        ce qu'elle a joint : des fichiers texte
 * @param conversation la conversation du tour ; null hors d'une conversation
 * @param project      le projet de la conversation, null sans projet
 * @param lastCard     la dernière carte préparée de cette conversation, quand la demande dit que son projet n'est pas le
 *                     bon ; null sinon
 */
public record TurnInput(String message, TurnHistory memory, Screen screen, List<Screen> attached, List<AttachedFile> files,
                        Long conversation, Long project, LastCard lastCard) {

    public TurnInput {
        attached = attached == null ? List.of() : attached;
        files = files == null ? List.of() : files;
    }

    /** Une carte préparée dans la conversation : son outil et les arguments qu'elle montrait. */
    public record LastCard(String tool, String input) {}
}
