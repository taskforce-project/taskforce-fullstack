package com.taskforce.tf_api.core.service.delivery;

import java.util.Objects;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.taskforce.tf_api.core.enums.WorkspaceRole;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSeal;
import com.taskforce.tf_api.core.harness.evidence.EvidenceSigner;
import com.taskforce.tf_api.core.model.MissionDossier;
import com.taskforce.tf_api.core.model.Project;
import com.taskforce.tf_api.core.model.User;
import com.taskforce.tf_api.core.model.Workspace;
import com.taskforce.tf_api.core.repository.ProjectRepository;
import com.taskforce.tf_api.core.repository.UserRepository;
import com.taskforce.tf_api.core.repository.WorkspaceMemberRepository;
import com.taskforce.tf_api.core.repository.WorkspaceRepository;
import com.taskforce.tf_api.core.service.ProjectVisibilityGuard;
import com.taskforce.tf_api.shared.exception.ForbiddenException;
import com.taskforce.tf_api.shared.exception.ResourceNotFoundException;

import lombok.RequiredArgsConstructor;

/**
 * Qui lit le dossier d'une mission, et qui en efface un texte (TF-J2-7). Le dossier survit à son issue et à son projet :
 * tant que le projet existe, le lit qui voit le projet, comme avant ; quand il n'existe plus, la personne qui a délégué
 * la mission et les responsables de l'espace (propriétaire, administrateurs). Un texte gardé à côté de la chaîne s'efface
 * par ces mêmes personnes : la personne qui a délégué, ou un responsable de l'espace. Un dossier d'un autre espace
 * répond comme un dossier inexistant.
 */
@Service
@RequiredArgsConstructor
public class MissionDossierAccess {

    static final String NOT_FOUND = "This run has no evidence file";

    private final MissionEvidenceService evidence;
    private final ProjectRepository projects;
    private final ProjectVisibilityGuard visibilityGuard;
    private final WorkspaceMemberRepository members;
    private final UserRepository users;
    private final WorkspaceRepository workspaces;
    private final EvidenceSigner signer;

    /** Le dossier en JSON ({@code taskforce-evidence/1}), en Markdown, ou son dernier sceau seul (l'enveloppe DSSE). */
    public enum Format { JSON, MARKDOWN, DSSE }

    @Transactional(readOnly = true)
    public Optional<String> export(String slug, Long runId, Long userId, Format format) {
        readable(slug, runId, userId);
        return switch (format) {
            case JSON -> evidence.dossierJson(runId);
            case MARKDOWN -> evidence.dossierMarkdown(runId);
            case DSSE -> evidence.envelope(runId);
        };
    }

    /** Efface un texte du dossier ; sa chaîne et son sceau tiennent, et l'effacement s'y ajoute. */
    @Transactional
    public void eraseText(String slug, Long runId, String hash, Long userId) {
        MissionDossier dossier = readable(slug, runId, userId);
        if (!delegator(dossier, userId) && !manager(dossier, userId)) {
            throw new ForbiddenException("Only the person who delegated this mission, or an owner or admin of the workspace, can erase its texts.");
        }
        User person = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        evidence.eraseText(runId, hash, person);
    }

    /**
     * La clé qui scelle les dossiers de ce serveur : son identifiant, sa clé publique, sa garde. Elle n'a rien de secret
     * (chaque sceau la porte), mais la route vit sous l'espace : un membre de l'espace la lit.
     */
    @Transactional(readOnly = true)
    public EvidenceSeal.Key key(String slug, Long userId) {
        Workspace workspace = workspaces.findBySlug(slug).orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
        if (members.findByWorkspaceIdAndUserId(workspace.getId(), userId).isEmpty()) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        return signer.key();
    }

    /**
     * Le dossier, si cette personne peut le lire. Elle doit être membre de son espace, vérifié ici et pas seulement par
     * l'intercepteur des routes (R159, L8) : la personne qui a délégué et qui a quitté l'espace ne le lit plus.
     */
    MissionDossier readable(String slug, Long runId, Long userId) {
        MissionDossier dossier = evidence.dossier(runId).orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        if (dossier.getWorkspace() == null || !slug.equals(dossier.getWorkspace().getSlug())) {
            throw new ResourceNotFoundException(NOT_FOUND);
        }
        if (members.findByWorkspaceIdAndUserId(dossier.getWorkspace().getId(), userId).isEmpty()) {
            throw new ForbiddenException("Access denied: you're not a member of this workspace");
        }
        Project project = dossier.getProjectId() == null ? null : projects.findById(dossier.getProjectId()).orElse(null);
        if (project != null) {
            visibilityGuard.assertCanView(project, userId);
            return dossier;
        }
        if (!delegator(dossier, userId) && !manager(dossier, userId)) {
            throw new ForbiddenException("This mission's project no longer exists: only the person who delegated it, "
                + "or an owner or admin of the workspace, can read its evidence.");
        }
        return dossier;
    }

    private static boolean delegator(MissionDossier dossier, Long userId) {
        return dossier.getDelegatedBy() != null && Objects.equals(dossier.getDelegatedBy().getId(), userId);
    }

    private boolean manager(MissionDossier dossier, Long userId) {
        return members.findByWorkspaceIdAndUserId(dossier.getWorkspace().getId(), userId)
            .map(m -> m.getRole() == WorkspaceRole.OWNER || m.getRole() == WorkspaceRole.ADMIN)
            .orElse(false);
    }
}
